import type {
  StateTimelineMarker,
  StateTimelineSegment,
  StateTimelineSeries,
  StateTimelineState,
  StateTimelineTime,
  StateTimelineTone,
} from './state-timeline-types.js'

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** A state with its label and colour settled. `key` is the value as text. */
export interface ResolvedState {
  key: string
  label: string
  tone: StateTimelineTone
  /** The normal state, drawn quietly and left out of the time-outside-normal totals. */
  baseline: boolean
}

/** A segment placed on the timeline. `start`/`end` are the real times, `from`/`to` the part inside the range. */
export interface PlacedSegment {
  index: number
  segment: StateTimelineSegment
  state: ResolvedState | null
  start: number
  end: number
  from: number
  to: number
}

export interface TimelineRow {
  id: string
  index: number
  label: string
  series: StateTimelineSeries
  segments: PlacedSegment[]
}

export interface TimelineModel {
  start: number
  end: number
  rows: TimelineRow[]
  /** Every state, given ones first in their order, then the ones the data uses, in order of appearance. */
  states: ResolvedState[]
  /** Segments skipped because a time could not be read. */
  invalid: number
}

export interface TimelineTick {
  time: number
  label: string
}

/** Milliseconds since the epoch, or `undefined` for a missing or unreadable time. */
export function toTime(value: StateTimelineTime | null | undefined): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const time = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Number.isFinite(Number(value)) ? Number(value) : Date.parse(value)
  return Number.isFinite(time) ? time : undefined
}

export function stateKey(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function resolveStates(given: readonly StateTimelineState[], series: readonly StateTimelineSeries[]): Map<string, ResolvedState> {
  // Tone `0` stands for "not chosen yet" until the palette is handed out below.
  const map = new Map<string, { key: string; label: string; tone: StateTimelineTone | 0; baseline: boolean }>()
  const pending: string[] = []
  for (const state of given) {
    const key = stateKey(state?.value)
    if (key === null || map.has(key)) continue
    // Only the first state marked as the baseline counts as one.
    const baseline = state.baseline === true && ![...map.values()].some((entry) => entry.baseline)
    map.set(key, { key, label: state.label ?? key, tone: state.tone ?? 0, baseline })
    if (state.tone === undefined) pending.push(key)
  }
  for (const row of series) {
    for (const segment of row?.segments ?? []) {
      const key = stateKey(segment?.state)
      if (key === null || map.has(key)) continue
      map.set(key, { key, label: key, tone: 0, baseline: false })
      pending.push(key)
    }
  }
  // Palette slots a given state already claimed are skipped, so an automatic colour never repeats a chosen one while
  // a free slot remains.
  const taken = new Set<StateTimelineTone | 0>([...map.values()].map((state) => state.tone))
  const free = ([1, 2, 3, 4, 5, 6, 7, 8] as const).filter((slot) => !taken.has(slot))
  const slots = free.length ? free : ([1, 2, 3, 4, 5, 6, 7, 8] as const)
  pending.forEach((key, index) => (map.get(key)!.tone = slots[index % slots.length]))
  return map as Map<string, ResolvedState>
}

/**
 * Reads the series into rows of segments clipped to the visible range. Each series is sorted by start; a segment
 * without an `end` lasts until the next one starts, and the last one until the end of the range. The range is
 * `start`/`end` when given, otherwise the earliest and latest time in the data.
 */
export function buildModel(
  series: readonly StateTimelineSeries[],
  given: readonly StateTimelineState[],
  rangeStart?: StateTimelineTime,
  rangeEnd?: StateTimelineTime,
): TimelineModel {
  const list = Array.isArray(series) ? series.filter((row) => row && typeof row === 'object') : []
  const states = resolveStates(Array.isArray(given) ? given : [], list)
  let invalid = 0
  let min = Infinity
  let max = -Infinity
  const parsed = list.map((row) => {
    const items: Array<{ index: number; segment: StateTimelineSegment; start: number; end: number | undefined }> = []
    const segments: StateTimelineSegment[] = Array.isArray(row.segments) ? row.segments : []
    segments.forEach((segment, index) => {
      const start = toTime(segment?.start)
      const end = toTime(segment?.end)
      if (start === undefined || (segment.end !== undefined && segment.end !== null && end === undefined)) {
        invalid++
        return
      }
      items.push({ index, segment, start, end })
      min = Math.min(min, start)
      max = Math.max(max, start, end ?? start)
    })
    // Stable, so two changes at the same instant keep their order and the second wins.
    return items.sort((a, b) => a.start - b.start)
  })
  const start = toTime(rangeStart) ?? (Number.isFinite(min) ? min : 0)
  const end = toTime(rangeEnd) ?? (Number.isFinite(max) ? max : start)
  const rows = list.map((row, rowIndex): TimelineRow => {
    const items = parsed[rowIndex]
    const segments: PlacedSegment[] = []
    items.forEach((item, position) => {
      const next = items[position + 1]
      const segmentEnd = item.end ?? (next ? next.start : Math.max(end, item.start))
      const from = Math.max(item.start, start)
      const to = Math.min(segmentEnd, end)
      if (to <= from) return
      const key = stateKey(item.segment.state)
      segments.push({ index: item.index, segment: item.segment, state: key === null ? null : states.get(key)!, start: item.start, end: segmentEnd, from, to })
    })
    return { id: row.id ?? String(rowIndex), index: rowIndex, label: row.label ?? '', series: row, segments }
  })
  return { start, end, rows, states: [...states.values()], invalid }
}

const FIXED_STEPS = [
  SECOND,
  2 * SECOND,
  5 * SECOND,
  10 * SECOND,
  15 * SECOND,
  30 * SECOND,
  MINUTE,
  2 * MINUTE,
  5 * MINUTE,
  10 * MINUTE,
  15 * MINUTE,
  30 * MINUTE,
  HOUR,
  2 * HOUR,
  3 * HOUR,
  6 * HOUR,
  12 * HOUR,
]
const DAY_STEPS = [1, 2, 7, 14]
const MONTH_STEPS = [1, 2, 3, 6]

type Step = { kind: 'fixed'; ms: number } | { kind: 'day'; days: number } | { kind: 'month'; months: number } | { kind: 'year'; years: number }

function stepLength(step: Step): number {
  if (step.kind === 'fixed') return step.ms
  if (step.kind === 'day') return step.days * DAY
  if (step.kind === 'month') return step.months * 30 * DAY
  return step.years * 365 * DAY
}

function chooseStep(span: number, count: number): Step {
  const candidates: Step[] = [
    ...FIXED_STEPS.map((ms) => ({ kind: 'fixed', ms }) as Step),
    ...DAY_STEPS.map((days) => ({ kind: 'day', days }) as Step),
    ...MONTH_STEPS.map((months) => ({ kind: 'month', months }) as Step),
  ]
  for (const step of candidates) if (span / stepLength(step) <= count) return step
  // 1, 2, 5, 10, 20, 50, …
  for (let power = 1; ; power *= 10) {
    for (const years of [power, 2 * power, 5 * power]) if (span / (years * 365 * DAY) <= count) return { kind: 'year', years }
  }
}

function tickTimes(start: number, end: number, step: Step): number[] {
  const times: number[] = []
  if (step.kind === 'fixed') {
    // Aligned on local wall-clock time, so hourly ticks land on the hour in every time zone.
    const offset = new Date(start).getTimezoneOffset() * MINUTE
    for (let time = Math.ceil((start - offset) / step.ms) * step.ms + offset; time <= end; time += step.ms) times.push(time)
    return times
  }
  const date = new Date(start)
  date.setHours(0, 0, 0, 0)
  if (step.kind === 'day') {
    if (step.days === 7 || step.days === 14) date.setDate(date.getDate() - ((date.getDay() + 6) % 7))
    while (date.getTime() < start) date.setDate(date.getDate() + step.days)
    for (; date.getTime() <= end; date.setDate(date.getDate() + step.days)) times.push(date.getTime())
    return times
  }
  date.setDate(1)
  const months = step.kind === 'month' ? step.months : step.years * 12
  if (step.kind === 'year') date.setMonth(0)
  date.setMonth(date.getMonth() - (step.kind === 'month' ? date.getMonth() % months : 0))
  if (step.kind === 'year') date.setFullYear(date.getFullYear() - (date.getFullYear() % step.years))
  while (date.getTime() < start) date.setMonth(date.getMonth() + months)
  for (; date.getTime() <= end; date.setMonth(date.getMonth() + months)) times.push(date.getTime())
  return times
}

function isMidnight(time: number): boolean {
  const date = new Date(time)
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0
}

function safeFormat(locale: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options)
  } catch {
    return new Intl.DateTimeFormat('en', options)
  }
}

/**
 * Ticks for the axis: about one per `spacing` pixels of `width`, on round local times (seconds, minutes, hours,
 * midnights, Mondays, firsts of the month, years). Below a day, a midnight is labelled with its date.
 */
export function axisTicks(start: number, end: number, width: number, locale?: string, spacing = 96): TimelineTick[] {
  const span = end - start
  if (!(span > 0)) return []
  const count = Math.max(2, Math.floor(width / spacing))
  const step = chooseStep(span, count)
  const length = stepLength(step)
  const time = safeFormat(locale, length < MINUTE ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' })
  const day = safeFormat(locale, { month: 'short', day: 'numeric' })
  const month = safeFormat(locale, { month: 'short', year: 'numeric' })
  const year = safeFormat(locale, { year: 'numeric' })
  return tickTimes(start, end, step).map((tick) => {
    let label: string
    if (step.kind === 'fixed') label = isMidnight(tick) ? day.format(tick) : time.format(tick)
    else if (step.kind === 'day') label = day.format(tick)
    else if (step.kind === 'month') label = month.format(tick)
    else label = year.format(tick)
    return { time: tick, label }
  })
}

/** Formats the two ends of a segment, with seconds when the timeline is shorter than an hour and the year when it spans years. */
export function rangeFormatter(start: number, end: number, locale?: string): Intl.DateTimeFormat {
  const span = end - start
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
  if (span < HOUR) options.second = '2-digit'
  if (new Date(start).getFullYear() !== new Date(end).getFullYear()) options.year = 'numeric'
  return safeFormat(locale, options)
}

/**
 * "2 d 3 h", "1 h 15 min", "45 s", "250 ms": the two largest non-zero units, rounded to `step` milliseconds (one second
 * by default). A positive duration shorter than the step reads "< 1 min" (or the step's unit).
 */
export function formatDuration(ms: number, step = SECOND): string {
  if (!(ms > 0)) return '0 s'
  if (step <= SECOND && ms < SECOND) return `${Math.round(ms)} ms`
  if (ms < step / 2) return step >= MINUTE ? '< 1 min' : '< 1 s'
  if (step > SECOND) ms = Math.round(ms / step) * step
  const units: Array<[number, string]> = [
    [DAY, 'd'],
    [HOUR, 'h'],
    [MINUTE, 'min'],
    [SECOND, 's'],
  ]
  let rest = Math.round(ms / SECOND) * SECOND
  const parts: string[] = []
  for (const [size, name] of units) {
    if (parts.length === 2) break
    const amount = Math.floor(rest / size)
    if (amount > 0) {
      parts.push(`${amount} ${name}`)
      rest -= amount * size
    } else if (parts.length) break
  }
  return parts.join(' ')
}

/**
 * The segment of `row` to move to from a segment spanning `from`–`to` in another row: the one holding its middle,
 * otherwise the nearest one.
 */
export function segmentNear(row: TimelineRow, from: number, to: number): number {
  const middle = (from + to) / 2
  let best = -1
  let distance = Infinity
  row.segments.forEach((segment, position) => {
    const gap = middle < segment.from ? segment.from - middle : middle > segment.to ? middle - segment.to : 0
    if (gap < distance) {
      distance = gap
      best = position
    }
  })
  return best
}

/** Position of the segment of `row` holding `time`, or `-1` when no segment does. Ends are exclusive. */
export function segmentAt(row: TimelineRow, time: number): number {
  return row.segments.findIndex(
    (segment) => time >= segment.from && (time < segment.to || (time === segment.to && segment === row.segments[row.segments.length - 1])),
  )
}

/** Visible milliseconds spent in each state across all bands, keyed by the state's key (`null` for no data). */
export function stateTotals(model: TimelineModel): Map<string | null, number> {
  const totals = new Map<string | null, number>()
  for (const row of model.rows) {
    for (const segment of row.segments) {
      const key = segment.state?.key ?? null
      totals.set(key, (totals.get(key) ?? 0) + segment.to - segment.from)
    }
  }
  return totals
}

/** Visible milliseconds a band spent outside the baseline state, no-data stretches included. */
export function timeOutsideBaseline(row: TimelineRow): number {
  return row.segments.reduce((sum, segment) => (segment.state?.baseline ? sum : sum + segment.to - segment.from), 0)
}

/** The markers inside the visible range, with their times read. */
export function placeMarkers(markers: readonly StateTimelineMarker[], start: number, end: number): Array<{ time: number; label: string }> {
  if (!Array.isArray(markers)) return []
  return markers
    .map((marker) => ({ time: toTime(marker?.time), label: String(marker?.label ?? '') }))
    .filter((marker): marker is { time: number; label: string } => marker.time !== undefined && marker.time >= start && marker.time <= end)
    .sort((a, b) => a.time - b.time)
}

/** Formats the moment on the crosshair: seconds below an hour of range, the date beyond a day. */
export function momentFormatter(start: number, end: number, locale?: string): Intl.DateTimeFormat {
  const span = end - start
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' }
  if (span < HOUR) options.second = '2-digit'
  if (span > DAY) Object.assign(options, { month: 'short', day: 'numeric' })
  return safeFormat(locale, options)
}

/** Rounding for durations measured from the pointer: whole minutes once the range spans an hour or more. */
export function durationStep(start: number, end: number): number {
  return end - start >= HOUR ? MINUTE : SECOND
}

/**
 * Stacks marker labels into levels so neighbours do not overlap: each label goes on the lowest level whose previous
 * label ends before it starts. `x` is the label's centre and `width` its estimated width, both in pixels.
 */
export function stackLabels(items: ReadonlyArray<{ x: number; width: number }>, levels = 3): number[] {
  const ends: number[] = []
  return items.map(({ x, width }) => {
    const left = x - width / 2
    let level = ends.findIndex((end) => end <= left)
    if (level < 0) level = ends.length < levels ? ends.length : ends.indexOf(Math.min(...ends))
    ends[level] = x + width / 2 + 8
    return level
  })
}
