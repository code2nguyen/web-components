import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { resolveLocale } from '@c2n/core/locale-helper.js'
import { LocaleController } from '@c2n/core/localize.js'
import styles from './relative-time.scss?inline'

/** Length of the phrase, as `Intl.RelativeTimeFormat` names it: "3 minutes ago", "3 min. ago", "3m ago". */
export type RelativeTimeFormat = 'long' | 'short' | 'narrow'

/** `auto` allows "yesterday" and "now"; `always` keeps the number: "1 day ago", "in 0 seconds". */
export type RelativeTimeNumeric = 'auto' | 'always'

/** Smallest unit the phrase counts in; a distance below one of it reads as "now", or "today", "this week", … from days up. */
export type RelativeTimeUnit = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year'

export interface RelativeTimeOptions {
  locale?: string
  format?: RelativeTimeFormat
  numeric?: RelativeTimeNumeric
  minUnit?: RelativeTimeUnit
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

// Each unit is used while the distance stays below `limit`; months and years are calendar averages.
const UNITS: { unit: RelativeTimeUnit; ms: number; limit: number }[] = [
  { unit: 'second', ms: SECOND, limit: MINUTE },
  { unit: 'minute', ms: MINUTE, limit: HOUR },
  { unit: 'hour', ms: HOUR, limit: DAY },
  { unit: 'day', ms: DAY, limit: WEEK },
  { unit: 'week', ms: WEEK, limit: MONTH },
  { unit: 'month', ms: MONTH, limit: YEAR },
  { unit: 'year', ms: YEAR, limit: Infinity },
]

// setTimeout overflows above a signed 32-bit delay and fires at once.
const MAX_DELAY = 2 ** 31 - 1

/** Reads a `Date`, a timestamp in milliseconds or an ISO 8601 string; anything else is `undefined`. */
export function toDate(value: Date | string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** The units from `minUnit` up; an unknown unit counts from seconds. */
function unitsFrom(minUnit: RelativeTimeUnit = 'second') {
  return UNITS.slice(
    Math.max(
      UNITS.findIndex(({ unit }) => unit === minUnit),
      0,
    ),
  )
}

function pickUnit(distance: number, units: typeof UNITS) {
  return units.find(({ ms, limit }) => Math.round(distance / ms) * ms < limit) ?? units[units.length - 1]
}

/** The rounded count of `ms` in `distance`; less than one whole unit is 0, so nothing below the smallest unit counts. */
function count(distance: number, ms: number) {
  return distance < ms ? 0 : Math.round(distance / ms)
}

/**
 * Phrases the distance between `date` and `now` in the largest unit that fits: "now", "42 seconds ago",
 * "in 3 hours", "yesterday", "2 weeks ago", "last year". Values are rounded to the nearest unit. `minUnit` sets the
 * smallest unit counted: with `minute`, anything under a minute away reads as "now" instead of counting seconds.
 */
export function formatRelativeTime(date: Date, now: Date = new Date(), options: RelativeTimeOptions = {}): string {
  const diff = date.getTime() - now.getTime()
  const { unit, ms } = pickUnit(Math.abs(diff), unitsFrom(options.minUnit))
  const value = count(Math.abs(diff), ms) * Math.sign(diff)
  const formatter = new Intl.RelativeTimeFormat(resolveLocale(options.locale), { style: options.format ?? 'long', numeric: options.numeric ?? 'auto' })
  // `Math.round` gives -0 for a date a moment in the past, which `Intl` phrases as "0 seconds ago" instead of "now".
  if (!value && formatter.resolvedOptions().numeric === 'auto' && (unit === 'minute' || unit === 'hour')) {
    // `auto` would say "this minute" or "this hour"; "now" reads better. Days and up keep "today", "this week", …
    return formatter.format(0, 'second')
  }
  return formatter.format(value || 0, unit)
}

/** Milliseconds until `formatRelativeTime(date, now, { minUnit })` reads differently, so a live display redraws only when needed. */
export function nextChangeIn(date: Date, now: Date = new Date(), minUnit?: RelativeTimeUnit): number {
  const diff = date.getTime() - now.getTime()
  const distance = Math.abs(diff)
  const units = unitsFrom(minUnit)
  const index = units.indexOf(pickUnit(distance, units))
  const { ms } = units[index]
  const shown = count(distance, ms)
  let wait: number
  if (shown === 0) {
    // "now" holds on both sides of the moment, until the date is one whole unit in the past.
    wait = diff <= 0 ? ms - distance : distance + ms
  } else if (diff <= 0) {
    // A past date moves away from now: the rounded value grows, and reaching the unit's limit is the same boundary.
    wait = (shown + 0.5) * ms - distance
  } else if (shown === 1 && index === 0) {
    // One of the smallest unit becomes "now" as soon as less than a whole unit is left.
    wait = distance - ms
  } else {
    // A future date comes closer: the value shrinks, or the phrase drops to the smaller unit first.
    wait = distance - (shown - 0.5) * ms
    const smaller = units[index - 1]
    if (smaller) wait = Math.min(wait, distance - (smaller.limit - smaller.ms / 2))
  }
  return Math.min(Math.max(wait, 0) + 1, MAX_DELAY)
}

/**
 * Time relative to now, such as "3 minutes ago" or "in 2 days", that keeps itself current. The phrase comes from
 * `Intl.RelativeTimeFormat` in the element's `locale` (else the nearest `lang` attribute, which it follows as soon as it
 * changes, else the browser's language), picks the largest unit that fits and redraws exactly when the rounded value changes, so a page full of timestamps
 * costs one timer each and no polling. The full date and time is the inner `<time>` element's `datetime` and its
 * hover title.
 *
 * `date` takes an ISO 8601 string or a timestamp in milliseconds in markup, and a `Date` as a property. Until it holds
 * a valid date the element shows its default slot, for a fallback such as "Never".
 *
 * @tag c2-relative-time
 *
 * @slot - Fallback content shown while `date` is unset or not a valid date.
 *
 * @csspart time - The `<time>` element holding the phrase, with the machine-readable `datetime` and the full date as its title.
 *
 * @cssproperty {color} [--c2-relative-time--color=inherit] - Colour of the phrase; inherits the surrounding text colour.
 * @cssproperty {font-size} [--c2-relative-time--font-size=inherit] - Size of the phrase.
 * @cssproperty {font-weight} [--c2-relative-time--font-weight=inherit] - Weight of the phrase.
 * @cssproperty {string} [--c2-relative-time--font-variant-numeric=tabular-nums] - Digit style; tabular digits keep a ticking value from shifting the text after it.
 * @cssproperty {string} [--c2-relative-time--white-space=nowrap] - Whether the phrase may wrap between its words.
 */
@customElement('c2-relative-time')
export class RelativeTime extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The moment to describe: an ISO 8601 string or a millisecond timestamp in markup, or a `Date` from script. */
  @property() date: Date | string | number | undefined = undefined

  /** Length of the phrase: `long` ("3 minutes ago"), `short` ("3 min. ago") or `narrow` ("3m ago" in some locales). */
  @property() format: RelativeTimeFormat = 'long'

  /** `auto` uses words such as "yesterday", "tomorrow" and "now"; `always` keeps a number ("1 day ago"). */
  @property() numeric: RelativeTimeNumeric = 'auto'

  /** BCP 47 locale of the phrase and the full date. Empty uses the nearest `lang` attribute, then the browser's language. */
  @property() locale = ''

  /**
   * Smallest unit counted: `second`, `minute`, `hour`, `day`, `week`, `month` or `year`. With `minute`, a date less than
   * a minute away reads as "now" and the phrase never counts seconds, so it redraws at most once a minute.
   */
  @property({ attribute: 'min-unit' }) minUnit: RelativeTimeUnit = 'second'

  /** Draw the phrase once and stop updating it as time passes. */
  @property({ type: Boolean, attribute: 'no-update' }) noUpdate = false

  #timer: ReturnType<typeof setTimeout> | undefined

  /** `locale`, else the nearest `lang`, else the browser's language; a `lang` change redraws the phrase at once. */
  readonly #language = new LocaleController(this, () => this.locale)

  override connectedCallback() {
    super.connectedCallback()
    // A reconnected element may have been detached for longer than its last delay.
    if (this.hasUpdated) this.requestUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.#stop()
  }

  get #locale(): string {
    return isServer ? resolveLocale(this.locale) : this.#language.locale
  }

  #stop() {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  protected override updated(_changed: PropertyValues<this>) {
    this.#stop()
    const date = toDate(this.date)
    if (isServer || !date || this.noUpdate || !this.isConnected) return
    this.#timer = setTimeout(() => this.requestUpdate(), nextChangeIn(date, new Date(), this.minUnit))
  }

  override render() {
    const date = toDate(this.date)
    if (!date) return html`<slot></slot>`
    const locale = this.#locale
    let title: string
    try {
      title = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'short' }).format(date)
    } catch {
      title = date.toString()
    }
    let phrase: string
    try {
      phrase = formatRelativeTime(date, new Date(), { locale, format: this.format, numeric: this.numeric, minUnit: this.minUnit })
    } catch {
      // An invalid `locale` or `format` falls back to the defaults rather than rendering nothing.
      phrase = formatRelativeTime(date, new Date(), { minUnit: this.minUnit })
    }
    return html`<time part="time" datetime=${date.toISOString()} title=${title || nothing}>${phrase}</time>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-relative-time': RelativeTime
  }
}
