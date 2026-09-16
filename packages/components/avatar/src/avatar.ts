import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import styles from './avatar.scss?inline'

export type AvatarStatus = 'online' | 'away' | 'busy' | 'offline'

export interface AvatarChangeDetail {
  file: File
  previewUrl: string
}

export interface AvatarRemoveDetail {
  file?: File
  previousSrc?: string
}

export interface AvatarFileRejection {
  file: File
  reason: 'type' | 'size'
  message: string
}

const LEGACY_COUNT_ATTRIBUTE = 'initialcount'

/** Events fired by {@link Avatar}, keyed for `addEventListener`. */
export interface AvatarEventMap {
  error: Event
  'avatar-change': CustomEvent<AvatarChangeDetail>
  'avatar-remove': CustomEvent<AvatarRemoveDetail>
  'file-reject': CustomEvent<AvatarFileRejection>
}

export interface Avatar {
  addEventListener: TypedAddEventListener<Avatar, AvatarEventMap>
  removeEventListener: TypedRemoveEventListener<Avatar, AvatarEventMap>
}

/**
 * Shows a person or entity as an image, initials or any slotted content, with an optional status dot or badge.
 *
 * Resolution order: the `src` image (falling back to initials if it fails to load), then slotted content, then the
 * initials computed from `name`. Set `auto-color` to derive a stable background hue from the name.
 *
 * @tag c2-avatar
 *
 * @slot - Custom content shown instead of the initials (an icon, an emoji, an `<img>`).
 * @slot badge - Small element pinned to the bottom-right corner (a count, an icon). Replaces the `status` dot.
 * @slot edit-icon - Icon shown over an editable avatar. Defaults to a camera.
 * @slot remove-icon - Icon shown in the remove action. Defaults to a close mark.
 *
 * @event {Event} error - Fired when the `src` image fails to load; the initials are shown instead.
 * @event {CustomEvent<AvatarChangeDetail>} avatar-change - Fired after an editable avatar accepts a local image. Upload `detail.file` and use `detail.previewUrl` for the immediate preview.
 * @event {CustomEvent<AvatarRemoveDetail>} avatar-remove - Fired after the current local preview or `src` image is removed.
 * @event {CustomEvent<AvatarFileRejection>} file-reject - Fired when an editable avatar rejects a file by type or size.
 *
 * @cssproperty {pixel} [--c2-avatar--size=32px]
 * @cssproperty {pixel} --c2-avatar--width - Falls back to `--c2-avatar--size`.
 * @cssproperty {pixel} --c2-avatar--height - Falls back to `--c2-avatar--size`.
 * @cssproperty {color} [--c2-avatar--color=#ffffff]
 * @cssproperty {background} [--c2-avatar--background=rgb(0, 122, 77)] - Ignored when `auto-color` is set.
 * @cssproperty {box-shadow} --c2-avatar--box-shadow - e.g. `0 0 0 2px #fff` for a ring in stacked groups.
 *
 * @cssproperty {border-radius} [--c2-avatar--border-top-left-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-top-right-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-bottom-left-radius=999px]
 * @cssproperty {border-radius} [--c2-avatar--border-bottom-right-radius=999px]
 *
 * @cssproperty {border} --c2-avatar--border-top
 * @cssproperty {border} --c2-avatar--border-bottom
 * @cssproperty {border} --c2-avatar--border-right
 * @cssproperty {border} --c2-avatar--border-left
 *
 * @cssproperty {font-size} [--c2-avatar--font-size=calc(var(--c2-avatar--size) * 0.4)]
 * @cssproperty {font-weight} [--c2-avatar--font-weight=600]
 * @cssproperty {font-style} --c2-avatar--font-style
 * @cssproperty {font-family} --c2-avatar--font-family
 * @cssproperty {letter-spacing} [--c2-avatar--letter-spacing=0.02em]
 *
 * @cssproperty {saturation} [--c2-avatar__auto-color--saturation=55%] - Saturation of the hue derived from the name.
 * @cssproperty {lightness} [--c2-avatar__auto-color--lightness=42%] - Lightness of the hue derived from the name.
 *
 * @cssproperty {object-fit} [--c2-avatar__image--object-fit=cover]
 * @cssproperty {color} [--c2-avatar__editor--background=rgba(0, 0, 0, 0.5)]
 * @cssproperty {color} [--c2-avatar__editor--color=#ffffff]
 * @cssproperty {outline} [--c2-avatar__editor__focus--outline=2px solid rgba(2, 101, 220, 0.45)]
 * @cssproperty {pixel} [--c2-avatar__editor__focus--outline-offset=2px]
 * @cssproperty {pixel} [--c2-avatar__editor-icon--size=18px]
 * @cssproperty {pixel} [--c2-avatar__remove--size=22px]
 * @cssproperty {color} [--c2-avatar__remove--background=#ffffff]
 * @cssproperty {color} [--c2-avatar__remove--color=#52525b]
 * @cssproperty {border} [--c2-avatar__remove--border=1px solid #e4e4e7]
 * @cssproperty {box-shadow} [--c2-avatar__remove--box-shadow=0 1px 3px rgba(0, 0, 0, 0.18)]
 *
 * @cssproperty {pixel} [--c2-avatar__badge--size=10px] - Diameter of the status dot; slotted badges size themselves.
 * @cssproperty {border} [--c2-avatar__badge--border=2px solid #ffffff] - Ring separating the badge from the avatar.
 * @cssproperty {pixel} [--c2-avatar__badge--offset=0px] - Positive values push the badge outwards.
 * @cssproperty {color} [--c2-avatar__badge__online--color=rgb(34, 197, 94)]
 * @cssproperty {color} [--c2-avatar__badge__away--color=rgb(245, 158, 11)]
 * @cssproperty {color} [--c2-avatar__badge__busy--color=rgb(239, 68, 68)]
 * @cssproperty {color} [--c2-avatar__badge__offline--color=rgb(161, 161, 170)]
 */
@customElement('c2-avatar')
export class Avatar extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Full name: source of the initials, the accessible label and the `auto-color` hue. */
  @property() name = ''

  /** Number of initials to show. With 2 and a name of three or more words, the first and last word are used. */
  @property({ type: Number, attribute: 'initial-count' }) initialCount = 1

  /** Explicit initials; overrides the ones computed from `name`. */
  @property() initials: string | undefined = undefined

  /** Image URL. Falls back to the initials when the image fails to load. */
  @property() src: string | undefined = undefined

  /** Image alt text; defaults to `name`. */
  @property() alt: string | undefined = undefined

  /** Derive a stable background hue from `name` (same name, same color). */
  @property({ type: Boolean, reflect: true, attribute: 'auto-color' }) autoColor = false

  /** Presence dot in the bottom-right corner. */
  @property({ reflect: true }) status: AvatarStatus | undefined = undefined

  /** Allows the avatar to open an image picker and exposes a remove action for the current image. */
  @property({ type: Boolean, reflect: true }) editable = false

  /** Disables editable avatar actions. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Accepted image MIME types or file extensions, using native file-input syntax. */
  @property() accept = 'image/*'

  /** Maximum accepted image size in bytes. Zero means unlimited. */
  @property({ type: Number, attribute: 'max-size' }) maxSize = 0

  @state() private imageFailed = false
  @state() private previewUrl: string | undefined = undefined
  private selectedFile: File | undefined
  @query('input', true) private input!: HTMLInputElement

  /** Accepts the pre-1.0 camelCase `initialCount="2"` attribute as well. */
  static override get observedAttributes() {
    return [...super.observedAttributes, LEGACY_COUNT_ATTRIBUTE]
  }

  override attributeChangedCallback(name: string, old: string | null, value: string | null) {
    if (name === LEGACY_COUNT_ATTRIBUTE) {
      if (value !== null) this.initialCount = Number(value) || 1
      return
    }
    super.attributeChangedCallback(name, old, value)
  }

  /** Initials shown when there is no image or slotted content. */
  get initial(): string {
    if (this.initials) return this.initials
    const words = this.name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    const picked = this.initialCount === 2 && words.length > 2 ? [words[0], words[words.length - 1]] : words.slice(0, Math.max(1, this.initialCount))
    return picked
      .map((w) => w.charAt(0))
      .join('')
      .toUpperCase()
  }

  /** Hue (0–359) derived from the name, used by `auto-color`. */
  get hue(): number {
    // FNV-1a: cheap and spreads similar names across the wheel far better than a plain `hash * 31` sum.
    let hash = 0x811c9dc5
    for (const char of this.name) hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193)
    return (hash >>> 0) % 360
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('src')) {
      this.imageFailed = false
      if (this.previewUrl) {
        this.revokePreview()
        this.selectedFile = undefined
      }
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.revokePreview()
  }

  override connectedCallback(): void {
    super.connectedCallback()
    if (this.selectedFile && !this.previewUrl) this.previewUrl = URL.createObjectURL(this.selectedFile)
  }

  /** Locally selected image file, if the avatar was changed through its picker. */
  get file(): File | undefined {
    return this.selectedFile
  }

  /** Opens the avatar image picker. */
  browse(): void {
    if (this.editable && !this.disabled) this.input.click()
  }

  /** Clears the selected preview and the current `src` image. */
  removeImage(): void {
    if (this.disabled || (!this.previewUrl && !this.src)) return
    const detail: AvatarRemoveDetail = { file: this.selectedFile, previousSrc: this.previewUrl ?? this.src }
    this.revokePreview()
    this.selectedFile = undefined
    this.removeAttribute('src')
    this.src = undefined
    this.imageFailed = false
    if (this.input) this.input.value = ''
    this.dispatchEvent(new CustomEvent('avatar-remove', { detail, bubbles: true, composed: true }))
  }

  private handleImageError() {
    this.imageFailed = true
    this.dispatchEvent(new Event('error'))
  }

  private handleFileChange(event: Event): void {
    event.stopPropagation()
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const rejection = this.validateFile(file)
    if (rejection) {
      this.dispatchEvent(new CustomEvent('file-reject', { detail: rejection, bubbles: true, composed: true }))
      return
    }
    this.revokePreview()
    this.selectedFile = file
    this.previewUrl = URL.createObjectURL(file)
    this.imageFailed = false
    this.dispatchEvent(new CustomEvent('avatar-change', { detail: { file, previewUrl: this.previewUrl }, bubbles: true, composed: true }))
  }

  private stopNativeInput(event: Event): void {
    event.stopPropagation()
  }

  private validateFile(file: File): AvatarFileRejection | undefined {
    const rules = this.accept
      .split(',')
      .map((rule) => rule.trim().toLowerCase())
      .filter(Boolean)
    const name = file.name.toLowerCase()
    const type = file.type.toLowerCase()
    const accepted =
      rules.length === 0 ||
      rules.some((rule) => (rule.startsWith('.') ? name.endsWith(rule) : rule.endsWith('/*') ? type.startsWith(rule.slice(0, -1)) : type === rule))
    if (!accepted) return { file, reason: 'type', message: `${file.name} is not an accepted image type.` }
    if (this.maxSize > 0 && file.size > this.maxSize) return { file, reason: 'size', message: `${file.name} exceeds the avatar size limit.` }
    return undefined
  }

  private revokePreview(): void {
    if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    this.previewUrl = undefined
  }

  private renderVisual(source: string | undefined, interactive: boolean) {
    const showImage = !!source && !this.imageFailed
    const label = this.alt ?? this.name
    return html`
      <div
        class=${classMap({ 'c2-avatar': true, 'has-image': showImage })}
        style=${this.autoColor ? `--c2-avatar--hue: ${this.hue}` : nothing}
        role=${interactive ? nothing : 'img'}
        aria-label=${interactive ? nothing : label || nothing}
        aria-hidden=${interactive ? 'true' : nothing}
      >
        ${
          showImage
            ? html`<img
                class="c2-avatar-image"
                src=${source}
                alt=${interactive ? '' : ifDefined(this.alt ?? (this.name || undefined))}
                loading="lazy"
                @error=${this.handleImageError}
              />`
            : html`<slot>${this.initial}</slot>`
        }
      </div>
    `
  }

  override render() {
    const source = this.previewUrl ?? this.src
    const showImage = !!source && !this.imageFailed
    const subject = this.name ? `${this.name} avatar` : 'avatar'
    return html`
      <input
        type="file"
        tabindex="-1"
        .accept=${this.accept}
        ?disabled=${!this.editable || this.disabled}
        aria-label=${`${subject} image file`}
        @input=${this.stopNativeInput}
        @change=${this.handleFileChange}
      />
      ${
        this.editable
          ? html`<button
              type="button"
              class="avatar-trigger"
              ?disabled=${this.disabled}
              aria-label=${showImage ? `Change ${subject}` : `Upload ${subject}`}
              @click=${this.browse}
            >
              ${this.renderVisual(source, true)}
              <span class="edit-overlay" aria-hidden="true">
                <slot name="edit-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-1.5-2z"></path>
                    <circle cx="12" cy="13" r="3"></circle>
                  </svg>
                </slot>
              </span>
            </button>`
          : this.renderVisual(source, false)
      }
      <slot name="badge" class="c2-avatar-badge"> ${this.status ? html`<span class="c2-avatar-status" aria-label=${this.status}></span>` : nothing} </slot>
      ${
        this.editable && showImage
          ? html`<button type="button" class="remove-action" ?disabled=${this.disabled} aria-label=${`Remove ${subject}`} @click=${this.removeImage}>
              <slot name="remove-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>
              </slot>
            </button>`
          : nothing
      }
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-avatar': Avatar
  }
}
