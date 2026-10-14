import { LitElement, html, isServer, unsafeCSS } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { resolveLocale } from '@c2n/core/locale-helper.js'
import { LocaleController } from '@c2n/core/localize.js'
import styles from './format-date.scss?inline'

/** Preset length of the date or the time part, as `Intl.DateTimeFormat` names it. */
export type FormatDateStyle = 'full' | 'long' | 'medium' | 'short'

/** Width of a text field such as the weekday or the era. */
export type FormatDateTextWidth = 'long' | 'short' | 'narrow'

/** A numeric field: `numeric` ("7") or `2-digit` ("07"). */
export type FormatDateNumeric = 'numeric' | '2-digit'

/** The month as a number or a name. */
export type FormatDateMonth = FormatDateNumeric | FormatDateTextWidth

/** How the time zone is named: "PST", "Pacific Standard Time", "GMT-8", "GMT-08:00", "PT", "Pacific Time". */
export type FormatDateTimeZoneName = 'short' | 'long' | 'shortOffset' | 'longOffset' | 'shortGeneric' | 'longGeneric'

/** `auto` follows the locale, `12` forces a 12-hour clock with AM/PM, `24` a 24-hour clock. */
export type FormatDateHourFormat = 'auto' | '12' | '24'

export interface FormatDateOptions {
  locale?: string
  dateStyle?: FormatDateStyle
  timeStyle?: FormatDateStyle
  weekday?: FormatDateTextWidth
  era?: FormatDateTextWidth
  year?: FormatDateNumeric
  month?: FormatDateMonth
  day?: FormatDateNumeric
  hour?: FormatDateNumeric
  minute?: FormatDateNumeric
  second?: FormatDateNumeric
  timeZoneName?: FormatDateTimeZoneName
  timeZone?: string
  hourFormat?: FormatDateHourFormat
}

const FIELDS = ['weekday', 'era', 'year', 'month', 'day', 'hour', 'minute', 'second', 'timeZoneName'] as const

// Kept private: `@c2n/relative-time` exports the same reader, and the `@c2n/components` barrel re-exports both packages.
function readDate(value: Date | string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * The `Intl.DateTimeFormat` options for `options`. `Intl` refuses a style next to an individual field, so `dateStyle`
 * and `timeStyle` win and the fields are ignored; with neither and no field the date is shown in the `medium` style.
 */
export function dateTimeFormatOptions(options: FormatDateOptions = {}): Intl.DateTimeFormatOptions {
  const result: Intl.DateTimeFormatOptions = {}
  if (options.dateStyle || options.timeStyle) {
    if (options.dateStyle) result.dateStyle = options.dateStyle
    if (options.timeStyle) result.timeStyle = options.timeStyle
  } else {
    for (const field of FIELDS) {
      const value = options[field]
      if (value) (result as Record<string, string>)[field] = value
    }
    if (!Object.keys(result).length) result.dateStyle = 'medium'
  }
  if (options.timeZone) result.timeZone = options.timeZone
  // `hour12: false` reads "24:05" past midnight in some engines; `h23` is the clock people mean by 24-hour.
  if (options.hourFormat === '12') result.hour12 = true
  else if (options.hourFormat === '24') result.hourCycle = 'h23'
  return result
}

/** Formats `date` with `Intl.DateTimeFormat` in `options.locale` (else the browser's language). */
export function formatDate(date: Date, options: FormatDateOptions = {}): string {
  return new Intl.DateTimeFormat(resolveLocale(options.locale), dateTimeFormatOptions(options)).format(date)
}

/**
 * A date and time formatted for the reader's language and, optionally, a fixed time zone, with
 * `Intl.DateTimeFormat`. Either pick a preset length with `date-style` and `time-style`, or name the fields to show
 * (`weekday`, `year`, `month`, `day`, `hour`, `minute`, `second`, `time-zone-name`, `era`); the presets win when both
 * are given, because `Intl` cannot mix them. With neither, the date shows in the `medium` style ("Oct 14, 2026").
 *
 * The language is `locale`, else the nearest `lang` attribute (followed as soon as it changes), else the browser's.
 * `time-zone` takes an IANA name such as `UTC` or `Asia/Ho_Chi_Minh`; without it the reader's own zone is used, so
 * set it whenever the page is rendered on a server and the text must not change on hydration.
 *
 * `date` takes an ISO 8601 string or a timestamp in milliseconds in markup, and a `Date` as a property. The text sits in
 * a `<time>` element whose `datetime` is the exact instant. Until `date` holds a valid date the element shows its
 * default slot, for a fallback such as "No date". An invalid `locale` or `time-zone` falls back to the defaults rather
 * than rendering nothing.
 *
 * @tag c2-format-date
 *
 * @slot - Fallback content shown while `date` is unset or not a valid date.
 *
 * @csspart time - The `<time>` element holding the formatted date, with the machine-readable `datetime`.
 *
 * @cssproperty {color} [--c2-format-date--color=inherit] - Colour of the text; inherits the surrounding text colour.
 * @cssproperty {font-size} [--c2-format-date--font-size=inherit] - Size of the text.
 * @cssproperty {font-weight} [--c2-format-date--font-weight=inherit] - Weight of the text.
 * @cssproperty {string} [--c2-format-date--font-variant-numeric=tabular-nums] - Digit style; tabular digits line dates up in a column.
 * @cssproperty {string} [--c2-format-date--white-space=nowrap] - Whether the text may wrap between its words.
 */
@customElement('c2-format-date')
export class FormatDate extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The moment to show: an ISO 8601 string or a millisecond timestamp in markup, or a `Date` from script. */
  @property() date: Date | string | number | undefined = undefined

  /** Preset length of the date: `full` ("Wednesday, October 14, 2026"), `long`, `medium` or `short` ("10/14/26"). */
  @property({ attribute: 'date-style' }) dateStyle: FormatDateStyle | '' = ''

  /** Preset length of the time: `full`, `long`, `medium` ("3:05:09 PM") or `short` ("3:05 PM"). Empty shows no time unless a time field is set. */
  @property({ attribute: 'time-style' }) timeStyle: FormatDateStyle | '' = ''

  /** Day of the week: `long` ("Wednesday"), `short` ("Wed") or `narrow` ("W"). Ignored when a style is set. */
  @property() weekday: FormatDateTextWidth | '' = ''

  /** Era: `long` ("Anno Domini"), `short` ("AD") or `narrow` ("A"). Ignored when a style is set. */
  @property() era: FormatDateTextWidth | '' = ''

  /** Year: `numeric` ("2026") or `2-digit` ("26"). Ignored when a style is set. */
  @property() year: FormatDateNumeric | '' = ''

  /** Month: `numeric`, `2-digit`, `long` ("October"), `short` ("Oct") or `narrow` ("O"). Ignored when a style is set. */
  @property() month: FormatDateMonth | '' = ''

  /** Day of the month: `numeric` or `2-digit`. Ignored when a style is set. */
  @property() day: FormatDateNumeric | '' = ''

  /** Hour: `numeric` or `2-digit`. Ignored when a style is set. */
  @property() hour: FormatDateNumeric | '' = ''

  /** Minute: `numeric` or `2-digit`. Ignored when a style is set. */
  @property() minute: FormatDateNumeric | '' = ''

  /** Second: `numeric` or `2-digit`. Ignored when a style is set. */
  @property() second: FormatDateNumeric | '' = ''

  /** Time zone name: `short` ("PST"), `long`, `shortOffset` ("GMT-8"), `longOffset`, `shortGeneric` or `longGeneric`. Ignored when a style is set. */
  @property({ attribute: 'time-zone-name' }) timeZoneName: FormatDateTimeZoneName | '' = ''

  /** IANA time zone the date is shown in, such as `UTC` or `Europe/Paris`. Empty uses the reader's time zone. */
  @property({ attribute: 'time-zone' }) timeZone = ''

  /** Clock: `auto` follows the locale, `12` shows AM/PM, `24` a 24-hour clock. */
  @property({ attribute: 'hour-format' }) hourFormat: FormatDateHourFormat = 'auto'

  /** BCP 47 locale of the text. Empty uses the nearest `lang` attribute, then the browser's language. */
  @property() locale = ''

  /** `locale`, else the nearest `lang`, else the browser's language; a `lang` change redraws the text at once. */
  readonly #language = new LocaleController(this, () => this.locale)

  get #locale(): string {
    return isServer ? resolveLocale(this.locale) : this.#language.locale
  }

  #options(): FormatDateOptions {
    return {
      locale: this.#locale,
      dateStyle: this.dateStyle || undefined,
      timeStyle: this.timeStyle || undefined,
      weekday: this.weekday || undefined,
      era: this.era || undefined,
      year: this.year || undefined,
      month: this.month || undefined,
      day: this.day || undefined,
      hour: this.hour || undefined,
      minute: this.minute || undefined,
      second: this.second || undefined,
      timeZoneName: this.timeZoneName || undefined,
      timeZone: this.timeZone || undefined,
      hourFormat: this.hourFormat,
    }
  }

  override render() {
    const date = readDate(this.date)
    if (!date) return html`<slot></slot>`
    const options = this.#options()
    // An unknown `time-zone` drops the zone first, then any other bad value the options and then the locale.
    const attempts: FormatDateOptions[] = [options, { ...options, timeZone: undefined }, { locale: options.locale }, {}]
    let text = ''
    for (const attempt of attempts) {
      try {
        text = formatDate(date, attempt)
        break
      } catch {
        // Try the next, plainer set of options.
      }
    }
    return html`<time part="time" datetime=${date.toISOString()}>${text}</time>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-format-date': FormatDate
  }
}
