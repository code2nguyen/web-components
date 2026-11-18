// Times and weekdays shared by the planner and its lazily loaded paint module (`paint.ts`).
import type { WeekPlannerDay, WeekPlannerRange } from './week-planner.js'

export const DAYS: WeekPlannerDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const timePattern = /^(\d{1,2}):(\d{2})$/

export function minutesOf(value: string | undefined): number | null {
  const match = value ? timePattern.exec(value) : null
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

export function formatMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** A painted range inside one weekday, in minutes; `value` is `''` for a range without a category. */
export interface Span {
  from: number
  to: number
  value: string
}

/** A painted schedule by weekday (`Date#getDay` index). */
export type Paint = Span[][]

// The valid entries of `ranges` by weekday, in their order: a later entry draws over an earlier one it overlaps.
export function spansOf(ranges: WeekPlannerRange[]): Paint {
  const paint: Paint = DAYS.map(() => [])
  for (const range of Array.isArray(ranges) ? ranges : []) {
    const from = minutesOf(range?.start)
    const to = minutesOf(range?.end)
    const weekday = DAYS.indexOf(range?.day)
    if (from !== null && to !== null && to > from && weekday >= 0) paint[weekday].push({ from, to, value: String(range.value ?? '') })
  }
  return paint
}

// The index of the day column under `clientX`, or of the nearest one at either end of the strip.
export function columnAt(days: HTMLElement[], clientX: number): number {
  const distances = days.map((day) => {
    const rect = day.getBoundingClientRect()
    return Math.max(rect.left - clientX, clientX - rect.right, 0)
  })
  return Math.max(0, distances.indexOf(Math.min(...distances)))
}

// The category at minute `from` of a weekday's spans (the last one drawn there), or undefined when nothing is.
export function valueAt(spans: Span[], from: number): string | undefined {
  return spans.filter((span) => span.from <= from && from < span.to).pop()?.value
}
