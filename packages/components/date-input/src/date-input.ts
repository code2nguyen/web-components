import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { disabledByAncestor, redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import styles from './date-input.scss?inline'

/** What the calendar button opens: the browser's own date picker, or the themed calendar popover. */
export type DateInputPicker = 'native' | 'calendar'

/** Events fired by {@link DateInput}, keyed for `addEventListener`. */
export interface DateInputEventMap {
  input: InputEvent
  change: Event
}

export interface DateInput {
  addEventListener: TypedAddEventListener<DateInput, DateInputEventMap>
  removeEventListener: TypedRemoveEventListener<DateInput, DateInputEventMap>
}

/**
 * A form-associated single-date field backed by a native `<input type="date">`. Values, `min` and `max` use local
 * calendar ISO strings (`YYYY-MM-DD`). The native picker and keyboard editing remain available while the component
 * adds a consistent field, calendar affordance, helper text, error state and theming surface.
 *
 * With `picker="calendar"` the calendar button (and Alt+ArrowDown in the field) opens a themed calendar popover in
 * place of the browser's picker: one month of `c2-date-selector` with Today and Clear, bounded by `min` and `max`.
 * Picking a day stores it, fires `input` and `change` and closes the popover; Escape or a press outside closes it.
 * The date can still be typed in the field. The calendar and its popover are loaded the first time one opens, so a
 * field that never opens it stays as small as the native one. Buttons slotted into `calendar-actions` (presets
 * such as "In a week") sit beside Today and Clear; set `value` from them and call `hideCalendar()`.
 *
 * @tag c2-date-input
 *
 * @slot calendar-icon - Replaces the calendar icon at the end of the field.
 * @slot calendar-actions - Buttons at the bottom of the calendar popover (`picker="calendar"`), before Today and Clear: presets, for example.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from the inner date input whenever the value changes.
 * @event {Event} change - Re-dispatched from the inner date input when the value is committed.
 *
 * @csspart calendar - The calendar popover's surface (`picker="calendar"`).
 * @csspart calendar-actions - The row at the bottom of the calendar popover holding the `calendar-actions` slot, Today and Clear.
 *
 * @cssproperty {pixel} [--c2-date-input--min-height=36px]
 * @cssproperty {pixel} [--c2-date-input--gap=8px]
 * @cssproperty {padding} [--c2-date-input--padding=6px 8px 6px 12px]
 * @cssproperty {border} [--c2-date-input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-date-input--border-radius=6px]
 * @cssproperty {color} [--c2-date-input--color=#18181b]
 * @cssproperty {color} [--c2-date-input--background=#ffffff]
 * @cssproperty {font-size} [--c2-date-input--font-size=14px]
 * @cssproperty {font-family} [--c2-date-input--font-family=inherit]
 * @cssproperty {pixel} [--c2-date-input--line-height=20px]
 * @cssproperty {border} [--c2-date-input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-date-input__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-date-input__focus--outline=none]
 * @cssproperty {pixel} [--c2-date-input__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-date-input__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-date-input__error__focus--outline=none]
 * @cssproperty {color} [--c2-date-input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-date-input__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-date-input__calendar-icon--size=18px]
 * @cssproperty {color} [--c2-date-input__calendar-icon--color=#71717a]
 * @cssproperty {color} [--c2-date-input__calendar-icon__hover--color=#18181b]
 * @cssproperty {pixel} [--c2-date-input__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-date-input__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-date-input__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-date-input__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-date-input__supporting-text__error--color=#dc2626]
 * @cssproperty {color} [--c2-date-input__calendar--background=#ffffff] - Surface of the calendar popover (`picker="calendar"`).
 * @cssproperty {color} [--c2-date-input__calendar--color=#18181b]
 * @cssproperty {border} [--c2-date-input__calendar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-date-input__calendar--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-date-input__calendar--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-date-input__calendar--padding=8px]
 * @cssproperty {pixel} [--c2-date-input__calendar-actions--gap=4px]
 * @cssproperty {border} [--c2-date-input__calendar-actions--border-top=1px solid #e4e4e7]
 * @cssproperty {padding} [--c2-date-input__calendar-action--padding=6px 10px] - The Today and Clear buttons.
 * @cssproperty {border-radius} [--c2-date-input__calendar-action--border-radius=6px]
 * @cssproperty {color} [--c2-date-input__calendar-action--color=#0265dc]
 * @cssproperty {font-size} [--c2-date-input__calendar-action--font-size=14px]
 * @cssproperty {font-weight} [--c2-date-input__calendar-action--font-weight=500]
 * @cssproperty {color} [--c2-date-input__calendar-action__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-date-input__calendar-action__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {opacity} [--c2-date-input__calendar-action__disabled--opacity=0.38]
 */
@customElement('c2-date-input')
export class DateInput extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private customValidityMessage = ''
  private defaultValue = ''
  private defaultCaptured = false
  @state() private disabledByForm = false
  @state() private focused = false
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  /** Label and description handed down by an enclosing `c2-form-field`, which then draws the supporting line. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  @query('input') private readonly input?: HTMLInputElement
  @query('.field') private readonly fieldElement?: HTMLElement
  @state() private calendarOpen = false
  /** The calendar popover, once its module has loaded. */
  private calendar?: import('./calendar.js').Calendar

  /** Current date as a local-calendar `YYYY-MM-DD` string, or an empty string. */
  @property({ type: String, reflect: true }) value = ''
  /** Earliest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) min = ''
  /** Latest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) max = ''
  /** Number of days between valid dates. */
  @property({ type: Number }) step = 1
  /** Form field name. */
  @property({ type: String, reflect: true }) name = ''
  /** Browser autocomplete hint, for example `bday`. */
  @property({ type: String }) autocomplete = ''
  /** Requires a date before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Applies the visual error state and sets `aria-invalid`. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the field. */
  @property({ type: String }) help = ''
  /** Message shown below the field while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /**
   * What the calendar button opens: `native`, the browser's date picker, or `calendar`, a themed calendar popover
   * with Today and Clear that is loaded the first time it opens.
   */
  @property({ type: String }) picker: DateInputPicker = 'native'
  /** Accessible name forwarded to the native date input. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

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
  /** Current date as a `Date` at UTC midnight, or `null` when empty. */
  get valueAsDate() {
    return this.input?.valueAsDate ?? null
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = this.getAttribute('value') ?? ''
      this.defaultCaptured = true
    }
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  /** Opens the browser date picker when supported. Must be called from a user gesture. */
  showPicker() {
    this.input?.showPicker()
  }

  /** Opens the calendar popover of `picker="calendar"`, loading it first if this is the first time. */
  async showCalendar() {
    if (this.picker !== 'calendar' || this.effectiveDisabled || this.readOnly) return
    if (!this.calendar) {
      const { createCalendar } = await import('./calendar.js')
      this.calendar ??= createCalendar(this, {
        commit: (value) => void this.commitFromCalendar(value),
        toggled: (open) => {
          const wasOpen = this.calendarOpen
          this.calendarOpen = open
          if (open) void this.updateComplete.then(() => this.calendar?.focus())
          // Back to the field, unless the popover closed because focus went elsewhere.
          else if (wasOpen && (this.renderRoot as ShadowRoot).activeElement?.closest('.calendar')) this.input?.focus()
        },
      })
    }
    this.calendarOpen = true
  }

  /** Closes the calendar popover. */
  hideCalendar() {
    this.calendarOpen = false
  }

  private async commitFromCalendar(value: string) {
    const changed = value !== this.value
    this.value = value
    this.input?.focus()
    this.calendarOpen = false
    if (!changed) return
    // After the update, so the events report the value the field holds and its validity.
    await this.updateComplete
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.input?.setCustomValidity(message)
    this.syncFormState()
  }

  formResetCallback() {
    this.value = this.defaultValue
    this.error = false
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private handleInput(event: InputEvent) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleChange(event: Event) {
    this.value = (event.target as HTMLInputElement).value
    redispatchEvent(this, event)
  }
  private handleFocusIn(event: FocusEvent) {
    this.focused = true
    redispatchEvent(this, event)
  }
  private handleFocusOut(event: FocusEvent) {
    this.focused = false
    redispatchEvent(this, event)
  }
  private keepInputFocus(event: Event) {
    // The icon button would otherwise take focus from the input on press, dropping the focus ring under the picker.
    event.preventDefault()
  }
  private openPicker(event: Event) {
    event.stopPropagation()
    const input = this.input
    if (!input || this.effectiveDisabled || this.readOnly) return
    if (this.picker === 'calendar') {
      if (this.calendarOpen) this.hideCalendar()
      else void this.showCalendar()
      return
    }
    input.focus()
    try {
      input.showPicker()
    } catch {
      // showPicker() throws in a cross-origin iframe and where the engine has no date picker for it; the focused
      // input still takes keyboard editing, and the browser's own affordances still open its picker.
    }
  }
  private handleKeyDown(event: KeyboardEvent) {
    // The key that opens the browser's picker opens the calendar in its place.
    if (this.picker !== 'calendar' || !event.altKey || event.key !== 'ArrowDown') return
    event.preventDefault()
    void this.showCalendar()
  }
  private forwardFocus(event: Event) {
    if (event.target !== this.input) this.input?.focus()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('value') && this.input && this.input.value !== this.value) {
      this.value = this.input.value
      return
    }
    this.syncFormState()
  }

  private syncFormState() {
    if (!this.input) return
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    this.internals.setFormValue(this.value, this.value)
    this.input.setCustomValidity(this.customValidityMessage)
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  override render() {
    const showError = this.error && !this.effectiveDisabled
    // An enclosing field asks for the invalid look without setting `error`, and then draws the supporting line itself.
    const invalid = (this.error || this.field.invalid) && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !this.field.managed && (!!message || this.slotPresence.has('supporting-text'))
    return html`
      <div
        class="field ${classMap({ focused: this.focused, error: invalid, 'read-only': this.readOnly, disabled: this.effectiveDisabled })}"
        @click=${this.forwardFocus}
      >
        <input
          type="date"
          aria-label=${ifDefined(this.ariaLabel || this.field.label || undefined)}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${this.field.describedBy(showSupporting && 'supporting-text')}
          name=${ifDefined(this.name || undefined)}
          autocomplete=${ifDefined(this.autocomplete || undefined)}
          min=${ifDefined(this.min || undefined)}
          max=${ifDefined(this.max || undefined)}
          step=${this.step}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${this.effectiveDisabled}
          .value=${live(this.value)}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @keydown=${this.handleKeyDown}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
        />
        <button
          class="calendar-button"
          type="button"
          tabindex="-1"
          aria-label="Open calendar"
          aria-haspopup=${this.picker === 'calendar' ? 'dialog' : nothing}
          aria-expanded=${this.picker === 'calendar' ? String(this.calendarOpen) : nothing}
          ?disabled=${this.effectiveDisabled || this.readOnly}
          @mousedown=${this.keepInputFocus}
          @click=${this.openPicker}
        >
          <slot name="calendar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect>
              <path d="M16 3v4M8 3v4M3 10h18"></path>
            </svg>
          </slot>
        </button>
      </div>
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${classMap({ error: showError })}">
              <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
            </div>`
          : html`<slot name="supporting-text" hidden @slotchange=${this.slotPresence.handleSlotChange}></slot>`
      }
      ${this.field.renderDescription()} ${this.picker === 'calendar' ? this.calendar?.render(this.calendarOpen, this.fieldElement) : nothing}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-date-input': DateInput
  }
}
