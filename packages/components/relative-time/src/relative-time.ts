import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { resolveLocale } from '@c2n/core/locale-helper.js'
import styles from './relative-time.scss?inline'

/** Length of the phrase, as `Intl.RelativeTimeFormat` names it: "3 minutes ago", "3 min. ago", "3m ago". */
export type RelativeTimeFormat = 'long' | 'short' | 'narrow'

/** `auto` allows "yesterday" and "now"; `always` keeps the number: "1 day ago", "in 0 seconds". */
export type RelativeTimeNumeric = 'auto' | 'always'

export interface RelativeTimeOptions {
  locale?: string
  format?: RelativeTimeFormat
  numeric?: RelativeTimeNumeric
}

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY
const YEAR = 365 * DAY

// Each unit is used while the distance stays below `limit`; months and years are calendar averages.
const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number; limit: number }[] = [
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

function pickUnit(distance: number) {
  return UNITS.find(({ ms, limit }) => Math.round(distance / ms) * ms < limit) ?? UNITS[UNITS.length - 1]
}

/**
 * Phrases the distance between `date` and `now` in the largest unit that fits: "now", "42 seconds ago",
 * "in 3 hours", "yesterday", "2 weeks ago", "last year". Values are rounded to the nearest unit.
 */
export function formatRelativeTime(date: Date, now: Date = new Date(), options: RelativeTimeOptions = {}): string {
  const diff = date.getTime() - now.getTime()
  const { unit, ms } = pickUnit(Math.abs(diff))
  const value = Math.round(Math.abs(diff) / ms) * Math.sign(diff)
  const formatter = new Intl.RelativeTimeFormat(resolveLocale(options.locale), { style: options.format ?? 'long', numeric: options.numeric ?? 'auto' })
  // `Math.round` gives -0 for a date a moment in the past, which `Intl` phrases as "0 seconds ago" instead of "now".
  return formatter.format(value || 0, unit)
}

/** Milliseconds until `formatRelativeTime(date, now)` reads differently, so a live display redraws only when needed. */
export function nextChangeIn(date: Date, now: Date = new Date()): number {
  const diff = date.getTime() - now.getTime()
  const distance = Math.abs(diff)
  const index = UNITS.indexOf(pickUnit(distance))
  const { ms } = UNITS[index]
  const shown = Math.round(distance / ms)
  let wait: number
  if (diff <= 0) {
    // A past date moves away from now: the rounded value grows, and reaching the unit's limit is the same boundary.
    wait = (shown + 0.5) * ms - distance
  } else {
    // A future date comes closer: the value shrinks, or the phrase drops to the smaller unit first.
    wait = distance - (shown - 0.5) * ms
    const smaller = UNITS[index - 1]
    if (smaller) wait = Math.min(wait, distance - (smaller.limit - smaller.ms / 2))
  }
  return Math.min(Math.max(wait, 0) + 1, MAX_DELAY)
}

/**
 * Time relative to now, such as "3 minutes ago" or "in 2 days", that keeps itself current. The phrase comes from
 * `Intl.RelativeTimeFormat` in the element's `locale` (else the nearest `lang` attribute, else the browser's language),
 * picks the largest unit that fits and redraws exactly when the rounded value changes, so a page full of timestamps
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

  /** Draw the phrase once and stop updating it as time passes. */
  @property({ type: Boolean, attribute: 'no-update' }) noUpdate = false

  #timer: ReturnType<typeof setTimeout> | undefined

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
    if (this.locale) return this.locale
    if (!isServer) {
      const lang = this.closest('[lang]')?.getAttribute('lang')
      if (lang) return lang
    }
    return resolveLocale()
  }

  #stop() {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  protected override updated(_changed: PropertyValues<this>) {
    this.#stop()
    const date = toDate(this.date)
    if (isServer || !date || this.noUpdate || !this.isConnected) return
    this.#timer = setTimeout(() => this.requestUpdate(), nextChangeIn(date))
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
      phrase = formatRelativeTime(date, new Date(), { locale, format: this.format, numeric: this.numeric })
    } catch {
      // An invalid `locale` or `format` falls back to the defaults rather than rendering nothing.
      phrase = formatRelativeTime(date)
    }
    return html`<time part="time" datetime=${date.toISOString()} title=${title || nothing}>${phrase}</time>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-relative-time': RelativeTime
  }
}
