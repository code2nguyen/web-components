/** A unit of a duration: weeks, days, hours, minutes or seconds. */
export type DurationUnit = 'w' | 'd' | 'h' | 'm' | 's'

/** How a duration is written: `1h 30m`, `1 hour, 30 minutes` or `1:30`. */
export type DurationFormat = 'short' | 'long' | 'clock'

/** The calendar a duration is read and written in: how long a day and a week are. */
export interface DurationCalendar {
  /** Hours in a day, `d`. 24 by default; time tracking often uses 8. */
  dayHours?: number
  /** Days in a week, `w`. 7 by default; time tracking often uses 5. */
  weekDays?: number
}

export interface ParseDurationOptions extends DurationCalendar {
  /** The unit of a bare number such as `90`. Minutes by default. */
  unit?: DurationUnit
  /** More words for each unit, read on top of the English ones (`{ h: ['heure', 'heures'] }`). */
  words?: Partial<Record<DurationUnit, readonly string[]>>
}

export interface FormatDurationOptions extends DurationCalendar {
  /** `short` (`1h 30m`, the default), `long` (`1 hour, 30 minutes`) or `clock` (`1:30`). */
  format?: DurationFormat
  /** The largest unit written: with `h`, two days read `48h`. Days by default. Not used by `clock`. */
  largestUnit?: DurationUnit
  /** The smallest unit written; what is left below it is rounded. Seconds by default. */
  smallestUnit?: DurationUnit
  /** The language of the `long` format, a BCP 47 tag. The browser's by default. */
  locale?: string
}

/** Every unit, largest first. */
export const DURATION_UNITS: readonly DurationUnit[] = ['w', 'd', 'h', 'm', 's']

const ENGLISH_WORDS: Record<DurationUnit, readonly string[]> = {
  w: ['w', 'wk', 'wks', 'week', 'weeks'],
  d: ['d', 'day', 'days'],
  h: ['h', 'hr', 'hrs', 'hour', 'hours'],
  m: ['m', 'min', 'mins', 'minute', 'minutes'],
  s: ['s', 'sec', 'secs', 'second', 'seconds'],
}

const INTL_UNIT: Record<DurationUnit, string> = { w: 'week', d: 'day', h: 'hour', m: 'minute', s: 'second' }

/** The length of each unit in seconds, under a calendar. */
export function unitSeconds(unit: DurationUnit, calendar: DurationCalendar = {}): number {
  const day = positive(calendar.dayHours, 24) * 3600
  switch (unit) {
    case 'w':
      return positive(calendar.weekDays, 7) * day
    case 'd':
      return day
    case 'h':
      return 3600
    case 'm':
      return 60
    default:
      return 1
  }
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function unitIndex(unit: DurationUnit | undefined, fallback: DurationUnit): number {
  const index = DURATION_UNITS.indexOf(unit ?? fallback)
  return index >= 0 ? index : DURATION_UNITS.indexOf(fallback)
}

const NUMBER = String.raw`(?:\d+(?:\.\d*)?|\.\d+)`
const CLOCK = /^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/
const BARE = new RegExp(`^${NUMBER}$`)
const TOKEN = new RegExp(`(${NUMBER})\\s*([\\p{L}]+)?`, 'gu')

/**
 * Reads a duration typed by a person and returns it in seconds, or `null` when the text is empty or cannot be read.
 *
 * It reads units (`1h 30m`, `2 days 4 hours`, `1h30`, where a trailing number takes the unit after the one before it),
 * fractions with a decimal point or comma (`1.5h`, `1,5h`), a clock (`1:30`, `1:05:30`) and a bare number in `unit`.
 */
export function parseDuration(text: string, options: ParseDurationOptions = {}): number | null {
  const source = text
    .trim()
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2')
  if (!source) return null
  const clock = CLOCK.exec(source)
  if (clock) return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] ?? 0)
  if (BARE.test(source)) return Number(source) * unitSeconds(options.unit ?? 'm', options)

  const lookup = new Map<string, DurationUnit>()
  for (const unit of DURATION_UNITS) {
    for (const word of [...ENGLISH_WORDS[unit], ...(options.words?.[unit] ?? [])]) lookup.set(word.toLowerCase(), unit)
  }
  let total = 0
  let previous: DurationUnit | undefined
  let rest = source
  let found = false
  for (const match of source.matchAll(TOKEN)) {
    const amount = Number(match[1])
    const word = match[2]
    let unit: DurationUnit | undefined
    if (word) {
      unit = lookup.get(word)
      if (!unit) return null
    } else {
      // `1h30`: a number with no unit after one that had a unit takes the next smaller unit.
      const next = previous ? DURATION_UNITS[DURATION_UNITS.indexOf(previous) + 1] : undefined
      if (!next || match.index + match[0].length !== source.length) return null
      unit = next
    }
    if (!Number.isFinite(amount)) return null
    total += amount * unitSeconds(unit, options)
    previous = unit
    found = true
    rest = rest.replace(match[0], ' ')
  }
  // Whatever is left must only separate the parts: spaces, commas, "and", "+".
  if (!found || rest.replace(/\b(and|et|und|y|e)\b|[\s,+&]/g, '') !== '') return null
  return total
}

const numberFormats = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: string | undefined, unit: DurationUnit): Intl.NumberFormat {
  const key = `${locale ?? ''}|${unit}`
  let format = numberFormats.get(key)
  if (!format) {
    const options: Intl.NumberFormatOptions = { style: 'unit', unit: INTL_UNIT[unit], unitDisplay: 'long' }
    try {
      format = new Intl.NumberFormat(locale, options)
    } catch {
      format = new Intl.NumberFormat('en', options)
    }
    numberFormats.set(key, format)
  }
  return format
}

// `Intl.ListFormat` is ES2021, above the library's ES2020 typings; every engine the components support has it.
type ListFormatter = { format(items: string[]): string }
const ListFormat = (Intl as unknown as { ListFormat?: new (locale: string | undefined, options: { type: 'unit'; style: 'long' }) => ListFormatter }).ListFormat
const listFormats = new Map<string, ListFormatter | null>()

function joinUnits(items: string[], locale: string | undefined): string {
  const key = locale ?? ''
  if (!listFormats.has(key)) {
    let list: ListFormatter | null = null
    try {
      if (ListFormat) list = new ListFormat(locale, { type: 'unit', style: 'long' })
    } catch {
      // An invalid locale falls back to the plain join.
    }
    listFormats.set(key, list)
  }
  return listFormats.get(key)?.format(items) ?? items.join(', ')
}

/** The parts of a duration in the units from `largestUnit` down to `smallestUnit`, zeros dropped. */
export function durationParts(seconds: number, options: FormatDurationOptions = {}): { unit: DurationUnit; value: number }[] {
  const from = unitIndex(options.largestUnit, 'd')
  const to = Math.max(from, unitIndex(options.smallestUnit, 's'))
  const smallest = unitSeconds(DURATION_UNITS[to], options)
  let rest = Math.round(Math.max(0, seconds) / smallest) * smallest
  const parts: { unit: DurationUnit; value: number }[] = []
  for (let index = from; index <= to; index += 1) {
    const unit = DURATION_UNITS[index]
    const size = unitSeconds(unit, options)
    const value = index === to ? Math.round(rest / size) : Math.floor(rest / size)
    rest -= value * size
    if (value) parts.push({ unit, value })
  }
  return parts
}

/**
 * Writes a duration in seconds as `1h 30m` (`short`), `1 hour, 30 minutes` (`long`, in `locale`) or `1:30` (`clock`).
 * Zero reads `0m`, `0 minutes` or `0:00`.
 */
export function formatDuration(seconds: number, options: FormatDurationOptions = {}): string {
  const total = Number.isFinite(seconds) ? Math.max(0, seconds) : 0
  if (options.format === 'clock') {
    const showSeconds = unitIndex(options.smallestUnit, 's') >= 4 && Math.round(total) % 60 !== 0
    const rounded = showSeconds ? Math.round(total) : Math.round(total / 60) * 60
    const hours = Math.floor(rounded / 3600)
    const minutes = Math.floor((rounded % 3600) / 60)
    const pad = (value: number) => String(value).padStart(2, '0')
    return showSeconds ? `${hours}:${pad(minutes)}:${pad(rounded % 60)}` : `${hours}:${pad(minutes)}`
  }
  const parts = durationParts(total, options)
  if (!parts.length) {
    const zeroUnit = DURATION_UNITS[Math.min(Math.max(unitIndex(options.smallestUnit, 's'), unitIndex(options.largestUnit, 'd')), 3)]
    parts.push({ unit: zeroUnit, value: 0 })
  }
  if (options.format === 'long')
    return joinUnits(
      parts.map(({ unit, value }) => numberFormat(options.locale, unit).format(value)),
      options.locale,
    )
  return parts.map(({ unit, value }) => `${value}${unit}`).join(' ')
}
