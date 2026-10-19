/**
 * The model and the geometry of `c2-heatmap-chart`, free of the DOM and the engine so they can be tested as plain
 * functions.
 *
 * A heatmap is rows binned into cells by two keys, aggregated, and coloured by a scale. The calendar layouts are the
 * same model with the keys derived from a date: week × weekday, or one month grid per month.
 */
import { getFieldValue } from '@c2n/core/data-helper.js'

/** Where the cells go: two category axes, a year of week columns, or a grid per month. */
export type HeatmapLayout = 'grid' | 'calendar' | 'calendar-month'

/** A key derived from a date: the hour of the day, the day of the week, or the day, week, month, quarter or year. */
export type HeatmapBin = 'hour' | 'weekday' | 'day' | 'week' | 'month' | 'quarter' | 'year'

/** How the rows that share a cell are combined into its value. */
export type HeatmapAggregate = 'sum' | 'mean' | 'count' | 'min' | 'max' | 'first' | 'last'

/**
 * The order of one axis: `data` (first appearance), `natural` (numeric-aware, or time order for a binned key) or
 * `natural-desc`, `tenor`
 * (by maturity: ON, TN, 1W … 30Y), `value-asc` / `value-desc` (by the axis total), `x` (the rows mirror the columns),
 * or an explicit list of keys. Empty picks `natural` for a binned key and `data` otherwise.
 */
export type HeatmapOrder = string | readonly string[]

export type HeatmapWeekdays = 'all' | 'mon-fri'
export type HeatmapWeekStart = 'monday' | 'sunday'
export type HeatmapTimeZone = 'local' | 'utc'

/** One row or column of the grid. */
export interface HeatmapCategory {
  key: string
  label: string
  /** The narrow form of a weekday (`M`), for the month grids' column heads. */
  narrow?: string
  /** The row group the category belongs to, with `group-field`. */
  group?: string
}

/** A band of consecutive rows sharing a `group-field` value. `from` and `to` are row indices, both included. */
export interface HeatmapGroup {
  key: string
  label: string
  from: number
  to: number
}

/** One cell: the rows binned into it and their aggregate. A cell without rows has a `null` value and is drawn empty. */
export interface HeatmapCell {
  /** Column key: an x category, a week's first day on a calendar, a weekday in a month grid. */
  x: string
  /** Row key: a y category, or a weekday on a calendar. */
  y: string
  xIndex: number
  yIndex: number
  value: number | null
  /** How many rows were aggregated. */
  count: number
  /** Indices of those rows in `data`. */
  rows: number[]
  /** The day, as `YYYY-MM-DD`, on the calendar layouts. */
  date?: string
  /** The month grid the cell is drawn in, on `calendar-month`. */
  panel?: number
}

/** A label tied to a column (where a month starts on a calendar) or to a month grid (`calendar-month`). */
export interface HeatmapMark {
  key: string
  label: string
  index: number
}

export interface HeatmapModel {
  layout: HeatmapLayout
  xs: HeatmapCategory[]
  ys: HeatmapCategory[]
  groups: HeatmapGroup[]
  /** Every drawn position, row by row: cells with rows and empty ones. */
  cells: HeatmapCell[]
  /** Calendar: the columns months start in. Month grid: one entry per grid, `index` being the grid. */
  months: HeatmapMark[]
  /** Month grid: the number of week rows in each grid. */
  panelRows: number[]
  /** The aggregate of every row in each column and in each row, for the marginal bars and the value orders. */
  xTotals: (number | null)[]
  yTotals: (number | null)[]
  /** The values of the cells that have one. */
  values: number[]
}

export interface HeatmapModelOptions {
  layout: HeatmapLayout
  xField: string
  yField: string
  valueField: string
  dateField: string
  groupField: string
  xBin?: HeatmapBin | ''
  yBin?: HeatmapBin | ''
  xOrder?: HeatmapOrder
  yOrder?: HeatmapOrder
  groupOrder?: HeatmapOrder
  aggregate: HeatmapAggregate
  diagonal: 'show' | 'hide'
  /** The calendar span: `2026`, `2026-08/2026-10`, `2025-10-20/2026-10-19`. Defaults to the data's first and last day. */
  range?: string
  weekdays: HeatmapWeekdays
  weekStart: HeatmapWeekStart
  timeZone: HeatmapTimeZone
  locale?: string
}

// ------------------------------------------------------------------ dates ---

const DAY_MS = 86_400_000

/** A point in time read in the chart's time zone, and the calendar day it falls on as a day number. */
export interface HeatmapInstant {
  year: number
  /** 1–12. */
  month: number
  day: number
  hour: number
  /** Days since 1970-01-01 of the calendar day, whatever the time zone it was read in. */
  dayNumber: number
}

export function dayNumberOf(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS)
}

/** `YYYY-MM-DD` of a day number. */
export function isoDate(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

/** 0 for Sunday through 6 for Saturday. 1970-01-01, day 0, was a Thursday. */
function utcWeekday(dayNumber: number): number {
  return (((dayNumber + 4) % 7) + 7) % 7
}

/** Position of a day in its week, 0 being the week's first day. */
export function weekdayIndex(dayNumber: number, weekStart: HeatmapWeekStart): number {
  return (utcWeekday(dayNumber) - (weekStart === 'monday' ? 1 : 0) + 7) % 7
}

function partsOf(dayNumber: number): { year: number; month: number; day: number } {
  const date = new Date(dayNumber * DAY_MS)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/**
 * Reads a date field: a `Date`, epoch milliseconds, a `YYYY-MM-DD` day (taken as that day in any time zone) or any
 * string `Date.parse` accepts. A time is read in the local time zone, or in UTC with `timeZone: 'utc'`.
 */
export function parseInstant(value: unknown, timeZone: HeatmapTimeZone): HeatmapInstant | null {
  if (value instanceof Date) return fromTime(value.getTime(), timeZone)
  if (typeof value === 'number') return fromTime(value, timeZone)
  if (typeof value !== 'string') return null
  const text = value.trim()
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])]
    return { year, month, day: date, hour: 0, dayNumber: dayNumberOf(year, month, date) }
  }
  const time = Date.parse(text)
  return Number.isFinite(time) ? fromTime(time, timeZone) : null
}

function fromTime(time: number, timeZone: HeatmapTimeZone): HeatmapInstant | null {
  if (!Number.isFinite(time)) return null
  const date = new Date(time)
  const utc = timeZone === 'utc'
  const year = utc ? date.getUTCFullYear() : date.getFullYear()
  const month = (utc ? date.getUTCMonth() : date.getMonth()) + 1
  const day = utc ? date.getUTCDate() : date.getDate()
  const hour = utc ? date.getUTCHours() : date.getHours()
  return { year, month, day, hour, dayNumber: dayNumberOf(year, month, day) }
}

/**
 * A calendar span as day numbers, both included. Each end is a year, a month or a day; a lone value covers itself
 * (`2026` is the whole year). `undefined` for text that is none of those.
 */
export function parseRange(text: string): [number, number] | undefined {
  const ends = text.trim().split('/')
  if (ends.length > 2 || !ends[0]) return undefined
  const start = periodOf(ends[0])
  const end = periodOf(ends[1] ?? ends[0])
  if (!start || !end || end[1] < start[0]) return undefined
  return [start[0], end[1]]
}

/** The first and last day of `2026`, `2026-08` or `2026-08-14`. */
function periodOf(text: string): [number, number] | undefined {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text.trim())
  if (!match) return undefined
  const year = Number(match[1])
  if (match[3]) {
    const day = dayNumberOf(year, Number(match[2]), Number(match[3]))
    return [day, day]
  }
  if (match[2]) {
    const month = Number(match[2])
    return [dayNumberOf(year, month, 1), dayNumberOf(year, month + 1, 1) - 1]
  }
  return [dayNumberOf(year, 1, 1), dayNumberOf(year + 1, 1, 1) - 1]
}

// ------------------------------------------------------------------- bins ---

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** The weekday key of a position in the week: `mon` for 0 when weeks start on Monday. */
function weekdayKey(index: number, weekStart: HeatmapWeekStart): string {
  return WEEKDAY_KEYS[(index + (weekStart === 'monday' ? 1 : 0)) % 7]
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function format(locale: string | undefined, options: Intl.DateTimeFormatOptions, dayNumber: number): string {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
    } catch {
      formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone: 'UTC' })
    }
    formatters.set(key, formatter)
  }
  return formatter.format(new Date(dayNumber * DAY_MS))
}

/** A weekday as a category: key `mon`, label `Mon`, narrow `M`, in the chart's locale. */
function weekdayCategory(index: number, weekStart: HeatmapWeekStart, locale: string | undefined): HeatmapCategory {
  // 2024-01-01 was a Monday.
  const day = dayNumberOf(2024, 1, 1) + index - (weekStart === 'sunday' ? 1 : 0)
  return {
    key: weekdayKey(index, weekStart),
    label: format(locale, { weekday: 'short' }, day),
    narrow: format(locale, { weekday: 'narrow' }, day),
  }
}

/** The key, label and sort position of a date binned by `bin`. */
export function binOf(
  instant: HeatmapInstant,
  bin: HeatmapBin,
  weekStart: HeatmapWeekStart,
  locale?: string,
): { key: string; label: string; sort: number; narrow?: string } {
  const pad = (value: number) => String(value).padStart(2, '0')
  switch (bin) {
    case 'hour':
      return { key: pad(instant.hour), label: pad(instant.hour), sort: instant.hour }
    case 'weekday': {
      const index = weekdayIndex(instant.dayNumber, weekStart)
      return { ...weekdayCategory(index, weekStart, locale), sort: index }
    }
    case 'day':
      return { key: isoDate(instant.dayNumber), label: format(locale, { month: 'short', day: 'numeric' }, instant.dayNumber), sort: instant.dayNumber }
    case 'week': {
      const start = instant.dayNumber - weekdayIndex(instant.dayNumber, weekStart)
      return { key: isoDate(start), label: format(locale, { month: 'short', day: 'numeric' }, start), sort: start }
    }
    case 'month':
      return {
        key: `${instant.year}-${pad(instant.month)}`,
        label: format(locale, { month: 'short', year: '2-digit' }, dayNumberOf(instant.year, instant.month, 1)),
        sort: instant.year * 12 + instant.month,
      }
    case 'quarter': {
      const quarter = Math.ceil(instant.month / 3)
      return { key: `${instant.year}-Q${quarter}`, label: `Q${quarter} ${instant.year}`, sort: instant.year * 4 + quarter }
    }
    case 'year':
      return { key: String(instant.year), label: String(instant.year), sort: instant.year }
  }
}

// ---------------------------------------------------------------- tenors ---

const NAMED_TENORS: Record<string, number> = { ON: 1, 'O/N': 1, TN: 2, 'T/N': 2, SPOT: 2.5, SP: 2.5, SN: 3, 'S/N': 3 }
const TENOR_UNITS: Record<string, number> = { D: 1, W: 7, M: 365.25 / 12, Y: 365.25 }

/**
 * The length of a tenor in days, for sorting: `ON` 1, `1W` 7, `3M` ≈ 91, `10Y` ≈ 3652, `1Y6M` ≈ 548. `undefined` for
 * text that is not a tenor.
 */
export function tenorDays(text: string): number | undefined {
  const tenor = text.trim().toUpperCase()
  if (tenor in NAMED_TENORS) return NAMED_TENORS[tenor]
  if (!/^(\d+(\.\d+)?[DWMY])+$/.test(tenor)) return undefined
  let days = 0
  for (const [, amount, , unit] of tenor.matchAll(/(\d+(\.\d+)?)([DWMY])/g)) days += Number(amount) * TENOR_UNITS[unit]
  return days
}

// ----------------------------------------------------------- aggregation ---

class Accumulator {
  count = 0
  rows: number[] = []
  #sum = 0
  #numbers = 0
  #min = Infinity
  #max = -Infinity
  #first: number | null = null
  #last: number | null = null
  #values: (number | null)[] = []

  add(value: number | null, row: number): void {
    this.count += 1
    this.rows.push(row)
    this.#values.push(value)
    if (value === null) return
    this.#sum += value
    this.#numbers += 1
    if (value < this.#min) this.#min = value
    if (value > this.#max) this.#max = value
    if (this.#first === null) this.#first = value
    this.#last = value
  }

  /** Adds every row of `other`, so a total over several cells aggregates their rows rather than their results. */
  addAll(other: Accumulator): void {
    other.rows.forEach((row, index) => this.add(other.#values[index], row))
  }

  result(aggregate: HeatmapAggregate): number | null {
    if (aggregate === 'count') return this.count
    if (this.#numbers === 0) return null
    switch (aggregate) {
      case 'sum':
        return this.#sum
      case 'mean':
        return this.#sum / this.#numbers
      case 'min':
        return this.#min
      case 'max':
        return this.#max
      case 'first':
        return this.#first
      case 'last':
        return this.#last
    }
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

// --------------------------------------------------------------- ordering ---

interface Collected extends HeatmapCategory {
  /** Time order of a binned key. */
  sort?: number
  /** First row the key appeared in. */
  seen: number
}

const compareText = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Orders the categories of one axis. `totals` holds each key's aggregate, for the value orders. */
export function orderCategories<T extends HeatmapCategory & { sort?: number; seen?: number }>(
  categories: readonly T[],
  order: HeatmapOrder | undefined,
  totals: ReadonlyMap<string, number | null>,
  mirror?: readonly string[],
): HeatmapCategory[] {
  const list = [...categories].sort((a, b) => (a.seen ?? 0) - (b.seen ?? 0))
  const binned = list.some((item) => item.sort !== undefined)
  const spec = Array.isArray(order) ? order : String(order ?? '').trim() || (binned ? 'natural' : 'data')
  const strip = ({ key, label, narrow, group }: T): HeatmapCategory => ({
    key,
    label,
    ...(narrow ? { narrow } : {}),
    ...(group !== undefined ? { group } : {}),
  })

  if (Array.isArray(spec)) {
    const byKey = new Map(list.map((item) => [item.key, item]))
    const listed = (spec as readonly unknown[]).map(String)
    const named = new Set(listed)
    // Listed keys first, in the given order, even those without rows; the rest keep their data order after them.
    return [
      ...listed.filter((key, index) => listed.indexOf(key) === index).map((key) => (byKey.get(key) ? strip(byKey.get(key) as T) : { key, label: key })),
      ...list.filter((item) => !named.has(item.key)).map(strip),
    ]
  }
  if (spec === 'x' && mirror) {
    const position = new Map(mirror.map((key, index) => [key, index]))
    return list
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (position.get(a.item.key) ?? mirror.length + a.index) - (position.get(b.item.key) ?? mirror.length + b.index))
      .map(({ item }) => strip(item))
  }
  if (spec === 'natural' || spec === 'natural-desc') {
    const sign = spec === 'natural' ? 1 : -1
    return list.sort((a, b) => sign * (a.sort !== undefined && b.sort !== undefined ? a.sort - b.sort : compareText(a.key, b.key))).map(strip)
  }
  if (spec === 'tenor') {
    // A key that is not a tenor keeps its data order, after the tenors.
    return list
      .map((item, index) => ({ item, index, days: tenorDays(item.key) }))
      .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity) || a.index - b.index)
      .map(({ item }) => strip(item))
  }
  if (spec === 'value-asc' || spec === 'value-desc') {
    const sign = spec === 'value-asc' ? 1 : -1
    return list
      .map((item, index) => ({ item, index, total: totals.get(item.key) ?? null }))
      .sort((a, b) => {
        if (a.total === null || b.total === null) return (a.total === null ? 1 : 0) - (b.total === null ? 1 : 0) || a.index - b.index
        return sign * (a.total - b.total) || a.index - b.index
      })
      .map(({ item }) => strip(item))
  }
  return list.map(strip)
}

// ------------------------------------------------------------------ model ---

const EMPTY_MODEL = (layout: HeatmapLayout): HeatmapModel => ({
  layout,
  xs: [],
  ys: [],
  groups: [],
  cells: [],
  months: [],
  panelRows: [],
  xTotals: [],
  yTotals: [],
  values: [],
})

/** Builds the cells of any layout from row objects. Rows that are not objects, or lack a key, are skipped. */
export function buildHeatmapModel(rows: readonly unknown[], options: HeatmapModelOptions): HeatmapModel {
  return options.layout === 'grid' ? buildGrid(rows, options) : buildCalendar(rows, options)
}

function isRecord(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null && !Array.isArray(row)
}

function valueOf(row: Record<string, unknown>, options: HeatmapModelOptions): number | null {
  return options.valueField ? toNumber(getFieldValue(row, options.valueField)) : null
}

function buildGrid(rows: readonly unknown[], options: HeatmapModelOptions): HeatmapModel {
  const xs = new Map<string, Collected>()
  const ys = new Map<string, Collected>()
  const cells = new Map<string, Accumulator>()
  const xAcc = new Map<string, Accumulator>()
  const yAcc = new Map<string, Accumulator>()
  const groups = new Map<string, number>()

  const keyOf = (raw: unknown, bin: HeatmapBin | '' | undefined): Omit<Collected, 'seen'> | null => {
    if (bin) {
      const instant = parseInstant(raw, options.timeZone)
      return instant ? binOf(instant, bin, options.weekStart, options.locale) : null
    }
    if (raw === null || raw === undefined || raw === '') return null
    return { key: String(raw), label: String(raw) }
  }
  const add = (map: Map<string, Accumulator>, key: string, value: number | null, row: number) => {
    let accumulator = map.get(key)
    if (!accumulator) map.set(key, (accumulator = new Accumulator()))
    accumulator.add(value, row)
  }

  rows.forEach((row, index) => {
    if (!isRecord(row)) return
    const x = keyOf(getFieldValue(row, options.xField), options.xBin)
    const y = keyOf(getFieldValue(row, options.yField), options.yBin)
    if (!x || !y) return
    if (!xs.has(x.key)) xs.set(x.key, { ...x, seen: index })
    if (!ys.has(y.key)) {
      const group = options.groupField ? getFieldValue(row, options.groupField) : undefined
      const groupKey = group === null || group === undefined ? '' : String(group)
      if (options.groupField && !groups.has(groupKey)) groups.set(groupKey, index)
      ys.set(y.key, { ...y, seen: index, ...(options.groupField ? { group: groupKey } : {}) })
    }
    const value = valueOf(row, options)
    add(cells, `${x.key}\u0000${y.key}`, value, index)
    add(xAcc, x.key, value, index)
    add(yAcc, y.key, value, index)
  })

  const totals = (map: Map<string, Accumulator>) => new Map([...map].map(([key, accumulator]) => [key, accumulator.result(options.aggregate)]))
  const xTotalsByKey = totals(xAcc)
  const yTotalsByKey = totals(yAcc)
  const xOrdered = orderCategories([...xs.values()], options.xOrder, xTotalsByKey)
  let yOrdered = orderCategories(
    [...ys.values()],
    options.yOrder,
    yTotalsByKey,
    xOrdered.map((item) => item.key),
  )

  // Rows are banded by group: the groups in their own order, the rows keeping theirs inside each band.
  const bands: HeatmapGroup[] = []
  if (options.groupField) {
    const groupOrder = orderCategories(
      [...groups].map(([key, seen]) => ({ key, label: key, seen })),
      options.groupOrder,
      new Map(),
    ).map((item) => item.key)
    // A listed group with no rows has nothing to band.
    const present = groupOrder.filter((key) => groups.has(key))
    yOrdered = present.flatMap((key) => yOrdered.filter((item) => (item.group ?? '') === key))
    let from = 0
    for (const key of present) {
      const size = yOrdered.filter((item) => (item.group ?? '') === key).length
      if (size > 0) bands.push({ key, label: key, from, to: from + size - 1 })
      from += size
    }
  }

  const out: HeatmapCell[] = []
  const values: number[] = []
  yOrdered.forEach((y, yIndex) => {
    xOrdered.forEach((x, xIndex) => {
      if (options.diagonal === 'hide' && x.key === y.key) return
      const accumulator = cells.get(`${x.key}\u0000${y.key}`)
      const value = accumulator ? accumulator.result(options.aggregate) : null
      if (value !== null) values.push(value)
      out.push({ x: x.key, y: y.key, xIndex, yIndex, value, count: accumulator?.count ?? 0, rows: accumulator?.rows ?? [] })
    })
  })

  return {
    ...EMPTY_MODEL('grid'),
    xs: xOrdered,
    ys: yOrdered,
    groups: bands,
    cells: out,
    xTotals: xOrdered.map((item) => xTotalsByKey.get(item.key) ?? null),
    yTotals: yOrdered.map((item) => yTotalsByKey.get(item.key) ?? null),
    values,
  }
}

function buildCalendar(rows: readonly unknown[], options: HeatmapModelOptions): HeatmapModel {
  const days = new Map<number, Accumulator>()
  let first = Infinity
  let last = -Infinity
  rows.forEach((row, index) => {
    if (!isRecord(row)) return
    const instant = parseInstant(getFieldValue(row, options.dateField), options.timeZone)
    if (!instant) return
    let accumulator = days.get(instant.dayNumber)
    if (!accumulator) days.set(instant.dayNumber, (accumulator = new Accumulator()))
    accumulator.add(valueOf(row, options), index)
    first = Math.min(first, instant.dayNumber)
    last = Math.max(last, instant.dayNumber)
  })
  const span = (options.range && parseRange(options.range)) || (first <= last ? ([first, last] as [number, number]) : undefined)
  if (!span) return EMPTY_MODEL(options.layout)
  const [start, end] = span
  const { weekStart, locale } = options
  // The weekday positions drawn, in week order: all seven, or Monday to Friday wherever the week starts.
  const kept = Array.from({ length: 7 }, (_, index) => index).filter((index) => {
    if (options.weekdays === 'all') return true
    const weekday = (index + (weekStart === 'monday' ? 1 : 0)) % 7
    return weekday >= 1 && weekday <= 5
  })
  const position = new Map(kept.map((index, row) => [index, row]))
  const weekdays = kept.map((index) => weekdayCategory(index, weekStart, locale))
  return options.layout === 'calendar'
    ? calendarYear(days, start, end, position, weekdays, options)
    : calendarMonths(days, start, end, position, weekdays, options)
}

function calendarYear(
  days: Map<number, Accumulator>,
  start: number,
  end: number,
  position: Map<number, number>,
  weekdays: HeatmapCategory[],
  options: HeatmapModelOptions,
): HeatmapModel {
  const { weekStart, locale, aggregate } = options
  const base = start - weekdayIndex(start, weekStart)
  const weeks = Math.floor((end - base) / 7) + 1
  const xs: HeatmapCategory[] = Array.from({ length: weeks }, (_, index) => {
    const day = base + index * 7
    return { key: isoDate(day), label: format(locale, { month: 'short', day: 'numeric' }, day) }
  })
  const cells: HeatmapCell[] = []
  const values: number[] = []
  const xAcc = Array.from({ length: weeks }, () => new Accumulator())
  const yAcc = weekdays.map(() => new Accumulator())
  for (let day = start; day <= end; day += 1) {
    const row = position.get(weekdayIndex(day, weekStart))
    if (row === undefined) continue
    const xIndex = Math.floor((day - base) / 7)
    const accumulator = days.get(day)
    const value = accumulator ? accumulator.result(aggregate) : null
    if (value !== null) values.push(value)
    cells.push({
      x: xs[xIndex].key,
      y: weekdays[row].key,
      xIndex,
      yIndex: row,
      value,
      count: accumulator?.count ?? 0,
      rows: accumulator?.rows ?? [],
      date: isoDate(day),
    })
    if (accumulator) {
      // The totals aggregate the rows themselves, so a mean stays a mean of rows rather than of days.
      xAcc[xIndex].addAll(accumulator)
      yAcc[row].addAll(accumulator)
    }
  }
  // The column each month starts in, the first one included even when the span starts mid-month.
  const months: HeatmapMark[] = []
  let { year, month } = partsOf(start)
  for (;;) {
    const firstDay = Math.max(start, dayNumberOf(year, month, 1))
    if (firstDay > end) break
    months.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      label: format(locale, { month: 'short' }, firstDay),
      index: Math.floor((firstDay - base) / 7),
    })
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return {
    ...EMPTY_MODEL('calendar'),
    xs,
    ys: weekdays,
    cells,
    months,
    xTotals: xAcc.map((item) => item.result(aggregate)),
    yTotals: yAcc.map((item) => item.result(aggregate)),
    values,
  }
}

function calendarMonths(
  days: Map<number, Accumulator>,
  start: number,
  end: number,
  position: Map<number, number>,
  weekdays: HeatmapCategory[],
  options: HeatmapModelOptions,
): HeatmapModel {
  const { weekStart, locale, aggregate } = options
  const cells: HeatmapCell[] = []
  const values: number[] = []
  const months: HeatmapMark[] = []
  const panelRows: number[] = []
  let { year, month } = partsOf(start)
  for (;;) {
    const monthStart = dayNumberOf(year, month, 1)
    if (monthStart > end) break
    const monthEnd = dayNumberOf(year, month + 1, 1) - 1
    const panel = months.length
    months.push({ key: `${year}-${String(month).padStart(2, '0')}`, label: format(locale, { month: 'short', year: 'numeric' }, monthStart), index: panel })
    const weekBase = monthStart - weekdayIndex(monthStart, weekStart)
    const placed: { day: number; week: number; column: number }[] = []
    for (let day = Math.max(start, monthStart); day <= Math.min(end, monthEnd); day += 1) {
      const column = position.get(weekdayIndex(day, weekStart))
      if (column !== undefined) placed.push({ day, week: Math.floor((day - weekBase) / 7), column })
    }
    // A week whose only days were dropped (a month starting on a Saturday, Monday to Friday) takes no row.
    const firstWeek = Math.min(...placed.map((item) => item.week))
    for (const { day, week, column } of placed) {
      const accumulator = days.get(day)
      const value = accumulator ? accumulator.result(aggregate) : null
      if (value !== null) values.push(value)
      cells.push({
        x: weekdays[column].key,
        y: String(week - firstWeek),
        xIndex: column,
        yIndex: week - firstWeek,
        value,
        count: accumulator?.count ?? 0,
        rows: accumulator?.rows ?? [],
        date: isoDate(day),
        panel,
      })
    }
    panelRows.push(placed.length > 0 ? Math.max(...placed.map((item) => item.week)) - firstWeek + 1 : 0)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return { ...EMPTY_MODEL('calendar-month'), xs: weekdays, cells, months, panelRows, values }
}

// --------------------------------------------------------------- geometry ---

/** What the geometry needs from the page: text widths and the sizes the CSS variables set. */
export interface HeatmapMetrics {
  /** Width of `text` at the axis font. */
  measure(text: string): number
  fontSize: number
  /** Space between two cells. */
  gap: number
  /** Largest side of a calendar cell, so a short span is not drawn with huge squares. */
  maxCellSize: number
  /** Depth of the marginal bars' band. */
  marginalSize: number
  /** Space between two row groups. */
  groupGap: number
  marginals: 'none' | 'top' | 'end' | 'both'
}

export interface HeatmapRect {
  x: number
  y: number
  width: number
  height: number
}

/** A label the chart draws around the cells. `index` is the column, row, group or month grid it names. */
export interface HeatmapText {
  text: string
  x: number
  y: number
  align: 'left' | 'center' | 'right'
  baseline: 'top' | 'middle' | 'bottom'
  role: 'x' | 'y' | 'group' | 'month' | 'panel' | 'weekday'
  index: number
}

/** One marginal bar: the total of a column (`axis: 'x'`) or of a row (`axis: 'y'`). */
export interface HeatmapBar extends HeatmapRect {
  axis: 'x' | 'y'
  index: number
  value: number
}

export interface HeatmapGeometry {
  /** One rectangle per model cell, in model order. */
  cells: HeatmapRect[]
  texts: HeatmapText[]
  bars: HeatmapBar[]
  /** The rule beside each row group. */
  rules: { x1: number; y1: number; x2: number; y2: number }[]
  /** Whether the month grids have room for day numbers. */
  dayNumbers: boolean
}

const EMPTY_GEOMETRY: HeatmapGeometry = { cells: [], texts: [], bars: [], rules: [], dayNumbers: false }

/** Places every cell and label of `model` in a `width` × `height` box. */
export function layoutHeatmap(model: HeatmapModel, width: number, height: number, metrics: HeatmapMetrics): HeatmapGeometry {
  if (model.cells.length === 0 || width <= 0 || height <= 0) return EMPTY_GEOMETRY
  if (model.layout === 'calendar-month') return layoutMonths(model, width, height, metrics)
  return layoutAxes(model, width, height, metrics)
}

/** Marginal bars along the top (one per column) or the end (one per row), drawn from a baseline in `band`. */
function marginalBars(
  totals: readonly (number | null)[],
  axis: 'x' | 'y',
  cellAt: (index: number) => { start: number; size: number },
  band: { from: number; to: number },
): HeatmapBar[] {
  const finite = totals.filter((value): value is number => value !== null && Number.isFinite(value))
  const reach = Math.max(0, ...finite.map(Math.abs))
  if (reach === 0) return []
  // Totals of both signs grow from the middle of the band; all-positive ones from its inner edge.
  const signed = finite.some((value) => value < 0)
  const depth = band.to - band.from
  const bars: HeatmapBar[] = []
  totals.forEach((value, index) => {
    if (value === null || !Number.isFinite(value) || value === 0) return
    const { start, size } = cellAt(index)
    const length = Math.max(1, (Math.abs(value) / reach) * (signed ? depth / 2 : depth))
    const thickness = Math.max(1, size * 0.7)
    const across = start + (size - thickness) / 2
    // The inner edge is the one facing the cells: the bottom of the top band, the start of the end band.
    const base = signed ? band.from + depth / 2 : axis === 'x' ? band.to : band.from
    const outward = value >= 0 || !signed
    if (axis === 'x') bars.push({ axis, index, value, x: across, width: thickness, y: outward ? base - length : base, height: length })
    else bars.push({ axis, index, value, y: across, height: thickness, x: outward ? base : base - length, width: length })
  })
  return bars
}

function layoutAxes(model: HeatmapModel, width: number, height: number, metrics: HeatmapMetrics): HeatmapGeometry {
  const { fontSize, gap } = metrics
  const calendar = model.layout === 'calendar'
  const top = metrics.marginals === 'top' || metrics.marginals === 'both' ? metrics.marginalSize : 0
  const end = metrics.marginals === 'end' || metrics.marginals === 'both' ? metrics.marginalSize : 0
  const groupWidth = model.groups.length > 0 ? Math.max(...model.groups.map((group) => metrics.measure(group.label))) + 14 : 0
  const labelWidth = model.ys.length > 0 ? Math.max(...model.ys.map((item) => metrics.measure(item.label))) + 8 : 0
  const left = groupWidth + labelWidth
  const head = fontSize + 8
  const columns = model.xs.length
  const rows = model.ys.length
  const gaps = Math.max(0, model.groups.length - 1) * metrics.groupGap
  let cellWidth = (width - left - end - gap * (columns - 1)) / columns
  let cellHeight = (height - top - head - gaps - gap * (rows - 1)) / rows
  // A calendar keeps square cells, no larger than the variable allows.
  if (calendar) cellWidth = cellHeight = Math.min(cellWidth, cellHeight, metrics.maxCellSize)
  cellWidth = Math.max(1, cellWidth)
  cellHeight = Math.max(1, cellHeight)

  const groupStart = new Set(model.groups.map((group) => group.from))
  const ys: number[] = []
  let y = top + head
  for (let row = 0; row < rows; row += 1) {
    if (row > 0 && groupStart.has(row)) y += metrics.groupGap
    ys.push(y)
    y += cellHeight + gap
  }
  const xAt = (column: number) => left + column * (cellWidth + gap)
  const cells = model.cells.map((cell) => ({ x: xAt(cell.xIndex), y: ys[cell.yIndex], width: cellWidth, height: cellHeight }))
  const texts: HeatmapText[] = []

  if (calendar) {
    // Month names above the column each month starts in, skipped where the previous name would run into it.
    let free = -Infinity
    for (const month of model.months) {
      const x = xAt(month.index)
      const textWidth = metrics.measure(month.label)
      if (x < free || x + textWidth > width) continue
      texts.push({ text: month.label, x, y: top + head - 6, align: 'left', baseline: 'bottom', role: 'month', index: month.index })
      free = x + textWidth + 6
    }
  } else {
    // Every column is labelled when the labels fit; otherwise every second, third… one.
    const widest = Math.max(...model.xs.map((item) => metrics.measure(item.label)))
    const step = Math.max(1, Math.ceil((widest + 6) / (cellWidth + gap)))
    model.xs.forEach((item, column) => {
      if (column % step !== 0) return
      texts.push({ text: item.label, x: xAt(column) + cellWidth / 2, y: top + head - 6, align: 'center', baseline: 'bottom', role: 'x', index: column })
    })
  }
  // Row labels likewise: all of them when a line of text fits each row, else every second one (Mon, Wed, Fri).
  const rowStep = Math.max(1, Math.ceil((fontSize + 2) / (cellHeight + gap)))
  model.ys.forEach((item, row) => {
    const band = model.groups.find((group) => row >= group.from && row <= group.to)
    if ((row - (band?.from ?? 0)) % rowStep !== 0) return
    texts.push({ text: item.label, x: left - 6, y: ys[row] + cellHeight / 2, align: 'right', baseline: 'middle', role: 'y', index: row })
  })
  const rules: HeatmapGeometry['rules'] = []
  model.groups.forEach((group, index) => {
    const y1 = ys[group.from]
    const y2 = ys[group.to] + cellHeight
    rules.push({ x1: 2, y1, x2: 2, y2 })
    texts.push({ text: group.label, x: 10, y: y1, align: 'left', baseline: 'top', role: 'group', index })
  })

  const gridRight = xAt(columns - 1) + cellWidth
  const bars = [
    ...(top > 0 ? marginalBars(model.xTotals, 'x', (column) => ({ start: xAt(column), size: cellWidth }), { from: 2, to: top - 4 }) : []),
    ...(end > 0 ? marginalBars(model.yTotals, 'y', (row) => ({ start: ys[row], size: cellHeight }), { from: gridRight + 6, to: gridRight + end - 2 }) : []),
  ]
  return { cells, texts, bars, rules, dayNumbers: false }
}

function layoutMonths(model: HeatmapModel, width: number, height: number, metrics: HeatmapMetrics): HeatmapGeometry {
  const { fontSize, gap } = metrics
  const columns = Math.max(1, model.xs.length)
  const rows = Math.max(1, ...model.panelRows)
  const panels = model.months.length
  const head = fontSize + 8 + fontSize + 6
  const panelGap = Math.max(16, fontSize * 2)
  // The number of grids side by side that gives the largest cells.
  let best = { across: 1, cellWidth: 0, cellHeight: 0 }
  for (let across = 1; across <= panels; across += 1) {
    const down = Math.ceil(panels / across)
    const cellWidth = ((width - (across - 1) * panelGap) / across - gap * (columns - 1)) / columns
    const cellHeight = ((height - down * head - (down - 1) * panelGap) / down - gap * (rows - 1)) / rows
    if (Math.min(cellWidth, cellHeight) > Math.min(best.cellWidth, best.cellHeight)) best = { across, cellWidth, cellHeight }
  }
  const cellWidth = Math.max(1, Math.min(best.cellWidth, metrics.maxCellSize * 2))
  const cellHeight = Math.max(1, Math.min(best.cellHeight, cellWidth))
  const panelWidth = columns * (cellWidth + gap) - gap
  const panelHeight = head + rows * (cellHeight + gap) - gap
  const origin = (panel: number) => ({ x: (panel % best.across) * (panelWidth + panelGap), y: Math.floor(panel / best.across) * (panelHeight + panelGap) })

  const texts: HeatmapText[] = []
  model.months.forEach((month, panel) => {
    const { x, y } = origin(panel)
    texts.push({ text: month.label, x, y, align: 'left', baseline: 'top', role: 'panel', index: panel })
    model.xs.forEach((day, column) => {
      texts.push({
        text: day.narrow ?? day.label,
        x: x + column * (cellWidth + gap) + cellWidth / 2,
        y: y + head - 6,
        align: 'center',
        baseline: 'bottom',
        role: 'weekday',
        index: column,
      })
    })
  })
  const cells = model.cells.map((cell) => {
    const { x, y } = origin(cell.panel ?? 0)
    return { x: x + cell.xIndex * (cellWidth + gap), y: y + head + cell.yIndex * (cellHeight + gap), width: cellWidth, height: cellHeight }
  })
  return { cells, texts, bars: [], rules: [], dayNumbers: cellHeight >= fontSize * 1.4 + 4 && cellWidth >= fontSize * 1.6 }
}

// ----------------------------------------------------------------- legend ---

/**
 * Round tick values across `[min, max]`: the finest step of 1, 2 or 5 times a power of ten that gives at most
 * `target + 2` ticks, so `0` is a tick whenever it is in range.
 */
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!(max > min)) return Number.isFinite(min) ? [min] : []
  const power = 10 ** Math.floor(Math.log10((max - min) / target))
  const count = (step: number) => Math.floor(max / step + 1e-9) - Math.ceil(min / step - 1e-9) + 1
  const step = [1, 2, 5, 10, 20].map((multiple) => multiple * power).find((candidate) => count(candidate) <= target + 2) ?? 20 * power
  const ticks: number[] = []
  for (let index = Math.ceil(min / step - 1e-9); index * step <= max + step * 1e-9; index += 1) {
    // Rounded to the step's precision, so 0.1 * 3 reads 0.3.
    ticks.push(Number((index * step).toPrecision(12)))
  }
  return ticks
}

/** One band of the legend: a class of a stepped scale, or a slice of a continuous one. Open ends are infinite. */
export interface HeatmapLegendBin {
  from: number
  to: number
  color: string
  count: number
  /** Sum of the values in the band. */
  sum: number
}

/** The band a value falls in: the last band whose start it reaches, so a break value counts in the upper class. */
export function legendBinIndex(bins: readonly Pick<HeatmapLegendBin, 'from' | 'to'>[], value: number): number {
  for (let index = bins.length - 1; index > 0; index -= 1) if (value >= bins[index].from) return index
  return 0
}

/** Counts `values` into `bins`. A value past either end counts in the end band. */
export function fillLegendBins(bins: Omit<HeatmapLegendBin, 'count' | 'sum'>[], values: readonly number[]): HeatmapLegendBin[] {
  const filled = bins.map((bin) => ({ ...bin, count: 0, sum: 0 }))
  for (const value of values) {
    const bin = filled[legendBinIndex(filled, value)]
    if (!bin) continue
    bin.count += 1
    bin.sum += value
  }
  return filled
}

/** Whether a value is inside a `[from, to)` filter. `null` leaves that end open. */
export function inRange(value: number, range: readonly (number | null)[]): boolean {
  const [from, to] = range
  return (from === null || from === undefined || value >= from) && (to === null || to === undefined || value < to)
}
