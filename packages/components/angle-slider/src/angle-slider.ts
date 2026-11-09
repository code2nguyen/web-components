import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { angleSliderMessages } from './messages'
import styles from './angle-slider.scss?inline'

export { angleSliderMessages } from './messages'

/** `angle` picks a direction on a full circle; `arc` picks a value along an open arc, like a thermostat or volume knob. */
export type AngleSliderMode = 'angle' | 'arc'

/** Events fired by {@link AngleSlider}, keyed for `addEventListener`. */
export interface AngleSliderEventMap {
  input: Event
  change: Event
}

export interface AngleSlider {
  addEventListener: TypedAddEventListener<AngleSlider, AngleSliderEventMap>
  removeEventListener: TypedRemoveEventListener<AngleSlider, AngleSliderEventMap>
}

const DEFAULT_SWEEP = 270

/**
 * A round knob: drag the handle around the dial, or use the keys, to pick an angle or a value.
 *
 * In `angle` mode (the default) the dial is a full circle and the value is a direction: `0` at the top, growing
 * clockwise up to `max` (360 by default), where it comes round to `min` again. A line from the centre points at the
 * handle. The arrow keys wrap past either end.
 *
 * In `arc` mode the dial is an open arc, with the gap at the bottom, and `min`–`max` run along it from its left end
 * to its right end, like a thermostat, a volume or a gain knob. The arc fills up to the handle, a press in the gap
 * picks the nearer end, and the keys stop at the ends. How far the arc reaches is CSS:
 * `--c2-angle-slider__arc--sweep` (270 degrees by default).
 *
 * A press anywhere on the dial moves the handle there and keeps following the pointer until it is released. The
 * handle is a `slider`: Right and Up add a `step`, Left and Down take one off, Page Up and Page Down move a tenth of
 * the range, Home and End go to `min` and `max`. The value shows in the middle, formatted by `formatValue` (an angle
 * shows with a degree sign); hide it with `--c2-angle-slider__value--display: none` or put your own content in the
 * default slot.
 *
 * It is a form control: under a `name` the form receives the value, and it takes part in `c2-form-field`.
 *
 * @tag c2-angle-slider
 *
 * @slot - Replaces the value shown in the middle of the dial (an icon, a value with its own markup). Decorative: the handle still reads the value.
 *
 * @event {Event} input - Fired while the user changes the value, at every step of a drag or a key press. Read `value`.
 * @event {Event} change - Fired when the user commits a value: the pointer is released, or a key changed it. Not fired for programmatic changes.
 *
 * @csspart dial - The round control: the ring, the needle, the handle and the value.
 * @csspart track - The ring the handle runs along.
 * @csspart fill - In `arc` mode, the part of the ring from the start of the arc to the handle.
 * @csspart needle - In `angle` mode, the line from the centre to the handle.
 * @csspart thumb - The handle, which is the focusable `slider`.
 * @csspart value - The value shown in the middle.
 *
 * @cssproperty {pixel} [--c2-angle-slider--size=160px] - Width and height of the dial.
 * @cssproperty {number} [--c2-angle-slider__arc--sweep=270] - How far the arc of `arc` mode reaches, in degrees (up to 360), centred on the top.
 * @cssproperty {pixel} [--c2-angle-slider__track--width=8px] - Thickness of the ring.
 * @cssproperty {color} [--c2-angle-slider__track--color=#e4e4e7]
 * @cssproperty {color} [--c2-angle-slider__fill--color=rgb(2, 101, 220)] - The filled part of the arc in `arc` mode.
 * @cssproperty {color} [--c2-angle-slider__track__error--color=#dc2626] - The ring while an enclosing `c2-form-field` shows an error.
 * @cssproperty {pixel} [--c2-angle-slider__needle--width=2px] - Thickness of the line from the centre to the handle in `angle` mode.
 * @cssproperty {color} [--c2-angle-slider__needle--color=rgb(2, 101, 220)]
 * @cssproperty {pixel} [--c2-angle-slider__thumb--size=20px]
 * @cssproperty {color} [--c2-angle-slider__thumb--color=#ffffff]
 * @cssproperty {border} [--c2-angle-slider__thumb--border=2px solid rgb(2, 101, 220)]
 * @cssproperty {box-shadow} [--c2-angle-slider__thumb--box-shadow=0 1px 3px rgba(0, 0, 0, 0.15)]
 * @cssproperty {box-shadow} [--c2-angle-slider__thumb__active--box-shadow=0 0 0 8px rgba(2, 101, 220, 0.18)] - Halo while dragging.
 * @cssproperty {outline} [--c2-angle-slider__thumb__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-angle-slider__thumb__focus--outline-offset=2px]
 * @cssproperty {display} [--c2-angle-slider__value--display=block] - `none` hides the value in the middle.
 * @cssproperty {color} [--c2-angle-slider__value--color=#18181b]
 * @cssproperty {font-size} [--c2-angle-slider__value--font-size=24px]
 * @cssproperty {font-weight} [--c2-angle-slider__value--font-weight=600]
 * @cssproperty {opacity} [--c2-angle-slider__disabled--opacity=0.38]
 */
@customElement('c2-angle-slider')
export class AngleSlider extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** `angle` for a direction on a full circle, `arc` for a value along an open arc. */
  @property({ reflect: true }) mode: AngleSliderMode = 'angle'

  /** The current value, kept between `min` and `max` and snapped to `step`. In `angle` mode `max` comes round to `min`. */
  @property({ type: Number }) value = 0

  /** The value at the top of the dial (`angle` mode) or at the start of the arc (`arc` mode). */
  @property({ type: Number }) min = 0

  /** The value a full turn reaches (`angle` mode), or at the end of the arc (`arc` mode). */
  @property({ type: Number }) max = 360

  /** Increment between values. */
  @property({ type: Number }) step = 1

  /** Form field name: the form receives the value. */
  @property({ reflect: true }) name = ''

  /** Turns the slider off; as for a disabled form control, the value is not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the slider. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  /** Formats the value for the middle of the dial and for assistive technology, e.g. `(v) => \`${v} °C\``. Property only. */
  @property({ attribute: false }) formatValue: ((value: number) => string) | undefined

  @state() private disabledByForm = false
  @state() private dragging = false

  @query('.thumb') private thumb?: HTMLElement

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, angleSliderMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultValue: number | undefined
  private customValidityMessage = ''
  /** The pointer a press on the dial captured, and the value it started from. */
  private drag: { pointerId: number; from: number } | undefined

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
    this.value = this.defaultValue ?? this.min
  }

  formDisabledCallback(disabled: boolean) {
    // The state as given: an own `disabled` is combined in `effectiveDisabled`, so removing it inside a disabled
    // fieldset keeps the control disabled.
    this.disabledByForm = disabled
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string' && state !== '' && Number.isFinite(Number(state))) this.value = Number(state)
  }

  override focus(options?: FocusOptions) {
    this.thumb?.focus(options)
  }

  /** Position of the value along the dial, `0` at `min` and `1` at `max`. */
  get fraction(): number {
    const range = this.max - this.min
    return range > 0 ? Math.min(1, Math.max(0, (this.value - this.min) / range)) : 0
  }

  private get isArc() {
    return this.mode === 'arc'
  }

  /** The highest value the slider can hold: `max` on an arc; on a full turn, the last step before `max`, which is `min` again. */
  private get lastValue(): number {
    const { min, max } = this
    if (this.isArc || !(max > min)) return max
    const step = this.step > 0 ? this.step : 1
    return Number((min + (Math.ceil((max - min) / step) - 1) * step).toFixed(10))
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('min') || changed.has('max') || changed.has('step') || changed.has('mode')) {
      const value = this.sanitize(this.value)
      if (value !== this.value) this.value = value
    }
    if (this.defaultValue === undefined) this.defaultValue = this.value
  }

  protected override updated() {
    this.syncFormState()
  }

  /** Clamps a value into range and snaps it to `step`; in `angle` mode a full turn comes round to `min`. */
  private sanitize(raw: number): number {
    const { min, max } = this
    if (!Number.isFinite(raw) || !(max > min)) return Number.isFinite(min) ? min : 0
    let value = raw
    if (this.isArc) value = Math.min(max, Math.max(min, value))
    else {
      const range = max - min
      value = ((((value - min) % range) + range) % range) + min
    }
    if (this.step > 0) value = min + Math.round((value - min) / this.step) * this.step
    value = Number(value.toFixed(10))
    if (this.isArc) return Math.min(max, Math.max(min, value))
    // Snapping can land on `max` itself, which is the same direction as `min`.
    return value >= max ? min : value
  }

  private syncFormState() {
    const value = String(this.value)
    this.internals.setFormValue(this.effectiveDisabled || !this.name ? null : value, value)
    const flags = this.customValidityMessage && !this.effectiveDisabled ? { customError: true } : {}
    this.internals.setValidity(flags, this.customValidityMessage, this.thumb ?? undefined)
  }

  /** The sweep of the arc in degrees, read from the CSS variable that also draws it. */
  private sweep(): number {
    const sweep = parseFloat(getComputedStyle(this).getPropertyValue('--c2-angle-slider__arc--sweep'))
    return Number.isFinite(sweep) && sweep > 0 ? Math.min(360, sweep) : DEFAULT_SWEEP
  }

  /** The value under a pointer, from its direction seen from the centre of the dial. */
  private valueAt(event: PointerEvent): number {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = event.clientY - (box.top + box.height / 2)
    // Clockwise from the top, 0 to 360.
    const direction = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360
    const range = this.max - this.min
    if (!this.isArc) return this.sanitize(this.min + (direction / 360) * range)
    const sweep = this.sweep()
    const along = (direction + sweep / 2) % 360
    let fraction: number
    if (along <= sweep) fraction = along / sweep
    // In the gap: the nearer end of the arc.
    else fraction = along < sweep + (360 - sweep) / 2 ? 1 : 0
    return this.sanitize(this.min + fraction * range)
  }

  /** Sets the value as the user's: fires `input`, and `change` when `commit`. Returns whether it changed. */
  private choose(value: number, commit: boolean): boolean {
    const next = this.sanitize(value)
    const changed = next !== this.value
    if (changed) {
      this.value = next
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    }
    if (commit && changed) this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
    return changed
  }

  private handlePointerDown(event: PointerEvent) {
    if (this.effectiveDisabled || event.button !== 0 || this.drag) return
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    this.thumb?.focus({ preventScroll: true })
    this.drag = { pointerId: event.pointerId, from: this.value }
    this.dragging = true
    this.choose(this.valueAt(event), false)
  }

  private handlePointerMove(event: PointerEvent) {
    if (this.drag?.pointerId !== event.pointerId) return
    this.choose(this.valueAt(event), false)
  }

  private handlePointerUp(event: PointerEvent) {
    const drag = this.drag
    if (drag?.pointerId !== event.pointerId) return
    this.drag = undefined
    this.dragging = false
    if (this.value !== drag.from) this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private handleKeydown(event: KeyboardEvent) {
    if (this.effectiveDisabled) return
    const step = this.step > 0 ? this.step : 1
    const page = Math.max(step, Math.round((this.max - this.min) / 10 / step) * step)
    let delta: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        delta = step
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        delta = -step
        break
      case 'PageUp':
        delta = page
        break
      case 'PageDown':
        delta = -page
        break
      case 'Home':
        event.preventDefault()
        this.choose(this.min, true)
        return
      case 'End':
        event.preventDefault()
        this.choose(this.lastValue, true)
        return
      default:
        return
    }
    event.preventDefault()
    this.choose(this.isArc ? this.value + delta : this.turn(delta / step), true)
  }

  /**
   * The value `steps` steps round the circle from the current one. It moves along the step grid from `min`, and past
   * the last step comes back to `min`: with a step that does not divide the turn (7 in 360), 357 is followed by 0.
   */
  private turn(steps: number): number {
    const step = this.step > 0 ? this.step : 1
    const count = Math.max(1, Math.ceil((this.max - this.min) / step))
    const index = Math.round((this.value - this.min) / step)
    const next = (((index + Math.round(steps)) % count) + count) % count
    return this.min + next * step
  }

  private display(): string {
    if (this.formatValue) return this.formatValue(this.value)
    const number = new Intl.NumberFormat(this.msg.locale, { maximumFractionDigits: 10 }).format(this.value)
    return this.isArc ? number : `${number}°`
  }

  private spoken(): string {
    if (this.formatValue) return this.formatValue(this.value)
    const number = new Intl.NumberFormat(this.msg.locale, { maximumFractionDigits: 10 }).format(this.value)
    return this.isArc ? number : this.msg.t('degrees', number)
  }

  override render() {
    const disabled = this.effectiveDisabled
    const invalid = this.field.invalid && !disabled
    const name = this.label || this.field.label || this.msg.t(this.isArc ? 'value' : 'angle')
    return html`<div
        class="dial ${this.isArc ? 'dial--arc' : 'dial--angle'} ${invalid ? 'dial--invalid' : ''} ${this.dragging ? 'dial--dragging' : ''} ${
          disabled ? 'dial--disabled' : ''
        }"
        part="dial"
        style=${styleMap({ '--_fraction': String(this.fraction) })}
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointercancel=${this.handlePointerUp}
        @lostpointercapture=${this.handlePointerUp}
      >
        <div class="track" part="track"></div>
        ${this.isArc ? html`<div class="fill" part="fill"></div>` : nothing}
        <div class="arm">
          ${this.isArc ? nothing : html`<div class="needle" part="needle"></div>`}
          <div
            class="thumb"
            part="thumb"
            role="slider"
            tabindex=${disabled ? -1 : 0}
            aria-label=${name}
            aria-valuemin=${this.min}
            aria-valuemax=${this.lastValue}
            aria-valuenow=${this.value}
            aria-valuetext=${this.spoken()}
            aria-disabled=${disabled ? 'true' : nothing}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${this.field.describedBy()}
            @keydown=${this.handleKeydown}
          ></div>
        </div>
        <div class="value" part="value" aria-hidden="true"><slot>${this.display()}</slot></div>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-angle-slider': AngleSlider
  }
}
