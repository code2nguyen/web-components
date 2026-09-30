import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './calendar.scss?inline'

export type CalendarWeekStart = 'monday' | 'sunday'

/** One entry in the plan: a single day, or a span from `start` to `end` (both inclusive, `YYYY-MM-DD`). */
export interface CalendarEvent {
  /** Identifies the event in `event-click`. */
  id?: string
  title: string
  start: string
  /** Last day of the event; omit for a one-day event. */
  end?: string
  /** Bar colour, any CSS colour. Defaults to `--c2-calendar__event--background`. */
  color?: string
}

export interface CalendarEventClickDetail {
  event: CalendarEvent
}

export interface CalendarMonthChangeDetail {
  /** The month now shown, as `YYYY-MM`. */
  month: string
}

/** Events fired by {@link Calendar}, keyed for `addEventListener`. */
export interface CalendarEventMap {
  'event-click': CustomEvent<CalendarEventClickDetail>
  'month-change': CustomEvent<CalendarMonthChangeDetail>
}

export interface Calendar {
  addEventListener: TypedAddEventListener<Calendar, CalendarEventMap>
  removeEventListener: TypedRemoveEventListener<Calendar, CalendarEventMap>
}

interface Segment {
  event: CalendarEvent
  column: number
  span: number
  lane: number
  /** The event begins in this week (rounded left end). */
  starts: boolean
  /** The event ends in this week (rounded right end). */
  ends: boolean
}

const isoPattern = /^\d{4}-\d{2}-\d{2}$/
const monthPattern = /^(\d{4})-(\d{2})$/

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fromIso(value: string | undefined): Date | null {
  if (!value || !isoPattern.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function parseMonth(value: string): Date | null {
  const match = monthPattern.exec(value)
  if (!match) return null
  const month = Number(match[2])
  return month >= 1 && month <= 12 ? new Date(Number(match[1]), month - 1, 1, 12) : null
}

function toMonth(date: Date): string {
  return toIso(date).slice(0, 7)
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12)
}

function beginningOfMonth(date: Date, offset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1, 12)
}

function dayDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

/**
 * A month planner that draws events as bars across the days they cover: a vacation from the 10th to the 15th reads as
 * one strip, continued on the next row when it crosses a week. Overlapping events stack in separate lanes. Pass the
 * plan through `events` (a property, or a JSON attribute) with local-calendar `YYYY-MM-DD` dates, which never shift
 * across time zones. The header moves between months; `month` picks the one shown.
 *
 * @tag c2-calendar
 *
 * @event {CustomEvent<CalendarEventClickDetail>} event-click - Fired when an event bar is activated; `detail.event` is the entry from `events`.
 * @event {CustomEvent<CalendarMonthChangeDetail>} month-change - Fired when the header navigation shows another month; `detail.month` is `YYYY-MM`.
 *
 * @csspart event - Each event bar (one per week the event covers).
 *
 * @cssproperty {color} [--c2-calendar--background=#ffffff]
 * @cssproperty {color} [--c2-calendar--color=#18181b]
 * @cssproperty {border} [--c2-calendar--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-calendar--border-radius=8px]
 * @cssproperty {padding} [--c2-calendar--padding=12px]
 * @cssproperty {font-family} [--c2-calendar--font-family=inherit]
 * @cssproperty {font-size} [--c2-calendar--font-size=14px]
 * @cssproperty {font-weight} [--c2-calendar__title--font-weight=600]
 * @cssproperty {pixel} [--c2-calendar__navigation--size=32px]
 * @cssproperty {border-radius} [--c2-calendar__navigation--border-radius=6px]
 * @cssproperty {color} [--c2-calendar__navigation__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-calendar__weekday--color=#71717a]
 * @cssproperty {font-size} [--c2-calendar__weekday--font-size=12px]
 * @cssproperty {border} [--c2-calendar__day--border=1px solid #e4e4e7] - Grid line between days.
 * @cssproperty {pixel} [--c2-calendar__day--min-height=88px]
 * @cssproperty {font-size} [--c2-calendar__day--font-size=12px]
 * @cssproperty {color} [--c2-calendar__day__outside--background=#fafafa] - Background of the neighbouring months' days.
 * @cssproperty {color} [--c2-calendar__day__outside--color=#71717a]
 * @cssproperty {color} [--c2-calendar__day__today--background=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-calendar__day__today--color=#ffffff]
 * @cssproperty {color} [--c2-calendar__event--background=rgb(2, 101, 220)] - Bar colour of an event without its own `color`.
 * @cssproperty {color} [--c2-calendar__event--color=#ffffff]
 * @cssproperty {pixel} [--c2-calendar__event--height=22px]
 * @cssproperty {pixel} [--c2-calendar__event--gap=2px] - Space between stacked lanes.
 * @cssproperty {border-radius} [--c2-calendar__event--border-radius=4px]
 * @cssproperty {font-size} [--c2-calendar__event--font-size=12px]
 * @cssproperty {font-weight} [--c2-calendar__event--font-weight=500]
 * @cssproperty {opacity} [--c2-calendar__event__hover--opacity=0.88]
 * @cssproperty {outline} [--c2-calendar__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-calendar__focus--outline-offset=2px]
 */
@customElement('c2-calendar')
export class Calendar extends LitElement {
  static override styles = unsafeCSS(styles)

  @state() private visibleMonth = beginningOfMonth(new Date())

  /** The plan: `{ id?, title, start, end?, color? }` entries with `YYYY-MM-DD` dates. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) events: CalendarEvent[] = []
  /** Month shown, as `YYYY-MM`. Defaults to the current month; the header navigation updates it. */
  @property({ type: String }) month = ''
  /** Locale used for the month title, weekdays and accessible labels. Defaults to the document language. */
  @property({ type: String }) locale = ''
  /** First day of each week. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: CalendarWeekStart = 'monday'
  /** Accessible name for the calendar; defaults to the month title. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('month')) {
      const month = parseMonth(this.month)
      if (month) this.visibleMonth = month
    }
  }

  private get effectiveLocale() {
    return this.locale || this.ownerDocument?.documentElement.lang || 'en-US'
  }

  private showMonth(month: Date) {
    if (toMonth(month) === toMonth(this.visibleMonth)) return
    this.visibleMonth = month
    this.month = toMonth(month)
    this.dispatchEvent(new CustomEvent<CalendarMonthChangeDetail>('month-change', { detail: { month: this.month }, bubbles: true, composed: true }))
  }

  private openEvent(event: CalendarEvent) {
    this.dispatchEvent(new CustomEvent<CalendarEventClickDetail>('event-click', { detail: { event }, bubbles: true, composed: true }))
  }

  private get firstGridDay() {
    const first = this.visibleMonth
    const offset = this.weekStart === 'sunday' ? first.getDay() : (first.getDay() + 6) % 7
    return addDays(first, -offset)
  }

  /** Cuts every event that touches the week into one bar and stacks overlapping bars into lanes. */
  private segmentsOf(weekStart: Date): Segment[] {
    const weekEnd = addDays(weekStart, 6)
    const events = (Array.isArray(this.events) ? this.events : [])
      .flatMap((event) => {
        const start = fromIso(event?.start)
        const end = fromIso(event?.end) ?? start
        return start && end ? [{ event, start, end: end < start ? start : end }] : []
      })
      .filter((item) => item.start <= weekEnd && item.end >= weekStart)
      .sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime())

    const laneEnds: number[] = []
    return events.map(({ event, start, end }) => {
      const column = Math.max(0, dayDiff(weekStart, start))
      const last = Math.min(6, dayDiff(weekStart, end))
      let lane = laneEnds.findIndex((laneEnd) => laneEnd < column)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = last
      return { event, column, span: last - column + 1, lane, starts: start >= weekStart, ends: end <= weekEnd }
    })
  }

  private eventLabel(event: CalendarEvent, dateLabel: Intl.DateTimeFormat) {
    const start = fromIso(event.start)!
    const end = fromIso(event.end) ?? start
    return end > start ? `${event.title}, ${dateLabel.format(start)} to ${dateLabel.format(end)}` : `${event.title}, ${dateLabel.format(start)}`
  }

  private renderWeek(weekStart: Date, today: string, dateLabel: Intl.DateTimeFormat) {
    const segments = this.segmentsOf(weekStart)
    const lanes = segments.reduce((count, segment) => Math.max(count, segment.lane + 1), 0)
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    return html`<div class="week" style=${styleMap({ '--lanes': String(lanes) })}>
      ${days.map((date, index) => {
        const value = toIso(date)
        const outside = date.getMonth() !== this.visibleMonth.getMonth()
        return html`<div class="day ${outside ? 'outside' : ''}" style=${styleMap({ gridColumn: String(index + 1) })}>
          <span class="date ${value === today ? 'today' : ''}" aria-current=${value === today ? 'date' : nothing}>${date.getDate()}</span>
        </div>`
      })}
      ${segments.map(
        (segment) =>
          html`<button
            class="event ${segment.starts ? 'starts' : ''} ${segment.ends ? 'ends' : ''}"
            type="button"
            part="event"
            aria-label=${this.eventLabel(segment.event, dateLabel)}
            title=${segment.event.title}
            style=${styleMap({
              gridColumn: `${segment.column + 1} / span ${segment.span}`,
              gridRow: String(segment.lane + 2),
              '--event-color': segment.event.color || null,
            })}
            @click=${() => this.openEvent(segment.event)}
          >
            <span>${segment.event.title}</span>
          </button>`,
      )}
    </div>`
  }

  override render() {
    const locale = this.effectiveLocale
    const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(this.visibleMonth)
    const weekdays = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const dateLabel = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' })
    const today = toIso(new Date())
    const first = this.firstGridDay
    const last = beginningOfMonth(this.visibleMonth, 1)
    const weeks = Math.ceil(dayDiff(first, last) / 7)

    return html`<section class="c2-calendar" aria-label=${this.ariaLabel || title}>
      <header class="header">
        <h2 class="title" aria-live="polite">${title}</h2>
        <div class="navigation">
          <button class="nav" type="button" aria-label="Previous month" @click=${() => this.showMonth(beginningOfMonth(this.visibleMonth, -1))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <button class="nav today-button" type="button" @click=${() => this.showMonth(beginningOfMonth(new Date()))}>Today</button>
          <button class="nav" type="button" aria-label="Next month" @click=${() => this.showMonth(beginningOfMonth(this.visibleMonth, 1))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>
      </header>
      <div class="weekdays" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => html`<span>${weekdays.format(addDays(first, index))}</span>`)}</div>
      <div class="weeks">${Array.from({ length: weeks }, (_, week) => this.renderWeek(addDays(first, week * 7), today, dateLabel))}</div>
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-calendar': Calendar
  }
}
