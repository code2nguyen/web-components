/**
 * Time arithmetic for `c2-scheduler`. Times are wall-clock values with no zone: each is held as whole minutes counted
 * from 1970-01-01T00:00 on a UTC calendar, so adding a day is adding 1440 and a daylight-saving change never moves a
 * booking. The app's strings (`YYYY-MM-DDTHH:mm`) go in and come back out unchanged in shape.
 */

import { formatWallClock, pad, parseDate, parseWallClock, wallClockAt } from '@c2n/core/zoned-time.js'

export type SchedulerView = 'day' | 'week' | 'month'

export const MINUTES_PER_DAY = 1440

const clockPattern = /^(\d{1,2}):(\d{2})$/

const fromClock = (clock: { year: number; month: number; day: number; hour?: number; minute?: number }) =>
  Date.UTC(clock.year, clock.month - 1, clock.day) / 60_000 + (clock.hour ?? 0) * 60 + (clock.minute ?? 0)

/** A `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` string as minutes (seconds dropped), or null when it is not a real date. */
export function toMinutes(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  const clock = parseWallClock(text) ?? parseDate(text)
  return clock ? fromClock(clock) : null
}

/** Minutes as `YYYY-MM-DDTHH:mm`. */
export function fromMinutes(minutes: number): string {
  const date = new Date(minutes * 60_000)
  return formatWallClock(
    { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: 0 },
    false,
  )
}

/** The day holding `minutes`, as `YYYY-MM-DD`. */
export function dayIso(minutes: number): string {
  const date = new Date(minutes * 60_000)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

/** Midnight of the day holding `minutes`. */
export function startOfDay(minutes: number): number {
  return Math.floor(minutes / MINUTES_PER_DAY) * MINUTES_PER_DAY
}

/** Weekday of the day holding `minutes`, as `Date#getDay` numbers it (Sunday is 0). */
export function weekdayOf(minutes: number): number {
  return new Date(minutes * 60_000).getUTCDay()
}

/** A clock time (`09:00`, `24:00`) as minutes since midnight, or null. */
export function parseClock(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = clockPattern.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

/** `09:00-18:00` (or with an en dash) as a pair of minutes since midnight, or null. */
export function parseClockRange(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null
  const [from, to] = value.split(/\s*[-–]\s*/)
  const start = parseClock(from)
  const end = parseClock(to)
  return start !== null && end !== null && end > start ? [start, end] : null
}

/** Adds whole months, keeping the day of the month where the target month has it (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(minutes: number, amount: number): number {
  const date = new Date(minutes * 60_000)
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + amount, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return target.getTime() / 60_000 + (minutes - startOfDay(minutes))
}

/** The days a view shows and the hours of each day it draws. */
export interface SchedulerRange {
  /** Midnight of each day shown, in order. */
  days: number[]
  /** First minute of each day drawn, since midnight. */
  dayStart: number
  /** Last minute of each day drawn, since midnight. */
  dayEnd: number
  /** First instant shown. */
  start: number
  /** Last instant shown. */
  end: number
}

/** The range a view shows around `date` (a midnight): that day, its week from `firstWeekday`, or its month. */
export function viewRange(view: SchedulerView, date: number, firstWeekday: number, dayStart: number, dayEnd: number): SchedulerRange {
  let first = date
  let count = 1
  if (view === 'week') {
    first = date - ((weekdayOf(date) - firstWeekday + 7) % 7) * MINUTES_PER_DAY
    count = 7
  } else if (view === 'month') {
    const day = new Date(date * 60_000)
    first = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1) / 60_000
    count = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate()
  }
  const days = Array.from({ length: count }, (_, index) => first + index * MINUTES_PER_DAY)
  return { days, dayStart, dayEnd, start: first + dayStart, end: days[count - 1] + dayEnd }
}

/** Where `minutes` falls across a range, from 0 (its start) to 1 (its end). Hours outside the drawn ones clamp. */
export function fractionOf(range: SchedulerRange, minutes: number): number {
  const count = range.days.length
  const span = Math.max(1, range.dayEnd - range.dayStart)
  const offset = minutes - range.days[0]
  if (offset <= range.dayStart) return 0
  const day = Math.min(count - 1, Math.floor(offset / MINUTES_PER_DAY))
  const within = Math.min(1, Math.max(0, (offset - day * MINUTES_PER_DAY - range.dayStart) / span))
  return Math.min(1, (day + within) / count)
}

/** The instant at a fraction of a range: the inverse of {@link fractionOf}. */
export function minutesAt(range: SchedulerRange, fraction: number): number {
  const count = range.days.length
  const position = Math.min(count, Math.max(0, fraction * count))
  const day = Math.min(count - 1, Math.floor(position))
  return range.days[day] + range.dayStart + (position - day) * (range.dayEnd - range.dayStart)
}

/** One column of the grid: the stretch of time under it. */
export interface SchedulerColumn {
  start: number
  end: number
}

/** The columns of a view: one per `slotMinutes` of the day in the day view, one per day otherwise. */
export function viewColumns(view: SchedulerView, range: SchedulerRange, slotMinutes: number): SchedulerColumn[] {
  if (view !== 'day') return range.days.map((day) => ({ start: day + range.dayStart, end: day + range.dayEnd }))
  const day = range.days[0]
  const columns: SchedulerColumn[] = []
  for (let minute = range.dayStart; minute < range.dayEnd; minute += slotMinutes) {
    columns.push({ start: day + minute, end: day + Math.min(minute + slotMinutes, range.dayEnd) })
  }
  return columns
}

/** The column holding `minutes`, clamped to the grid. */
export function columnAt(columns: SchedulerColumn[], minutes: number): number {
  const index = columns.findIndex((column) => minutes < column.end)
  return index === -1 ? columns.length - 1 : Math.max(0, index)
}

/** Stacks overlapping items in lanes: each takes the first lane free at its start. Returns each item's lane and the count. */
export function assignLanes(items: { start: number; end: number }[]): { lanes: number[]; count: number } {
  const order = items.map((_, index) => index).sort((a, b) => items[a].start - items[b].start || items[b].end - items[a].end)
  const ends: number[] = []
  const lanes = new Array<number>(items.length).fill(0)
  for (const index of order) {
    let lane = ends.findIndex((end) => end <= items[index].start)
    if (lane === -1) lane = ends.length
    ends[lane] = items[index].end
    lanes[index] = lane
  }
  return { lanes, count: Math.max(1, ends.length) }
}

/** Snaps minutes to the nearest multiple of `step` (`floor` rounds down instead). */
export function snapMinutes(minutes: number, step: number, floor = false): number {
  return (floor ? Math.floor(minutes / step) : Math.round(minutes / step)) * step
}

type WeekInfo = { firstDay?: number; weekend?: number[] }

/** The locale's weekend as `Date#getDay` numbers: Saturday and Sunday unless `Intl.Locale` says otherwise. */
export function localeWeekend(locale: string): number[] {
  try {
    const intlLocale = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo }
    const weekend = (intlLocale.getWeekInfo?.() ?? intlLocale.weekInfo)?.weekend
    if (Array.isArray(weekend) && weekend.length) return weekend.map((day) => day % 7)
  } catch {
    // An unknown locale falls back to Saturday and Sunday.
  }
  return [6, 0]
}

/** The wall clock now in `timeZone` (the browser's zone when empty), as minutes. */
export function nowIn(timeZone: string, now = Date.now()): number {
  try {
    return fromClock(wallClockAt(now, timeZone))
  } catch {
    // An unknown zone reads the browser's own.
    return fromClock(wallClockAt(now, ''))
  }
}
