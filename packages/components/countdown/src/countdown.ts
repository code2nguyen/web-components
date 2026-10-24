import { LitElement, html, isServer, unsafeCSS, type PropertyValues } from 'lit'
import { classMap } from 'lit/directives/class-map.js'
import { keyed } from 'lit/directives/keyed.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { resolveLocale } from '@c2n/core/locale-helper.js'
import { LocaleController } from '@c2n/core/localize.js'
import styles from './countdown.scss?inline'

/** How the remaining time is drawn: a box per unit, `2:14:05:31`, or a phrase such as "2 days 14 hours". */
export type CountdownDisplay = 'segments' | 'clock' | 'inline'

/** Length of the unit names, as `Intl.NumberFormat` gives them: "hours", "hr", "h". */
export type CountdownFormat = 'long' | 'short' | 'narrow'

export type CountdownUnit = 'days' | 'hours' | 'minutes' | 'seconds'

/** One unit of the remaining time as drawn: its count and its name in the element's language. */
export interface CountdownPart {
  unit: CountdownUnit
  value: number
}

/** Events fired by {@link Countdown}, keyed for `addEventListener`. */
export interface CountdownEventMap {
  tick: CustomEvent<{ remaining: number }>
  complete: Event
}

export interface Countdown {
  addEventListener: TypedAddEventListener<Countdown, CountdownEventMap>
  removeEventListener: TypedRemoveEventListener<Countdown, CountdownEventMap>
}

const SECOND = 1000
const UNIT_MS: Record<CountdownUnit, number> = { days: 86_400_000, hours: 3_600_000, minutes: 60_000, seconds: SECOND }
const ALL_UNITS: CountdownUnit[] = ['days', 'hours', 'minutes', 'seconds']
const INTL_UNIT: Record<CountdownUnit, string> = { days: 'day', hours: 'hour', minutes: 'minute', seconds: 'second' }

// `Intl.ListFormat` is ES2021, above the library's ES2020 typings; every engine the components support has it.
const ListFormat = (
  Intl as unknown as {
    ListFormat?: new (locale: string, options: { type: 'unit'; style: CountdownFormat }) => { format(items: string[]): string }
  }
).ListFormat

// setTimeout overflows above a signed 32-bit delay and fires at once.
const MAX_DELAY = 2 ** 31 - 1

/** Reads a `Date`, a timestamp in milliseconds or an ISO 8601 string; anything else is `undefined`. */
function toDate(value: Date | string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** The same moment, whatever form it was given in: a new `Date` of the same time is no change. */
function sameDate(value: unknown, old: unknown): boolean {
  const a = toDate(value as Date | string | number | undefined)
  const b = toDate(old as Date | string | number | undefined)
  return a?.getTime() === b?.getTime() && (a !== undefined || value === old)
}

/** A duration in seconds; anything that is not a finite number (a removed attribute, `"abc"`) is unset. */
function toSeconds(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(value, 0) : undefined
}

const formats = new Map<string, Intl.NumberFormat>()

/** A cached `Intl.NumberFormat`: built once per locale and options, then reused by every element and every tick. */
function numberFormat(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formats.get(key)
  if (!format) {
    try {
      format = new Intl.NumberFormat(locale, options)
    } catch {
      format = new Intl.NumberFormat('en', options)
    }
    formats.set(key, format)
  }
  return format
}

const lists = new Map<string, { format(items: string[]): string } | null>()

/** The units as a phrase, "2 days, 14 hours", in `locale`. */
function phrase(parts: CountdownPart[], locale: string, display: CountdownFormat): string {
  const items = parts.map(({ unit, value }) => numberFormat(locale, { style: 'unit', unit: INTL_UNIT[unit], unitDisplay: display }).format(value))
  const key = `${locale}|${display}`
  if (!lists.has(key)) {
    let list: { format(items: string[]): string } | null = null
    try {
      if (ListFormat) list = new ListFormat(locale, { type: 'unit', style: display })
    } catch {
      // An invalid locale falls back to the plain join.
    }
    lists.set(key, list)
  }
  return lists.get(key)?.format(items) ?? items.join(' ')
}

/** The known units in `list` (space or comma separated), largest first; none known means all four. */
export function parseUnits(list: string | null | undefined): CountdownUnit[] {
  const named = new Set((list ?? '').toLowerCase().split(/[\s,]+/))
  const units = ALL_UNITS.filter((unit) => named.has(unit))
  return units.length ? units : [...ALL_UNITS]
}

/**
 * Splits `remaining` milliseconds over `units`. The smallest unit is rounded up, so the display reads 0 only once the
 * time is over, and the largest unit absorbs everything above it: with `hours minutes`, two days read as 48 hours.
 * `trim` drops the leading units that are zero, keeping at least the smallest.
 */
export function splitRemaining(remaining: number, units: CountdownUnit[], trim = false): CountdownPart[] {
  const step = UNIT_MS[units[units.length - 1]]
  let rest = Math.ceil(Math.max(remaining, 0) / step) * step
  const parts = units.map((unit) => {
    const value = Math.floor(rest / UNIT_MS[unit])
    rest -= value * UNIT_MS[unit]
    return { unit, value }
  })
  if (!trim) return parts
  const first = parts.findIndex(({ value }) => value > 0)
  return parts.slice(first === -1 ? parts.length - 1 : first)
}

/**
 * Time left until a date, or through a duration, that keeps itself current. It draws a box per unit (`segments`), a
 * clock (`clock`, `14:05:31`) or a phrase (`inline`, "2 days 14 hours"), in the units you list, with the unit names and
 * digits of the element's `locale` (else the nearest `lang`, else the browser's language) from `Intl`, so there is
 * nothing to translate. One timer per element wakes exactly when the shown value changes: a countdown in hours and
 * minutes redraws once a minute.
 *
 * Give it `date` to count down to a moment (an ISO 8601 string or a millisecond timestamp in markup, a `Date` from
 * script), or `duration` in seconds for a timer that starts when the element connects (unless `paused`). `pause()`,
 * `start()` and `reset()` drive the timer from script. At zero the element fires `complete` once and shows its `ended`
 * slot in place of the zeros, if given.
 *
 * The host has the `timer` role, and a visually hidden phrase ("2 days, 14 hours, 5 minutes") is what assistive
 * technology reads; the drawn digits are hidden from it. Style its states with `:state(running)`, `:state(paused)`,
 * `:state(warning)` (less than `warn-at` seconds left) and `:state(ended)`.
 *
 * @tag c2-countdown
 *
 * @slot ended - Content shown in place of the digits once the time is over, such as "We are live!".
 *
 * @event tick - Fired whenever the shown value changes; `detail.remaining` is the time left in milliseconds.
 * @event complete - Fired once when the countdown reaches zero while the element is on the page.
 *
 * @csspart segment - The box around one unit's value and label (`display="segments"`).
 * @csspart value - The digits of one unit (`display="segments"`).
 * @csspart label - The unit name under its digits (`display="segments"`).
 * @csspart separator - The colon between two segments, hidden unless `--c2-countdown__separator--display` shows it.
 * @csspart text - The clock or phrase (`display="clock"` and `display="inline"`).
 *
 * @cssproperty {color} [--c2-countdown--color=inherit] - Text colour of the clock and the phrase.
 * @cssproperty {font-size} [--c2-countdown--font-size=inherit] - Size of the clock and the phrase.
 * @cssproperty {font-weight} [--c2-countdown--font-weight=inherit] - Weight of the clock and the phrase.
 * @cssproperty {string} [--c2-countdown--font-variant-numeric=tabular-nums] - Digit style; tabular digits keep a ticking value from shifting the text around it.
 * @cssproperty {length} [--c2-countdown--gap=8px] - Space between segments (and their separators).
 * @cssproperty {color} [--c2-countdown__segment--background-color=#f4f4f5] - Background of a segment.
 * @cssproperty {border} [--c2-countdown__segment--border=1px solid #e4e4e7] - Border of a segment.
 * @cssproperty {length} [--c2-countdown__segment--border-radius=8px] - Corner radius of a segment.
 * @cssproperty {length} [--c2-countdown__segment--padding=12px] - Inner spacing of a segment.
 * @cssproperty {length} [--c2-countdown__segment--min-width=64px] - Smallest width of a segment, so the boxes line up while the digits change.
 * @cssproperty {length} [--c2-countdown__segment--gap=4px] - Space between a segment's digits and its label.
 * @cssproperty {color} [--c2-countdown__value--color=#18181b] - Colour of a segment's digits.
 * @cssproperty {font-size} [--c2-countdown__value--font-size=32px] - Size of a segment's digits.
 * @cssproperty {font-weight} [--c2-countdown__value--font-weight=600] - Weight of a segment's digits.
 * @cssproperty {string} [--c2-countdown__value--font-family=inherit] - Typeface of a segment's digits.
 * @cssproperty {time} [--c2-countdown__value--animation-duration=0ms] - Length of the roll-in played when a segment's digits change; 0ms draws them still. Reduced motion always draws them still.
 * @cssproperty {color} [--c2-countdown__label--color=#52525b] - Colour of a segment's unit name.
 * @cssproperty {font-size} [--c2-countdown__label--font-size=12px] - Size of a segment's unit name.
 * @cssproperty {font-weight} [--c2-countdown__label--font-weight=normal] - Weight of a segment's unit name.
 * @cssproperty {string} [--c2-countdown__label--text-transform=none] - Case of a segment's unit name, such as `uppercase`.
 * @cssproperty {length} [--c2-countdown__label--letter-spacing=normal] - Letter spacing of a segment's unit name.
 * @cssproperty {string} [--c2-countdown__separator--display=none] - `inline` shows a colon between segments.
 * @cssproperty {color} [--c2-countdown__separator--color=#a1a1aa] - Colour of the colon between segments.
 * @cssproperty {font-size} [--c2-countdown__separator--font-size=32px] - Size of the colon between segments.
 * @cssproperty {color} [--c2-countdown__warning--color=#dc2626] - Colour of the digits and text while less than `warn-at` seconds are left.
 * @cssproperty {color} [--c2-countdown__paused--color=#71717a] - Colour of the digits and text while paused.
 */
@customElement('c2-countdown')
export class Countdown extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The moment to count down to: an ISO 8601 string or a millisecond timestamp in markup, or a `Date` from script. Wins over `duration`. */
  @property({ hasChanged: (value: unknown, old: unknown) => !sameDate(value, old) }) date: Date | string | number | undefined = undefined

  /** Length of a timer in seconds, used when `date` is unset. The timer starts when the element connects, unless `paused`; changing it restarts the timer. */
  @property({ type: Number }) duration: number | undefined = undefined

  /** The units to show, largest first, from `days`, `hours`, `minutes` and `seconds`. The largest absorbs the rest: `hours minutes` shows two days as 48 hours. */
  @property() units = 'days hours minutes seconds'

  /** `segments` draws a box per unit with its name, `clock` draws `14:05:31`, `inline` writes a phrase such as "2 days 14 hours". */
  @property() display: CountdownDisplay = 'segments'

  /** Length of the unit names: `long` ("hours"), `short` ("hr") or `narrow` ("h"). */
  @property() format: CountdownFormat = 'long'

  /** Leave out the leading units that are zero: three hours left read "3 hours 12 minutes", not "0 days 3 hours 12 minutes". */
  @property({ type: Boolean }) trim = false

  /** Seconds left under which the element is in its warning state (`:state(warning)`, coloured by `--c2-countdown__warning--color`). 0 turns it off. */
  @property({ type: Number, attribute: 'warn-at' }) warnAt = 0

  /** Stop the countdown where it is. A timer resumes from the same point; a countdown to a `date` catches up with the time that passed. */
  @property({ type: Boolean }) paused = false

  /** BCP 47 locale of the unit names and digits. Empty uses the nearest `lang` attribute, then the browser's language. */
  @property() locale = ''

  private readonly internals = this.attachInternals()

  /** `locale`, else the nearest `lang`, else the browser's language; a `lang` change redraws at once. */
  readonly #language = new LocaleController(this, () => this.locale)

  #timer: ReturnType<typeof setTimeout> | undefined
  /** When a running timer (`duration`) ends, in epoch milliseconds. */
  #endsAt: number | undefined
  /** Time left when the countdown was paused, or before a timer first starts. */
  #left = 0
  /** Whether `complete` already fired for the current run. */
  #completed = false
  /** The value drawn last, so `tick` fires only when it changes. */
  #lastShown: string | undefined
  /** Whether the element has drawn its countdown running; `complete` fires only after that. */
  #hasRun = false
  /** `date` parsed, and `units` read, once per update. */
  #date: Date | undefined
  #units: CountdownUnit[] = [...ALL_UNITS]
  /** The time left this update draws: one reading of the clock for `render()` and `updated()`, so both agree. */
  #remaining = 0

  constructor() {
    super()
    this.internals.role = 'timer'
  }

  /** Milliseconds left: 0 once the time is over, and the full length for a timer that has not started. */
  get remaining(): number {
    const date = toDate(this.date)
    if (this.paused) return this.#left
    if (date) return Math.max(date.getTime() - Date.now(), 0)
    if (this.#endsAt !== undefined) return Math.max(this.#endsAt - Date.now(), 0)
    return this.#left
  }

  /** Resumes a paused countdown. A timer that ran out starts again from its full `duration`. */
  start() {
    if (!toDate(this.date) && this.#endsAt === undefined && this.#left <= 0) this.reset()
    this.paused = false
  }

  /** Stops the countdown where it is; `start()` resumes it. */
  pause() {
    this.paused = true
  }

  /** Puts a timer back to its full `duration`, running unless paused, and arms `complete` again. A countdown to a `date` has nothing to reset. */
  reset() {
    if (toDate(this.date)) return
    this.#left = (toSeconds(this.duration) ?? 0) * SECOND
    this.#endsAt = this.paused || !this.isConnected ? undefined : Date.now() + this.#left
    this.#completed = false
    this.requestUpdate()
  }

  override connectedCallback() {
    super.connectedCallback()
    // A timer runs while connected; a reconnected one resumes from where it was detached.
    if (this.hasUpdated && !this.paused && !toDate(this.date) && this.#left > 0 && this.#endsAt === undefined) this.#endsAt = Date.now() + this.#left
    if (this.hasUpdated) this.requestUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    if (this.#endsAt !== undefined) {
      this.#left = Math.max(this.#endsAt - Date.now(), 0)
      this.#endsAt = undefined
    }
    this.#stop()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('date') || !this.hasUpdated) this.#date = toDate(this.date)
    if (changed.has('units') || !this.hasUpdated) this.#units = parseUnits(this.units)
    if (changed.has('duration') || !this.hasUpdated) {
      this.#left = (toSeconds(this.duration) ?? 0) * SECOND
      this.#endsAt = undefined
      this.#completed = false
    }
    if (changed.has('date') && this.hasUpdated) this.#completed = false
    if (changed.has('paused') || changed.has('duration') || changed.has('date') || !this.hasUpdated) {
      const date = this.#date
      if (this.paused) {
        // Paused, the countdown holds the time that was left at that moment.
        if (date) this.#left = Math.max(date.getTime() - Date.now(), 0)
        else if (this.#endsAt !== undefined) this.#left = Math.max(this.#endsAt - Date.now(), 0)
        this.#endsAt = undefined
      } else if (!date && !isServer && this.isConnected && this.#endsAt === undefined && this.#left > 0) {
        this.#endsAt = Date.now() + this.#left
      }
    }
    this.#remaining = this.remaining
  }

  #stop() {
    clearTimeout(this.#timer)
    this.#timer = undefined
  }

  get #active(): boolean {
    return this.#date !== undefined || toSeconds(this.duration) !== undefined
  }

  protected override updated(_changed: PropertyValues<this>) {
    this.#stop()
    if (isServer || !this.isConnected) return
    const remaining = this.#remaining
    const active = this.#active
    const running = active && !this.paused && remaining > 0
    this.#setState('running', running)
    this.#setState('paused', active && this.paused && remaining > 0)
    this.#setState('ended', active && remaining <= 0)
    this.#setState('warning', active && remaining > 0 && this.warnAt > 0 && remaining <= this.warnAt * SECOND)

    const shown = active ? this.#key(remaining) : undefined
    if (shown !== undefined && shown !== this.#lastShown && this.#lastShown !== undefined) {
      this.dispatchEvent(new CustomEvent('tick', { detail: { remaining } }))
    }
    this.#lastShown = shown
    if (active && remaining <= 0 && !this.#completed) {
      this.#completed = true
      if (this.#endsAt !== undefined) {
        this.#left = 0
        this.#endsAt = undefined
      }
      // A countdown already over when the element first drew has not counted anything down.
      if (this.#hasRun) this.dispatchEvent(new Event('complete'))
    }
    if (running) {
      this.#hasRun = true
      this.#timer = setTimeout(() => this.requestUpdate(), this.#nextChangeIn(remaining))
    }
  }

  #setState(name: string, on: boolean) {
    try {
      if (on) this.internals.states.add(name)
      else this.internals.states.delete(name)
    } catch {
      // `CustomStateSet` is missing from older engines; the states are styling hooks only.
    }
  }

  /** Milliseconds until the shown value, or the warning state, changes. */
  #nextChangeIn(remaining: number): number {
    const step = UNIT_MS[this.#units[this.#units.length - 1]]
    // The smallest unit is rounded up: it changes when the remainder crosses the next whole step below.
    let wait = remaining - (Math.ceil(remaining / step) - 1) * step
    const warnAt = this.warnAt * SECOND
    if (warnAt > 0 && remaining > warnAt) wait = Math.min(wait, remaining - warnAt)
    return Math.min(Math.max(wait, 0), MAX_DELAY)
  }

  #key(remaining: number): string {
    return splitRemaining(remaining, this.#units, this.trim)
      .map(({ value }) => value)
      .join(':')
  }

  get #locale(): string {
    return isServer ? resolveLocale(this.locale) : this.#language.locale
  }

  /** Unit name for `value` in the element's language: "hours", "hr", "h". */
  #unitName(unit: CountdownUnit, value: number, locale: string): string {
    return numberFormat(locale, { style: 'unit', unit: INTL_UNIT[unit], unitDisplay: this.format })
      .formatToParts(value)
      .filter(({ type }) => type === 'unit')
      .map(({ value: text }) => text)
      .join('')
      .trim()
  }

  override render() {
    const locale = this.#locale
    const remaining = this.#remaining
    const all = splitRemaining(remaining, this.#units)
    const parts = this.trim ? splitRemaining(remaining, this.#units, true) : all
    const digits = numberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false })

    let drawn
    if (this.display === 'clock') {
      drawn = html`<span part="text" class="text">${parts.map(({ value }) => digits.format(value)).join(':')}</span>`
    } else if (this.display === 'inline') {
      drawn = html`<span part="text" class="text">${phrase(parts, locale, this.format)}</span>`
    } else {
      // Every unit keeps its segment, a trimmed one hidden, so the structure never depends on the time: a server-rendered
      // countdown hydrates against the same parts, and trimming a unit away does not shift the others' digits.
      const first = all.length - parts.length
      drawn = html`<span class="segments">
        ${all.map(
          ({ unit, value }, index) =>
            html`<span part="separator" class=${classMap({ separator: true, trimmed: index <= first })}>:</span
              ><span part="segment" class=${classMap({ segment: true, trimmed: index < first })} data-unit=${unit}
                >${keyed(value, html`<span part="value" class="value">${digits.format(value)}</span>`)}<span part="label" class="label"
                  >${this.#unitName(unit, value, locale)}</span
                ></span
              >`,
        )}
      </span>`
    }

    // The digits are hidden from assistive technology, which reads the phrase instead. The slot sits outside that hidden
    // part, so slotted content is read. It is renamed rather than added at the end, so the template stays the same.
    return html`<slot name=${this.#active && remaining <= 0 ? 'ended' : 'c2-countdown-running'}
      ><span class="visually-hidden">${phrase(parts, locale, 'long')}</span><span class="drawn" aria-hidden="true">${drawn}</span></slot
    >`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-countdown': Countdown
  }
}
