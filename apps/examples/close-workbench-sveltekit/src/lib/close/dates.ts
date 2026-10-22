import type { Day } from './types.ts'

const DAY_MS = 86_400_000

function toUtc(day: Day): number {
  const [year, month, date] = day.split('-').map(Number)
  return Date.UTC(year, month - 1, date)
}

/** Whole days from `a` to `b`, negative when `b` is earlier. */
export function daysBetween(a: Day, b: Day): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS)
}

export function addDays(day: Day, days: number): Day {
  return new Date(toUtc(day) + days * DAY_MS).toISOString().slice(0, 10)
}

/** `Sep 9`, in UTC so the server and every browser agree. */
export function formatDay(day: Day): string {
  return new Date(toUtc(day)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
}
