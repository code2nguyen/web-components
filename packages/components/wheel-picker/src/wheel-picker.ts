import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { wheelPickerMessages } from './messages'
import styles from './wheel-picker.scss?inline'

export { wheelPickerMessages } from './messages'

/** One row of a wheel. */
export interface WheelOption {
  value: string
  /** What the row shows; defaults to the value. */
  label?: string
  /** Shown faded and never picked: a wheel that settles on it moves on to the nearest enabled row. */
  disabled?: boolean
}

/** One wheel. */
export interface WheelColumn {
  options: (string | WheelOption)[]
  /** The wheel's accessible name ("Feet"). */
  label?: string
  /** Fixed text after the wheel ("ft", "kg"), read with its value. */
  suffix?: string
}

/** Events fired by {@link WheelPicker}, keyed for `addEventListener`. */
export interface WheelPickerEventMap {
  input: Event
  change: CustomEvent<{ value: string[] }>
}

export interface WheelPicker {
  addEventListener: TypedAddEventListener<WheelPicker, WheelPickerEventMap>
  removeEventListener: TypedRemoveEventListener<WheelPicker, WheelPickerEventMap>
}

interface Wheel {
  options: WheelOption[]
  label: string
  suffix: string
}

/** Reads `options` as JSON, or else as a `;`-separated list ("kg;lb"). */
const optionsConverter = {
  fromAttribute: (value: string | null) => {
    if (!value) return []
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return value.split(';').filter(Boolean)
    }
  },
  toAttribute: (value: unknown) => JSON.stringify(value),
  // A string assigned to the property (a server renderer, Svelte) reads like the attribute.
  fromProperty: (value: unknown) => (typeof value === 'string' ? optionsConverter.fromAttribute(value) : value),
}

/** How long a wheel's scroll has to stay still before its row counts as picked (where `scrollend` is missing). */
const SETTLE = 150

const normalize = (option: string | WheelOption): WheelOption | null =>
  typeof option === 'string'
    ? { value: option }
    : option && typeof option.value === 'string'
      ? option
      : option && option.value != null
        ? { ...option, value: String(option.value) }
        : null

/**
 * Scroll wheels to pick a value, like the pickers of iOS (the time, a timer, Health's height and weight) and the value
 * pickers of MyFitnessPal and Strava: each wheel is a column of rows that scrolls and snaps, and the row in the band
 * across the middle is its value.
 *
 * `columns` lists the wheels, each with its `options` (strings, or `{ value, label?, disabled? }`), a `label` that
 * names it and a fixed `suffix` shown after it ("ft", "kg"); `options` alone is the shorthand for one wheel. `value`
 * holds one value per wheel (as an attribute, separated by `;`). A wheel without a value starts on its first enabled
 * row, so the picker always has a value.
 *
 * Scrolling, a swipe or the mouse wheel moves a wheel; the row it settles on becomes its value and fires `input` then
 * `change`. Clicking a row brings it to the band. A disabled row is skipped. Setting `value` turns the wheels without
 * firing events. How many rows show, their height and the band are CSS (`--c2-wheel-picker--visible-rows`, …).
 *
 * Each wheel is a spin button: Up and Down step a row, Page Up and Page Down five, Home and End go to the ends. It is a
 * form control: under a `name` the form receives the values joined by `;`, and it takes part in `c2-form-field`.
 *
 * @tag c2-wheel-picker
 *
 * @event {Event} input - Fired when the user turns a wheel to another row, before `change`. Read `value`.
 * @event {CustomEvent<{ value: string[] }>} change - Fired after the user turns a wheel to another row. Not fired for programmatic changes.
 *
 * @csspart wheels - The row of wheels, with the band across it.
 * @csspart wheel - One wheel.
 * @csspart row - One row of a wheel.
 * @csspart suffix - The fixed text after a wheel.
 *
 * @cssproperty {number} [--c2-wheel-picker--visible-rows=5] - How many rows show; an odd number keeps the band in the middle.
 * @cssproperty {pixel} [--c2-wheel-picker__row--height=36px]
 * @cssproperty {font-size} [--c2-wheel-picker--font-size=20px]
 * @cssproperty {color} [--c2-wheel-picker--color=#18181b]
 * @cssproperty {color} [--c2-wheel-picker__row--color=#a1a1aa] - Rows outside the band.
 * @cssproperty {font-weight} [--c2-wheel-picker__row__selected--font-weight=500] - The row in the band.
 * @cssproperty {color} [--c2-wheel-picker__band--background=#f4f4f5]
 * @cssproperty {border-radius} [--c2-wheel-picker__band--border-radius=8px]
 * @cssproperty {pixel} [--c2-wheel-picker--gap=8px] - Space between the wheels.
 * @cssproperty {pixel} [--c2-wheel-picker__wheel--min-width=56px]
 * @cssproperty {color} [--c2-wheel-picker__suffix--color=#18181b]
 * @cssproperty {font-size} [--c2-wheel-picker__suffix--font-size=16px]
 * @cssproperty {opacity} [--c2-wheel-picker__row__disabled--opacity=0.3]
 * @cssproperty {outline} [--c2-wheel-picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-wheel-picker__error--border=1px solid #dc2626] - Around the band while an enclosing `c2-form-field` shows an error.
 */
@customElement('c2-wheel-picker')
export class WheelPicker extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The wheels. As an attribute, a JSON array of `{ options, label?, suffix? }`. */
  @property({ converter: jsonPropertyConverter }) columns: WheelColumn[] = []

  /** Shorthand for a single wheel's options: a JSON array, or a `;`-separated list. */
  @property({ converter: optionsConverter }) options: (string | WheelOption)[] = []

  /** One value per wheel. As an attribute, a `;`-separated list. Not reflected: the attribute stays as the author wrote it. */
  @property({ converter: arrayPropertyConverter }) value: string[] = []

  /** Form field name: the form receives the values joined by `;`. */
  @property({ reflect: true }) name = ''

  /** Turns the wheels off; as for a disabled form control, the value is not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the picker. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  @state() private disabledByForm = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, wheelPickerMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultValue: string[] | undefined
  private customValidityMessage = ''
  private wheels: Wheel[] = []
  private settleTimers = new Map<number, ReturnType<typeof setTimeout>>()
  /** Wheels being turned from code: their scroll does not count as the user's. */
  private steering = new Set<number>()
  /** Wheels already scrolling, smoothly, to the value just chosen: their scroll is not cut short by a jump. */
  private gliding = new Set<number>()
  /** A picker rendered while hidden (a closed sheet, a tab) has no scroll position yet: it turns its wheels once it has a size. */
  private readonly resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.turnToValue())
  /** Where `scrollend` is missing, a pointer still down holds the wheel: the settle timer only runs after it lifts. */
  private dragging = false

  constructor() {
    super()
    this.internals.role = 'group'
  }

  get form() {
    return this.internals.form
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
    this.value = [...(this.defaultValue ?? [])]
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state ? state.split(';') : []
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.resizeObserver?.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.resizeObserver?.disconnect()
    for (const timer of this.settleTimers.values()) clearTimeout(timer)
    this.settleTimers.clear()
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('columns') || changed.has('options')) {
      const columns: WheelColumn[] = Array.isArray(this.columns) && this.columns.length ? this.columns : [{ options: this.singleOptions() }]
      this.wheels = columns.map((column) => ({
        options: (Array.isArray(column?.options) ? column.options : []).map(normalize).filter((option): option is WheelOption => option !== null),
        label: column?.label ?? '',
        suffix: column?.suffix ?? '',
      }))
    }
    // Every wheel holds a value: one that is missing, unknown or disabled moves to the nearest enabled row.
    const values = Array.isArray(this.value) ? this.value : []
    const next = this.wheels.map((wheel, at) => {
      const index = wheel.options.findIndex((option) => option.value === values[at])
      return wheel.options[this.nearestEnabled(at, index < 0 ? 0 : index)]?.value ?? ''
    })
    if (next.length !== values.length || next.some((value, at) => value !== values[at])) this.value = next
    if (this.defaultValue === undefined && this.wheels.some((wheel) => wheel.options.length)) this.defaultValue = [...this.value]
    this.internals.ariaLabel = this.label || this.field.label || this.msg.t('label')
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.syncFormState()
    if (changed.has('value') || changed.has('columns') || changed.has('options')) this.turnToValue()
  }

  private singleOptions(): (string | WheelOption)[] {
    const options: unknown = this.options
    if (Array.isArray(options)) return options
    return typeof options === 'string' ? options.split(';').filter(Boolean) : []
  }

  /** The enabled row nearest to `index` (itself when enabled), or -1 when the wheel has none. */
  private nearestEnabled(wheel: number, index: number): number {
    const options = this.wheels[wheel]?.options ?? []
    for (let distance = 0; distance < options.length; distance++) {
      for (const candidate of [index + distance, index - distance]) {
        if (candidate >= 0 && candidate < options.length && !options[candidate].disabled) return candidate
      }
    }
    return -1
  }

  private indexOf(wheel: number): number {
    return Math.max(0, this.wheels[wheel]?.options.findIndex((option) => option.value === this.value[wheel]) ?? 0)
  }

  private tracks(): HTMLElement[] {
    return [...(this.renderRoot?.querySelectorAll<HTMLElement>('.track') ?? [])]
  }

  private rowHeight(track: HTMLElement): number {
    return track.querySelector<HTMLElement>('.row')?.offsetHeight || 36
  }

  /** Scrolls every wheel to its value, without firing events. */
  private turnToValue(): void {
    this.tracks().forEach((track, wheel) => {
      if (this.gliding.delete(wheel)) return
      const top = this.indexOf(wheel) * this.rowHeight(track)
      if (Math.abs(track.scrollTop - top) < 1) return
      this.steering.add(wheel)
      track.scrollTo({ top, behavior: 'instant' as ScrollBehavior })
      // The scroll events of that jump arrive after this frame; the wheel is the user's again after them.
      requestAnimationFrame(() => requestAnimationFrame(() => this.steering.delete(wheel)))
    })
  }

  private syncFormState(): void {
    const joined = this.value.join(';')
    this.internals.setFormValue(this.effectiveDisabled || !this.name ? null : joined, joined)
    const flags = this.customValidityMessage ? { customError: true } : {}
    const anchor = this.renderRoot?.querySelector<HTMLElement>('.wheel') ?? undefined
    this.internals.setValidity(flags, this.customValidityMessage, anchor)
  }

  /** Sets one wheel's value as the user's choice: fires `input` then `change`. */
  private choose(wheel: number, index: number, gliding = false): void {
    const option = this.wheels[wheel]?.options[index]
    if (!option || option.disabled || this.effectiveDisabled || option.value === this.value[wheel]) return
    if (gliding) this.gliding.add(wheel)
    const next = [...this.value]
    next[wheel] = option.value
    this.value = next
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value: [...next] }, bubbles: true, composed: true }))
  }

  /** The row a wheel came to rest on becomes its value; a disabled one hands over to the nearest enabled row. */
  private settle(wheel: number, track: HTMLElement): void {
    clearTimeout(this.settleTimers.get(wheel))
    this.settleTimers.delete(wheel)
    if (this.steering.has(wheel)) return
    const height = this.rowHeight(track)
    const resting = Math.round(track.scrollTop / height)
    const index = this.nearestEnabled(wheel, Math.min(resting, (this.wheels[wheel]?.options.length ?? 1) - 1))
    if (index < 0) return
    if (index !== resting) track.scrollTo({ top: index * height, behavior: this.scrollBehavior() })
    this.choose(wheel, index, true)
  }

  private scrollBehavior(): ScrollBehavior {
    return matchMedia('(prefers-reduced-motion: reduce)').matches ? ('instant' as ScrollBehavior) : 'smooth'
  }

  private handleScroll(wheel: number, event: Event): void {
    // Where the browser has scrollend, it alone settles a wheel; the timer is the fallback.
    if (this.steering.has(wheel) || 'onscrollend' in window || this.dragging) return
    const track = event.currentTarget as HTMLElement
    clearTimeout(this.settleTimers.get(wheel))
    this.settleTimers.set(
      wheel,
      setTimeout(() => this.settle(wheel, track), SETTLE),
    )
  }

  private handleKeydown(wheel: number, event: KeyboardEvent): void {
    const count = this.wheels[wheel]?.options.length ?? 0
    if (!count || this.effectiveDisabled) return
    const at = this.indexOf(wheel)
    const options = this.wheels[wheel].options
    const step = (from: number, delta: number) => {
      // The row that far, clamped to the ends; when it is disabled, the next enabled one onward, else the nearest one
      // back towards where the wheel was. Where there is none, the wheel stays.
      const direction = Math.sign(delta) || 1
      const clamped = Math.min(count - 1, Math.max(0, from + delta))
      for (let index = clamped; index >= 0 && index < count; index += direction) if (!options[index].disabled) return index
      for (let index = clamped - direction; index !== at && index >= 0 && index < count; index -= direction) if (!options[index].disabled) return index
      return at
    }
    let target: number
    switch (event.key) {
      case 'ArrowUp':
        target = step(at, -1)
        break
      case 'ArrowDown':
        target = step(at, 1)
        break
      case 'PageUp':
        target = step(at, -5)
        break
      case 'PageDown':
        target = step(at, 5)
        break
      case 'Home':
        target = step(-1, 1)
        break
      case 'End':
        target = step(count, -1)
        break
      default:
        return
    }
    event.preventDefault()
    if (target === at) return
    const track = event.currentTarget as HTMLElement
    track.scrollTo({ top: target * this.rowHeight(track), behavior: this.scrollBehavior() })
    this.choose(wheel, target, true)
  }

  private handleRowClick(wheel: number, index: number, event: Event): void {
    if (this.effectiveDisabled || this.wheels[wheel]?.options[index]?.disabled) return
    const track = (event.currentTarget as HTMLElement).closest<HTMLElement>('.track')
    if (!track) return
    track.scrollTo({ top: index * this.rowHeight(track), behavior: this.scrollBehavior() })
    this.choose(wheel, index, true)
  }

  override render() {
    const disabled = this.effectiveDisabled
    const invalid = this.field.invalid && !disabled
    const count = this.wheels.length
    return html`<div class="wheels ${invalid ? 'wheels--invalid' : ''}" part="wheels">
        <div class="band" aria-hidden="true"></div>
        ${this.wheels.map((wheel, at) => {
          const index = this.indexOf(at)
          const option = wheel.options[index]
          const text = option ? `${option.label ?? option.value}${wheel.suffix ? ` ${wheel.suffix}` : ''}` : ''
          return html`<div class="column">
            <div
              class="wheel track"
              part="wheel"
              role="spinbutton"
              tabindex=${disabled ? -1 : 0}
              aria-label=${wheel.label || (count > 1 ? this.msg.t('wheel', at + 1, count) : this.label || this.field.label || this.msg.t('label'))}
              aria-valuenow=${index}
              aria-valuemin="0"
              aria-valuemax=${Math.max(0, wheel.options.length - 1)}
              aria-valuetext=${text}
              aria-disabled=${disabled ? 'true' : nothing}
              aria-invalid=${invalid ? 'true' : nothing}
              aria-describedby=${this.field.describedBy()}
              @keydown=${(event: KeyboardEvent) => this.handleKeydown(at, event)}
              @scroll=${(event: Event) => this.handleScroll(at, event)}
              @pointerdown=${() => (this.dragging = true)}
              @pointerup=${() => (this.dragging = false)}
              @pointercancel=${() => (this.dragging = false)}
              @scrollend=${(event: Event) => this.settle(at, event.currentTarget as HTMLElement)}
            >
              ${wheel.options.map(
                (row, rowIndex) =>
                  html`<div
                    class="row ${rowIndex === index ? 'row--selected' : ''} ${row.disabled ? 'row--disabled' : ''}"
                    part="row"
                    aria-hidden="true"
                    @click=${(event: Event) => this.handleRowClick(at, rowIndex, event)}
                  >
                    ${row.label ?? row.value}
                  </div>`,
              )}
            </div>
            ${wheel.suffix ? html`<span class="suffix" part="suffix" aria-hidden="true">${wheel.suffix}</span>` : nothing}
          </div>`
        })}
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-wheel-picker': WheelPicker
  }
}
