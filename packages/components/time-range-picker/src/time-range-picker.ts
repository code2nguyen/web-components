import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { live } from 'lit/directives/live.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { isTimeZone, wallClockAt, zoneLabel } from '@c2n/core/zoned-time.js'
import type { Overlay } from '@c2n/overlay'
import type { DateRangeChangeDetail } from '@c2n/date-selector'
import { timeRangePickerMessages } from './messages'
import {
  isDateOnly,
  isRelative,
  lastSpan,
  parseDuration,
  resolveRange,
  resolveTime,
  shiftRange,
  zoomOutRange,
  type Range,
  type ResolveOptions,
  type TimeUnit,
  type WeekStart,
} from './time-range'
import styles from './time-range-picker.scss?inline'

import '@c2n/overlay'
import '@c2n/date-selector'

export { isDateOnly, isRelative, lastSpan, parseDuration, resolveRange, resolveTime, shiftRange, zoomOutRange }
export type { Range, ResolveOptions, TimeUnit, WeekStart }

/** A quick range offered in the popup. Without a `label`, one is written from the range ("Last 15 minutes"). */
export interface TimeRangePreset {
  from: string
  to: string
  label?: string
}

/** Detail of `change`: the range as written (`now-1h`, `2026-10-20T09:00`) and the zone it is read in. */
export interface TimeRangeChangeDetail {
  from: string
  to: string
  timeZone: string
}

/** Detail of `refresh`: the instants the range covers at the moment of the refresh. */
export interface TimeRangeRefreshDetail {
  from: Date
  to: Date
}

/** Events fired by {@link TimeRangePicker}, keyed for `addEventListener`. */
export interface TimeRangePickerEventMap {
  change: CustomEvent<TimeRangeChangeDetail>
  refresh: CustomEvent<TimeRangeRefreshDetail>
  'refresh-interval-change': CustomEvent<{ value: string }>
}

export interface TimeRangePicker {
  addEventListener: TypedAddEventListener<TimeRangePicker, TimeRangePickerEventMap>
  removeEventListener: TypedRemoveEventListener<TimeRangePicker, TimeRangePickerEventMap>
}

const DEFAULT_PRESETS: readonly TimeRangePreset[] = [
  ...['5m', '15m', '30m', '1h', '3h', '6h', '12h', '24h', '7d', '30d'].map((span) => ({ from: `now-${span}`, to: 'now' })),
  { from: 'now/d', to: 'now' },
  { from: 'now-1d/d', to: 'now-1d/d' },
  { from: 'now/w', to: 'now' },
  { from: 'now-1w/w', to: 'now-1w/w' },
  { from: 'now/M', to: 'now' },
]

/** Ranges with a name of their own, keyed by `from|to`. */
const NAMED = {
  'now/d|now': 'today',
  'now-1d/d|now-1d/d': 'yesterday',
  'now/w|now': 'thisWeek',
  'now-1w/w|now-1w/w': 'previousWeek',
  'now/M|now': 'thisMonth',
} as const

const INTL_UNIT: Record<TimeUnit, string> = { s: 'second', m: 'minute', h: 'hour', d: 'day', w: 'week', M: 'month', y: 'year' }

/** Words a search for "3 days" or "15 min" may use for each unit. */
const UNIT_WORDS: Record<string, TimeUnit> = {
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
  m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  d: 'd', day: 'd', days: 'd',
  w: 'w', wk: 'w', week: 'w', weeks: 'w',
  M: 'M', mo: 'M', month: 'M', months: 'M',
  y: 'y', yr: 'y', year: 'y', years: 'y',
} // prettier-ignore

/** The calendar day an absolute end falls on as written (`2026-10-20T09:00` → `2026-10-20`), or empty. */
const calendarDay = (expression: string) => {
  const day = expression.trim().slice(0, 10)
  return isDateOnly(day) ? day : ''
}

const MAX_RECENT = 3
/** The largest count a typed span may have ("9999 days"), so it always writes as plain digits. */
const MAX_TYPED_AMOUNT = 9999

/**
 * The time range control of an observability dashboard, after Grafana and Datadog. The trigger shows the active
 * range; the popup offers searchable quick ranges, an absolute range typed or picked on a calendar, recently used
 * ranges and the time zone. `nav` adds buttons that move the range one span earlier or later and zoom out to twice
 * its span, and `refresh-intervals` adds a refresh button with an auto-refresh interval.
 *
 * Each end is a string, so a range can be written to a URL as it is and read back unchanged. Relative ends follow
 * Grafana: `now`, `now-15m`, `now+1h`, with units `s m h d w M y`, and `/unit` rounds to the start of that unit
 * (`now/d` is midnight, `now-1d/d` midnight yesterday); as `to`, a rounded end covers its whole unit. Absolute ends
 * are a date (`2026-10-20`, the whole day when it is `to`), a wall clock read in `time-zone` (`2026-10-20T09:00`) or
 * an ISO instant with an offset. `fromDate`/`toDate` and `resolve()` give the instants; the same parser is exported
 * as `resolveTime` and `resolveRange` for code that reads a range from a URL.
 *
 * In the popup, typing a span such as `3d` or `15 min` in the search offers "Last 3 days"; Enter applies the first
 * match. Arrow keys move through the quick ranges. Auto-refresh fires `refresh` every interval and pauses while the
 * page is hidden, refreshing once when it is shown again.
 *
 * @tag c2-time-range-picker
 *
 * @event {CustomEvent<TimeRangeChangeDetail>} change - Fired when a range is applied: a quick range, the absolute range, a shift, a zoom or a time-zone change. `detail` holds `from`, `to` and `timeZone`.
 * @event {CustomEvent<TimeRangeRefreshDetail>} refresh - Fired by the refresh button and on each auto-refresh tick, with the instants the range covers then.
 * @event {CustomEvent<{ value: string }>} refresh-interval-change - Fired when the auto-refresh interval is chosen in the control; `detail.value` is the interval, empty when off.
 *
 * @cssproperty {pixel} [--c2-time-range-picker--gap=8px] - Space between the trigger, the zoom button and the refresh control.
 * @cssproperty {pixel} [--c2-time-range-picker__control--height=36px]
 * @cssproperty {border} [--c2-time-range-picker__control--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-time-range-picker__control--border-radius=6px]
 * @cssproperty {color} [--c2-time-range-picker__control--background=#ffffff]
 * @cssproperty {color} [--c2-time-range-picker__control--color=#18181b]
 * @cssproperty {font-size} [--c2-time-range-picker__control--font-size=14px]
 * @cssproperty {font-family} [--c2-time-range-picker__control--font-family=inherit]
 * @cssproperty {border} [--c2-time-range-picker__control__hover--border=1px solid #a1a1aa]
 * @cssproperty {color} [--c2-time-range-picker__control__hover--background=#f4f4f5] - Behind a shift, zoom or refresh button under the pointer.
 * @cssproperty {outline} [--c2-time-range-picker__control__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-time-range-picker__control__focus--outline-offset=2px]
 * @cssproperty {border} [--c2-time-range-picker__control__error--border=1px solid #dc2626] - The trigger while its range cannot be read or ends before it starts.
 * @cssproperty {opacity} [--c2-time-range-picker__control__disabled--opacity=0.38]
 * @cssproperty {border} [--c2-time-range-picker__divider--border=1px solid #e4e4e7] - Between the segments of one control.
 * @cssproperty {padding} [--c2-time-range-picker__trigger--padding=0 10px 0 12px]
 * @cssproperty {pixel} [--c2-time-range-picker__trigger--gap=8px]
 * @cssproperty {pixel} [--c2-time-range-picker__icon--size=16px]
 * @cssproperty {color} [--c2-time-range-picker__icon--color=#71717a]
 * @cssproperty {color} [--c2-time-range-picker__icon__error--color=#dc2626]
 * @cssproperty {color} [--c2-time-range-picker__time-zone--color=#52525b] - The zone abbreviation in the trigger.
 * @cssproperty {color} [--c2-time-range-picker__time-zone--background=#f4f4f5]
 * @cssproperty {font-size} [--c2-time-range-picker__time-zone--font-size=12px]
 * @cssproperty {border-radius} [--c2-time-range-picker__time-zone--border-radius=4px]
 * @cssproperty {border} [--c2-time-range-picker__refresh__active--border=1px solid #0265dc] - The refresh control while auto-refresh runs.
 * @cssproperty {color} [--c2-time-range-picker__refresh__active--background=#edf1fe]
 * @cssproperty {color} [--c2-time-range-picker__refresh__active--color=#0265dc]
 * @cssproperty {color} [--c2-time-range-picker__live--color=#16a34a] - The dot shown while auto-refresh runs.
 * @cssproperty {pixel} [--c2-time-range-picker__popup--width=720px] - Capped by the viewport; below 640px wide the two columns stack.
 * @cssproperty {color} [--c2-time-range-picker__popup--background=#ffffff]
 * @cssproperty {color} [--c2-time-range-picker__popup--color=#18181b]
 * @cssproperty {border} [--c2-time-range-picker__popup--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-time-range-picker__popup--border-radius=8px]
 * @cssproperty {shadow} [--c2-time-range-picker__popup--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-time-range-picker__popup--padding=16px]
 * @cssproperty {font-size} [--c2-time-range-picker__popup--font-size=14px]
 * @cssproperty {color} [--c2-time-range-picker__section-title--color=#71717a]
 * @cssproperty {font-size} [--c2-time-range-picker__section-title--font-size=12px]
 * @cssproperty {font-weight} [--c2-time-range-picker__section-title--font-weight=600]
 * @cssproperty {pixel} [--c2-time-range-picker__input--height=34px]
 * @cssproperty {border} [--c2-time-range-picker__input--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-time-range-picker__input--border-radius=6px]
 * @cssproperty {color} [--c2-time-range-picker__input--background=#ffffff]
 * @cssproperty {font-family} [--c2-time-range-picker__input--font-family=ui-monospace, SFMono-Regular, Menlo, monospace] - The From and To fields, which hold expressions.
 * @cssproperty {border} [--c2-time-range-picker__input__focus--border=1px solid #0265dc]
 * @cssproperty {border} [--c2-time-range-picker__input__error--border=1px solid #dc2626]
 * @cssproperty {color} [--c2-time-range-picker__hint--color=#71717a] - The resolved time under each field and the notation hint.
 * @cssproperty {font-size} [--c2-time-range-picker__hint--font-size=12px]
 * @cssproperty {color} [--c2-time-range-picker__error--color=#dc2626]
 * @cssproperty {border-radius} [--c2-time-range-picker__preset--border-radius=6px]
 * @cssproperty {padding} [--c2-time-range-picker__preset--padding=6px 8px]
 * @cssproperty {color} [--c2-time-range-picker__preset__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-time-range-picker__preset__selected--background=#edf1fe]
 * @cssproperty {color} [--c2-time-range-picker__preset__selected--color=#0265dc]
 * @cssproperty {font-weight} [--c2-time-range-picker__preset__selected--font-weight=600]
 * @cssproperty {pixel} [--c2-time-range-picker__preset-list--max-height=320px]
 * @cssproperty {color} [--c2-time-range-picker__apply--background=#0265dc]
 * @cssproperty {color} [--c2-time-range-picker__apply--color=#ffffff]
 * @cssproperty {color} [--c2-time-range-picker__apply__hover--background=#0154b8]
 * @cssproperty {border-radius} [--c2-time-range-picker__apply--border-radius=6px]
 * @cssproperty {font-weight} [--c2-time-range-picker__apply--font-weight=500]
 * @cssproperty {border} [--c2-time-range-picker__popup-divider--border=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-time-range-picker__footer--color=#71717a]
 * @cssproperty {font-size} [--c2-time-range-picker__footer--font-size=12px]
 *
 * @internalcomponent c2-overlay
 * @internalcomponent c2-date-selector
 */
@customElement('c2-time-range-picker')
export class TimeRangePicker extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Interface text in the nearest `lang`, and that language for `Intl`; a `lang` change redraws. */
  private readonly msg = new LocalizeController(this, timeRangePickerMessages)
  @state() private pickerOpen = false
  @state() private draftFrom = ''
  @state() private draftTo = ''
  @state() private draftError = ''
  @state() private search = ''
  @state() private calendarPending = false
  @state() private recent: Range[] = []
  @state() private pageHidden = false
  private refreshTimer: ReturnType<typeof setInterval> | undefined
  @query('#picker') private readonly picker?: Overlay
  @query('#trigger') private readonly trigger?: HTMLButtonElement

  /** Start of the range: `now-1h`, `now/d`, `2026-10-20` or `2026-10-20T09:00`. */
  @property({ type: String, reflect: true }) from = 'now-1h'
  /** End of the range, read as the end of its unit or day when rounded (`now/d`) or a bare date. */
  @property({ type: String, reflect: true }) to = 'now'
  /** Quick ranges offered in the popup, as `{ from, to, label? }` objects (JSON in the attribute). Unset, a standard list from 5 minutes to 30 days plus today, yesterday, this and the previous week and this month. */
  @property({ converter: jsonPropertyConverter }) presets: TimeRangePreset[] | undefined = undefined
  /** IANA time zone wall clocks and calendar rounding are read in, such as `UTC`. Empty means the browser's own zone. */
  @property({ attribute: 'time-zone', reflect: true }) timeZone = ''
  /** IANA zones the popup offers to choose from, separated by spaces or commas. With fewer than two, the zone is only shown. */
  @property({ attribute: 'time-zones' }) timeZones = ''
  /** First day of the week, for `/w` and the calendar. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: WeekStart = 'monday'
  /** Shows the buttons that move the range one span earlier or later and zoom out to twice its span. */
  @property({ type: Boolean, reflect: true }) nav = false
  /** Auto-refresh intervals offered next to the refresh button, such as `10s 30s 1m 5m`. Empty hides the refresh control. */
  @property({ attribute: 'refresh-intervals' }) refreshIntervals = ''
  /** Active auto-refresh interval, one of `refresh-intervals`, such as `30s`. Empty means off. */
  @property({ attribute: 'refresh-interval', reflect: true }) refreshInterval = ''
  /** Prevents interaction. */
  @property({ type: Boolean, reflect: true }) disabled = false
  /** Accessible name of the control, read before the active range. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** The start of the range as an instant now, or `null` when it cannot be read. */
  get fromDate(): Date | null {
    return this.resolve()?.from ?? null
  }

  /** The end of the range as an instant now (the end of its unit when rounded), or `null` when it cannot be read. */
  get toDate(): Date | null {
    return this.resolve()?.to ?? null
  }

  /** The instants the range covers at `now` (default: the current time), or `null` when it cannot be read or is empty. */
  resolve(now = Date.now()): { from: Date; to: Date } | null {
    const range = resolveRange({ from: this.from, to: this.to }, this.options(now))
    return range ? { from: new Date(range.from), to: new Date(range.to) } : null
  }

  /** Opens the popup. */
  showPicker() {
    if (!this.disabled) this.picker?.showPopover()
  }

  /** Closes the popup. */
  hidePicker() {
    if (this.picker?.matches(':popover-open')) this.picker.hidePopover()
  }

  /** Fires `refresh` with the range as it stands now, as the refresh button does. */
  refresh() {
    const range = this.resolve()
    if (range) this.dispatchEvent(new CustomEvent<TimeRangeRefreshDetail>('refresh', { detail: range }))
  }

  override connectedCallback() {
    super.connectedCallback()
    document.addEventListener('visibilitychange', this.handleVisibility)
    this.pageHidden = document.hidden
    // A move in the DOM disconnects and reconnects without changing any property, so the timer is restarted here.
    if (this.hasUpdated) this.syncTimer()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    document.removeEventListener('visibilitychange', this.handleVisibility)
    this.stopTimer()
  }

  protected override willUpdate(changed: PropertyValues) {
    // Disabling removes the popup without a toggle event, so it is marked closed here.
    if (changed.has('disabled') && this.disabled) this.pickerOpen = false
    if (changed.has('presets')) {
      const presets = this.presets
      this.presetList = Array.isArray(presets)
        ? presets.filter((preset) => typeof preset?.from === 'string' && typeof preset?.to === 'string')
        : DEFAULT_PRESETS
    }
  }

  protected override updated(changed: PropertyValues) {
    if (['refreshInterval', 'refreshIntervals', 'disabled', 'pageHidden'].some((key) => changed.has(key))) this.syncTimer()
  }

  // ---- range helpers -----------------------------------------------------------------------------------------------

  private options(now = Date.now()): ResolveOptions {
    return { now, timeZone: this.zone, weekStart: this.weekStart === 'sunday' ? 'sunday' : 'monday' }
  }

  private get zone() {
    return this.timeZone && isTimeZone(this.timeZone) ? this.timeZone : ''
  }

  /** The usable quick ranges, recomputed when `presets` changes. */
  private presetList: readonly TimeRangePreset[] = DEFAULT_PRESETS

  private get locale() {
    return this.msg.locale || undefined
  }

  /** `Intl` formatters by locale and options: labels are written for every quick range on each keystroke in the search. */
  private readonly formatters = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>()

  private formatter<T extends Intl.NumberFormat | Intl.DateTimeFormat>(
    kind: 'number' | 'date',
    options: Intl.NumberFormatOptions | Intl.DateTimeFormatOptions,
  ): T {
    const key = `${kind}|${this.locale ?? ''}|${JSON.stringify(options)}`
    let formatter = this.formatters.get(key)
    if (!formatter) {
      formatter =
        kind === 'number'
          ? new Intl.NumberFormat(this.locale, options as Intl.NumberFormatOptions)
          : new Intl.DateTimeFormat(this.locale, options as Intl.DateTimeFormatOptions)
      this.formatters.set(key, formatter)
    }
    return formatter as T
  }

  private spanLabel(amount: number, unit: TimeUnit, display: 'long' | 'narrow' = 'long') {
    return this.formatter<Intl.NumberFormat>('number', { style: 'unit', unit: INTL_UNIT[unit], unitDisplay: display }).format(amount)
  }

  /** The label of a range: its preset's, a "Last N units", a named range, or its two ends. */
  private labelOf(range: Range): string {
    const from = range.from.trim()
    const to = range.to.trim()
    const preset = this.presetList.find((candidate) => candidate.from === from && candidate.to === to)
    if (preset?.label) return preset.label
    const last = lastSpan(from, to)
    if (last) return this.msg.t('last', this.spanLabel(last.amount, last.unit))
    const named = NAMED[`${from}|${to}` as keyof typeof NAMED]
    if (named) return this.msg.t(named)
    return `${this.endLabel(from)} → ${this.endLabel(to, this.sameDay(from, to))}`
  }

  /** Whether both ends are wall clocks on the same day in the zone, so the end can be written as a time alone. */
  private sameDay(from: string, to: string) {
    if (isRelative(from) || isRelative(to) || isDateOnly(from) || isDateOnly(to)) return false
    const start = resolveTime(from, this.options())
    const end = resolveTime(to, this.options())
    if (start === null || end === null) return false
    const a = wallClockAt(start, this.zone)
    const b = wallClockAt(end, this.zone)
    return a.year === b.year && a.month === b.month && a.day === b.day
  }

  private endLabel(expression: string, timeOnly = false): string {
    if (expression === 'now' || isRelative(expression)) return expression
    const instant = resolveTime(expression, this.options())
    if (instant === null) return expression
    const sameYear = wallClockAt(instant, this.zone).year === wallClockAt(Date.now(), this.zone).year
    const dateOnly = isDateOnly(expression)
    const format: Intl.DateTimeFormatOptions = {
      timeZone: this.zone || undefined,
      month: timeOnly ? undefined : 'short',
      day: timeOnly ? undefined : 'numeric',
      year: sameYear || timeOnly ? undefined : 'numeric',
      hour: dateOnly ? undefined : 'numeric',
      minute: dateOnly ? undefined : '2-digit',
    }
    return this.formatter<Intl.DateTimeFormat>('date', format).format(instant)
  }

  private resolvedLabel(expression: string, roundUp: boolean): string {
    const instant = resolveTime(expression, { ...this.options(), roundUp })
    if (instant === null) return ''
    return this.formatter<Intl.DateTimeFormat>('date', { timeZone: this.zone || undefined, dateStyle: 'medium', timeStyle: 'medium' }).format(instant)
  }

  private apply(range: Range, remember = false) {
    this.from = range.from
    this.to = range.to
    if (remember) {
      const recent = this.recent.filter((entry) => entry.from !== range.from || entry.to !== range.to)
      this.recent = [range, ...recent].slice(0, MAX_RECENT)
    }
    this.emitChange()
  }

  private emitChange() {
    this.dispatchEvent(new CustomEvent<TimeRangeChangeDetail>('change', { detail: { from: this.from, to: this.to, timeZone: this.timeZone } }))
  }

  // ---- auto-refresh ------------------------------------------------------------------------------------------------

  /** The offered intervals, plus the active one when it is valid but not listed, so the control shows what runs. */
  private get intervals() {
    const listed = this.refreshIntervals.split(/[\s,]+/).filter((interval) => parseDuration(interval) > 0)
    const active = this.refreshInterval.trim()
    return listed.length && parseDuration(active) > 0 && !listed.includes(active) ? [...listed, active] : listed
  }

  private syncTimer() {
    this.stopTimer()
    const ms = parseDuration(this.refreshInterval)
    if (!ms || this.disabled || this.pageHidden || !this.isConnected) return
    this.refreshTimer = setInterval(() => this.refresh(), ms)
  }

  private stopTimer() {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer)
    this.refreshTimer = undefined
  }

  private readonly handleVisibility = () => {
    const wasHidden = this.pageHidden
    this.pageHidden = document.hidden
    // Coming back to a page whose auto-refresh was paused: catch up at once rather than after a full interval.
    if (wasHidden && !this.pageHidden && parseDuration(this.refreshInterval) && !this.disabled) this.refresh()
  }

  private readonly handleIntervalChange = (event: Event) => {
    event.stopPropagation()
    this.refreshInterval = (event.target as HTMLSelectElement).value
    this.dispatchEvent(new CustomEvent('refresh-interval-change', { detail: { value: this.refreshInterval } }))
    if (this.refreshInterval) this.refresh()
  }

  // ---- popup -------------------------------------------------------------------------------------------------------

  private readonly handleToggle = (event: ToggleEvent) => {
    this.pickerOpen = event.newState === 'open'
    if (!this.pickerOpen) return
    this.draftFrom = this.from
    this.draftTo = this.to
    this.draftError = ''
    this.calendarPending = false
    this.search = ''
    this.updateComplete.then(() => this.renderRoot.querySelector<HTMLInputElement>('.search input')?.focus())
  }

  private readonly toggleSelf = () => {
    if (this.disabled) return
    if (this.picker?.matches(':popover-open')) this.hidePicker()
    else this.showPicker()
  }

  private choose(range: Range, remember = false) {
    this.apply(range, remember)
    this.hidePicker()
    this.trigger?.focus()
  }

  /** The quick ranges matching the search, led by a "Last N units" read from it (`3d`, `15 min`). */
  private get quickMatches(): { range: Range; label: string }[] {
    const query = this.search.trim()
    const all = this.presetList.map((preset) => ({ range: { from: preset.from, to: preset.to }, label: preset.label || this.labelOf(preset) }))
    if (!query) return all
    const typed: { range: Range; label: string }[] = []
    const span = /^(\d+)\s*([a-zA-Z]+)$/.exec(query)
    const word = span ? [span[2], span[2].toLowerCase()].find((candidate) => Object.prototype.hasOwnProperty.call(UNIT_WORDS, candidate)) : undefined
    const unit = word && UNIT_WORDS[word]
    const amount = span ? Number(span[1]) : 0
    if (unit && amount > 0 && amount <= MAX_TYPED_AMOUNT) {
      const range = { from: `now-${amount}${unit}`, to: 'now' }
      if (!all.some((entry) => entry.range.from === range.from && entry.range.to === range.to)) typed.push({ range, label: this.labelOf(range) })
    }
    const needle = query.toLowerCase()
    return [...typed, ...all.filter((entry) => entry.label.toLowerCase().includes(needle) || entry.range.from.includes(needle))]
  }

  private readonly handleSearchKey = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      // Cancelled so the key does not go on to activate the trigger that takes focus back.
      event.preventDefault()
      const [first] = this.quickMatches
      if (first) this.choose(first.range)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      this.renderRoot.querySelector<HTMLButtonElement>('.preset')?.focus()
    }
  }

  private readonly handlePresetKey = (event: KeyboardEvent) => {
    const buttons = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('.preset')]
    const index = buttons.indexOf(event.target as HTMLButtonElement)
    const targets: Record<string, number> = { ArrowDown: Math.min(index + 1, buttons.length - 1), ArrowUp: index - 1, Home: 0, End: buttons.length - 1 }
    const next = targets[event.key]
    if (next === undefined) return
    event.preventDefault()
    if (next < 0) this.renderRoot.querySelector<HTMLInputElement>('.search input')?.focus()
    else buttons[next]?.focus()
  }

  private readonly applyDraft = () => {
    const from = this.draftFrom.trim()
    const to = this.draftTo.trim()
    const options = this.options()
    if (resolveTime(from, options) === null || resolveTime(to, { ...options, roundUp: true }) === null) {
      this.draftError = this.msg.t('invalidTime')
      return
    }
    if (!resolveRange({ from, to }, options)) {
      this.draftError = this.msg.t('endBeforeStart')
      return
    }
    this.choose({ from, to }, true)
  }

  private readonly handleDraftKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    this.applyDraft()
  }

  private readonly handleCalendarChange = (event: CustomEvent<DateRangeChangeDetail>) => {
    event.stopPropagation()
    this.draftFrom = event.detail.from
    // A lone first day is a one-day range until the second is picked; the calendar keeps waiting for that one.
    this.draftTo = event.detail.to || event.detail.from
    this.calendarPending = !event.detail.to
    this.draftError = ''
  }

  private readonly handleZoneChange = (event: Event) => {
    event.stopPropagation()
    this.timeZone = (event.target as HTMLSelectElement).value
    this.emitChange()
  }

  // ---- render ------------------------------------------------------------------------------------------------------

  private renderClock() {
    return html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9"></circle>
      <path d="M12 7v5l3 2"></path>
    </svg>`
  }

  private renderCalendarIcon() {
    return html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2"></rect>
      <path d="M3 10h18M8 3v4M16 3v4"></path>
    </svg>`
  }

  private renderTrigger(valid: boolean) {
    const range = { from: this.from, to: this.to }
    const label = this.labelOf(range)
    const absolute = !isRelative(this.from) || !isRelative(this.to)
    const zoneChip = absolute && this.zone ? zoneLabel(this.zone, Date.now(), this.locale ?? 'en') : ''
    const name = this.ariaLabel || this.msg.t('trigger')
    return html`<button
      id="trigger"
      class=${classMap({ segment: true, trigger: true, error: !valid })}
      type="button"
      aria-haspopup="dialog"
      aria-expanded=${this.pickerOpen ? 'true' : 'false'}
      aria-label=${`${name}: ${label}`}
      ?disabled=${this.disabled}
      @click=${this.toggleSelf}
    >
      ${absolute ? this.renderCalendarIcon() : this.renderClock()}
      <span class="label">${label}</span>
      ${zoneChip ? html`<span class="time-zone">${zoneChip}</span>` : nothing}
      <svg class="icon chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
    </button>`
  }

  private renderNavButton(direction: -1 | 1, disabled: boolean) {
    const back = direction < 0
    return html`<button
      class="segment icon-button ${back ? 'shift-back' : 'shift-forward'}"
      type="button"
      aria-label=${this.msg.t(back ? 'shiftBack' : 'shiftForward')}
      title=${this.msg.t(back ? 'shiftBack' : 'shiftForward')}
      ?disabled=${this.disabled || disabled}
      @click=${() => {
        const shifted = shiftRange({ from: this.from, to: this.to }, direction, this.options())
        if (shifted) this.apply(shifted)
      }}
    >
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d=${back ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}></path></svg>
    </button>`
  }

  private renderRefresh() {
    const intervals = this.intervals
    if (!intervals.length) return nothing
    const active = parseDuration(this.refreshInterval) > 0
    const short = (interval: string) => {
      const match = /^(\d+)\s*(s|m|h|d)$/.exec(interval.trim())
      return match ? this.spanLabel(Number(match[1]), match[2] as TimeUnit, 'narrow') : interval
    }
    return html`<div class=${classMap({ control: true, refresh: true, active })}>
      <button
        class="segment icon-button refresh-now"
        type="button"
        aria-label=${this.msg.t('refresh')}
        title=${this.msg.t('refresh')}
        ?disabled=${this.disabled}
        @click=${() => this.refresh()}
      >
        <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8"></path>
          <path d="M21 3v5h-5"></path>
        </svg>
      </button>
      <label class="segment interval">
        ${active ? html`<span class="live" aria-hidden="true"></span>` : nothing}
        <select
          aria-label=${this.msg.t('refreshInterval')}
          ?disabled=${this.disabled}
          @change=${this.handleIntervalChange}
          @input=${(event: Event) => event.stopPropagation()}
        >
          <option value="" ?selected=${!active}>${this.msg.t('refreshOff')}</option>
          ${intervals.map((interval) => html`<option value=${interval} ?selected=${interval === this.refreshInterval}>${short(interval)}</option>`)}
        </select>
        <svg class="icon chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>
      </label>
    </div>`
  }

  private renderPopup() {
    return html`<c2-overlay id="picker" anchor="trigger" placement="bottom-start" free-width @toggle=${this.handleToggle}>
      <div class="popup" role="dialog" aria-label=${this.msg.t('dialog')}>${this.pickerOpen ? this.renderPopupBody() : nothing}</div>
    </c2-overlay>`
  }

  private renderPopupBody() {
    const current = `${this.from.trim()}|${this.to.trim()}`
    const matches = this.quickMatches
    const fromResolved = this.resolvedLabel(this.draftFrom, false)
    const toResolved = this.resolvedLabel(this.draftTo, true)
    const calendarFrom = calendarDay(this.draftFrom)
    const calendarTo = calendarDay(this.draftTo)
    return html`<div class="columns">
        <section class="absolute" aria-labelledby="absolute-title">
          <h2 id="absolute-title" class="section-title">${this.msg.t('absoluteRange')}</h2>
          <div class="fields">
            ${this.renderDraftField('from', this.msg.t('from'), this.draftFrom, fromResolved, (value) => (this.draftFrom = value))}
            ${this.renderDraftField('to', this.msg.t('to'), this.draftTo, toResolved, (value) => (this.draftTo = value))}
          </div>
          <c2-date-selector
            months="1"
            aria-label=${this.msg.t('calendar')}
            week-start=${this.weekStart}
            .from=${calendarFrom}
            .to=${!this.calendarPending && calendarTo >= calendarFrom ? calendarTo : ''}
            @change=${this.handleCalendarChange}
            @input=${(event: Event) => event.stopPropagation()}
          ></c2-date-selector>
          <div class="apply-row">
            ${this.draftError ? html`<span class="error-text" role="alert">${this.draftError}</span>` : html`<span class="hint">${this.msg.t('hint')}</span>`}
            <button class="apply" type="button" @click=${this.applyDraft}>${this.msg.t('apply')}</button>
          </div>
        </section>
        <section class="quick" aria-labelledby="quick-title">
          <label class="search">
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-4-4"></path>
            </svg>
            <input
              type="text"
              aria-label=${this.msg.t('search')}
              placeholder=${this.msg.t('search')}
              autocomplete="off"
              .value=${live(this.search)}
              @input=${(event: Event) => {
                event.stopPropagation()
                this.search = (event.target as HTMLInputElement).value
              }}
              @change=${(event: Event) => event.stopPropagation()}
              @keydown=${this.handleSearchKey}
            />
          </label>
          <h2 id="quick-title" class="section-title">${this.msg.t('quickRanges')}</h2>
          ${
            matches.length
              ? html`<ul class="presets" role="list" @keydown=${this.handlePresetKey}>
                  ${matches.map(
                    ({ range, label }) =>
                      html`<li>
                        <button
                          class=${classMap({ preset: true, selected: `${range.from}|${range.to}` === current })}
                          type="button"
                          aria-current=${`${range.from}|${range.to}` === current ? 'true' : 'false'}
                          @click=${() => this.choose(range)}
                        >
                          ${label}
                        </button>
                      </li>`,
                  )}
                </ul>`
              : html`<p class="hint no-match">${this.msg.t('noMatch')}</p>`
          }
          ${
            this.recent.length
              ? html`<h2 class="section-title">${this.msg.t('recent')}</h2>
                  <ul class="presets recent" role="list" @keydown=${this.handlePresetKey}>
                    ${this.recent.map((range) => html`<li><button class="preset" type="button" @click=${() => this.choose(range)}>${this.labelOf(range)}</button></li>`)}
                  </ul>`
              : nothing
          }
        </section>
      </div>
      ${this.renderFooter()}`
  }

  private renderDraftField(id: string, label: string, value: string, resolved: string, set: (value: string) => void) {
    const invalid = !!this.draftError && !resolved
    return html`<div class="field">
      <label class="field-label" for=${`draft-${id}`}>${label}</label>
      <input
        id=${`draft-${id}`}
        class=${classMap({ draft: true, invalid })}
        type="text"
        spellcheck="false"
        autocomplete="off"
        aria-invalid=${invalid ? 'true' : 'false'}
        aria-describedby=${`draft-${id}-resolved`}
        .value=${live(value)}
        @input=${(event: Event) => {
          event.stopPropagation()
          set((event.target as HTMLInputElement).value)
          this.draftError = ''
          this.calendarPending = false
        }}
        @change=${(event: Event) => event.stopPropagation()}
        @keydown=${this.handleDraftKey}
      />
      <span id=${`draft-${id}-resolved`} class="hint resolved">${resolved}</span>
    </div>`
  }

  private renderFooter() {
    const choices = this.timeZones.split(/[\s,]+/).filter((zone) => zone && isTimeZone(zone))
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone
    const current = this.zone || browser
    const now = Date.now()
    const describe = (zone: string) => `${zone} (${zoneLabel(zone, now, this.locale ?? 'en', 'shortOffset')})`
    if (choices.length > 1) {
      const options = choices.includes(current) ? choices : [current, ...choices]
      return html`<footer class="footer">
        <label class="zone-choice">
          <span>${this.msg.t('timeZone')}</span>
          <select @change=${this.handleZoneChange} @input=${(event: Event) => event.stopPropagation()}>
            ${options.map((zone) => html`<option value=${zone} ?selected=${zone === current}>${describe(zone)}</option>`)}
          </select>
        </label>
      </footer>`
    }
    return html`<footer class="footer">
      <span>${this.msg.t('timeZone')}: <strong>${this.zone ? describe(this.zone) : this.msg.t('browserZone', describe(browser))}</strong></span>
    </footer>`
  }

  override render() {
    const now = Date.now()
    const resolved = resolveRange({ from: this.from, to: this.to }, this.options(now))
    const endsNow = !resolved || resolved.to >= now - 1000
    return html`<div class=${classMap({ bar: true, disabled: this.disabled })}>
        <div class=${classMap({ control: true, range: true, error: !resolved })}>
          ${this.nav ? this.renderNavButton(-1, !resolved) : nothing} ${this.renderTrigger(!!resolved)} ${this.nav ? this.renderNavButton(1, endsNow) : nothing}
        </div>
        ${
          this.nav
            ? html`<button
                class="control icon-button zoom-out"
                type="button"
                aria-label=${this.msg.t('zoomOut')}
                title=${this.msg.t('zoomOut')}
                ?disabled=${this.disabled || !resolved}
                @click=${() => {
                  const zoomed = zoomOutRange({ from: this.from, to: this.to }, this.options())
                  if (zoomed) this.apply(zoomed)
                }}
              >
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7"></circle>
                  <path d="M8 11h6M20 20l-4-4"></path>
                </svg>
              </button>`
            : nothing
        }
        ${this.renderRefresh()}
      </div>
      ${this.disabled ? nothing : this.renderPopup()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-time-range-picker': TimeRangePicker
  }
}
