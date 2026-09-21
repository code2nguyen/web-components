import { LitElement, html, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { encode } from 'uqr'
import styles from './qr-code.scss?inline'

export type QrCodeErrorCorrection = 'L' | 'M' | 'Q' | 'H'

export interface QrCodeErrorEventDetail {
  error: Error
  value: string
}

/** Events fired by {@link QrCode}, keyed for `addEventListener`. */
export interface QrCodeEventMap {
  'qr-code-error': CustomEvent<QrCodeErrorEventDetail>
}

export interface QrCode {
  addEventListener: TypedAddEventListener<QrCode, QrCodeEventMap>
  removeEventListener: TypedRemoveEventListener<QrCode, QrCodeEventMap>
}

/**
 * Generates an accessible, themeable SVG QR code without sending its value to a remote service.
 *
 * @tag c2-qr-code
 *
 * @slot center - Optional logo or mark centered over the code. Prefer `error-correction="H"` and keep the mark small so the code remains scannable.
 *
 * @event {CustomEvent<QrCodeErrorEventDetail>} qr-code-error - Fired when the value cannot be encoded. `detail` contains the error and rejected value.
 *
 * @cssproperty {pixel} [--c2-qr-code--size=200px]
 * @cssproperty {color} [--c2-qr-code__module--color=#18181b]
 * @cssproperty {color} [--c2-qr-code__background--color=#ffffff]
 * @cssproperty {border-radius} [--c2-qr-code__container--border-radius=8px]
 * @cssproperty {color} [--c2-qr-code__placeholder--color=#71717a]
 * @cssproperty {font-size} [--c2-qr-code__placeholder--font-size=12px]
 * @cssproperty {length} [--c2-qr-code__center--size=20%]
 * @cssproperty {color} [--c2-qr-code__center--background-color=#ffffff]
 * @cssproperty {padding} [--c2-qr-code__center--padding=4px]
 * @cssproperty {border-radius} [--c2-qr-code__center--border-radius=6px]
 */
@customElement('c2-qr-code')
export class QrCode extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Text or URL encoded by the QR code. */
  @property({ type: String }) value = ''

  /** Rendered width and height in CSS pixels. Set to `0` to use `--c2-qr-code--size`. */
  @property({ type: Number, reflect: true }) size = 200

  /** Error correction level: L (7%), M (15%), Q (25%), or H (30%). */
  @property({ type: String, attribute: 'error-correction', reflect: true }) errorCorrection: QrCodeErrorCorrection = 'M'

  /** Quiet-zone width measured in QR modules. Four is recommended for reliable scanning. */
  @property({ type: Number, reflect: true }) margin = 4

  /** Raises error correction when the encoded version has spare capacity. */
  @property({ type: Boolean, attribute: 'boost-error-correction', reflect: true }) boostErrorCorrection = false

  /** Accessible name announced for the generated image. Defaults to `QR code`. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  @state() private modules: boolean[][] = []
  @state() private encodingError: Error | null = null
  private readonly slotPresence = new SlotPresenceController(this, ['center'])

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('size')) this.size = Number.isFinite(this.size) ? Math.max(0, Math.floor(this.size)) : 200
    if (changed.has('margin')) this.margin = Number.isFinite(this.margin) ? Math.max(0, Math.floor(this.margin)) : 4
    if (changed.has('errorCorrection') && !['L', 'M', 'Q', 'H'].includes(this.errorCorrection)) this.errorCorrection = 'M'
    if (changed.has('value') || changed.has('margin') || changed.has('errorCorrection') || changed.has('boostErrorCorrection')) this.encodeValue()
  }

  /** Returns a standalone SVG string using the component's current value and options. */
  toSVG(): string {
    if (!this.modules.length) return ''
    const dimension = this.modules.length
    const foreground = this.resolvedColor('--c2-qr-code__module--color', '#18181b')
    const background = this.resolvedColor('--c2-qr-code__background--color', '#ffffff')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges"><rect width="${dimension}" height="${dimension}" fill="${background}"/><path d="${this.modulePath}" fill="${foreground}"/></svg>`
  }

  /** Returns a data URL for the current code. PNG export requires a browser document. */
  async toDataURL(format: 'svg' | 'png' = 'png', scale = 4): Promise<string> {
    const svg = this.toSVG()
    if (!svg) return ''
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    if (format === 'svg') return svgUrl
    const image = new Image()
    image.src = svgUrl
    await image.decode()
    const outputSize = Math.max(1, (this.size || 200) * Math.max(1, scale))
    const canvas = document.createElement('canvas')
    canvas.width = outputSize
    canvas.height = outputSize
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas rendering is unavailable.')
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0, outputSize, outputSize)
    return canvas.toDataURL('image/png')
  }

  /** Downloads the current QR code as SVG or PNG. */
  async download(filename = 'qr-code', format: 'svg' | 'png' = 'png'): Promise<void> {
    const url = await this.toDataURL(format)
    if (!url) return
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${filename}.${format}`
    anchor.click()
  }

  private encodeValue(): void {
    if (!this.value) {
      this.modules = []
      this.encodingError = null
      return
    }
    try {
      this.modules = encode(this.value, { ecc: this.errorCorrection, border: this.margin, boostEcc: this.boostErrorCorrection }).data
      this.encodingError = null
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      this.modules = []
      this.encodingError = error
      queueMicrotask(() =>
        this.dispatchEvent(new CustomEvent<QrCodeErrorEventDetail>('qr-code-error', { detail: { error, value: this.value }, bubbles: true, composed: true })),
      )
    }
  }

  private resolvedColor(name: string, fallback: string): string {
    if (typeof getComputedStyle !== 'function') return fallback
    return getComputedStyle(this).getPropertyValue(name).trim() || fallback
  }

  private get modulePath(): string {
    return this.modules.flatMap((row, y) => row.flatMap((active, x) => (active ? `M${x} ${y}h1v1h-1z` : []))).join('')
  }

  override render() {
    const label = this.ariaLabel || 'QR code'
    const hostSize = this.size > 0 ? `${this.size}px` : undefined
    if (!this.modules.length) {
      return html`<div class="placeholder" style=${styleMap({ width: hostSize, height: hostSize })} role="img" aria-label=${label}>
        ${this.encodingError ? 'Unable to generate QR code' : 'No value'}
      </div>`
    }
    const dimension = this.modules.length
    return html`
      <div class="container" style=${styleMap({ width: hostSize, height: hostSize })}>
        <svg class="code" viewBox="0 0 ${dimension} ${dimension}" role="img" aria-label=${label} shape-rendering="crispEdges">
          <rect class="background" width=${dimension} height=${dimension}></rect>
          <path class="modules" d=${this.modulePath}></path>
        </svg>
        <div class="center" ?hidden=${!this.slotPresence.has('center')}><slot name="center" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-qr-code': QrCode
  }
}
