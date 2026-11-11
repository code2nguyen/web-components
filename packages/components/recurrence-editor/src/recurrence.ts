/**
 * The recurrence model behind `c2-recurrence-editor`: one rule, read from and written to an RFC 5545 RRULE or a
 * five-field cron expression, and the occurrences it produces. DOM-free, so tables and servers can use it too.
 *
 * Dates are wall-clock dates (`2026-11-11`, `2026-11-11T09:00`) with no time zone: a rule repeats "at 09:00" wherever
 * it is read, as a calendar entry does.
 */

/** How often a rule repeats; `none` is "does not repeat" (an empty value). */
export type RecurrenceFrequency = 'none' | 'minutely' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'

/** A day of the week, as RRULE writes it. */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/** The days of the week, Monday first. */
export const WEEKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

/** The frequencies a rule can have, shortest first. */
export const FREQUENCIES: readonly Exclude<RecurrenceFrequency, 'none'>[] = ['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly']

/** A recurrence rule the editor can show. Everything else an RRULE says is kept, unedited, in `extra`. */
export interface RecurrenceRule {
  freq: Exclude<RecurrenceFrequency, 'none'>
  /** Repeat every `interval` periods (`INTERVAL`), 1 or more. */
  interval: number
  /** Weekly: the days of the week (`BYDAY=MO,WE`). */
  byDay?: Weekday[]
  /** Monthly and yearly: the day of the month, 1 to 31, or -1 for the last day (`BYMONTHDAY`). */
  byMonthDay?: number
  /** Monthly and yearly: the nth weekday of the month, `ordinal` 1 to 4 or -1 for the last (`BYDAY=3TU`). */
  byWeekday?: { ordinal: number; day: Weekday }
  /** Yearly: the month, 1 to 12 (`BYMONTH`). */
  byMonth?: number
  /** The hour of day, 0 to 23 (`BYHOUR`). */
  hour?: number
  /** The minute, 0 to 59 (`BYMINUTE`). */
  minute?: number
  /** Ends after this many occurrences (`COUNT`). */
  count?: number
  /** Ends on this date, `YYYY-MM-DD`, included (`UNTIL`). */
  until?: string
  /** The first day of the week (`WKST`), when it is not Monday. */
  weekStart?: Weekday
  /** RRULE parts the editor does not edit (`BYSETPOS=1,2`, `BYYEARDAY=…`), kept as written. */
  extra?: string[]
}

/** A wall-clock date and time. Months are 1 to 12. */
export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

const isWeekday = (value: string): value is Weekday => (WEEKDAYS as readonly string[]).includes(value)

const integer = (text: string | undefined): number | undefined => (text !== undefined && /^[+-]?\d+$/.test(text) ? Number(text) : undefined)

const inRange = (value: number | undefined, min: number, max: number) => value !== undefined && value >= min && value <= max

const pad = (value: number, length = 2) => String(value).padStart(length, '0')

/**
 * Reads an RRULE (`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE`), with or without its `RRULE:` prefix and from a block that
 * also holds a `DTSTART` line. Returns `null` for text that is not a rule the editor can show (no or an unknown
 * `FREQ`, `SECONDLY`). Parts it cannot edit are kept in `extra`.
 */
export function parseRRule(text: string | null | undefined): RecurrenceRule | null {
  if (!text) return null
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const line = lines.find((entry) => /^RRULE:/i.test(entry)) ?? lines.find((entry) => !/^[A-Z-]+[:;]/i.test(entry) || /^FREQ=/i.test(entry))
  if (!line) return null
  const body = line.replace(/^RRULE:/i, '')
  const parts = new Map<string, string>()
  const order: string[] = []
  for (const piece of body.split(';')) {
    const [rawKey, ...rest] = piece.split('=')
    const key = rawKey.trim().toUpperCase()
    if (!key) continue
    parts.set(key, rest.join('=').trim())
    order.push(key)
  }
  const freq = (parts.get('FREQ') ?? '').toLowerCase()
  if (!(FREQUENCIES as readonly string[]).includes(freq)) return null
  const rule: RecurrenceRule = { freq: freq as RecurrenceRule['freq'], interval: 1 }
  const extra: string[] = []
  const keep = (key: string) => extra.push(`${key}=${parts.get(key)}`)

  for (const key of order) {
    const value = parts.get(key) ?? ''
    switch (key) {
      case 'FREQ':
        break
      case 'INTERVAL': {
        const interval = integer(value)
        if (interval !== undefined && interval >= 1) rule.interval = interval
        else keep(key)
        break
      }
      case 'COUNT': {
        const count = integer(value)
        if (count !== undefined && count >= 1) rule.count = count
        else keep(key)
        break
      }
      case 'UNTIL': {
        const match = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(value) ?? /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
        if (match) rule.until = `${match[1]}-${match[2]}-${match[3]}`
        else keep(key)
        break
      }
      case 'BYMONTH': {
        const month = integer(value)
        if (inRange(month, 1, 12)) rule.byMonth = month
        else keep(key)
        break
      }
      case 'BYMONTHDAY': {
        const day = integer(value)
        if (day === -1 || inRange(day, 1, 31)) rule.byMonthDay = day
        else keep(key)
        break
      }
      case 'BYHOUR': {
        const hour = integer(value)
        if (inRange(hour, 0, 23)) rule.hour = hour
        else keep(key)
        break
      }
      case 'BYMINUTE': {
        const minute = integer(value)
        if (inRange(minute, 0, 59)) rule.minute = minute
        else keep(key)
        break
      }
      case 'WKST': {
        const day = value.toUpperCase()
        if (isWeekday(day)) {
          if (day !== 'MO') rule.weekStart = day
        } else keep(key)
        break
      }
      case 'BYDAY': {
        const entries = value
          .toUpperCase()
          .split(',')
          .map((entry) => /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(entry.trim()))
        if (entries.some((entry) => !entry)) {
          keep(key)
          break
        }
        const matches = entries as RegExpExecArray[]
        const plain = matches.every((match) => match[1] === undefined)
        const position = integer(parts.get('BYSETPOS'))
        if (rule.freq === 'weekly' || ((rule.freq === 'daily' || rule.freq === 'hourly' || rule.freq === 'minutely') && plain)) {
          if (plain && rule.freq === 'weekly') rule.byDay = WEEKDAYS.filter((day) => matches.some((match) => match[2] === day))
          else keep(key)
        } else if (matches.length === 1 && matches[0][1] !== undefined) {
          const ordinal = Number(matches[0][1])
          if (ordinal === -1 || inRange(ordinal, 1, 4)) rule.byWeekday = { ordinal, day: matches[0][2] as Weekday }
          else keep(key)
        } else if (matches.length === 1 && plain && (position === -1 || inRange(position, 1, 4))) {
          rule.byWeekday = { ordinal: position!, day: matches[0][2] as Weekday }
        } else keep(key)
        break
      }
      case 'BYSETPOS': {
        // Read with BYDAY: "the third Tuesday" is also written BYDAY=TU;BYSETPOS=3.
        const byDay = parts.get('BYDAY') ?? ''
        const position = integer(value)
        const single = /^(MO|TU|WE|TH|FR|SA|SU)$/i.test(byDay.trim())
        if (!(single && (position === -1 || inRange(position, 1, 4)) && (rule.freq === 'monthly' || rule.freq === 'yearly'))) keep(key)
        break
      }
      default:
        keep(key)
    }
  }
  // RFC 5545 forbids COUNT with UNTIL; COUNT wins.
  if (rule.count !== undefined) delete rule.until
  if (extra.length) rule.extra = extra
  return rule
}

/** Writes a rule as an RRULE value, without the `RRULE:` prefix: `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE`. */
export function formatRRule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.byMonth !== undefined) parts.push(`BYMONTH=${rule.byMonth}`)
  if (rule.byWeekday) parts.push(`BYDAY=${rule.byWeekday.ordinal}${rule.byWeekday.day}`)
  else if (rule.byMonthDay !== undefined) parts.push(`BYMONTHDAY=${rule.byMonthDay}`)
  if (rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(',')}`)
  if (rule.hour !== undefined) parts.push(`BYHOUR=${rule.hour}`)
  if (rule.minute !== undefined) parts.push(`BYMINUTE=${rule.minute}`)
  if (rule.weekStart && rule.weekStart !== 'MO') parts.push(`WKST=${rule.weekStart}`)
  if (rule.count !== undefined) parts.push(`COUNT=${rule.count}`)
  else if (rule.until) parts.push(`UNTIL=${rule.until.replace(/-/g, '')}`)
  if (rule.extra) parts.push(...rule.extra)
  return parts.join(';')
}

/** The intervals a cron step can express for each frequency: a step must divide the field's range evenly. */
export const CRON_INTERVALS: Readonly<Partial<Record<RecurrenceRule['freq'], readonly number[]>>> = {
  minutely: [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30],
  hourly: [1, 2, 3, 4, 6, 8, 12],
  daily: [1],
  weekly: [1],
  monthly: [1, 2, 3, 4, 6],
  yearly: [1],
}

const CRON_DAYS: Record<Weekday, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

/** Sorted numbers as a cron list, runs of three or more as ranges: `1-5`, `0,6`, `1,3-5`. */
function cronList(values: number[]): string {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const pieces: string[] = []
  for (let index = 0; index < sorted.length;) {
    let end = index
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++
    if (end - index >= 2) pieces.push(`${sorted[index]}-${sorted[end]}`)
    else pieces.push(...sorted.slice(index, end + 1).map(String))
    index = end + 1
  }
  return pieces.join(',')
}

/**
 * Writes a rule as a five-field cron expression (`minute hour day month weekday`), or returns `null` when cron cannot
 * say it: an end (`COUNT`, `UNTIL`), "the third Tuesday", the last day of the month, every 2 weeks, or a step that does
 * not divide its range. Every N months counts from January, as cron does.
 */
export function formatCron(rule: RecurrenceRule): string | null {
  if (rule.extra?.length || rule.count !== undefined || rule.until || rule.byWeekday) return null
  if (!(CRON_INTERVALS[rule.freq] ?? []).includes(rule.interval)) return null
  const minute = rule.minute ?? 0
  const hour = rule.hour ?? 0
  const step = (n: number) => (n === 1 ? '*' : `*/${n}`)
  switch (rule.freq) {
    case 'minutely':
      return `${step(rule.interval)} * * * *`
    case 'hourly':
      return `${minute} ${step(rule.interval)} * * *`
    case 'daily':
      return `${minute} ${hour} * * *`
    case 'weekly':
      if (!rule.byDay?.length) return null
      return `${minute} ${hour} * * ${cronList(rule.byDay.map((day) => CRON_DAYS[day]))}`
    case 'monthly':
      if (rule.byMonthDay === undefined || rule.byMonthDay < 1) return null
      return `${minute} ${hour} ${rule.byMonthDay} ${step(rule.interval)} *`
    case 'yearly':
      if (rule.byMonthDay === undefined || rule.byMonthDay < 1 || rule.byMonth === undefined) return null
      return `${minute} ${hour} ${rule.byMonthDay} ${rule.byMonth} *`
  }
}

const CRON_MACROS: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
}

const CRON_DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const CRON_MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** A cron weekday field (`1,3`, `MON-FRI`, `0,6`) as RRULE days, or `null`. */
function cronDays(field: string): Weekday[] | null {
  const days = new Set<number>()
  const read = (text: string) => {
    const name = CRON_DAY_NAMES.indexOf(text.toUpperCase())
    if (name >= 0) return name
    const number = integer(text)
    return inRange(number, 0, 7) ? number! % 7 : null
  }
  for (const piece of field.split(',')) {
    const [from, to] = piece.split('-')
    const start = read(from)
    const end = to === undefined ? start : read(to)
    if (start === null || end === null) return null
    // `5-0` is not a range cron reads; `1-7` ends on Sunday.
    const last = to !== undefined && end === 0 && start > 0 ? 7 : end
    if (last < start) return null
    for (let day = start; day <= last; day++) days.add(day % 7)
  }
  const byDay = WEEKDAYS.filter((day) => days.has(CRON_DAYS[day]))
  return byDay.length ? byDay : null
}

/**
 * Reads a five-field cron expression of the shapes {@link formatCron} writes (`*\/15 * * * *`, `30 9 * * 1-5`,
 * `0 9 1 *\/3 *`, `0 0 25 12 *`) and the `@daily`-style macros. Returns `null` for any other expression.
 */
export function parseCron(text: string | null | undefined): RecurrenceRule | null {
  if (!text) return null
  const source = CRON_MACROS[text.trim().toLowerCase()] ?? text.trim()
  const fields = source.split(/\s+/)
  if (fields.length !== 5) return null
  const [minuteField, hourField, dayField, monthField, weekdayField] = fields
  const stepOf = (field: string): number | null => {
    if (field === '*') return 1
    const match = /^(?:\*|0)\/(\d+)$/.exec(field)
    return match ? Number(match[1]) : null
  }
  const minute = integer(minuteField)
  const hour = integer(hourField)
  const day = integer(dayField)
  const monthName = CRON_MONTH_NAMES.indexOf(monthField.toUpperCase())
  const month = monthName >= 0 ? monthName + 1 : integer(monthField)
  const valid = (rule: RecurrenceRule) => ((CRON_INTERVALS[rule.freq] ?? []).includes(rule.interval) ? rule : null)

  if (dayField === '*' && monthField === '*' && weekdayField === '*') {
    const minuteStep = stepOf(minuteField)
    if (minuteStep !== null && hourField === '*') return valid({ freq: 'minutely', interval: minuteStep })
    if (!inRange(minute, 0, 59)) return null
    const hourStep = hour === undefined ? stepOf(hourField) : null
    if (hourStep !== null) return valid({ freq: 'hourly', interval: hourStep, minute })
    if (!inRange(hour, 0, 23)) return null
    return { freq: 'daily', interval: 1, hour, minute }
  }
  if (!inRange(minute, 0, 59) || !inRange(hour, 0, 23)) return null
  if (dayField === '*' && monthField === '*') {
    const byDay = cronDays(weekdayField)
    return byDay ? { freq: 'weekly', interval: 1, byDay, hour, minute } : null
  }
  if (weekdayField !== '*' || !inRange(day, 1, 31)) return null
  const monthStep = stepOf(monthField)
  if (monthStep !== null) return valid({ freq: 'monthly', interval: monthStep, byMonthDay: day, hour, minute })
  if (!inRange(month, 1, 12)) return null
  return { freq: 'yearly', interval: 1, byMonth: month, byMonthDay: day, hour, minute }
}

/** Reads `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`, or returns `null`. */
export function parseWallClock(text: string | null | undefined): WallClock | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(text ?? '')
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  if (!inRange(month, 1, 12) || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day, hour: match[4] ? Number(match[4]) : 0, minute: match[5] ? Number(match[5]) : 0 }
}

/** Writes a wall-clock date as `YYYY-MM-DD`. */
export function formatWallDate(date: Pick<WallClock, 'year' | 'month' | 'day'>): string {
  return `${pad(date.year, 4)}-${pad(date.month)}-${pad(date.day)}`
}

/** The wall clock of a `Date` in the local time zone. */
export function wallClockOf(date: Date): WallClock {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The weekday of a wall-clock date. */
export function weekdayOf(date: Pick<WallClock, 'year' | 'month' | 'day'>): Weekday {
  return WEEKDAYS[(new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7]
}

/** Which occurrence of its weekday a date is in its month: 1 to 5. */
export function weekdayOrdinalOf(date: Pick<WallClock, 'day'>): number {
  return Math.ceil(date.day / 7)
}

/** Days since 1970-01-01 of a wall-clock date: date arithmetic without time zones. */
const dayNumber = (year: number, month: number, day: number) => Date.UTC(year, month - 1, day) / 86_400_000

const fromDayNumber = (days: number): Pick<WallClock, 'year' | 'month' | 'day'> => {
  const date = new Date(days * 86_400_000)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** Minutes since 1970-01-01 00:00 of a wall-clock time. */
const minuteNumber = (clock: WallClock) => dayNumber(clock.year, clock.month, clock.day) * 1440 + clock.hour * 60 + clock.minute

const fromMinuteNumber = (minutes: number): WallClock => {
  const days = Math.floor(minutes / 1440)
  const rest = minutes - days * 1440
  return { ...fromDayNumber(days), hour: Math.floor(rest / 60), minute: rest % 60 }
}

/** The day of the month `rule` picks in a month, or `null` when that month has none (day 31 in April). */
function dayInMonth(rule: RecurrenceRule, year: number, month: number, start: WallClock): number | null {
  const length = daysInMonth(year, month)
  if (rule.byWeekday) {
    const { ordinal, day } = rule.byWeekday
    const target = WEEKDAYS.indexOf(day)
    if (ordinal > 0) {
      const first = WEEKDAYS.indexOf(weekdayOf({ year, month, day: 1 }))
      const date = 1 + ((target - first + 7) % 7) + (ordinal - 1) * 7
      return date <= length ? date : null
    }
    const last = WEEKDAYS.indexOf(weekdayOf({ year, month, day: length }))
    return length - ((last - target + 7) % 7)
  }
  const wanted = rule.byMonthDay ?? start.day
  if (wanted === -1) return length
  return wanted <= length ? wanted : null
}

export interface OccurrenceOptions {
  /** The first occurrence's date and time, `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM` (DTSTART). Today when not given. */
  start?: string | WallClock
  /** How many occurrences to return at most. */
  limit: number
  /** Skip the occurrences before this wall-clock time; they still count towards `COUNT`. */
  after?: string | WallClock
}

/**
 * The occurrences of `rule` from `start`, in order, at most `limit` of them. `start` itself is the first when the rule
 * matches it. Rules with `extra` parts are read without them. Returns wall-clock times.
 */
export function occurrences(rule: RecurrenceRule, options: OccurrenceOptions): WallClock[] {
  const start = (typeof options.start === 'string' ? parseWallClock(options.start) : options.start) ?? { ...wallClockOf(new Date()), hour: 0, minute: 0 }
  const after = typeof options.after === 'string' ? parseWallClock(options.after) : options.after
  const from = minuteNumber(start)
  const skipBefore = after ? minuteNumber(after) : from
  const until = rule.until ? parseWallClock(rule.until) : null
  const end = until ? minuteNumber({ ...until, hour: 23, minute: 59 }) : Infinity
  const interval = Math.max(1, Math.floor(rule.interval) || 1)
  const hour = rule.hour ?? start.hour
  const minute = rule.minute ?? start.minute
  const result: WallClock[] = []
  let counted = 0

  /** Takes one candidate; returns false once the rule has ended or enough were found. */
  const take = (clock: WallClock): boolean => {
    const at = minuteNumber(clock)
    if (at < from) return true
    if (at > end) return false
    counted++
    if (rule.count !== undefined && counted > rule.count) return false
    if (at >= skipBefore) result.push(clock)
    return result.length < options.limit
  }

  if (options.limit <= 0) return result
  // A safety bound: a rule that never matches (day 31 every 2 months from February) stops instead of looping.
  const periods = 5000

  if (rule.freq === 'minutely' || rule.freq === 'hourly') {
    const step = interval * (rule.freq === 'hourly' ? 60 : 1)
    let at = rule.freq === 'hourly' ? minuteNumber({ ...start, minute }) : from
    if (rule.freq === 'hourly' && at < from) at += 60
    for (let index = 0; index < periods * 10; index++, at += step) {
      const clock = fromMinuteNumber(at)
      if (rule.hour !== undefined && clock.hour !== rule.hour) continue
      if (!take(clock)) break
    }
    return result
  }

  if (rule.freq === 'daily') {
    const first = dayNumber(start.year, start.month, start.day)
    for (let index = 0; index < periods; index++) {
      if (!take({ ...fromDayNumber(first + index * interval), hour, minute })) break
    }
    return result
  }

  if (rule.freq === 'weekly') {
    const days = rule.byDay?.length ? rule.byDay : [weekdayOf(start)]
    const weekStart = WEEKDAYS.indexOf(rule.weekStart ?? 'MO')
    const startDay = dayNumber(start.year, start.month, start.day)
    const offset = (WEEKDAYS.indexOf(weekdayOf(start)) - weekStart + 7) % 7
    const firstWeek = startDay - offset
    const order = days.map((day) => (WEEKDAYS.indexOf(day) - weekStart + 7) % 7).sort((a, b) => a - b)
    for (let week = 0; week < periods; week++) {
      for (const shift of order) {
        if (!take({ ...fromDayNumber(firstWeek + week * interval * 7 + shift), hour, minute })) return result
      }
    }
    return result
  }

  const yearly = rule.freq === 'yearly'
  for (let period = 0; period < periods; period++) {
    let year: number
    let month: number
    if (yearly) {
      year = start.year + period * interval
      month = rule.byMonth ?? start.month
    } else {
      const index = start.month - 1 + period * interval
      year = start.year + Math.floor(index / 12)
      month = (index % 12) + 1
    }
    const day = dayInMonth(rule, year, month, start)
    if (day === null) continue
    if (!take({ year, month, day, hour, minute })) break
  }
  return result
}

/** The rule the editor starts from on `start`: weekly, on its weekday. */
export function defaultRule(start: WallClock, freq: RecurrenceRule['freq'] = 'weekly'): RecurrenceRule {
  return withFrequency({ freq: 'weekly', interval: 1 }, freq, start)
}

/**
 * The rule switched to another frequency, with the fields that frequency shows filled in from `start` (the weekday,
 * the day of the month, the month) and the fields it does not show dropped. The interval and the end are kept.
 */
export function withFrequency(rule: RecurrenceRule, freq: RecurrenceRule['freq'], start: WallClock): RecurrenceRule {
  const next: RecurrenceRule = { freq, interval: rule.interval }
  if (rule.count !== undefined) next.count = rule.count
  if (rule.until) next.until = rule.until
  if (rule.weekStart) next.weekStart = rule.weekStart
  if (freq === 'weekly') next.byDay = rule.byDay?.length ? rule.byDay : [weekdayOf(start)]
  if (freq === 'monthly' || freq === 'yearly') {
    if (rule.byWeekday) next.byWeekday = rule.byWeekday
    else next.byMonthDay = rule.byMonthDay ?? start.day
  }
  if (freq === 'yearly') next.byMonth = rule.byMonth ?? start.month
  if (freq === 'hourly') next.minute = rule.minute ?? start.minute
  if (freq !== 'minutely' && freq !== 'hourly') {
    if (rule.hour !== undefined) next.hour = rule.hour
    if (rule.minute !== undefined) next.minute = rule.minute
  }
  return next
}
