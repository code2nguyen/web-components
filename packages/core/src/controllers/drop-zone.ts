import type { ReactiveController, ReactiveControllerHost } from '@lit/reactive-element'
import { isComposingKey } from '../dom-helper.js'
import { filterFiles, mayAcceptType, type FileRejection, type FileRules } from '../file-accept.js'
import { defineMessages, LocalizeController } from '../localize.js'

export type { FileRejection, FileRejectionReason, FileRules } from '../file-accept.js'

const en = {
  added: (count: number) => (count === 1 ? '1 file added' : `${count} files added`),
  rejected: (count: number) => (count === 1 ? '1 file not added' : `${count} files not added`),
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

export interface DropZoneOptions {
  /** Receives the files of each drop or paste. */
  onFiles: DropZoneFilesHandler
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
 * Only drags that carry files light the zone up; dragged text and links pass through. Pasting needs the zone to have
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
    host.addController(this)
  }

  hostConnected(): void {
    this.listen()
  }

  hostUpdated(): void {
    // The target may only exist once the host has rendered, or be replaced by a later render.
    this.listen()
  }

  hostDisconnected(): void {
    this.unlisten()
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

  readonly handleDragEnter = (event: DragEvent): void => {
    if (this.disabled || !hasFiles(event.dataTransfer)) return
    event.preventDefault()
    this.depth += 1
    this.setOver(true, this.judge(event.dataTransfer!))
  }

  readonly handleDragOver = (event: DragEvent): void => {
    if (!hasFiles(event.dataTransfer)) return
    if (this.disabled) {
      // Refuse the drop rather than ignore it: an ignored dragover lets the browser open the file in place of the page.
      event.preventDefault()
      event.dataTransfer!.dropEffect = 'none'
      return
    }
    // Cancelling dragover is what makes the zone a drop target.
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'copy'
    // A drag that started outside the window, or whose dragenter was missed, still lights the zone up.
    if (!this.over) {
      this.depth = Math.max(this.depth, 1)
      this.setOver(true, this.judge(event.dataTransfer!))
    }
  }

  readonly handleDragLeave = (_event: DragEvent): void => {
    if (!this.over) return
    this.depth = Math.max(0, this.depth - 1)
    if (this.depth === 0) this.setOver(false)
  }

  readonly handleDrop = (event: DragEvent): void => {
    const wasOver = this.over
    this.depth = 0
    this.setOver(false)
    if (this.disabled || !hasFiles(event.dataTransfer)) {
      // Keep the browser from opening a file dropped on a zone that takes none now.
      if (wasOver || hasFiles(event.dataTransfer)) event.preventDefault()
      return
    }
    event.preventDefault()
    this.receive([...event.dataTransfer!.files], 'drop')
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
    if (!files.length) return
    const { accepted, rejected } = filterFiles(files, this.options.rules?.() ?? {})
    const taken = this.options.onFiles({ source, files, accepted, rejected })
    if (this.options.announce === false) return
    const added = typeof taken === 'number' ? taken : taken ? taken.length : accepted.length
    this.announce(added, this.options.announce === 'added' ? 0 : files.length - added)
  }

  private announce(added: number, refused: number): void {
    const parts: string[] = []
    if (added > 0) parts.push(this.msg.t('added', added))
    if (refused > 0) parts.push(this.msg.t('rejected', refused))
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
