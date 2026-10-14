/** Wall-clock and time-zone arithmetic for `c2-date-time-picker`, on `Intl` only. */

export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const valuePattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/

export const pad = (n: number, length = 2) => String(n).padStart(length, '0')

/** Parses `YYYY-MM-DDTHH:mm[:ss]`, rejecting impossible dates such as February 30. */
export function parseWallClock(value: string): WallClock | null {
  const match = valuePattern.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1).map((part) => Number(part ?? 0))
  if (!isRealDate(year, month, day) || hour > 23 || minute > 59 || second > 59) return null
  return { year, month, day, hour, minute, second }
}

/** Parses `YYYY-MM-DD`. */
export function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = datePattern.exec(value)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  return isRealDate(year, month, day) ? { year, month, day } : null
}

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function formatDate({ year, month, day }: { year: number; month: number; day: number }) {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`
}

export function formatTime({ hour, minute, second }: { hour: number; minute: number; second: number }, withSeconds: boolean) {
  return withSeconds ? `${pad(hour)}:${pad(minute)}:${pad(second)}` : `${pad(hour)}:${pad(minute)}`
}

export function formatWallClock(clock: WallClock, withSeconds: boolean) {
  return `${formatDate(clock)}T${formatTime(clock, withSeconds)}`
}

const partFormatters = new Map<string, Intl.DateTimeFormat>()

/** Whether `zone` is an IANA time zone the engine knows. */
export function isTimeZone(zone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** The wall clock an instant shows in `zone` (empty: the browser's own zone). */
export function wallClockAt(instant: number, zone: string): WallClock {
  if (!zone) {
    const date = new Date(instant)
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    }
  }
  let formatter = partFormatters.get(zone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    partFormatters.set(zone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((part) => [part.type, part.value]))
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

const asUtc = (clock: WallClock) => Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second)

/** Offset of `zone` from UTC at `instant`, in minutes (east positive). */
export function offsetAt(instant: number, zone: string) {
  const whole = Math.floor(instant / 1000) * 1000
  return Math.round((asUtc(wallClockAt(whole, zone)) - whole) / 60000)
}

/**
 * The instant a wall clock names in `zone`. A time skipped by a daylight-saving jump resolves forward (02:30 on a
 * spring-forward night is 03:30), and a repeated one to its first occurrence, as `Temporal`'s `compatible` does.
 */
export function instantOf(clock: WallClock, zone: string) {
  if (!zone) return new Date(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second).getTime()
  const local = asUtc(clock)
  const before = offsetAt(local - 864e5, zone)
  const after = offsetAt(local + 864e5, zone)
  const candidates = [local - before * 60000, local - after * 60000].filter((instant) => asUtc(wallClockAt(instant, zone)) === local)
  if (candidates.length) return Math.min(...candidates)
  // In the gap: the clock moved from `before` to `after`, so read the wall clock with the earlier offset.
  return local - before * 60000
}

/** `+02:00`-style offset of a number of minutes. */
export function formatOffset(minutes: number) {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

/** A short display name of `zone` at `instant` in `locale` (`CEST`, `GMT+2`), or a long one with `style: 'long'`. */
export function zoneLabel(zone: string, instant: number, locale: string, style: 'short' | 'shortOffset' | 'long' = 'short') {
  try {
    const parts = new Intl.DateTimeFormat(locale, { timeZone: zone || undefined, timeZoneName: style }).formatToParts(instant)
    return parts.find((part) => part.type === 'timeZoneName')?.value ?? zone
  } catch {
    return zone
  }
}
