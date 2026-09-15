import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property, queryAll, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './date-selector.scss?inline'

export type DateSelectorWeekStart = 'monday' | 'sunday'

export interface DateRangeChangeDetail {
  from: string
  to: string
}

export interface DateSelectorEventMap {
  input: Event
  change: CustomEvent<DateRangeChangeDetail>
}

export interface DateSelector {
  addEventListener: TypedAddEventListener<DateSelector, DateSelectorEventMap>
  removeEventListener: TypedRemoveEventListener<DateSelector, DateSelectorEventMap>
}

const isoPattern = /^\d{4}-\d{2}-\d{2}$/

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fromIso(value: string): Date | null {
  if (!isoPattern.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function beginningOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12)
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1, 12)
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12)
}

/**
 * A keyboard-accessible date-range calendar inspired by travel booking pickers. It shows one or two consecutive
 * months, starts a range on the first activation, completes it on the second, and starts over on the third. Dates are
 * local-calendar ISO strings (`YYYY-MM-DD`), so they do not shift across time zones. Arrow keys move by day or week,
 * Home/End move within the week, and Page Up/Page Down change month.
 *
 * When `name` is present, the start date is submitted under that name and the end date under `end-name` (or
 * `${name}-end`). `required` requires a complete range. Use `min` and `max` to constrain availability.
 *
 * @tag c2-date-selector
 * @event {Event} input - Fired after either endpoint changes, with `from` and `to` already updated.
 * @event {CustomEvent<DateRangeChangeDetail>} change - Fired with `input`; `detail` contains the ISO `from` and `to` values.
 * @cssproperty {color} [--c2-date-selector--background=#ffffff]
 * @cssproperty {color} [--c2-date-selector--color=#18181b]
 * @cssproperty {border} [--c2-date-selector--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-date-selector--border-radius=14px]
 * @cssproperty {box-shadow} [--c2-date-selector--box-shadow=0 12px 32px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-date-selector--min-width=312px] - Prevents the seven day columns and container padding from collapsing.
 * @cssproperty {padding} [--c2-date-selector--padding=16px]
 * @cssproperty {pixel} [--c2-date-selector--month-gap=40px]
 * @cssproperty {font-family} [--c2-date-selector--font-family=inherit]
 * @cssproperty {font-size} [--c2-date-selector--font-size=14px]
 * @cssproperty {pixel} [--c2-date-selector__day--size=40px]
 * @cssproperty {border-radius} [--c2-date-selector__day--border-radius=999px]
 * @cssproperty {color} [--c2-date-selector__day__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-date-selector__day__today--color=#0265dc]
 * @cssproperty {font-weight} [--c2-date-selector__day__today--font-weight=600]
 * @cssproperty {color} [--c2-date-selector__day__selected--background=#0265dc]
 * @cssproperty {color} [--c2-date-selector__day__selected--color=#ffffff]
 * @cssproperty {color} [--c2-date-selector__range--background=#edf1fe]
 * @cssproperty {color} [--c2-date-selector__range--color=#18181b]
 * @cssproperty {opacity} [--c2-date-selector__day__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-date-selector__weekday--color=#71717a]
 * @cssproperty {font-size} [--c2-date-selector__weekday--font-size=12px]
 * @cssproperty {font-weight} [--c2-date-selector__month-title--font-weight=600]
 * @cssproperty {pixel} [--c2-date-selector__navigation--size=32px]
 * @cssproperty {color} [--c2-date-selector__navigation__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-date-selector__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-date-selector__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-date-selector__disabled--opacity=0.38]
 */
@customElement('c2-date-selector')
export class DateSelector extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private defaultsCaptured = false
  private defaultFrom = ''
  private defaultTo = ''
  @state() private disabledByForm = false
  @state() private visibleMonth = beginningOfMonth(new Date())
  @state() private focusDate = ''
  @queryAll('.day:not(:disabled)') private readonly dayButtons!: NodeListOf<HTMLButtonElement>

  /** Start of the selected range as `YYYY-MM-DD`. */
  @property({ type: String, reflect: true }) from = ''
  /** End of the selected range as `YYYY-MM-DD`; empty while the range is incomplete. */
  @property({ type: String, reflect: true }) to = ''
  /** Earliest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) min = ''
  /** Latest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) max = ''
  /** Locale used for month, weekday and accessible date labels. Defaults to the document language. */
  @property({ type: String }) locale = ''
  /** First day of each calendar week. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: DateSelectorWeekStart = 'monday'
  /** Number of consecutive months shown; clamped to one or two. */
  @property({ type: Number, reflect: true }) months = 2
  /** Form field name for the start date. */
  @property({ type: String }) name = ''
  /** Form field name for the end date. Defaults to `${name}-end`. */
  @property({ attribute: 'end-name' }) endName = ''
  /** Requires both endpoints when the selector participates in a form. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents navigation and selection and excludes the control from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Accessible name for the complete calendar. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = 'Choose a date range'

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

  formResetCallback() {
    this.from = this.defaultFrom
    this.to = this.defaultTo
    this.visibleMonth = beginningOfMonth(fromIso(this.from) ?? new Date())
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    const [from, to = ''] = state.split('/')
    this.from = from
    this.to = to
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (!this.defaultsCaptured) {
      this.defaultFrom = this.from
      this.defaultTo = this.to
      this.defaultsCaptured = true
      const selected = fromIso(this.from)
      if (selected) this.visibleMonth = beginningOfMonth(selected)
    }
    if (changed.has('from') || changed.has('to')) this.normalizeRange()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('from') || changed.has('to') || changed.has('name') || changed.has('endName') || changed.has('required') || changed.has('disabled'))
      this.syncFormState()
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }
  private get effectiveLocale() {
    return this.locale || this.ownerDocument?.documentElement.lang || 'en-US'
  }
  private get displayedMonths() {
    return Math.min(2, Math.max(1, Number.isFinite(this.months) ? Math.round(this.months) : 2))
  }

  private normalizeRange() {
    if (this.from && !fromIso(this.from)) this.from = ''
    if (this.to && !fromIso(this.to)) this.to = ''
    if (this.to && (!this.from || this.to < this.from)) this.to = ''
  }

  private syncFormState() {
    if (this.effectiveDisabled || !this.name || !this.from) this.internals.setFormValue(null)
    else if (this.to) {
      const data = new FormData()
      data.append(this.name, this.from)
      data.append(this.endName || `${this.name}-end`, this.to)
      this.internals.setFormValue(data, `${this.from}/${this.to}`)
    } else this.internals.setFormValue(this.from, `${this.from}/`)
    if (this.required && (!this.from || !this.to)) this.internals.setValidity({ valueMissing: true }, 'Choose a start and end date')
    else this.internals.setValidity({})
  }

  private isUnavailable(value: string) {
    return this.effectiveDisabled || (!!this.min && value < this.min) || (!!this.max && value > this.max)
  }

  private select(value: string) {
    if (this.isUnavailable(value)) return
    if (!this.from || this.to) {
      this.from = value
      this.to = ''
    } else if (value > this.from) this.to = value
    else {
      this.from = value
      this.to = ''
    }
    this.focusDate = value
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent<DateRangeChangeDetail>('change', { detail: { from: this.from, to: this.to }, bubbles: true, composed: true }))
  }

  private navigate(amount: number) {
    if (this.effectiveDisabled) return
    const target = addMonths(this.visibleMonth, amount)
    if (amount < 0 && this.min && toIso(new Date(target.getFullYear(), target.getMonth() + 1, 0, 12)) < this.min) return
    if (amount > 0 && this.max && toIso(target) > this.max) return
    this.visibleMonth = target
  }

  private async moveFocus(current: string, offset: number, byMonth = false) {
    const date = fromIso(current)
    if (!date) return
    const target = byMonth
      ? new Date(
          date.getFullYear(),
          date.getMonth() + offset,
          Math.min(date.getDate(), new Date(date.getFullYear(), date.getMonth() + offset + 1, 0).getDate()),
          12,
        )
      : addDays(date, offset)
    const value = toIso(target)
    if (this.isUnavailable(value)) return
    const firstVisible = toIso(this.visibleMonth)
    const afterVisible = toIso(addMonths(this.visibleMonth, this.displayedMonths))
    if (value < firstVisible || value >= afterVisible) this.visibleMonth = beginningOfMonth(target)
    this.focusDate = value
    await this.updateComplete
    Array.from(this.dayButtons)
      .find((button) => button.dataset.date === value)
      ?.focus()
  }

  private handleDayKeydown(event: KeyboardEvent, value: string, column: number) {
    let action: Promise<void> | undefined
    if (event.key === 'ArrowLeft') action = this.moveFocus(value, -1)
    else if (event.key === 'ArrowRight') action = this.moveFocus(value, 1)
    else if (event.key === 'ArrowUp') action = this.moveFocus(value, -7)
    else if (event.key === 'ArrowDown') action = this.moveFocus(value, 7)
    else if (event.key === 'Home') action = this.moveFocus(value, -column)
    else if (event.key === 'End') action = this.moveFocus(value, 6 - column)
    else if (event.key === 'PageUp') action = this.moveFocus(value, event.shiftKey ? -12 : -1, true)
    else if (event.key === 'PageDown') action = this.moveFocus(value, event.shiftKey ? 12 : 1, true)
    if (action) event.preventDefault()
  }

  private weekdayLabels() {
    const formatter = new Intl.DateTimeFormat(this.effectiveLocale, { weekday: 'narrow' })
    const monday = new Date(2024, 0, 1, 12)
    const start = this.weekStart === 'monday' ? monday : addDays(monday, -1)
    return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(start, index)))
  }

  private renderDay(date: Date, column: number, dateLabel: Intl.DateTimeFormat, today: string) {
    const value = toIso(date)
    const disabled = this.isUnavailable(value)
    const selected = value === this.from || value === this.to
    const inRange = !!this.to && value > this.from && value < this.to
    const focusable =
      !disabled && (this.focusDate ? value === this.focusDate : this.from ? value === this.from : value === today || !this.min || value >= this.min)
    return html`<button
      class="day ${value === this.from ? 'range-start' : ''} ${value === this.to ? 'range-end' : ''} ${inRange ? 'in-range' : ''}"
      type="button"
      role="gridcell"
      data-date=${value}
      aria-label=${dateLabel.format(date)}
      aria-selected=${selected ? 'true' : 'false'}
      aria-current=${value === today ? 'date' : nothing}
      ?disabled=${disabled}
      tabindex=${focusable ? '0' : '-1'}
      @click=${() => this.select(value)}
      @focus=${() => (this.focusDate = value)}
      @keydown=${(event: KeyboardEvent) => this.handleDayKeydown(event, value, column)}
    >
      <span>${date.getDate()}</span>
    </button>`
  }

  private renderMonth(month: Date, index: number) {
    const year = month.getFullYear()
    const monthIndex = month.getMonth()
    const offset = this.weekStart === 'monday' ? (month.getDay() + 6) % 7 : month.getDay()
    const days = new Date(year, monthIndex + 1, 0).getDate()
    const monthLabel = new Intl.DateTimeFormat(this.effectiveLocale, { month: 'long', year: 'numeric' }).format(month)
    const dateLabel = new Intl.DateTimeFormat(this.effectiveLocale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const today = toIso(new Date())
    const cells = Array.from({ length: 42 }, (_, cellIndex) => {
      const day = cellIndex - offset + 1
      return day < 1 || day > days
        ? html`<span class="empty" role="presentation"></span>`
        : this.renderDay(new Date(year, monthIndex, day, 12), cellIndex % 7, dateLabel, today)
    })
    return html`<section class="month" aria-label=${monthLabel}>
      <header class="month-header">
        ${index === 0 ? html`<button class="navigation previous" type="button" aria-label="Previous month" ?disabled=${this.effectiveDisabled} @click=${() => this.navigate(-1)}><span aria-hidden="true">‹</span></button>` : nothing}
        <h2>${monthLabel}</h2>
        ${index === this.displayedMonths - 1 ? html`<button class="navigation next" type="button" aria-label="Next month" ?disabled=${this.effectiveDisabled} @click=${() => this.navigate(1)}><span aria-hidden="true">›</span></button>` : nothing}
      </header>
      <div class="weekdays" aria-hidden="true">${this.weekdayLabels().map((label) => html`<span>${label}</span>`)}</div>
      <div class="days" role="grid" aria-label=${monthLabel}>
        ${Array.from({ length: 6 }, (_, week) => html`<div class="week" role="row">${cells.slice(week * 7, week * 7 + 7)}</div>`)}
      </div>
    </section>`
  }

  override render() {
    return html`<div class="c2-date-selector" role="group" aria-label=${this.ariaLabel ?? nothing} aria-disabled=${this.effectiveDisabled ? 'true' : 'false'}>
      ${Array.from({ length: this.displayedMonths }, (_, index) => this.renderMonth(addMonths(this.visibleMonth, index), index))}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-date-selector': DateSelector
  }
}
