import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { queryAll, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './calendar.scss?inline'

export type CalendarWeekStart = 'monday' | 'sunday'

/** Events fired by {@link Calendar}, keyed for `addEventListener`. */
export interface CalendarEventMap {
  input: Event
  change: Event
}

export interface Calendar {
  addEventListener: TypedAddEventListener<Calendar, CalendarEventMap>
  removeEventListener: TypedRemoveEventListener<Calendar, CalendarEventMap>
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
 * An inline month calendar for picking a single date. The value is a local-calendar ISO string (`YYYY-MM-DD`), so it
 * does not shift across time zones. Arrow keys move by day or week, Home/End move within the week, Page Up/Page Down
 * change month (with Shift, year), and Enter or Space selects. `min` and `max` disable the days outside them and stop
 * the month navigation at the months that contain them. With a `name` the calendar submits its value in a form.
 *
 * @tag c2-calendar
 *
 * @event {Event} input - Fired when the user selects a day, after `value` is updated.
 * @event {Event} change - Fired with `input` when the user selects a day.
 *
 * @cssproperty {color} [--c2-calendar--background=#ffffff]
 * @cssproperty {color} [--c2-calendar--color=#18181b]
 * @cssproperty {border} [--c2-calendar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-calendar--border-radius=14px]
 * @cssproperty {box-shadow} [--c2-calendar--box-shadow=none]
 * @cssproperty {padding} [--c2-calendar--padding=12px]
 * @cssproperty {font-family} [--c2-calendar--font-family=inherit]
 * @cssproperty {font-size} [--c2-calendar--font-size=14px]
 * @cssproperty {font-weight} [--c2-calendar__title--font-weight=600]
 * @cssproperty {pixel} [--c2-calendar__navigation--size=32px]
 * @cssproperty {border-radius} [--c2-calendar__navigation--border-radius=6px]
 * @cssproperty {color} [--c2-calendar__navigation__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-calendar__weekday--color=#71717a]
 * @cssproperty {font-size} [--c2-calendar__weekday--font-size=12px]
 * @cssproperty {pixel} [--c2-calendar__day--size=36px]
 * @cssproperty {border-radius} [--c2-calendar__day--border-radius=6px]
 * @cssproperty {color} [--c2-calendar__day__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-calendar__day__today--color=rgb(2, 101, 220)]
 * @cssproperty {font-weight} [--c2-calendar__day__today--font-weight=600]
 * @cssproperty {color} [--c2-calendar__day__selected--background=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-calendar__day__selected--color=#ffffff]
 * @cssproperty {opacity} [--c2-calendar__day__disabled--opacity=0.38]
 * @cssproperty {outline} [--c2-calendar__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-calendar__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-calendar__disabled--opacity=0.38]
 */
@customElement('c2-calendar')
export class Calendar extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private defaultCaptured = false
  private defaultValue = ''
  @state() private disabledByForm = false
  @state() private visibleMonth = beginningOfMonth(new Date())
  @state() private focusDate = ''
  @queryAll('.day') private readonly dayButtons!: NodeListOf<HTMLButtonElement>

  /** Selected date as `YYYY-MM-DD`; empty when nothing is selected. */
  @property({ type: String, reflect: true }) value = ''
  /** Earliest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) min = ''
  /** Latest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) max = ''
  /** Locale used for the month title, weekdays and accessible day labels. Defaults to the document language. */
  @property({ type: String }) locale = ''
  /** First day of each week. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: CalendarWeekStart = 'monday'
  /** Form field name the value is submitted under. */
  @property({ type: String }) name = ''
  /** Requires a date when the calendar participates in a form. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents navigation and selection and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Accessible name for the calendar. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = 'Choose a date'

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
    this.value = this.defaultValue
    this.visibleMonth = beginningOfMonth(fromIso(this.value) ?? new Date())
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('value') && this.value && !fromIso(this.value)) this.value = ''
    if (!this.defaultCaptured) {
      this.defaultValue = this.value
      this.defaultCaptured = true
    }
    // Keep the selected date in view when it is set from outside.
    const selected = fromIso(this.value)
    if (changed.has('value') && selected && toIso(beginningOfMonth(selected)) !== toIso(this.visibleMonth)) this.visibleMonth = beginningOfMonth(selected)
  }

  protected override updated(changed: PropertyValues) {
    if (changed.has('value') || changed.has('name') || changed.has('required') || changed.has('disabled') || changed.has('disabledByForm')) this.syncFormState()
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get effectiveLocale() {
    return this.locale || this.ownerDocument?.documentElement.lang || 'en-US'
  }

  private syncFormState() {
    this.internals.setFormValue(this.effectiveDisabled || !this.name || !this.value ? null : this.value, this.value)
    if (this.required && !this.value) this.internals.setValidity({ valueMissing: true }, 'Choose a date')
    else this.internals.setValidity({})
  }

  private isUnavailable(value: string) {
    return this.effectiveDisabled || (!!this.min && value < this.min) || (!!this.max && value > this.max)
  }

  private select(value: string) {
    if (this.isUnavailable(value) || value === this.value) return
    this.value = value
    this.focusDate = value
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  /** Whether moving the view by `amount` months still shows a selectable day within `min`/`max`. */
  private canNavigate(amount: number) {
    if (this.effectiveDisabled) return false
    const target = addMonths(this.visibleMonth, amount)
    if (amount < 0 && this.min && toIso(new Date(target.getFullYear(), target.getMonth() + 1, 0, 12)) < this.min) return false
    if (amount > 0 && this.max && toIso(target) > this.max) return false
    return true
  }

  private navigate(amount: number) {
    if (this.canNavigate(amount)) this.visibleMonth = addMonths(this.visibleMonth, amount)
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
    this.visibleMonth = beginningOfMonth(target)
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
    const start = this.weekStart === 'sunday' ? addDays(monday, -1) : monday
    return Array.from({ length: 7 }, (_, index) => formatter.format(addDays(start, index)))
  }

  /** The one day in the grid that takes Tab focus: the last focused day, else the selection, else today, else the first available day. */
  private tabStop(year: number, month: number, days: number, today: string) {
    const inView = (value: string) => value.startsWith(`${year}-${String(month + 1).padStart(2, '0')}-`) && !this.isUnavailable(value)
    for (const candidate of [this.focusDate, this.value, today]) if (candidate && inView(candidate)) return candidate
    for (let day = 1; day <= days; day++) {
      const value = toIso(new Date(year, month, day, 12))
      if (!this.isUnavailable(value)) return value
    }
    return ''
  }

  private renderDay(date: Date, column: number, dateLabel: Intl.DateTimeFormat, today: string, tabStop: string) {
    const value = toIso(date)
    return html`<button
      class="day"
      type="button"
      role="gridcell"
      data-date=${value}
      aria-label=${dateLabel.format(date)}
      aria-selected=${value === this.value ? 'true' : 'false'}
      aria-current=${value === today ? 'date' : nothing}
      ?disabled=${this.isUnavailable(value)}
      tabindex=${value === tabStop ? '0' : '-1'}
      @click=${() => this.select(value)}
      @focus=${() => (this.focusDate = value)}
      @keydown=${(event: KeyboardEvent) => this.handleDayKeydown(event, value, column)}
    >
      ${date.getDate()}
    </button>`
  }

  override render() {
    const month = this.visibleMonth
    const year = month.getFullYear()
    const monthIndex = month.getMonth()
    const offset = this.weekStart === 'sunday' ? month.getDay() : (month.getDay() + 6) % 7
    const days = new Date(year, monthIndex + 1, 0).getDate()
    const weeks = Math.ceil((offset + days) / 7)
    const title = new Intl.DateTimeFormat(this.effectiveLocale, { month: 'long', year: 'numeric' }).format(month)
    const dateLabel = new Intl.DateTimeFormat(this.effectiveLocale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const today = toIso(new Date())
    const tabStop = this.tabStop(year, monthIndex, days, today)
    const cells = Array.from({ length: weeks * 7 }, (_, index) => {
      const day = index - offset + 1
      return day < 1 || day > days
        ? html`<span class="empty" role="gridcell"></span>`
        : this.renderDay(new Date(year, monthIndex, day, 12), index % 7, dateLabel, today, tabStop)
    })

    return html`<div class="c2-calendar" role="group" aria-label=${this.ariaLabel ?? nothing} aria-disabled=${this.effectiveDisabled ? 'true' : 'false'}>
      <header class="header">
        <button class="navigation" type="button" aria-label="Previous month" ?disabled=${!this.canNavigate(-1)} @click=${() => this.navigate(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <h2 class="title" aria-live="polite">${title}</h2>
        <button class="navigation" type="button" aria-label="Next month" ?disabled=${!this.canNavigate(1)} @click=${() => this.navigate(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </header>
      <div class="grid" role="grid" aria-label=${title}>
        <div class="row" role="row">${this.weekdayLabels().map((label) => html`<span class="weekday" role="columnheader">${label}</span>`)}</div>
        ${Array.from({ length: weeks }, (_, week) => html`<div class="row" role="row">${cells.slice(week * 7, week * 7 + 7)}</div>`)}
      </div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-calendar': Calendar
  }
}
