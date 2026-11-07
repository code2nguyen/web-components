import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { signaturePadMessages } from './messages'
import styles from './signature-pad.scss?inline'

export { signaturePadMessages } from './messages'

/** A point of a stroke, in CSS pixels from the top left corner of the pad. */
export type SignaturePoint = [x: number, y: number]

/** One stroke: the points the pointer passed through between pressing and lifting. */
export type SignatureStroke = SignaturePoint[]

/** Events fired by {@link SignaturePad}, keyed for `addEventListener`. */
export interface SignaturePadEventMap {
  input: Event
  change: Event
}

export interface SignaturePad {
  addEventListener: TypedAddEventListener<SignaturePad, SignaturePadEventMap>
  removeEventListener: TypedRemoveEventListener<SignaturePad, SignaturePadEventMap>
}

/** Points closer than this to the last one add nothing a reader could see, so they are dropped. */
const MIN_DISTANCE = 1

const round = (value: number) => Math.round(value * 10) / 10

/** A smooth path through the points: quadratic curves between the midpoints, so the line has no corners. */
export function strokePath(points: SignatureStroke): string {
  if (!points.length) return ''
  const [first] = points
  // A tap is a dot: a line too short to see, drawn with round caps.
  if (points.length === 1) return `M${round(first[0])} ${round(first[1])}l0.01 0`
  let d = `M${round(first[0])} ${round(first[1])}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]
    const [nx, ny] = points[i + 1]
    d += `Q${round(x)} ${round(y)} ${round((x + nx) / 2)} ${round((y + ny) / 2)}`
  }
  const last = points[points.length - 1]
  return `${d}L${round(last[0])} ${round(last[1])}`
}

const isStroke = (stroke: unknown): stroke is SignatureStroke =>
  Array.isArray(stroke) && stroke.every((point) => Array.isArray(point) && point.length >= 2 && point.every((n) => typeof n === 'number' && Number.isFinite(n)))

/**
 * A box to sign in with a mouse, a pen or a finger, as in DocuSign or a delivery app's proof of receipt. Each stroke
 * is kept as the points the pointer passed through and drawn as a smooth SVG path, so the signature stays sharp at any
 * size and exports as vector or bitmap.
 *
 * An empty pad shows a hint (`placeholder`, "Sign here" by default) over a baseline. **Undo** takes the last stroke
 * away and **Clear** empties the pad; `undo()` and `clear()` do the same from code. `strokes` holds the drawing (an
 * array of strokes, each an array of `[x, y]` points in CSS pixels) and can be set to show a saved signature. Export it
 * with `toSVG()`, `toDataURL(type?)` or `toBlob(type?)`.
 *
 * It is a form control: under a `name` the form receives the signature as SVG markup, `required` asks for one, and it
 * takes part in `c2-form-field`. `readonly` shows a signature without letting it change.
 *
 * A signature cannot be drawn from the keyboard, so a form that asks for one should accept a typed name as well.
 *
 * @tag c2-signature-pad
 *
 * @event {Event} input - Fired when the drawing changes: a stroke ends, or the user presses Undo or Clear. Read `strokes`, or `isEmpty`.
 * @event {Event} change - Fired with `input`, once the drawing has changed. Not fired when `strokes` is set or `clear()` is called from code.
 *
 * @csspart pad - The area that takes the strokes.
 * @csspart ink - The SVG that draws the strokes.
 * @csspart placeholder - The hint shown while the pad is empty.
 * @csspart baseline - The line to sign on.
 * @csspart actions - The row of the Undo and Clear buttons.
 * @csspart action - The Undo and Clear buttons.
 *
 * @cssproperty {length} [--c2-signature-pad--width=360px] - Width of the pad, never wider than its container; `100%` fills it.
 * @cssproperty {pixel} [--c2-signature-pad--height=200px]
 * @cssproperty {background} [--c2-signature-pad--background=#ffffff]
 * @cssproperty {border} [--c2-signature-pad--border=1px solid #bcbcc6]
 * @cssproperty {border} [--c2-signature-pad__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-signature-pad__error--border=1px solid #dc2626] - While an enclosing `c2-form-field` shows an error.
 * @cssproperty {border-radius} [--c2-signature-pad--border-radius=8px]
 * @cssproperty {color} [--c2-signature-pad__stroke--color=#18181b] - Colour of the ink.
 * @cssproperty {pixel} [--c2-signature-pad__stroke--width=2.5px] - Thickness of the ink.
 * @cssproperty {color} [--c2-signature-pad__placeholder--color=#71717a]
 * @cssproperty {font-size} [--c2-signature-pad__placeholder--font-size=14px]
 * @cssproperty {border} [--c2-signature-pad__baseline--border=1px solid #e4e4e7] - The line to sign on.
 * @cssproperty {pixel} [--c2-signature-pad__baseline--inset=24px] - Distance of the baseline from the bottom and the sides.
 * @cssproperty {display} [--c2-signature-pad__actions--display=flex] - `none` hides the Undo and Clear buttons.
 * @cssproperty {color} [--c2-signature-pad__action--color=#71717a]
 * @cssproperty {color} [--c2-signature-pad__action__hover--color=#18181b]
 * @cssproperty {background} [--c2-signature-pad__action__hover--background=#f4f4f5]
 * @cssproperty {font-size} [--c2-signature-pad__action--font-size=12px]
 * @cssproperty {font-weight} [--c2-signature-pad__action--font-weight=500]
 * @cssproperty {border-radius} [--c2-signature-pad__action--border-radius=6px]
 * @cssproperty {outline} [--c2-signature-pad__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-signature-pad__disabled--opacity=0.38]
 */
@customElement('c2-signature-pad')
export class SignaturePad extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The drawing: one array of `[x, y]` points per stroke, in CSS pixels. As an attribute, JSON. Not reflected. */
  @property({ converter: jsonPropertyConverter }) strokes: SignatureStroke[] = []

  /** Form field name: the form receives the signature as SVG markup. */
  @property({ reflect: true }) name = ''

  /** Asks for a signature: an empty pad is invalid. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Shows the signature without letting it change; the Undo and Clear buttons are hidden. */
  @property({ type: Boolean, reflect: true }) readonly = false

  /** Turns the pad off; as for a disabled form control, the signature is not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the pad. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  /** The hint shown in an empty pad. Empty shows the built-in "Sign here". */
  @property() placeholder = ''

  @state() private disabledByForm = false
  /** The stroke being drawn, kept apart so a drag only redraws its own path. */
  @state() private current: SignatureStroke | null = null

  @query('.pad') private pad?: HTMLElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, signaturePadMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultStrokes: SignatureStroke[] | undefined
  private customValidityMessage = ''
  private pointerId: number | undefined

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

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  formResetCallback() {
    this.current = null
    this.strokes = (this.defaultStrokes ?? []).map((stroke) => stroke.map((point) => [...point] as SignaturePoint))
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  /** True while the pad holds no strokes. */
  get isEmpty(): boolean {
    return this.validStrokes().length === 0
  }

  /** Takes the last stroke away. Fires no event. */
  undo(): void {
    const strokes = this.validStrokes()
    if (strokes.length) this.strokes = strokes.slice(0, -1)
  }

  /** Empties the pad. Fires no event. */
  clear(): void {
    this.current = null
    this.strokes = []
  }

  /** The signature as a standalone SVG document, the size of the pad, in the ink's colour and thickness. */
  toSVG(): string {
    const { width, height } = this.size()
    const { color, width: strokeWidth } = this.ink()
    const paths = this.validStrokes()
      .map((stroke) => `<path d="${strokePath(stroke)}"/>`)
      .join('')
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<g fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`
    )
  }

  /**
   * The signature as an image `data:` URL, drawn at the screen's pixel density. PNG and WebP keep a transparent
   * background; formats without transparency (JPEG) get a white one.
   */
  toDataURL(type = 'image/png', quality?: number): string {
    return this.draw(type).toDataURL(type, quality)
  }

  /** The signature as an image `Blob`, like {@link toDataURL}. */
  toBlob(type = 'image/png', quality?: number): Promise<Blob | null> {
    const canvas = this.draw(type)
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
  }

  private draw(type: string): HTMLCanvasElement {
    const { width, height } = this.size()
    const scale = window.devicePixelRatio || 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) return canvas
    context.scale(scale, scale)
    if (type !== 'image/png' && type !== 'image/webp') {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, width, height)
    }
    const { color, width: strokeWidth } = this.ink()
    context.strokeStyle = color
    context.lineWidth = strokeWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    for (const stroke of this.validStrokes()) context.stroke(new Path2D(strokePath(stroke)))
    return canvas
  }

  private size(): { width: number; height: number } {
    return { width: Math.round(this.pad?.offsetWidth ?? 0), height: Math.round(this.pad?.offsetHeight ?? 0) }
  }

  /** The ink as the pad draws it: the CSS variables resolved. */
  private ink(): { color: string; width: number } {
    const style = this.pad ? getComputedStyle(this.pad) : undefined
    const width = parseFloat(style?.getPropertyValue('--_stroke-width') ?? '')
    return { color: style?.color || '#18181b', width: Number.isFinite(width) && width > 0 ? width : 2.5 }
  }

  /** `strokes` with anything that is not a list of points dropped: the attribute and the property take any JSON. */
  private validStrokes(): SignatureStroke[] {
    return Array.isArray(this.strokes) ? this.strokes.filter(isStroke).filter((stroke) => stroke.length > 0) : []
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get locked() {
    return this.effectiveDisabled || this.readonly
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('strokes') && this.defaultStrokes === undefined) this.defaultStrokes = this.validStrokes()
  }

  protected override updated() {
    this.syncFormState()
  }

  private syncFormState() {
    const empty = this.isEmpty
    const svgMarkup = empty ? '' : this.toSVG()
    this.internals.setFormValue(this.effectiveDisabled || !this.name || empty ? null : svgMarkup, svgMarkup)
    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    const anchor = this.pad ?? undefined
    if (this.customValidityMessage) this.internals.setValidity({ customError: true }, this.customValidityMessage, anchor)
    else if (this.required && empty) this.internals.setValidity({ valueMissing: true }, this.msg.t('required'), anchor)
    else this.internals.setValidity({})
  }

  /** A pointer position in the pad's own CSS pixels, also under a scaled ancestor. */
  private pointOf(event: PointerEvent, box: DOMRect, pad: HTMLElement): SignaturePoint {
    const scaleX = box.width ? pad.offsetWidth / box.width : 1
    const scaleY = box.height ? pad.offsetHeight / box.height : 1
    return [round((event.clientX - box.left) * scaleX), round((event.clientY - box.top) * scaleY)]
  }

  private handlePointerDown(event: PointerEvent) {
    if (this.locked || event.button !== 0 || this.pointerId !== undefined) return
    const pad = event.currentTarget as HTMLElement
    event.preventDefault()
    pad.setPointerCapture(event.pointerId)
    this.pointerId = event.pointerId
    this.current = [this.pointOf(event, pad.getBoundingClientRect(), pad)]
  }

  private handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== this.pointerId || !this.current) return
    const pad = event.currentTarget as HTMLElement
    const box = pad.getBoundingClientRect()
    // The coalesced events are the positions the pointer passed through between two frames: a fast stroke stays smooth.
    const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : []
    const points = [...this.current]
    for (const sample of samples.length ? samples : [event]) {
      const point = this.pointOf(sample, box, pad)
      const last = points[points.length - 1]
      if (Math.hypot(point[0] - last[0], point[1] - last[1]) >= MIN_DISTANCE) points.push(point)
    }
    if (points.length !== this.current.length) this.current = points
  }

  private handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== this.pointerId) return
    this.pointerId = undefined
    const stroke = this.current
    this.current = null
    if (!stroke || this.locked) return
    this.strokes = [...this.validStrokes(), stroke]
    this.notify()
  }

  private notify() {
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private handleUndo() {
    if (this.locked || this.isEmpty) return
    this.undo()
    this.notify()
  }

  private handleClear() {
    if (this.locked || this.isEmpty) return
    this.clear()
    this.notify()
  }

  override render() {
    const disabled = this.effectiveDisabled
    const invalid = this.field.invalid && !disabled
    const strokes = this.validStrokes()
    const empty = strokes.length === 0 && !this.current
    const name = this.label || this.field.label || this.msg.t('label')
    return html`<div class="signature ${invalid ? 'signature--invalid' : ''} ${disabled ? 'signature--disabled' : ''}">
        <div
          class="pad ${this.locked ? '' : 'pad--drawing'}"
          part="pad"
          role="img"
          aria-label=${name}
          aria-describedby=${this.field.describedBy('status')}
          aria-invalid=${invalid ? 'true' : nothing}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
        >
          <span class="baseline" part="baseline"></span>
          ${empty ? html`<span class="placeholder" part="placeholder" aria-hidden="true">${this.placeholder || this.msg.t('placeholder')}</span>` : nothing}
          <svg class="ink" part="ink" aria-hidden="true">
            ${strokes.map((stroke) => svg`<path d=${strokePath(stroke)}></path>`)}
            ${this.current ? svg`<path class="current" d=${strokePath(this.current)}></path>` : nothing}
          </svg>
          <span id="status" class="visually-hidden">${this.msg.t(strokes.length ? 'signed' : 'empty')}</span>
        </div>
        ${
          this.locked
            ? nothing
            : // aria-disabled rather than disabled: Undo can empty the pad while it has focus, and a disabled button drops it.
              html`<div class="actions" part="actions">
                <button class="action" part="action" type="button" aria-disabled=${strokes.length ? nothing : 'true'} @click=${this.handleUndo}>
                  ${this.msg.t('undo')}
                </button>
                <button class="action" part="action" type="button" aria-disabled=${strokes.length ? nothing : 'true'} @click=${this.handleClear}>
                  ${this.msg.t('clear')}
                </button>
              </div>`
        }
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-signature-pad': SignaturePad
  }
}
