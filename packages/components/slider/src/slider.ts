import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { styleMap } from 'lit/directives/style-map.js'
import { redispatchEvent } from '@c2n/core/dom-helper.js'
import styles from './slider.scss?inline'

export type SliderOrientation = 'horizontal' | 'vertical'

/** `single` edits one `value`; `range` draws two thumbs that edit `value-start` and `value-end`. */
export type SliderMode = 'single' | 'range'

type RangeThumb = 'start' | 'end'

const MAX_TICKS = 200

/** Events fired by {@link Slider}, keyed for `addEventListener`. */
export interface SliderEventMap {
  input: Event
  change: Event
}

export interface Slider {
  addEventListener: TypedAddEventListener<Slider, SliderEventMap>
  removeEventListener: TypedRemoveEventListener<Slider, SliderEventMap>
}

/**
 * Slider built on a native `<input type="range">`, so dragging, keyboard steps (Arrow keys, Page Up/Down, Home/End),
 * RTL and the `slider` role come from the browser. The component draws the track, the filled part, the thumb, optional
 * step `ticks` and a value bubble (`show-value`) above the thumb, all themed through CSS variables.
 *
 * With `mode="range"` it selects an interval instead: two thumbs, each its own native range input (and so its own
 * `slider` in the accessibility tree), edit `valueStart` and `valueEnd`. A thumb cannot pass the other one, a press on
 * the track moves the nearer thumb there, and the fill spans the selected interval. In a form the range submits two
 * entries under `name`, start first.
 *
 * @tag c2-slider
 *
 * @event {Event} input - Re-dispatched from the inner input while the value changes (every step of a drag). In range mode, read `valueStart`/`valueEnd`.
 * @event {Event} change - Re-dispatched from the inner input when the value is committed (pointer released, key released).
 *
 * @csspart track - The complete slider track.
 * @csspart fill - The track segment before the current value (between the two thumbs in range mode).
 * @csspart thumb - The draggable value handle (both handles in range mode).
 * @csspart thumb-start - The lower handle in range mode.
 * @csspart thumb-end - The upper handle in range mode.
 * @csspart value - The value bubble shown above the thumb when `show-value` is set.
 *
 * @cssproperty {pixel} [--c2-slider__container--height=32px] - Height of the horizontal slider (width when vertical); the touch target.
 * @cssproperty {pixel} [--c2-slider__container--length=160px] - Length of a vertical slider. A horizontal one fills its width.
 * @cssproperty {opacity} [--c2-slider__container__disabled--opacity=0.38]
 *
 * @cssproperty {pixel} [--c2-slider__track--height=4px]
 * @cssproperty {border-radius} [--c2-slider__track--border-radius=999px]
 * @cssproperty {color} [--c2-slider__track--color=#e4e4e7]
 * @cssproperty {color} [--c2-slider__fill--color=#0265dc] - Filled part of the track, from the start to the thumb.
 *
 * @cssproperty {pixel} [--c2-slider__thumb--size=18px]
 * @cssproperty {border-radius} [--c2-slider__thumb--border-radius=999px]
 * @cssproperty {color} [--c2-slider__thumb--color=#ffffff]
 * @cssproperty {border} [--c2-slider__thumb--border=2px solid #0265dc]
 * @cssproperty {box-shadow} [--c2-slider__thumb--box-shadow=0 1px 3px rgba(0, 0, 0, 0.15)]
 * @cssproperty {box-shadow} [--c2-slider__thumb__hover--box-shadow=0 0 0 6px rgba(2, 101, 220, 0.12)] - Halo while hovering.
 * @cssproperty {box-shadow} [--c2-slider__thumb__active--box-shadow=0 0 0 8px rgba(2, 101, 220, 0.18)] - Halo while dragging.
 * @cssproperty {outline} [--c2-slider__thumb__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-slider__thumb__focus--outline-offset=2px]
 *
 * @cssproperty {pixel} [--c2-slider__tick--size=2px]
 * @cssproperty {color} [--c2-slider__tick--color=#a1a1aa] - Ticks on the unfilled part of the track.
 * @cssproperty {color} [--c2-slider__tick__filled--color=#ffffff] - Ticks on the filled part.
 *
 * @cssproperty {background} [--c2-slider__value--background=#18181b] - Value bubble above the thumb.
 * @cssproperty {color} [--c2-slider__value--color=#fafafa]
 * @cssproperty {font-size} [--c2-slider__value--font-size=12px]
 * @cssproperty {font-weight} [--c2-slider__value--font-weight=500]
 * @cssproperty {border-radius} [--c2-slider__value--border-radius=6px]
 * @cssproperty {padding} [--c2-slider__value--padding=4px 8px]
 * @cssproperty {pixel} [--c2-slider__value--offset=8px] - Gap between the thumb and the bubble.
 * @cssproperty {opacity} [--c2-slider__value--opacity=0] - Resting opacity of the bubble; it is fully visible while hovering, dragging or focused. `1` keeps it always on.
 */
@customElement('c2-slider')
export class Slider extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  @state() private disabledByForm = false
  private defaultValue = 0
  private defaultValueStart = 0
  private defaultValueEnd = 100
  private defaultValueCaptured = false
  /** Thumb a press on the track grabbed, followed until the pointer is released. */
  private trackDrag: { thumb: RangeThumb; pointerId: number; moved: boolean } | undefined

  @query('input') protected formElement!: HTMLInputElement
  @query('.c2-slider-input.is-start') private startInput?: HTMLInputElement
  @query('.c2-slider-input.is-end') private endInput?: HTMLInputElement

  /** `single` for one value, `range` for two thumbs selecting `valueStart`–`valueEnd`. */
  @property({ reflect: true }) mode: SliderMode = 'single'

  /** Current value, clamped to `min`/`max` and snapped to `step` by the inner input. */
  @property({ type: Number, reflect: true }) value = 0

  /** Lower end of the selected interval in range mode. Kept at or below `valueEnd`. */
  @property({ type: Number, reflect: true, attribute: 'value-start' }) valueStart = 0

  /** Upper end of the selected interval in range mode. Kept at or above `valueStart`. */
  @property({ type: Number, reflect: true, attribute: 'value-end' }) valueEnd = 100

  /** Minimum selectable value. */
  @property({ type: Number }) min = 0

  /** Maximum selectable value. */
  @property({ type: Number }) max = 100

  /** Increment between values; also the distance between `ticks`. */
  @property({ type: Number }) step = 1

  /** Disables the control: no interaction, rendered dimmed. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Form field name forwarded to the inner input. */
  @property() name = ''

  /** Direction of the track. A vertical slider takes `--c2-slider__container--length` as its height. */
  @property({ reflect: true }) orientation: SliderOrientation = 'horizontal'

  /** Shows the value in a bubble above the thumb while hovering, dragging or focused. */
  @property({ type: Boolean, reflect: true, attribute: 'show-value' }) showValue = false

  /** Draws a mark on the track for every `step` between `min` and `max` (up to 200 marks). */
  @property({ type: Boolean, reflect: true }) ticks = false

  /** Formats the value for the bubble and `aria-valuetext`, e.g. `(v) => \`${v}%\``. Property only. */
  @property({ attribute: false }) formatValue: (value: number) => string = (value) => String(value)

  /** Accessible name of the lower thumb in range mode, appended to `aria-label` when that is set ("Price, Minimum"). */
  @property({ attribute: 'start-label' }) startLabel = 'Minimum'

  /** Accessible name of the upper thumb in range mode, appended to `aria-label` when that is set. */
  @property({ attribute: 'end-label' }) endLabel = 'Maximum'

  /** Accessible name used when no visible label names the slider. */
  @property({ type: String, attribute: 'aria-label' })
  override ariaLabel!: string

  /** Id of the element that labels the slider. */
  @property({ type: String, attribute: 'aria-labelledby' })
  ariaLabelledBy!: undefined | string

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultValueCaptured) {
      this.defaultValue = Number(this.getAttribute('value') ?? 0)
      this.defaultValueStart = Number(this.getAttribute('value-start') ?? this.valueStart)
      this.defaultValueEnd = Number(this.getAttribute('value-end') ?? this.valueEnd)
      this.defaultValueCaptured = true
    }
  }

  /** The containing form, when this control is associated with one. */
  get form() {
    return this.internals.form
  }

  /** Labels associated with this form control. */
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

  formResetCallback() {
    this.value = this.defaultValue
    this.valueStart = this.defaultValueStart
    this.valueEnd = this.defaultValueEnd
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = Number(state)
    else if (state instanceof FormData) {
      const [start, end] = [...state.values()].map(Number)
      if (Number.isFinite(start)) this.valueStart = start
      if (Number.isFinite(end)) this.valueEnd = end
    }
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    for (const input of this.inputs) input.setCustomValidity(message)
    this.syncFormState()
  }

  override focus(options?: FocusOptions) {
    this.formElement?.focus(options)
  }

  /** Position of the value along the track, `0` at `min` and `1` at `max`. */
  get fraction(): number {
    return this.toFraction(this.value)
  }

  private get isRange() {
    return this.mode === 'range'
  }

  private get inputs(): HTMLInputElement[] {
    if (!this.isRange) return this.formElement ? [this.formElement] : []
    return [this.startInput, this.endInput].filter((input): input is HTMLInputElement => !!input)
  }

  private toFraction(value: number): number {
    const range = this.max - this.min
    if (range <= 0) return 0
    return Math.min(1, Math.max(0, (value - this.min) / range))
  }

  protected override update(changed: PropertyValues<this>) {
    if (!this.isRange && changed.has('value') && this.formElement) this.formElement.value = String(this.value)
    super.update(changed)
  }

  private handleInput(event: Event) {
    this.value = Number(this.formElement.value)
    redispatchEvent(this, event)
  }

  protected override updated(changed: PropertyValues<this>) {
    const bounds = changed.has('min') || changed.has('max') || changed.has('step') || changed.has('mode')
    if (this.isRange) {
      if (bounds || changed.has('valueStart') || changed.has('valueEnd')) this.sanitizeRange()
    } else if (bounds || changed.has('value')) {
      // Native range inputs clamp and snap even programmatic values. Mirror the
      // sanitized value so the thumb, bubble and accessible text agree.
      const value = this.formElement.valueAsNumber
      if (Number.isFinite(value) && value !== this.value) this.value = value
    }
    this.syncFormState()
  }

  /** Mirrors the inputs' clamped and snapped values, swapping them when a programmatic start lies above the end. */
  private sanitizeRange() {
    const start = this.startInput?.valueAsNumber
    const end = this.endInput?.valueAsNumber
    if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)) return
    const [low, high] = start <= end ? [start, end] : [end, start]
    if (low !== this.valueStart) this.valueStart = low
    if (high !== this.valueEnd) this.valueEnd = high
  }

  private syncFormState() {
    const inputs = this.inputs
    if (!inputs.length) return
    if (this.isRange) {
      const data = new FormData()
      if (this.name) for (const input of inputs) data.append(this.name, input.value)
      this.internals.setFormValue(data, data)
    } else {
      const value = inputs[0].value
      this.internals.setFormValue(value, value)
    }
    if (this.effectiveDisabled) {
      this.internals.setValidity({})
      return
    }
    for (const input of inputs) input.setCustomValidity(this.customValidityMessage)
    const anchor = inputs.find((input) => !input.validity.valid) ?? inputs[0]
    this.internals.setValidity(anchor.validity, anchor.validationMessage, anchor)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private handleChange(event: Event) {
    this.value = Number(this.formElement.value)
    redispatchEvent(this, event)
  }

  /** Applies a thumb's new value, holding it on its side of the other thumb. Returns the value kept. */
  private setThumb(thumb: RangeThumb, requested: number): number {
    const value = thumb === 'start' ? Math.min(requested, this.valueEnd) : Math.max(requested, this.valueStart)
    const input = thumb === 'start' ? this.startInput : this.endInput
    if (input && input.valueAsNumber !== value) input.value = String(value)
    if (thumb === 'start') this.valueStart = value
    else this.valueEnd = value
    return value
  }

  private handleRangeInput(thumb: RangeThumb, event: Event) {
    this.setThumb(thumb, (event.target as HTMLInputElement).valueAsNumber)
    redispatchEvent(this, event)
  }

  private handleRangeChange(thumb: RangeThumb, event: Event) {
    this.setThumb(thumb, (event.target as HTMLInputElement).valueAsNumber)
    redispatchEvent(this, event)
  }

  /** Value under a pointer position, snapped to `step`, using the same geometry the thumbs are drawn with. */
  private valueAt(event: PointerEvent): number {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const thumb = this.renderRoot.querySelector<HTMLElement>('.c2-slider-thumb')
    const vertical = this.orientation === 'vertical'
    const size = vertical ? (thumb?.offsetHeight ?? 0) : (thumb?.offsetWidth ?? 0)
    const length = (vertical ? box.height : box.width) - size
    let fraction = length > 0 ? (vertical ? box.bottom - event.clientY : event.clientX - box.left) - size / 2 : 0
    fraction = length > 0 ? Math.min(1, Math.max(0, fraction / length)) : 0
    if (!vertical && getComputedStyle(this).direction === 'rtl') fraction = 1 - fraction
    const raw = this.min + fraction * (this.max - this.min)
    const snapped = this.step > 0 ? this.min + Math.round((raw - this.min) / this.step) * this.step : raw
    return Math.min(this.max, Math.max(this.min, Number(snapped.toFixed(10))))
  }

  /**
   * In range mode the inputs only take presses on their thumbs, so both thumbs stay reachable where they overlap. A
   * press anywhere else on the track moves the nearer thumb to it and keeps dragging that thumb until release.
   */
  private handleTrackPointerDown(event: PointerEvent) {
    if (!this.isRange || this.effectiveDisabled || event.button !== 0) return
    if ((event.target as Element).classList.contains('c2-slider-input')) return
    const value = this.valueAt(event)
    const toStart = Math.abs(value - this.valueStart)
    const toEnd = Math.abs(value - this.valueEnd)
    const thumb: RangeThumb = toStart < toEnd || (toStart === toEnd && value < this.valueStart) ? 'start' : 'end'
    event.preventDefault()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    ;(thumb === 'start' ? this.startInput : this.endInput)?.focus({ preventScroll: true })
    this.trackDrag = { thumb, pointerId: event.pointerId, moved: false }
    this.moveTrackDrag(value)
  }

  private moveTrackDrag(value: number) {
    const drag = this.trackDrag
    if (!drag) return
    const current = drag.thumb === 'start' ? this.valueStart : this.valueEnd
    if (this.setThumb(drag.thumb, value) === current) return
    drag.moved = true
    // Same shape as the native range input's own events, which the thumbs re-dispatch.
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
  }

  private handleTrackPointerMove(event: PointerEvent) {
    if (this.trackDrag?.pointerId === event.pointerId) this.moveTrackDrag(this.valueAt(event))
  }

  private handleTrackPointerUp(event: PointerEvent) {
    const drag = this.trackDrag
    if (drag?.pointerId !== event.pointerId) return
    this.trackDrag = undefined
    if (drag.moved) this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  private renderTicks() {
    if (!this.ticks || this.step <= 0) return nothing
    const count = Math.round((this.max - this.min) / this.step)
    if (count < 1 || count > MAX_TICKS) return nothing
    const [low, high] = this.isRange ? [this.toFraction(this.valueStart), this.toFraction(this.valueEnd)] : [0, this.fraction]
    const marks = []
    for (let i = 0; i <= count; i++) {
      const fraction = i / count
      marks.push(
        html`<span
          class=${classMap({ 'c2-slider-tick': true, 'is-filled': fraction >= low && fraction <= high })}
          style=${styleMap({ '--_p': String(fraction) })}
        ></span>`,
      )
    }
    return html`<div class="c2-slider-ticks" aria-hidden="true">${marks}</div>`
  }

  private rangeLabel(thumbLabel: string) {
    return this.ariaLabel ? `${this.ariaLabel}, ${thumbLabel}` : thumbLabel
  }

  private renderRangeThumb(thumb: RangeThumb, value: number) {
    return html`<div class="c2-slider-thumb is-${thumb}" part="thumb thumb-${thumb}" style=${styleMap({ '--_p': String(this.toFraction(value)) })}>
      ${this.showValue ? html`<div class="c2-slider-value" part="value" aria-hidden="true">${this.formatValue(value)}</div>` : nothing}
    </div>`
  }

  private renderRangeInput(thumb: RangeThumb, value: number) {
    return html`<input
      class="c2-slider-input is-${thumb}"
      type="range"
      min=${this.min}
      max=${this.max}
      step=${this.step}
      .value=${live(String(value))}
      ?disabled=${this.effectiveDisabled}
      aria-label=${this.rangeLabel(thumb === 'start' ? this.startLabel : this.endLabel)}
      aria-valuetext=${this.formatValue(value)}
      aria-orientation=${this.orientation}
      @input=${(event: Event) => this.handleRangeInput(thumb, event)}
      @change=${(event: Event) => this.handleRangeChange(thumb, event)}
    />`
  }

  private renderRange() {
    const start = this.toFraction(this.valueStart)
    // Where the thumbs meet, the one that can still move away from its end of the track must be on top.
    const startOnTop = start > 0.5
    return html`
      <div
        class=${classMap({ 'c2-slider': true, 'is-range': true, 'is-start-on-top': startOnTop })}
        style=${styleMap({ '--_start': String(start), '--_end': String(this.toFraction(this.valueEnd)) })}
        @pointerdown=${this.handleTrackPointerDown}
        @pointermove=${this.handleTrackPointerMove}
        @pointerup=${this.handleTrackPointerUp}
        @pointercancel=${this.handleTrackPointerUp}
      >
        <div class="c2-slider-track" part="track">
          <div class="c2-slider-fill" part="fill"></div>
          ${this.renderTicks()} ${this.renderRangeThumb('start', this.valueStart)} ${this.renderRangeThumb('end', this.valueEnd)}
        </div>
        ${this.renderRangeInput('start', this.valueStart)} ${this.renderRangeInput('end', this.valueEnd)}
      </div>
    `
  }

  override render() {
    if (this.isRange) return this.renderRange()
    const formatted = this.formatValue(this.value)
    return html`
      <div class="c2-slider" style=${styleMap({ '--_p': String(this.fraction) })}>
        <div class="c2-slider-track" part="track">
          <div class="c2-slider-fill" part="fill"></div>
          ${this.renderTicks()}
          <div class="c2-slider-thumb" part="thumb">
            ${this.showValue ? html`<div class="c2-slider-value" part="value" aria-hidden="true">${formatted}</div>` : nothing}
          </div>
        </div>
        <input
          class="c2-slider-input"
          type="range"
          name=${ifDefined(this.name || undefined)}
          min=${this.min}
          max=${this.max}
          step=${this.step}
          .value=${String(this.value)}
          ?disabled=${this.effectiveDisabled}
          aria-label=${ifDefined(this.ariaLabel)}
          aria-labelledby=${ifDefined(this.ariaLabelledBy)}
          aria-valuetext=${formatted}
          aria-orientation=${this.orientation}
          @input=${this.handleInput}
          @change=${this.handleChange}
        />
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-slider': Slider
  }
}
