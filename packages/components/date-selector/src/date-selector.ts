import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { queryAll, state } from 'lit/decorators.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import styles from './date-selector.scss?inline'
import { SlotPresenceController, disabledByAncestor } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { dateSelectorMessages } from './messages.js'

export type DateSelectorWeekStart = 'monday' | 'sunday'

/** What a click picks: a `range` of two endpoints, a `single` date, or any number of `multiple` dates. */
export type DateSelectorMode = 'range' | 'single' | 'multiple'

/**
 * How `compare-from`/`compare-to` follow the range: `previous-period` takes the same number of days just before `from`,
 * `previous-year` the same dates one year earlier. `custom` (or no value) leaves them to the app or to the user.
 */
export type DateSelectorCompare = '' | 'previous-period' | 'previous-year' | 'custom'

/** Which pair a click sets in `range` mode: the range (`from`/`to`) or the comparison range (`compare-from`/`compare-to`). */
export type DateSelectorEditing = 'range' | 'compare'

export interface DateRangeChangeDetail {
  from: string
  to: string
  /** The new `value`. Present in `single` and `multiple` mode only. */
  value?: string
  /** Start of the comparison range. Present in `range` mode while `compare` or `compare-from` is set. */
  compareFrom?: string
  /** End of the comparison range. Present with `compareFrom`. */
  compareTo?: string
}

/** What `renderDay` receives for each day of the visible months. */
export interface DateSelectorDayContext {
  /** The day as `YYYY-MM-DD`. */
  date: string
  /** The day of the month, 1 to 31. */
  day: number
  selected: boolean
  disabled: boolean
  /** Whether the day is listed in `marked`. */
  marked: boolean
  today: boolean
}

/** Draws extra content under a day's number (a price, an event count, a custom marker). */
export type DateSelectorDayRenderer = (context: DateSelectorDayContext) => unknown

export interface DateSelectorEventMap {
  input: Event
  change: CustomEvent<DateRangeChangeDetail>
}

export interface DateSelector {
  addEventListener: TypedAddEventListener<DateSelector, DateSelectorEventMap>
  removeEventListener: TypedRemoveEventListener<DateSelector, DateSelectorEventMap>
}

const defaultLabel = dateSelectorMessages.en.chooseRange
const modeLabels = { range: 'chooseRange', single: 'chooseDate', multiple: 'chooseDates' } as const
const missingMessages = { range: 'missingRange', single: 'missingDate', multiple: 'missingDates' } as const

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

/** The same day `amount` months away, clamped to the end of a shorter month: February 29 a year back is February 28. */
function shiftMonths(date: Date, amount: number): Date {
  const year = date.getFullYear()
  const month = date.getMonth() + amount
  return new Date(year, month, Math.min(date.getDate(), new Date(year, month + 1, 0).getDate()), 12)
}

/**
 * Keeps a footer control's own `input`/`change` inside the selector, so the selector's events are always its own: a
 * `change` listener on it gets a `DateRangeChangeDetail`, and an enclosing field or form binding is not dirtied by a
 * "Compare to" select. Listeners on the control itself still run.
 */
const stopPropagation = (event: Event) => event.stopPropagation()

/** The pair after a click on `value`: a first click starts a range, a later date completes it, any other click restarts it. */
function nextRange(from: string, to: string, value: string): [string, string] {
  return !from || to || value <= from ? [value, ''] : [from, value]
}

/**
 * A keyboard-accessible date-range calendar inspired by travel booking pickers. It shows one or two consecutive
 * months, starts a range on the first activation, completes it on the second, and starts over on the third. With
 * `mode="single"` it picks one date into `value`; with `mode="multiple"` each activation toggles a date in `value`
 * (a comma-separated list). `marked` dates get a dot, and `renderDay` adds content under any day's number. Dates are
 * local-calendar ISO strings (`YYYY-MM-DD`), so they do not shift across time zones. Arrow keys move by day or week,
 * Home/End move within the week, and Page Up/Page Down change month.
 *
 * When `name` is present, the start date is submitted under that name and the end date under `end-name` (or
 * `${name}-end`). In `single` mode `value` is submitted under `name`, and in `multiple` mode each date is submitted
 * under `name`. `required` requires a complete range, or at least one date. Use `min` and `max` to constrain availability:
 * days outside them are disabled, and the month navigation stops at the months that contain them.
 *
 * In `range` mode a second pair, `compare-from` and `compare-to`, is drawn as a band under the days of a comparison
 * range (an analytics "compare to" period). `compare="previous-period"` or `compare="previous-year"` derives it from the
 * range each time the range changes; `editing="compare"` makes clicks pick it instead of the range. With `name`, a
 * complete comparison range is submitted under `${name}-compare` and `${name}-compare-end`. The `footer` slot holds the
 * app's own controls, such as a "Compare to" select that sets `compare`.
 *
 * @tag c2-date-selector
 * @slot footer - Row under the months for the app's controls: a "Compare to" `c2-select` of `c2-list-item` options, presets, Apply. Hidden when empty, and
 * inert while the selector is disabled. A control's own `input`/`change` stop at the footer, so the selector's events
 * stay its own: listen on the control itself.
 * @event {Event} input - Fired after either endpoint changes, with `from` and `to` already updated.
 * @event {CustomEvent<DateRangeChangeDetail>} change - Fired with `input`; `detail` contains the ISO `from` and `to` values.
 * @cssproperty {color} [--c2-date-selector--background=#ffffff]
 * @cssproperty {color} [--c2-date-selector--color=#18181b]
 * @cssproperty {border} [--c2-date-selector--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-date-selector--border-radius=14px]
 * @cssproperty {box-shadow} [--c2-date-selector--box-shadow=0 12px 32px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-date-selector--min-width=312px] - Prevents the seven day columns and container padding from collapsing.
 * @cssproperty {padding} [--c2-date-selector--padding=16px]
 * @cssproperty {pixel} [--c2-date-selector--month-gap=40px] - Space between two months shown side by side, or stacked.
 * @cssproperty {font-family} [--c2-date-selector--font-family=inherit]
 * @cssproperty {font-size} [--c2-date-selector--font-size=14px]
 * @cssproperty {pixel} [--c2-date-selector__day--size=40px] - Width and height of the day.
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
 * @cssproperty {pixel} [--c2-date-selector__navigation--size=32px] - Width and height of the navigation.
 * @cssproperty {color} [--c2-date-selector__navigation__hover--background=#f4f4f5]
 * @cssproperty {outline} [--c2-date-selector__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-date-selector__focus--outline-offset=2px]
 * @cssproperty {opacity} [--c2-date-selector__disabled--opacity=0.38]
 * @cssproperty {border} [--c2-date-selector__error--border=1px solid #dc2626] - Shown while an enclosing `c2-form-field` shows an error.
 * @cssproperty {color} [--c2-date-selector__marker--color=#0265dc] - Dot under a `marked` day.
 * @cssproperty {color} [--c2-date-selector__marker__selected--color=#ffffff] - Dot under a `marked` day that is selected.
 * @cssproperty {pixel} [--c2-date-selector__marker--size=4px] - Width and height of the marker.
 * @cssproperty {font-size} [--c2-date-selector__day-content--font-size=10px] - Text drawn by `renderDay`.
 * @cssproperty {color} [--c2-date-selector__day-content--color=#71717a] - Text drawn by `renderDay`.
 * @cssproperty {color} [--c2-date-selector__compare--background=#ea580c] - Band under the days of the comparison range.
 * @cssproperty {pixel} [--c2-date-selector__compare--height=4px] - Thickness of the comparison band.
 * @cssproperty {pixel} [--c2-date-selector__footer--margin-top=16px] - Space between the months and the footer.
 * @cssproperty {padding} [--c2-date-selector__footer--padding=12px 0 0]
 * @cssproperty {border} [--c2-date-selector__footer--border-top=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-date-selector__footer--gap=8px]
 * @csspart marker - The dot under a `marked` day.
 * @csspart day-content - The wrapper of what `renderDay` returns for a day.
 * @csspart footer - The footer row under the months, wrapping the `footer` slot.
 */
@customElement('c2-date-selector')
export class DateSelector extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private defaultsCaptured = false
  private defaultFrom = ''
  private defaultTo = ''
  private defaultValue = ''
  private defaultCompare: DateSelectorCompare = ''
  private defaultCompareFrom = ''
  private defaultCompareTo = ''
  private markedDates = new Set<string>()
  @state() private disabledByForm = false
  @state() private visibleMonth = beginningOfMonth(new Date())
  @state() private focusDate = ''
  /** Label and description handed down by an enclosing `c2-form-field`. */
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private readonly msg = new LocalizeController(this, dateSelectorMessages, () => this.locale)
  private readonly slotPresence = new SlotPresenceController(this, ['footer'])
  @queryAll('.day:not(:disabled)') private readonly dayButtons!: NodeListOf<HTMLButtonElement>

  /** Start of the selected range as `YYYY-MM-DD`. */
  @property({ type: String, reflect: true }) from = ''
  /** End of the selected range as `YYYY-MM-DD`; empty while the range is incomplete. */
  @property({ type: String, reflect: true }) to = ''
  /** Earliest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) min = ''
  /** Latest selectable date as `YYYY-MM-DD`. */
  @property({ type: String }) max = ''
  /**
   * Locale used for month, weekday and accessible date labels, and the language of the built-in text. Defaults to the
   * document language for dates and to the nearest `lang` for the text.
   */
  @property({ type: String }) locale = ''
  /** First day of each calendar week. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: DateSelectorWeekStart = 'monday'
  /** What a click picks: a `range` (`from`/`to`), one date (`single`) or any number of dates (`multiple`) in `value`. */
  @property({ reflect: true }) mode: DateSelectorMode = 'range'
  /**
   * The selection outside `range` mode: one `YYYY-MM-DD` date in `single` mode, the dates in ascending order separated
   * by commas in `multiple` mode. Unused in `range` mode, which keeps `from` and `to`.
   */
  @property({ type: String, reflect: true }) value = ''
  /** Dates drawn with a dot (events, availability), as `YYYY-MM-DD`: an array, or `;`-separated / JSON in the attribute. */
  @property({ converter: arrayPropertyConverter }) marked: string[] = []
  /** Adds content under each day's number. The day button, its label and its selection stay the component's. */
  @property({ attribute: false }) renderDay?: DateSelectorDayRenderer
  /**
   * Start of the comparison range as `YYYY-MM-DD`, drawn as a band under its days in `range` mode. Derived from the
   * range while `compare` is `previous-period` or `previous-year`, which then wins over a value set here.
   */
  @property({ attribute: 'compare-from' }) compareFrom = ''
  /**
   * End of the comparison range as `YYYY-MM-DD`; empty while it is incomplete. Neither end is reflected: a preset derives
   * them as the element upgrades, which would write attributes a server render never had.
   */
  @property({ attribute: 'compare-to' }) compareTo = ''
  /**
   * Derives the comparison range from the range: `previous-period` (as many days, ending the day before `from`) or
   * `previous-year` (the same dates a year earlier). `custom`, or no value, leaves `compare-from`/`compare-to` as set;
   * picking a comparison range on the grid switches a preset to `custom`.
   */
  @property({ reflect: true }) compare: DateSelectorCompare = ''
  /** Which pair a click sets in `range` mode: the range, or the comparison range with `compare`. */
  @property({ reflect: true }) editing: DateSelectorEditing = 'range'
  /** Number of consecutive months shown; clamped to one or two. */
  @property({ type: Number, reflect: true }) months = 2
  /** Form field name for the start date. */
  @property({ type: String, reflect: true }) name = ''
  /** Form field name for the end date. Defaults to `${name}-end`. */
  @property({ attribute: 'end-name', reflect: true }) endName = ''
  /** Requires both endpoints when the selector participates in a form. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents navigation and selection and excludes the control from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Accessible name for the complete calendar. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = defaultLabel

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
    this.value = this.defaultValue
    this.compare = this.defaultCompare
    this.compareFrom = this.defaultCompareFrom
    this.compareTo = this.defaultCompareTo
    this.visibleMonth = beginningOfMonth(fromIso(this.isRange ? this.from : (this.selectedDates[0] ?? '')) ?? new Date())
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabledByAncestor(this, disabled)
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    // A range state always holds a `/` (`from/`, `from/to`, then `/compareFrom/compareTo/compare`); a `value` state never does.
    if (!state.includes('/')) {
      this.value = state
      return
    }
    const [from, to = '', compareFrom = '', compareTo = '', compare] = state.split('/')
    this.from = from
    this.to = to
    // A comparison range picked by hand turned the preset to `custom`: restore that too, or the preset derives over it.
    if (compare !== undefined) this.compare = compare as DateSelectorCompare
    this.compareFrom = compareFrom
    this.compareTo = compareTo
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (!this.defaultsCaptured) {
      this.defaultFrom = this.from
      this.defaultTo = this.to
      if (!this.isRange) this.normalizeValue()
      this.defaultValue = this.value
      this.defaultCompare = this.compare
      this.defaultCompareFrom = this.compareFrom
      this.defaultCompareTo = this.compareTo
      this.defaultsCaptured = true
      const selected = fromIso(this.isRange ? this.from : (this.selectedDates[0] ?? ''))
      if (selected) this.visibleMonth = beginningOfMonth(selected)
    }
    if (changed.has('from') || changed.has('to')) this.normalizeRange()
    if (changed.has('compareFrom') || changed.has('compareTo')) this.normalizeCompare()
    // A preset wins over a comparison range set by hand, so any change to either pair derives it again.
    if (['from', 'to', 'compare', 'mode', 'compareFrom', 'compareTo'].some((key) => changed.has(key as keyof DateSelector))) this.deriveCompare()
    if (!this.isRange && (changed.has('value') || changed.has('mode'))) this.normalizeValue()
    if (changed.has('marked')) this.markedDates = new Set(Array.isArray(this.marked) ? this.marked.map((date) => date.trim()) : [])
  }

  protected override updated(changed: PropertyValues<this>) {
    if (
      changed.has('from') ||
      changed.has('to') ||
      changed.has('value') ||
      changed.has('compareFrom') ||
      changed.has('compareTo') ||
      changed.has('mode') ||
      changed.has('name') ||
      changed.has('endName') ||
      changed.has('required') ||
      changed.has('disabled') ||
      // The validation message is translated: a new language, or translations added later, write it again.
      (!this.internals.validity.valid && this.internals.validationMessage !== this.missingMessage())
    )
      this.syncFormState()
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }
  private get effectiveLocale() {
    return this.locale || this.ownerDocument?.documentElement.lang || 'en-US'
  }
  private get isRange() {
    return this.mode !== 'single' && this.mode !== 'multiple'
  }
  /** The valid dates of `value`, in the order written. */
  private get selectedDates() {
    return this.value.split(/[\s,;]+/).filter((date) => fromIso(date))
  }
  private get displayedMonths() {
    return Math.min(2, Math.max(1, Number.isFinite(this.months) ? Math.round(this.months) : 2))
  }

  private normalizeRange() {
    if (this.from && !fromIso(this.from)) this.from = ''
    if (this.to && !fromIso(this.to)) this.to = ''
    if (this.to && (!this.from || this.to < this.from)) this.to = ''
  }

  private normalizeCompare() {
    if (this.compareFrom && !fromIso(this.compareFrom)) this.compareFrom = ''
    if (this.compareTo && !fromIso(this.compareTo)) this.compareTo = ''
    if (this.compareTo && (!this.compareFrom || this.compareTo < this.compareFrom)) this.compareTo = ''
  }

  /** Recomputes the comparison range of a `compare` preset from the range; an incomplete range clears it. */
  private deriveCompare() {
    if (!this.isRange || (this.compare !== 'previous-period' && this.compare !== 'previous-year')) return
    const from = fromIso(this.from)
    const to = fromIso(this.to)
    let range = ['', '']
    if (from && to && this.compare === 'previous-year') range = [toIso(shiftMonths(from, -12)), toIso(shiftMonths(to, -12))]
    else if (from && to) {
      // Both dates sit at noon, so rounding absorbs a daylight-saving hour.
      const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
      range = [toIso(addDays(from, -days)), toIso(addDays(from, -1))]
    }
    ;[this.compareFrom, this.compareTo] = range
  }

  private normalizeValue() {
    const dates = [...new Set(this.selectedDates)].sort()
    const value = (this.mode === 'single' ? dates.slice(0, 1) : dates).join(',')
    if (value !== this.value) this.value = value
  }

  private missingMessage() {
    return this.msg.t(missingMessages[this.isRange ? 'range' : this.mode])
  }

  private syncFormState() {
    if (!this.isRange) {
      const dates = this.selectedDates
      if (this.effectiveDisabled || !this.name || dates.length === 0) this.internals.setFormValue(null)
      else {
        const data = new FormData()
        for (const date of dates) data.append(this.name, date)
        this.internals.setFormValue(data, this.value)
      }
      if (this.required && dates.length === 0) this.internals.setValidity({ valueMissing: true }, this.missingMessage())
      else this.internals.setValidity({})
      return
    }
    const compared = !!this.compareFrom && !!this.compareTo
    if (this.effectiveDisabled || !this.name || !this.from) this.internals.setFormValue(null)
    else if (this.to || compared) {
      const data = new FormData()
      data.append(this.name, this.from)
      if (this.to) data.append(this.endName || `${this.name}-end`, this.to)
      let state = `${this.from}/${this.to}`
      if (compared) {
        data.append(`${this.name}-compare`, this.compareFrom)
        data.append(`${this.name}-compare-end`, this.compareTo)
        state += `/${this.compareFrom}/${this.compareTo}/${this.compare}`
      }
      this.internals.setFormValue(data, state)
    } else this.internals.setFormValue(this.from, `${this.from}/`)
    if (this.required && (!this.from || !this.to)) this.internals.setValidity({ valueMissing: true }, this.missingMessage())
    else this.internals.setValidity({})
  }

  private isUnavailable(value: string) {
    return this.effectiveDisabled || (!!this.min && value < this.min) || (!!this.max && value > this.max)
  }

  private select(value: string) {
    if (this.isUnavailable(value)) return
    if (this.mode === 'single') this.value = value
    else if (this.mode === 'multiple') {
      const dates = this.selectedDates
      this.value = (dates.includes(value) ? dates.filter((date) => date !== value) : [...dates, value]).sort().join(',')
    } else if (this.editing === 'compare') {
      // Picking a comparison range by hand ends a preset, which would otherwise overwrite it.
      if (this.compare && this.compare !== 'custom') this.compare = 'custom'
      ;[this.compareFrom, this.compareTo] = nextRange(this.compareFrom, this.compareTo, value)
    } else {
      ;[this.from, this.to] = nextRange(this.from, this.to, value)
      // Derived now rather than in the next update, so the events below carry the new comparison range.
      this.deriveCompare()
    }
    this.focusDate = value
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    const detail: DateRangeChangeDetail = this.isRange ? { from: this.from, to: this.to } : { from: this.from, to: this.to, value: this.value }
    if (this.isRange && (this.compare || this.compareFrom)) Object.assign(detail, { compareFrom: this.compareFrom, compareTo: this.compareTo })
    this.dispatchEvent(new CustomEvent<DateRangeChangeDetail>('change', { detail, bubbles: true, composed: true }))
  }

  /** Whether moving the view by `amount` months would still show a selectable day within `min`/`max`. */
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
    const target = byMonth ? shiftMonths(date, offset) : addDays(date, offset)
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

  /** Moves focus into the calendar: to a selected day, else today, else the first available day shown. */
  override focus(options?: FocusOptions) {
    const days = '.day:not(:disabled)'
    const day =
      this.renderRoot.querySelector<HTMLElement>(`${days}[aria-selected="true"]`) ??
      this.renderRoot.querySelector<HTMLElement>(`${days}[aria-current="date"]`) ??
      this.renderRoot.querySelector<HTMLElement>(`${days}[tabindex="0"]`)
    day?.focus(options)
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

  private renderDayCell(date: Date, column: number, dateLabel: Intl.DateTimeFormat, today: string, selection: Set<string> | null, anchor: string) {
    const value = toIso(date)
    const disabled = this.isUnavailable(value)
    const selected = selection ? selection.has(value) : value === this.from || value === this.to
    const range = !selection && !!this.to
    const inRange = range && value > this.from && value < this.to
    // The range strip only exists once both ends are picked; a lone start date is just a selected circle.
    const rangeStart = range && value === this.from
    const marked = this.markedDates.has(value)
    // The comparison band: a lone start while it is being picked, the whole span once both ends are set.
    const compareFrom = selection ? '' : this.compareFrom
    const compareEnd = this.compareTo || compareFrom
    const inCompare = !!compareFrom && value >= compareFrom && value <= compareEnd
    const focusable = !disabled && (this.focusDate ? value === this.focusDate : anchor ? value === anchor : value === today || !this.min || value >= this.min)
    const content = this.renderDay?.({ date: value, day: date.getDate(), selected, disabled, marked, today: value === today })
    const hasContent = content !== undefined && content !== null && content !== nothing && content !== '' && content !== false
    const describedBy = [hasContent ? `content-${value}` : '', inCompare ? 'compare-note' : ''].filter(Boolean).join(' ')
    return html`<button
      class="day ${rangeStart ? 'range-start' : ''} ${range && value === this.to ? 'range-end' : ''} ${inRange ? 'in-range' : ''} ${hasContent ? 'has-content' : ''} ${inCompare ? 'compare' : ''} ${
        inCompare && value === compareFrom ? 'compare-start' : ''
      } ${inCompare && value === compareEnd ? 'compare-end' : ''}"
      type="button"
      role="gridcell"
      data-date=${value}
      aria-label=${dateLabel.format(date)}
      aria-describedby=${describedBy || nothing}
      aria-selected=${selected ? 'true' : 'false'}
      aria-current=${value === today ? 'date' : nothing}
      ?disabled=${disabled}
      tabindex=${focusable ? '0' : '-1'}
      @click=${() => this.select(value)}
      @focus=${() => (this.focusDate = value)}
      @keydown=${(event: KeyboardEvent) => this.handleDayKeydown(event, value, column)}
    >
      <span
        >${date.getDate()}${
          hasContent ? html`<small class="day-content" id="content-${value}" part="day-content">${content}</small>` : nothing
        }${marked ? html`<i class="marker" part="marker" aria-hidden="true"></i>` : nothing}</span
      >
    </button>`
  }

  private renderMonth(month: Date, index: number, selection: Set<string> | null, anchor: string) {
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
        ? html`<span class="empty" role="gridcell" aria-disabled="true"></span>`
        : this.renderDayCell(new Date(year, monthIndex, day, 12), cellIndex % 7, dateLabel, today, selection, anchor)
    })
    return html`<section class="month" aria-label=${monthLabel}>
      <header class="month-header">
        ${index === 0 ? html`<button class="navigation previous" type="button" aria-label=${this.msg.t('previousMonth')} ?disabled=${!this.canNavigate(-1)} @click=${() => this.navigate(-1)}><span aria-hidden="true">‹</span></button>` : nothing}
        <h2>${monthLabel}</h2>
        ${index === this.displayedMonths - 1 ? html`<button class="navigation next" type="button" aria-label=${this.msg.t('nextMonth')} ?disabled=${!this.canNavigate(1)} @click=${() => this.navigate(1)}><span aria-hidden="true">›</span></button>` : nothing}
      </header>
      <div class="weekdays" aria-hidden="true">${this.weekdayLabels().map((label) => html`<span>${label}</span>`)}</div>
      <div class="days" role="grid" aria-label=${monthLabel} aria-multiselectable=${this.mode === 'multiple' ? 'true' : nothing}>
        ${Array.from({ length: 6 }, (_, week) => html`<div class="week" role="row">${cells.slice(week * 7, week * 7 + 7)}</div>`)}
      </div>
    </section>`
  }

  override render() {
    // The built-in default name gives way to an enclosing field's label; one the author set still wins.
    const label = this.ariaLabel === defaultLabel ? this.field.label || this.msg.t(modeLabels[this.isRange ? 'range' : this.mode]) : this.ariaLabel
    const invalid = this.field.invalid && !this.effectiveDisabled
    let selection: Set<string> | null = null
    let anchor = this.from
    if (!this.isRange) {
      const dates = this.selectedDates
      selection = new Set(dates)
      // The roving tab stop goes to the first selected day that is shown and enabled, so the grid stays reachable.
      const first = toIso(this.visibleMonth)
      const after = toIso(addMonths(this.visibleMonth, this.displayedMonths))
      anchor = dates.find((date) => date >= first && date < after && !this.isUnavailable(date)) ?? ''
    }
    return html`<div
        class="c2-date-selector ${invalid ? 'error' : ''}"
        role="group"
        aria-label=${label ?? nothing}
        aria-describedby=${this.field.describedBy()}
        aria-disabled=${this.effectiveDisabled ? 'true' : 'false'}
      >
        ${Array.from({ length: this.displayedMonths }, (_, index) => this.renderMonth(addMonths(this.visibleMonth, index), index, selection, anchor))}
        ${!selection && this.compareFrom ? html`<span id="compare-note" hidden>${this.msg.t('inComparison')}</span>` : nothing}
        <div
          class="footer"
          part="footer"
          ?hidden=${this.slotPresence.state('footer') !== 'present'}
          ?inert=${this.effectiveDisabled}
          @input=${stopPropagation}
          @change=${stopPropagation}
        >
          <slot name="footer" @slotchange=${this.slotPresence.handleSlotChange}></slot>
        </div>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-date-selector': DateSelector
  }
}
