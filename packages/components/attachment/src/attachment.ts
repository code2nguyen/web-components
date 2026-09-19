import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import '@c2n/phosphor-icons/icons/file.js'
import '@c2n/phosphor-icons/icons/file-archive.js'
import '@c2n/phosphor-icons/icons/file-audio.js'
import '@c2n/phosphor-icons/icons/file-code.js'
import '@c2n/phosphor-icons/icons/file-css.js'
import '@c2n/phosphor-icons/icons/file-csv.js'
import '@c2n/phosphor-icons/icons/file-doc.js'
import '@c2n/phosphor-icons/icons/file-html.js'
import '@c2n/phosphor-icons/icons/file-image.js'
import '@c2n/phosphor-icons/icons/file-jpg.js'
import '@c2n/phosphor-icons/icons/file-js.js'
import '@c2n/phosphor-icons/icons/file-jsx.js'
import '@c2n/phosphor-icons/icons/file-md.js'
import '@c2n/phosphor-icons/icons/file-pdf.js'
import '@c2n/phosphor-icons/icons/file-png.js'
import '@c2n/phosphor-icons/icons/file-ppt.js'
import '@c2n/phosphor-icons/icons/file-py.js'
import '@c2n/phosphor-icons/icons/file-sql.js'
import '@c2n/phosphor-icons/icons/file-svg.js'
import '@c2n/phosphor-icons/icons/file-ts.js'
import '@c2n/phosphor-icons/icons/file-tsx.js'
import '@c2n/phosphor-icons/icons/file-txt.js'
import '@c2n/phosphor-icons/icons/file-video.js'
import '@c2n/phosphor-icons/icons/file-vue.js'
import '@c2n/phosphor-icons/icons/file-xls.js'
import '@c2n/phosphor-icons/icons/file-zip.js'
import styles from './attachment.scss?inline'

export { AttachmentGroup, type AttachmentGroupLayout } from './attachment-group.js'

export type AttachmentStatus = 'ready' | 'uploading' | 'complete' | 'error'
export type AttachmentLayout = 'auto' | 'row' | 'tile'

/** Events fired by {@link Attachment}, keyed for `addEventListener`. */
export interface AttachmentEventMap {
  'attachment-remove': CustomEvent<{ name: string }>
  'attachment-retry': CustomEvent<{ name: string }>
  'media-error': Event
}

export interface Attachment {
  addEventListener: TypedAddEventListener<Attachment, AttachmentEventMap>
  removeEventListener: TypedRemoveEventListener<Attachment, AttachmentEventMap>
}

/**
 * Displays a file or image attachment with a preview, metadata, upload state and optional actions.
 *
 * @tag c2-attachment
 *
 * @slot media - Custom thumbnail or file icon. Replaces the image supplied through `src`.
 * @slot name - Custom file name. Falls back to the `name` attribute.
 * @slot metadata - Custom metadata. Falls back to the `type` and `size` attributes.
 * @slot actions - Custom controls shown at the end. Replaces the built-in retry and remove buttons.
 *
 * @event {CustomEvent<{ name: string }>} attachment-remove - Fired when the remove or cancel action is pressed.
 * @event {CustomEvent<{ name: string }>} attachment-retry - Fired when retry is pressed for a failed upload.
 * @event {Event} media-error - Fired when the image preview cannot be loaded; the file fallback is shown.
 *
 * @cssproperty {pixel} [--c2-attachment--min-height=76px]
 * @cssproperty {pixel} [--c2-attachment--gap=12px]
 * @cssproperty {padding} [--c2-attachment--padding=10px 12px]
 * @cssproperty {color} [--c2-attachment--background=#ffffff]
 * @cssproperty {border} [--c2-attachment--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-attachment--border-radius=14px]
 * @cssproperty {box-shadow} --c2-attachment--box-shadow
 * @cssproperty {color} [--c2-attachment--color=#18181b]
 * @cssproperty {pixel} [--c2-attachment__media--size=48px]
 * @cssproperty {color} [--c2-attachment__media--background=#f4f4f5]
 * @cssproperty {color} [--c2-attachment__media--color=#71717a]
 * @cssproperty {border-radius} [--c2-attachment__media--border-radius=10px]
 * @cssproperty {object-fit} [--c2-attachment__media--object-fit=cover]
 * @cssproperty {pixel} [--c2-attachment__tile--width=220px]
 * @cssproperty {ratio} [--c2-attachment__tile--media-aspect-ratio=1]
 * @cssproperty {font-size} [--c2-attachment__name--font-size=14px]
 * @cssproperty {font-weight} [--c2-attachment__name--font-weight=500]
 * @cssproperty {color} [--c2-attachment__metadata--color=#71717a]
 * @cssproperty {font-size} [--c2-attachment__metadata--font-size=12px]
 * @cssproperty {color} [--c2-attachment__status--color=#71717a]
 * @cssproperty {color} [--c2-attachment__status__complete--color=rgb(0, 122, 77)]
 * @cssproperty {color} [--c2-attachment__status__error--color=#dc2626]
 * @cssproperty {color} [--c2-attachment__progress--background=#e4e4e7]
 * @cssproperty {color} [--c2-attachment__progress--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-attachment__action--size=28px]
 * @cssproperty {color} [--c2-attachment__action--color=#71717a]
 * @cssproperty {color} [--c2-attachment__action__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-attachment__action__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-attachment__disabled--opacity=0.38]
 */
@customElement('c2-attachment')
export class Attachment extends LitElement {
  static override styles = unsafeCSS(styles)

  /** File name shown as the primary label. */
  @property() name = ''

  /** Image preview URL. Omit it to show the generic file preview. */
  @property({ reflect: true }) src: string | undefined = undefined

  /** Accessible description for the image preview. Defaults to the file name. */
  @property() alt: string | undefined = undefined

  /** File type or extension shown in the metadata row. */
  @property() type: string | undefined = undefined

  /** Human-readable file size, for example `2.4 MB`. */
  @property() size: string | undefined = undefined

  /** Current upload state. */
  @property({ reflect: true }) status: 'ready' | 'uploading' | 'complete' | 'error' = 'ready'

  /** Auto uses a tile for image previews and a row for files. */
  @property({ reflect: true }) layout: 'auto' | 'row' | 'tile' = 'auto'

  /** Upload completion percentage. Values are clamped between 0 and 100. */
  @property({ type: Number }) progress = 0

  /** Show the built-in remove action. During upload it is announced as cancel. */
  @property({ type: Boolean, reflect: true }) removable = false

  /** Disable built-in actions and dim the attachment. */
  @property({ type: Boolean, reflect: true }) disabled = false

  @state() private imageFailed = false

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('src')) this.imageFailed = false
  }

  private get safeProgress() {
    return Math.min(100, Math.max(0, Number.isFinite(this.progress) ? this.progress : 0))
  }

  private emitRemove() {
    this.dispatchEvent(new CustomEvent('attachment-remove', { detail: { name: this.name }, bubbles: true, composed: true }))
  }

  private emitRetry() {
    this.dispatchEvent(new CustomEvent('attachment-retry', { detail: { name: this.name }, bubbles: true, composed: true }))
  }

  private handleImageError() {
    this.imageFailed = true
    this.dispatchEvent(new Event('media-error'))
  }

  private get fileIcon() {
    const extension = this.name.split('.').pop()?.toLowerCase() ?? ''
    const kind = `${this.type ?? ''} ${extension}`.toLowerCase()

    if (/\bzip\b/.test(kind)) return 'zip'
    if (/\b(7z|rar|tar|gz|gzip|archive)\b/.test(kind)) return 'archive'
    if (/\btsx\b/.test(kind)) return 'tsx'
    if (/\b(ts|typescript)\b/.test(kind)) return 'ts'
    if (/\bjsx\b/.test(kind)) return 'jsx'
    if (/\b(js|javascript)\b/.test(kind)) return 'js'
    if (/\b(html|htm)\b/.test(kind)) return 'html'
    if (/\bcss\b/.test(kind)) return 'css'
    if (/\bvue\b/.test(kind)) return 'vue'
    if (/\b(py|python)\b/.test(kind)) return 'py'
    if (/\bsql\b/.test(kind)) return 'sql'
    if (/\bpdf\b/.test(kind)) return 'pdf'
    if (/\bcsv\b/.test(kind)) return 'csv'
    if (/\b(doc|docx|word)\b/.test(kind)) return 'doc'
    if (/\b(xls|xlsx|spreadsheet|excel)\b/.test(kind)) return 'xls'
    if (/\b(ppt|pptx|presentation|powerpoint)\b/.test(kind)) return 'ppt'
    if (/\b(md|markdown)\b/.test(kind)) return 'md'
    if (/\b(txt|text)\b/.test(kind)) return 'txt'
    if (/\bpng\b/.test(kind)) return 'png'
    if (/\b(jpg|jpeg)\b/.test(kind)) return 'jpg'
    if (/\bsvg\b/.test(kind)) return 'svg'
    if (/\b(image|gif|webp|avif|bmp|tiff)\b/.test(kind)) return 'image'
    if (/\b(audio|mp3|wav|ogg|flac|m4a)\b/.test(kind)) return 'audio'
    if (/\b(video|mp4|mov|webm|avi|mkv)\b/.test(kind)) return 'video'
    if (/\b(code|json|xml|yaml|yml|toml)\b/.test(kind)) return 'code'
    return 'file'
  }

  private renderFileIcon() {
    switch (this.fileIcon) {
      case 'zip':
        return html`<c2-phosphor-file-zip class="file-icon" aria-hidden="true"></c2-phosphor-file-zip>`
      case 'archive':
        return html`<c2-phosphor-file-archive class="file-icon" aria-hidden="true"></c2-phosphor-file-archive>`
      case 'audio':
        return html`<c2-phosphor-file-audio class="file-icon" aria-hidden="true"></c2-phosphor-file-audio>`
      case 'code':
        return html`<c2-phosphor-file-code class="file-icon" aria-hidden="true"></c2-phosphor-file-code>`
      case 'css':
        return html`<c2-phosphor-file-css class="file-icon" aria-hidden="true"></c2-phosphor-file-css>`
      case 'csv':
        return html`<c2-phosphor-file-csv class="file-icon" aria-hidden="true"></c2-phosphor-file-csv>`
      case 'doc':
        return html`<c2-phosphor-file-doc class="file-icon" aria-hidden="true"></c2-phosphor-file-doc>`
      case 'html':
        return html`<c2-phosphor-file-html class="file-icon" aria-hidden="true"></c2-phosphor-file-html>`
      case 'image':
        return html`<c2-phosphor-file-image class="file-icon" aria-hidden="true"></c2-phosphor-file-image>`
      case 'jpg':
        return html`<c2-phosphor-file-jpg class="file-icon" aria-hidden="true"></c2-phosphor-file-jpg>`
      case 'js':
        return html`<c2-phosphor-file-js class="file-icon" aria-hidden="true"></c2-phosphor-file-js>`
      case 'jsx':
        return html`<c2-phosphor-file-jsx class="file-icon" aria-hidden="true"></c2-phosphor-file-jsx>`
      case 'md':
        return html`<c2-phosphor-file-md class="file-icon" aria-hidden="true"></c2-phosphor-file-md>`
      case 'pdf':
        return html`<c2-phosphor-file-pdf class="file-icon" aria-hidden="true"></c2-phosphor-file-pdf>`
      case 'png':
        return html`<c2-phosphor-file-png class="file-icon" aria-hidden="true"></c2-phosphor-file-png>`
      case 'ppt':
        return html`<c2-phosphor-file-ppt class="file-icon" aria-hidden="true"></c2-phosphor-file-ppt>`
      case 'py':
        return html`<c2-phosphor-file-py class="file-icon" aria-hidden="true"></c2-phosphor-file-py>`
      case 'sql':
        return html`<c2-phosphor-file-sql class="file-icon" aria-hidden="true"></c2-phosphor-file-sql>`
      case 'svg':
        return html`<c2-phosphor-file-svg class="file-icon" aria-hidden="true"></c2-phosphor-file-svg>`
      case 'ts':
        return html`<c2-phosphor-file-ts class="file-icon" aria-hidden="true"></c2-phosphor-file-ts>`
      case 'tsx':
        return html`<c2-phosphor-file-tsx class="file-icon" aria-hidden="true"></c2-phosphor-file-tsx>`
      case 'txt':
        return html`<c2-phosphor-file-txt class="file-icon" aria-hidden="true"></c2-phosphor-file-txt>`
      case 'video':
        return html`<c2-phosphor-file-video class="file-icon" aria-hidden="true"></c2-phosphor-file-video>`
      case 'vue':
        return html`<c2-phosphor-file-vue class="file-icon" aria-hidden="true"></c2-phosphor-file-vue>`
      case 'xls':
        return html`<c2-phosphor-file-xls class="file-icon" aria-hidden="true"></c2-phosphor-file-xls>`
      default:
        return html`<c2-phosphor-file class="file-icon" aria-hidden="true"></c2-phosphor-file>`
    }
  }

  private renderMediaFallback() {
    if (this.status === 'uploading') {
      return html`
        <svg class="progress-ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="progress-track" cx="12" cy="12" r="9" pathLength="100" />
          <circle class="progress-value" cx="12" cy="12" r="9" pathLength="100" stroke-dasharray=${`${this.safeProgress} 100`} />
        </svg>
      `
    }
    return this.renderFileIcon()
  }

  private renderStatus() {
    if (this.status === 'uploading') {
      return html`
        <div class="status uploading">
          <progress class="visually-hidden" max="100" .value=${this.safeProgress} aria-label=${`Uploading ${this.name || 'attachment'}`}></progress>
          <span>Uploading · ${Math.round(this.safeProgress)}%</span>
        </div>
      `
    }
    if (this.status === 'complete') return html`<div class="status complete">Uploaded</div>`
    if (this.status === 'error') return html`<div class="status error" role="status">Upload failed</div>`
    return nothing
  }

  private renderActions() {
    if (this.status !== 'error' && !this.removable) return nothing
    return html`
      <div class="default-actions">
        ${
          this.status === 'error'
            ? html`<button type="button" aria-label=${`Retry ${this.name || 'attachment'}`} ?disabled=${this.disabled} @click=${this.emitRetry}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6v5h-5M4 18v-5h5M6.1 9a7 7 0 0 1 11.8-2.6L20 11M4 13l2.1 4.6A7 7 0 0 0 17.9 15" />
                </svg>
              </button>`
            : nothing
        }
        ${
          this.removable
            ? html`<button
                type="button"
                aria-label=${`${this.status === 'uploading' ? 'Cancel upload' : 'Remove'} ${this.name || 'attachment'}`}
                ?disabled=${this.disabled}
                @click=${this.emitRemove}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>`
            : nothing
        }
      </div>
    `
  }

  override render() {
    const showImage = !!this.src && !this.imageFailed
    const tile = this.layout === 'tile' || (this.layout === 'auto' && !!this.src)
    return html`
      <article class=${classMap({ attachment: true, 'has-image': showImage, tile })} aria-label=${this.name || nothing}>
        <div class="media">
          <slot name="media">
            ${showImage ? html`<img src=${this.src!} alt=${this.alt ?? this.name} loading="lazy" @error=${this.handleImageError} />` : this.renderMediaFallback()}
          </slot>
        </div>
        <div class="content">
          <div class="name"><slot name="name">${this.name || 'Untitled attachment'}</slot></div>
          ${
            this.status !== 'uploading' && (this.type || this.size)
              ? html`<div class="metadata">
                  <slot name="metadata"
                    >${this.type ? html`<span>${this.type}</span>` : nothing}${this.type && this.size ? html`<span aria-hidden="true">·</span>` : nothing}${this.size ? html`<span>${this.size}</span>` : nothing}</slot
                  >
                </div>`
              : html`<slot name="metadata"></slot>`
          }
          ${this.renderStatus()}
        </div>
        <div class="actions"><slot name="actions">${this.renderActions()}</slot></div>
      </article>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-attachment': Attachment
  }
}
