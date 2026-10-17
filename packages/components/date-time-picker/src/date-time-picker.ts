import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { redispatchEvent, SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { classMap } from 'lit/directives/class-map.js'
import { ifDefined } from 'lit/directives/if-defined.js'
import { live } from 'lit/directives/live.js'
import type { Overlay } from '@c2n/overlay'
import type { TimeInput } from '@c2n/time-input'
import { dateTimePickerMessages } from './messages'
import {
  formatDate,
  formatOffset,
  formatTime,
  formatWallClock,
  instantOf,
  isTimeZone,
  offsetAt,
  parseWallClock,
  wallClockAt,
  zoneLabel,
  type WallClock,
} from './zoned-time'
import styles from './date-time-picker.scss?inline'

import '@c2n/overlay'
import '@c2n/time-input'

export type DateTimePickerWeekStart = 'monday' | 'sunday'

/** Events fired by {@link DateTimePicker}, keyed for `addEventListener`. */
export interface DateTimePickerEventMap {
  input: InputEvent
  change: Event
}

export interface DateTimePicker {
  addEventListener: TypedAddEventListener<DateTimePicker, DateTimePickerEventMap>
  removeEventListener: TypedRemoveEventListener<DateTimePicker, DateTimePickerEventMap>
}

interface Month {
  year: number
  month: number
}

const asSeconds = (clock: WallClock) => Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second) / 1000
const fromSeconds = (seconds: number): WallClock => {
  const date = new Date(seconds * 1000)
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  }
}
const addDays = (date: string, amount: number) => {
  const [year, month, day] = date.split('-').map(Number)
  return formatDate(fromSeconds(Date.UTC(year, month - 1, day + amount) / 1000))
}
const addMonths = ({ year, month }: Month, amount: number): Month => {
  const index = year * 12 + month - 1 + amount
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
const daysIn = ({ year, month }: Month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/**
 * A form-associated date-and-time field with a time zone. The value is a wall-clock `YYYY-MM-DDTHH:mm` string (with
 * `:ss` when `step` is below 60 seconds), the same shape as `<input type="datetime-local">`, read in `time-zone` (an
 * IANA name such as `Europe/Paris`; empty means the browser's own zone). `valueAsDate` and `valueAsISOString` give
 * the instant it names, so a meeting at 09:00 in Tokyo stays 09:00 in Tokyo whoever picks it.
 *
 * The field keeps native keyboard editing. The calendar button (or Alt+ArrowDown in the field) opens a popup with a
 * month calendar, a `c2-time-input` for the time and, when `time-zones` lists several zones, a time-zone choice;
 * changing the zone keeps the wall clock. Arrow keys move by day or week in the calendar, Home/End within the week and
 * Page Up/Page Down by month (with Shift, by year). Days outside `min`/`max` cannot be picked, and the time is clamped
 * to them. With `time-zone-name`, the zone is submitted alongside the value.
 *
 * @tag c2-date-time-picker
 *
 * @slot calendar-icon - Replaces the calendar icon at the end of the field.
 * @slot supporting-text - Rich helper content below the field. `help` and `error-text` are plain-text shortcuts.
 *
 * @event {InputEvent} input - Fired whenever the value or the time zone changes, from typing or from the popup.
 * @event {Event} change - Fired when a change is committed: on blur after typing, or on each pick in the popup.
 *
 * @cssproperty {pixel} [--c2-date-time-picker--min-height=36px]
 * @cssproperty {pixel} [--c2-date-time-picker--gap=8px]
 * @cssproperty {padding} [--c2-date-time-picker--padding=6px 8px 6px 12px]
 * @cssproperty {border} [--c2-date-time-picker--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-date-time-picker--border-radius=6px]
 * @cssproperty {color} [--c2-date-time-picker--color=#18181b]
 * @cssproperty {color} [--c2-date-time-picker--background=#ffffff]
 * @cssproperty {font-size} [--c2-date-time-picker--font-size=14px]
 * @cssproperty {font-family} [--c2-date-time-picker--font-family=inherit]
 * @cssproperty {pixel} [--c2-date-time-picker--line-height=20px]
 * @cssproperty {border} [--c2-date-time-picker__hover--border=1px solid #a1a1aa]
 * @cssproperty {border} [--c2-date-time-picker__focus--border=1px solid #0265dc]
 * @cssproperty {outline} [--c2-date-time-picker__focus--outline=none]
 * @cssproperty {pixel} [--c2-date-time-picker__focus--outline-offset=0px]
 * @cssproperty {border} [--c2-date-time-picker__error--border=1px solid #dc2626]
 * @cssproperty {outline} [--c2-date-time-picker__error__focus--outline=none]
 * @cssproperty {color} [--c2-date-time-picker__read-only--background=#fafafa]
 * @cssproperty {opacity} [--c2-date-time-picker__disabled--opacity=0.38]
 * @cssproperty {pixel} [--c2-date-time-picker__calendar-icon--size=18px]
 * @cssproperty {color} [--c2-date-time-picker__calendar-icon--color=#71717a]
 * @cssproperty {color} [--c2-date-time-picker__calendar-icon__hover--color=#18181b]
 * @cssproperty {color} [--c2-date-time-picker__time-zone--color=#71717a] - The zone abbreviation shown in the field.
 * @cssproperty {font-size} [--c2-date-time-picker__time-zone--font-size=12px]
 * @cssproperty {pixel} [--c2-date-time-picker__supporting-text--gap=4px]
 * @cssproperty {font-size} [--c2-date-time-picker__supporting-text--font-size=12px]
 * @cssproperty {pixel} [--c2-date-time-picker__supporting-text--line-height=16px]
 * @cssproperty {color} [--c2-date-time-picker__supporting-text--color=#71717a]
 * @cssproperty {color} [--c2-date-time-picker__supporting-text__error--color=#dc2626]
 * @cssproperty {color} [--c2-date-time-picker__picker--background=#ffffff]
 * @cssproperty {color} [--c2-date-time-picker__picker--color=#18181b]
 * @cssproperty {border} [--c2-date-time-picker__picker--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-date-time-picker__picker--border-radius=8px]
 * @cssproperty {shadow} [--c2-date-time-picker__picker--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-date-time-picker__picker--padding=12px]
 * @cssproperty {pixel} [--c2-date-time-picker__picker--gap=10px]
 * @cssproperty {border} [--c2-date-time-picker__picker-divider--border=1px solid #e4e4e7]
 * @cssproperty {font-size} [--c2-date-time-picker__month-title--font-size=14px]
 * @cssproperty {font-weight} [--c2-date-time-picker__month-title--font-weight=600]
 * @cssproperty {pixel} [--c2-date-time-picker__navigation--size=28px]
 * @cssproperty {border-radius} [--c2-date-time-picker__navigation--border-radius=6px]
 * @cssproperty {color} [--c2-date-time-picker__navigation--color=#71717a]
 * @cssproperty {color} [--c2-date-time-picker__navigation__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-date-time-picker__weekday--color=#71717a]
 * @cssproperty {font-size} [--c2-date-time-picker__weekday--font-size=12px]
 * @cssproperty {pixel} [--c2-date-time-picker__day--size=32px]
 * @cssproperty {font-size} [--c2-date-time-picker__day--font-size=14px]
 * @cssproperty {border-radius} [--c2-date-time-picker__day--border-radius=999px]
 * @cssproperty {color} [--c2-date-time-picker__day__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-date-time-picker__day__today--color=#0265dc]
 * @cssproperty {font-weight} [--c2-date-time-picker__day__today--font-weight=600]
 * @cssproperty {color} [--c2-date-time-picker__day__selected--background=#0265dc]
 * @cssproperty {color} [--c2-date-time-picker__day__selected--color=#ffffff]
 * @cssproperty {opacity} [--c2-date-time-picker__day__disabled--opacity=0.38]
 * @cssproperty {outline} [--c2-date-time-picker__picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-date-time-picker__picker__focus--outline-offset=1px]
 * @cssproperty {color} [--c2-date-time-picker__picker-label--color=#71717a] - The Time and Time zone labels in the popup.
 * @cssproperty {font-size} [--c2-date-time-picker__picker-label--font-size=12px]
 * @cssproperty {border} [--c2-date-time-picker__zone-select--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-date-time-picker__zone-select--border-radius=6px]
 * @cssproperty {color} [--c2-date-time-picker__zone-select--background=#ffffff]
 * @cssproperty {font-size} [--c2-date-time-picker__picker-action--font-size=12px]
 * @cssproperty {font-weight} [--c2-date-time-picker__picker-action--font-weight=600]
 * @cssproperty {color} [--c2-date-time-picker__picker-action--color=#71717a]
 * @cssproperty {color} [--c2-date-time-picker__picker-action__hover--color=#18181b]
 * @cssproperty {color} [--c2-date-time-picker__picker-action-primary--color=#0265dc]
 * @cssproperty {color} [--c2-date-time-picker__picker-action-primary__hover--color=#0154b8]
 *
 * @internalcomponent c2-overlay
 * @internalcomponent c2-time-input
 */
@customElement('c2-date-time-picker')
export class DateTimePicker extends LitElement {
  static formAssociated = true
  static override styles = unsafeCSS(styles)

  private readonly internals = this.attachInternals()
  /** Interface text in the nearest `lang`, and that language for `Intl`; a `lang` change redraws. */
  private readonly msg = new LocalizeController(this, dateTimePickerMessages)
  private customValidityMessage = ''
  private defaultValue = ''
  private defaultTimeZone = ''
  private defaultCaptured = false
  @state() private disabledByForm = false
  @state() private focused = false
  @state() private pickerOpen = false
  @state() private visibleMonth: Month = { year: 2000, month: 1 }
  @state() private focusDate = ''
  private readonly slotPresence = new SlotPresenceController(this, ['supporting-text'])
  /** Label and description handed down by an enclosing `c2-form-field`, which then draws the supporting line. */
  private readonly field = new FieldContextConsumer(this, { kind: 'text' })
  @query('input') private readonly input?: HTMLInputElement
  @query('#picker') private readonly picker?: Overlay

  /** Current wall-clock date and time as `YYYY-MM-DDTHH:mm` (or `HH:mm:ss`), read in `time-zone`; empty when unset. */
  @property({ type: String, reflect: true }) value = ''
  /** Earliest valid date and time as `YYYY-MM-DDTHH:mm`. */
  @property({ type: String }) min = ''
  /** Latest valid date and time as `YYYY-MM-DDTHH:mm`. */
  @property({ type: String }) max = ''
  /** Granularity in seconds between valid times, counted from `min`. Below 60 the value carries seconds. */
  @property({ type: Number }) step = 60
  /** IANA time zone the value is read in, such as `Europe/Paris`. Empty means the browser's own zone. */
  @property({ attribute: 'time-zone', reflect: true }) timeZone = ''
  /** IANA zones the popup offers to choose from, separated by spaces or commas. With fewer than two, the zone is fixed. */
  @property({ attribute: 'time-zones' }) timeZones = ''
  /** First day of each calendar week. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: DateTimePickerWeekStart = 'monday'
  /** Form field name of the value. */
  @property({ type: String, reflect: true }) name = ''
  /** Form field name under which the time zone is submitted too (the browser's zone when `time-zone` is empty). */
  @property({ attribute: 'time-zone-name' }) timeZoneName = ''
  /** Requires a date and time before the form can be submitted. */
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
  /** Accessible name forwarded to the native date-time input. */
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

  /** The instant the value names in `time-zone`, or `null` when empty. Setting it writes that instant's wall clock in the zone. */
  get valueAsDate(): Date | null {
    const clock = parseWallClock(this.value)
    return clock ? new Date(instantOf(clock, this.zone)) : null
  }
  set valueAsDate(date: Date | null) {
    this.value = date && !Number.isNaN(date.getTime()) ? formatWallClock(wallClockAt(date.getTime(), this.zone), this.showSeconds) : ''
  }

  /** The value as an ISO 8601 string with the zone's UTC offset (`2026-10-14T09:30:00+02:00`), or empty. */
  get valueAsISOString() {
    const clock = parseWallClock(this.value)
    if (!clock) return ''
    return `${formatWallClock(clock, true)}${formatOffset(offsetAt(instantOf(clock, this.zone), this.zone))}`
  }

  /** The zone in use: `time-zone` when the engine knows it, else the browser's own zone. */
  get resolvedTimeZone() {
    return this.zone || Intl.DateTimeFormat().resolvedOptions().timeZone
  }

  override connectedCallback() {
    super.connectedCallback()
    if (!this.defaultCaptured) {
      this.defaultValue = this.getAttribute('value') ?? ''
      this.defaultTimeZone = this.getAttribute('time-zone') ?? ''
      this.defaultCaptured = true
    }
  }

  override focus(options?: FocusOptions) {
    this.input?.focus(options)
  }

  /** Opens the popup. Does nothing while disabled or read-only. */
  showPicker() {
    if (this.effectiveDisabled || this.readOnly) return
    this.picker?.showPopover()
  }

  /** Closes the popup. */
  hidePicker() {
    if (this.picker?.matches(':popover-open')) this.picker.hidePopover()
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
    this.timeZone = this.defaultTimeZone
    this.error = false
  }
  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }
  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state !== 'string') return
    const [value, zone] = state.split('|')
    this.value = value
    if (zone !== undefined) this.timeZone = zone
  }

  private get effectiveDisabled() {
    return this.disabled || this.disabledByForm
  }
  private get zone() {
    return this.timeZone && isTimeZone(this.timeZone) ? this.timeZone : ''
  }
  private get stepSeconds() {
    return Number.isFinite(this.step) && this.step > 0 ? this.step : 60
  }
  private get showSeconds() {
    return this.stepSeconds < 60
  }
  /** The zones the popup offers, the current one included. */
  private get zoneChoices() {
    const zones = this.timeZones.split(/[\s,]+/).filter((zone) => zone && isTimeZone(zone))
    const current = this.resolvedTimeZone
    return zones.length && !zones.includes(current) ? [current, ...zones] : zones
  }
  private get showZone() {
    return !!this.timeZone || this.zoneChoices.length > 1
  }

  // ---- field -------------------------------------------------------------------------------------------------------

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
  private handleInputKeyDown(event: KeyboardEvent) {
    if (event.altKey && event.key === 'ArrowDown') {
      event.preventDefault()
      this.showPicker()
    }
  }
  private stopClick(event: Event) {
    // The field forwards clicks to the input; the calendar button opens the popup through popovertarget instead.
    event.stopPropagation()
  }
  private forwardFocus(event: Event) {
    if (event.target !== this.input) this.input?.focus()
  }

  // ---- values ------------------------------------------------------------------------------------------------------

  /** Moves a wall clock onto the `step` grid (counted from `min`, like the native input) and inside `min`/`max`. */
  private constrain(clock: WallClock): WallClock {
    const step = this.stepSeconds
    const min = parseWallClock(this.min)
    const max = parseWallClock(this.max)
    const base = min ? asSeconds(min) : 0
    let seconds = base + Math.round((asSeconds(clock) - base) / step) * step
    if (min && seconds < asSeconds(min)) seconds = asSeconds(min)
    if (max && seconds > asSeconds(max)) seconds = base + Math.floor((asSeconds(max) - base) / step) * step
    return fromSeconds(seconds)
  }

  private commit(clock: WallClock) {
    const value = formatWallClock(this.constrain(clock), this.showSeconds)
    this.visibleMonth = { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) }
    this.focusDate = value.slice(0, 10)
    if (value === this.value) return
    this.value = value
    this.dispatchChange()
  }

  private dispatchChange() {
    this.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new Event('change', { bubbles: true }))
  }

  private now() {
    const clock = wallClockAt(Date.now(), this.zone)
    return this.showSeconds ? clock : { ...clock, second: 0 }
  }

  private isUnavailable(date: string) {
    return (!!this.min && date < this.min.slice(0, 10)) || (!!this.max && date > this.max.slice(0, 10))
  }

  private pickDate(date: string) {
    if (this.isUnavailable(date)) return
    const [year, month, day] = date.split('-').map(Number)
    const current = parseWallClock(this.value)
    this.commit({ year, month, day, hour: current?.hour ?? 0, minute: current?.minute ?? 0, second: current?.second ?? 0 })
  }

  private handleTimeInput(event: Event) {
    // The inner time input's own events must not reach the host's listeners as if they were this element's.
    event.stopPropagation()
    const time = (event.currentTarget as TimeInput).value
    const match = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(time)
    if (!match) return
    const date = parseWallClock(this.value) ?? this.constrain(this.now())
    this.commit({ ...date, hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) })
  }

  private handleZoneChange(event: Event) {
    event.stopPropagation()
    const zone = (event.target as HTMLSelectElement).value
    if (zone === this.resolvedTimeZone) return
    this.timeZone = zone
    this.dispatchChange()
  }

  private pickNow() {
    this.commit(this.now())
  }

  // ---- calendar ----------------------------------------------------------------------------------------------------

  private handlePickerToggle(event: ToggleEvent) {
    this.pickerOpen = event.newState === 'open'
    if (this.pickerOpen) {
      const selected = parseWallClock(this.value) ?? this.constrain(this.now())
      this.visibleMonth = { year: selected.year, month: selected.month }
      this.focusDate = formatDate(selected)
      this.updateComplete.then(() => this.focusDay())
    } else if (this.renderRoot.querySelector('.picker')?.contains((this.renderRoot as ShadowRoot).activeElement)) {
      this.input?.focus()
    }
  }

  private focusDay() {
    this.renderRoot.querySelector<HTMLButtonElement>('.day[tabindex="0"]')?.focus({ preventScroll: true })
  }

  private canNavigate(amount: number) {
    const target = addMonths(this.visibleMonth, amount)
    const first = formatDate({ ...target, day: 1 })
    const last = formatDate({ ...target, day: daysIn(target) })
    if (amount < 0 && this.min && last < this.min.slice(0, 10)) return false
    if (amount > 0 && this.max && first > this.max.slice(0, 10)) return false
    return true
  }

  private navigate(amount: number) {
    if (this.canNavigate(amount)) this.visibleMonth = addMonths(this.visibleMonth, amount)
  }

  private async moveFocus(date: string, target: string) {
    if (this.isUnavailable(target) || target === date) return
    this.focusDate = target
    this.visibleMonth = { year: Number(target.slice(0, 4)), month: Number(target.slice(5, 7)) }
    await this.updateComplete
    this.focusDay()
  }

  private handleDayKeyDown(event: KeyboardEvent, date: string, column: number) {
    let target: string | undefined
    if (event.key === 'ArrowLeft') target = addDays(date, -1)
    else if (event.key === 'ArrowRight') target = addDays(date, 1)
    else if (event.key === 'ArrowUp') target = addDays(date, -7)
    else if (event.key === 'ArrowDown') target = addDays(date, 7)
    else if (event.key === 'Home') target = addDays(date, -column)
    else if (event.key === 'End') target = addDays(date, 6 - column)
    else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const [year, month, day] = date.split('-').map(Number)
      const next = addMonths({ year, month }, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1))
      target = formatDate({ ...next, day: Math.min(day, daysIn(next)) })
    }
    if (!target) return
    event.preventDefault()
    void this.moveFocus(date, target)
  }

  private weekdayLabels() {
    const formatter = new Intl.DateTimeFormat(this.msg.locale, { weekday: 'narrow', timeZone: 'UTC' })
    const first = this.weekStart === 'sunday' ? 7 : 1 // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, index) => formatter.format(Date.UTC(2024, 0, first + index)))
  }

  private renderCalendar(selectedDate: string) {
    const { year, month } = this.visibleMonth
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    const offset = this.weekStart === 'sunday' ? firstWeekday : (firstWeekday + 6) % 7
    const days = daysIn(this.visibleMonth)
    const weeks = Math.ceil((offset + days) / 7)
    const today = formatDate(wallClockAt(Date.now(), this.zone))
    const locale = this.msg.locale
    const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(Date.UTC(year, month - 1, 1))
    const dayLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    const monthStart = formatDate({ year, month, day: 1 })
    const monthEnd = formatDate({ year, month, day: days })
    // The roving tab stop: the focused day when it is in view, else the first pickable day of the month.
    let tabStop = this.focusDate >= monthStart && this.focusDate <= monthEnd && !this.isUnavailable(this.focusDate) ? this.focusDate : ''
    if (!tabStop) {
      for (let day = 1; day <= days && !tabStop; day++) {
        const date = formatDate({ year, month, day })
        if (!this.isUnavailable(date)) tabStop = date
      }
    }

    const cell = (index: number) => {
      const day = index - offset + 1
      if (day < 1 || day > days) return html`<span class="empty" role="gridcell"></span>`
      const date = formatDate({ year, month, day })
      const disabled = this.isUnavailable(date)
      return html`<span role="gridcell" aria-selected=${date === selectedDate ? 'true' : 'false'}>
        <button
          class=${classMap({ day: true, today: date === today, selected: date === selectedDate })}
          type="button"
          data-date=${date}
          aria-label=${dayLabel.format(Date.UTC(year, month - 1, day))}
          aria-current=${date === today ? 'date' : nothing}
          ?disabled=${disabled}
          tabindex=${date === tabStop ? '0' : '-1'}
          @click=${() => this.pickDate(date)}
          @focus=${() => (this.focusDate = date)}
          @keydown=${(event: KeyboardEvent) => this.handleDayKeyDown(event, date, index % 7)}
        >
          ${day}
        </button>
      </span>`
    }

    return html`<div class="calendar">
      <div class="month-header">
        <button class="navigation" type="button" aria-label=${this.msg.t('previousMonth')} ?disabled=${!this.canNavigate(-1)} @click=${() => this.navigate(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>
        </button>
        <span class="month-title" aria-live="polite">${monthLabel}</span>
        <button class="navigation" type="button" aria-label=${this.msg.t('nextMonth')} ?disabled=${!this.canNavigate(1)} @click=${() => this.navigate(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
      </div>
      <div class="grid" role="grid" aria-label=${monthLabel}>
        <div class="row weekdays" role="row">${this.weekdayLabels().map((label) => html`<span class="weekday" role="columnheader">${label}</span>`)}</div>
        ${Array.from(
          { length: weeks },
          (_, week) => html`<div class="row" role="row">${Array.from({ length: 7 }, (_, column) => cell(week * 7 + column))}</div>`,
        )}
      </div>
    </div>`
  }

  private renderTimeZone(instant: number) {
    const locale = this.msg.locale
    const choices = this.zoneChoices
    const current = this.resolvedTimeZone
    const label = (zone: string) => `${zone.replace(/_/g, ' ')} (${zoneLabel(zone, instant, locale, 'shortOffset')})`
    if (choices.length > 1) {
      return html`<label class="picker-row">
        <span class="picker-label">${this.msg.t('timeZone')}</span>
        <select class="zone-select" @input=${(event: Event) => event.stopPropagation()} @change=${this.handleZoneChange}>
          ${choices.map((zone) => html`<option value=${zone} ?selected=${zone === current}>${label(zone)}</option>`)}
        </select>
      </label>`
    }
    if (!this.timeZone) return nothing
    return html`<div class="picker-row">
      <span class="picker-label">${this.msg.t('timeZone')}</span>
      <span class="zone-name">${label(current)}</span>
    </div>`
  }

  private renderPicker() {
    if (this.effectiveDisabled || this.readOnly) return nothing
    const clock = parseWallClock(this.value)
    const selectedDate = clock ? formatDate(clock) : ''
    const timeMin = clock && this.min.slice(0, 10) === selectedDate ? this.min.slice(11) : ''
    const timeMax = clock && this.max.slice(0, 10) === selectedDate ? this.max.slice(11) : ''
    const instant = clock ? instantOf(clock, this.zone) : Date.now()
    return html`<c2-overlay id="picker" anchor="field" placement="bottom-start" free-width @toggle=${this.handlePickerToggle}>
      <div class="picker" role="dialog" aria-label=${this.ariaLabel || this.msg.t('calendar')}>
        ${
          this.pickerOpen
            ? html`${this.renderCalendar(selectedDate)}
                <div class="time-section">
                  <div class="picker-row">
                    <span class="picker-label" aria-hidden="true">${this.msg.t('time')}</span>
                    <c2-time-input
                      aria-label=${this.msg.t('time')}
                      .value=${clock ? formatTime(clock, this.showSeconds) : ''}
                      .min=${timeMin}
                      .max=${timeMax}
                      .step=${this.stepSeconds}
                      @input=${this.handleTimeInput}
                      @change=${(event: Event) => event.stopPropagation()}
                    ></c2-time-input>
                  </div>
                  ${this.renderTimeZone(instant)}
                </div>
                <div class="actions">
                  <button type="button" class="action" @click=${this.pickNow}>${this.msg.t('now')}</button>
                  <button type="button" class="action primary" @click=${this.hidePicker}>${this.msg.t('done')}</button>
                </div>`
            : nothing
        }
      </div>
    </c2-overlay>`
  }

  // ---- form --------------------------------------------------------------------------------------------------------

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('value') && this.input && this.input.value !== this.value) {
      // The native input rejects what it cannot parse and normalizes the rest; its reading is the value.
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
    const state = `${this.value}|${this.timeZone}`
    if (this.timeZoneName && this.name) {
      const data = new FormData()
      data.append(this.name, this.value)
      data.append(this.timeZoneName, this.resolvedTimeZone)
      this.internals.setFormValue(data, state)
    } else this.internals.setFormValue(this.value, state)
    this.input.setCustomValidity(this.customValidityMessage)
    this.internals.setValidity(this.input.validity, this.input.validationMessage, this.input)
  }

  override render() {
    const showError = this.error && !this.effectiveDisabled
    const invalid = (this.error || this.field.invalid) && !this.effectiveDisabled
    const message = showError ? this.errorText : this.help
    const showSupporting = !this.field.managed && (!!message || this.slotPresence.has('supporting-text'))
    const interactive = !this.effectiveDisabled && !this.readOnly
    const clock = parseWallClock(this.value)
    return html`
      <div
        id="field"
        class="field ${classMap({ focused: this.focused || this.pickerOpen, error: invalid, 'read-only': this.readOnly, disabled: this.effectiveDisabled })}"
        @click=${this.forwardFocus}
      >
        <input
          type="datetime-local"
          aria-label=${ifDefined(this.ariaLabel || this.field.label || undefined)}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-describedby=${this.field.describedBy(showSupporting && 'supporting-text')}
          min=${ifDefined(this.min || undefined)}
          max=${ifDefined(this.max || undefined)}
          step=${this.stepSeconds}
          ?required=${this.required}
          ?readonly=${this.readOnly}
          ?disabled=${this.effectiveDisabled}
          .value=${live(this.value)}
          @input=${this.handleInput}
          @change=${this.handleChange}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
          @keydown=${this.handleInputKeyDown}
        />
        ${
          this.showZone
            ? html`<span class="time-zone" title=${this.resolvedTimeZone}
                >${zoneLabel(this.zone, clock ? instantOf(clock, this.zone) : Date.now(), this.msg.locale)}</span
              >`
            : nothing
        }
        <button
          class="calendar-button"
          type="button"
          tabindex="-1"
          aria-label=${this.msg.t('open')}
          aria-haspopup="dialog"
          aria-expanded=${this.pickerOpen ? 'true' : 'false'}
          popovertarget=${interactive ? 'picker' : nothing}
          ?disabled=${!interactive}
          @click=${this.stopClick}
        >
          <slot name="calendar-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2"></rect>
              <path d="M16 3v4M8 3v4M3 10h18"></path>
              <circle cx="16" cy="16" r="2.5"></circle>
            </svg>
          </slot>
        </button>
      </div>
      ${this.renderPicker()}
      ${
        showSupporting
          ? html`<div id="supporting-text" class="supporting-text ${classMap({ error: showError })}">
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
    'c2-date-time-picker': DateTimePicker
  }
}
