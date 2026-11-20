import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'
import { isComposingKey } from '../dom-helper.js'
import { filterFiles, mayAcceptType, type FileRejection, type FileRules } from '../file-accept.js'
import { defineMessages, LocalizeController } from '../localize.js'

export type { FileRejection, FileRejectionReason, FileRules } from '../file-accept.js'

const en = {
  added: (count: number) => (count === 1 ? '1 file added' : `${count} files added`),
  rejected: (count: number) => (count === 1 ? '1 file not added' : `${count} files not added`),
  itemsAdded: (count: number) => (count === 1 ? '1 item added' : `${count} items added`),
  itemsRejected: (count: number) => (count === 1 ? '1 item not added' : `${count} items not added`),
}

/**
 * What a drop zone announces after a drop or a paste, in English. An app translates it under `drop-zone`:
 * `addTranslations({ fr: { 'drop-zone': { added: { one: '{0} fichier ajouté', other: '{0} fichiers ajoutés' } } } })`.
 */
export const dropZoneMessages = defineMessages('drop-zone', en)

/** How the files reached the zone: dragged and dropped, or pasted from the clipboard. */
export type DropZoneSource = 'drop' | 'paste'

/** The files one drop or paste brought, split by the zone's rules. */
export interface DropZoneFiles {
  source: DropZoneSource
  /** Every file, in the order the browser gave them. */
  files: File[]
  /** The files the rules took: all of them when the zone has no rules. */
  accepted: File[]
  /** The files the rules turned away, each with its reason. */
  rejected: FileRejection[]
}

/**
 * Called with each drop or paste. Return the files the host actually took (or how many), when it checks them itself
 * after the zone's rules: the announcement then counts those. Return nothing to have the zone's own split announced.
 */
export type DropZoneFilesHandler = (files: DropZoneFiles) => readonly File[] | number | void

/** A point in viewport coordinates, as a pointer event's `clientX` and `clientY`. */
export interface DropPoint {
  x: number
  y: number
}

/** The items one drop of an item payload brought. */
export interface DropZoneItems<T = unknown> {
  /** The payload kind, as `itemKind` returned it. */
  kind: string
  /** The items the source wrote, in its order: a copy, never the source's own objects. */
  items: T[]
  /**
   * Where they were dropped. Absent for a move made without a pointer (a keyboard command calling `moveItemTo` on
   * the source): the host puts them at its natural place, the end.
   */
  point?: DropPoint
  /** The browser's drop event, for a drop the browser carried; absent for a pointer drag a source handed over. */
  event?: DragEvent
}

/**
 * Called with each drop of an accepted item payload. Return the items the host took (or how many): the announcement
 * counts those and reports the rest as not added. Return nothing when it took every item.
 */
export type DropZoneItemsHandler = (items: DropZoneItems) => readonly unknown[] | number | void

export interface DropZoneOptions {
  /** Receives the files of each drop or paste. Without it the zone takes no files: a file drag passes through. */
  onFiles?: DropZoneFilesHandler
  /**
   * The kind of item payload the zone takes besides files (see `writeItemPayload`), read at each drag so it follows a
   * host property. Nothing (the default) takes no items. A drag carrying another kind's payload lights the zone up as
   * refused (`acceptable` is `false`) and its drop is refused.
   */
  itemKind?: () => string | null | undefined
  /** Receives the items of each drop of the `itemKind` payload. */
  onItems?: DropZoneItemsHandler
  /**
   * The rules files are checked against, read at each drop so they follow the host's properties
   * (`() => ({ accept: this.accept, maxSize: this.maxSize })`). Without rules every file is accepted.
   */
  rules?: () => FileRules
  /** Whether the zone takes nothing now: no drop state, no drop, no paste, no activation. */
  disabled?: () => boolean
  /** Whether files pasted while the zone has focus are taken. Off unless given. */
  paste?: () => boolean
  /**
   * The keyboard alternative to dropping: called on Enter or Space on the zone (a `role="button"` region), usually
   * to open the file picker. Without it the zone leaves those keys alone.
   */
  onActivate?: () => void
  /**
   * The element to listen on, when the controller should add its own listeners (an element the host does not render
   * with Lit, or the host itself). Without it, bind `handleDragEnter`, `handleDragOver`, `handleDragLeave`,
   * `handleDrop`, `handlePaste` and `handleKeydown` in the template.
   */
  target?: () => EventTarget | null | undefined
  /**
   * What each drop or paste puts into `announcement`: how many files were added and how many refused (`true`, the
   * default), only how many were added (`'added'`, for a host that already shows and announces each refusal), or
   * nothing (`false`).
   */
  announce?: boolean | 'added'
  /**
   * Receives an item the host itself is dragging (`startItemDrag` with the host as `source`) dropped back on it by the
   * browser: the host moves it to `point`, a reorder rather than a move in. Without it such a drop is refused. The drop
   * does not set `drag.target`, so the source keeps the item.
   */
  onOwnDrop?: (drop: { drag: ItemDrag; point: DropPoint; event: DragEvent }) => void
}

/** What a drag over the zone carries, as far as the zone is concerned. */
type DragContent = { type: 'items'; kind: string } | { type: 'own' } | { type: 'reorder' } | { type: 'refused' } | { type: 'files' }

/** Whether `node` is `zone` or inside it in the composed tree: through slots and out of shadow roots to their host. */
function composedContains(zone: Node, node: EventTarget | null): boolean {
  let current = node instanceof Node ? node : null
  while (current) {
    if (current === zone) return true
    current = (current as Element).assignedSlot ?? current.parentNode ?? (current instanceof ShadowRoot ? current.host : null)
  }
  return false
}

/**
 * The drop effect within what the source allows (`effectAllowed`): an item payload moves when it may, a file is copied.
 * An effect the source does not allow makes the browser refuse the drop.
 */
function dropEffectFor(allowed: string, preferMove: boolean): DataTransfer['dropEffect'] {
  const any = allowed === 'all' || allowed === 'uninitialized'
  const can = (effect: string) => any || allowed.toLowerCase().includes(effect)
  if (preferMove && can('move')) return 'move'
  if (can('copy')) return 'copy'
  if (can('move')) return 'move'
  if (can('link')) return 'link'
  return 'copy'
}

/**
 * Drag events a zone accepted. The innermost zone that accepts a drag takes it; one around it then stays out. A zone
 * that refuses the drag (another kind) does not claim it, so a zone around it that takes that kind still can.
 */
const claimed = new WeakSet<Event>()

/** Whether a zone nested inside this one has already taken this drag event. */
function takenInside(event: DragEvent): boolean {
  return claimed.has(event)
}

/**
 * A reusable file drop target: the drag-over state, the files of a drop or a paste checked against `accept`, size and
 * count rules, the Enter/Space keyboard alternative, and a short announcement of what was added for a live region.
 *
 * The controller draws nothing and styles nothing. The host renders the zone (a focusable `role="button"` element
 * that opens its file picker), styles it from `over` and `acceptable`, and renders `announcement` in a polite live
 * region of its own, present from the first render:
 *
 * ```ts
 * private readonly dropZone = new DropZoneController(this, {
 *   rules: () => ({ accept: this.accept, maxSize: this.maxSize, multiple: this.multiple }),
 *   paste: () => this.paste,
 *   onActivate: () => this.input.click(),
 *   onFiles: ({ accepted }) => this.add(accepted),
 * })
 *
 * render() {
 *   const zone = this.dropZone
 *   return html`<div role="button" tabindex="0" class=${zone.over ? 'over' : ''}
 *     @dragenter=${zone.handleDragEnter} @dragover=${zone.handleDragOver} @dragleave=${zone.handleDragLeave}
 *     @drop=${zone.handleDrop} @paste=${zone.handlePaste} @keydown=${zone.handleKeydown}>…</div>
 *     <span class="visually-hidden" role="status">${zone.announcement}</span>`
 * }
 * ```
 *
 * A zone may take the app's own items as well, from another instance of a component, another list in the page or
 * another window: the source writes them with `writeItemPayload(event.dataTransfer, kind, items)` in its `dragstart`,
 * and a zone given the same `itemKind` lights up, takes the drop through `onItems` and announces how many items it
 * added. While the drag is over the zone only the payload's kind is known (a browser hides the data until the drop),
 * so the kind decides `acceptable`; the host judges the items themselves in `onItems`.
 *
 * Only drags that carry files (for a zone with `onFiles`) or an item payload (for a zone with `itemKind`) light the
 * zone up; dragged text and links pass through. Pasting needs the zone to have
 * focus and `handleKeydown` bound. Chromium and Firefox fire `paste` on a focused element that is not editable; Safari
 * fires none, so a ⌘V/Ctrl+V that no `paste` event follows reads the clipboard with `navigator.clipboard.read()`
 * (the browser asks the visitor to allow it). Where neither works, the file picker remains the keyboard path.
 */
export class DropZoneController implements ReactiveController {
  /** A paste shortcut was pressed and no `paste` event has followed it yet. */
  private pastePending = false
  /** How many `paste` events the page has seen since a shortcut armed the fallback: a later one makes its read moot. */
  private pastes = 0
  /** The window the fallback listens on for the browser's own `paste`, while it waits. */
  private pasteOwner?: Window
  /** A clipboard read is running (Safari may be showing its Paste callout): another shortcut waits for it. */
  private reading = false
  private pasteTimer?: ReturnType<typeof setTimeout>
  /** Whether files are being dragged over the zone. */
  over = false
  /**
   * While `over`: whether the dragged files look acceptable from their types. `false` only when every dragged file
   * has a type the `accept` rule refuses, or there are more than the count rules allow; names are hidden until the drop.
   */
  acceptable = true
  /** The text to show in the host's live region after the last drop or paste; empty before the first. */
  announcement = ''

  private readonly host: ReactiveControllerHost & Element
  private readonly options: DropZoneOptions
  private readonly msg: LocalizeController<typeof en>
  private depth = 0
  private listening: EventTarget | null = null
  private announceTimer: ReturnType<typeof setTimeout> | undefined

  constructor(host: ReactiveControllerHost & Element, options: DropZoneOptions) {
    this.host = host
    this.options = options
    this.msg = new LocalizeController(host, dropZoneMessages)
    this.itemTarget = {
      host: this.host,
      // Never the source, nor a zone inside it (a list in one of its cards): the item would land inside itself.
      accepts: (drag) =>
        this.host.isConnected &&
        !this.disabled &&
        !!this.options.onItems &&
        !composedContains(drag.source, this.host) &&
        this.options.itemKind?.()?.toLowerCase() === drag.kind.toLowerCase(),
      hover: (point) => this.setOver(!!point, true),
      take: (drag, point) => {
        this.setOver(false)
        // The zone may have stopped taking such items since the pointer reached it (disabled, a new kind).
        if (!this.itemTarget.accepts(drag)) return 0
        // A copy, as a drop carried by the browser would bring: the host may keep or change the objects it is given.
        let items: unknown[]
        try {
          items = JSON.parse(JSON.stringify(drag.items)) as unknown[]
        } catch {
          // A cycle or a BigInt in the items: they cannot travel, so nothing is taken and the source keeps them.
          return 0
        }
        // The zone's own spelling of the kind, as a drop the browser carried reports it.
        return this.takeItems(this.options.itemKind?.() ?? drag.kind, items, point, undefined)
      },
    }
    host.addController(this)
  }

  /** The zone as a target of the page's own item drags: a pointer drag a source hands over, or a keyboard move. */
  private readonly itemTarget: ItemDropTarget
  private unregisterItemTarget?: () => void

  hostConnected(): void {
    this.listen()
    if (this.options.itemKind && !this.unregisterItemTarget) this.unregisterItemTarget = registerItemDropTarget(this.itemTarget)
  }

  hostUpdated(): void {
    // The target may only exist once the host has rendered, or be replaced by a later render.
    this.listen()
  }

  hostDisconnected(): void {
    this.unlisten()
    this.unregisterItemTarget?.()
    this.unregisterItemTarget = undefined
    // A paste shortcut still waiting for its clipboard fallback belongs to the zone that left, and a read already
    // running is dropped: the zone no longer hears the `paste` that would make it moot.
    this.pastes += 1
    this.reading = false
    this.pastePending = false
    clearTimeout(this.pasteTimer)
    this.stopWatchingPastes()
    clearTimeout(this.announceTimer)
    this.depth = 0
    this.over = false
  }

  private get disabled(): boolean {
    return this.options.disabled?.() ?? false
  }

  private listen(): void {
    const target = this.options.target?.() ?? null
    if (target === this.listening) return
    this.unlisten()
    if (!target) return
    target.addEventListener('dragenter', this.handleDragEnter as EventListener)
    target.addEventListener('dragover', this.handleDragOver as EventListener)
    target.addEventListener('dragleave', this.handleDragLeave as EventListener)
    target.addEventListener('drop', this.handleDrop as EventListener)
    target.addEventListener('paste', this.handlePaste as EventListener)
    // The keyboard path to the picker, and the paste shortcut's clipboard fallback.
    if (this.options.onActivate || this.options.paste) target.addEventListener('keydown', this.handleKeydown as EventListener)
    this.listening = target
  }

  private unlisten(): void {
    const target = this.listening
    if (!target) return
    target.removeEventListener('dragenter', this.handleDragEnter as EventListener)
    target.removeEventListener('dragover', this.handleDragOver as EventListener)
    target.removeEventListener('dragleave', this.handleDragLeave as EventListener)
    target.removeEventListener('drop', this.handleDrop as EventListener)
    target.removeEventListener('paste', this.handlePaste as EventListener)
    target.removeEventListener('keydown', this.handleKeydown as EventListener)
    this.listening = null
  }

  private setOver(over: boolean, acceptable = true): void {
    if (this.over === over && this.acceptable === acceptable) return
    this.over = over
    this.acceptable = acceptable
    this.host.requestUpdate()
  }

  /** Whether the dragged files look acceptable, from what a drag shows before the drop: their count and types. */
  private judge(transfer: DataTransfer): boolean {
    const items = [...transfer.items].filter((item) => item.kind === 'file')
    if (!items.length) return true
    const rules = this.options.rules?.() ?? {}
    const existing = rules.existing ?? 0
    if (rules.multiple === false && (existing > 0 || items.length > 1)) return false
    if (rules.maxFiles && rules.maxFiles > 0 && items.length > rules.maxFiles - existing) return false
    return !items.every((item) => mayAcceptType(item.type, rules.accept) === false)
  }

  /**
   * What a drag brings that is the zone's business: the accepted item payload, another kind's payload (refused), files
   * (for a zone that takes them), or nothing. An item payload wins over files that come with it.
   */
  private dragOf(event: DragEvent): DragContent | null {
    const transfer = event.dataTransfer
    if (!transfer) return null
    const kind = this.options.itemKind?.()
    // The host's own item, dragged by the browser back over it: a reorder, when the host takes those.
    if (this.options.onOwnDrop && !this.disabled && currentItemDrag()?.source === this.host && itemPayloadKinds(transfer).length) return { type: 'reorder' }
    if (kind) {
      const kinds = itemPayloadKinds(transfer)
      // Items dragged out of this host or one around it, or over their source (a list in this board's card that takes
      // nothing back itself), whatever their kind: dropping them there is no move, and the zone neither lights up nor
      // refuses them.
      const source = currentItemDrag()?.source
      if (kinds.length && source && (composedContains(source, this.host) || event.composedPath().includes(source))) return { type: 'own' }
      if (kinds.includes(kind.toLowerCase())) return { type: 'items', kind }
      if (kinds.length) return { type: 'refused' }
    }
    if (this.options.onFiles && hasFiles(transfer)) return { type: 'files' }
    return null
  }

  private acceptableFor(drag: DragContent, transfer: DataTransfer): boolean {
    return drag.type === 'items' || (drag.type === 'files' && this.judge(transfer))
  }

  readonly handleDragEnter = (event: DragEvent): void => {
    const drag = this.dragOf(event)
    if (!drag || takenInside(event)) return
    if (drag.type === 'reorder') {
      // Taken, but unlit: the item is already the host's.
      event.preventDefault()
      claimed.add(event)
      return
    }
    if (this.disabled || drag.type === 'own') {
      // Unlit, but its own kind stays its own: the zone around it does not light up for a drop it would not get.
      if (drag.type !== 'refused') claimed.add(event)
      return
    }
    event.preventDefault()
    this.depth += 1
    if (drag.type !== 'refused') {
      claimed.add(event)
      this.setOver(true, this.acceptableFor(drag, event.dataTransfer!))
    } else this.showRefusedUnlessTaken(event)
  }

  readonly handleDragOver = (event: DragEvent): void => {
    const drag = this.dragOf(event)
    if (!drag) return
    // A zone nested in this one (a list in a board's card) took the drag: this one stays out of it and unlit.
    if (takenInside(event)) {
      if (this.over) {
        this.depth = 0
        this.setOver(false)
      }
      return
    }
    const transfer = event.dataTransfer!
    if (drag.type === 'reorder') {
      event.preventDefault()
      claimed.add(event)
      transfer.dropEffect = 'move'
      return
    }
    if (this.disabled || drag.type === 'refused' || drag.type === 'own') {
      // Refuse the drop rather than ignore it: an ignored dragover lets the browser open the file in place of the page.
      event.preventDefault()
      transfer.dropEffect = 'none'
      // A disabled zone still owns a drag of its own kind: a zone around it must not take what this one refuses.
      if (drag.type !== 'refused') claimed.add(event)
      if (this.over && drag.type === 'own') {
        this.depth = 0
        this.setOver(false)
      }
      // Another kind's payload shows the zone refusing it, like a file the rules turn away.
      if (!this.disabled && drag.type === 'refused') {
        this.depth = Math.max(this.depth, 1)
        this.showRefusedUnlessTaken(event)
      }
      return
    }
    // Cancelling dragover is what makes the zone a drop target.
    event.preventDefault()
    claimed.add(event)
    // Items move when the source allows it (it then removes them on `dragend`); files are always copied.
    transfer.dropEffect = dropEffectFor(transfer.effectAllowed, drag.type === 'items')
    // A drag that started outside the window, or whose dragenter was missed, still lights the zone up.
    if (!this.over) {
      this.depth = Math.max(this.depth, 1)
      this.setOver(true, this.acceptableFor(drag, transfer))
    }
  }

  /**
   * Shows the zone refusing a drag of another kind, unless a zone around it takes that kind: the event bubbles on to
   * it, so the check waits until the dispatch is over: a task, not a microtask, which the browser runs between the
   * listeners of an event it dispatches itself. A refused outline over a drop that lands would mislead.
   */
  private showRefusedUnlessTaken(event: DragEvent): void {
    setTimeout(() => {
      if (!this.depth) return
      const taken = claimed.has(event)
      if (taken ? this.over : !this.over || this.acceptable) this.setOver(!taken, false)
    })
  }

  readonly handleDragLeave = (event: DragEvent): void => {
    // Counted even while unlit: a zone that refused a drag a zone around it took still counted its dragenters.
    if (this.depth) this.depth -= 1
    if (this.depth || !this.over) return
    // The pointer is still over the zone: it came back from a zone nested in it, whose dragenters this one did not
    // count, and that zone's dragleave bubbled here after the zone's own dragenter.
    if (event.currentTarget instanceof Node && composedContains(event.currentTarget, event.relatedTarget)) return
    this.setOver(false)
  }

  readonly handleDrop = (event: DragEvent): void => {
    const wasOver = this.over
    this.depth = 0
    this.setOver(false)
    if (takenInside(event)) return
    const drag = this.dragOf(event)
    const own = currentItemDrag()
    if (drag?.type === 'reorder' && own) {
      event.preventDefault()
      claimed.add(event)
      this.options.onOwnDrop!({ drag: own, point: { x: event.clientX, y: event.clientY }, event })
      // Over here and now: the source's `dragend` may never come, its node redrawn away by the move it made.
      endItemDrag(own)
      return
    }
    if (this.disabled || !drag || drag.type === 'refused' || drag.type === 'own') {
      // Keep the browser from opening a file dropped on a zone that takes none now.
      if (wasOver || drag) event.preventDefault()
      if (drag && drag.type !== 'refused') {
        claimed.add(event)
        event.dataTransfer!.dropEffect = 'none'
      }
      return
    }
    event.preventDefault()
    claimed.add(event)
    if (drag.type === 'items') this.receiveItems(drag.kind, event)
    else if (drag.type === 'files') this.receive([...event.dataTransfer!.files], 'drop')
  }

  readonly handlePaste = (event: ClipboardEvent): void => {
    // The browser fired its own `paste`: the clipboard fallback of the shortcut is not needed.
    this.handleAnyPaste()
    if (this.disabled || !(this.options.paste?.() ?? false)) return
    const files = [...(event.clipboardData?.files ?? [])]
    // Text pasted here is none of the zone's business.
    if (!files.length) return
    event.preventDefault()
    this.receive(files, 'paste')
  }

  readonly handleKeydown = (event: KeyboardEvent): void => {
    if (this.handlePasteKeydown(event) || this.disabled || isComposingKey(event)) return
    if (!this.options.onActivate) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    // A key pressed in a control inside the zone (a link in a slotted prompt) belongs to that control.
    // The path's first node, not `target`, which a shadow root retargets to its host.
    if (event.currentTarget !== null && event.composedPath()[0] !== event.currentTarget) return
    event.preventDefault()
    this.options.onActivate()
  }

  /**
   * The paste shortcut alone, for a zone whose Enter and Space already open the picker natively (a `<button>`), where
   * `handleKeydown` would activate it twice. Returns whether the key was the shortcut and was taken.
   *
   * Safari fires no `paste` on a focused element that is not editable. The browser dispatches its own `paste` right
   * after this keydown, so the fallback waits one task: if none came, it reads the clipboard while the keystroke still
   * counts as the visitor's gesture.
   */
  readonly handlePasteKeydown = (event: KeyboardEvent): boolean => {
    if (this.disabled || isComposingKey(event) || !isPasteShortcut(event) || !(this.options.paste?.() ?? false)) return false
    // Only WebKit fires no `paste` here. Elsewhere the browser's own `paste` may come late (Chrome on macOS sends ⌘V
    // through its Edit menu), and a clipboard read would both prompt the visitor and add the files a second time.
    if (!firesNoPasteOnFocusedElement()) return false
    // A key pressed in a control inside the zone (a link in a slotted prompt) belongs to that control.
    if (event.currentTarget !== null && event.composedPath()[0] !== event.currentTarget) return false
    // A held ⌘V repeats, and a second press may come while Safari asks to paste: one read is enough.
    if (event.repeat || this.reading) return true
    this.pastePending = true
    // The browser may send its `paste` elsewhere (to a selection on the page) or a listener may stop it before it
    // reaches the zone: any `paste` anywhere, until the read is done, means the browser handled the shortcut.
    this.stopWatchingPastes()
    // On the window, in the capture phase, so a listener that stops the `paste` further on cannot hide it. One the app
    // registered on the window before this one still can: an app that handles paste itself leaves `paste` off.
    this.pasteOwner = (event.currentTarget as Node | null)?.ownerDocument?.defaultView ?? globalThis.window
    this.pasteOwner?.addEventListener('paste', this.handleAnyPaste, { capture: true })
    const seen = this.pastes
    clearTimeout(this.pasteTimer)
    this.pasteTimer = setTimeout(() => {
      // An app that took over the shortcut (cancelled the keydown) also cancelled the browser's paste.
      if (!this.pastePending || event.defaultPrevented) {
        this.pastePending = false
        this.stopWatchingPastes()
        return
      }
      this.pastePending = false
      this.reading = true
      void this.readClipboard(seen).finally(() => {
        this.reading = false
        this.stopWatchingPastes()
      })
    })
    return true
  }

  private readonly handleAnyPaste = (): void => {
    this.pastePending = false
    this.pastes += 1
  }

  private stopWatchingPastes(): void {
    this.pasteOwner?.removeEventListener('paste', this.handleAnyPaste, { capture: true })
    this.pasteOwner = undefined
  }

  /**
   * Reads the clipboard (Safari's ⌘V path), each item once, in its first type that is not text. Safari exposes copied
   * images and screenshots this way, not a file copied in Finder, which keeps the file picker as its path.
   */
  private async readClipboard(seen: number): Promise<void> {
    const clipboard = globalThis.navigator?.clipboard
    if (typeof clipboard?.read !== 'function') return
    const files: File[] = []
    try {
      for (const item of await clipboard.read()) {
        const type = item.types.find((candidate) => !candidate.startsWith('text/'))
        if (!type) continue
        try {
          // A file copied in Finder comes with its `file:` URL and a picture of its icon: that picture is not the file.
          // An image copied from a web page carries its `https:` URL, and is taken.
          if (item.types.includes('text/uri-list') && (await copiedFileUrl(item))) continue
          const blob = await item.getType(type)
          files.push(new File([blob], `pasted.${extensionOf(type)}`, { type }))
        } catch {
          // One unreadable item does not lose the others.
        }
      }
    } catch {
      // The visitor refused, or nothing readable was there.
      return
    }
    // The visitor may have answered the browser's prompt after the zone left the page or turned paste off, and a
    // `paste` that arrived meanwhile already brought these files.
    if (this.pastes !== seen || !this.host.isConnected || this.disabled || !(this.options.paste?.() ?? false)) return
    // Several items get numbered names, so code that keys on the name does not take one for another.
    const named =
      files.length > 1 ? files.map((file, index) => new File([file], file.name.replace(/^pasted\./, `pasted-${index + 1}.`), { type: file.type })) : files
    this.receive(named, 'paste')
  }

  /** Runs the files of a drop or paste through the rules and the host, then announces the result. */
  private receive(files: File[], source: DropZoneSource): void {
    if (!files.length || !this.options.onFiles) return
    const { accepted, rejected } = filterFiles(files, this.options.rules?.() ?? {})
    const taken = this.options.onFiles({ source, files, accepted, rejected })
    if (this.options.announce === false) return
    const added = typeof taken === 'number' ? taken : taken ? taken.length : accepted.length
    this.announce(added, this.options.announce === 'added' ? 0 : files.length - added)
  }

  /** Hands the items of a dropped payload to the host, then announces how many it took. */
  private receiveItems(kind: string, event: DragEvent): void {
    const items = readItemPayload(event.dataTransfer, kind)
    const added = items ? this.takeItems(kind, items, { x: event.clientX, y: event.clientY }, event) : 0
    // Nothing taken (all refused, the app cancelled, or a payload that is not a JSON array): report no move, so a source
    // that removes its items on a `move` `dragend` keeps them. A partial drop stays a move: the zone refuses only items
    // it already holds.
    if (added === 0 && event.dataTransfer) event.dataTransfer.dropEffect = 'none'
  }

  /** Runs items through the host, announces how many it took and returns that count. */
  private takeItems(kind: string, items: unknown[], point: DropPoint | undefined, event: DragEvent | undefined): number {
    if (!items.length || !this.options.onItems) return 0
    let taken: ReturnType<NonNullable<DropZoneOptions['onItems']>>
    try {
      taken = this.options.onItems({ kind, items, point, event })
    } catch (error) {
      // A payload the host could not take (one from another window may have any shape): no move, so the source keeps it.
      if (event?.dataTransfer) event.dataTransfer.dropEffect = 'none'
      throw error
    }
    const added = typeof taken === 'number' ? taken : taken ? taken.length : items.length
    if (this.options.announce !== false) this.announce(added, this.options.announce === 'added' ? 0 : items.length - added, 'items')
    return added
  }

  private announce(added: number, refused: number, what: 'files' | 'items' = 'files'): void {
    const parts: string[] = []
    if (added > 0) parts.push(this.msg.t(what === 'items' ? 'itemsAdded' : 'added', added))
    if (refused > 0) parts.push(this.msg.t(what === 'items' ? 'itemsRejected' : 'rejected', refused))
    const text = parts.join('. ')
    // Clear first, then write: the same text twice in a row is a change a screen reader announces again.
    this.announcement = ''
    this.host.requestUpdate()
    clearTimeout(this.announceTimer)
    this.announceTimer = setTimeout(() => {
      this.announcement = text
      this.host.requestUpdate()
    }, 150)
  }
}

/** Whether a clipboard item is a file copied in the file manager: its `text/uri-list` names `file:` URLs only, or none. */
async function copiedFileUrl(item: ClipboardItem): Promise<boolean> {
  try {
    const uris = (await (await item.getType('text/uri-list')).text())
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
    return uris.every((uri) => uri.toLowerCase().startsWith('file:'))
  } catch {
    return true
  }
}

/** The usual file extension of a MIME type, so an `accept` written as `.jpg` or `.svg` takes the pasted file. */
function extensionOf(type: string): string {
  const subtype = type.split('/')[1]?.split(/[+;]/)[0]?.toLowerCase() || 'bin'
  return ({ jpeg: 'jpg', tiff: 'tif', 'x-icon': 'ico' } as Record<string, string>)[subtype] ?? subtype
}

/** WebKit (Safari, and every browser on iOS) fires no `paste` on a focused element that is not editable. */
function firesNoPasteOnFocusedElement(): boolean {
  if (typeof navigator === 'undefined') return false
  const agent = navigator.userAgent
  return /AppleWebKit/.test(agent) && !/Chrome|Chromium|Edg\//.test(agent)
}

const isApple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * The platform's paste shortcut with no other modifier: ⌘V on Apple platforms, Ctrl+V elsewhere. Matched on the
 * physical key as well as the character, so a non-Latin layout (where `key` is 'м') still counts.
 */
function isPasteShortcut(event: KeyboardEvent): boolean {
  const command = isApple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
  // The physical key only stands in when the layout types no Latin letter there: on Dvorak the V key types `k`, and ⌘K
  // there is another shortcut.
  const v = event.key.toLowerCase() === 'v' || (!/^[a-z]$/i.test(event.key) && event.code === 'KeyV')
  return command && !event.altKey && !event.shiftKey && v
}

/** Whether a drag carries files: `types` lists `Files` for those, during the drag as on the drop. */
export function hasFiles(transfer: DataTransfer | null | undefined): boolean {
  if (!transfer) return false
  return [...transfer.types].includes('Files')
}

const ITEM_PAYLOAD = /^application\/x-c2n-([a-z0-9][a-z0-9.-]*)\+json$/

/**
 * The MIME type an item payload of `kind` travels under: `application/x-c2n-<kind>+json`. A kind is lowercase letters,
 * digits, dots and hyphens (`kanban-card`, `tree-node`), since a drag lowercases the types it carries.
 */
export function itemPayloadType(kind: string): string {
  const type = `application/x-c2n-${kind.toLowerCase()}+json`
  if (!ITEM_PAYLOAD.test(type)) throw new TypeError(`Invalid item payload kind "${kind}": use letters, digits, dots and hyphens.`)
  return type
}

/**
 * Writes the items a drag carries, as JSON under `itemPayloadType(kind)`, for a drop zone whose `itemKind` is `kind`
 * (a `c2-kanban`, `c2-reorder-list` or `c2-tree` with that `drop-kind`). Call it from the source's `dragstart`; set
 * `effectAllowed` to `copy` for items that stay at the source, or allow `move` and remove them on `dragend` when its
 * `dropEffect` is `move`. The items must survive `JSON.stringify`. A plain-text line per item (its label, title, name,
 * value or id) is added for targets outside the page, unless the source wrote its own text.
 */
export function writeItemPayload(transfer: DataTransfer, kind: string, items: readonly unknown[]): void {
  transfer.setData(itemPayloadType(kind), JSON.stringify(items))
  if (![...transfer.types].includes('text/plain')) transfer.setData('text/plain', items.map(labelOf).join('\n'))
}

/**
 * The items a drop carries under `kind`, or `null` when it carries none or they are not a JSON array. Only readable on
 * `drop`: during a drag the browser shows the types alone (see `itemPayloadKinds`).
 */
export function readItemPayload<T = unknown>(transfer: DataTransfer | null | undefined, kind: string): T[] | null {
  if (!transfer) return null
  try {
    const data = transfer.getData(itemPayloadType(kind))
    if (!data) return null
    const items: unknown = JSON.parse(data)
    return Array.isArray(items) ? (items as T[]) : null
  } catch {
    return null
  }
}

/** The kinds of item payload a drag carries, readable during the drag as on the drop. */
export function itemPayloadKinds(transfer: DataTransfer | null | undefined): string[] {
  if (!transfer) return []
  return [...transfer.types].flatMap((type) => ITEM_PAYLOAD.exec(type.toLowerCase())?.[1] ?? [])
}

/** A short text for an item in the plain-text fallback: its label, title, name, value or id, else nothing. */
function labelOf(item: unknown): string {
  if (typeof item === 'string' || typeof item === 'number') return String(item)
  if (!item || typeof item !== 'object') return ''
  const record = item as Record<string, unknown>
  for (const field of ['label', 'title', 'name', 'value', 'id']) {
    const value = record[field]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
  return ''
}

/**
 * An item drag in progress in this page, started by a source with `startItemDrag`: what a zone needs to know without
 * the browser's data transfer, which hides the items until the drop and is absent from a pointer drag.
 */
export interface ItemDrag<T = unknown> {
  /** The payload kind, as `writeItemPayload` writes it. */
  kind: string
  /** The items, which must survive `JSON.stringify`: a zone is given a copy. */
  items: readonly T[]
  /** The element they are dragged out of. A zone on it takes nothing back, and does not light up for them. */
  source: Element
}

/**
 * A zone that takes the page's own item drags without the browser's drag and drop: a pointer drag a source hands over
 * when it leaves the source, or a keyboard move. Every `DropZoneController` with an `itemKind` registers one.
 */
export interface ItemDropTarget {
  /** The element the zone belongs to. */
  readonly host: Element
  /** Whether it takes this drag now: its kind, not disabled, not the drag's own source. */
  accepts(drag: ItemDrag): boolean
  /** Shows the drag over it at a point, or ends that (`null`). */
  hover(point: DropPoint | null): void
  /** Takes the items at a point, or at its natural place (the end) without one, and returns how many it took. */
  take(drag: ItemDrag, point?: DropPoint): number
}

interface ItemDragRegistry {
  drag: ItemDrag | null
  targets: Set<ItemDropTarget>
}

/** Shared through `globalThis`, so two copies of this module in one page (two bundles) see each other's zones. */
const registry: ItemDragRegistry = ((globalThis as unknown as Record<symbol, ItemDragRegistry | undefined>)[Symbol.for('c2n.item-drag')] ??= {
  drag: null,
  targets: new Set(),
})

/**
 * Marks an item drag as started from `drag.source`: call it with `writeItemPayload` in the source's `dragstart`, or
 * when a pointer drag starts, and `endItemDrag` once it is over. Zones on the source then stay out of it.
 */
export function startItemDrag(drag: ItemDrag): void {
  registry.drag = drag
}

/** The watch `startNativeItemDrag` keeps for a drag whose `dragend` may never come, by drag. */
const watchers = new WeakMap<ItemDrag, () => void>()

/**
 * `startItemDrag` from a source's `dragstart` handler, for a drag the browser carries. Its `dragend` may never reach
 * the source: a listener after it (a scroll area that pans on mouse drags) may cancel the `dragstart`, or the dragged
 * node may leave the document mid-drag. Then the drag ends again by itself, a task after a cancelled `dragstart` or at
 * the next press of a pointer (none reaches the page while the browser drags), and `forget` runs, for the source to
 * finish it as on `dragend`: a zone that took the items says so in `drag.target`.
 */
export function startNativeItemDrag(event: DragEvent, drag: ItemDrag, forget: () => void): void {
  startItemDrag(drag)
  const end = () => {
    unwatch()
    if (registry.drag !== drag) return
    endItemDrag(drag)
    forget()
  }
  const unwatch = () => {
    removeEventListener('pointerdown', end, true)
    watchers.delete(drag)
  }
  addEventListener('pointerdown', end, true)
  // A `dragend` that reached the source ends the drag first: the watch goes with it.
  watchers.set(drag, unwatch)
  setTimeout(() => {
    if (event.defaultPrevented) end()
  })
}

/** Ends the item drag `startItemDrag` started (or any, without an argument). */
export function endItemDrag(drag?: ItemDrag): void {
  if (drag) watchers.get(drag)?.()
  if (!drag || registry.drag === drag) registry.drag = null
}

/** The item drag in progress in this page, if a source started one. */
export function currentItemDrag(): ItemDrag | null {
  return registry.drag
}

/** Adds a zone to the page's item drop targets; returns the function that removes it. */
export function registerItemDropTarget(target: ItemDropTarget): () => void {
  registry.targets.add(target)
  return () => registry.targets.delete(target)
}

/**
 * The zone that takes `drag` at a point: the innermost accepting zone under the topmost element there, so a zone a
 * dialog covers is not one, and never one around the source while the point is on the source. The source's dragged
 * preview must not catch the pointer (`pointer-events: none`).
 */
export function itemDropTargetAt(point: DropPoint, drag: ItemDrag): ItemDropTarget | null {
  if (typeof document === 'undefined') return null
  let element = document.elementFromPoint(point.x, point.y)
  // Down through shadow roots to the element actually there.
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint(point.x, point.y)
    if (!inner || inner === element) break
    element = inner
  }
  if (!element) return null
  // Over the source itself, a zone around it (a board holding the list a row comes from) is not a target: the pointer is
  // still reordering inside the source.
  const box = drag.source.getBoundingClientRect()
  const onSource = point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
  let best: ItemDropTarget | null = null
  for (const target of registry.targets) {
    if (!target.accepts(drag) || !composedContains(target.host, element)) continue
    if (onSource && composedContains(target.host, drag.source)) continue
    if (!best || composedContains(best.host, target.host)) best = target
  }
  return best
}

/** The zone of `host` that takes `drag`, for a move made without a pointer (`moveItemTo`). */
export function itemDropTargetOf(host: Element, drag: ItemDrag): ItemDropTarget | null {
  for (const target of registry.targets) if (target.host === host && target.accepts(drag)) return target
  return null
}
