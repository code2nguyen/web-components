import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './image.scss?inline'

/** When the image is fetched: `lazy` near the viewport, `eager` at once, `click` only after the reader asks. */
export type ImageLoading = 'lazy' | 'eager' | 'click'

type ImageStatus = 'blocked' | 'loading' | 'loaded' | 'error'

/** Events fired by {@link Image}, keyed for `addEventListener`. */
export interface ImageEventMap {
  load: Event
  error: Event
  'load-request': CustomEvent<{ src: string }>
  'preview-open': CustomEvent<{ src: string }>
}

export interface Image {
  addEventListener: TypedAddEventListener<Image, ImageEventMap>
  removeEventListener: TypedRemoveEventListener<Image, ImageEventMap>
}

const imageIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <rect x="3" y="4" width="18" height="16" rx="2" />
  <circle cx="9" cy="10" r="1.8" />
  <path d="m21 16-5-5-9 9" />
</svg>`

const brokenIcon = html`<svg
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
  <circle cx="9" cy="10" r="1.8" />
  <path d="m21 11-4-4-6 6" />
  <path d="m16 17 5 5m0-5-5 5" />
</svg>`

function hostOf(src: string): string {
  try {
    return new URL(src, document.baseURI).host
  } catch {
    return ''
  }
}

/**
 * An image with the states every app re-implements: a placeholder (a shimmer, or a blurred `placeholder-src`) while
 * it loads, a fade to the loaded image, a fallback with the alternative text when it fails, and an optional
 * full-screen preview. `width` and `height` reserve the space before the image arrives, as on a native `<img>`.
 *
 * `loading="click"` makes no request at all until the reader activates the placeholder, which shows the alternative
 * text and the image's host. Use it for images whose URL you did not choose (an LLM answer, user content): an image
 * request is how a prompt injection exfiltrates data. Activation fires a cancelable `load-request` first, so an app can
 * confirm or rewrite `src` to a proxy.
 *
 * @tag c2-image
 *
 * @slot placeholder - Replaces the loading shimmer.
 * @slot fallback - Replaces the error state (icon and alternative text).
 * @slot load-label - Replaces the "Load image" label of the click-to-load placeholder.
 *
 * @csspart image - The native image element once it is requested.
 * @csspart placeholder - Loading surface region shown until the image has loaded, containing the `placeholder` slot or its shimmer fallback.
 * @csspart fallback - Error surface containing the `fallback` slot or the default icon and alternative text.
 * @csspart load-button - Click-to-load placeholder button containing the `load-label` slot, the alternative text and the host.
 *
 * @event {Event} load - The image has loaded (re-dispatched from the inner image).
 * @event {Event} error - The image failed to load (re-dispatched); the fallback shows.
 * @event {CustomEvent<{ src: string }>} load-request - Cancelable. The reader activated a click-to-load placeholder; cancel it to keep the image blocked.
 * @event {CustomEvent<{ src: string }>} preview-open - Cancelable. The reader opened the preview; cancel it to show your own viewer.
 *
 * @cssproperty {width} [--c2-image--width=auto] - Width of the image box. Defaults to the `width` attribute, capped at the container.
 * @cssproperty {aspect-ratio} [--c2-image--aspect-ratio=auto] - Overrides the ratio taken from `width` and `height`.
 * @cssproperty {object-fit} [--c2-image--object-fit=cover]
 * @cssproperty {border-radius} [--c2-image--border-radius=0]
 * @cssproperty {time} [--c2-image__enter--duration=200ms] - Fade from the placeholder to the loaded image.
 *
 * @cssproperty {background} [--c2-image__placeholder--background=#fafafa]
 * @cssproperty {color} [--c2-image__placeholder--color=#71717a]
 * @cssproperty {pixel} [--c2-image__placeholder--font-size=12px]
 * @cssproperty {pixel} [--c2-image__placeholder--min-height=120px] - Height of the placeholder, fallback and click-to-load surfaces when no ratio is known.
 * @cssproperty {pixel} [--c2-image__placeholder--min-width=200px]
 * @cssproperty {color} [--c2-image__shimmer--color=rgba(255, 255, 255, 0.6)]
 * @cssproperty {time} [--c2-image__shimmer--duration=1.2s]
 * @cssproperty {pixel} [--c2-image__blur--radius=16px] - Blur applied to `placeholder-src`.
 * @cssproperty {pixel} [--c2-image__icon--size=20px]
 *
 * @cssproperty {background} [--c2-image__fallback--background=#fafafa]
 * @cssproperty {color} [--c2-image__fallback--color=#71717a]
 *
 * @cssproperty {border} [--c2-image__load-button--border=1px dashed #bcbcc6]
 * @cssproperty {color} [--c2-image__load-button--color=#18181b]
 * @cssproperty {background} [--c2-image__load-button__hover--background=#e4e4e7]
 * @cssproperty {outline} [--c2-image__load-button__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {pixel} [--c2-image__preview--width=min(1080px, calc(100vw - 32px))] - Width of the preview dialog.
 * @cssproperty {outline} [--c2-image__preview__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 */
@customElement('c2-image')
export class Image extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Image URL. */
  @property() src = ''

  /** Candidate sources, passed to the inner image. */
  @property() srcset?: string

  /** Source sizes for `srcset`, passed to the inner image. */
  @property() sizes?: string

  /** Alternative text. Also the label of the placeholder and the fallback. */
  @property() alt = ''

  /** Intrinsic width in pixels: reserves the space and the ratio before the image loads. */
  @property({ type: Number }) width?: number

  /** Intrinsic height in pixels: reserves the ratio before the image loads. */
  @property({ type: Number }) height?: number

  /** `lazy` (default) fetches near the viewport, `eager` at once, `click` only after the reader activates the placeholder. */
  @property() loading: ImageLoading = 'lazy'

  /** Tiny preview shown blurred while loading. Under `loading="click"` only a `data:` URI is used, since it makes no request. */
  @property({ attribute: 'placeholder-src' }) placeholderSrc?: string

  /** Referrer policy of the request, passed to the inner image. */
  @property({ attribute: 'referrerpolicy' }) referrerPolicy?: ReferrerPolicy

  /** CORS mode of the request, passed to the inner image. */
  @property({ attribute: 'crossorigin' }) crossOrigin?: string

  /** Clicking the loaded image opens it full screen. */
  @property({ type: Boolean }) preview = false

  @state() private status: ImageStatus = 'loading'
  @state() private previewOpen = false
  @state() private previewReady = false

  private activated = false
  private activatedSrc = ''

  /** True once the image has loaded. */
  get complete(): boolean {
    return this.status === 'loaded'
  }

  /** Requests the image now, also under `loading="click"`, without firing `load-request`. */
  load(): void {
    this.activated = true
    this.activatedSrc = this.src
    if (this.status === 'blocked') this.status = 'loading'
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('src') && changed.get('src') !== undefined) {
      // A new image needs a new activation, unless the activation itself rewrote src (a proxy in load-request).
      if (this.src !== this.activatedSrc) this.activated = false
      this.status = 'loading'
    }
    if (this.loading === 'click' && !this.activated && this.status !== 'loaded') this.status = 'blocked'
    else if (this.status === 'blocked') this.status = 'loading'
  }

  protected override firstUpdated(): void {
    // A server-rendered image may have settled before this element upgraded.
    const image = this.renderRoot.querySelector<HTMLImageElement>('img.image')
    if (image?.complete && this.src) this.status = image.naturalWidth > 0 ? 'loaded' : 'error'
  }

  override render() {
    const ratio = this.width && this.height ? `${this.width} / ${this.height}` : undefined
    const frameStyle = styleMap({
      '--_intrinsic-ratio': ratio,
      '--_intrinsic-width': this.width ? `${this.width}px` : undefined,
    })
    const blocked = this.status === 'blocked'
    const lqip = this.placeholderSrc && (!blocked || this.placeholderSrc.startsWith('data:')) ? this.placeholderSrc : undefined
    return html`<div
        class=${classMap({ frame: true, [`frame--${this.status}`]: true, 'frame--sized': !!ratio, 'frame--preview': this.preview && this.status === 'loaded' })}
        style=${frameStyle}
        tabindex="-1"
      >
        ${blocked ? nothing : this.renderImage()}
        ${
          this.status === 'loading' || blocked
            ? html`<div class="placeholder" part="placeholder" aria-hidden="true">
                ${lqip ? html`<img class="lqip" src=${lqip} alt="" />` : nothing}
                ${blocked ? nothing : html`<slot name="placeholder"><span class="shimmer"></span></slot>`}
              </div>`
            : nothing
        }
        ${blocked ? this.renderLoadButton() : nothing}
        ${
          this.status === 'error'
            ? html`<div class="fallback" part="fallback">
                <slot name="fallback"><span class="icon">${brokenIcon}</span>${this.alt ? html`<span class="alt">${this.alt}</span>` : nothing}</slot>
              </div>`
            : nothing
        }
      </div>
      ${this.previewReady ? this.renderPreview() : nothing}`
  }

  private renderImage() {
    if (!this.src) return nothing
    const image = html`<img
      class="image"
      part="image"
      src=${this.src}
      srcset=${ifDefined(this.srcset)}
      sizes=${ifDefined(this.sizes)}
      alt=${this.alt}
      width=${ifDefined(this.width)}
      height=${ifDefined(this.height)}
      loading=${this.loading === 'eager' || this.loading === 'click' ? 'eager' : 'lazy'}
      decoding="async"
      referrerpolicy=${ifDefined(this.referrerPolicy)}
      crossorigin=${ifDefined(this.crossOrigin)}
      @load=${this.handleLoad}
      @error=${this.handleError}
    />`
    if (!this.preview || this.status !== 'loaded') return image
    return html`<button
      class="preview-trigger"
      type="button"
      aria-label=${this.alt ? `Open ${this.alt} full screen` : 'Open image full screen'}
      @click=${this.openPreview}
    >
      ${image}
    </button>`
  }

  private renderLoadButton() {
    const host = hostOf(this.src)
    return html`<button class="load-button" part="load-button" type="button" @click=${this.handleActivate}>
      <span class="icon">${imageIcon}</span>
      <span class="load-label"><slot name="load-label">Load image</slot>${host ? html`<span class="host"> · ${host}</span>` : nothing}</span>
      ${this.alt ? html`<span class="alt">${this.alt}</span>` : nothing}
    </button>`
  }

  private renderPreview() {
    return html`<c2-modal class="preview" label=${this.alt || 'Image'} ?open=${this.previewOpen} @close=${this.closePreview}>
      <img class="preview-image" src=${this.src} srcset=${ifDefined(this.srcset)} alt=${this.alt} referrerpolicy=${ifDefined(this.referrerPolicy)} />
    </c2-modal>`
  }

  private readonly handleLoad = (event: Event) => {
    this.status = 'loaded'
    redispatchEvent(this, event)
  }

  private readonly handleError = (event: Event) => {
    this.status = 'error'
    redispatchEvent(this, event)
  }

  private readonly handleActivate = () => {
    const request = new CustomEvent('load-request', { detail: { src: this.src }, bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(request)) return
    this.load()
    // Keep focus on the element: the button it was on is replaced by the image.
    void this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.frame')?.focus({ preventScroll: true }))
  }

  private readonly openPreview = async () => {
    const request = new CustomEvent('preview-open', { detail: { src: this.src }, bubbles: true, composed: true, cancelable: true })
    if (!this.dispatchEvent(request)) return
    if (!customElements.get('c2-modal')) await import('@c2n/modal')
    this.previewReady = true
    this.previewOpen = true
  }

  private readonly closePreview = () => {
    this.previewOpen = false
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-image': Image
  }
}
