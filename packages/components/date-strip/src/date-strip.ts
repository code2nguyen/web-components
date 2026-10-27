import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { firstDayOfWeek } from '@c2n/core/locale-helper.js'
import { formatDate, parseDate } from '@c2n/core/zoned-time.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { dateStripMessages } from './messages'
import styles from './date-strip.scss?inline'

export { dateStripMessages } from './messages'

/** A day with something on it, drawn as a dot under the day. */
export interface DateStripMarker {
  /** The day, as `YYYY-MM-DD`. */
  date: string
  /** What is on it, read with the day by screen readers ("3 workouts"). */
  label?: string
}

/** Events fired by {@link DateStrip}, keyed for `addEventListener`. */
export interface DateStripEventMap {
  input: Event
  change: CustomEvent<{ value: string }>
  'range-change': CustomEvent<{ start: string; end: string }>
}

export interface DateStrip {
  addEventListener: TypedAddEventListener<DateStrip, DateStripEventMap>
  removeEventListener: TypedRemoveEventListener<DateStrip, DateStripEventMap>
}

function toIso(date: Date): string {
  return formatDate({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() })
}

/** A `YYYY-MM-DD` day as a local date at noon, or `null` when it is not one. */
function fromIso(value: string): Date | null {
  const parsed = parseDate(value)
  return parsed ? new Date(parsed.year, parsed.month - 1, parsed.day, 12) : null
}

const formatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per locale and options, kept: a render needs several and runs on every focus move. */
function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, format)
  }
  return format
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12)
}

/**
 * A row of days to pick one from, like the day strips of booking, fitness and calendar apps (Airbnb, Strava, Google
 * Calendar on a phone): each day shows its weekday and number, the chosen one is filled, today is marked, and a dot
 * marks the days that have something on them. The buttons at the ends page through the days, a week at a time by
 * default (`days`), starting on the first day of the week in the page's language.
 *
 * The value is a `YYYY-MM-DD` string in the local calendar, so it does not shift across time zones. `min` and `max`
 * disable the days outside them and stop the paging there. `markers` lists the days with a dot, each with an optional
 * label a screen reader hears with the day. `disabled-dates` turns off single days (fully booked, closed), which the arrow
 * keys step over.
 *
 * The days are a list box with one tab stop: the arrow keys move by day and page on at the ends, Home and End go to
 * the first and last day shown, Page Up and Page Down page, and Enter or Space picks. It is a form control: under a
 * `name` the form receives the value, `required` asks for one, and it takes part in `c2-form-field`.
 *
 * @tag c2-date-strip
 *
 * @event {Event} input - Fired when the user picks a day, before `change`. Read `value`.
 * @event {CustomEvent<{ value: string }>} change - Fired after the user picks a day. Not fired for programmatic changes.
 * @event {CustomEvent<{ start: string; end: string }>} range-change - Fired when the user pages to other days, with the first and last day now shown, so an app can load what is on them.
 *
 * @csspart header - The row with the month and the paging buttons.
 * @csspart title - The month (or months) of the days shown.
 * @csspart navigation - A paging button.
 * @csspart days - The row of days.
 * @csspart day - One day.
 * @csspart weekday - A day's weekday name.
 * @csspart date - A day's number.
 * @csspart marker - The dot under a day with a marker.
 *
 * @cssproperty {pixel} [--c2-date-strip--gap=4px] - Space between the days.
 * @cssproperty {font-size} [--c2-date-strip--font-size=14px]
 * @cssproperty {color} [--c2-date-strip--color=#18181b]
 * @cssproperty {font-weight} [--c2-date-strip__title--font-weight=600]
 * @cssproperty {pixel} [--c2-date-strip__navigation--size=32px]
 * @cssproperty {color} [--c2-date-strip__navigation__hover--background=#f4f4f5]
 * @cssproperty {pixel} [--c2-date-strip__day--min-width=40px] - The narrowest a day gets before the row scrolls.
 * @cssproperty {padding} [--c2-date-strip__day--padding=8px 0]
 * @cssproperty {border} [--c2-date-strip__day--border=1px solid transparent]
 * @cssproperty {border-radius} [--c2-date-strip__day--border-radius=14px]
 * @cssproperty {color} [--c2-date-strip__day--background=transparent]
 * @cssproperty {color} [--c2-date-strip__day__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-date-strip__day__today--color=#0265dc] - Today's number.
 * @cssproperty {color} [--c2-date-strip__day__selected--background=#0265dc]
 * @cssproperty {color} [--c2-date-strip__day__selected--color=#ffffff]
 * @cssproperty {opacity} [--c2-date-strip__day__disabled--opacity=0.38]
 * @cssproperty {color} [--c2-date-strip__weekday--color=#71717a]
 * @cssproperty {font-size} [--c2-date-strip__weekday--font-size=12px]
 * @cssproperty {font-size} [--c2-date-strip__date--font-size=16px]
 * @cssproperty {font-weight} [--c2-date-strip__date--font-weight=600]
 * @cssproperty {pixel} [--c2-date-strip__marker--size=4px]
 * @cssproperty {color} [--c2-date-strip__marker--color=#0265dc]
 * @cssproperty {outline} [--c2-date-strip__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-date-strip__error--border=1px solid #dc2626] - Around the days while an enclosing `c2-form-field` shows an error.
 */
@customElement('c2-date-strip')
export class DateStrip extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The day picked, as `YYYY-MM-DD`. */
  @property({ reflect: true }) value = ''

  /** How many days show at once; the paging buttons move by as many. A week of 7 starts on the locale's first day of the week. */
  @property({ type: Number }) days = 7

  /** The first day shown, as `YYYY-MM-DD`. Defaults to the start of the week (or page) holding the value, or today. */
  @property() start = ''

  /** The earliest day that can be picked, as `YYYY-MM-DD`. */
  @property() min = ''

  /** The latest day that can be picked, as `YYYY-MM-DD`. */
  @property() max = ''

  /** Single days that cannot be picked, as `YYYY-MM-DD`. As an attribute, a `;`-separated list. */
  @property({ attribute: 'disabled-dates', converter: arrayPropertyConverter }) disabledDates: string[] = []

  /** The days with a dot. As an attribute, a JSON array of `"YYYY-MM-DD"` strings or `{ date, label }` objects. */
  @property({ converter: jsonPropertyConverter }) markers: (DateStripMarker | string)[] = []

  /** Form field name: the form receives the value under it. */
  @property({ reflect: true }) name = ''

  /** Asks for a day before the form submits. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the strip off; the value is kept and, as for a disabled form control, not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the strip. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  /** The first day shown. */
  @state() private viewStart = ''
  /** The day holding the tab stop. */
  @state() private focusDay = ''
  @state() private disabledByForm = false

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, dateStripMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultValue: string | undefined
  private customValidityMessage = ''
  /** The markers by day, rebuilt when `markers` changes. */
  private markerMap = new Map<string, DateStripMarker>()
  /** `disabledDates` as a set, rebuilt when it changes. */
  private disabledSet = new Set<string>()
  /** The locale the page of days was laid out for: a week starts on its first day. */
  private layoutLocale = ''

  get form() {
    return this.internals.form
  }

  get labels() {
    return this.internals.labels
  }

  get validity() {
    return this.internals.validity
  }

  get validationMessage() {
    return this.internals.validationMessage
  }

  get willValidate() {
    return this.internals.willValidate
  }

  checkValidity() {
    return this.internals.checkValidity()
  }

  reportValidity() {
    return this.internals.reportValidity()
  }

  setCustomValidity(message: string) {
    this.customValidityMessage = message
    this.syncFormState()
  }

  formResetCallback() {
    this.value = this.defaultValue ?? ''
    this.viewStart = this.initialStart()
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('value') && this.value && !fromIso(this.value)) this.value = ''
    if (this.defaultValue === undefined) this.defaultValue = this.value
    if (changed.has('disabledDates')) this.disabledSet = new Set(Array.isArray(this.disabledDates) ? this.disabledDates : [])
    if (changed.has('markers')) {
      this.markerMap = new Map()
      for (const marker of Array.isArray(this.markers) ? this.markers : []) {
        const entry = typeof marker === 'string' ? { date: marker } : marker
        if (entry && typeof entry.date === 'string' && !this.markerMap.has(entry.date)) this.markerMap.set(entry.date, entry)
      }
    }
    // A change of language can change the first day of the week, so the page is laid out again.
    const relayout = this.layoutLocale !== this.msg.locale && !fromIso(this.start)
    this.layoutLocale = this.msg.locale
    if (!this.viewStart || changed.has('start') || changed.has('days') || relayout) this.viewStart = this.initialStart()
    // A value set from outside that is not shown brings its page into view.
    else if (changed.has('value') && this.value && !this.shown().includes(this.value)) this.viewStart = this.pageStartFor(this.value)
  }

  protected override updated(changed: PropertyValues<this>): void {
    this.syncFormState()
    if (changed.has('value') || (changed as PropertyValues).has('viewStart')) this.revealSelected()
  }

  /** In a row too narrow for every day, scrolls the row (never the page) so the picked day is in sight. */
  private revealSelected(): void {
    const row = this.renderRoot.querySelector<HTMLElement>('.days')
    const day = row?.querySelector<HTMLElement>('.day--selected')
    if (!row || !day || row.scrollWidth <= row.clientWidth) return
    // The row is positioned, so a day's offsetLeft is measured from the row's start.
    const start = day.offsetLeft
    if (start < row.scrollLeft) row.scrollLeft = start
    else if (start + day.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = start + day.offsetWidth - row.clientWidth
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  private get pageSize(): number {
    return Number.isFinite(this.days) ? Math.min(31, Math.max(1, Math.round(this.days))) : 7
  }

  /** The first day of the page holding `day`: the week's first day for a page of 7, else `day` itself. */
  private pageStartFor(day: string): string {
    const date = fromIso(day) ?? new Date()
    if (this.pageSize !== 7) return toIso(date)
    const first = firstDayOfWeek(this.msg.locale)
    return toIso(addDays(date, -((date.getDay() - first + 7) % 7)))
  }

  private initialStart(): string {
    if (fromIso(this.start)) return this.start
    return this.pageStartFor(this.value || toIso(new Date()))
  }

  /** The days shown, in order. */
  private shown(): string[] {
    const first = fromIso(this.viewStart) ?? new Date()
    return Array.from({ length: this.pageSize }, (_, at) => toIso(addDays(first, at)))
  }

  /** `min`, or nothing when it is not a `YYYY-MM-DD` day: a malformed bound must not disable whole months. */
  private get minDay(): string {
    return fromIso(this.min) ? this.min : ''
  }

  private get maxDay(): string {
    return fromIso(this.max) ? this.max : ''
  }

  /** Outside `min`/`max`: no day further that way can be picked. */
  private outOfRange(day: string): boolean {
    return (!!this.minDay && day < this.minDay) || (!!this.maxDay && day > this.maxDay)
  }

  private unavailable(day: string): boolean {
    return this.effectiveDisabled || this.outOfRange(day) || this.disabledSet.has(day)
  }

  private canPage(direction: -1 | 1): boolean {
    if (this.effectiveDisabled) return false
    const shown = this.shown()
    if (direction < 0) return !this.minDay || shown[0] > this.minDay
    return !this.maxDay || shown[shown.length - 1] < this.maxDay
  }

  private page(direction: -1 | 1): void {
    const first = fromIso(this.viewStart) ?? new Date()
    this.viewStart = toIso(addDays(first, direction * this.pageSize))
    this.focusDay = ''
    this.announceRange()
  }

  private announceRange(): void {
    const shown = this.shown()
    this.dispatchEvent(new CustomEvent('range-change', { detail: { start: shown[0], end: shown[shown.length - 1] }, bubbles: true, composed: true }))
  }

  private syncFormState(): void {
    this.internals.setFormValue(this.effectiveDisabled || !this.name || !this.value ? null : this.value, this.value)
    const missing = this.required && !this.value
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t('valueMissing') : '')
    const anchor = this.renderRoot?.querySelector<HTMLElement>('.day[tabindex="0"]') ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  private pick(day: string): void {
    if (this.unavailable(day)) return
    this.focusDay = day
    if (day === this.value) return
    this.value = day
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value: day }, bubbles: true, composed: true }))
  }

  private async focusDayButton(): Promise<void> {
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>('.day[tabindex="0"]')?.focus()
  }

  private handleKeydown(event: KeyboardEvent): void {
    const button = (event.target as Element).closest<HTMLElement>('.day')
    if (!button) return
    const shown = this.shown()
    const at = shown.indexOf(button.dataset.date ?? '')
    let target: number
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        target = at - 1
        break
      case 'ArrowRight':
      case 'ArrowDown':
        target = at + 1
        break
      case 'Home':
        target = 0
        break
      case 'End':
        target = shown.length - 1
        break
      case 'PageUp':
      case 'PageDown': {
        event.preventDefault()
        const direction = event.key === 'PageUp' ? -1 : 1
        if (!this.canPage(direction)) return
        this.page(direction)
        // The same place on the new page, or its nearest available day.
        const next = this.shown()
        const order = next.map((_, index) => index).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))
        const usable = order.map((index) => next[index]).find((day) => !this.unavailable(day))
        if (usable) this.focusDay = usable
        void this.focusDayButton()
        return
      }
      default:
        return
    }
    event.preventDefault()
    // The day the key leads to, checked before anything moves: past a disabled day to the next one that can be picked,
    // but never past min/max, which keeps focus where it is.
    const first = fromIso(shown[0])!
    const step = target < at ? -1 : target > at ? 1 : 0
    let offset = target
    let day = toIso(addDays(first, offset))
    // Home and End land on the nearest usable day inward; an arrow keeps going outward, at most two months.
    const direction = event.key === 'Home' ? 1 : event.key === 'End' ? -1 : step
    for (let tries = 0; this.unavailable(day) && tries < 62; tries++) {
      if (this.outOfRange(day) || this.effectiveDisabled) return
      offset += direction
      if ((event.key === 'Home' || event.key === 'End') && (offset < 0 || offset >= shown.length)) return
      day = toIso(addDays(first, offset))
    }
    if (this.unavailable(day)) return
    if (offset < 0 || offset >= shown.length) {
      this.viewStart = toIso(addDays(first, Math.floor(offset / this.pageSize) * this.pageSize))
      this.announceRange()
    }
    this.focusDay = day
    void this.focusDayButton()
  }

  /** The month (or two months) of the days shown, in the page's language. */
  private rangeTitle(shown: string[]): string {
    const first = fromIso(shown[0])!
    const last = fromIso(shown[shown.length - 1])!
    const locale = this.msg.locale
    const format = formatter(locale, { month: 'long', year: 'numeric' }) as Intl.DateTimeFormat & {
      formatRange?: (start: Date, end: Date) => string
    }
    return format.formatRange ? format.formatRange(first, last) : format.format(first)
  }

  override render() {
    const shown = this.shown()
    const today = toIso(new Date())
    const usable = (day: string) => shown.includes(day) && !this.unavailable(day)
    // A disabled strip has no tab stop, as a disabled native control is out of the tab order.
    const stop = [this.focusDay, this.value, today].find((day) => day && usable(day)) ?? shown.find((day) => !this.unavailable(day))
    const locale = this.msg.locale
    const weekday = formatter(locale, { weekday: 'short' })
    const longDate = formatter(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    const number = formatter(locale, { day: 'numeric' })
    const title = this.rangeTitle(shown)
    const invalid = this.field.invalid && !this.effectiveDisabled
    return html`<div class="strip" style="--_days: ${shown.length}">
        <div class="header" part="header">
          <span class="title" part="title" aria-live="polite">${title}</span>
          <span class="paging">
            <button
              class="navigation"
              part="navigation"
              type="button"
              aria-label=${this.msg.t('previous')}
              ?disabled=${!this.canPage(-1)}
              @click=${() => this.page(-1)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
            </button>
            <button
              class="navigation"
              part="navigation"
              type="button"
              aria-label=${this.msg.t('next')}
              ?disabled=${!this.canPage(1)}
              @click=${() => this.page(1)}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
            </button>
          </span>
        </div>
        <div
          class="days ${invalid ? 'error' : ''}"
          part="days"
          role="listbox"
          aria-orientation="horizontal"
          aria-label=${this.label || this.field.label || this.msg.t('label')}
          aria-describedby=${this.field.describedBy()}
          aria-invalid=${invalid ? 'true' : nothing}
          aria-disabled=${this.effectiveDisabled ? 'true' : nothing}
          aria-required=${this.required ? 'true' : nothing}
          @keydown=${this.handleKeydown}
        >
          ${shown.map((day) => {
            const date = fromIso(day)!
            const marker = this.markerMap.get(day)
            const selected = day === this.value
            const disabled = this.unavailable(day)
            const name = longDate.format(date)
            return html`<div
              class="day ${selected ? 'day--selected' : ''} ${day === today ? 'day--today' : ''} ${disabled ? 'day--disabled' : ''}"
              part="day"
              role="option"
              data-date=${day}
              tabindex=${day === stop ? 0 : -1}
              aria-label=${marker ? this.msg.t('marked', name, marker.label || this.msg.t('hasEvents')) : name}
              aria-selected=${selected ? 'true' : 'false'}
              aria-current=${day === today ? 'date' : nothing}
              aria-disabled=${disabled ? 'true' : nothing}
              @click=${() => this.pick(day)}
              @keydown=${(event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  this.pick(day)
                }
              }}
              @focus=${() => (this.focusDay = day)}
            >
              <span class="weekday" part="weekday" aria-hidden="true">${weekday.format(date)}</span>
              <span class="date" part="date" aria-hidden="true">${number.format(date)}</span>
              <span class="marker ${marker ? '' : 'marker--none'}" part="marker" aria-hidden="true"></span>
            </div>`
          })}
        </div>
      </div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-date-strip': DateStrip
  }
}
