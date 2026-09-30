import { LitElement, html, nothing, unsafeCSS } from 'lit'
import { state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
// Registers `c2-button-group` and `c2-button`, the odd/even week switch.
import '@c2n/button-group'
import styles from './week-planner.scss?inline'

export type WeekPlannerDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WeekPlannerParity = 'odd' | 'even'
export type WeekPlannerWeekStart = 'monday' | 'sunday'

/** One slot of the typical week: a day, a time range, and optionally the kind of week it happens in. */
export interface WeekPlannerEvent {
  /** Identifies the event in `event-click`. */
  id?: string
  title: string
  day: WeekPlannerDay
  /** Start time as `HH:MM` (24-hour). */
  start: string
  /** End time as `HH:MM`; `24:00` ends at midnight. */
  end: string
  /** Weeks the event happens in, by ISO week number. Defaults to every week. */
  weeks?: 'all' | WeekPlannerParity
  /** Block colour, any CSS colour. Defaults to `--c2-week-planner__event--background`. */
  color?: string
}

export interface WeekPlannerEventClickDetail {
  event: WeekPlannerEvent
}

export interface WeekPlannerParityChangeDetail {
  parity: WeekPlannerParity
}

/** Events fired by {@link WeekPlanner}, keyed for `addEventListener`. */
export interface WeekPlannerEventMap {
  'event-click': CustomEvent<WeekPlannerEventClickDetail>
  'parity-change': CustomEvent<WeekPlannerParityChangeDetail>
}

export interface WeekPlanner {
  addEventListener: TypedAddEventListener<WeekPlanner, WeekPlannerEventMap>
  removeEventListener: TypedRemoveEventListener<WeekPlanner, WeekPlannerEventMap>
}

interface Placed {
  event: WeekPlannerEvent
  from: number
  to: number
  column: number
  columns: number
}

const DAYS: WeekPlannerDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const timePattern = /^(\d{1,2}):(\d{2})$/

function minutesOf(value: string | undefined): number | null {
  const match = value ? timePattern.exec(value) : null
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null
  return hours * 60 + minutes
}

function formatMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

/** ISO 8601 week number: weeks start on Monday and week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): number {
  // The Thursday of the date's week decides the year; count whole weeks from that year's first day.
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1)
  return Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7)
}

/** Lays out one day's events: overlapping events share the column width side by side. */
function placeDay(items: { event: WeekPlannerEvent; from: number; to: number }[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.from - b.from || b.to - a.to)
  const placed: Placed[] = []
  let cluster: Placed[] = []
  let columnEnds: number[] = []
  let clusterEnd = -1
  const closeCluster = () => {
    for (const item of cluster) item.columns = columnEnds.length
    cluster = []
    columnEnds = []
  }
  for (const item of sorted) {
    if (item.from >= clusterEnd) {
      closeCluster()
      clusterEnd = item.to
    }
    clusterEnd = Math.max(clusterEnd, item.to)
    let column = columnEnds.findIndex((end) => end <= item.from)
    if (column === -1) column = columnEnds.length
    columnEnds[column] = item.to
    const entry = { ...item, column, columns: 1 }
    cluster.push(entry)
    placed.push(entry)
  }
  closeCluster()
  return placed
}

/**
 * A typical week at a glance: seven day columns on an hour scale, each event a block from its start to its end time.
 * It has no dates — a slot says which weekday it happens on and repeats every week, or only in odd or even ISO weeks
 * (`weeks: "odd"`), as school and shared-custody schedules do. Odd and even weeks are off by default: set
 * `alternate-weeks` to honour `weeks` and show an Odd week | Even week switch (a segmented `c2-button-group`, themed
 * through its own `--c2-button-group__*` variables) above the grid, opening on the kind of the current week. Without
 * it every event shows each week. Today's column is tinted, inside the grid lines, and carries a line at the current
 * time. Overlapping events sit side by side; the hour range grows to fit every event.
 *
 * @tag c2-week-planner
 *
 * @event {CustomEvent<WeekPlannerEventClickDetail>} event-click - Fired when an event block is activated; `detail.event` is the entry from `events`.
 * @event {CustomEvent<WeekPlannerParityChangeDetail>} parity-change - Fired when the switch shows the other kind of week; `detail.parity` is `odd` or `even`.
 *
 * @csspart event - Each event block.
 *
 * @cssproperty {color} [--c2-week-planner--background=#ffffff]
 * @cssproperty {color} [--c2-week-planner--color=#18181b]
 * @cssproperty {border} [--c2-week-planner--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-week-planner--border-radius=8px]
 * @cssproperty {padding} [--c2-week-planner--padding=12px]
 * @cssproperty {font-family} [--c2-week-planner--font-family=inherit]
 * @cssproperty {font-size} [--c2-week-planner--font-size=14px]
 * @cssproperty {border} [--c2-week-planner__grid--border=1px solid #e4e4e7] - Lines between the day columns.
 * @cssproperty {border} [--c2-week-planner__hour--border=1px solid #f4f4f5] - Line under each hour.
 * @cssproperty {pixel} [--c2-week-planner__hour--height=48px]
 * @cssproperty {pixel} [--c2-week-planner__hour-label--width=48px]
 * @cssproperty {color} [--c2-week-planner__hour-label--color=#71717a]
 * @cssproperty {font-size} [--c2-week-planner__hour-label--font-size=11px]
 * @cssproperty {color} [--c2-week-planner__day-header--color=#71717a]
 * @cssproperty {font-size} [--c2-week-planner__day-header--font-size=12px]
 * @cssproperty {color} [--c2-week-planner__day-header__today--color=rgb(2, 101, 220)]
 * @cssproperty {font-weight} [--c2-week-planner__day-header__today--font-weight=600]
 * @cssproperty {color} [--c2-week-planner__day__today--background=rgba(2, 101, 220, 0.05)] - Tint of today's column.
 * @cssproperty {color} [--c2-week-planner__now--color=#dc2626] - Line at the current time.
 * @cssproperty {color} [--c2-week-planner__event--background=rgb(2, 101, 220)] - Block colour of an event without its own `color`.
 * @cssproperty {color} [--c2-week-planner__event--color=#ffffff]
 * @cssproperty {border-radius} [--c2-week-planner__event--border-radius=4px]
 * @cssproperty {font-size} [--c2-week-planner__event--font-size=12px]
 * @cssproperty {font-weight} [--c2-week-planner__event--font-weight=500]
 * @cssproperty {opacity} [--c2-week-planner__event__hover--opacity=0.88]
 * @cssproperty {outline} [--c2-week-planner__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-week-planner__focus--outline-offset=2px]
 */
@customElement('c2-week-planner')
export class WeekPlanner extends LitElement {
  static override styles = unsafeCSS(styles)

  @state() private now = new Date()
  private clock?: ReturnType<typeof setInterval>

  /** The typical week: `{ id?, title, day, start, end, weeks?, color? }` entries. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) events: WeekPlannerEvent[] = []
  /** Honours each event's `weeks` and shows the Odd week | Even week switch. Off by default: every event shows each week. */
  @property({ type: Boolean, attribute: 'alternate-weeks' }) alternateWeeks = false
  /** Kind of week shown with `alternate-weeks`. Defaults to the kind of the current ISO week. */
  @property({ type: String }) parity: WeekPlannerParity | '' = ''
  /** First hour on the scale; earlier events extend it. */
  @property({ type: Number, attribute: 'start-hour' }) startHour = 8
  /** Last hour on the scale; later events extend it. */
  @property({ type: Number, attribute: 'end-hour' }) endHour = 18
  /** First day of the week. */
  @property({ attribute: 'week-start', reflect: true }) weekStart: WeekPlannerWeekStart = 'monday'
  /** Locale used for the day names. Defaults to the document language. */
  @property({ type: String }) locale = ''
  /** Accessible name for the planner. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = 'Week plan'

  override connectedCallback() {
    super.connectedCallback()
    this.now = new Date()
    this.clock = setInterval(() => (this.now = new Date()), 60_000)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    clearInterval(this.clock)
  }

  private get effectiveLocale() {
    return this.locale || this.ownerDocument?.documentElement.lang || 'en-US'
  }

  private get currentParity(): WeekPlannerParity {
    return isoWeek(this.now) % 2 === 0 ? 'even' : 'odd'
  }

  private get shownParity(): WeekPlannerParity {
    return this.parity === 'odd' || this.parity === 'even' ? this.parity : this.currentParity
  }

  private get validEvents() {
    return (Array.isArray(this.events) ? this.events : []).flatMap((event) => {
      const from = minutesOf(event?.start)
      const to = minutesOf(event?.end)
      return from !== null && to !== null && to > from && DAYS.includes(event.day) ? [{ event, from, to }] : []
    })
  }

  private showParity(parity: WeekPlannerParity) {
    if (parity === this.shownParity) return
    this.parity = parity
    this.dispatchEvent(new CustomEvent<WeekPlannerParityChangeDetail>('parity-change', { detail: { parity }, bubbles: true, composed: true }))
  }

  private openEvent(event: WeekPlannerEvent) {
    this.dispatchEvent(new CustomEvent<WeekPlannerEventClickDetail>('event-click', { detail: { event }, bubbles: true, composed: true }))
  }

  private renderSwitch() {
    const week = isoWeek(this.now)
    const shown = this.shownParity
    return html`<header class="header">
      <c2-button-group
        class="switch"
        appearance="segmented"
        size="s"
        aria-label="Kind of week"
        .value=${shown}
        @change=${(event: CustomEvent<{ value: string }>) => {
          // The group's change is composed; the planner reports it as parity-change instead.
          event.stopPropagation()
          if (event.detail.value === 'odd' || event.detail.value === 'even') this.showParity(event.detail.value)
        }}
      >
        <c2-button value="odd">Odd week</c2-button>
        <c2-button value="even">Even week</c2-button>
      </c2-button-group>
      <span class="current">This week (${week}) is ${this.currentParity}</span>
    </header>`
  }

  override render() {
    const all = this.validEvents
    const usesParity = this.alternateWeeks
    const shown = this.shownParity
    const visible = all.filter(({ event }) => !usesParity || !event.weeks || event.weeks === 'all' || event.weeks === shown)

    const firstHour = Math.max(0, Math.min(Number.isFinite(this.startHour) ? Math.floor(this.startHour) : 8, ...all.map((item) => Math.floor(item.from / 60))))
    const lastHour = Math.min(24, Math.max(Number.isFinite(this.endHour) ? Math.ceil(this.endHour) : 18, ...all.map((item) => Math.ceil(item.to / 60))))
    const hours = Math.max(1, lastHour - firstHour)

    const order = this.weekStart === 'sunday' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6, 0]
    const shortName = new Intl.DateTimeFormat(this.effectiveLocale, { weekday: 'short' })
    const longName = new Intl.DateTimeFormat(this.effectiveLocale, { weekday: 'long' })
    // 2024-01-07 is a Sunday: index 0 of DAYS.
    const dayDate = (index: number) => new Date(2024, 0, 7 + index, 12)
    const todayShown = !usesParity || shown === this.currentParity
    const today = todayShown ? this.now.getDay() : -1
    const nowMinutes = this.now.getHours() * 60 + this.now.getMinutes()
    const nowOffset = nowMinutes / 60 - firstHour

    return html`<section class="c2-week-planner" aria-label=${this.ariaLabel ?? nothing}>
      ${usesParity ? this.renderSwitch() : nothing}
      <div class="grid" style=${styleMap({ '--hours': String(hours) })}>
        <div class="corner"></div>
        ${order.map((index) => html`<div class="day-header ${index === today ? 'today' : ''}" aria-hidden="true">${shortName.format(dayDate(index))}</div>`)}
        <div class="hours" aria-hidden="true">
          ${Array.from({ length: hours }, (_, hour) => html`<div class="hour-label">${formatMinutes((firstHour + hour) * 60)}</div>`)}
        </div>
        ${order.map((index) => {
          const day = DAYS[index]
          const dayName = longName.format(dayDate(index))
          const placed = placeDay(visible.filter(({ event }) => event.day === day))
          return html`<div class="day ${index === today ? 'today' : ''}" role="group" aria-label=${index === today ? `${dayName}, today` : dayName}>
            ${Array.from({ length: hours }, () => html`<div class="hour-line"></div>`)}
            ${placed.map(
              (item) =>
                html`<button
                  class="event ${item.to - item.from < 45 ? 'short' : ''}"
                  type="button"
                  part="event"
                  aria-label=${`${item.event.title}, ${dayName} ${formatMinutes(item.from)} to ${formatMinutes(item.to)}`}
                  title=${item.event.title}
                  style=${styleMap({
                    '--from': String(item.from / 60 - firstHour),
                    '--span': String((item.to - item.from) / 60),
                    '--column': String(item.column),
                    '--columns': String(item.columns),
                    '--event-color': item.event.color || null,
                  })}
                  @click=${() => this.openEvent(item.event)}
                >
                  <span class="event-title">${item.event.title}</span>
                  <span class="event-time">${formatMinutes(item.from)}–${formatMinutes(item.to)}</span>
                </button>`,
            )}
            ${
              index === today && nowOffset >= 0 && nowOffset <= hours
                ? html`<div class="now" style=${styleMap({ '--from': String(nowOffset) })} aria-hidden="true"></div>`
                : nothing
            }
          </div>`
        })}
      </div>
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-week-planner': WeekPlanner
  }
}
