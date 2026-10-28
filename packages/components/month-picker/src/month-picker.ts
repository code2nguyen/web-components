import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { pad } from '@c2n/core/zoned-time.js'
import { monthPickerMessages } from './messages'
import styles from './month-picker.scss?inline'

export { monthPickerMessages } from './messages'

/** Events fired by {@link MonthPicker}, keyed for `addEventListener`. */
export interface MonthPickerEventMap {
  input: Event
  change: CustomEvent<{ value: string }>
}

export interface MonthPicker {
  addEventListener: TypedAddEventListener<MonthPicker, MonthPickerEventMap>
  removeEventListener: TypedRemoveEventListener<MonthPicker, MonthPickerEventMap>
}

const monthPattern = /^(\d{4})-(0[1-9]|1[0-2])$/
const yearPattern = /^\d{4}$/
/** Years shown at once in the year grid. */
const YEAR_PAGE = 12
const COLUMNS = 3

const monthKey = (year: number, month: number) => `${year}-${pad(month + 1)}`

/** A month value's year and zero-based month, or `null` when it is not `YYYY-MM`. */
function parseMonth(value: string): { year: number; month: number } | null {
  const match = monthPattern.exec(value)
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1 } : null
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per locale and options, kept: a render needs several and runs on every focus move. */
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, format)
  }
  return format
}

/** The first year of the twelve-year page holding `year`. */
const pageStart = (year: number) => Math.floor(year / YEAR_PAGE) * YEAR_PAGE

/**
 * A month (or year) picker, like the billing-period and card-expiry pickers of Stripe and the month view of every
 * calendar: a year with its twelve months, and the title button opens a grid of years to jump between them. The value
 * is a `YYYY-MM` string, as an `<input type="month">` gives, or `YYYY` with `granularity="year"`.
 *
 * `min` and `max` disable the months (or years) outside them and stop the paging there. Month names come from the
 * page's language (`Intl.DateTimeFormat`). The months are a grid with one tab stop: the arrow keys move by month and by
 * row, Home and End go to the start and end of a row, Page Up and Page Down change the year (or the page of years), and
 * Enter or Space picks.
 *
 * It is a form control: under a `name` the form receives the value, `required` asks for one, and inside a
 * `c2-form-field` the field's label names it and its hint and error describe it.
 *
 * @tag c2-month-picker
 *
 * @event {Event} input - Fired when the user picks a month (or year), before `change`. Read `value`.
 * @event {CustomEvent<{ value: string }>} change - Fired after the user picks a month (or year). Not fired for programmatic changes.
 *
 * @csspart header - The row with the paging buttons and the title.
 * @csspart title - The title button: the year, or the range of years.
 * @csspart navigation - A paging button.
 * @csspart grid - The grid of months or years.
 * @csspart cell - A month or a year.
 *
 * @cssproperty {color} [--c2-month-picker--background=#ffffff]
 * @cssproperty {color} [--c2-month-picker--color=#18181b]
 * @cssproperty {border} [--c2-month-picker--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-month-picker--border-radius=14px]
 * @cssproperty {box-shadow} [--c2-month-picker--box-shadow=none]
 * @cssproperty {padding} [--c2-month-picker--padding=12px]
 * @cssproperty {pixel} [--c2-month-picker--width=264px]
 * @cssproperty {font-size} [--c2-month-picker--font-size=14px]
 * @cssproperty {font-weight} [--c2-month-picker__title--font-weight=600]
 * @cssproperty {pixel} [--c2-month-picker__navigation--size=32px]
 * @cssproperty {color} [--c2-month-picker__navigation__hover--background=#f4f4f5]
 * @cssproperty {pixel} [--c2-month-picker__grid--gap=4px]
 * @cssproperty {pixel} [--c2-month-picker__cell--height=40px]
 * @cssproperty {border-radius} [--c2-month-picker__cell--border-radius=999px]
 * @cssproperty {color} [--c2-month-picker__cell__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-month-picker__cell__current--color=#0265dc] - The current month (or year).
 * @cssproperty {font-weight} [--c2-month-picker__cell__current--font-weight=600]
 * @cssproperty {color} [--c2-month-picker__cell__selected--background=#0265dc]
 * @cssproperty {color} [--c2-month-picker__cell__selected--color=#ffffff]
 * @cssproperty {opacity} [--c2-month-picker__cell__disabled--opacity=0.38]
 * @cssproperty {outline} [--c2-month-picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-month-picker__error--border=1px solid #dc2626] - Shown while an enclosing `c2-form-field` shows an error.
 */
@customElement('c2-month-picker')
export class MonthPicker extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The month picked, as `YYYY-MM`, or the year as `YYYY` with `granularity="year"`. */
  @property({ reflect: true }) value = ''

  /** Pick a month, or only a year. */
  @property({ reflect: true }) granularity: 'month' | 'year' = 'month'

  /** The earliest month (or year) that can be picked, in the same format as `value`. */
  @property() min = ''

  /** The latest month (or year) that can be picked, in the same format as `value`. */
  @property() max = ''

  /** Form field name: the form receives the value under it. */
  @property({ reflect: true }) name = ''

  /** Asks for a value before the form submits. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the picker off; the value is kept and, as for a disabled form control, not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the picker. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  /** The year whose months are shown. */
  @state() private viewYear = new Date().getFullYear()
  /** Months of a year, or a page of years. */
  @state() private view: 'months' | 'years' = 'months'
  /** The cell that holds the grid's tab stop: a `YYYY-MM` month or a `YYYY` year. */
  @state() private focusKey = ''
  @state() private disabledByForm = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, monthPickerMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultValue: string | undefined
  private customValidityMessage = ''

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
    this.value = this.defaultValue ?? ''
    this.showValue()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('granularity') && this.value && !this.isValid(this.value)) {
      // A month becomes its year; a year has no month to become, so it is cleared.
      this.value = this.yearOnly ? (parseMonth(this.value)?.year.toString() ?? '') : ''
    }
    if (changed.has('value') && this.value && !this.isValid(this.value)) this.value = ''
    if (this.defaultValue === undefined) {
      this.defaultValue = this.value
      this.showValue()
    } else if (changed.has('granularity')) {
      this.showValue()
    } else if (changed.has('value') && this.value && !this.keys().includes(this.yearOnly || this.view === 'years' ? this.valueYear : this.value)) {
      // A value set from outside that is not shown brings its year into view.
      this.showValue()
    }
  }

  /** The year of the value, as `YYYY`. */
  private get valueYear(): string {
    return this.yearOnly ? this.value : (parseMonth(this.value)?.year.toString() ?? '')
  }

  protected override updated(): void {
    this.syncFormState()
  }

  private get yearOnly(): boolean {
    return this.granularity === 'year'
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private isValid(value: string): boolean {
    return this.yearOnly ? yearPattern.test(value) : monthPattern.test(value)
  }

  /** Brings the picked value (or today) into view. */
  private showValue(): void {
    const year = this.yearOnly ? Number(this.value) || NaN : (parseMonth(this.value)?.year ?? NaN)
    this.viewYear = Number.isFinite(year) ? year : new Date().getFullYear()
    this.view = this.yearOnly ? 'years' : 'months'
    this.focusKey = ''
  }

  /** `min`/`max` as months, a bare year standing for its first or last month. */
  private bound(value: string, end: boolean): string {
    if (monthPattern.test(value)) return value
    if (yearPattern.test(value)) return `${value}-${end ? '12' : '01'}`
    return ''
  }

  private monthUnavailable(key: string): boolean {
    const min = this.bound(this.min, false)
    const max = this.bound(this.max, true)
    return this.effectiveDisabled || (!!min && key < min) || (!!max && key > max)
  }

  private yearUnavailable(year: number): boolean {
    const min = this.bound(this.min, false)
    const max = this.bound(this.max, true)
    return this.effectiveDisabled || (!!min && `${year}-12` < min) || (!!max && `${year}-01` > max)
  }

  private syncFormState(): void {
    this.internals.setFormValue(this.effectiveDisabled || !this.name || !this.value ? null : this.value, this.value)
    const missing = this.required && !this.value
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t(this.yearOnly ? 'yearMissing' : 'valueMissing') : '')
    const anchor = this.renderRoot?.querySelector<HTMLElement>('.cell[tabindex="0"]') ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  private pick(value: string): void {
    if (this.effectiveDisabled) return
    this.focusKey = value
    if (value === this.value) return
    this.value = value
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value }, bubbles: true, composed: true }))
  }

  private pickYear(year: number): void {
    if (this.yearOnly) {
      this.pick(String(year))
      return
    }
    // In month mode a year opens its months, with the tab stop on the same month as before.
    const month = parseMonth(this.focusKey)?.month ?? parseMonth(this.value)?.month ?? new Date().getMonth()
    this.viewYear = year
    this.view = 'months'
    this.focusKey = monthKey(year, month)
    void this.focusCell()
  }

  private page(direction: -1 | 1): void {
    this.viewYear += this.view === 'years' ? direction * YEAR_PAGE : direction
    this.focusKey = ''
  }

  private canPage(direction: -1 | 1): boolean {
    if (this.effectiveDisabled) return false
    if (this.view === 'years') {
      const first = pageStart(this.viewYear) + direction * YEAR_PAGE
      return Array.from({ length: YEAR_PAGE }, (_, at) => first + at).some((year) => !this.yearUnavailable(year))
    }
    return !this.yearUnavailable(this.viewYear + direction)
  }

  private toggleView(): void {
    if (this.yearOnly) return
    this.view = this.view === 'months' ? 'years' : 'months'
    this.focusKey = ''
    void this.focusCell()
  }

  private async focusCell(): Promise<void> {
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>('.cell[tabindex="0"]')?.focus()
  }

  /** The keys of the cells shown, in reading order. */
  private keys(): string[] {
    if (this.view === 'years') return Array.from({ length: YEAR_PAGE }, (_, at) => String(pageStart(this.viewYear) + at))
    return Array.from({ length: 12 }, (_, month) => monthKey(this.viewYear, month))
  }

  private unavailable(key: string): boolean {
    return this.view === 'years' ? this.yearUnavailable(Number(key)) : this.monthUnavailable(key)
  }

  /** The cell holding the tab stop: the one last focused, else the value, else the current month or year, else the first enabled. */
  private tabStop(keys: string[], current: string): string {
    const usable = (key: string) => keys.includes(key) && !this.unavailable(key)
    const valueKey = this.view === 'years' && !this.yearOnly ? (parseMonth(this.value)?.year.toString() ?? '') : this.value
    for (const key of [this.focusKey, valueKey, current]) if (key && usable(key)) return key
    return keys.find((key) => !this.unavailable(key)) ?? keys[0]
  }

  private handleKeydown(event: KeyboardEvent): void {
    const cell = (event.target as Element).closest<HTMLElement>('.cell')
    if (!cell) return
    const keys = this.keys()
    const at = keys.indexOf(cell.dataset.key ?? '')
    const column = at % COLUMNS
    let offset: number | undefined
    let pageBy: -1 | 1 | undefined
    switch (event.key) {
      case 'ArrowLeft':
        offset = -1
        break
      case 'ArrowRight':
        offset = 1
        break
      case 'ArrowUp':
        offset = -COLUMNS
        break
      case 'ArrowDown':
        offset = COLUMNS
        break
      case 'Home':
        offset = -column
        break
      case 'End':
        offset = COLUMNS - 1 - column
        break
      case 'PageUp':
        pageBy = -1
        break
      case 'PageDown':
        pageBy = 1
        break
      default:
        return
    }
    event.preventDefault()
    if (pageBy) {
      if (!this.canPage(pageBy)) return
      this.page(pageBy)
      // The same place on the new page, or its nearest available cell.
      const next = this.keys()
      const order = next.map((_, index) => index).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))
      const usable = order.map((index) => next[index]).find((key) => !this.unavailable(key))
      if (usable) this.focusKey = usable
      void this.focusCell()
      return
    }
    const target = at + offset!
    // The cell the key leads to, checked before anything moves: one outside min/max keeps focus where it is. Past the
    // first or last cell it is in the previous or next year (or page of years).
    const direction = target < 0 ? -1 : target >= keys.length ? 1 : 0
    const index = (target + keys.length) % keys.length
    const next = this.view === 'years' ? String(Number(keys[0]) + direction * YEAR_PAGE + index) : monthKey(this.viewYear + direction, index)
    if (this.unavailable(next)) return
    if (direction) this.page(direction as -1 | 1)
    this.focusKey = next
    void this.focusCell()
  }

  override render() {
    const yearsView = this.view === 'years'
    const keys = this.keys()
    const now = new Date()
    const current = yearsView ? String(now.getFullYear()) : monthKey(now.getFullYear(), now.getMonth())
    const stop = this.tabStop(keys, current)
    const locale = this.msg.locale
    const shortMonth = formatter(locale, { month: 'short' })
    const longMonth = formatter(locale, { month: 'long', year: 'numeric' })
    const yearFormat = formatter(locale, { year: 'numeric' })
    const yearText = (year: number) => yearFormat.format(new Date(year, 0, 1, 12))
    const first = pageStart(this.viewYear)
    const title = yearsView ? `${yearText(first)} – ${yearText(first + YEAR_PAGE - 1)}` : yearText(this.viewYear)
    const selectedYear = this.yearOnly ? this.value : String(parseMonth(this.value)?.year ?? '')
    const invalid = this.field.invalid && !this.effectiveDisabled
    const rows = Array.from({ length: keys.length / COLUMNS }, (_, row) => keys.slice(row * COLUMNS, row * COLUMNS + COLUMNS))
    return html`<div
        class="picker ${invalid ? 'error' : ''}"
        role="group"
        aria-label=${this.label || this.field.label || this.msg.t(this.yearOnly ? 'yearLabel' : 'label')}
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-disabled=${this.effectiveDisabled ? 'true' : nothing}
      >
        <div class="header" part="header">
          <button
            class="navigation"
            part="navigation"
            type="button"
            aria-label=${this.msg.t(yearsView ? 'previousYears' : 'previousYear')}
            ?disabled=${!this.canPage(-1)}
            @click=${() => this.page(-1)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
          </button>
          ${
            this.yearOnly
              ? html`<span class="title" part="title" aria-live="polite">${title}</span>`
              : html`<button
                  class="title"
                  part="title"
                  type="button"
                  aria-live="polite"
                  aria-label=${yearsView ? this.msg.t('backToMonths', yearText(this.viewYear)) : this.msg.t('chooseYear', title)}
                  ?disabled=${this.effectiveDisabled}
                  @click=${this.toggleView}
                >
                  ${title}
                </button>`
          }
          <button
            class="navigation"
            part="navigation"
            type="button"
            aria-label=${this.msg.t(yearsView ? 'nextYears' : 'nextYear')}
            ?disabled=${!this.canPage(1)}
            @click=${() => this.page(1)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
          </button>
        </div>
        <div class="grid" part="grid" role="grid" aria-label=${title} @keydown=${this.handleKeydown}>
          ${rows.map(
            (row) =>
              html`<div class="row" role="row">
                ${row.map((key) => {
                  const year = yearsView ? Number(key) : this.viewYear
                  const month = yearsView ? 0 : (parseMonth(key)?.month ?? 0)
                  const date = new Date(year, month, 1, 12)
                  const selected = yearsView ? key === selectedYear : key === this.value
                  return html`<button
                    class="cell ${selected ? 'cell--selected' : ''} ${key === current ? 'cell--current' : ''}"
                    part="cell"
                    type="button"
                    role="gridcell"
                    data-key=${key}
                    tabindex=${key === stop ? 0 : -1}
                    aria-label=${yearsView ? yearText(year) : longMonth.format(date)}
                    aria-selected=${selected ? 'true' : 'false'}
                    aria-current=${key === current ? 'date' : nothing}
                    ?disabled=${this.unavailable(key)}
                    @click=${() => (yearsView ? this.pickYear(year) : this.pick(key))}
                    @focus=${() => (this.focusKey = key)}
                  >
                    ${yearsView ? yearText(year) : shortMonth.format(date)}
                  </button>`
                })}
              </div>`,
          )}
        </div>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-month-picker': MonthPicker
  }
}
