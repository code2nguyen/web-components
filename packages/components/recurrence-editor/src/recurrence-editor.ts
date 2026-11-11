import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { LocalizeController } from '@c2n/core/localize.js'
import '@c2n/select'
import '@c2n/list-item'
import '@c2n/number-input'
import '@c2n/date-input'
import {
  CRON_INTERVALS,
  FREQUENCIES,
  WEEKDAYS,
  daysInMonth,
  defaultRule,
  formatCron,
  formatRRule,
  formatWallDate,
  occurrences,
  parseCron,
  parseRRule,
  parseWallClock,
  weekdayOf,
  weekdayOrdinalOf,
  withFrequency,
  wallClockOf,
  type RecurrenceFrequency,
  type RecurrenceRule,
  type WallClock,
  type Weekday,
} from './recurrence.js'
import { describeRecurrence, monthName, occurrenceText, weekdayName } from './summary.js'
import { recurrenceEditorMessages } from './messages.js'
import styles from './recurrence-editor.scss?inline'

export * from './recurrence.js'
export { describeRecurrence, monthName, occurrenceText, timeText, weekdayName, type DescribeOptions } from './summary.js'
export { recurrenceEditorMessages } from './messages.js'

/** What `value` holds: an RFC 5545 RRULE (`FREQ=WEEKLY;BYDAY=MO`) or a five-field cron expression (`0 9 * * 1`). */
export type RecurrenceFormat = 'rrule' | 'cron'

/** What {@link RecurrenceEditor.renderOccurrence} receives for each of the next occurrences. */
export interface RecurrenceOccurrenceContext {
  /** The occurrence as a local `Date`. */
  date: Date
  /** The occurrence as a wall-clock date and time. */
  clock: WallClock
  /** Its position in the list, from 0. */
  index: number
  /** The built-in text (`Wed, 12 Nov 2026`). */
  label: string
}

/** Draws one of the next occurrences; anything Lit can render. */
export type RecurrenceOccurrenceRenderer = (context: RecurrenceOccurrenceContext) => unknown

/** Events fired by {@link RecurrenceEditor}, keyed for `addEventListener`. */
export interface RecurrenceEditorEventMap {
  input: Event
  change: Event
}

export interface RecurrenceEditor {
  addEventListener: TypedAddEventListener<RecurrenceEditor, RecurrenceEditorEventMap>
  removeEventListener: TypedRemoveEventListener<RecurrenceEditor, RecurrenceEditorEventMap>
}

type MonthMode = 'day' | 'weekday' | 'last'
type EndMode = 'never' | 'until' | 'count'

const FREQUENCY_KEYS = {
  none: 'frequencyNone',
  minutely: 'frequencyMinutely',
  hourly: 'frequencyHourly',
  daily: 'frequencyDaily',
  weekly: 'frequencyWeekly',
  monthly: 'frequencyMonthly',
  yearly: 'frequencyYearly',
} as const

const UNIT_KEYS = {
  minutely: 'unitMinutely',
  hourly: 'unitHourly',
  daily: 'unitDaily',
  weekly: 'unitWeekly',
  monthly: 'unitMonthly',
  yearly: 'unitYearly',
} as const

const ORDINALS = [1, 2, 3, 4, -1]

const isFrequency = (value: string): value is RecurrenceFrequency => value === 'none' || (FREQUENCIES as readonly string[]).includes(value)

/** A whole number of at least `min` from an inner number field, or `null`. */
const wholeNumber = (text: string, min: number, max: number): number | null => {
  if (!/^\s*\d+\s*$/.test(text)) return null
  const value = Number(text)
  return value >= min && value <= max ? value : null
}

/**
 * Edits how something repeats, as the custom recurrence dialogs of Google Calendar and Outlook do: "Repeat weekly,
 * every 2 weeks, on Monday and Wednesday, ends after 10 occurrences". A sentence sums the rule up and the next
 * occurrences show under it.
 *
 * `value` is an RFC 5545 RRULE (`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10`) by default, or a five-field cron
 * expression with `format="cron"` (`30 9 * * 1-5`), the schedule of a job. In cron format the editor offers only what
 * cron can say: a time of day, steps that divide their range, no end and no "third Tuesday". The same rule is always
 * available in both through `toRRule()` and `cron`.
 *
 * `start` is the first occurrence (the event's DTSTART): it seeds the weekday, the day of the month and the month when
 * the frequency changes, and the next occurrences count from it (today when it is not set). `frequencies` lists the
 * frequencies offered; add `none` to offer "Does not repeat", which is an empty value. An empty value without `none`
 * shows, and takes, a weekly rule on the start's weekday.
 *
 * It is a form control: under a `name` the form receives the value, and `required` asks for a rule other than "Does
 * not repeat". `parseRRule`, `formatRRule`, `parseCron`, `formatCron`, `occurrences` and `describeRecurrence` are
 * exported for tables and servers.
 *
 * @tag c2-recurrence-editor
 *
 * @slot footer - An action zone below the summary: the app's own buttons (Save, Cancel). Hidden while empty.
 *
 * @csspart editor - The group around every row, the summary and the footer.
 * @csspart rows - The column of labelled rows.
 * @csspart row - One row: its label and its controls, which wrap below the label when the row is narrow.
 * @csspart label - The label at the start of each row.
 * @csspart weekdays - The row of weekday toggles.
 * @csspart weekday - One weekday toggle.
 * @csspart summary - The sentence that sums the rule up.
 * @csspart occurrences - The next occurrences.
 * @csspart occurrence - One of the next occurrences.
 * @csspart footer - The box around the `footer` slot.
 *
 * @event {Event} input - Fired after the user changes the rule, once `value` holds it; also while typing a number.
 * @event {Event} change - Fired after the user changes the rule, once `value` holds it.
 *
 * @cssproperty {color} [--c2-recurrence-editor--color=#18181b] - The text colour.
 * @cssproperty {font-size} [--c2-recurrence-editor--font-size=14px] - The text size.
 * @cssproperty {font-family} [--c2-recurrence-editor--font-family=inherit] - The text font.
 * @cssproperty {pixel} [--c2-recurrence-editor--line-height=20px] - The text line height.
 * @cssproperty {pixel} [--c2-recurrence-editor--gap=16px] - Space between the rows, the summary, the occurrences and the footer.
 * @cssproperty {pixel} [--c2-recurrence-editor__rows--row-gap=12px] - Space between two rows.
 * @cssproperty {pixel} [--c2-recurrence-editor__rows--column-gap=16px] - Space between a row's label and its controls.
 * @cssproperty {color} [--c2-recurrence-editor__label--color=#71717a] - The colour of the row labels and units.
 * @cssproperty {font-weight} [--c2-recurrence-editor__label--font-weight=500] - The weight of the row labels.
 * @cssproperty {pixel} [--c2-recurrence-editor__label--min-width=56px] - The narrowest a row label gets, which lines the controls up.
 * @cssproperty {pixel} [--c2-recurrence-editor__controls--gap=8px] - Space between the controls of a row.
 * @cssproperty {pixel} [--c2-recurrence-editor__select--min-width=160px] - The narrowest a select gets, unless the row is narrower.
 * @cssproperty {pixel} [--c2-recurrence-editor__number--width=96px] - The width of a number field.
 * @cssproperty {pixel} [--c2-recurrence-editor__weekdays--gap=6px] - Space between two weekday toggles.
 * @cssproperty {pixel} [--c2-recurrence-editor__weekday--size=32px] - The width and height of a weekday toggle.
 * @cssproperty {border} [--c2-recurrence-editor__weekday--border=1px solid #bcbcc6] - A weekday toggle's border.
 * @cssproperty {border-radius} [--c2-recurrence-editor__weekday--border-radius=999px] - A weekday toggle's corner radius.
 * @cssproperty {color} [--c2-recurrence-editor__weekday--color=#18181b] - A weekday toggle's text colour.
 * @cssproperty {color} [--c2-recurrence-editor__weekday--background=#ffffff] - A weekday toggle's background.
 * @cssproperty {font-size} [--c2-recurrence-editor__weekday--font-size=12px] - A weekday toggle's text size.
 * @cssproperty {font-weight} [--c2-recurrence-editor__weekday--font-weight=500] - A weekday toggle's text weight.
 * @cssproperty {border} [--c2-recurrence-editor__weekday__hover--border=1px solid #a1a1aa] - A weekday toggle's border on hover.
 * @cssproperty {color} [--c2-recurrence-editor__weekday__selected--color=#ffffff] - A selected weekday's text colour.
 * @cssproperty {color} [--c2-recurrence-editor__weekday__selected--background=#0265dc] - A selected weekday's background.
 * @cssproperty {border} [--c2-recurrence-editor__weekday__selected--border=1px solid #0265dc] - A selected weekday's border.
 * @cssproperty {outline} [--c2-recurrence-editor__weekday__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - A weekday toggle's focus ring.
 * @cssproperty {color} [--c2-recurrence-editor__summary--color=#18181b] - The summary's text colour.
 * @cssproperty {font-weight} [--c2-recurrence-editor__summary--font-weight=500] - The summary's text weight.
 * @cssproperty {padding} [--c2-recurrence-editor__summary--padding=10px 12px] - Space inside the summary.
 * @cssproperty {color} [--c2-recurrence-editor__summary--background=#f4f4f5] - The summary's background.
 * @cssproperty {border-radius} [--c2-recurrence-editor__summary--border-radius=6px] - The summary's corner radius.
 * @cssproperty {pixel} [--c2-recurrence-editor__occurrences--gap=4px] - Space between the next occurrences.
 * @cssproperty {color} [--c2-recurrence-editor__occurrences--color=#71717a] - The colour of the "Next" label.
 * @cssproperty {font-size} [--c2-recurrence-editor__occurrences--font-size=12px] - The text size of the next occurrences.
 * @cssproperty {padding} [--c2-recurrence-editor__occurrence--padding=2px 8px] - Space inside an occurrence.
 * @cssproperty {border} [--c2-recurrence-editor__occurrence--border=1px solid #e4e4e7] - An occurrence's border.
 * @cssproperty {border-radius} [--c2-recurrence-editor__occurrence--border-radius=999px] - An occurrence's corner radius.
 * @cssproperty {color} [--c2-recurrence-editor__occurrence--background=#ffffff] - An occurrence's background.
 * @cssproperty {color} [--c2-recurrence-editor__occurrence--color=#18181b] - An occurrence's text colour.
 * @cssproperty {opacity} [--c2-recurrence-editor__disabled--opacity=0.38] - The opacity while disabled.
 *
 * @internalcomponent c2-select
 * @internalcomponent c2-number-input
 * @internalcomponent c2-date-input
 * @internalcomponent c2-time-input
 */
@customElement('c2-recurrence-editor')
export class RecurrenceEditor extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, recurrenceEditorMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private readonly slots = new SlotPresenceController(this, ['footer'])

  /** The rule, in `format`: an RRULE (`FREQ=WEEKLY;BYDAY=MO,WE`, an `RRULE:` prefix is read too) or a cron expression. Empty for "Does not repeat". */
  @property({ type: String }) value = ''
  /** What `value` holds: `rrule` (the default) or `cron`. */
  @property({ type: String }) format: RecurrenceFormat = 'rrule'
  /** Form field name. The form receives `value`. */
  @property({ type: String, reflect: true }) name = ''
  /** The first occurrence, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (DTSTART). Today when empty. */
  @property({ type: String }) start = ''
  /**
   * The frequencies offered, separated by spaces: `none` (Does not repeat), `minutely`, `hourly`, `daily`, `weekly`,
   * `monthly`, `yearly`. Defaults to `daily weekly monthly yearly`, and to every frequency but `none` in cron format.
   */
  @property({ type: String }) frequencies = ''
  /**
   * The first day of the week in the weekday row, `MO` (the default) to `SU`, and the `WKST` a new weekly rule takes
   * ("every 2 weeks" counts weeks from that day). A rule read from `value` keeps its own `WKST`.
   */
  @property({ attribute: 'week-start' }) weekStart: Weekday = 'MO'
  /** Shows a time-of-day row, written as `BYHOUR`/`BYMINUTE`. Always shown in cron format. */
  @property({ type: Boolean, attribute: 'with-time' }) withTime = false
  /** How many of the next occurrences to show. `0` hides them. */
  @property({ type: Number, attribute: 'preview-count' }) previewCount = 5
  /** Asks for a rule other than "Does not repeat" before the form can be submitted. */
  @property({ type: Boolean, reflect: true }) required = false
  /** Prevents interaction and excludes the value from form submission. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Accessible name of the editor's group. Defaults to the enclosing field's label, then to "Recurrence". */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null
  /** Draws each of the next occurrences instead of the built-in date text. */
  @property({ attribute: false }) renderOccurrence?: RecurrenceOccurrenceRenderer

  /** The rule shown; `null` is "Does not repeat". */
  @state() private model: RecurrenceRule | null = null
  @state() private disabledByForm = false
  /** The value the model was last read from or written to, so an outside change to `value` is read again. */
  private readValue: string | undefined
  private readFormat: RecurrenceFormat | undefined
  private defaultValue = ''
  private defaultCaptured = false
  private timeLoading = false

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

  /** The rule as an object, `null` for "Does not repeat". Setting it writes `value` in `format`. */
  get rule(): RecurrenceRule | null {
    this.syncModel()
    return this.model ? structuredClone(this.model) : null
  }
  set rule(rule: RecurrenceRule | null) {
    if (rule && this.cronFormat && formatCron(rule) === null) {
      console.warn('c2-recurrence-editor: cron cannot say this rule (an end, an nth weekday, an uneven step); it was not applied.')
      return
    }
    this.model = rule ? structuredClone(rule) : null
    this.value = this.write(this.model)
    this.readValue = this.value
    this.readFormat = this.format
  }

  /** The rule as a sentence, in the element's language: "Every 2 weeks on Monday and Wednesday, 10 times". */
  get summary(): string {
    this.syncModel()
    return describeRecurrence(this.model, { locale: this.msg.locale, time: this.timeFromStart() })
  }

  /** The rule as a cron expression, or `null` when cron cannot say it (an end, "the third Tuesday", every 2 weeks). */
  get cron(): string | null {
    this.syncModel()
    return this.model ? formatCron(this.model) : null
  }

  /** The rule as an RRULE value (no `RRULE:` prefix), or `''` for "Does not repeat". */
  toRRule(): string {
    this.syncModel()
    return this.model ? formatRRule(this.model) : ''
  }

  /** The next `limit` occurrences from `start`, as local dates. */
  nextOccurrences(limit = this.previewCount): Date[] {
    this.syncModel()
    if (!this.model) return []
    return this.upcoming(this.model, limit).map((clock) => new Date(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute))
  }

  /**
   * The occurrences from `start`. A cron step counts from the top of its range (minute 0, midnight, January), not from
   * the start, so in cron format the steps are laid out from there and the ones before `start` skipped.
   */
  private upcoming(rule: RecurrenceRule, limit: number): WallClock[] {
    const start = this.startClock()
    if (!this.cronFormat || rule.interval === 1) return occurrences(rule, { start, limit })
    const anchor: WallClock = rule.freq === 'monthly' ? { ...start, year: start.year, month: 1, day: 1, hour: 0, minute: 0 } : { ...start, hour: 0, minute: 0 }
    return occurrences(rule, { start: { ...anchor, hour: rule.hour ?? anchor.hour, minute: rule.minute ?? anchor.minute }, after: start, limit })
  }

  checkValidity() {
    return this.internals.checkValidity()
  }
  reportValidity() {
    return this.internals.reportValidity()
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = this.getAttribute('value') ?? ''
      this.defaultCaptured = true
    }
  }

  formResetCallback() {
    this.value = this.defaultValue
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }

  private get cronFormat() {
    return this.format === 'cron'
  }

  /** The frequencies offered, with the shown one added when `frequencies` leaves it out (unless `listedOnly`). */
  private offered(listedOnly = false): RecurrenceFrequency[] {
    const listed = this.frequencies
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(isFrequency)
    const list: RecurrenceFrequency[] = listed.length ? listed : this.cronFormat ? [...FREQUENCIES] : ['daily', 'weekly', 'monthly', 'yearly']
    const current: RecurrenceFrequency = this.model?.freq ?? 'none'
    if (!listedOnly && !list.includes(current)) list.push(current)
    const order: RecurrenceFrequency[] = ['none', ...FREQUENCIES]
    return order.filter((freq) => list.includes(freq))
  }

  private startClock(): WallClock {
    return parseWallClock(this.start) ?? { ...wallClockOf(new Date()), hour: 0, minute: 0 }
  }

  /** The time of day `start` names, when it has one. */
  private timeFromStart(): { hour: number; minute: number } | undefined {
    const start = parseWallClock(this.start)
    return start && /[T ]\d/.test(this.start) ? { hour: start.hour, minute: start.minute } : undefined
  }

  private write(rule: RecurrenceRule | null): string {
    if (!rule) return ''
    return this.cronFormat ? (formatCron(rule) ?? '') : formatRRule(rule, { untilDateTime: rule.hour !== undefined || !!this.timeFromStart() })
  }

  private read(value: string): RecurrenceRule | null {
    return this.cronFormat ? parseCron(value) : parseRRule(value)
  }

  /** Reads `value` again when it changed from outside. */
  private syncModel() {
    if (this.value === this.readValue && this.format === this.readFormat) return
    this.readValue = this.value
    this.readFormat = this.format
    const value = this.value.trim()
    const rule = value ? this.read(value) : null
    if (value && !rule) console.warn(`c2-recurrence-editor: cannot read ${this.format} "${value}"; showing the default rule.`)
    const listed = this.offered(true)
    if (rule || listed.includes('none')) {
      this.model = rule
      return
    }
    // No rule and no "Does not repeat": the editor shows, and takes, the default rule.
    this.model = defaultRule(this.startClock(), listed.includes('weekly') ? 'weekly' : (listed[0] as RecurrenceRule['freq']))
    if (this.model.freq === 'weekly' && this.weekStart !== 'MO' && WEEKDAYS.includes(this.weekStart)) this.model.weekStart = this.weekStart
    if (this.cronFormat) {
      this.model.hour ??= this.startClock().hour
      this.model.minute ??= this.startClock().minute
    }
    if (!value) {
      this.value = this.write(this.model)
      this.readValue = this.value
    }
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('value') || changed.has('format') || changed.has('frequencies') || changed.has('start')) this.syncModel()
    if (this.showsTime() && this.model?.freq !== 'hourly' && !this.timeLoading && !customElements.get('c2-time-input')) {
      // The time row is the only part that needs the time input: load it the first time the row shows.
      this.timeLoading = true
      void import('@c2n/time-input')
    }
  }

  protected override updated() {
    this.syncFormState()
  }

  private syncFormState() {
    if (this.effectiveDisabled) {
      this.internals.setFormValue(null)
      this.internals.setValidity({})
      return
    }
    this.internals.setFormValue(this.value, this.value)
    if (this.required && !this.model)
      this.internals.setValidity({ valueMissing: true }, this.msg.t('valueMissing'), this.renderRoot.querySelector('c2-select') ?? undefined)
    else this.internals.setValidity({})
  }

  /** Applies an edit, writes `value` and tells the app. */
  private commit(rule: RecurrenceRule | null, events: 'input' | 'both' = 'both') {
    this.model = rule
    this.value = this.write(rule)
    this.readValue = this.value
    this.readFormat = this.format
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    if (events === 'both') this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private edit(change: (rule: RecurrenceRule) => void, events: 'input' | 'both' = 'both') {
    if (!this.model) return
    const rule = structuredClone(this.model)
    change(rule)
    // An edit that changes nothing (the last weekday clicked off) fires nothing.
    if (formatRRule(rule) === formatRRule(this.model)) return
    this.commit(rule, events)
  }

  private showsTime(): boolean {
    const freq = this.model?.freq
    return !!freq && freq !== 'minutely' && (this.withTime || this.cronFormat)
  }

  private handleFrequency(freq: string) {
    if (!isFrequency(freq) || freq === (this.model?.freq ?? 'none')) return
    if (freq === 'none') return this.commit(null)
    const start = this.startClock()
    const rule = withFrequency(this.model ?? { freq, interval: 1 }, freq, start)
    if (this.cronFormat) {
      const intervals = CRON_INTERVALS[freq] ?? [1]
      if (!intervals.includes(rule.interval)) rule.interval = 1
      if (freq !== 'minutely' && freq !== 'hourly') rule.hour ??= start.hour
      if (freq !== 'minutely') rule.minute ??= start.minute
      if (rule.byMonthDay === -1) rule.byMonthDay = Math.min(start.day, 28)
    }
    if (freq === 'weekly' && this.weekStart !== 'MO' && WEEKDAYS.includes(this.weekStart)) rule.weekStart = this.weekStart
    this.commit(rule)
  }

  private toggleDay(day: Weekday) {
    this.edit((rule) => {
      const days = new Set(rule.byDay ?? [])
      if (days.has(day)) {
        // A weekly rule keeps at least one day.
        if (days.size === 1) return
        days.delete(day)
      } else days.add(day)
      rule.byDay = WEEKDAYS.filter((entry) => days.has(entry))
    })
  }

  private handleWeekdayKey(event: KeyboardEvent) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(event.key)) return
    const buttons = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.weekday')]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    const rtl = getComputedStyle(this).direction === 'rtl'
    const forward = (event.key === 'ArrowRight') !== rtl
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (forward ? 1 : -1) + buttons.length) % buttons.length
    buttons[next].focus()
  }

  private monthMode(rule: RecurrenceRule): MonthMode {
    return rule.byWeekday ? 'weekday' : rule.byMonthDay === -1 ? 'last' : 'day'
  }

  private handleMonthMode(mode: string) {
    const start = this.startClock()
    this.edit((rule) => {
      delete rule.byWeekday
      delete rule.byMonthDay
      if (mode === 'last') rule.byMonthDay = -1
      else if (mode === 'weekday') {
        const ordinal = weekdayOrdinalOf(start)
        rule.byWeekday = { ordinal: ordinal > 4 ? -1 : ordinal, day: weekdayOf(start) }
      } else rule.byMonthDay = start.day
    })
  }

  private endMode(rule: RecurrenceRule): EndMode {
    return rule.count !== undefined ? 'count' : rule.until ? 'until' : 'never'
  }

  private handleEndMode(mode: string) {
    this.edit((rule) => {
      const ruleWithoutEnd = { ...rule, count: undefined, until: undefined }
      delete rule.count
      delete rule.until
      if (mode === 'count') rule.count = 10
      if (mode === 'until') {
        // The tenth occurrence is a sensible first end date.
        const first = occurrences(ruleWithoutEnd, { start: this.startClock(), limit: 10 })
        const tenth = first[first.length - 1] ?? this.startClock()
        rule.until = formatWallDate(tenth)
      }
    })
  }

  private handleTime(text: string) {
    const match = /^(\d{1,2}):(\d{2})/.exec(text)
    this.edit((rule) => {
      if (match) {
        rule.hour = Number(match[1])
        rule.minute = Number(match[2])
      } else if (!this.cronFormat) {
        delete rule.hour
        delete rule.minute
      }
    })
  }

  /** A c2-select of `options`, firing `pick` with the chosen value. */
  private renderSelect(dataPart: string, name: string, value: string, options: [string, string][], pick: (value: string) => void) {
    const stop = (event: Event) => event.stopPropagation()
    return html`<c2-select
      data-part=${dataPart}
      aria-label=${name}
      .value=${[value]}
      ?disabled=${this.effectiveDisabled}
      @input=${stop}
      @change=${stop}
      @selection-change=${(event: CustomEvent<{ value: string[] }>) => {
        const next = event.detail.value[0]
        if (next !== undefined && next !== value) pick(next)
      }}
      >${options.map(([key, label]) => html`<c2-list-item value=${key}>${label}</c2-list-item>`)}</c2-select
    >`
  }

  /** A c2-number-input between `min` and `max`, firing `set` with each whole number typed. */
  private renderNumber(
    name: string,
    value: number,
    min: number,
    max: number,
    set: (value: number, events: 'input' | 'both') => void,
    unit: string,
    dataPart: string,
  ) {
    return html`<c2-number-input
        data-part=${dataPart}
        aria-label=${name}
        .value=${String(value)}
        min=${min}
        max=${max}
        ?disabled=${this.effectiveDisabled}
        @input=${(event: Event) => {
          event.stopPropagation()
          const next = wholeNumber((event.currentTarget as HTMLInputElement).value, min, max)
          if (next !== null && next !== value) set(next, 'input')
        }}
        @change=${(event: Event) => {
          event.stopPropagation()
          const next = wholeNumber((event.currentTarget as HTMLInputElement).value, min, max)
          if (next === null) return
          // Typing already applied the number on `input`: the commit still owes the app its `change`.
          const before = this.value
          set(next, 'both')
          if (this.value === before) this.dispatchEvent(new Event('change', { bubbles: true }))
        }}
      ></c2-number-input
      >${unit ? html`<span class="unit">${unit}</span>` : nothing}`
  }

  private row(label: string, content: unknown) {
    return html`<div class="row" part="row">
      <span class="label" part="label" aria-hidden="true">${label}</span>
      <div class="controls">${content}</div>
    </div>`
  }

  private renderInterval(rule: RecurrenceRule) {
    const unit = (n: number) => this.msg.t(UNIT_KEYS[rule.freq], n)
    if (this.cronFormat) {
      const intervals = CRON_INTERVALS[rule.freq] ?? [1]
      if (intervals.length < 2) return nothing
      return this.row(
        this.msg.t('everyLabel'),
        this.renderSelect(
          'interval',
          this.msg.t('intervalName'),
          String(rule.interval),
          intervals.map((n) => [String(n), `${n} ${unit(n)}`]),
          (next) => this.edit((draft) => (draft.interval = Number(next))),
        ),
      )
    }
    return this.row(
      this.msg.t('everyLabel'),
      this.renderNumber(
        this.msg.t('intervalName'),
        rule.interval,
        1,
        999,
        (next, events) => this.edit((draft) => (draft.interval = next), events),
        unit(rule.interval),
        'interval',
      ),
    )
  }

  private renderWeekdays(rule: RecurrenceRule) {
    const start = WEEKDAYS.indexOf(WEEKDAYS.includes(this.weekStart) ? this.weekStart : 'MO')
    const days = [...WEEKDAYS.slice(start), ...WEEKDAYS.slice(0, start)]
    const locale = this.msg.locale
    return this.row(
      this.msg.t('onLabel'),
      html`<div class="weekdays" part="weekdays" role="group" aria-label=${this.msg.t('weekdaysName')} @keydown=${this.handleWeekdayKey}>
        ${days.map((day) => {
          const pressed = rule.byDay?.includes(day) ?? false
          return html`<button
            type="button"
            class="weekday"
            part="weekday"
            data-day=${day}
            aria-pressed=${pressed ? 'true' : 'false'}
            aria-label=${weekdayName(day, locale)}
            ?disabled=${this.effectiveDisabled}
            @click=${() => this.toggleDay(day)}
          >
            ${weekdayName(day, locale, 'narrow')}
          </button>`
        })}
      </div>`,
    )
  }

  private renderMonthDay(rule: RecurrenceRule) {
    const locale = this.msg.locale
    const mode = this.monthMode(rule)
    const modes: [string, string][] = this.cronFormat
      ? [['day', this.msg.t('modeDay')]]
      : [
          ['day', this.msg.t('modeDay')],
          ['weekday', this.msg.t('modeWeekday')],
          ['last', this.msg.t('modeLastDay')],
        ]
    const controls = [modes.length > 1 ? this.renderSelect('mode', this.msg.t('modeName'), mode, modes, (next) => this.handleMonthMode(next)) : nothing]
    if (mode === 'day') {
      controls.push(
        this.renderNumber(
          this.msg.t('dayName'),
          rule.byMonthDay ?? this.startClock().day,
          1,
          rule.freq === 'yearly' ? daysInMonth(2024, rule.byMonth ?? this.startClock().month) : this.cronFormat ? 28 : 31,
          (next, events) => this.edit((draft) => (draft.byMonthDay = next), events),
          '',
          'day',
        ),
      )
    }
    if (mode === 'weekday' && rule.byWeekday) {
      const { ordinal, day } = rule.byWeekday
      controls.push(
        this.renderSelect(
          'ordinal',
          this.msg.t('ordinalName'),
          String(ordinal),
          ORDINALS.map((n) => [String(n), this.msg.t('ordinal', n)]),
          (next) => this.edit((draft) => (draft.byWeekday = { ordinal: Number(next), day })),
        ),
        this.renderSelect(
          'weekday',
          this.msg.t('weekdayName'),
          day,
          WEEKDAYS.map((entry) => [entry, weekdayName(entry, locale)]),
          (next) => this.edit((draft) => (draft.byWeekday = { ordinal, day: next as Weekday })),
        ),
      )
    }
    return this.row(this.msg.t('onLabel'), controls)
  }

  private renderMonth(rule: RecurrenceRule) {
    const locale = this.msg.locale
    return this.row(
      this.msg.t('inLabel'),
      this.renderSelect(
        'month',
        this.msg.t('monthName'),
        String(rule.byMonth ?? this.startClock().month),
        Array.from({ length: 12 }, (_, index) => [String(index + 1), monthName(index + 1, locale)] as [string, string]),
        (next) =>
          this.edit((draft) => {
            draft.byMonth = Number(next)
            // February 30 never comes: the day is kept within the month picked.
            if (draft.byMonthDay !== undefined && draft.byMonthDay > 0) draft.byMonthDay = Math.min(draft.byMonthDay, daysInMonth(2024, draft.byMonth))
          }),
      ),
    )
  }

  private renderTime(rule: RecurrenceRule) {
    if (rule.freq === 'hourly') {
      return this.row(
        this.msg.t('atLabel'),
        this.renderNumber(
          this.msg.t('minuteName'),
          rule.minute ?? 0,
          0,
          59,
          (next, events) => this.edit((draft) => (draft.minute = next), events),
          this.msg.t('minuteUnit'),
          'minute',
        ),
      )
    }
    const time = rule.hour !== undefined ? `${String(rule.hour).padStart(2, '0')}:${String(rule.minute ?? 0).padStart(2, '0')}` : ''
    return this.row(
      this.msg.t('atLabel'),
      html`<c2-time-input
        aria-label=${this.msg.t('timeName')}
        .value=${time}
        ?disabled=${this.effectiveDisabled}
        @input=${(event: Event) => event.stopPropagation()}
        @change=${(event: Event) => {
          event.stopPropagation()
          this.handleTime((event.currentTarget as HTMLInputElement).value)
        }}
      ></c2-time-input>`,
    )
  }

  private renderEnd(rule: RecurrenceRule) {
    const mode = this.endMode(rule)
    const controls: unknown[] = [
      this.renderSelect(
        'end',
        this.msg.t('endName'),
        mode,
        [
          ['never', this.msg.t('endNever')],
          ['until', this.msg.t('endUntil')],
          ['count', this.msg.t('endCount')],
        ],
        (next) => this.handleEndMode(next),
      ),
    ]
    if (mode === 'until') {
      controls.push(
        html`<c2-date-input
          aria-label=${this.msg.t('untilName')}
          .value=${rule.until ?? ''}
          min=${formatWallDate(this.startClock())}
          ?disabled=${this.effectiveDisabled}
          @input=${(event: Event) => event.stopPropagation()}
          @change=${(event: Event) => {
            event.stopPropagation()
            const value = (event.currentTarget as HTMLInputElement).value
            if (parseWallClock(value)) this.edit((draft) => (draft.until = value))
          }}
        ></c2-date-input>`,
      )
    }
    if (mode === 'count') {
      const count = rule.count ?? 1
      controls.push(
        this.renderNumber(
          this.msg.t('countName'),
          count,
          1,
          9999,
          (next, events) => this.edit((draft) => (draft.count = next), events),
          this.msg.t('countUnit', count),
          'count',
        ),
      )
    }
    return this.row(this.msg.t('endsLabel'), controls)
  }

  private renderOccurrences(rule: RecurrenceRule | null) {
    if (!rule || this.previewCount <= 0 || rule.extra?.length) return nothing
    const list = this.upcoming(rule, Math.min(50, this.previewCount))
    const withTime = rule.freq === 'minutely' || rule.freq === 'hourly' || rule.hour !== undefined || !!this.timeFromStart()
    const locale = this.msg.locale
    return html`<div class="occurrences" part="occurrences">
      <span aria-hidden="true">${this.msg.t('nextLabel')}</span>
      ${
        list.length
          ? html`<ol aria-label=${this.msg.t('occurrencesName')}>
              ${list.map((clock, index) => {
                const label = occurrenceText(clock, locale, withTime)
                const date = new Date(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute)
                return html`<li class="occurrence" part="occurrence">
                  ${this.renderOccurrence ? this.renderOccurrence({ date, clock, index, label }) : label}
                </li>`
              })}
            </ol>`
          : html`<span>${this.msg.t('noOccurrences')}</span>`
      }
    </div>`
  }

  override render() {
    const rule = this.model
    const disabled = this.effectiveDisabled
    const freq: RecurrenceFrequency = rule?.freq ?? 'none'
    const summary = describeRecurrence(rule, { locale: this.msg.locale, time: this.timeFromStart() })
    return html`<div
        class="editor ${classMap({ disabled })}"
        part="editor"
        role="group"
        aria-label=${this.ariaLabel || this.field.label || this.msg.t('group')}
        aria-describedby=${this.field.describedBy('summary')}
        aria-invalid=${this.field.invalid ? 'true' : nothing}
      >
        <div class="rows" part="rows">
          ${this.row(
            this.msg.t('repeatLabel'),
            this.renderSelect(
              'frequency',
              this.msg.t('repeatLabel'),
              freq,
              this.offered().map((entry) => [entry, this.msg.t(FREQUENCY_KEYS[entry])]),
              (next) => this.handleFrequency(next),
            ),
          )}
          ${rule ? this.renderInterval(rule) : nothing} ${rule?.freq === 'weekly' ? this.renderWeekdays(rule) : nothing}
          ${rule?.freq === 'yearly' ? this.renderMonth(rule) : nothing}
          ${rule && (rule.freq === 'monthly' || rule.freq === 'yearly') ? this.renderMonthDay(rule) : nothing}
          ${rule && this.showsTime() ? this.renderTime(rule) : nothing} ${rule && !this.cronFormat ? this.renderEnd(rule) : nothing}
        </div>
        <p id="summary" class="summary" part="summary" aria-live="polite">${summary}</p>
        ${this.renderOccurrences(rule)}
        <div class="footer" part="footer" ?hidden=${!this.slots.has('footer')}>
          <slot name="footer" @slotchange=${this.slots.handleSlotChange}></slot>
        </div>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-recurrence-editor': RecurrenceEditor
  }
}
