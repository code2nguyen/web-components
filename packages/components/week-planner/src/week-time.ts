// Times, weekdays and the painted schedule's model, shared by the planner and its lazily loaded paint module.
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

// The start of the `snap`-minute cell holding `minutes`, kept on the scale from `firstHour` to `lastHour`. Cells are
// aligned to midnight, so the pointer and the keyboard cursor paint the same grid.
export function cellStart(minutes: number, snap: number, firstHour: number, lastHour: number): number {
  return clamp(Math.floor(minutes / snap) * snap, firstHour * 60, Math.max(firstHour * 60, Math.floor((lastHour * 60 - 1) / snap) * snap))
}

// The end of the cell starting at `from`: the next midnight-aligned boundary, so a first cell that `cellStart` clamped
// to the scale is shorter than `snap` rather than overlapping the next one.
export function cellEnd(from: number, snap: number): number {
  return Math.min(1440, (Math.floor(from / snap) + 1) * snap)
}

/** A painted range inside one weekday, in minutes; `value` is `''` for a range without a category. */
export interface Span {
  from: number
  to: number
  value: string
}

/** A painted schedule by weekday (`Date#getDay` index). */
export type Paint = Span[][]

// `paint` with `value` (or cleared, for `null`) from `from` to `to` on `weekdays`, merging equal neighbours.
export function paintSpans(paint: Paint, weekdays: number[], from: number, to: number, value: string | null): Paint {
  return paint.map((spans, weekday) => {
    if (!weekdays.includes(weekday)) return spans
    const kept = spans.flatMap((span) =>
      span.to <= from || span.from >= to ? [span] : [...(span.from < from ? [{ ...span, to: from }] : []), ...(span.to > to ? [{ ...span, from: to }] : [])],
    )
    if (value !== null) kept.push({ from, to, value })
    kept.sort((a, b) => a.from - b.from)
    return kept.reduce<Span[]>((merged, span) => {
      const last = merged[merged.length - 1]
      if (last && last.to === span.from && last.value === span.value) last.to = span.to
      else merged.push({ ...span })
      return merged
    }, [])
  })
}

// The valid entries of `ranges` by weekday: overlapping entries resolved in favour of the later one, equal
// neighbours merged.
export function scheduleOf(ranges: WeekPlannerRange[]): Paint {
  return (Array.isArray(ranges) ? ranges : []).reduce(
    (paint, range) => {
      const from = minutesOf(range?.start)
      const to = minutesOf(range?.end)
      const weekday = DAYS.indexOf(range?.day)
      return from !== null && to !== null && to > from && weekday >= 0 ? paintSpans(paint, [weekday], from, to, String(range.value ?? '')) : paint
    },
    DAYS.map((): Span[] => []),
  )
}

// A span as the range `ranges` holds and `renderRange` receives.
export function rangeOf(span: Span, weekday: number): WeekPlannerRange {
  const range: WeekPlannerRange = { day: DAYS[weekday], start: formatMinutes(span.from), end: formatMinutes(span.to) }
  if (span.value) range.value = span.value
  return range
}

// The index of the day column under `clientX`, or of the nearest one at either end of the strip.
export function columnAt(days: HTMLElement[], clientX: number): number {
  const distances = days.map((day) => {
    const rect = day.getBoundingClientRect()
    return Math.max(rect.left - clientX, clientX - rect.right, 0)
  })
  return Math.max(0, distances.indexOf(Math.min(...distances)))
}

// The category painted at minute `from` of a weekday's spans, or undefined when nothing is.
export function valueAt(spans: Span[], from: number): string | undefined {
  return spans.find((span) => span.from <= from && from < span.to)?.value
}
