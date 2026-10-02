import type { GanttScale, GanttTaskConfig, GanttTone } from './gantt-types.js'

/**
 * The pure half of `c2-gantt`: dates to day numbers, tasks to an ordered tree, a view range, ticks and link
 * paths. Nothing here reads the DOM, so the layout is the same on a server and in a browser.
 *
 * Every date becomes a **day number**: whole days since 1970-01-01, counted in UTC. All layout is integer
 * arithmetic on those, which is what keeps bars from shifting by a day across a daylight-saving change.
 */

const DAY_MS = 86_400_000

/** Day number of a `'YYYY-MM-DD'` string (anything after the date is ignored) or a `Date`'s local calendar day. */
export function toDay(value: unknown): number | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY_MS
  }
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const time = Date.UTC(year, month - 1, day)
  const date = new Date(time)
  // Date.UTC rolls 2026-02-30 over to March; a day that does not exist is not a date.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return time / DAY_MS
}

/** The UTC midnight of a day number, for formatting with `timeZone: 'UTC'`. */
export const fromDay = (day: number): Date => new Date(day * DAY_MS)

export const isoDay = (day: number): string => fromDay(day).toISOString().slice(0, 10)

/** ISO weekday of a day number: 1 is Monday, 7 is Sunday. */
export const isoWeekday = (day: number): number => ((fromDay(day).getUTCDay() + 6) % 7) + 1

/** One task after validation, in the order the chart draws it. */
export interface GanttRow {
  id: string
  label: string
  /** Day numbers, both inclusive. A milestone has `start === end`. */
  start: number
  end: number
  progress: number
  depth: number
  parentId: string | null
  dependencies: string[]
  milestone: boolean
  /** Has children; its span is theirs. */
  group: boolean
  tone?: GanttTone
  /** The task as it was given. */
  task: GanttTaskConfig
}

export interface GanttModel {
  /** Every valid task, depth-first: a group is followed by its children. */
  rows: GanttRow[]
  byId: Map<string, GanttRow>
  /** One line per task that was skipped or repaired, for a single console warning. */
  problems: string[]
}

const splitIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean)
  return []
}

/** Turns the author's tasks into the ordered, validated rows the chart lays out. Never throws. */
export function normalizeTasks(tasks: readonly GanttTaskConfig[] | null | undefined): GanttModel {
  const problems: string[] = []
  const entries = new Map<string, GanttTaskConfig>()
  ;(tasks ?? []).forEach((task, index) => {
    if (!task || typeof task !== 'object') {
      problems.push(`task ${index} is not an object`)
      return
    }
    const id = task.id === undefined || task.id === null || task.id === '' ? `task-${index}` : String(task.id)
    if (entries.has(id)) problems.push(`duplicate id "${id}"`)
    else entries.set(id, task)
  })

  // A parent that does not exist, or one that would make a cycle, is dropped and the task becomes a root.
  const parentOf = new Map<string, string | null>()
  for (const [id, task] of entries) {
    let parent = task.parent === undefined || task.parent === null || task.parent === '' ? null : String(task.parent)
    if (parent !== null && !entries.has(parent)) {
      problems.push(`"${id}" names a missing parent "${parent}"`)
      parent = null
    }
    parentOf.set(id, parent)
  }
  for (const id of entries.keys()) {
    const seen = new Set([id])
    let cursor = parentOf.get(id) ?? null
    while (cursor !== null) {
      if (seen.has(cursor)) {
        problems.push(`"${id}" is part of a parent cycle`)
        parentOf.set(id, null)
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor) ?? null
    }
  }
  const children = new Map<string | null, string[]>()
  for (const [id, parent] of parentOf) {
    const list = children.get(parent) ?? []
    list.push(id)
    children.set(parent, list)
  }

  const build = (id: string, depth: number): GanttRow[] => {
    const task = entries.get(id)!
    const descendants = (children.get(id) ?? []).flatMap((child) => build(child, depth + 1))
    const direct = descendants.filter((row) => row.depth === depth + 1)
    let start: number | null
    let end: number | null
    const milestone = task.milestone === true && direct.length === 0
    if (direct.length) {
      start = Math.min(...direct.map((row) => row.start))
      end = Math.max(...direct.map((row) => row.end))
    } else {
      start = toDay(task.start)
      end = milestone ? start : task.end === undefined || task.end === null || task.end === '' ? start : toDay(task.end)
      if (start === null) {
        problems.push(`"${id}" has no valid start date`)
        return []
      }
      if (end === null || end < start) {
        problems.push(`"${id}" has an end before its start or an invalid end date`)
        return []
      }
    }
    const progress = Number(task.progress)
    const row: GanttRow = {
      id,
      label: task.label === undefined || task.label === null ? id : String(task.label),
      start: start!,
      end: end!,
      progress: Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0,
      depth,
      parentId: depth === 0 ? null : (parentOf.get(id) ?? null),
      dependencies: [],
      milestone,
      group: direct.length > 0,
      tone: task.tone,
      task,
    }
    return [row, ...descendants]
  }

  const rows = (children.get(null) ?? []).flatMap((id) => build(id, 0))
  const byId = new Map(rows.map((row) => [row.id, row]))
  for (const row of rows) {
    for (const dependency of splitIds(row.task.dependencies)) {
      if (dependency === row.id) continue
      if (byId.has(dependency)) row.dependencies.push(dependency)
      else problems.push(`"${row.id}" depends on a missing task "${dependency}"`)
    }
  }
  return { rows, byId, problems }
}

/** The rows to draw: everything except the descendants of a collapsed group. */
export function visibleRows(rows: readonly GanttRow[], collapsed: ReadonlySet<string>): GanttRow[] {
  const visible: GanttRow[] = []
  let hiddenBelow = Infinity
  for (const row of rows) {
    if (row.depth > hiddenBelow) continue
    hiddenBelow = Infinity
    visible.push(row)
    if (row.group && collapsed.has(row.id)) hiddenBelow = row.depth
  }
  return visible
}

export interface GanttRange {
  start: number
  end: number
}

/**
 * The days the timeline spans. Without an explicit bound it is the tasks' extent snapped to the scale: back to
 * the first day of the week and forward to the end of the next one for day and week, whole months for month.
 */
export function viewRange(rows: readonly GanttRow[], scale: GanttScale, weekStart: number, start?: number | null, end?: number | null): GanttRange {
  const fallback = rows.length ? null : (start ?? end ?? toDay(new Date())!)
  let from = start ?? fallback ?? Math.min(...rows.map((row) => row.start))
  let to = end ?? fallback ?? Math.max(...rows.map((row) => row.end))
  if (scale === 'month') {
    const first = fromDay(from)
    const last = fromDay(to)
    if (start == null) from = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) / DAY_MS
    if (end == null) to = Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0) / DAY_MS
  } else {
    if (start == null) from -= (isoWeekday(from) - weekStart + 7) % 7
    if (end == null) to += 6 - ((isoWeekday(to) - weekStart + 7) % 7) + 7
  }
  return { start: from, end: Math.max(from, to) }
}

export interface GanttTick {
  /** First and last day number the tick covers, inclusive. */
  start: number
  end: number
  label: string
  /** A shorter label for a tick too narrow for `label`. */
  short: string
}

export interface GanttTicks {
  /** Months (day and week scales) or years (month scale). */
  major: GanttTick[]
  /** Days, weeks or months: one grid line each. */
  minor: GanttTick[]
  /** Day numbers to shade, on the day and week scales. */
  weekend: number[]
}

export interface GanttFormatters {
  monthYear: Intl.DateTimeFormat
  month: Intl.DateTimeFormat
  year: Intl.DateTimeFormat
  day: Intl.DateTimeFormat
  date: Intl.DateTimeFormat
}

export function createFormatters(locale: string): GanttFormatters {
  const make = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    } catch {
      return new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' })
    }
  }
  return {
    monthYear: make({ month: 'long', year: 'numeric' }),
    month: make({ month: 'short' }),
    year: make({ year: 'numeric' }),
    day: make({ day: 'numeric' }),
    date: make({ dateStyle: 'medium' }),
  }
}

export function scaleTicks(range: GanttRange, scale: GanttScale, weekStart: number, weekend: readonly number[], format: GanttFormatters): GanttTicks {
  const major: GanttTick[] = []
  const minor: GanttTick[] = []
  const shaded: number[] = []
  const weekendDays = new Set(weekend)
  for (let day = range.start; day <= range.end; day++) {
    const date = fromDay(day)
    const key = scale === 'month' ? date.getUTCFullYear() : date.getUTCFullYear() * 12 + date.getUTCMonth()
    const previous = major[major.length - 1]
    if (
      previous &&
      (scale === 'month' ? fromDay(previous.start).getUTCFullYear() : fromDay(previous.start).getUTCFullYear() * 12 + fromDay(previous.start).getUTCMonth()) ===
        key
    ) {
      previous.end = day
    } else {
      major.push(
        scale === 'month'
          ? { start: day, end: day, label: format.year.format(date), short: format.year.format(date) }
          : { start: day, end: day, label: format.monthYear.format(date), short: format.month.format(date) },
      )
    }
    const weekday = isoWeekday(day)
    if (scale !== 'month' && weekendDays.has(weekday)) shaded.push(day)
    if (scale === 'day') minor.push({ start: day, end: day, label: format.day.format(date), short: format.day.format(date) })
    else if (scale === 'week' && (weekday === weekStart || day === range.start)) {
      const last = Math.min(range.end, day + ((weekStart - weekday + 6) % 7))
      const label = `${format.day.format(date)}–${format.day.format(fromDay(last))}`
      minor.push({ start: day, end: last, label, short: format.day.format(date) })
    } else if (scale === 'month' && (date.getUTCDate() === 1 || day === range.start)) {
      const last = Math.min(range.end, Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0) / DAY_MS)
      minor.push({ start: day, end: last, label: format.month.format(date), short: format.month.format(date).slice(0, 1) })
    }
  }
  return { major, minor, weekend: shaded }
}

/**
 * The elbow path of a finish-to-start link, from the right end of the predecessor at `(x1, y1)` to the left end
 * of the successor at `(x2, y2)`. When the successor starts too close to (or before) the predecessor's end, the
 * path drops to the row boundary and doubles back, so it never crosses a bar.
 */
export function linkPath(x1: number, y1: number, x2: number, y2: number, rowHeight: number): string {
  const out = x1 + 8
  if (x2 - out >= 8) return `M${x1} ${y1}H${out}V${y2}H${x2}`
  const between = y2 > y1 ? y2 - rowHeight / 2 : y2 + rowHeight / 2
  return `M${x1} ${y1}H${out}V${between}H${x2 - 10}V${y2}H${x2}`
}

interface WeekInfo {
  firstDay?: number
  weekend?: number[]
}

/** The locale's first day of the week and weekend, both ISO (1 = Monday), or Monday and Saturday–Sunday. */
export function localeWeekInfo(locale: string): { firstDay: number; weekend: number[] } {
  try {
    const intlLocale = new Intl.Locale(locale) as unknown as { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo }
    // A method in current engines, a getter in the ones that shipped it first.
    const info = typeof intlLocale.getWeekInfo === 'function' ? intlLocale.getWeekInfo() : intlLocale.weekInfo
    if (info?.firstDay && info.firstDay >= 1 && info.firstDay <= 7) {
      return { firstDay: info.firstDay, weekend: Array.isArray(info.weekend) ? info.weekend : [6, 7] }
    }
  } catch {
    // An invalid language tag falls through to the default.
  }
  return { firstDay: 1, weekend: [6, 7] }
}

const WEEKDAY_NAMES: Record<string, number> = { monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7 }

/** `week-start`: `'locale'`, a weekday name or an ISO number from 1 (Monday) to 7 (Sunday). */
export function resolveWeekStart(value: string | number | null | undefined, locale: string): number {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
  if (WEEKDAY_NAMES[text]) return WEEKDAY_NAMES[text]
  const number = Number(text)
  if (text !== '' && Number.isInteger(number) && number >= 1 && number <= 7) return number
  return localeWeekInfo(locale).firstDay
}

/** `weekend`: ISO weekday numbers separated by spaces or commas; `''` shades nothing; absent follows the locale. */
export function resolveWeekend(value: string | null | undefined, locale: string): number[] {
  if (value === undefined || value === null) return localeWeekInfo(locale).weekend
  return value
    .split(/[\s,]+/)
    .map((part) => WEEKDAY_NAMES[part.toLowerCase()] ?? Number(part))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
}
