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
  /** Whether each drop or paste is put into `announcement`. On by default. */
  announce?: boolean
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
 * focus, and works where the browser fires `paste` on a focused element that is not editable (Chromium, Firefox);
 * elsewhere the file picker remains the keyboard path.
 */
export class DropZoneController implements ReactiveController {
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
    if (this.options.onActivate) target.addEventListener('keydown', this.handleKeydown as EventListener)
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
    if (this.disabled || !hasFiles(event.dataTransfer)) return
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
    if (this.disabled || !(this.options.paste?.() ?? false)) return
    const files = [...(event.clipboardData?.files ?? [])]
    // Text pasted here is none of the zone's business.
    if (!files.length) return
    event.preventDefault()
    this.receive(files, 'paste')
  }

  readonly handleKeydown = (event: KeyboardEvent): void => {
    if (!this.options.onActivate || this.disabled || isComposingKey(event)) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    // A key pressed in a control inside the zone (a link in a slotted prompt) belongs to that control.
    if (event.target !== event.currentTarget && event.currentTarget !== null) return
    event.preventDefault()
    this.options.onActivate()
  }

  /** Runs the files of a drop or paste through the rules and the host, then announces the result. */
  private receive(files: File[], source: DropZoneSource): void {
    if (!files.length) return
    const { accepted, rejected } = filterFiles(files, this.options.rules?.() ?? {})
    const taken = this.options.onFiles({ source, files, accepted, rejected })
    if (this.options.announce === false) return
    const added = typeof taken === 'number' ? taken : taken ? taken.length : accepted.length
    this.announce(added, files.length - added)
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

/** Whether a drag carries files: `types` lists `Files` for those, during the drag as on the drop. */
export function hasFiles(transfer: DataTransfer | null | undefined): boolean {
  if (!transfer) return false
  return [...transfer.types].includes('Files')
}
