/**
 * Time-range expressions for `c2-time-range-picker`, on `Intl` only. An end of a range is either relative to now in
 * Grafana's notation (`now`, `now-15m`, `now-1d/d`, `now/w`) or absolute: a date (`2026-10-20`), a wall clock read in
 * the picker's time zone (`2026-10-20T09:00`) or an ISO instant with an offset (`2026-10-20T07:00:00Z`).
 */
import { formatWallClock, instantOf, isTimeZone, parseDate, parseWallClock, wallClockAt, type WallClock } from '@c2n/core/zoned-time.js'

export type TimeUnit = 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'y'
export type WeekStart = 'monday' | 'sunday'

export interface ResolveOptions {
  /** The instant `now` stands for, in milliseconds. */
  now: number
  /** IANA zone wall clocks and calendar rounding are read in; empty means the browser's own zone. */
  timeZone: string
  /** First day of the week `/w` rounds to. */
  weekStart: WeekStart
  /** Resolves to the end of a rounded unit or date instead of its start: how the `to` end of a range is read. */
  roundUp?: boolean
}

type Operation = { kind: 'offset'; amount: number; unit: TimeUnit } | { kind: 'round'; unit: TimeUnit }

const UNIT_MS: Partial<Record<TimeUnit, number>> = { s: 1e3, m: 6e4, h: 36e5 }
const operationPattern = /([+-])\s*(\d+)\s*([smhdwMy])|\/\s*([smhdwMy])/y
const offsetPattern = /(?:Z|[+-]\d{2}:?\d{2})$/i

/** The operations of a `now…` expression, or `null` when it is not one. */
function parseRelative(expression: string): Operation[] | null {
  const text = expression.trim()
  if (!text.startsWith('now')) return null
  const operations: Operation[] = []
  let index = 3
  while (index < text.length) {
    if (text[index] === ' ') {
      index++
      continue
    }
    operationPattern.lastIndex = index
    const match = operationPattern.exec(text)
    if (!match) return null
    if (match[4]) operations.push({ kind: 'round', unit: match[4] as TimeUnit })
    else operations.push({ kind: 'offset', amount: Number(match[2]) * (match[1] === '-' ? -1 : 1), unit: match[3] as TimeUnit })
    index = operationPattern.lastIndex
  }
  return operations
}

/** Whether an expression is relative to now (`now-1h`), as opposed to a fixed date or time. */
export function isRelative(expression: string) {
  return parseRelative(expression) !== null
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Normalizes a wall clock whose fields overflowed (day 0, month 13) through `Date.UTC`. */
function normalize(clock: WallClock): WallClock {
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: date.getUTCSeconds(),
  }
}

/** Moves a wall clock by whole months, keeping the day inside the target month (March 31 − 1 month is February 28). */
function addMonths(clock: WallClock, months: number): WallClock {
  const index = clock.year * 12 + clock.month - 1 + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return { ...clock, year, month, day: Math.min(clock.day, daysInMonth(year, month)) }
}

/** The start of the calendar unit a wall clock falls in. */
function startOf(clock: WallClock, unit: TimeUnit, weekStart: WeekStart): WallClock {
  switch (unit) {
    case 's':
      return clock
    case 'm':
      return { ...clock, second: 0 }
    case 'h':
      return { ...clock, minute: 0, second: 0 }
    case 'd':
      return { ...clock, hour: 0, minute: 0, second: 0 }
    case 'w': {
      const weekday = new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay()
      const back = weekStart === 'sunday' ? weekday : (weekday + 6) % 7
      return normalize({ ...clock, day: clock.day - back, hour: 0, minute: 0, second: 0 })
    }
    case 'M':
      return { ...clock, day: 1, hour: 0, minute: 0, second: 0 }
    case 'y':
      return { ...clock, month: 1, day: 1, hour: 0, minute: 0, second: 0 }
  }
}

/** Adds an amount of a unit: seconds to hours as elapsed time, days and longer on the calendar (so a day stays a day across DST). */
function add(instant: number, amount: number, unit: TimeUnit, zone: string): number {
  const ms = UNIT_MS[unit]
  if (ms) return instant + amount * ms
  const clock = wallClockAt(instant, zone)
  if (unit === 'd' || unit === 'w') return instantOf(normalize({ ...clock, day: clock.day + amount * (unit === 'w' ? 7 : 1) }), zone)
  return instantOf(addMonths(clock, unit === 'y' ? amount * 12 : amount), zone)
}

/** The first instant of the next unit after the one `instant` falls in. */
function startOfNext(instant: number, unit: TimeUnit, zone: string, weekStart: WeekStart) {
  const start = instantOf(startOf(wallClockAt(instant, zone), unit, weekStart), zone)
  return add(start, 1, unit, zone)
}

/** The zone an expression is read in: the given one when the engine knows it, else the browser's. */
const usableZone = (zone: string) => (zone && isTimeZone(zone) ? zone : '')

/**
 * The instant an expression names, in milliseconds, or `null` when it cannot be read. With `roundUp`, a rounded unit
 * or a bare date resolves to its last millisecond, so `now/d` as the end of a range covers the whole day.
 */
export function resolveTime(expression: string, options: ResolveOptions): number | null {
  const zone = usableZone(options.timeZone)
  const operations = parseRelative(expression)
  if (operations) {
    let instant = options.now
    for (const operation of operations) {
      if (operation.kind === 'offset') instant = add(instant, operation.amount, operation.unit, zone)
      else if (options.roundUp) instant = startOfNext(instant, operation.unit, zone, options.weekStart) - 1
      else instant = instantOf(startOf(wallClockAt(instant, zone), operation.unit, options.weekStart), zone)
    }
    return instant
  }
  const text = expression.trim().replace(' ', 'T')
  const date = parseDate(text)
  if (date) {
    const start = instantOf({ ...date, hour: 0, minute: 0, second: 0 }, zone)
    return options.roundUp ? add(start, 1, 'd', zone) - 1 : start
  }
  const clock = parseWallClock(text)
  if (clock) return instantOf(clock, zone)
  if (offsetPattern.test(text) && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const instant = Date.parse(text)
    return Number.isNaN(instant) ? null : instant
  }
  return null
}

/** `{ amount, unit }` when a range is a plain "last N units" (`now-15m` to `now`), else `null`. */
export function lastSpan(from: string, to: string): { amount: number; unit: TimeUnit } | null {
  if (to.trim() !== 'now') return null
  const operations = parseRelative(from)
  if (operations?.length !== 1) return null
  const [operation] = operations
  return operation.kind === 'offset' && operation.amount < 0 ? { amount: -operation.amount, unit: operation.unit } : null
}

/** The wall clock of an instant in a zone, as the picker writes an absolute end: `YYYY-MM-DDTHH:mm`, with seconds when they are not zero. */
export function wallClockString(instant: number, zone: string) {
  const clock = wallClockAt(instant, usableZone(zone))
  return formatWallClock(clock, clock.second !== 0)
}

/** Whether an absolute expression names a whole date (`2026-10-20`) rather than a time. */
export function isDateOnly(expression: string) {
  return parseDate(expression.trim()) !== null
}

/** A duration such as `30s`, `5m` or `1h` in milliseconds, or `0` when it is not one. */
export function parseDuration(value: string): number {
  const match = /^\s*(\d+)\s*(ms|s|m|h|d)\s*$/.exec(value)
  if (!match) return 0
  const factor = { ms: 1, s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[match[2] as 'ms' | 's' | 'm' | 'h' | 'd']
  return Number(match[1]) * factor
}

export interface Range {
  from: string
  to: string
}

/** The instants a range covers: `from` and the exclusive end (a rounded or date-only `to` ends at the start of the next unit). */
export function resolveRange(range: Range, options: ResolveOptions): { from: number; to: number } | null {
  const from = resolveTime(range.from, { ...options, roundUp: false })
  const exact = resolveTime(range.to, { ...options, roundUp: false })
  const rounded = resolveTime(range.to, { ...options, roundUp: true })
  if (from === null || exact === null || rounded === null) return null
  const to = rounded === exact ? exact : rounded + 1
  return to > from ? { from, to } : null
}

const shiftDate = (date: string, days: number) => {
  const [year, month, day] = date.trim().split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** The same span moved one span earlier (`-1`) or later (`1`), as absolute ends: dates stay dates, anything else becomes a wall clock. */
export function shiftRange(range: Range, direction: -1 | 1, options: ResolveOptions): Range | null {
  if (isDateOnly(range.from) && isDateOnly(range.to)) {
    const days = Math.round((Date.parse(range.to.trim()) - Date.parse(range.from.trim())) / 864e5) + 1
    if (days < 1) return null
    return { from: shiftDate(range.from, direction * days), to: shiftDate(range.to, direction * days) }
  }
  const resolved = resolveRange(range, options)
  if (!resolved) return null
  const span = resolved.to - resolved.from
  return {
    from: wallClockString(resolved.from + direction * span, options.timeZone),
    to: wallClockString(resolved.to + direction * span, options.timeZone),
  }
}

/**
 * The range widened to twice its span. A "last N units" range stays relative (`now-1h` becomes `now-2h`); one that
 * ends at now keeps its end; any other range grows around its middle and stops at now.
 */
export function zoomOutRange(range: Range, options: ResolveOptions): Range | null {
  const last = lastSpan(range.from, range.to)
  if (last) return { from: `now-${last.amount * 2}${last.unit}`, to: 'now' }
  const resolved = resolveRange(range, options)
  if (!resolved) return null
  const { from, to } = resolved
  const span = to - from
  if (range.to.trim() === 'now') return { from: wallClockString(from - span, options.timeZone), to: 'now' }
  const start = from - span / 2
  const end = to + span / 2
  if (end >= options.now) return { from: wallClockString(options.now - span * 2, options.timeZone), to: 'now' }
  return { from: wallClockString(start, options.timeZone), to: wallClockString(end, options.timeZone) }
}
