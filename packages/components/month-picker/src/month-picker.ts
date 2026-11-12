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
import { disabledByAncestor } from '@c2n/core/dom-helper.js'

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

/** What the picker picks. */
export type MonthPickerGranularity = 'month' | 'quarter' | 'half-year' | 'year'

/** Months in one period of each granularity. */
const SIZE: Record<MonthPickerGranularity, number> = { month: 1, quarter: 3, 'half-year': 6, year: 12 }
/** `YYYY`, `YYYY-MM`, `YYYY-Qn` or `YYYY-Hn`. */
const keyPattern = /^(\d{4})(?:-(?:(0[1-9]|1[0-2])|Q([1-4])|H([12])))?$/
/** Years shown at once in the year grid. */
const YEAR_PAGE = 12

interface Period {
  year: number
  unit: MonthPickerGranularity
  /** Zero-based. */
  index: number
}

/** A value's parts, or `null`. */
function parse(key: string): Period | null {
  const match = keyPattern.exec(key)
  if (!match) return null
  const [, year, month, quarter, half] = match
  const [unit, index]: [MonthPickerGranularity, string | undefined] = month
    ? ['month', month]
    : quarter
      ? ['quarter', quarter]
      : half
        ? ['half-year', half]
        : ['year', '1']
  return { year: Number(year), unit, index: Number(index) - 1 }
}

function keyOf(year: number, unit: MonthPickerGranularity, index: number): string {
  if (unit === 'year') return String(year)
  return `${year}-${unit === 'month' ? pad(index + 1) : `${unit === 'quarter' ? 'Q' : 'H'}${index + 1}`}`
}

/** Months count from year 0: `year * 12 + month`. */
const dateOf = (month: number, day = 1) => new Date(Math.floor(month / 12), month % 12, day, 12)
const thisMonth = () => {
  const now = new Date()
  return now.getFullYear() * 12 + now.getMonth()
}
const isoDay = (month: number, last: boolean) => `${Math.floor(month / 12)}-${pad((month % 12) + 1)}-${last ? pad(dateOf(month + 1, 0).getDate()) : '01'}`

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

const LABEL = { month: 'label', quarter: 'quarterLabel', 'half-year': 'halfYearLabel', year: 'yearLabel' } as const
const MISSING = { month: 'valueMissing', quarter: 'quarterMissing', 'half-year': 'halfYearMissing', year: 'yearMissing' } as const

const chevron = (path: string) => html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d=${path} /></svg>`
const BACK = 'M10 3 5 8l5 5'
const FORWARD = 'm6 3 5 5-5 5'

/**
 * A month (or quarter, half-year or year) picker, like the billing-period and card-expiry pickers of Stripe, the
 * period selector of an accounting report and the month view of every calendar: a year with its twelve months (four
 * quarters, two halves), and the title button opens a grid of years to jump between them. The value is a `YYYY-MM`
 * string, as an `<input type="month">` gives, `YYYY-Qn` with `granularity="quarter"`, `YYYY-Hn` with
 * `granularity="half-year"`, or `YYYY` with `granularity="year"`.
 *
 * `fiscal-start` moves the start of the year for quarters, half-years and years: with `fiscal-start="7"` the year
 * `2027` runs from July 2026 to June 2027 (a fiscal year is named after the calendar year it ends in) and `2027-Q1` is
 * July to September 2026. `from` and `to` resolve the value to its first and last day. `stepper` adds a bar with the
 * period picked and arrows that step it through whole periods.
 *
 * `min` and `max` disable the periods outside them and stop the paging there. Month names come from the page's language
 * (`Intl.DateTimeFormat`). The cells are a grid with one tab stop: the arrow keys move by cell and by row, Home and End
 * go to the start and end of a row, Page Up and Page Down change the year (or the page of years), and Enter or Space
 * picks.
 *
 * It is a form control: under a `name` the form receives the value, `required` asks for one, and inside a
 * `c2-form-field` the field's label names it and its hint and error describe it.
 *
 * @tag c2-month-picker
 *
 * @event {Event} input - Fired when the user picks a period, before `change`. Read `value`.
 * @event {CustomEvent<{ value: string }>} change - Fired after the user picks a period, in the grid or with the stepper. Not fired for programmatic changes.
 *
 * @csspart header - The row with the paging buttons and the title.
 * @csspart title - The title button: the year, or the range of years.
 * @csspart navigation - A paging button.
 * @csspart grid - The grid of months, quarters, half-years or years.
 * @csspart cell - A month, quarter, half-year or year.
 * @csspart range - The months a quarter or half-year cell covers, and the dates under the stepper's period.
 * @csspart stepper - The bar `stepper` adds, with the period picked between two arrows.
 * @csspart step - An arrow of the stepper.
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
 * @cssproperty {color} [--c2-month-picker__cell__current--color=#0265dc] - The current period.
 * @cssproperty {font-weight} [--c2-month-picker__cell__current--font-weight=600]
 * @cssproperty {color} [--c2-month-picker__cell__selected--background=#0265dc]
 * @cssproperty {color} [--c2-month-picker__cell__selected--color=#ffffff]
 * @cssproperty {opacity} [--c2-month-picker__cell__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-month-picker__range--color=#71717a] - The months under a quarter or half-year, and the stepper's dates.
 * @cssproperty {font-size} [--c2-month-picker__range--font-size=12px]
 * @cssproperty {border} [--c2-month-picker__stepper--border-bottom=1px solid #e4e4e7] - The line between the stepper and the grid.
 * @cssproperty {outline} [--c2-month-picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-month-picker__error--border=1px solid #dc2626] - Shown while an enclosing `c2-form-field` shows an error.
 */
@customElement('c2-month-picker')
export class MonthPicker extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /**
   * The period picked: `YYYY-MM` for a month, `YYYY-Qn` for a quarter, `YYYY-Hn` for a half-year, `YYYY` for a year,
   * following `granularity`. A value in another format is ignored.
   */
  @property({ reflect: true }) value = ''

  /** Pick a month, a quarter, a half-year or a year. */
  @property({ reflect: true }) granularity: MonthPickerGranularity = 'month'

  /**
   * The month (1 to 12) the fiscal year starts in, for quarters, half-years and years. A fiscal year is named after the
   * calendar year it ends in, so with `7` the year `2027` runs from July 2026 to June 2027. Months are always calendar
   * months.
   */
  @property({ type: Number, attribute: 'fiscal-start' }) fiscalStart = 1

  /** Shows the period picked between two arrows that step it to the previous or next whole period. */
  @property({ type: Boolean }) stepper = false

  /**
   * The earliest period that can be picked, in any of the value's formats. Outside month mode, with `fiscal-start`, a
   * year, quarter or half-year here is a fiscal one.
   */
  @property() min = ''

  /** The latest period that can be picked, in any of the value's formats. */
  @property() max = ''

  /** Form field name: the form receives the value under it. */
  @property({ reflect: true }) name = ''

  /** Asks for a value before the form submits. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the picker off; the value is kept and, as for a disabled form control, not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the picker. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  /** The year whose periods are shown. */
  @state() private viewYear = new Date().getFullYear()
  /** The periods of a year, or a page of years. */
  @state() private view: 'months' | 'years' = 'months'
  /** The cell that holds the grid's tab stop: a period or a `YYYY` year. */
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

  /** The first day of the period picked, as `YYYY-MM-DD`, or `''` without a value. */
  get from(): string {
    const range = this.range(this.value)
    return range ? isoDay(range[0], false) : ''
  }

  /** The last day of the period picked, as `YYYY-MM-DD`, or `''` without a value. */
  get to(): string {
    const range = this.range(this.value)
    return range ? isoDay(range[1], true) : ''
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

  /**
   * Moves the value `count` whole periods later, as an input's `stepUp()` does, and fires no event. With no value it
   * counts from the current period. A period outside `min`/`max` is not taken.
   */
  stepUp(count = 1) {
    const next = this.stepped(count)
    if (!this.unavailable(next)) this.value = next
  }

  /** Moves the value `count` whole periods earlier; see `stepUp()`. */
  stepDown(count = 1) {
    this.stepUp(-count)
  }

  formResetCallback() {
    this.value = this.defaultValue ?? ''
    this.showValue()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('granularity') && this.value && !this.isValid(this.value)) {
      // A value becomes the period that holds it (a month its quarter or year); one that spans several is cleared.
      const range = this.range(this.value)
      const first = range ? this.periodAt(range[0], this.unit) : ''
      this.value = range && first === this.periodAt(range[1], this.unit) ? first : ''
    }
    if (changed.has('value') && this.value && !this.isValid(this.value)) this.value = ''
    if (this.defaultValue === undefined) {
      this.defaultValue = this.value
      this.showValue()
    } else if (changed.has('granularity') || changed.has('fiscalStart')) {
      this.showValue()
    } else if (changed.has('value') && this.value && !this.keys().includes(this.view === 'years' ? this.valueYear : this.value)) {
      // A value set from outside that is not shown brings its year into view.
      this.showValue()
    }
  }

  /** The year of the value, as `YYYY`. */
  private get valueYear(): string {
    return String(parse(this.value)?.year ?? '')
  }

  protected override updated(): void {
    this.syncFormState()
  }

  private get unit(): MonthPickerGranularity {
    return Object.prototype.hasOwnProperty.call(SIZE, this.granularity) ? this.granularity : 'month'
  }

  private get yearOnly(): boolean {
    return this.unit === 'year'
  }

  /** Months from January to the fiscal year's start; 0 in month mode. */
  private get offset(): number {
    const start = Math.round(this.fiscalStart)
    return this.unit !== 'month' && start > 1 && start <= 12 ? start - 1 : 0
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private isValid(value: string): boolean {
    return parse(value)?.unit === this.unit
  }

  /** A period's first and last month, or `null`. */
  private range(key: string): [number, number] | null {
    const period = parse(key)
    if (!period) return null
    const size = SIZE[period.unit]
    const first = period.unit === 'month' ? period.year * 12 + period.index : (period.year - (this.offset ? 1 : 0)) * 12 + this.offset + period.index * size
    return [first, first + size - 1]
  }

  /** The period of `unit` that holds a month. */
  private periodAt(month: number, unit: MonthPickerGranularity): string {
    if (unit === 'month') return keyOf(Math.floor(month / 12), unit, month % 12)
    const fromStart = month - this.offset
    return keyOf(Math.floor(fromStart / 12) + (this.offset ? 1 : 0), unit, Math.floor((((fromStart % 12) + 12) % 12) / SIZE[unit]))
  }

  /** `count` periods after the value, or after the current period. */
  private stepped(count: number): string {
    const value = parse(this.value)
    const period = value?.unit === this.unit ? value : parse(this.periodAt(thisMonth(), this.unit))!
    const perYear = 12 / SIZE[this.unit]
    const at = period.year * perYear + period.index + count
    return keyOf(Math.floor(at / perYear), this.unit, ((at % perYear) + perYear) % perYear)
  }

  /** Brings the picked value (or today) into view. */
  private showValue(): void {
    this.viewYear = parse(this.value)?.year ?? Number(this.periodAt(thisMonth(), 'year'))
    this.view = this.yearOnly ? 'years' : 'months'
    this.focusKey = ''
  }

  private unavailable(key: string): boolean {
    const [first, last] = this.range(key) ?? [NaN, NaN]
    const min = this.range(this.min)
    const max = this.range(this.max)
    return this.effectiveDisabled || (!!min && last < min[0]) || (!!max && first > max[1])
  }

  private syncFormState(): void {
    this.internals.setFormValue(this.effectiveDisabled || !this.name || !this.value ? null : this.value, this.value)
    const missing = this.required && !this.value
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t(MISSING[this.unit]) : '')
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
    // Outside year mode a year opens its periods, with the tab stop on the same period of the year as before.
    const own = (key: string) => {
      const period = parse(key)
      return period?.unit === this.unit ? period.index : undefined
    }
    const index = own(this.focusKey) ?? own(this.value) ?? own(this.periodAt(thisMonth(), this.unit))!
    this.viewYear = year
    this.view = 'months'
    this.focusKey = keyOf(year, this.unit, index)
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
      return Array.from({ length: YEAR_PAGE }, (_, at) => first + at).some((year) => !this.unavailable(String(year)))
    }
    return !this.unavailable(String(this.viewYear + direction))
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

  /** The keys of the cells shown for a year (or the page of years holding it), in reading order. */
  private keys(year = this.viewYear): string[] {
    if (this.view === 'years') return Array.from({ length: YEAR_PAGE }, (_, at) => String(pageStart(year) + at))
    return Array.from({ length: 12 / SIZE[this.unit] }, (_, at) => keyOf(year, this.unit, at))
  }

  /** Cells per row: three months or years, two quarters or halves. */
  private get columns(): number {
    return this.view === 'years' || this.unit === 'month' ? 3 : 2
  }

  /** The cell holding the tab stop: the one last focused, else the value, else the current period, else the first enabled. */
  private tabStop(keys: string[], current: string): string {
    const usable = (key: string) => keys.includes(key) && !this.unavailable(key)
    const valueKey = this.view === 'years' ? this.valueYear : this.value
    for (const key of [this.focusKey, valueKey, current]) if (key && usable(key)) return key
    return keys.find((key) => !this.unavailable(key)) ?? keys[0]
  }

  private handleKeydown(event: KeyboardEvent): void {
    const cell = (event.target as Element).closest<HTMLElement>('.cell')
    if (!cell) return
    const keys = this.keys()
    const columns = this.columns
    const at = keys.indexOf(cell.dataset.key ?? '')
    const column = at % columns
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
        offset = -columns
        break
      case 'ArrowDown':
        offset = columns
        break
      case 'Home':
        offset = -column
        break
      case 'End':
        offset = columns - 1 - column
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
    const next = this.keys(this.viewYear + direction * (this.view === 'years' ? YEAR_PAGE : 1))[(target + keys.length) % keys.length]
    if (this.unavailable(next)) return
    if (direction) this.page(direction as -1 | 1)
    this.focusKey = next
    void this.focusCell()
  }

  /** `2026`, `FY2026`, or with `last` `FY2016 – 2027`. */
  private yearName(year: number, last?: number): string {
    const format = formatter(this.msg.locale, { year: 'numeric' })
    const text = (at: number) => format.format(new Date(at, 0, 1, 12))
    const name = last === undefined ? text(year) : `${text(year)} – ${text(last)}`
    return this.offset ? this.msg.t('fiscalYear', name) : name
  }

  /** `July 2026`, `Q3 2026`, `H1 FY2027`. */
  private periodName(key: string): string {
    const { year, unit, index } = parse(key)!
    if (unit === 'month') return formatter(this.msg.locale, { month: 'long', year: 'numeric' }).format(dateOf(year * 12 + index))
    if (unit === 'year') return this.yearName(year)
    return this.msg.t('period', this.msg.t(unit === 'quarter' ? 'quarter' : 'halfYear', String(index + 1)), this.yearName(year))
  }

  /** `Jul – Sep`, or `Jul – Sep 2026`. */
  private months(key: string, month: 'short' | 'long', withYear = false): string {
    const [first, last] = this.range(key)!
    const format = formatter(this.msg.locale, withYear ? { month, year: 'numeric' } : { month }) as Intl.DateTimeFormat & {
      formatRange: (start: Date, end: Date) => string
    }
    return format.formatRange(dateOf(first), dateOf(last))
  }

  private renderStepper() {
    const step = (direction: -1 | 1) => {
      const next = this.stepped(direction)
      return html`<button
        class="navigation"
        part="step"
        type="button"
        aria-label=${this.msg.t(direction < 0 ? 'previousPeriod' : 'nextPeriod')}
        ?disabled=${this.unavailable(next)}
        @click=${() => this.pick(next)}
      >
        ${chevron(direction < 0 ? BACK : FORWARD)}
      </button>`
    }
    return html`<div class="stepper" part="stepper">
      ${step(-1)}
      <span class="period" aria-live="polite">
        ${
          this.value
            ? html`<span class="period__name">${this.periodName(this.value)}</span>${
                  this.unit === 'month' ? nothing : html`<span class="range" part="range">${this.months(this.value, 'short', true)}</span>`
                }`
            : this.msg.t(LABEL[this.unit])
        }
      </span>
      ${step(1)}
    </div>`
  }

  override render() {
    const yearsView = this.view === 'years'
    const keys = this.keys()
    const current = this.periodAt(thisMonth(), yearsView ? 'year' : this.unit)
    const stop = this.tabStop(keys, current)
    const shortMonth = formatter(this.msg.locale, { month: 'short' })
    const first = pageStart(this.viewYear)
    const title = yearsView ? this.yearName(first, first + YEAR_PAGE - 1) : this.yearName(this.viewYear)
    const invalid = this.field.invalid && !this.effectiveDisabled
    const columns = this.columns
    const rows = Array.from({ length: Math.ceil(keys.length / columns) }, (_, row) => keys.slice(row * columns, row * columns + columns))
    return html`<div
        class="picker ${invalid ? 'error' : ''}"
        role="group"
        aria-label=${this.label || this.field.label || this.msg.t(LABEL[this.unit])}
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-disabled=${this.effectiveDisabled ? 'true' : nothing}
      >
        ${this.stepper ? this.renderStepper() : nothing}
        <div class="header" part="header">
          <button
            class="navigation"
            part="navigation"
            type="button"
            aria-label=${this.msg.t(yearsView ? 'previousYears' : 'previousYear')}
            ?disabled=${!this.canPage(-1)}
            @click=${() => this.page(-1)}
          >
            ${chevron(BACK)}
          </button>
          ${
            this.yearOnly
              ? html`<span class="title" part="title" aria-live="polite">${title}</span>`
              : html`<button
                  class="title"
                  part="title"
                  type="button"
                  aria-live="polite"
                  aria-label=${
                    yearsView
                      ? this.msg.t(this.unit === 'month' ? 'backToMonths' : 'backToPeriods', this.yearName(this.viewYear))
                      : this.msg.t('chooseYear', title)
                  }
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
            ${chevron(FORWARD)}
          </button>
        </div>
        <div class="grid ${columns === 2 ? 'grid--two' : ''}" part="grid" role="grid" aria-label=${title} @keydown=${this.handleKeydown}>
          ${rows.map(
            (row) =>
              html`<div class="row" role="row">
                ${row.map((key) => {
                  const period = parse(key)!
                  const selected = key === (yearsView ? this.valueYear : this.value)
                  const span = !yearsView && period.unit !== 'month'
                  return html`<button
                    class="cell ${selected ? 'cell--selected' : ''} ${key === current ? 'cell--current' : ''} ${span ? 'cell--span' : ''}"
                    part="cell"
                    type="button"
                    role="gridcell"
                    data-key=${key}
                    tabindex=${key === stop ? 0 : -1}
                    aria-label=${span ? this.msg.t('periodMonths', this.periodName(key), this.months(key, 'long', true)) : this.periodName(key)}
                    aria-selected=${selected ? 'true' : 'false'}
                    aria-current=${key === current ? 'date' : nothing}
                    ?disabled=${this.unavailable(key)}
                    @click=${() => (yearsView ? this.pickYear(period.year) : this.pick(key))}
                    @focus=${() => (this.focusKey = key)}
                  >
                    ${
                      period.unit === 'month'
                        ? shortMonth.format(dateOf(period.year * 12 + period.index))
                        : span
                          ? html`${this.msg.t(period.unit === 'quarter' ? 'quarter' : 'halfYear', String(period.index + 1))}<span class="range" part="range"
                                >${this.months(key, 'short')}</span
                              >`
                          : formatter(this.msg.locale, { year: 'numeric' }).format(new Date(period.year, 0, 1, 12))
                    }
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
