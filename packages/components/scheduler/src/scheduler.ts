import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { firstDayOfWeek, resolveLocale } from '@c2n/core/locale-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
// Registers `c2-button-group` and `c2-button`, the view switch.
import '@c2n/button-group'
import {
  MINUTES_PER_DAY,
  addMonths,
  assignLanes,
  columnAt,
  dayIso,
  fractionOf,
  fromMinutes,
  localeWeekend,
  minutesAt,
  nowIn,
  parseClock,
  parseClockRange,
  snapMinutes,
  startOfDay,
  toMinutes,
  viewColumns,
  viewRange,
  weekdayOf,
  type SchedulerColumn,
  type SchedulerRange,
  type SchedulerView,
} from './scheduler-model.js'
import { schedulerMessages } from './messages.js'
import styles from './scheduler.scss?inline'

export type { SchedulerView } from './scheduler-model.js'
export { schedulerMessages } from './messages.js'

/** A row of the scheduler: a person, a room, a machine. */
export interface SchedulerResource {
  id: string
  label: string
  /** Resources sharing a group sit together under a collapsible group row. */
  group?: string
  /** A second line under the label ("Product designer", "8 seats"). */
  description?: string
  /** Image URL for the avatar; without one the avatar shows the label's initials. */
  avatar?: string
  /** Colour of the avatar and of the resource's bars that have no colour of their own. */
  color?: string
}

/** A booking: a bar on its resource's row from `start` to `end`. */
export interface SchedulerEvent {
  id: string
  /** The `id` of the resource the booking belongs to. */
  resource: string
  /** Wall-clock start, `YYYY-MM-DDTHH:mm` (or `YYYY-MM-DD` for midnight), read in `time-zone`. */
  start: string
  /** Wall-clock end, same shape, after `start`. */
  end: string
  title: string
  description?: string
  /** Bar colour, any CSS colour. Defaults to the resource's colour, then `--c2-scheduler__event--color`. */
  color?: string
  /** Keeps the bar in place when the scheduler is `editable`. */
  readonly?: boolean
}

export interface SchedulerRangeSelectDetail {
  /** The `id` of the resource. */
  resource: string
  /** `YYYY-MM-DDTHH:mm`. */
  start: string
  /** `YYYY-MM-DDTHH:mm`. */
  end: string
}

export interface SchedulerEventChangeDetail {
  /** The entry from `events`, unchanged. */
  event: SchedulerEvent
  /** New start, `YYYY-MM-DDTHH:mm`. */
  start: string
  /** New end, `YYYY-MM-DDTHH:mm`. */
  end: string
  /** New resource `id` (the same one when only the time changed). */
  resource: string
}

export interface SchedulerEventClickDetail {
  event: SchedulerEvent
}

export interface SchedulerRangeChangeDetail {
  /** The `date` now shown, `YYYY-MM-DD`. */
  date: string
  view: SchedulerView
  /** First day shown, `YYYY-MM-DD`. */
  start: string
  /** Last day shown, `YYYY-MM-DD`. */
  end: string
}

/** Events fired by {@link Scheduler}, keyed for `addEventListener`. */
export interface SchedulerEventMap {
  'range-select': CustomEvent<SchedulerRangeSelectDetail>
  'event-change': CustomEvent<SchedulerEventChangeDetail>
  'event-click': CustomEvent<SchedulerEventClickDetail>
  'date-change': CustomEvent<SchedulerRangeChangeDetail>
  'view-change': CustomEvent<SchedulerRangeChangeDetail>
}

export interface Scheduler {
  addEventListener: TypedAddEventListener<Scheduler, SchedulerEventMap>
  removeEventListener: TypedRemoveEventListener<Scheduler, SchedulerEventMap>
}

/** An event placed on the grid. */
interface Placed {
  event: SchedulerEvent
  start: number
  end: number
  lane: number
}

/** A row as drawn: a group header or a resource with its placed bars. */
type Row =
  { kind: 'group'; group: string; count: number; collapsed: boolean } | { kind: 'resource'; resource: SchedulerResource; placed: Placed[]; lanes: number }

/** A pointer gesture: a click until it moves past the threshold, then a drag. */
interface Gesture {
  mode: 'move' | 'resize-start' | 'resize-end' | 'create'
  pointerId: number
  x: number
  /** The time under the pointer when it went down. */
  origin: number
  resource: string
  placed?: Placed
  started: boolean
  cancelled: boolean
}

/** Where a drag would put a bar, or the range a drag on empty time covers. */
interface Preview {
  event?: SchedulerEvent
  resource: string
  start: number
  end: number
}

const DRAG_THRESHOLD = 4

/** `Intl.DateTimeFormat` is costly to build and a render asks for the same few dozens of times: one per locale and options. */
const formatters = new Map<string, Intl.DateTimeFormat>()
function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options)
    formatters.set(key, format)
  }
  return format
}
const VIEWS: SchedulerView[] = ['day', 'week', 'month']

function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '').slice(0, 2)).toUpperCase()
}

/** Restricts a colour to a CSS colour value: anything with `;`, braces or `url(` is dropped. */
function safeColor(value: string | undefined): string | null {
  return typeof value === 'string' && value && !/[;{}]|url\(/i.test(value) ? value : null
}

/**
 * A resource timeline: people, rooms or machines down the side, time across the top, each booking a bar on its
 * resource's row (the resource view of FullCalendar or Google Calendar's room view).
 *
 * `resources` lists the rows (`{ id, label, group?, description?, avatar?, color? }`); resources sharing a `group`
 * sit under a group row that collapses. `events` lists the bookings (`{ id, resource, start, end, title, color?,
 * readonly? }`) with wall-clock `YYYY-MM-DDTHH:mm` times. Bookings that overlap on one resource stack in lanes and
 * the row grows to fit them.
 *
 * `view` is `day` (one column per `slot-minutes`), `week` or `month` (one column per day) around `date`
 * (`YYYY-MM-DD`, today when empty). `day-start` and `day-end` bound the hours drawn, and `scroll-time` is where the
 * day view opens. In the day view the hours outside `working-hours` are shaded; every view shades the locale's
 * weekend. A line marks the current time in `time-zone`, under the bars. The header holds the range, previous /
 * Today / next buttons and a Day | Week | Month switch; they set `date` and `view` and fire `date-change` and
 * `view-change`. `hide-header` drops it for an app that drives the range from its own toolbar.
 *
 * With `editable` the user arranges bookings, and the scheduler reports what they asked for; it never changes
 * `events` itself, the app does:
 * - Dragging across empty time fires `range-select` with `{ resource, start, end }`, snapped to `snap-minutes`; a
 *   click selects the column under the pointer.
 * - Dragging a bar moves it in time and to another row; dragging either edge resizes it. Both fire `event-change`
 *   with `{ event, start, end, resource }`. A preview follows the pointer, and Escape cancels.
 * - `readonly` bookings stay in place. `event-click` fires on any bar.
 *
 * The grid is one Tab stop holding a slot cursor. The arrow keys move it over every slot of a row, booked or free,
 * Up/Down to the same slot of the next row, Home/End to the first and last slot; a booked slot is read with its
 * bookings. Enter (or Space) on a booked slot focuses its first bar; on a free slot, with `editable`, it fires
 * `range-select` for that slot. On a bar, with `editable`, Left/Right move it by `snap-minutes`, Shift+Left/Right
 * change its end and Alt+Up/Down move it to the previous or next resource; Up/Down go to the next row, and Escape goes
 * back to the slot cursor where Enter left it. Each bar is named by its title, resource and time, and moves are
 * announced.
 *
 * @tag c2-scheduler
 *
 * @event range-select - With `editable`, a range of empty time was picked by dragging, clicking or Enter. `detail`: `{ resource, start, end }`.
 * @event event-change - With `editable`, a bar was moved or resized. `detail`: `{ event, start, end, resource }`; apply it to `events`.
 * @event event-click - A bar was clicked or activated with Enter or Space. `detail`: `{ event }`.
 * @event date-change - The header changed the range shown. `detail`: `{ date, view, start, end }`.
 * @event view-change - The view switch changed the view. `detail`: `{ date, view, start, end }`.
 *
 * @csspart header - The header with the range, navigation and view switch.
 * @csspart grid - The scrolling grid of resources and time.
 * @csspart event - Each booking bar.
 *
 * @cssproperty {color} [--c2-scheduler--background-color=#ffffff] - Background of the scheduler and its sticky column.
 * @cssproperty {color} [--c2-scheduler--color=#18181b] - Text colour.
 * @cssproperty {border} [--c2-scheduler--border=1px solid #e4e4e7] - Outer border.
 * @cssproperty {pixel} [--c2-scheduler--border-radius=8px] - Outer corner radius.
 * @cssproperty {length} [--c2-scheduler--max-height=none] - Height past which the grid scrolls, with sticky headers.
 * @cssproperty {length} [--c2-scheduler__header--padding=10px 12px] - Padding of the header.
 * @cssproperty {length} [--c2-scheduler__header--font-size=15px] - Font size of the range label.
 * @cssproperty {pixel} [--c2-scheduler__navigation--border-radius=6px] - Corner radius of the previous, Today and next buttons.
 * @cssproperty {color} [--c2-scheduler__navigation__hover--background-color=#f4f4f5] - Background of those buttons on hover.
 * @cssproperty {color} [--c2-scheduler__line--color=#e4e4e7] - Grid lines and row separators.
 * @cssproperty {color} [--c2-scheduler__muted--color=#71717a] - Scale labels, descriptions and group rows.
 * @cssproperty {length} [--c2-scheduler__resource--width=180px] - Width of the resource column.
 * @cssproperty {length} [--c2-scheduler__row--height=52px] - Least height of a resource row.
 * @cssproperty {length} [--c2-scheduler__lane--height=24px] - Height of each lane when bookings overlap.
 * @cssproperty {length} [--c2-scheduler__slot--width=88px] - Least width of a column in the day view.
 * @cssproperty {length} [--c2-scheduler__day--width=120px] - Least width of a day in the week view.
 * @cssproperty {length} [--c2-scheduler__month-day--width=44px] - Least width of a day in the month view.
 * @cssproperty {color} [--c2-scheduler__group--background-color=#fafafa] - Background of group rows.
 * @cssproperty {color} [--c2-scheduler__off--color=color-mix(in srgb, currentColor 7%, transparent)] - Stripes over non-working hours and the weekend.
 * @cssproperty {color} [--c2-scheduler__today--color=rgb(2, 101, 220)] - Today's header label.
 * @cssproperty {color} [--c2-scheduler__now--color=#dc2626] - The current-time line.
 * @cssproperty {color} [--c2-scheduler__event--color=rgb(2, 101, 220)] - Bar colour when neither the booking nor its resource has one.
 * @cssproperty {color} [--c2-scheduler__event--text-color=#18181b] - Text on bars.
 * @cssproperty {pixel} [--c2-scheduler__event--border-radius=6px] - Corner radius of bars.
 * @cssproperty {length} [--c2-scheduler__event--font-size=12px] - Font size of bars.
 * @cssproperty {length} [--c2-scheduler__avatar--size=28px] - Size of resource avatars.
 * @cssproperty {outline} [--c2-scheduler__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of bars, the slot cursor and buttons.
 */
@customElement('c2-scheduler')
export class Scheduler extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The rows: `{ id, label, group?, description?, avatar?, color? }`. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) resources: SchedulerResource[] = []
  /** The bookings: `{ id, resource, start, end, title, color?, readonly? }`. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) events: SchedulerEvent[] = []
  /** A day of the range shown, `YYYY-MM-DD`. Defaults to today in `time-zone`. */
  @property({ reflect: true }) date = ''
  /** `day`, `week` or `month`. */
  @property({ reflect: true }) view: SchedulerView = 'day'
  /** First hour drawn each day, `HH:mm`. */
  @property({ attribute: 'day-start' }) dayStart = '00:00'
  /** Last hour drawn each day, `HH:mm` (`24:00` for midnight). */
  @property({ attribute: 'day-end' }) dayEnd = '24:00'
  /** Where the day view scrolls to when it is first drawn, `HH:mm`. */
  @property({ attribute: 'scroll-time' }) scrollTime = '08:00'
  /** Minutes per column in the day view; also the slot the keyboard cursor and a click select. */
  @property({ type: Number, attribute: 'slot-minutes' }) slotMinutes = 60
  /** Step, in minutes, that drags and keyboard moves snap to. */
  @property({ type: Number, attribute: 'snap-minutes' }) snapMinutes = 15
  /** Working hours, `HH:mm-HH:mm`; the day view shades the hours outside them. Empty shades none. */
  @property({ attribute: 'working-hours' }) workingHours = '09:00-18:00'
  /** IANA time zone the current-time line and Today follow, e.g. `Europe/Paris`. Empty means the browser's own. */
  @property({ attribute: 'time-zone' }) timeZone = ''
  /** Lets the user create, move and resize bookings; see `range-select` and `event-change`. */
  @property({ type: Boolean }) editable = false
  /** Hides the header for an app that drives `date` and `view` from its own controls. */
  @property({ type: Boolean, attribute: 'hide-header' }) hideHeader = false
  /** Header of the resource column. Defaults to "Resources" in the scheduler's language. */
  @property({ attribute: 'resource-heading' }) resourceHeading = ''
  /** Accessible name of the grid. Defaults to "Schedule" in the scheduler's language. */
  @property() label = ''
  /** Language of dates and built-in text, e.g. `fr` or `en-GB`. Defaults to the nearest `lang`, else the browser's. */
  @property() locale = ''

  /** The wall clock now; unset until the first client render, so a server-rendered grid hydrates unchanged. */
  @state() private now?: number
  @state() private collapsed = new Set<string>()
  @state() private preview?: Preview
  /** The roving focus target: a row's slot cursor, or a bar. */
  @state() private cursor: { resource: string; column: number } | null = null
  @state() private focusedBar = ''
  @state() private cursorVisible = false
  @state() private announcement = ''

  private readonly msg = new LocalizeController(this, schedulerMessages, () => this.locale)
  private clock?: ReturnType<typeof setInterval>
  private gesture?: Gesture
  private suppressClick = false
  /** A bar to focus once the app has applied a keyboard move; dropped as soon as the user does anything else. */
  private refocus = ''
  /** The slot the cursor goes back to when Escape leaves a bar reached with Enter. */
  private barReturn: { resource: string; column: number } | null = null
  /** The range and columns of the last render, which the pointer and keyboard handlers work in. */
  private layout: { range: SchedulerRange; columns: SchedulerColumn[]; rows: Row[] } | null = null
  private scrolledFor = ''

  override connectedCallback() {
    super.connectedCallback()
    this.clock = setInterval(() => (this.now = nowIn(this.timeZone)), 30_000)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    clearInterval(this.clock)
    this.endGesture()
    this.clearRefocus()
  }

  protected override firstUpdated() {
    this.now = nowIn(this.timeZone)
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if ((changed.has('events') || changed.has('resources') || changed.has('date') || changed.has('view') || changed.has('editable')) && this.gesture) {
      this.endGesture()
    }
    if (changed.has('timeZone') && this.hasUpdated) this.now = nowIn(this.timeZone)
  }

  protected override updated(changed: PropertyValues<this>) {
    const key = `${this.view}|${this.anchorDay}|${this.scrollTime}`
    if (this.scrolledFor !== key) {
      this.scrolledFor = key
      this.scrollToTime()
    }
    if (changed.has('events') && this.refocus) {
      const id = this.refocus
      this.clearRefocus()
      // Only while focus is still with the scheduler (or was dropped with the re-rendered bar): never take it back
      // from wherever the user has gone since.
      const active = this.ownerDocument.activeElement
      const inner = this.shadowRoot?.activeElement
      const dropped = !active || active === this.ownerDocument.body
      if (dropped || (active === this && (!inner || inner.classList.contains('event')))) this.focusBar(id)
    }
  }

  private get effectiveLocale(): string {
    return isServer ? resolveLocale(this.locale) : this.msg.locale
  }

  private get snap(): number {
    const snap = Math.round(Number(this.snapMinutes))
    return Number.isFinite(snap) && snap >= 1 ? Math.min(snap, MINUTES_PER_DAY) : 15
  }

  private get slotSize(): number {
    const slot = Math.round(Number(this.slotMinutes))
    return Number.isFinite(slot) && slot >= 5 ? Math.min(slot, MINUTES_PER_DAY) : 60
  }

  private get currentView(): SchedulerView {
    return VIEWS.includes(this.view) ? this.view : 'day'
  }

  /** Midnight of `date`, else of today (the server's or the client's clock until the first render). */
  private get anchorDay(): number {
    const parsed = toMinutes(this.date)
    return startOfDay(parsed ?? this.now ?? nowIn(this.timeZone))
  }

  private get hours(): [number, number] {
    const start = parseClock(this.dayStart) ?? 0
    const end = parseClock(this.dayEnd) ?? MINUTES_PER_DAY
    return end > start ? [start, end] : [0, MINUTES_PER_DAY]
  }

  // ------------------------------------------------------------------------------------------------- formatting

  private format(options: Intl.DateTimeFormatOptions, minutes: number): string {
    try {
      return dateFormat(this.effectiveLocale, { ...options, timeZone: 'UTC' }).format(new Date(minutes * 60_000))
    } catch {
      return fromMinutes(minutes)
    }
  }

  /** `2-digit` hours on a 24-hour clock (`09:00`), `numeric` on a 12-hour one (`9:00 AM`). */
  private get hourStyle(): '2-digit' | 'numeric' {
    try {
      // `hourCycle` (ES2020 Intl) is missing from the library's target typings.
      const cycle = (dateFormat(this.effectiveLocale, { hour: 'numeric' }).resolvedOptions() as { hourCycle?: string }).hourCycle
      return cycle === 'h11' || cycle === 'h12' ? 'numeric' : '2-digit'
    } catch {
      return '2-digit'
    }
  }

  private time(minutes: number): string {
    return this.format({ hour: this.hourStyle, minute: '2-digit' }, minutes)
  }

  /** A range as read aloud: "Monday 9:00 to 10:30", or with both days when it spans several. */
  private spoken(start: number, end: number): string {
    const sameDay = startOfDay(start) === startOfDay(end - 1)
    const day = (minutes: number) => this.format({ weekday: 'long', month: 'long', day: 'numeric' }, minutes)
    if (sameDay) return `${day(start)}, ${this.msg.t('range', this.time(start), this.time(end))}`
    return this.msg.t('range', `${day(start)} ${this.time(start)}`, `${day(end)} ${this.time(end)}`)
  }

  /** A bar's visible time: "09:00–10:30" in one day, "Mon 08:00 – Tue 14:00" across days. */
  private shown(start: number, end: number): { full: string; short: string } {
    if (startOfDay(start) === startOfDay(end - 1)) {
      const onHour = start % 60 === 0 && end % 60 === 0
      const hour = (minutes: number) => this.format({ hour: this.hourStyle }, minutes)
      const short = onHour ? `${hour(start)}–${hour(end)}` : `${this.time(start)}–${this.time(end)}`
      return { full: `${this.time(start)}–${this.time(end)}`, short }
    }
    const day = (minutes: number) => this.format({ weekday: 'short' }, minutes)
    const full = `${day(start)} ${this.time(start)} – ${day(end)} ${this.time(end)}`
    return { full, short: `${day(start)} – ${day(end)}` }
  }

  private rangeTitle(range: SchedulerRange): string {
    const view = this.currentView
    if (view === 'day') return this.format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }, range.days[0])
    if (view === 'month') return this.format({ month: 'long', year: 'numeric' }, range.days[0])
    const format = dateFormat(this.effectiveLocale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    const formatRange = (format as Intl.DateTimeFormat & { formatRange?: (from: Date, to: Date) => string }).formatRange
    const [first, last] = [new Date(range.days[0] * 60_000), new Date(range.days[range.days.length - 1] * 60_000)]
    return formatRange ? formatRange.call(format, first, last) : `${format.format(first)} – ${format.format(last)}`
  }

  // ------------------------------------------------------------------------------------------------- model

  private computeRows(range: SchedulerRange): Row[] {
    const resources = (Array.isArray(this.resources) ? this.resources : []).filter((resource) => resource && typeof resource.id === 'string')
    const byResource = new Map<string, Placed[]>()
    for (const event of Array.isArray(this.events) ? this.events : []) {
      if (!event || typeof event.resource !== 'string') continue
      const start = toMinutes(event.start)
      const end = toMinutes(event.end)
      if (start === null || end === null || end <= start || end <= range.start || start >= range.end) continue
      // In a range of separate days (hours drawn only part of the day), a booking entirely in the hidden hours is not drawn.
      if (fractionOf(range, start) === fractionOf(range, end)) continue
      const list = byResource.get(event.resource) ?? []
      list.push({ event, start, end, lane: 0 })
      byResource.set(event.resource, list)
    }
    const resourceRow = (resource: SchedulerResource): Row => {
      const placed = (byResource.get(resource.id) ?? []).sort((a, b) => a.start - b.start || b.end - a.end)
      const { lanes, count } = assignLanes(placed.map((item) => ({ start: fractionOf(range, item.start), end: fractionOf(range, item.end) })))
      placed.forEach((item, index) => (item.lane = lanes[index]))
      return { kind: 'resource', resource, placed, lanes: count }
    }
    // Ungrouped resources first, then each group in the order it first appears.
    const rows: Row[] = resources.filter((resource) => !resource.group).map(resourceRow)
    const groups = new Map<string, SchedulerResource[]>()
    for (const resource of resources) if (resource.group) groups.set(resource.group, [...(groups.get(resource.group) ?? []), resource])
    for (const [group, members] of groups) {
      const collapsed = this.collapsed.has(group)
      rows.push({ kind: 'group', group, count: members.length, collapsed })
      if (!collapsed) rows.push(...members.map(resourceRow))
    }
    return rows
  }

  private resourceRows(): Extract<Row, { kind: 'resource' }>[] {
    return (this.layout?.rows ?? []).filter((row): row is Extract<Row, { kind: 'resource' }> => row.kind === 'resource')
  }

  private resourceOf(id: string): SchedulerResource | undefined {
    return (Array.isArray(this.resources) ? this.resources : []).find((resource) => resource?.id === id)
  }

  private colorOf(event: SchedulerEvent): string | null {
    return safeColor(event.color) ?? safeColor(this.resourceOf(event.resource)?.color)
  }

  // ------------------------------------------------------------------------------------------------- navigation

  private emitRange(type: 'date-change' | 'view-change') {
    const range = viewRange(this.currentView, this.anchorDay, this.firstWeekday, ...this.hours)
    const detail: SchedulerRangeChangeDetail = {
      date: dayIso(this.anchorDay),
      view: this.currentView,
      start: dayIso(range.days[0]),
      end: dayIso(range.days[range.days.length - 1]),
    }
    // Literal names, so the manifest records the two events rather than the parameter.
    const options = { detail, bubbles: true, composed: true }
    this.dispatchEvent(
      type === 'date-change'
        ? new CustomEvent<SchedulerRangeChangeDetail>('date-change', options)
        : new CustomEvent<SchedulerRangeChangeDetail>('view-change', options),
    )
  }

  private page(direction: 1 | -1) {
    const view = this.currentView
    const day = this.anchorDay
    const next = view === 'month' ? addMonths(day, direction) : day + direction * (view === 'week' ? 7 : 1) * MINUTES_PER_DAY
    this.date = dayIso(next)
    this.emitRange('date-change')
  }

  private goToday() {
    const today = dayIso(nowIn(this.timeZone))
    if (today === dayIso(this.anchorDay) && this.date) return
    this.date = today
    this.emitRange('date-change')
  }

  private setView(view: string) {
    if (!VIEWS.includes(view as SchedulerView) || view === this.currentView) return
    this.view = view as SchedulerView
    this.cursor = null
    this.emitRange('view-change')
  }

  private get firstWeekday(): number {
    return firstDayOfWeek(this.effectiveLocale)
  }

  private scrollToTime() {
    const scroller = this.renderRoot.querySelector<HTMLElement>('.scroller')
    const timeline = this.renderRoot.querySelector<HTMLElement>('.scale')
    if (!scroller || !timeline || !this.layout) return
    if (this.currentView !== 'day') {
      scroller.scrollLeft = 0
      return
    }
    const time = parseClock(this.scrollTime)
    if (time === null) return
    scroller.scrollLeft = fractionOf(this.layout.range, this.layout.range.days[0] + time) * timeline.offsetWidth
  }

  // ------------------------------------------------------------------------------------------------- pointer

  /** The time under the pointer on a lane, snapped to `snap-minutes`. */
  private timeAt(clientX: number, lane: Element, floor = false): number {
    const rect = lane.getBoundingClientRect()
    const rtl = getComputedStyle(this).direction === 'rtl'
    const fraction = rect.width ? (rtl ? rect.right - clientX : clientX - rect.left) / rect.width : 0
    return snapMinutes(minutesAt(this.layout!.range, Math.min(1, Math.max(0, fraction))), this.snap, floor)
  }

  /** The resource whose lane is under the pointer's height, or the nearest one. */
  private resourceAt(clientY: number): string | undefined {
    let best: string | undefined
    let distance = Infinity
    for (const lane of this.renderRoot.querySelectorAll<HTMLElement>('.lane[data-resource]')) {
      const rect = lane.getBoundingClientRect()
      const gap = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0
      if (gap < distance) {
        distance = gap
        best = lane.dataset.resource
      }
    }
    return best
  }

  private laneOf(resource: string): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`.lane[data-resource="${CSS.escape(resource)}"]`)
  }

  private startBarGesture(event: PointerEvent, placed: Placed) {
    if (!this.editable || placed.event.readonly || event.button !== 0 || !event.isPrimary || this.gesture) return
    const lane = this.laneOf(placed.event.resource)
    if (!lane) return
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle')
    this.beginGesture(event, {
      mode: handle === 'start' ? 'resize-start' : handle === 'end' ? 'resize-end' : 'move',
      pointerId: event.pointerId,
      x: event.clientX,
      origin: this.timeAt(event.clientX, lane),
      resource: placed.event.resource,
      placed,
      started: false,
      cancelled: false,
    })
  }

  private startCreateGesture(event: PointerEvent, resource: string) {
    if (!this.editable || event.button !== 0 || !event.isPrimary || this.gesture) return
    if ((event.target as Element).closest('.event')) return
    const lane = event.currentTarget as HTMLElement
    this.beginGesture(event, {
      mode: 'create',
      pointerId: event.pointerId,
      x: event.clientX,
      origin: this.timeAt(event.clientX, lane, true),
      resource,
      started: false,
      cancelled: false,
    })
  }

  private beginGesture(event: PointerEvent, gesture: Gesture) {
    this.gesture = gesture
    try {
      ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    } catch {
      // A synthetic pointer cannot be captured; the gesture still follows the element's own events.
    }
    this.ownerDocument.addEventListener('keydown', this.handleGestureKey, true)
  }

  private moveGesture(event: PointerEvent) {
    const gesture = this.gesture
    if (!gesture || gesture.cancelled || event.pointerId !== gesture.pointerId || !this.layout) return
    if (!gesture.started && Math.abs(event.clientX - gesture.x) < DRAG_THRESHOLD) return
    gesture.started = true
    const lane = this.laneOf(gesture.resource)
    if (!lane) return
    const snap = this.snap
    if (gesture.mode === 'create') {
      const here = this.timeAt(event.clientX, lane)
      const [start, end] = here >= gesture.origin ? [gesture.origin, Math.max(here, gesture.origin + snap)] : [here, gesture.origin + snap]
      this.preview = { resource: gesture.resource, start, end }
      return
    }
    const placed = gesture.placed!
    const delta = this.timeAt(event.clientX, lane) - gesture.origin
    if (gesture.mode === 'resize-end') {
      this.preview = { event: placed.event, resource: placed.event.resource, start: placed.start, end: Math.max(placed.start + snap, placed.end + delta) }
    } else if (gesture.mode === 'resize-start') {
      this.preview = { event: placed.event, resource: placed.event.resource, start: Math.min(placed.end - snap, placed.start + delta), end: placed.end }
    } else {
      const resource = this.resourceAt(event.clientY) ?? placed.event.resource
      this.preview = { event: placed.event, resource, start: placed.start + delta, end: placed.end + delta }
    }
  }

  private endPointer(event: PointerEvent, commit: boolean) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const preview = this.preview
    if (gesture.started || gesture.cancelled) {
      // The click that follows a drop belongs to the drag.
      this.suppressClick = true
      setTimeout(() => (this.suppressClick = false))
    }
    this.endGesture()
    if (!commit || gesture.cancelled) return
    if (gesture.mode === 'create') {
      if (gesture.started && preview) this.selectRange(preview.resource, preview.start, preview.end)
      else if (!gesture.started && this.layout) {
        // A click selects the column under the pointer.
        const column = this.layout.columns[columnAt(this.layout.columns, gesture.origin)]
        if (column) this.selectRange(gesture.resource, column.start, column.end)
      }
      return
    }
    if (!gesture.started || !preview?.event) return
    const placed = gesture.placed!
    if (preview.start === placed.start && preview.end === placed.end && preview.resource === placed.event.resource) return
    this.changeEvent(placed.event, preview.start, preview.end, preview.resource)
  }

  private endGesture() {
    this.gesture = undefined
    this.preview = undefined
    this.ownerDocument?.removeEventListener('keydown', this.handleGestureKey, true)
  }

  /** Escape drops a drag in progress; the bar stays where it was. */
  private readonly handleGestureKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.gesture) return
    event.preventDefault()
    event.stopPropagation()
    this.gesture.cancelled = true
    this.preview = undefined
    this.announce(this.msg.t('cancelled'))
  }

  // ------------------------------------------------------------------------------------------------- reports

  private selectRange(resource: string, start: number, end: number) {
    const detail: SchedulerRangeSelectDetail = { resource, start: fromMinutes(start), end: fromMinutes(end) }
    this.announce(this.msg.t('selected', this.resourceOf(resource)?.label ?? resource, this.spoken(start, end)))
    this.dispatchEvent(new CustomEvent<SchedulerRangeSelectDetail>('range-select', { detail, bubbles: true, composed: true }))
  }

  private changeEvent(event: SchedulerEvent, start: number, end: number, resource: string) {
    const detail: SchedulerEventChangeDetail = { event, start: fromMinutes(start), end: fromMinutes(end), resource }
    this.dispatchEvent(new CustomEvent<SchedulerEventChangeDetail>('event-change', { detail, bubbles: true, composed: true }))
  }

  private openEvent(event: SchedulerEvent) {
    if (this.suppressClick) return
    this.dispatchEvent(new CustomEvent<SchedulerEventClickDetail>('event-click', { detail: { event }, bubbles: true, composed: true }))
  }

  private announce(text: string) {
    // Clearing first makes a repeated message (two moves to the same slot) read again.
    this.announcement = ''
    void this.updateComplete.then(() => (this.announcement = text))
  }

  // ------------------------------------------------------------------------------------------------- keyboard

  private focusBar(id: string) {
    const bar = [...this.renderRoot.querySelectorAll<HTMLElement>('.event[data-id]')].find((element) => element.dataset.id === id)
    if (!bar) return
    this.focusedBar = id
    this.cursor = null
    bar.focus()
  }

  private focusCell(resource: string, column: number) {
    const columns = this.layout?.columns ?? []
    this.focusedBar = ''
    this.barReturn = null
    this.cursor = { resource, column: Math.min(columns.length - 1, Math.max(0, column)) }
    void this.updateComplete.then(() => this.laneOf(resource)?.focus())
  }

  /** The row `step` rows away from `resource` among the resource rows shown. */
  private neighbour(resource: string, step: number): string | undefined {
    const rows = this.resourceRows()
    const index = rows.findIndex((row) => row.resource.id === resource)
    return rows[index + step]?.resource.id
  }

  private handleLaneKey(event: KeyboardEvent, row: Extract<Row, { kind: 'resource' }>) {
    if (event.target !== event.currentTarget || !this.layout) return
    const columns = this.layout.columns
    const column = this.cursor?.resource === row.resource.id ? this.cursor.column : 0
    const go = (next: number) => {
      event.preventDefault()
      // The cursor walks every slot, those under bars included; Enter is what steps onto a bar.
      const target = Math.min(columns.length - 1, Math.max(0, next))
      this.cursor = { resource: row.resource.id, column: target }
      this.announce(this.slotName(row.resource, target))
    }
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        const forward = (event.key === 'ArrowRight') !== (getComputedStyle(this).direction === 'rtl')
        go(column + (forward ? 1 : -1))
        return
      }
      case 'Home':
        go(0)
        return
      case 'End':
        go(columns.length - 1)
        return
      case 'ArrowUp':
      case 'ArrowDown': {
        event.preventDefault()
        const next = this.neighbour(row.resource.id, event.key === 'ArrowDown' ? 1 : -1)
        if (next) this.focusCell(next, column)
        return
      }
      case 'Enter':
      case ' ': {
        // A slot with a booking: Enter focuses its first bar. An empty one, with `editable`: a new booking.
        const bar = this.barsIn(row, column)[0]
        if (bar) {
          event.preventDefault()
          this.barReturn = { resource: row.resource.id, column }
          this.focusBar(bar.event.id)
          return
        }
        if (!this.editable) return
        event.preventDefault()
        this.selectRange(row.resource.id, columns[column].start, columns[column].end)
        return
      }
    }
  }

  /** The bars of a row over a column, earliest first. */
  private barsIn(row: Extract<Row, { kind: 'resource' }>, column: number): Placed[] {
    const slot = this.layout?.columns[column]
    if (!slot) return []
    return row.placed.filter((item) => item.start < slot.end && item.end > slot.start).sort((a, b) => a.start - b.start)
  }

  private handleBarKey(event: KeyboardEvent, placed: Placed) {
    if (!this.layout) return
    const columns = this.layout.columns
    const key = event.key
    const resource = placed.event.resource
    const rtl = getComputedStyle(this).direction === 'rtl'
    const horizontal = key === 'ArrowLeft' || key === 'ArrowRight'
    const forward = (key === 'ArrowRight') !== rtl
    const movable = this.editable && !placed.event.readonly
    if (key === 'Escape') {
      event.preventDefault()
      // Back to the slot Enter came from, else to the slot where the bar starts.
      const back = this.barReturn?.resource === resource ? this.barReturn.column : columnAt(columns, placed.start)
      this.focusCell(resource, back)
      return
    }
    if (horizontal && movable && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const snap = this.snap
      let { start, end } = placed
      if (event.shiftKey) end = Math.max(start + snap, end + (forward ? snap : -snap))
      else {
        start += forward ? snap : -snap
        end += forward ? snap : -snap
      }
      this.moveFromKeyboard(placed, start, end, resource)
      return
    }
    if (horizontal && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      // A bar that does not move: step off it to the slot before or after.
      const target = forward ? columnAt(columns, placed.end - 1) + 1 : columnAt(columns, placed.start) - 1
      if (target >= 0 && target < columns.length) this.focusCell(resource, target)
      return
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      event.preventDefault()
      const next = this.neighbour(resource, key === 'ArrowDown' ? 1 : -1)
      if (!next) return
      if (event.altKey && movable) this.moveFromKeyboard(placed, placed.start, placed.end, next)
      else if (!event.altKey) this.focusCell(next, columnAt(columns, placed.start))
    }
  }

  private readonly clearRefocus = () => {
    this.refocus = ''
    this.ownerDocument.removeEventListener('pointerdown', this.clearRefocus, true)
    this.renderRoot.removeEventListener('focusout', this.handleRefocusOut as EventListener)
  }

  /**
   * Focus moved on to another element than a bar (a re-render that drops the bar's focus has no related target):
   * the move is over. Listened on the shadow root, which sees the real element rather than the host.
   */
  private readonly handleRefocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next && !(next instanceof Element && next.classList.contains('event'))) this.clearRefocus()
  }

  private moveFromKeyboard(placed: Placed, start: number, end: number, resource: string) {
    // The app may apply the move, re-render the bar elsewhere and drop its focus; this puts it back. An app that
    // declines leaves `events` alone, and the next pointer press or focus elsewhere forgets it.
    if (!this.refocus) {
      this.ownerDocument.addEventListener('pointerdown', this.clearRefocus, true)
      this.renderRoot.addEventListener('focusout', this.handleRefocusOut as EventListener)
    }
    this.refocus = placed.event.id
    const label = this.resourceOf(resource)?.label ?? resource
    this.announce(this.msg.t('moved', placed.event.title, label, this.spoken(start, end)))
    this.changeEvent(placed.event, start, end, resource)
  }

  private slotName(resource: SchedulerResource, column: number): string {
    const slot = this.layout?.columns[column]
    if (!slot) return resource.label
    const name = this.msg.t('slot', resource.label, this.spoken(slot.start, slot.end))
    const row = this.layout?.rows.find((item): item is Extract<Row, { kind: 'resource' }> => item.kind === 'resource' && item.resource.id === resource.id)
    const titles = row ? this.barsIn(row, column).map((placed) => placed.event.title) : []
    return titles.length ? this.msg.t('slotBookings', name, titles.join(', ')) : name
  }

  private toggleGroup(group: string) {
    const collapsed = new Set(this.collapsed)
    if (collapsed.has(group)) collapsed.delete(group)
    else collapsed.add(group)
    this.collapsed = collapsed
  }

  // ------------------------------------------------------------------------------------------------- render

  private renderHeader(range: SchedulerRange) {
    const view = this.currentView
    const previous = view === 'day' ? 'previousDay' : view === 'week' ? 'previousWeek' : 'previousMonth'
    const next = view === 'day' ? 'nextDay' : view === 'week' ? 'nextWeek' : 'nextMonth'
    return html`<div class="header" part="header">
      <h2 class="title" aria-live="polite">${this.rangeTitle(range)}</h2>
      <div class="navigation">
        <button class="nav" type="button" aria-label=${this.msg.t(previous)} @click=${() => this.page(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button class="nav today" type="button" @click=${this.goToday}>${this.msg.t('today')}</button>
        <button class="nav" type="button" aria-label=${this.msg.t(next)} @click=${() => this.page(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      <c2-button-group
        class="views"
        appearance="segmented"
        size="s"
        aria-label=${this.msg.t('view')}
        .value=${view}
        @change=${(event: CustomEvent<{ value: string }>) => {
          // The group's change is composed; the scheduler reports it as view-change instead.
          event.stopPropagation()
          this.setView(event.detail.value)
        }}
      >
        ${VIEWS.map((option) => html`<c2-button value=${option}>${this.msg.t(option)}</c2-button>`)}
      </c2-button-group>
    </div>`
  }

  private renderScale(range: SchedulerRange, columns: SchedulerColumn[], today: number | undefined) {
    const view = this.currentView
    return html`<div class="scale" role="columnheader" aria-label=${this.rangeTitle(range)}>
      ${columns.map((column) => {
        const isToday = today !== undefined && startOfDay(column.start) === today
        const label =
          view === 'day'
            ? this.time(column.start)
            : view === 'week'
              ? html`${this.format({ weekday: 'short' }, column.start)} ${this.format({ day: 'numeric' }, column.start)}`
              : html`<span class="weekday">${this.format({ weekday: 'narrow' }, column.start)}</span>${this.format({ day: 'numeric' }, column.start)}`
        return html`<span class="tick ${view !== 'day' && isToday ? 'today' : ''}" aria-hidden="true">${label}</span>`
      })}
      ${this.renderNowMarker(range, 'now-head')}
    </div>`
  }

  private renderNowMarker(range: SchedulerRange, className: string) {
    const now = this.now
    if (now === undefined || now < range.start || now > range.end) return nothing
    const minute = now - startOfDay(now)
    if (minute < range.dayStart || minute > range.dayEnd) return nothing
    return html`<div class=${className} aria-hidden="true" style=${styleMap({ '--at': String(fractionOf(range, now)) })}></div>`
  }

  /** Stripes over non-working hours (day view) and the locale's weekend (every view). */
  private renderOff(range: SchedulerRange): TemplateResult[] {
    const weekend = localeWeekend(this.effectiveLocale)
    const blocks: [number, number][] = []
    const working = parseClockRange(this.workingHours)
    for (const day of range.days) {
      if (weekend.includes(weekdayOf(day))) {
        blocks.push([day + range.dayStart, day + range.dayEnd])
        continue
      }
      if (this.currentView === 'day' && working) {
        if (working[0] > range.dayStart) blocks.push([day + range.dayStart, day + Math.min(working[0], range.dayEnd)])
        if (working[1] < range.dayEnd) blocks.push([day + Math.max(working[1], range.dayStart), day + range.dayEnd])
      }
    }
    return blocks
      .filter(([start, end]) => end > start)
      .map(
        ([start, end]) =>
          html`<div
            class="off"
            aria-hidden="true"
            style=${styleMap({ '--from': String(fractionOf(range, start)), '--to': String(fractionOf(range, end)) })}
          ></div>`,
      )
  }

  private renderBar(placed: Placed, row: Extract<Row, { kind: 'resource' }>, range: SchedulerRange, lanes: number, tabbable: boolean) {
    const { event, start, end } = placed
    const movable = this.editable && !event.readonly
    const dragging = this.preview?.event === event
    const time = this.shown(start, end)
    const name =
      this.msg.t('event', event.title, row.resource.label, this.spoken(start, end)) + (this.editable && event.readonly ? `, ${this.msg.t('readonly')}` : '')
    return html`<button
      class="event ${lanes > 1 ? 'stacked' : ''} ${movable ? 'movable' : ''} ${dragging ? 'dragging' : ''} ${start < range.start ? 'clipped-start' : ''} ${end > range.end ? 'clipped-end' : ''}"
      type="button"
      part="event"
      data-id=${event.id}
      tabindex=${tabbable ? '0' : '-1'}
      aria-label=${name}
      title=${event.description ? `${event.title}\n${event.description}` : event.title}
      style=${styleMap({
        '--from': String(fractionOf(range, start)),
        '--to': String(fractionOf(range, end)),
        '--lane': String(placed.lane),
        '--event-color': this.colorOf(event),
      })}
      @click=${() => this.openEvent(event)}
      @focus=${() => {
        this.focusedBar = event.id
        this.cursor = null
      }}
      @keydown=${(keyEvent: KeyboardEvent) => this.handleBarKey(keyEvent, placed)}
      @pointerdown=${(pointer: PointerEvent) => this.startBarGesture(pointer, placed)}
    >
      ${movable ? html`<span class="handle start" data-handle="start" aria-hidden="true"></span>` : nothing}
      <span class="event-title">${event.title}</span>
      <span class="event-time" aria-hidden="true"><span class="full">${time.full}</span><span class="short">${time.short}</span></span>
      ${movable ? html`<span class="handle end" data-handle="end" aria-hidden="true"></span>` : nothing}
    </button>`
  }

  private renderPreview(range: SchedulerRange, resource: string) {
    const preview = this.preview
    if (!preview || preview.resource !== resource) return nothing
    const time = this.shown(preview.start, preview.end)
    return html`<div
      class="preview"
      aria-hidden="true"
      style=${styleMap({
        '--from': String(fractionOf(range, preview.start)),
        '--to': String(fractionOf(range, preview.end)),
        '--event-color': preview.event ? this.colorOf(preview.event) : null,
      })}
    >
      ${preview.event ? html`<span class="event-title">${preview.event.title}</span>` : nothing}
      <span class="event-time">${time.full}</span>
    </div>`
  }

  private renderResource(resource: SchedulerResource) {
    const color = safeColor(resource.color)
    return html`<span class="avatar" aria-hidden="true" style=${styleMap({ '--avatar-color': color })}
        >${resource.avatar ? html`<img src=${resource.avatar} alt="" />` : initials(resource.label)}</span
      ><span class="resource-text" title=${resource.label}
        ><span class="resource-label">${resource.label}</span
        >${resource.description ? html`<span class="resource-description">${resource.description}</span>` : nothing}</span
      >`
  }

  override render() {
    const view = this.currentView
    const [dayStart, dayEnd] = this.hours
    const range = viewRange(view, this.anchorDay, this.firstWeekday, dayStart, dayEnd)
    const columns = viewColumns(view, range, this.slotSize)
    const rows = this.computeRows(range)
    this.layout = { range, columns, rows }
    const resourceRows = rows.filter((row) => row.kind === 'resource')
    const today = this.now === undefined ? undefined : startOfDay(this.now)
    // The roving Tab stop: the focused bar, else the row holding the cursor, else the first row.
    const barShown = this.focusedBar && resourceRows.some((row) => row.placed.some((item) => item.event.id === this.focusedBar))
    const cursorRow = !barShown && this.cursor && resourceRows.some((row) => row.resource.id === this.cursor!.resource) ? this.cursor.resource : undefined
    const tabRow = barShown ? undefined : (cursorRow ?? resourceRows[0]?.resource.id)
    const off = this.renderOff(range)
    const widthVar = view === 'day' ? 'slot' : view === 'week' ? 'day' : 'month-day'

    return html`<div class="scheduler">
      ${this.hideHeader ? nothing : this.renderHeader(range)}
      <div class="scroller" part="grid">
        <div class="grid ${widthVar}" role="grid" aria-label=${this.label || this.msg.t('schedule')} style=${styleMap({ '--columns': String(columns.length) })}>
          <div class="row head" role="row">
            <div class="corner" role="columnheader">${this.resourceHeading || this.msg.t('resources')}</div>
            ${this.renderScale(range, columns, today)}
          </div>
          ${rows.map((row) => {
            if (row.kind === 'group') {
              return html`<div class="row group" role="row">
                <div class="group-cell" role="rowheader">
                  <button class="group-toggle" type="button" aria-expanded=${row.collapsed ? 'false' : 'true'} @click=${() => this.toggleGroup(row.group)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>${this.msg.t('group', row.group, row.count)}
                  </button>
                </div>
                <div class="group-band" role="gridcell"></div>
              </div>`
            }
            const id = row.resource.id
            const cursor = this.cursor?.resource === id ? this.cursor.column : undefined
            const slot = cursor !== undefined ? columns[cursor] : undefined
            return html`<div class="row" role="row" style=${styleMap({ '--lanes': String(row.lanes) })}>
              <div class="resource" role="rowheader">${this.renderResource(row.resource)}</div>
              <div
                class="lane ${this.editable ? 'editable' : ''}"
                role="gridcell"
                data-resource=${id}
                tabindex=${tabRow === id ? '0' : '-1'}
                aria-label=${slot ? this.slotName(row.resource, cursor!) : row.resource.label}
                @focus=${(event: FocusEvent) => {
                  if (event.target !== event.currentTarget) return
                  this.cursorVisible = true
                  this.focusedBar = ''
                  if (this.cursor?.resource !== id) this.cursor = { resource: id, column: this.defaultColumn(columns) }
                }}
                @blur=${(event: FocusEvent) => event.target === event.currentTarget && (this.cursorVisible = false)}
                @keydown=${(event: KeyboardEvent) => this.handleLaneKey(event, row)}
                @pointerdown=${(event: PointerEvent) => this.startCreateGesture(event, id)}
                @pointermove=${this.moveGesture}
                @pointerup=${(event: PointerEvent) => this.endPointer(event, true)}
                @pointercancel=${(event: PointerEvent) => this.endPointer(event, false)}
              >
                ${off} ${this.renderNowMarker(range, 'now')}
                ${
                  slot && this.cursorVisible
                    ? html`<div
                        class="cursor"
                        aria-hidden="true"
                        style=${styleMap({ '--from': String(fractionOf(range, slot.start)), '--to': String(fractionOf(range, slot.end)) })}
                      ></div>`
                    : nothing
                }
                ${row.placed.map((placed) => this.renderBar(placed, row, range, row.lanes, placed.event.id === this.focusedBar))}
                ${this.renderPreview(range, id)}
              </div>
            </div>`
          })}
        </div>
      </div>
      <div class="announcement" role="status">${this.announcement}</div>
    </div>`
  }

  /** The column the cursor starts on: the one holding `scroll-time` in the day view, else the first. */
  private defaultColumn(columns: SchedulerColumn[]): number {
    if (this.currentView !== 'day' || !this.layout) return 0
    const time = parseClock(this.scrollTime)
    return time === null ? 0 : columnAt(columns, this.layout.range.days[0] + time)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-scheduler': Scheduler
  }
}
