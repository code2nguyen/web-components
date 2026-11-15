import { LitElement, html, nothing, svg, unsafeCSS, type CSSResultGroup } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { AttachmentStatus } from '@c2n/attachment'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { uploadMessages } from './messages.js'
import styles from './upload.scss?inline'

import '@c2n/attachment'
import '@c2n/button'
import { disabledByAncestor } from '@c2n/core/dom-helper.js'

export type UploadVariant = 'dropzone' | 'compact'

export interface UploadItem {
  id: string
  file: File
  status: AttachmentStatus
  progress: number
  result?: unknown
  error?: unknown
  previewUrl?: string
  /** Upload target the file was added through, when a component has several (a `c2-document-checklist` row's id). */
  target?: string
}

export type UploadRejectionReason = 'type' | 'size' | 'limit' | 'multiple'

export interface UploadRejection {
  file: File
  reason: UploadRejectionReason
  message: string
}

export interface UploadHandlerContext {
  signal: AbortSignal
  onProgress: (progress: number) => void
  /** The item's `target`, when the component has several upload targets. */
  target?: string
}

/** Application upload function. Resolve with server data; throw to show the attachment error/retry state. */
export type UploadHandler = (file: File, context: UploadHandlerContext) => unknown | Promise<unknown>

export interface UploadFilesEventDetail {
  files: File[]
  items: UploadItem[]
}

export interface UploadProgressEventDetail {
  item: UploadItem
  progress: number
}

export interface UploadResultEventDetail {
  item: UploadItem
  result?: unknown
  error?: unknown
}

/** Events fired by {@link Upload}, keyed for `addEventListener`. */
export interface UploadEventMap {
  'files-selected': CustomEvent<UploadFilesEventDetail>
  'file-reject': CustomEvent<{ rejections: UploadRejection[] }>
  'upload-start': CustomEvent<{ item: UploadItem }>
  'upload-progress': CustomEvent<UploadProgressEventDetail>
  'upload-success': CustomEvent<UploadResultEventDetail>
  'upload-error': CustomEvent<UploadResultEventDetail>
  'upload-remove': CustomEvent<{ item: UploadItem }>
  input: Event
  change: Event
}

export interface Upload {
  addEventListener: TypedAddEventListener<Upload, UploadEventMap>
  removeEventListener: TypedRemoveEventListener<Upload, UploadEventMap>
}

let uploadItemId = 0

/**
 * Drag-and-drop file uploader with multiple selection, validation and an attachment-based upload queue. Set an async
 * `uploadHandler(file, { signal, onProgress })` property to connect transport; the component owns progress, success,
 * error, retry, cancel and removal UI while leaving network policy to the application.
 *
 * @tag c2-upload
 *
 * @slot drop-icon - Replaces the upload-cloud icon in the drop zone.
 * @slot prompt - Replaces the main drop-zone instruction.
 * @slot hint - Replaces the accepted-type and size hint.
 * @slot action - Replaces the dynamic label of the compact upload button.
 * @slot empty - Optional content shown below the drop zone while no files are selected.
 * @csspart dropzone - Interactive drop-zone region containing the icon, prompt, and hint.
 * @csspart drop-icon - Icon boundary wrapping the `drop-icon` slot and fallback icon.
 * @csspart prompt - Instruction region wrapping the `prompt` slot and fallback prompt.
 * @csspart hint - Supporting-text region wrapping the `hint` slot and generated fallback hint.
 * @csspart action - Compact picker label boundary wrapping the `action` slot and fallback label.
 * @csspart empty - Empty-state boundary exposing the `empty` slot.
 * @csspart errors - Validation-error status region.
 * @csspart list - Selected-file list region.
 *
 * @event {CustomEvent<UploadFilesEventDetail>} files-selected - Fired after valid files enter the queue through browse, drop or `addFiles()`.
 * @event {CustomEvent<{ rejections: UploadRejection[] }>} file-reject - Fired when type, size, count or single-file rules reject files.
 * @event {CustomEvent<{ item: UploadItem }>} upload-start - Fired when an item begins uploading.
 * @event {CustomEvent<UploadProgressEventDetail>} upload-progress - Fired when the upload handler reports progress.
 * @event {CustomEvent<UploadResultEventDetail>} upload-success - Fired after an upload handler resolves; `item.result` contains its result.
 * @event {CustomEvent<UploadResultEventDetail>} upload-error - Fired after an upload handler rejects; `item.error` contains the error.
 * @event {CustomEvent<{ item: UploadItem }>} upload-remove - Fired after an item is removed or an active upload is cancelled.
 * @event {Event} input - Fired whenever the file value changes, for form and framework bindings.
 * @event {Event} change - Fired whenever files are added or removed, for form and framework bindings.
 *
 * @cssproperty {pixel} [--c2-upload--width=420px]
 * @cssproperty {padding} [--c2-upload__dropzone--padding=28px 20px]
 * @cssproperty {pixel} [--c2-upload__dropzone--gap=8px]
 * @cssproperty {color} [--c2-upload__dropzone--background=#ffffff]
 * @cssproperty {border} [--c2-upload__dropzone--border=1px dashed #bcbcc6]
 * @cssproperty {border-radius} [--c2-upload__dropzone--border-radius=14px]
 * @cssproperty {color} [--c2-upload__dropzone__hover--background=#fafafa]
 * @cssproperty {border} [--c2-upload__dropzone__hover--border=1px dashed #a1a1aa]
 * @cssproperty {color} [--c2-upload__dropzone__drag--background=#e8f2ff]
 * @cssproperty {border} [--c2-upload__dropzone__drag--border=1px dashed rgb(2, 101, 220)]
 * @cssproperty {outline} [--c2-upload__dropzone__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-upload__dropzone__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-upload__dropzone__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-upload__dropzone__error--border-color=#dc2626] - Drop-zone border colour while an enclosing `c2-form-field` shows an error.
 * @cssproperty {border} [--c2-upload__compact__error--border=1px solid #dc2626] - Border of the compact upload button while an enclosing `c2-form-field` shows an error.
 * @cssproperty {pixel} [--c2-upload__icon--size=32px]
 * @cssproperty {color} [--c2-upload__icon--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-upload__prompt--color=#18181b]
 * @cssproperty {font-size} [--c2-upload__prompt--font-size=14px]
 * @cssproperty {font-weight} [--c2-upload__prompt--font-weight=600]
 * @cssproperty {color} [--c2-upload__action--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-upload__hint--color=#71717a]
 * @cssproperty {font-size} [--c2-upload__hint--font-size=12px]
 * @cssproperty {pixel} [--c2-upload__list--gap=10px]
 * @cssproperty {pixel} [--c2-upload__list--margin-top=12px]
 * @cssproperty {color} [--c2-upload__error--color=#dc2626]
 * @cssproperty {font-size} [--c2-upload__error--font-size=12px]
 * @cssproperty {pixel} [--c2-upload__error--gap=4px]
 *
 * @internalcomponent c2-attachment
 * @internalcomponent c2-button
 */
@customElement('c2-upload')
export class Upload extends LitElement {
  static formAssociated = true

  static override styles: CSSResultGroup = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly controllers = new Map<string, AbortController>()
  private dragDepth = 0
  private customValidityMessage = ''
  /** Label and description handed down by an enclosing `c2-form-field`. */
  protected readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private readonly msg = new LocalizeController(this, uploadMessages)
  @state() protected uploadItems: UploadItem[] = []
  @state() protected rejections: UploadRejection[] = []
  @state() protected dragging = false
  @state() private disabledByForm = false

  /** Accept several files in one browse or drop operation. */
  @property({ type: Boolean, reflect: true }) multiple = false

  /** Dropzone provides drag-and-drop; compact renders only an upload button. */
  @property({ reflect: true }) variant: UploadVariant = 'dropzone'

  /** Comma-separated MIME types or file extensions, using the native file-input syntax. */
  @property({ type: String }) accept = ''

  /** Maximum number of queued files. Zero means unlimited. */
  @property({ type: Number, attribute: 'max-files' }) maxFiles = 0

  /** Maximum size of each file in bytes. Zero means unlimited. */
  @property({ type: Number, attribute: 'max-size' }) maxSize = 0

  /** Run `uploadHandler` immediately after files are accepted. */
  @property({ type: Boolean, attribute: 'auto-upload' }) autoUpload = true

  /** Disables browsing, dropping and attachment actions. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Requires at least one selected file for native form validation. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Form field name. Each queued file is appended with this name. */
  @property({ type: String, reflect: true }) name = ''

  /** Accessible name for the drop zone. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Application-provided transport. Report percentages through `onProgress`; respect `signal` to support cancel. */
  @property({ attribute: false }) uploadHandler: UploadHandler | undefined

  @query('input', true) protected input!: HTMLInputElement

  /** Current queue, including ready, uploading, complete and failed items. */
  get items(): readonly UploadItem[] {
    return this.uploadItems
  }

  /** Selected files. Assign a new array to replace the queue. */
  get value(): File[] {
    return this.uploadItems.map((item) => item.file)
  }

  set value(files: File[]) {
    this.resetQueue(false)
    if (files.length) this.addFiles(files)
  }

  get form() {
    return this.internals.form
  }

  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    for (const controller of this.controllers.values()) controller.abort()
    for (const item of this.uploadItems) this.revokePreview(item)
  }

  formResetCallback(): void {
    this.resetQueue(false)
  }

  formDisabledCallback(disabled: boolean): void {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  checkValidity(): boolean {
    return this.internals.checkValidity()
  }

  reportValidity(): boolean {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string): void {
    this.customValidityMessage = message
    this.syncFormState()
  }

  protected override updated(): void {
    // Read on every update: an enclosing field changes `invalid` without changing a property of this element.
    if (this.field.invalid && !this.effectiveDisabled) this.internals.states.add('error')
    else this.internals.states.delete('error')
    this.syncFormState()
  }

  protected get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  protected get remainingCapacity(): number | undefined {
    return this.maxFiles > 0 ? Math.max(0, this.maxFiles - this.uploadItems.length) : undefined
  }

  protected get canAddMore(): boolean {
    if (!this.multiple) return this.uploadItems.length === 0
    return this.remainingCapacity === undefined || this.remainingCapacity > 0
  }

  protected get pickerDisabled(): boolean {
    return this.effectiveDisabled || !this.canAddMore
  }

  /** Opens the native file browser. */
  browse(): void {
    if (!this.pickerDisabled) this.input.click()
  }

  /** Validates and adds files supplied by the browser, drag-and-drop or application code. */
  addFiles(files: Iterable<File>): UploadItem[] {
    if (this.effectiveDisabled) return []
    const incoming = [...files]
    const accepted: UploadItem[] = []
    const rejected: UploadRejection[] = []
    const available = this.maxFiles > 0 ? Math.max(0, this.maxFiles - this.uploadItems.length) : Number.POSITIVE_INFINITY

    incoming.forEach((file, index) => {
      let reason: UploadRejectionReason | undefined
      if (!this.multiple && (this.uploadItems.length > 0 || index > 0)) reason = 'multiple'
      else if (accepted.length >= available) reason = 'limit'
      else if (!this.accepts(file)) reason = 'type'
      else if (this.maxSize > 0 && file.size > this.maxSize) reason = 'size'

      if (reason) rejected.push({ file, reason, message: this.rejectionMessage(reason, file) })
      else accepted.push(this.createItem(file))
    })

    this.enqueue(accepted, rejected)
    return accepted
  }

  /** The message shown for a rejected file. Companions with a message catalog of their own translate it. */
  protected rejectionMessage(reason: UploadRejectionReason, file: File): string {
    if (reason === 'multiple') return 'Only one file can be selected.'
    if (reason === 'limit') return `A maximum of ${this.maxFiles} files is allowed.`
    if (reason === 'type') return `${file.name} is not an accepted file type.`
    return `${file.name} exceeds the ${this.formatBytes(this.maxSize)} size limit.`
  }

  /** The form-data name a queued file is appended under. */
  protected formEntryName(_item: UploadItem): string {
    return this.name
  }

  /** Adds validated items to the queue and reports them and the rejected files, as `addFiles` does after validating. */
  protected enqueue(accepted: UploadItem[], rejected: UploadRejection[]): void {
    if (accepted.length) {
      this.uploadItems = [...this.uploadItems, ...accepted]
      this.emit('files-selected', { files: accepted.map((item) => item.file), items: accepted })
      this.notifyValueChange()
      if (this.autoUpload && this.uploadHandler) void Promise.all(accepted.map((item) => this.runUpload(item.id)))
    }
    this.rejections = rejected
    if (rejected.length) this.emit('file-reject', { rejections: rejected })
  }

  /** Upload every ready/error item, or one item by id. */
  async upload(id?: string): Promise<void> {
    if (!this.uploadHandler || this.effectiveDisabled) return
    const items = this.uploadItems.filter((item) => (!id || item.id === id) && item.status !== 'uploading' && item.status !== 'complete')
    await Promise.all(items.map((item) => this.runUpload(item.id)))
  }

  /** Retry a failed or ready item. */
  async retry(id: string): Promise<void> {
    await this.upload(id)
  }

  /** Cancels an active upload and removes its attachment. */
  removeFile(id: string): void {
    const item = this.uploadItems.find((candidate) => candidate.id === id)
    if (!item || this.effectiveDisabled) return
    this.controllers.get(id)?.abort()
    this.controllers.delete(id)
    this.revokePreview(item)
    this.uploadItems = this.uploadItems.filter((candidate) => candidate.id !== id)
    this.emit('upload-remove', { item })
    this.notifyValueChange()
  }

  /** Cancels and removes every queued file. */
  clear(): void {
    this.resetQueue(true)
  }

  private resetQueue(notify: boolean): void {
    const removedItems = this.uploadItems
    for (const controller of this.controllers.values()) controller.abort()
    this.controllers.clear()
    for (const item of this.uploadItems) this.revokePreview(item)
    this.uploadItems = []
    this.rejections = []
    if (this.input) this.input.value = ''
    if (notify && removedItems.length) {
      for (const item of removedItems) this.emit('upload-remove', { item })
      this.notifyValueChange()
    }
  }

  protected notifyValueChange(): void {
    this.syncFormState()
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  protected emit<K extends keyof UploadEventMap>(type: K, detail: UploadEventMap[K] extends CustomEvent<infer D> ? D : never): void {
    const event = new CustomEvent(type, { detail, bubbles: true, composed: true })
    this.dispatchEvent(event)
  }

  protected createItem(file: File, target?: string): UploadItem {
    return {
      id: `upload-${++uploadItemId}`,
      file,
      ...(target === undefined ? {} : { target }),
      status: 'ready',
      progress: 0,
      previewUrl: file.type.startsWith('image/') && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : undefined,
    }
  }

  private updateItem(id: string, update: Partial<UploadItem>): UploadItem | undefined {
    let updated: UploadItem | undefined
    this.uploadItems = this.uploadItems.map((item) => {
      if (item.id !== id) return item
      updated = { ...item, ...update }
      return updated
    })
    return updated
  }

  private async runUpload(id: string): Promise<void> {
    const current = this.uploadItems.find((item) => item.id === id)
    if (!current || !this.uploadHandler || this.effectiveDisabled) return
    const previous = this.controllers.get(id)
    previous?.abort()
    const controller = new AbortController()
    this.controllers.set(id, controller)
    const started = this.updateItem(id, { status: 'uploading', progress: 0, error: undefined })
    if (!started) return
    this.emit('upload-start', { item: started })

    try {
      const result = await this.uploadHandler(current.file, {
        signal: controller.signal,
        ...(current.target === undefined ? {} : { target: current.target }),
        onProgress: (progress) => {
          if (controller.signal.aborted) return
          const safeProgress = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0))
          const item = this.updateItem(id, { progress: safeProgress })
          if (item) this.emit('upload-progress', { item, progress: safeProgress })
        },
      })
      if (controller.signal.aborted || !this.uploadItems.some((item) => item.id === id)) return
      const completed = this.updateItem(id, { status: 'complete', progress: 100, result, error: undefined })
      if (completed) this.emit('upload-success', { item: completed, result })
    } catch (error) {
      if (controller.signal.aborted || !this.uploadItems.some((item) => item.id === id)) return
      const failed = this.updateItem(id, { status: 'error', error })
      if (failed) this.emit('upload-error', { item: failed, error })
    } finally {
      if (this.controllers.get(id) === controller) this.controllers.delete(id)
    }
  }

  protected accepts(file: File, accept = this.accept): boolean {
    const rules = accept
      .split(',')
      .map((rule) => rule.trim().toLowerCase())
      .filter(Boolean)
    if (!rules.length) return true
    const name = file.name.toLowerCase()
    const type = file.type.toLowerCase()
    return rules.some((rule) => {
      if (rule.startsWith('.')) return name.endsWith(rule)
      if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1))
      return type === rule
    })
  }

  protected formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
  }

  protected revokePreview(item: UploadItem): void {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl)
  }

  protected handleInputChange(event: Event): void {
    event.stopPropagation()
    const input = event.currentTarget as HTMLInputElement
    if (input.files) this.addFiles(input.files)
    input.value = ''
  }

  protected stopNativeInput(event: Event): void {
    event.stopPropagation()
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    this.browse()
  }

  protected handleDragEnter(event: DragEvent): void {
    event.preventDefault()
    if (this.pickerDisabled || !event.dataTransfer?.types.includes('Files')) return
    this.dragDepth += 1
    this.dragging = true
  }

  protected handleDragOver(event: DragEvent): void {
    if (this.pickerDisabled) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  }

  protected handleDragLeave(event: DragEvent): void {
    event.preventDefault()
    this.dragDepth = Math.max(0, this.dragDepth - 1)
    if (this.dragDepth === 0) this.dragging = false
  }

  protected handleDrop(event: DragEvent): void {
    event.preventDefault()
    this.dragDepth = 0
    this.dragging = false
    if (this.pickerDisabled || !event.dataTransfer?.files) return
    this.addFiles(event.dataTransfer.files)
  }

  private syncFormState(): void {
    if (this.effectiveDisabled || !this.name || this.uploadItems.length === 0) this.internals.setFormValue(null)
    else {
      const data = new FormData()
      for (const item of this.uploadItems) data.append(this.formEntryName(item), item.file, item.file.name)
      this.internals.setFormValue(data)
    }
    const missing = this.valueMissing
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.valueMissingText : '')
    const anchor = (this.renderRoot?.querySelector('.picker') as HTMLElement | null | undefined) ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  /** Whether `required` is unmet. Companions with several upload targets redefine what a complete value is. */
  protected get valueMissing(): boolean {
    return this.required && this.uploadItems.length === 0
  }

  /** The validation message while `valueMissing`. */
  protected get valueMissingText(): string {
    return this.msg.t('valueMissing')
  }

  protected renderIcon() {
    return svg`<svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 16l-4-4-4 4M12 12v9"></path><path d="M20.4 17.5A5 5 0 0 0 18 8.2 7 7 0 0 0 4.3 10.8 4.5 4.5 0 0 0 5.5 19H7"></path></svg>`
  }

  private get defaultHint(): string {
    const parts: string[] = []
    if (this.accept) parts.push(this.accept)
    if (this.maxSize > 0) parts.push(`up to ${this.formatBytes(this.maxSize)}`)
    if (this.multiple && this.uploadItems.length > 0 && this.remainingCapacity !== undefined) {
      parts.push(`${this.remainingCapacity} file${this.remainingCapacity === 1 ? '' : 's'} remaining`)
    } else if (this.maxFiles > 0) parts.push(`${this.maxFiles} file${this.maxFiles === 1 ? '' : 's'} maximum`)
    return parts.join(' · ') || (this.multiple ? 'Select one or more files' : 'Select one file')
  }

  private get defaultActionLabel(): string {
    if (!this.multiple || this.uploadItems.length === 0) return this.multiple ? 'Upload files' : 'Upload file'
    return this.remainingCapacity === undefined ? 'Upload more' : `Upload more (${this.remainingCapacity} remaining)`
  }

  protected renderPicker() {
    if (!this.canAddMore) return nothing
    if (this.variant === 'compact') {
      return html`
        <c2-button class="picker compact-button" ?disabled=${this.effectiveDisabled} @click=${this.browse}>
          <span part="drop-icon" class="compact-icon" slot="prefix-icon"><slot name="drop-icon">${this.renderIcon()}</slot></span>
          <slot part="action" name="action">${this.defaultActionLabel}</slot>
        </c2-button>
      `
    }
    return html`
      <div
        part="dropzone"
        class=${classMap({ picker: true, dropzone: true, 'dropzone--dragging': this.dragging })}
        role="button"
        tabindex=${this.effectiveDisabled ? -1 : 0}
        aria-label=${this.ariaLabel || this.field.label || this.msg.t('label')}
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${this.field.invalid ? 'true' : nothing}
        aria-disabled=${this.effectiveDisabled ? 'true' : 'false'}
        @click=${this.browse}
        @keydown=${this.handleKeydown}
        @dragenter=${this.handleDragEnter}
        @dragover=${this.handleDragOver}
        @dragleave=${this.handleDragLeave}
        @drop=${this.handleDrop}
      >
        <slot part="drop-icon" name="drop-icon">${this.renderIcon()}</slot>
        <div part="prompt" class="prompt">
          <slot name="prompt">
            ${
              this.multiple && this.uploadItems.length
                ? html`Drop more files here or <span class="action">upload more</span>`
                : html`Drop files here or <span class="action">browse</span>`
            }
          </slot>
        </div>
        <div part="hint" class="hint"><slot name="hint">${this.defaultHint}</slot></div>
      </div>
    `
  }

  protected renderInput() {
    return html`
      <input
        type="file"
        tabindex="-1"
        aria-label=${this.ariaLabel || this.field.label || this.msg.t('label')}
        .accept=${this.accept}
        ?multiple=${this.multiple}
        ?disabled=${this.pickerDisabled}
        @input=${this.stopNativeInput}
        @change=${this.handleInputChange}
      />
    `
  }

  protected renderErrors() {
    return this.rejections.length
      ? html`<div part="errors" class="errors" role="status">${this.rejections.map((rejection) => html`<div>${rejection.message}</div>`)}</div>`
      : nothing
  }

  protected renderQueue() {
    return this.uploadItems.length
      ? html`<div part="list" class=${classMap({ list: true, 'list--standalone': !this.canAddMore })} role="list" aria-label=${this.msg.t('selectedFiles')}>
          ${this.uploadItems.map(
            (item) => html`
              <c2-attachment
                role="listitem"
                layout="row"
                .name=${item.file.name}
                .type=${item.file.type || undefined}
                .size=${this.formatBytes(item.file.size)}
                .src=${item.previewUrl}
                .status=${item.status}
                .progress=${item.progress}
                removable
                ?disabled=${this.effectiveDisabled}
                @attachment-remove=${() => this.removeFile(item.id)}
                @attachment-retry=${() => void this.retry(item.id)}
              ></c2-attachment>
            `,
          )}
        </div>`
      : html`<slot part="empty" name="empty"></slot>`
  }

  override render() {
    return html`${this.renderInput()} ${this.renderPicker()} ${this.renderErrors()} ${this.renderQueue()} ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-upload': Upload
  }
}
