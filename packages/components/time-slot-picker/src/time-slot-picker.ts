import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { FieldContextConsumer } from '@c2n/core/contexts/field.js'
import { formatDate, isTimeZone, parseDate, wallClockAt, zoneLabel } from '@c2n/core/zoned-time.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/date-strip'
import { timeSlotPickerMessages } from './messages'
import styles from './time-slot-picker.scss?inline'

export { timeSlotPickerMessages } from './messages'

/** One bookable time. */
export interface TimeSlot {
  /** When it starts: an ISO date-time with an offset (`2026-10-13T09:00:00+02:00` or `…Z`). This becomes the value. */
  start: string
  /** When it ends, in the same form. Shown with `show-end`. */
  end?: string
  /** `false` shows the slot as taken. */
  available?: boolean
  /** Text shown instead of the time. */
  label?: string
}

/** Events fired by {@link TimeSlotPicker}, keyed for `addEventListener`. */
export interface TimeSlotPickerEventMap {
  input: Event
  change: CustomEvent<{ value: string; slot: TimeSlot }>
  'date-change': CustomEvent<{ date: string }>
  'range-change': CustomEvent<{ start: string; end: string }>
}

export interface TimeSlotPicker {
  addEventListener: TypedAddEventListener<TimeSlotPicker, TimeSlotPickerEventMap>
  removeEventListener: TypedRemoveEventListener<TimeSlotPicker, TimeSlotPickerEventMap>
}

/** A slot placed on the calendar of the zone it is shown in. */
interface PlacedSlot {
  slot: TimeSlot
  start: number
  end: number | null
  /** Its day in the zone, as `YYYY-MM-DD`. */
  day: string
  /** Minutes since midnight in the zone. */
  minutes: number
  available: boolean
}

type Period = 'morning' | 'afternoon' | 'evening'

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, format)
  }
  return format
}

function addDays(day: string, amount: number): string {
  const parsed = parseDate(day)!
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + amount))
  return formatDate({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() })
}

/** Noon UTC of a `YYYY-MM-DD` day: formatted in UTC, it is that day whatever the browser's zone. */
function dayInstant(day: string): Date {
  const parsed = parseDate(day)!
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12))
}

function periodOf(minutes: number): Period {
  return minutes < 12 * 60 ? 'morning' : minutes < 17 * 60 ? 'afternoon' : 'evening'
}

/**
 * Pick a free time from someone's calendar, the booking step of Calendly and Cal.com: a row of days on top, then the
 * free times of the day picked, grouped into morning, afternoon and evening.
 *
 * `slots` lists the times, each an ISO `start` (with its offset), an optional `end`, and `available: false` for one
 * that is taken. They are shown in `time-zone` (the browser's zone by default) and filed under their day in that zone.
 * Days with a free time carry a dot; days between the first and last slot without one are disabled. A day with no
 * free time offers a jump to the next one that has.
 *
 * The value is the picked slot's `start`, exactly as given. Paging the days fires `range-change` with the days now
 * shown, so an app can load their slots, showing `loading` meanwhile.
 *
 * The times are one list box per group with a single tab stop: the arrow keys move from time to time across groups,
 * Home and End go to the first and last, and Enter or Space picks. It is a form control: under a `name` the form
 * receives the value, `required` asks for one, and it takes part in `c2-form-field`.
 *
 * @tag c2-time-slot-picker
 *
 * @event {Event} input - Fired when the user picks a time, before `change`. Read `value`.
 * @event {CustomEvent<{ value: string; slot: TimeSlot }>} change - Fired after the user picks a time, with the slot. Not fired for programmatic changes.
 * @event {CustomEvent<{ date: string }>} date-change - Fired when the user shows another day.
 * @event {CustomEvent<{ start: string; end: string }>} range-change - Fired when the user pages the days, with the first and last day now shown.
 *
 * @csspart days - The row of days, a `c2-date-strip`: theme it with its `--c2-date-strip__*` variables.
 * @csspart zone - The line naming the time zone.
 * @csspart group - One group of times.
 * @csspart heading - A group's heading.
 * @csspart slots - The grid of times of a group.
 * @csspart slot - One time.
 * @csspart empty - The message of a day with no free time.
 * @csspart next - The button to the next day with a free time.
 *
 * @cssproperty {font-size} [--c2-time-slot-picker--font-size=14px]
 * @cssproperty {color} [--c2-time-slot-picker--color=#18181b]
 * @cssproperty {pixel} [--c2-time-slot-picker--gap=16px] - Space between the days, the zone line and the groups.
 * @cssproperty {color} [--c2-time-slot-picker__zone--color=#71717a]
 * @cssproperty {font-size} [--c2-time-slot-picker__zone--font-size=12px]
 * @cssproperty {color} [--c2-time-slot-picker__heading--color=#71717a]
 * @cssproperty {font-size} [--c2-time-slot-picker__heading--font-size=12px]
 * @cssproperty {font-weight} [--c2-time-slot-picker__heading--font-weight=600]
 * @cssproperty {pixel} [--c2-time-slot-picker__slots--min-width=88px] - The narrowest a time gets; the grid fits as many columns as this allows.
 * @cssproperty {pixel} [--c2-time-slot-picker__slots--gap=8px]
 * @cssproperty {pixel} [--c2-time-slot-picker__slot--height=40px]
 * @cssproperty {border} [--c2-time-slot-picker__slot--border=1px solid #d4d4d8]
 * @cssproperty {border-radius} [--c2-time-slot-picker__slot--border-radius=8px]
 * @cssproperty {color} [--c2-time-slot-picker__slot--background=transparent]
 * @cssproperty {color} [--c2-time-slot-picker__slot--color=#0265dc]
 * @cssproperty {font-weight} [--c2-time-slot-picker__slot--font-weight=600]
 * @cssproperty {color} [--c2-time-slot-picker__slot__hover--background=#edf1fe]
 * @cssproperty {border} [--c2-time-slot-picker__slot__hover--border=1px solid #0265dc]
 * @cssproperty {color} [--c2-time-slot-picker__slot__selected--background=#0265dc]
 * @cssproperty {color} [--c2-time-slot-picker__slot__selected--color=#ffffff]
 * @cssproperty {color} [--c2-time-slot-picker__slot__unavailable--color=#a1a1aa]
 * @cssproperty {color} [--c2-time-slot-picker__slot__loading--background=#f4f4f5] - The placeholder times shown while `loading`.
 * @cssproperty {color} [--c2-time-slot-picker__empty--color=#71717a]
 * @cssproperty {color} [--c2-time-slot-picker__link--color=#0265dc] - The button to the next day with a free time.
 * @cssproperty {outline} [--c2-time-slot-picker__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {border} [--c2-time-slot-picker__error--border=1px solid #dc2626] - Around the times while an enclosing `c2-form-field` shows an error.
 */
@customElement('c2-time-slot-picker')
export class TimeSlotPicker extends LitElement {
  static formAssociated = true

  static override styles = unsafeCSS(styles)

  /** The times to pick from. As an attribute, a JSON array of `{ start, end?, available?, label? }`. */
  @property({ converter: jsonPropertyConverter }) slots: TimeSlot[] = []

  /** The picked slot's `start`. */
  @property({ reflect: true }) value = ''

  /** The day shown, as `YYYY-MM-DD`. Defaults to the day of the value, else the first day with a free time. */
  @property() date = ''

  /** The IANA time zone the times are shown in (`Europe/Paris`). Defaults to the browser's. */
  @property({ attribute: 'time-zone' }) timeZone = ''

  /** `period` groups the times into morning, afternoon and evening; `none` lists them as one group. */
  @property({ attribute: 'group-by' }) groupBy: 'period' | 'none' = 'period'

  /** Shows each time with its end ("9:00 – 9:30"). */
  @property({ type: Boolean, attribute: 'show-end' }) showEnd = false

  /** The earliest day that can be shown, as `YYYY-MM-DD`. */
  @property() min = ''

  /** The latest day that can be shown, as `YYYY-MM-DD`. */
  @property() max = ''

  /** Shows placeholder times while the app loads the slots of the days shown. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** Form field name: the form receives the value under it. */
  @property({ reflect: true }) name = ''

  /** Asks for a time before the form submits. */
  @property({ type: Boolean, reflect: true }) required = false

  /** Turns the picker off; the value is kept and, as for a disabled form control, not submitted. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** The accessible name of the picker. Inside a `c2-form-field`, the field's label names it. */
  @property() label = ''

  /** The slot holding the tab stop, by its `start`. */
  @state() private focusSlot = ''
  @state() private disabledByForm = false
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, timeSlotPickerMessages)
  private readonly field = new FieldContextConsumer(this, { kind: 'choice' })
  private defaultValue: string | undefined
  private customValidityMessage = ''
  /** The slots by day in the zone shown, sorted by time; rebuilt when the slots or the zone change. */
  private byDay = new Map<string, PlacedSlot[]>()
  /** Days with at least one free time, in order. */
  private freeDays: string[] = []
  private announcementTimer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    super()
    this.internals.role = 'group'
  }

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
  }

  formDisabledCallback(disabled: boolean) {
    this.disabledByForm = disabled && !this.hasAttribute('disabled')
  }

  formStateRestoreCallback(state: string | File | FormData | null) {
    if (typeof state === 'string') this.value = state
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    clearTimeout(this.announcementTimer)
  }

  /** The zone the times are shown in; an unknown name falls back to the browser's. */
  private get zone(): string {
    return this.timeZone && isTimeZone(this.timeZone) ? this.timeZone : ''
  }

  private get effectiveDisabled(): boolean {
    return this.disabled || this.disabledByForm
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (this.defaultValue === undefined) this.defaultValue = this.value
    if (changed.has('slots') || changed.has('timeZone')) this.place()
    // With no day asked for, show the value's day, else the first free day from today, else the first free day.
    if (!parseDate(this.date) && (changed.has('date') || changed.has('slots') || changed.has('value') || !this.hasUpdated)) {
      const picked = this.placedValue()
      const today = this.today()
      this.date = picked?.day ?? this.freeDays.find((day) => day >= today) ?? this.freeDays[0] ?? today
    }
    this.internals.ariaLabel = this.label || this.field.label || this.msg.t('label')
  }

  protected override updated(): void {
    this.syncFormState()
  }

  private today(): string {
    return formatDate(wallClockAt(Date.now(), this.zone))
  }

  private place(): void {
    this.byDay = new Map()
    const zone = this.zone
    for (const slot of Array.isArray(this.slots) ? this.slots : []) {
      if (!slot || typeof slot.start !== 'string') continue
      const start = Date.parse(slot.start)
      if (Number.isNaN(start)) continue
      const end = typeof slot.end === 'string' ? Date.parse(slot.end) : NaN
      const clock = wallClockAt(start, zone)
      const day = formatDate(clock)
      const placed: PlacedSlot = {
        slot,
        start,
        end: Number.isNaN(end) ? null : end,
        day,
        minutes: clock.hour * 60 + clock.minute,
        available: slot.available !== false,
      }
      const list = this.byDay.get(day)
      if (list) list.push(placed)
      else this.byDay.set(day, [placed])
    }
    for (const list of this.byDay.values()) list.sort((a, b) => a.start - b.start)
    this.freeDays = [...this.byDay.keys()].filter((day) => this.byDay.get(day)!.some((slot) => slot.available)).sort()
  }

  private placedValue(): PlacedSlot | undefined {
    if (!this.value) return undefined
    for (const list of this.byDay.values()) {
      const found = list.find((placed) => placed.slot.start === this.value)
      if (found) return found
    }
    return undefined
  }

  /** Days between the first and last day with slots that have no free time: known to be fully booked. */
  private bookedDays(): string[] {
    const known = [...this.byDay.keys()].sort()
    if (!known.length) return []
    const free = new Set(this.freeDays)
    const booked: string[] = []
    for (let day = known[0], guard = 0; day <= known[known.length - 1] && guard < 400; day = addDays(day, 1), guard++) {
      if (!free.has(day)) booked.push(day)
    }
    return booked
  }

  private syncFormState(): void {
    this.internals.setFormValue(this.effectiveDisabled || !this.name || !this.value ? null : this.value, this.value)
    const missing = this.required && !this.value
    const flags = this.customValidityMessage ? { customError: true } : missing ? { valueMissing: true } : {}
    const message = this.customValidityMessage || (missing ? this.msg.t('valueMissing') : '')
    const anchor = this.renderRoot?.querySelector<HTMLElement>('.slot[tabindex="0"]') ?? undefined
    this.internals.setValidity(flags, message, anchor)
  }

  private longDate(day: string): string {
    return formatter(this.msg.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(dayInstant(day))
  }

  private announce(text: string): void {
    clearTimeout(this.announcementTimer)
    // Cleared first, so the same sentence twice is announced twice.
    this.announcement = ''
    this.announcementTimer = setTimeout(() => (this.announcement = text), 100)
  }

  private showDay(day: string): void {
    if (day === this.date) return
    this.date = day
    this.focusSlot = ''
    const free = (this.byDay.get(day) ?? []).filter((slot) => slot.available).length
    if (!this.loading) this.announce(free ? this.msg.t('available', free, this.longDate(day)) : this.msg.t('noTimes', this.longDate(day)))
    this.dispatchEvent(new CustomEvent('date-change', { detail: { date: day }, bubbles: true, composed: true }))
  }

  private pick(placed: PlacedSlot): void {
    if (!placed.available || this.effectiveDisabled) return
    this.focusSlot = placed.slot.start
    if (placed.slot.start === this.value) return
    this.value = placed.slot.start
    this.dispatchEvent(new Event('input', { bubbles: true, composed: true }))
    this.dispatchEvent(new CustomEvent('change', { detail: { value: this.value, slot: placed.slot }, bubbles: true, composed: true }))
  }

  /** The strip's own events stay inside: its `change` is a day, not this picker's value. */
  private handleStripChange(event: Event): void {
    event.stopPropagation()
    if (event.type === 'change') this.showDay((event.target as HTMLElement & { value: string }).value)
  }

  private handleKeydown(event: KeyboardEvent): void {
    const current = (event.target as Element).closest<HTMLElement>('.slot')
    if (!current) return
    const buttons = [...this.renderRoot.querySelectorAll<HTMLElement>('.slot:not(.slot--unavailable)')]
    const at = buttons.indexOf(current)
    let target: HTMLElement | undefined
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        target = buttons[at - 1]
        break
      case 'ArrowRight':
      case 'ArrowDown':
        target = buttons[at + 1]
        break
      case 'Home':
        target = buttons[0]
        break
      case 'End':
        target = buttons[buttons.length - 1]
        break
      case 'Enter':
      case ' ': {
        event.preventDefault()
        const placed = this.byDay.get(this.date)?.find((slot) => slot.slot.start === current.dataset.start)
        if (placed) this.pick(placed)
        return
      }
      default:
        return
    }
    event.preventDefault()
    if (!target) return
    this.focusSlot = target.dataset.start ?? ''
    target.focus()
  }

  private timeText(placed: PlacedSlot): string {
    if (placed.slot.label) return placed.slot.label
    const format = formatter(this.msg.locale, { hour: 'numeric', minute: '2-digit', timeZone: this.zone || undefined }) as Intl.DateTimeFormat & {
      formatRange?: (start: Date, end: Date) => string
    }
    if (this.showEnd && placed.end !== null && placed.end > placed.start && format.formatRange) {
      return format.formatRange(new Date(placed.start), new Date(placed.end))
    }
    return format.format(placed.start)
  }

  private renderSlots(list: PlacedSlot[], stop: string, label: string, heading: unknown) {
    const invalid = this.field.invalid && !this.effectiveDisabled
    return html`<div class="group" part="group">
      ${heading}
      <div
        class="slots ${invalid ? 'error' : ''}"
        part="slots"
        role="listbox"
        aria-label=${label}
        aria-describedby=${this.field.describedBy()}
        aria-invalid=${invalid ? 'true' : nothing}
        aria-disabled=${this.effectiveDisabled ? 'true' : nothing}
        aria-required=${this.required ? 'true' : nothing}
        @keydown=${this.handleKeydown}
      >
        ${list.map((placed) => {
          const text = this.timeText(placed)
          const selected = placed.slot.start === this.value
          const unavailable = !placed.available
          return html`<div
            class="slot ${selected ? 'slot--selected' : ''} ${unavailable ? 'slot--unavailable' : ''}"
            part="slot"
            role="option"
            data-start=${placed.slot.start}
            tabindex=${placed.slot.start === stop ? 0 : -1}
            aria-selected=${selected ? 'true' : 'false'}
            aria-disabled=${unavailable || this.effectiveDisabled ? 'true' : nothing}
            aria-label=${unavailable ? this.msg.t('unavailable', text) : nothing}
            @click=${() => this.pick(placed)}
            @focus=${() => (this.focusSlot = placed.slot.start)}
          >
            ${text}
          </div>`
        })}
      </div>
    </div>`
  }

  private renderTimes() {
    if (this.loading) {
      return html`<div class="group" part="group">
        <div class="slots" part="slots" role="listbox" aria-label=${this.msg.t('loading')} aria-busy="true">
          ${Array.from({ length: 6 }, () => html`<div class="slot slot--loading" part="slot" aria-hidden="true"></div>`)}
        </div>
      </div>`
    }
    const list = this.byDay.get(this.date) ?? []
    if (!list.some((placed) => placed.available)) {
      const next = this.freeDays.find((day) => day > this.date && (!parseDate(this.max) || day <= this.max))
      return html`<div class="empty" part="empty">
        <span>${this.msg.t('noTimes', this.longDate(this.date))}</span>
        ${
          next && !this.effectiveDisabled
            ? html`<button class="next" part="next" type="button" @click=${() => this.showDay(next)}>
                ${this.msg.t('nextAvailable', this.longDate(next))}
              </button>`
            : nothing
        }
      </div>`
    }
    const usable = list.filter((placed) => placed.available)
    // A disabled picker has no tab stop, as a disabled native control is out of the tab order.
    const stop = this.effectiveDisabled
      ? ''
      : ([this.focusSlot, this.value].find((start) => usable.some((placed) => placed.slot.start === start)) ?? usable[0].slot.start)
    if (this.groupBy === 'none') return this.renderSlots(list, stop, this.msg.t('times', this.longDate(this.date)), nothing)
    const periods: Period[] = ['morning', 'afternoon', 'evening']
    return periods.map((period) => {
      const group = list.filter((placed) => periodOf(placed.minutes) === period)
      if (!group.length) return nothing
      const heading = this.msg.t(period)
      return this.renderSlots(group, stop, heading, html`<div class="heading" part="heading" aria-hidden="true">${heading}</div>`)
    })
  }

  override render() {
    const zoneName = zoneLabel(this.zone, Date.now(), this.msg.locale, 'long')
    return html`<div class="picker">
        <div
          class="days-host"
          @input=${this.handleStripChange}
          @change=${this.handleStripChange}
          @c2-field-connect=${(event: Event) => event.stopPropagation()}
        >
          <c2-date-strip
            part="days"
            .value=${this.date}
            .markers=${this.freeDays}
            .disabledDates=${this.loading ? [] : this.bookedDays()}
            .min=${this.min}
            .max=${this.max}
            .label=${this.msg.t('day')}
            ?disabled=${this.effectiveDisabled}
          ></c2-date-strip>
        </div>
        <div class="zone" part="zone">${this.msg.t('timesIn', zoneName)}</div>
        <div class="times" aria-busy=${this.loading ? 'true' : 'false'}>${this.renderTimes()}</div>
      </div>
      <div class="visually-hidden" role="status">${this.announcement}</div>
      ${this.field.renderDescription()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-time-slot-picker': TimeSlotPicker
  }
}
