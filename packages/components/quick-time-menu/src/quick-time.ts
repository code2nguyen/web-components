import { firstDayOfWeek } from '@c2n/core/locale-helper.js'
import { formatWallClock, instantOf, parseWallClock, wallClockAt, type WallClock } from '@c2n/core/zoned-time.js'

/**
 * When a preset falls: an expression or a function of the current instant.
 *
 * Expressions (case-insensitive):
 * - `+3h`, `+30m`, `+1h30m`, `+2d`, `+1w` — that long from now;
 * - `today 16:00`, `tomorrow`, `tomorrow 08:30` — a day and an optional time (`morning` when omitted);
 * - `monday 09:00` — the first Monday whose time is still ahead, today included; `next monday` skips today;
 * - `later today` — in about 3 hours, on the hour; `this evening`, `end of day` — today at `evening`;
 * - `this weekend` — the next weekend day at `morning`; `next week` — the first working day of next week (never Saturday or Sunday) at `morning`.
 *
 * Times are `HH:mm`, `9am` or `5:30pm`. A function returns the instant as a `Date`.
 */
export type QuickTimeAt = string | ((now: Date) => Date | null | undefined)

/** A row of the menu. */
export interface QuickTimePreset {
  /** Identifies the preset in `time-select`. */
  id: string
  /** The row's text. */
  label: string
  /** When the preset falls. */
  at: QuickTimeAt
}

export interface QuickTimeOptions {
  /** The current instant (the browser's clock by default). */
  now?: Date | number | string
  /** IANA zone the wall clock is read in; empty is the browser's zone. */
  timeZone?: string
  /** Time of day of `tomorrow`, `this weekend`, `next week` and days without a time. Default `09:00`. */
  morning?: string
  /** Time of day of `this evening` and `end of day`. Default `18:00`. */
  evening?: string
  /** Locale whose first day of the week `next week` uses. */
  locale?: string
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080 }

/** The current instant as milliseconds. */
export function nowOf(now: Date | number | string | undefined): number {
  if (now === undefined || now === '') return Date.now()
  const time = now instanceof Date ? now.getTime() : typeof now === 'number' ? now : Date.parse(now)
  return Number.isNaN(time) ? Date.now() : time
}

/** Reads `HH:mm`, `9am` or `5:30pm` as minutes past midnight. */
export function parseTimeOfDay(text: string): number | null {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim())
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const period = match[3]?.toLowerCase()
  if (!match[2] && !period) return null
  if (period) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (period === 'pm' ? 12 : 0)
  }
  return hour > 23 || minute > 59 ? null : hour * 60 + minute
}

/** The calendar day `days` after a wall clock's day, at `minutes` past midnight. */
function at(clock: WallClock, days: number, minutes: number): WallClock {
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day + days))
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: Math.floor(minutes / 60),
    minute: minutes % 60,
    second: 0,
  }
}

const weekdayOf = (clock: WallClock) => new Date(Date.UTC(clock.year, clock.month - 1, clock.day)).getUTCDay()
const minutesOf = (clock: WallClock) => clock.hour * 60 + clock.minute

/**
 * Resolves a preset's `at` to a wall-clock `YYYY-MM-DDTHH:mm` in `timeZone`, or `''` when it does not apply now (a
 * time already past, `later today` in the evening, `this weekend` on a weekend) or is not understood.
 */
export function resolveQuickTime(when: QuickTimeAt, options: QuickTimeOptions = {}): string {
  const zone = options.timeZone ?? ''
  const nowMs = nowOf(options.now)
  const now = wallClockAt(nowMs, zone)
  const morning = parseTimeOfDay(options.morning ?? '') ?? 9 * 60
  const evening = parseTimeOfDay(options.evening ?? '') ?? 18 * 60
  const ahead = (clock: WallClock | null) => (clock && instantOf(clock, zone) > nowMs ? formatWallClock(clock, false) : '')

  if (typeof when === 'function') {
    let date: Date | null | undefined
    try {
      date = when(new Date(nowMs))
    } catch {
      return ''
    }
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
    const clock = wallClockAt(date.getTime(), zone)
    return ahead({ ...clock, second: 0 })
  }

  const text = String(when ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
  if (!text) return ''

  const relative = /^\+((?:\d+(?:\.\d+)?\s*[mhdw]\s*)+)$/.exec(text)
  if (relative) {
    let minutes = 0
    for (const [, amount, unit] of relative[1].matchAll(/(\d+(?:\.\d+)?)\s*([mhdw])/g)) minutes += Number(amount) * UNIT_MINUTES[unit]
    const clock = wallClockAt(nowMs + Math.round(minutes) * 60_000, zone)
    return ahead({ ...clock, second: 0 })
  }

  const today = minutesOf(now)
  switch (text) {
    case 'later today': {
      if (today >= evening) return ''
      const target = Math.round((today + 180) / 60) * 60
      return target >= 24 * 60 ? '' : ahead(at(now, 0, target))
    }
    case 'this evening':
    case 'end of day':
      return text === 'this evening' && today >= evening - 60 ? '' : ahead(at(now, 0, evening))
    case 'this weekend': {
      const weekday = weekdayOf(now)
      if (weekday === 0 || weekday === 6) return ''
      return ahead(at(now, 6 - weekday, morning))
    }
    case 'next week': {
      const first = firstDayOfWeek(options.locale || 'en-US')
      let offset = (first - weekdayOf(now) + 7) % 7 || 7
      // The first working day: a week that starts on Sunday (en-US) or Saturday starts work on Monday, the way Gmail
      // and Linear read "next week"; Saturday and Sunday are the weekend here, as for `this weekend`.
      while ([0, 6].includes((weekdayOf(now) + offset) % 7)) offset += 1
      return ahead(at(now, offset, morning))
    }
  }

  const match = /^(today|tomorrow|next (\w+)|(\w+))(?: (?:at )?(.+))?$/.exec(text)
  if (!match) return ''
  const time = match[4] === undefined ? morning : parseTimeOfDay(match[4])
  if (time === null) return ''
  if (match[1] === 'today') return ahead(at(now, 0, time))
  if (match[1] === 'tomorrow') return ahead(at(now, 1, time))
  const name = match[2] ?? match[3]
  const target = WEEKDAYS.findIndex((day) => day === name || (name.length >= 3 && day.startsWith(name)))
  if (target < 0) return ''
  let offset = (target - weekdayOf(now) + 7) % 7
  if (match[2] !== undefined) offset ||= 7
  else if (offset === 0 && time <= today) offset = 7
  return ahead(at(now, offset, time))
}

/** Whether the locale reads the clock 0–23, so hours are written with two digits (`09:00`) as its users expect. */
function twentyFourHour(locale: string | undefined): boolean {
  try {
    // `hourCycle` is ES2021, above the library's ES2020 typings; every engine the components support has it.
    const cycle = (new Intl.DateTimeFormat(locale || undefined, { hour: 'numeric' }).resolvedOptions() as { hourCycle?: string }).hourCycle
    return cycle === 'h23' || cycle === 'h24'
  } catch {
    return false
  }
}

/**
 * The resolved time as a row shows it, in the locale's hour cycle: the time alone today (`17:00`), with the weekday
 * within the coming week (`Tue 09:00`), with the date beyond (`Mon 16 Nov, 09:00`).
 */
export function formatQuickTime(value: string, options: { now?: Date | number | string; timeZone?: string; locale?: string } = {}): string {
  const clock = parseWallClock(value)
  if (!clock) return ''
  const zone = options.timeZone ?? ''
  const instant = instantOf(clock, zone)
  const now = wallClockAt(nowOf(options.now), zone)
  const days = Math.round((Date.UTC(clock.year, clock.month - 1, clock.day) - Date.UTC(now.year, now.month - 1, now.day)) / 864e5)
  const format: Intl.DateTimeFormatOptions = { hour: twentyFourHour(options.locale) ? '2-digit' : 'numeric', minute: '2-digit' }
  if (days !== 0) format.weekday = 'short'
  if (days < 0 || days > 6) Object.assign(format, { day: 'numeric', month: 'short' })
  if (clock.year !== now.year && (days < 0 || days > 6)) format.year = 'numeric'
  try {
    return new Intl.DateTimeFormat(options.locale || undefined, { ...format, timeZone: zone || undefined }).format(instant)
  } catch {
    return new Intl.DateTimeFormat(options.locale || undefined, format).format(instant)
  }
}

/** The full date and time, for the custom panel's hint and accessible names: "Thursday, 12 November at 08:30". */
export function formatQuickTimeLong(value: string, options: { timeZone?: string; locale?: string } = {}): string {
  const clock = parseWallClock(value)
  if (!clock) return ''
  const zone = options.timeZone ?? ''
  const format: Intl.DateTimeFormatOptions = { dateStyle: 'full', timeStyle: 'short' }
  try {
    return new Intl.DateTimeFormat(options.locale || undefined, { ...format, timeZone: zone || undefined }).format(instantOf(clock, zone))
  } catch {
    return new Intl.DateTimeFormat(options.locale || undefined, format).format(instantOf(clock, zone))
  }
}
