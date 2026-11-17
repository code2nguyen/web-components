import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { disabledByAncestor, redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { live } from 'lit/directives/live.js'
import { dateFieldsMessages } from './date-fields-messages.js'
import styles from './date-fields.scss?inline'

/** One of the three fields: `d`ay, `m`onth or `y`ear. */
export type DateFieldsPart = 'd' | 'm' | 'y'

/** Events fired by {@link DateFields}, keyed for `addEventListener`. */
export interface DateFieldsEventMap {
  input: InputEvent
  change: Event
}

export interface DateFields {
  addEventListener: TypedAddEventListener<DateFields, DateFieldsEventMap>
  removeEventListener: TypedRemoveEventListener<DateFields, DateFieldsEventMap>
}

type Messages = typeof dateFieldsMessages.en
/** A message key, the parts it is about, and the message's argument. */
type Problem = [key: keyof Messages, parts: string, arg?: string]

const NAMES = { d: 'day', m: 'month', y: 'year' } as const
const MISSING = { d: 'missingDay', m: 'missingMonth', y: 'missingYear' } as const
const number = (text: string, digits: RegExp) => (digits.test(text.trim()) ? +text : 0)

/**
 * A date typed as three labelled number fields, day, month and year, for dates people know by heart (a birth date, an
 * issue date). The fields follow the language's order unless `order` is set. An invalid entry names the wrong part
 * ("Month must be a number from 1 to 12") and marks that field, once focus leaves the group or the form is submitted.
 * `value`, `min` and `max` are `YYYY-MM-DD`; `value` is empty until the three parts make a real date.
 *
 * @tag c2-date-fields
 *
 * @slot supporting-text - Rich helper content below the fields. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Re-dispatched from a field on every edit.
 * @event {Event} change - Re-dispatched from a field when its edit is committed.
 *
 * @csspart fields - The group around the three fields.
 * @csspart part - Each field with its label.
 * @csspart label - The label above each field.
 * @csspart input - Each input.
 *
 * @cssproperty {pixel} [--c2-date-fields--gap=12px] - Between the fields.
 * @cssproperty {pixel} [--c2-date-fields__label--gap=4px]
 * @cssproperty {color} [--c2-date-fields__label--color=#18181b]
 * @cssproperty {font-size} [--c2-date-fields__label--font-size=14px]
 * @cssproperty {pixel} [--c2-date-fields__input--width=3.5em] - Day and month.
 * @cssproperty {pixel} [--c2-date-fields__year--width=5em]
 * @cssproperty {pixel} [--c2-date-fields__input--min-height=36px]
 * @cssproperty {padding} [--c2-date-fields__input--padding=6px 8px]
 * @cssproperty {border} [--c2-date-fields__input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-date-fields__input--border-radius=6px]
 * @cssproperty {color} [--c2-date-fields__input--color=#18181b]
 * @cssproperty {color} [--c2-date-fields__input--background=#ffffff]
 * @cssproperty {font-size} [--c2-date-fields__input--font-size=14px]
 * @cssproperty {font-family} [--c2-date-fields__input--font-family=inherit]
 * @cssproperty {border} [--c2-date-fields__input__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-date-fields__input__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-date-fields__input__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-date-fields__input__error--border=1px solid #dc2626]
 * @cssproperty {color} [--c2-date-fields__input__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-date-fields__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-date-fields__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-date-fields__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-date-fields__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-date-fields__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-date-fields__supporting-text__error--color=#dc2626]
 */
@customElement('c2-date-fields')
export class DateFields extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, dateFieldsMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  /** The text of each field, which may not make a date yet. */
  @state() private parts: Record<DateFieldsPart, string> = { d: '', m: '', y: '' }
  /** Set once focus leaves a filled group or the form reports it invalid: the validation message then shows. */
  @state() private touched = false
  @state() private disabledByForm = false
  private problem?: Problem
  private message = ''
  /** The date the fields make, or empty. */
  private composed = ''
  private customValidityMessage = ''
  private defaultValue?: string

  /** The date as `YYYY-MM-DD`, or empty while the fields do not make one. */
  @property({ type: String, reflect: true }) value = ''
  /** Earliest valid date as `YYYY-MM-DD`. */
  @property({ type: String }) min = ''
  /** Latest valid date as `YYYY-MM-DD`. */
  @property({ type: String }) max = ''
  /** Form field name. */
  @property({ type: String, reflect: true }) name = ''
  /** Field order, as the letters `d`, `m` and `y` (`dmy`, `mdy`, `ymd`). Empty follows the language. */
  @property({ type: String }) order = ''
  /** Autocomplete hint for the group: `bday` gives the fields `bday-day`, `bday-month` and `bday-year`. */
  @property({ type: String }) autocomplete = ''
  /** Requires a date before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents editing while keeping the value in form submission. */
  @property({ type: Boolean, reflect: true }) readOnly = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Shows the error state, with `error-text` or else the validation message. */
  @property({ type: Boolean, reflect: true }) error = false
  /** Helper text shown below the fields. */
  @property({ type: String }) help = ''
  /** Message shown while `error` is set. */
  @property({ attribute: 'error-text' }) errorText = ''
  /** Accessible name of the group. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  constructor() {
    super()
    this.addEventListener('invalid', () => (this.touched = true))
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

  override connectedCallback() {
    super.connectedCallback()
    this.defaultValue ??= this.getAttribute('value') ?? ''
  }

  override focus(options?: FocusOptions) {
    this.renderRoot.querySelector('input')?.focus(options)
  }

  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }
  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.requestUpdate()
  }

  formResetCallback() {
    this.value = this.defaultValue ?? ''
    this.error = this.touched = false
    this.parse()
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  /** The fields in reading order: `order` when it names all three, else the language's own. */
  private get partOrder(): DateFieldsPart[] {
    const order =
      [...this.order].sort().join('') === 'dmy'
        ? this.order
        : new Intl.DateTimeFormat(this.msg.locale)
            .formatToParts()
            .map((part) => part.type[0])
            .join('')
    return [...order].filter((letter): letter is DateFieldsPart => letter in NAMES)
  }

  private parse() {
    const [, y = '', m = '', d = ''] = /^(\d{4})-(\d\d)-(\d\d)$/.exec(this.value) ?? []
    this.parts = { d: d && String(+d), m: m && String(+m), y }
  }

  /** The first problem with the fields, in reading order. Sets `composed` to the date they make, if any. */
  private check(): Problem | undefined {
    const { d, m, y } = this.parts
    const order = this.partOrder
    const missing = order.filter((part) => !this.parts[part].trim())
    this.composed = ''
    if (missing.length === 3) return this.required ? ['required', order.join('')] : undefined
    if (missing.length > 1) return ['incomplete', missing.join('')]
    if (missing.length) return [MISSING[missing[0]], missing[0]]
    const day = number(d, /^\d\d?$/)
    const month = number(m, /^\d\d?$/)
    if (day < 1 || day > 31) return ['badDay', 'd']
    if (month < 1 || month > 12) return ['badMonth', 'm']
    if (!number(y, /^\d{4}$/)) return ['badYear', 'y']
    const date = new Date(Date.UTC(+y, month - 1, day))
    if (date.getUTCDate() !== day) return ['notReal', 'd']
    const iso = (this.composed = date.toISOString().slice(0, 10))
    const format = (bound: string) => new Intl.DateTimeFormat(this.msg.locale, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(bound))
    if (this.min && iso < this.min) return ['min', order.join(''), format(this.min)]
    if (this.max && iso > this.max) return ['max', order.join(''), format(this.max)]
    return undefined
  }

  private handleInput(event: InputEvent) {
    const input = event.target as HTMLInputElement
    this.parts = { ...this.parts, [input.dataset.part as DateFieldsPart]: input.value }
    // Before the event goes out, so a listener reads the new value.
    this.problem = this.check()
    this.value = this.composed
    redispatchEvent(this, event)
  }

  private handleFocusOut(event: FocusEvent) {
    if (!this.renderRoot.contains(event.relatedTarget as Node) && Object.values(this.parts).some(Boolean)) this.touched = true
  }

  // In `update`, after the language controller has read the current `lang`.
  protected override update(changed: PropertyValues<this>) {
    // A value set from outside fills the fields; one that is not a real date clears the value.
    if (changed.has('value') && this.value !== this.composed) this.parse()
    const problem = (this.problem = this.check())
    if (this.value !== this.composed) this.value = this.composed
    this.message = this.customValidityMessage || (problem ? this.msg.t(problem[0], ...((problem[2] ? [problem[2]] : []) as [string])) : '')
    super.update(changed)
  }

  protected override updated() {
    const disabled = this.disabled || this.disabledByForm
    const anchor = this.renderRoot.querySelector<HTMLInputElement>(`[data-part=${this.problem?.[1][0] ?? this.partOrder[0]}]`) ?? undefined
    this.internals.setFormValue(disabled ? null : this.value, this.value)
    // A custom error rather than `badInput`, so that a `c2-form-field` shows this message, which names the part.
    this.internals.setValidity(
      disabled || !this.message ? {} : this.problem?.[0] === 'required' && !this.customValidityMessage ? { valueMissing: true } : { customError: true },
      this.message,
      anchor,
    )
  }

  override render() {
    const disabled = this.disabled || this.disabledByForm
    const problem = (this.touched || this.error) && !disabled ? this.problem : undefined
    const showError = !disabled && (this.error || !!problem)
    const invalid = showError || (!disabled && this.field.invalid)
    const message = showError ? (this.error && this.errorText) || this.message : this.help
    const showSupporting = !this.field.managed && (!!message || this.slotPresence.has('supporting-text'))
    const bad = problem?.[1] ?? 'dmy'
    return html`
      <fieldset
        part="fields"
        class=${disabled ? 'disabled' : ''}
        aria-label=${this.ariaLabel || this.field.label || nothing}
        ?disabled=${disabled}
        @focusout=${this.handleFocusOut}
      >
        ${this.partOrder.map(
          (part) => html`
            <label part="part" class=${part}>
              <span part="label">${this.msg.t(NAMES[part])}</span>
              <input
                part="input"
                data-part=${part}
                inputmode="numeric"
                maxlength=${part === 'y' ? 4 : 2}
                autocomplete=${this.autocomplete ? `${this.autocomplete}-${NAMES[part]}` : nothing}
                aria-invalid=${invalid && bad.includes(part) ? 'true' : nothing}
                aria-describedby=${this.field.describedBy(showSupporting && 'supporting-text')}
                ?required=${this.required}
                ?readonly=${this.readOnly}
                .value=${live(this.parts[part])}
                @input=${this.handleInput}
                @change=${(event: Event) => redispatchEvent(this, event)}
              />
            </label>
          `,
        )}
      </fieldset>
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${showError ? 'error' : ''}">
              <slot name="supporting-text" @slotchange=${this.slotPresence.handleSlotChange}>${message}</slot>
            </div>`
          : html`<slot name="supporting-text" hidden @slotchange=${this.slotPresence.handleSlotChange}></slot>`
      }
      ${this.field.renderDescription()}
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-date-fields': DateFields
  }
}
