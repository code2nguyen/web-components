import { formatMessage, type MessageArgs } from '@c2n/core/localize.js'
import { recurrenceEditorMessages as catalog } from './messages.js'
import { WEEKDAYS, type RecurrenceRule, type WallClock, type Weekday } from './recurrence.js'

const WORKWEEK: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR']

/** A safe `Intl` formatter: an unknown locale falls back to English instead of throwing. */
function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options })
  } catch {
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', ...options })
  }
}

const utc = (year: number, month: number, day: number, hour = 0, minute = 0) => new Date(Date.UTC(year, month - 1, day, hour, minute))

/** The name of a weekday in `locale` (`Tuesday`), or its short name with `width: 'short'`. */
export function weekdayName(day: Weekday, locale: string, width: 'long' | 'short' | 'narrow' = 'long'): string {
  // 2024-01-01 was a Monday.
  return dateFormat(locale, { weekday: width }).format(utc(2024, 1, 1 + WEEKDAYS.indexOf(day)))
}

/** The name of a month, 1 to 12, in `locale`. */
export function monthName(month: number, locale: string): string {
  return dateFormat(locale, { month: 'long' }).format(utc(2024, month, 1))
}

/** A time of day in `locale` (`09:00`, `9:00 AM`). */
export function timeText(hour: number, minute: number, locale: string): string {
  return dateFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(utc(2024, 1, 1, hour, minute))
}

/** A wall-clock date in `locale` (`Wed, 12 Nov 2026`), with its time when `withTime`. */
export function occurrenceText(clock: WallClock, locale: string, withTime: boolean): string {
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
  if (withTime) Object.assign(options, { hour: 'numeric', minute: '2-digit' })
  return dateFormat(locale, options).format(utc(clock.year, clock.month, clock.day, clock.hour, clock.minute))
}

// `Intl.ListFormat` is ES2021, above the library's ES2020 typings; every engine the components support has it.
const ListFormat = (Intl as unknown as { ListFormat?: new (locale: string, options: { type: 'conjunction' }) => { format(items: string[]): string } })
  .ListFormat

function listText(items: string[], locale: string): string {
  try {
    if (ListFormat) return new ListFormat(locale, { type: 'conjunction' }).format(items)
  } catch {
    // An unknown locale: fall through.
  }
  return items.join(', ')
}

export interface DescribeOptions {
  /** The language of the sentence, `en` by default. Translations come from the `recurrence-editor` messages. */
  locale?: string
  /** The time of day the rule repeats at when it names no `hour` (from DTSTART). Not said when absent. */
  time?: { hour: number; minute: number }
}

/**
 * A rule as one sentence: "Every 2 weeks on Monday and Wednesday, 10 times". `null` reads "Does not repeat". Parts
 * kept in `extra` are not described.
 */
export function describeRecurrence(rule: RecurrenceRule | null, options: DescribeOptions = {}): string {
  const locale = options.locale ?? 'en'
  const t = <K extends keyof typeof catalog.en & string>(key: K, ...args: MessageArgs<(typeof catalog.en)[K]>) => formatMessage(catalog, locale, key, ...args)
  if (!rule) return t('summaryNone')
  const parts: string[] = []
  const n = rule.interval
  const workweek = rule.freq === 'weekly' && n === 1 && rule.byDay?.length === 5 && WORKWEEK.every((day) => rule.byDay!.includes(day))
  switch (rule.freq) {
    case 'minutely':
      parts.push(t('summaryMinutely', n))
      break
    case 'hourly':
      parts.push(t('summaryHourly', n))
      break
    case 'daily':
      parts.push(t('summaryDaily', n))
      break
    case 'weekly':
      parts.push(workweek ? t('summaryWeekdays') : t('summaryWeekly', n))
      break
    case 'monthly':
      parts.push(t('summaryMonthly', n))
      break
    case 'yearly':
      parts.push(t('summaryYearly', n))
      break
  }
  if (rule.freq === 'weekly' && rule.byDay?.length && !workweek) {
    parts.push(
      t(
        'summaryOnDays',
        listText(
          rule.byDay.map((day) => weekdayName(day, locale)),
          locale,
        ),
      ),
    )
  }
  if (rule.freq === 'monthly') {
    if (rule.byWeekday) parts.push(t('summaryOnNth', t('ordinal', rule.byWeekday.ordinal), weekdayName(rule.byWeekday.day, locale)))
    else if (rule.byMonthDay === -1) parts.push(t('summaryOnLastDay'))
    else if (rule.byMonthDay !== undefined) parts.push(t('summaryOnDay', rule.byMonthDay))
  }
  if (rule.freq === 'yearly' && rule.byMonth !== undefined) {
    const month = monthName(rule.byMonth, locale)
    if (rule.byWeekday) parts.push(t('summaryOnNthOf', t('ordinal', rule.byWeekday.ordinal), weekdayName(rule.byWeekday.day, locale), month))
    else if (rule.byMonthDay === -1) parts.push(t('summaryOnLastDayOf', month))
    else if (rule.byMonthDay !== undefined)
      parts.push(t('summaryOnDate', dateFormat(locale, { day: 'numeric', month: 'long' }).format(utc(2024, rule.byMonth, rule.byMonthDay))))
  }
  if (rule.freq === 'hourly') {
    if (rule.minute) parts.push(t('summaryAtMinute', rule.minute))
  } else if (rule.freq !== 'minutely') {
    const hour = rule.hour ?? options.time?.hour
    const minute = rule.minute ?? (rule.hour !== undefined ? 0 : options.time?.minute)
    if (hour !== undefined && minute !== undefined) parts.push(t('summaryAt', timeText(hour, minute, locale)))
  }
  const sentence = parts.join(' ')
  if (rule.count !== undefined) return t('summaryWithEnd', sentence, t('summaryCount', rule.count))
  if (rule.until) {
    const [year, month, day] = rule.until.split('-').map(Number)
    return t(
      'summaryWithEnd',
      sentence,
      t('summaryUntil', dateFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(utc(year, month, day))),
    )
  }
  return sentence
}
