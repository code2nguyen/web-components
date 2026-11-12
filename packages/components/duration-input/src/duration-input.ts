import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { disabledByAncestor, redispatchEvent } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { DURATION_UNITS, formatDurationText, parseDurationText, unitSeconds, type DurationFormat, type DurationUnit } from './duration.js'
import { durationInputMessages } from './messages.js'
import styles from './duration-input.scss?inline'

export { DURATION_UNITS, durationParts, formatDurationText, parseDurationText, unitSeconds } from './duration.js'
export type { DurationCalendar, DurationFormat, DurationUnit, FormatDurationOptions, ParseDurationOptions } from './duration.js'
export { durationInputMessages } from './messages.js'

/** Events fired by {@link DurationInput}, keyed for `addEventListener`. */
export interface DurationInputEventMap {
  input: InputEvent
  change: Event
}

export interface DurationInput {
  addEventListener: TypedAddEventListener<DurationInput, DurationInputEventMap>
  removeEventListener: TypedRemoveEventListener<DurationInput, DurationInputEventMap>
}

/** Reads `"5400"` as 5400 and an empty or unreadable attribute as no value. */
const secondsConverter = {
  fromAttribute(value: string | null): number | null {
    if (value === null || value.trim() === '') return null
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : null
  },
  toAttribute(value: number | null): string | null {
    return value === null || value === undefined ? null : String(value)
  },
  /**
   * A value assigned to the property: a framework may hand over `''` or `null` for "no value" (Angular's
   * `writeValue(null)`) or a numeric string (Svelte 5, a server renderer), which must not be stored as is.
   */
  fromProperty(value: unknown): number | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'string') return secondsConverter.fromAttribute(value)
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
  },
}

/** Reads a seconds attribute (`min`, `max`, `step`) as a number, or `undefined`. */
const optionalSecondsConverter = {
  fromAttribute(value: string | null): number | undefined {
    if (value === null || value.trim() === '') return undefined
    const number = Number(value)
    return Number.isFinite(number) && number >= 0 ? number : undefined
  },
  /** A string or an empty value assigned to the property, read as the attribute would be. */
  fromProperty(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'string') return optionalSecondsConverter.fromAttribute(value)
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
  },
}

const isUnit = (value: unknown): value is DurationUnit => typeof value === 'string' && (DURATION_UNITS as readonly string[]).includes(value)

/**
 * A text field for an amount of time, as in Jira time tracking and Toggl. It reads `1h 30m`, `90m`, `1.5h` (or
 * `1,5h`), `1:30`, `2 days 4 hours`, `1h30` or a bare `90` in `unit`, and stores the duration in seconds in `value`.
 *
 * While typing, a quiet preview after the text (`= 1 hour, 30 minutes`) says how the text was read. When the field is
 * left, the text is rewritten in `format`: `short` (`1h 30m`, the default), `long` (`1 hour, 30 minutes`, in the
 * element's language) or `clock` (`1:30`). `largest-unit` and `smallest-unit` bound the units written, so with
 * `largest-unit="h"` two days read `48h`. `day-hours` and `week-days` set how long `d` and `w` are: time tracking
 * often counts a day as 8 hours and a week as 5 days.
 *
 * `step` (seconds) rounds the value when the field is left, and Arrow Up/Down add or remove one `step` (one `unit`
 * when there is no step). `min` and `max` are seconds too.
 *
 * It is a form control: under a `name` the form receives the seconds, `required` asks for a value, text that cannot be
 * read sets `badInput`, and `min`/`max` set the range flags. Its own message shows below the field once it is left
 * (or after a failed submit), and inside a `c2-form-field` the field shows it instead. The words each unit accepts and
 * every message are translatable. `parseDurationText()` and `formatDurationText()` are exported for tables and APIs.
 *
 * @tag c2-duration-input
 *
 * @slot icon - Replaces the clock icon before the text.
 *
 * @csspart icon - The box around the clock icon.
 * @csspart preview - The preview after the text while typing (`= 1 hour, 30 minutes`).
 * @csspart supporting-text - The help text or error message below the field.
 *
 * @event {InputEvent} input - Re-dispatched while typing, and when Arrow Up/Down changes the value.
 * @event {Event} change - Re-dispatched when the edited text is committed, after the value is rounded to `step`, and when Arrow Up/Down changes the value.
 *
 * @cssproperty {pixel} [--c2-duration-input--min-height=36px] - The field's height.
 * @cssproperty {border} [--c2-duration-input--border=1px solid #bcbcc6] - The field's border.
 * @cssproperty {border-radius} [--c2-duration-input--border-radius=6px] - The field's corner radius.
 * @cssproperty {color} [--c2-duration-input--color=#18181b] - The text colour.
 * @cssproperty {color} [--c2-duration-input--background=#ffffff] - The field's background.
 * @cssproperty {font-size} [--c2-duration-input--font-size=14px] - The text size.
 * @cssproperty {font-family} [--c2-duration-input--font-family=inherit] - The text font.
 * @cssproperty {pixel} [--c2-duration-input--line-height=20px] - The text line height.
 * @cssproperty {padding} [--c2-duration-input__value--padding=6px 12px 6px 10px] - Space inside the field.
 * @cssproperty {pixel} [--c2-duration-input__value--gap=8px] - Space between the icon, the text and the preview.
 * @cssproperty {color} [--c2-duration-input__placeholder--color=#71717a] - The placeholder colour.
 * @cssproperty {color} [--c2-duration-input__icon--color=#71717a] - The clock icon's colour.
 * @cssproperty {pixel} [--c2-duration-input__icon--size=16px] - The clock icon's size.
 * @cssproperty {color} [--c2-duration-input__preview--color=#71717a] - The colour of the preview after the text.
 * @cssproperty {font-size} [--c2-duration-input__preview--font-size=12px] - The size of the preview after the text.
 * @cssproperty {border} [--c2-duration-input__hover--border=1px solid #a1a1aa] - The border on hover.
 * @cssproperty {border} [--c2-duration-input__focus--border=1px solid #0265dc] - The border while focused.
 * @cssproperty {outline} [--c2-duration-input__focus--outline=none] - The outline while focused.
 * @cssproperty {pixel} [--c2-duration-input__focus--outline-offset=0px] - The outline offset while focused.
 * @cssproperty {border} [--c2-duration-input__error--border=1px solid #dc2626] - The border while invalid.
 * @cssproperty {outline} [--c2-duration-input__error__focus--outline=none] - The outline while invalid and focused.
 * @cssproperty {color} [--c2-duration-input__read-only--background=#fafafa] - The background while read-only.
 * @cssproperty {opacity} [--c2-duration-input__disabled--opacity=0.38] - The opacity while disabled.
 * @cssproperty {pixel} [--c2-duration-input__supporting-text--gap=4px] - Space between the field and its supporting text.
 * @cssproperty {font-size} [--c2-duration-input__supporting-text--font-size=12px] - The supporting text's size.
 * @cssproperty {pixel} [--c2-duration-input__supporting-text--line-height=16px] - The supporting text's line height.
 * @cssproperty {color} [--c2-duration-input__supporting-text--color=#71717a] - The help text's colour.
 * @cssproperty {color} [--c2-duration-input__supporting-text__error--color=#dc2626] - The error message's colour.
 */
@customElement('c2-duration-input')
export class DurationInput extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, durationInputMessages)
  /** Label and description handed down by an enclosing `c2-form-field`, which then draws the supporting line. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  @query('input') private readonly input?: HTMLInputElement

  /** The duration in seconds, or `null` for none. In markup, a number of seconds (`value="5400"`). */
  @property({ converter: secondsConverter }) value: number | null = null
  /** Form field name. The form receives the duration in seconds. */
  @property({ type: String, reflect: true }) name = ''
  /** The unit of a bare number such as `90`: `w`, `d`, `h`, `m` (the default) or `s`. Arrow Up/Down step by it when there is no `step`. */
  @property({ type: String }) unit: DurationUnit = 'm'
  /** How the duration is written once the field is left: `short` (`1h 30m`), `long` (`1 hour, 30 minutes`) or `clock` (`1:30`). */
  @property({ type: String }) format: DurationFormat = 'short'
  /** The largest unit written: with `h`, two days read `48h`. Days by default. */
  @property({ attribute: 'largest-unit' }) largestUnit: DurationUnit = 'd'
  /** The smallest unit written; what is left below it is rounded. Seconds by default. */
  @property({ attribute: 'smallest-unit' }) smallestUnit: DurationUnit = 's'
  /** Hours in a day, `d`. Time tracking often uses 8. */
  @property({ type: Number, attribute: 'day-hours' }) dayHours = 24
  /** Days in a week, `w`. Time tracking often uses 5. */
  @property({ type: Number, attribute: 'week-days' }) weekDays = 7
  /** The shortest valid duration, in seconds. */
  @property({ converter: optionalSecondsConverter }) min?: number
  /** The longest valid duration, in seconds. */
  @property({ converter: optionalSecondsConverter }) max?: number
  /** Seconds the value is rounded to when the field is left (900 rounds to 15 minutes), and the amount Arrow Up/Down add. */
  @property({ converter: optionalSecondsConverter }) step?: number
  /** Text shown while the field is empty. Defaults to the translatable `e.g. 1h 30m`. */
  @property({ type: String }) placeholder = ''
  /** Requires a duration before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Applies the visual error state and sets `aria-invalid`, showing `error-text`. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the field. */
  @property({ type: String }) help = ''
  /** Message shown below the field while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Accessible name forwarded to the text field. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** The text in the field. Kept as typed while focused; rewritten from `value` otherwise. */
  @state() private text = ''
  @state() private focused = false
  /** Set once the field is left or a submit fails: from then on its own message shows. */
  @state() private touched = false
  @state() private disabledByForm = false
  private customValidityMessage = ''
  private defaultValue: number | null = null
  private defaultCaptured = false
  /** The value the text was last written from, so an outside change to `value` rewrites it. */
  private writtenValue: number | null | undefined = undefined

  constructor() {
    super()
    this.addEventListener('invalid', () => (this.touched = true))
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
  /** The text as written in `format`, or `''` when there is no value. */
  get valueAsText(): string {
    return this.value === null ? '' : this.write(this.value, this.format)
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = secondsConverter.fromAttribute(this.getAttribute('value'))
      this.defaultCaptured = true
    }
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }
  /** Selects the text. */
  select() {
    this.input?.select()
  }
  /** Adds `step` (one `unit` without a step) a given number of times. */
  stepUp(amount = 1) {
    this.stepBy(Math.max(1, Math.trunc(amount)))
  }
  /** Removes `step` (one `unit` without a step) a given number of times, down to zero. */
  stepDown(amount = 1) {
    this.stepBy(-Math.max(1, Math.trunc(amount)))
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
    this.value = this.defaultValue
    this.writtenValue = undefined
    this.touched = false
    this.error = false
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = secondsConverter.fromAttribute(state)
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get calendar() {
    return { dayHours: this.dayHours, weekDays: this.weekDays }
  }

  private write(seconds: number, format: DurationFormat): string {
    return formatDurationText(seconds, {
      ...this.calendar,
      format,
      largestUnit: isUnit(this.largestUnit) ? this.largestUnit : 'd',
      smallestUnit: isUnit(this.smallestUnit) ? this.smallestUnit : 's',
      locale: this.msg.locale,
    })
  }

  private read(text: string): number | null {
    const words = (key: 'weekWords' | 'dayWords' | 'hourWords' | 'minuteWords' | 'secondWords') => this.msg.t(key).split(/\s+/).filter(Boolean)
    return parseDurationText(text, {
      ...this.calendar,
      unit: isUnit(this.unit) ? this.unit : 'm',
      words: { w: words('weekWords'), d: words('dayWords'), h: words('hourWords'), m: words('minuteWords'), s: words('secondWords') },
    })
  }

  /**
   * `min` or `max` written as a duration (`1h`), or an empty string when it is not set. A wrapping `c2-form-field`
   * reads it for its range messages, which would otherwise show the raw seconds.
   */
  formatBound(bound: 'min' | 'max'): string {
    const seconds = this[bound]
    return seconds === undefined || seconds === null ? '' : this.write(seconds, 'short')
  }

  /** The value rounded to `step`. */
  private rounded(seconds: number): number {
    const step = this.step
    return step && step > 0 ? Math.round(seconds / step) * step : seconds
  }

  /** The text cannot be read as a duration. */
  private get badInput(): boolean {
    return this.text.trim() !== '' && this.read(this.text) === null
  }

  private handleInput(event: InputEvent) {
    this.text = (event.target as HTMLInputElement).value
    const seconds = this.read(this.text)
    this.value = seconds
    this.writtenValue = seconds
    redispatchEvent(this, event)
  }

  private handleChange(event: Event) {
    // Rounding to `step` changes the value after the last `input`: say so, or a binding (v-model, ngModel) that only
    // listens to `input` keeps the value from before the rounding.
    if (this.commit()) this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
    redispatchEvent(this, event)
  }

  /**
   * Rounds the value to `step` and rewrites the text in `format`, unless the text cannot be read. Returns whether the
   * value changed.
   */
  private commit(): boolean {
    const seconds = this.read(this.text)
    if (seconds === null) return false
    const before = this.value
    const value = this.rounded(seconds)
    this.value = value
    this.writtenValue = value
    this.text = this.write(value, this.format)
    return value !== before
  }

  private handleFocusIn(event: FocusEvent) {
    this.focused = true
    redispatchEvent(this, event)
  }

  private handleFocusOut(event: FocusEvent) {
    this.focused = false
    this.touched = true
    // A field left without an edit still gets its text written in `format`. If that rounds the value to `step`, the
    // browser fires no `change` (nothing was typed), so both events come from here.
    if (this.commit()) {
      this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
      this.dispatchEvent(new Event('change', { bubbles: true }))
    }
    redispatchEvent(this, event)
  }

  private handleKeyDown(event: KeyboardEvent) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    event.preventDefault()
    this.stepBy(event.key === 'ArrowUp' ? 1 : -1)
  }

  private stepBy(times: number) {
    if (this.effectiveDisabled || this.readOnly) return
    const base = this.badInput ? (this.value ?? 0) : (this.read(this.text) ?? this.value ?? 0)
    const step = this.step && this.step > 0 ? this.step : 0
    const size = step || unitSeconds(isUnit(this.unit) ? this.unit : 'm', this.calendar)
    // With a step, move along its grid, so 1h 20m steps up to 1h 30m rather than 1h 35m.
    let next = step ? (times > 0 ? Math.floor(base / step) : Math.ceil(base / step)) * step + times * step : base + times * size
    next = Math.max(0, next)
    if (this.max !== undefined) next = Math.min(next, this.max)
    if (this.min !== undefined) next = Math.max(next, this.min)
    if (next === this.value && this.text === this.write(next, this.format)) return
    this.value = next
    this.writtenValue = next
    this.text = this.write(next, this.format)
    this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertReplacementText' }))
    this.dispatchEvent(new Event('change', { bubbles: true, composed: true }))
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    // An outside change to `value` (or to how it is written) rewrites the text; typing does not.
    const formatting = changed.has('format') || changed.has('largestUnit') || changed.has('smallestUnit') || changed.has('dayHours') || changed.has('weekDays')
    if (this.value !== this.writtenValue || (formatting && !this.focused)) {
      this.writtenValue = this.value
      this.text = this.value === null ? '' : this.write(this.value, this.format)
    }
  }

  protected override updated() {
    this.syncFormState()
  }

  /** The message for the field's current problem, `''` when it is valid. */
  private problem(): { flags: ValidityStateFlags; message: string } | null {
    if (this.customValidityMessage) return { flags: { customError: true }, message: this.customValidityMessage }
    if (this.badInput) return { flags: { badInput: true }, message: this.msg.t('badInput') }
    if (this.value === null) return this.required ? { flags: { valueMissing: true }, message: this.msg.t('valueMissing') } : null
    if (this.min !== undefined && this.value < this.min)
      return { flags: { rangeUnderflow: true }, message: this.msg.t('rangeUnderflow', this.write(this.min, 'short')) }
    if (this.max !== undefined && this.value > this.max)
      return { flags: { rangeOverflow: true }, message: this.msg.t('rangeOverflow', this.write(this.max, 'short')) }
    return null
  }

  private syncFormState() {
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    const value = this.value === null ? '' : String(this.value)
    this.internals.setFormValue(value, value)
    const problem = this.problem()
    if (problem) this.internals.setValidity(problem.flags, problem.message, this.input)
    else this.internals.setValidity({})
  }

  private renderIcon() {
    return html`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
      <path d="M5.5 1.5h5M8 1.5v2"></path>
      <circle cx="8" cy="9" r="5.5"></circle>
      <path d="M8 6v3l2 1.2"></path>
    </svg>`
  }

  override render() {
    const disabled = this.effectiveDisabled
    const problem = disabled ? null : this.problem()
    // Once the field has been left (or a submit failed), its problem shows, also while it is corrected.
    const ownError = this.touched && problem ? problem.message : ''
    const showAuthorError = this.error && !disabled
    const errorMessage = showAuthorError ? this.errorText : ownError
    // An enclosing field asks for the invalid look without the component's own message, and draws the line itself.
    const invalid = !disabled && (this.error || this.field.invalid || !!ownError)
    const message = errorMessage || this.help
    const showSupporting = !this.field.managed && !!message
    const seconds = this.focused ? this.read(this.text) : null
    const preview = seconds !== null && this.text.trim() !== this.write(seconds, 'long') ? this.msg.t('preview', this.write(seconds, 'long')) : ''
    return html`
      <div class="field ${classMap({ focused: this.focused, error: invalid, 'read-only': this.readOnly, disabled })}" @click=${() => this.input?.focus()}>
        <span class="icon" part="icon"><slot name="icon">${this.renderIcon()}</slot></span>
        <input
          type="text"
          autocomplete="off"
          spellcheck="false"
          aria-label=${ifDefined(this.ariaLabel || this.field.label || undefined)}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${this.field.describedBy(preview && 'preview', showSupporting && 'supporting-text')}
          placeholder=${this.placeholder || this.msg.t('placeholder')}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${disabled}
          .value=${live(this.text)}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @keydown=${this.handleKeyDown}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
        />
        <span id="preview" class="preview" part="preview" ?hidden=${!preview}>${preview}</span>
      </div>
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${classMap({ error: !!errorMessage })}" part="supporting-text">${message}</div>`
          : nothing
      }
      ${this.field.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-duration-input': DurationInput
  }
}
