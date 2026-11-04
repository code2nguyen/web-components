import { LitElement, html, isServer, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { encodeBarcode, type BarcodeFormat, type EncodedBarcode, type LinearBarcode, type MatrixBarcode } from './encode.js'
import { barcodeMessages } from './messages.js'
import styles from './barcode.scss?inline'

export * from './encode.js'

export interface BarcodeErrorEventDetail {
  error: Error
  value: string
}

/** Events fired by {@link Barcode}, keyed for `addEventListener`. */
export interface BarcodeEventMap {
  'barcode-error': CustomEvent<BarcodeErrorEventDetail>
}

export interface Barcode {
  addEventListener: TypedAddEventListener<Barcode, BarcodeEventMap>
  removeEventListener: TypedRemoveEventListener<Barcode, BarcodeEventMap>
}

const FORMAT_NAMES: Record<BarcodeFormat, string> = {
  code128: 'Code 128',
  ean13: 'EAN-13',
  ean8: 'EAN-8',
  upca: 'UPC-A',
  code39: 'Code 39',
  datamatrix: 'Data Matrix',
}

/** One path for the dark runs of a row of modules, in a box `height` units tall. */
function runsPath(modules: boolean[], height: number): string {
  let path = ''
  for (let start = 0; start < modules.length; start += 1) {
    if (!modules[start]) continue
    let end = start
    while (end + 1 < modules.length && modules[end + 1]) end += 1
    path += `M${start} 0h${end - start + 1}v${height}h-${end - start + 1}z`
    start = end
  }
  return path
}

/**
 * Draws a 1D or 2D barcode as SVG, for labels, tickets, receipts and product pages. Everything is encoded in the
 * browser: no service sees the value, and nothing is loaded.
 *
 * `format` picks the symbology: `code128` (the default: any ASCII text, digits packed two per symbol), `ean13`,
 * `ean8` and `upca` (retail; the check digit is added, or verified when it is given), `code39` (legacy industrial)
 * and `datamatrix` (a square 2D code, sized to the value). A 1D code shows its value underneath, in the split each
 * standard prints; `hide-text` leaves it out.
 *
 * The bars keep their own dark-on-white colours in dark mode, because that is what a scanner reads. The quiet zone
 * a format requires is kept even when `--c2-barcode--quiet-zone` asks for less, and a host narrower than the code
 * shrinks it to fit. A value the format cannot encode
 * draws a dashed frame and fires `barcode-error`.
 *
 * The element is an image named after the format and the value ("Barcode, EAN-13: 4006381333931"); an
 * `aria-label` on it replaces that name.
 *
 * @tag c2-barcode
 *
 * @event {CustomEvent<BarcodeErrorEventDetail>} barcode-error - The value cannot be encoded in the format. `detail` has the error and the value.
 *
 * @csspart code - The box around the code, quiet zone included.
 * @csspart bars - The SVG of the bars or the modules.
 * @csspart text - The value printed under a 1D code.
 * @csspart placeholder - The frame drawn when there is no code.
 *
 * @cssproperty {pixel} [--c2-barcode__module--width=2px] - The width of one narrow bar of a 1D code.
 * @cssproperty {pixel} [--c2-barcode--height=72px] - The height of the bars of a 1D code.
 * @cssproperty {number} [--c2-barcode--quiet-zone=10] - The margin either side of a 1D code, in modules. It never goes under what the format requires: 10 for Code 128 and Code 39, 11 left and 7 right for EAN-13, 7 for EAN-8, 9 for UPC-A.
 * @cssproperty {pixel} [--c2-barcode__module--size=4px] - The size of one cell of a Data Matrix.
 * @cssproperty {number} [--c2-barcode__matrix--quiet-zone=2] - The margin around a Data Matrix, in cells.
 * @cssproperty {pixel} [--c2-barcode--padding-block=8px] - Space above the code and below the text.
 * @cssproperty {color} [--c2-barcode__bar--color=#18181b]
 * @cssproperty {color} [--c2-barcode__background--color=#ffffff]
 * @cssproperty {border-radius} [--c2-barcode--border-radius=4px]
 * @cssproperty {color} [--c2-barcode__text--color=#18181b]
 * @cssproperty {font-family} [--c2-barcode__text--font-family=ui-monospace, SFMono-Regular, Menlo, Consolas, monospace]
 * @cssproperty {font-size} [--c2-barcode__text--font-size=13px]
 * @cssproperty {pixel} [--c2-barcode__placeholder--width=220px]
 * @cssproperty {border} [--c2-barcode__placeholder--border=1px dashed #bcbcc6]
 * @cssproperty {color} [--c2-barcode__placeholder--color=#71717a]
 * @cssproperty {font-size} [--c2-barcode__placeholder--font-size=12px]
 */
@customElement('c2-barcode')
export class Barcode extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The text to encode. */
  @property() value = ''

  /** `code128`, `ean13`, `ean8`, `upca`, `code39` or `datamatrix`. */
  @property() format: BarcodeFormat = 'code128'

  /** Leaves out the value printed under a 1D code. */
  @property({ type: Boolean, attribute: 'hide-text' }) hideText = false

  @state() private code: EncodedBarcode | null = null
  @state() private failed = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, barcodeMessages)

  constructor() {
    super()
    this.internals.role = 'img'
  }

  /** What the code holds as drawn, check digit included; empty when nothing is drawn. */
  get encoded(): string {
    return this.code?.encoded ?? ''
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') || changed.has('format')) this.encode()
    const name = this.code ? this.msg.t('label', FORMAT_NAMES[this.format] ?? FORMAT_NAMES.code128, this.code.encoded) : this.msg.t('barcode')
    this.internals.ariaLabel = name
  }

  private encode(): void {
    if (!this.value) {
      this.code = null
      this.failed = false
      return
    }
    try {
      this.code = encodeBarcode(this.value, FORMAT_NAMES[this.format] ? this.format : 'code128')
      this.failed = false
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause))
      const value = this.value
      this.code = null
      this.failed = true
      if (!isServer) {
        queueMicrotask(() =>
          this.dispatchEvent(new CustomEvent<BarcodeErrorEventDetail>('barcode-error', { detail: { error, value }, bubbles: true, composed: true })),
        )
      }
    }
  }

  private renderLinear(code: LinearBarcode) {
    const count = code.modules.length
    const longPath = runsPath(
      code.modules.map((dark, index) => dark && code.long[index]),
      1,
    )
    const showText = !this.hideText && code.text.length > 0
    return html`<div class="code linear" part="code" style="--_modules: ${count}; --_quiet-left: ${code.quiet[0]}; --_quiet-right: ${code.quiet[1]}">
      <svg class="bars" part="bars" viewBox="0 0 ${count} 100" preserveAspectRatio="none" aria-hidden="true">
        <path d=${runsPath(code.modules, 100)}></path>
      </svg>
      ${
        showText
          ? html`<div class="line" aria-hidden="true">
              ${longPath ? html`<svg class="guards" viewBox="0 0 ${count} 1" preserveAspectRatio="none"><path d=${longPath}></path></svg>` : nothing}
              ${code.text.map(
              (run) => html`<span class="text ${run.anchor}" part="text" style="inset-inline-start: ${((run.x / count) * 100).toFixed(3)}%">${run.text}</span>`,
            )}
            </div>`
          : nothing
      }
    </div>`
  }

  private renderMatrix(code: MatrixBarcode) {
    const size = code.rows.length
    const path = code.rows.map((row, y) => runsPath(row, 1).replace(/M(\d+) 0/g, `M$1 ${y}`)).join('')
    return html`<div class="code matrix" part="code" style="--_cells: ${size}">
      <svg class="bars" part="bars" viewBox="0 0 ${size} ${size}" aria-hidden="true">${svg`<path d=${path}></path>`}</svg>
    </div>`
  }

  override render() {
    if (!this.code) {
      return html`<div class="placeholder" part="placeholder" aria-hidden="true">${this.msg.t(this.failed ? 'unencodable' : 'empty')}</div>`
    }
    return this.code.kind === 'matrix' ? this.renderMatrix(this.code) : this.renderLinear(this.code)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-barcode': Barcode
  }
}
