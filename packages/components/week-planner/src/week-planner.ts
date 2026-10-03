import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { firstDayOfWeek, resolveLocale, type Weekday } from '@c2n/core/locale-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
// Registers `c2-button-group` and `c2-button`, the odd/even week switch, and `c2-badge`, the current week's number.
import '@c2n/button-group'
import '@c2n/badge'
import styles from './week-planner.scss?inline'

export type WeekPlannerDay = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'
export type WeekPlannerParity = 'odd' | 'even'
export type WeekPlannerWeekStart = 'monday' | 'sunday' | 'saturday'

/**
 * One slot of the plan: a weekday it repeats on (`day`) or, when the planner shows a dated week, a single date
 * (`date`), a time range, and optionally the kind of week it happens in.
 */
export interface WeekPlannerEvent {
  /** Identifies the event in `event-click` and `event-change`. */
  id?: string
  title: string
  /** Weekday the event repeats on, every week (or every other week with `weeks`). */
  day?: WeekPlannerDay
  /**
   * Single date as `YYYY-MM-DD`: the event shows only in the dated week (`date` set on the planner) that holds it,
   * and never in a dateless one. Takes precedence over `day`.
   */
  date?: string
  /** Start time as `HH:MM` (24-hour). */
  start: string
  /** End time as `HH:MM`; `24:00` ends at midnight. */
  end: string
  /** Weeks the event happens in, by ISO week number. Defaults to every week. */
  weeks?: 'all' | WeekPlannerParity
  /** Block colour, any CSS colour. Defaults to `--c2-week-planner__event--background`. */
  color?: string
  /**
   * Text colour on a bar with its own `color`. Defaults to white, which suits a mid-to-dark colour in both themes;
   * set a dark one for a light `color`.
   */
  textColor?: string
}

export interface WeekPlannerEventClickDetail {
  event: WeekPlannerEvent
}

export interface WeekPlannerParityChangeDetail {
  parity: WeekPlannerParity
}

export interface WeekPlannerWeekChangeDetail {
  /** First day shown, `YYYY-MM-DD`. */
  start: string
  /** Last day shown, `YYYY-MM-DD`. */
  end: string
}

export interface WeekPlannerSlotClickDetail {
  /** Weekday of the column. */
  day: WeekPlannerDay
  /** Date of the column, `YYYY-MM-DD`, when the planner shows a dated week. */
  date?: string
  /** `HH:MM`, snapped down to `snap-minutes`. */
  start: string
  /** `HH:MM`, an hour after `start` (at most `24:00`). */
  end: string
}

/** New placement of a moved or resized event; spread it onto the entry. */
export interface WeekPlannerEventChanges {
  /** New weekday, for an event placed by `day`. */
  day?: WeekPlannerDay
  /** New date, `YYYY-MM-DD`, for an event placed by `date`. */
  date?: string
  start: string
  end: string
}

export interface WeekPlannerEventChangeDetail {
  /** The entry from `events`, unchanged. */
  event: WeekPlannerEvent
  changes: WeekPlannerEventChanges
}

/** Events fired by {@link WeekPlanner}, keyed for `addEventListener`. */
export interface WeekPlannerEventMap {
  'event-click': CustomEvent<WeekPlannerEventClickDetail>
  'parity-change': CustomEvent<WeekPlannerParityChangeDetail>
  'week-change': CustomEvent<WeekPlannerWeekChangeDetail>
  'slot-click': CustomEvent<WeekPlannerSlotClickDetail>
  'event-change': CustomEvent<WeekPlannerEventChangeDetail>
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

interface Valid {
  event: WeekPlannerEvent
  from: number
  to: number
  /** The event's own date, validated; absent for a weekday event. */
  date?: string
}

/** One day column as rendered: its weekday (`Date#getDay`) and, in a dated week, its date. */
interface DayColumn {
  weekday: number
  date?: Date
}

/** A pointer gesture on an event block: a click until it moves past the threshold, then a drag. */
interface PointerGesture {
  item: Placed
  mode: 'move' | 'resize'
  pointerId: number
  x: number
  y: number
  column: number
  started: boolean
  cancelled: boolean
}

/** The live preview of a drag: where the event would land. */
interface DragPreview {
  event: WeekPlannerEvent
  column: number
  from: number
  to: number
}

interface Labels {
  odd: string
  even: string
  kind: string
  plan: string
  previous: string
  next: string
  previousWeek: string
  nextWeek: string
  add: string
}

/** Words the browser cannot translate through `Intl`, by language; any other language falls back to English. */
const LABELS: Record<string, Labels> = {
  en: {
    odd: 'Odd week',
    even: 'Even week',
    kind: 'Kind of week',
    plan: 'Week plan',
    previous: 'Previous days',
    next: 'Next days',
    previousWeek: 'Previous week',
    nextWeek: 'Next week',
    add: 'New event',
  },
  fr: {
    odd: 'Semaine impaire',
    even: 'Semaine paire',
    kind: 'Type de semaine',
    plan: 'Planning de la semaine',
    previous: 'Jours précédents',
    next: 'Jours suivants',
    previousWeek: 'Semaine précédente',
    nextWeek: 'Semaine suivante',
    add: 'Nouvel événement',
  },
  de: {
    odd: 'Ungerade Woche',
    even: 'Gerade Woche',
    kind: 'Wochentyp',
    plan: 'Wochenplan',
    previous: 'Vorherige Tage',
    next: 'Nächste Tage',
    previousWeek: 'Vorherige Woche',
    nextWeek: 'Nächste Woche',
    add: 'Neuer Termin',
  },
  es: {
    odd: 'Semana impar',
    even: 'Semana par',
    kind: 'Tipo de semana',
    plan: 'Plan semanal',
    previous: 'Días anteriores',
    next: 'Días siguientes',
    previousWeek: 'Semana anterior',
    nextWeek: 'Semana siguiente',
    add: 'Nuevo evento',
  },
  it: {
    odd: 'Settimana dispari',
    even: 'Settimana pari',
    kind: 'Tipo di settimana',
    plan: 'Piano settimanale',
    previous: 'Giorni precedenti',
    next: 'Giorni successivi',
    previousWeek: 'Settimana precedente',
    nextWeek: 'Settimana successiva',
    add: 'Nuovo evento',
  },
  pt: {
    odd: 'Semana ímpar',
    even: 'Semana par',
    kind: 'Tipo de semana',
    plan: 'Plano semanal',
    previous: 'Dias anteriores',
    next: 'Próximos dias',
    previousWeek: 'Semana anterior',
    nextWeek: 'Próxima semana',
    add: 'Novo evento',
  },
  nl: {
    odd: 'Oneven week',
    even: 'Even week',
    kind: 'Soort week',
    plan: 'Weekplanning',
    previous: 'Vorige dagen',
    next: 'Volgende dagen',
    previousWeek: 'Vorige week',
    nextWeek: 'Volgende week',
    add: 'Nieuwe afspraak',
  },
  vi: {
    odd: 'Tuần lẻ',
    even: 'Tuần chẵn',
    kind: 'Loại tuần',
    plan: 'Kế hoạch tuần',
    previous: 'Những ngày trước',
    next: 'Những ngày sau',
    previousWeek: 'Tuần trước',
    nextWeek: 'Tuần sau',
    add: 'Sự kiện mới',
  },
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

const isoPattern = /^\d{4}-\d{2}-\d{2}$/

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** A `YYYY-MM-DD` string as a local date at noon (clear of daylight-saving edges), or null when it is not a real date. */
function fromIso(value: string | undefined): Date | null {
  if (!value || !isoPattern.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 12)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null
}

function addDays(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount, 12)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Pointer travel, in pixels, past which pressing an event block drags it instead of clicking it. */
const DRAG_THRESHOLD = 4

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
 * A week at a glance: seven day columns on an hour scale, each event a block from its start to its end time.
 *
 * Without `date` it is a typical week, with no dates — a slot says which weekday it happens on (`day: "mon"`) and
 * repeats every week, or only in odd or even ISO weeks (`weeks: "odd"`), as school and shared-custody schedules do.
 * Odd and even weeks are off by default: set `alternate-weeks` to honour `weeks` and show an Odd week | Even week
 * switch (a segmented `c2-button-group`, themed through its own `--c2-button-group__*` variables) above the grid,
 * opening on the kind of the current week. Without it every event shows each week. The current week's number sits in
 * a badge on its button.
 *
 * Set `date` (`YYYY-MM-DD`, any day of the week) to show a real calendar week instead: the day headers carry the
 * day of the month, the header shows the week's range with previous week / next week arrows and a Today button that
 * update `date` and fire `week-change`, and an event may carry a `date` of its own to show in that week only, while
 * `day` events keep repeating every week. With `alternate-weeks`, `weeks` then follows the ISO number of the week
 * shown; there is no switch.
 *
 * `editable` turns it into a planner the user arranges; the component never changes `events` itself, it reports what
 * the user asked for and the app updates `events`:
 * - Clicking an empty spot fires `slot-click` with the time under the pointer, snapped down to `snap-minutes`, and an
 *   hour-long range. From the keyboard, each day column starts with a "New event" button (shown on focus, at the
 *   column's first free hour) that fires the same event.
 * - Dragging a block moves it to another time or day, and dragging its bottom edge resizes it; a preview follows the
 *   pointer, Escape cancels, and the drop fires `event-change` with the new placement. A press that does not move
 *   is still a click (`event-click`). From the keyboard, on a focused block: Alt+Arrow Up/Down moves it by
 *   `snap-minutes`, Alt+Arrow Left/Right by a day, and Alt+Shift+Arrow Up/Down changes its end time.
 *
 * `heading` puts a title at the start of the header; the `heading` slot replaces it with markup of your own (an icon,
 * a link, an editable field). The `actions` slot puts buttons of your own at the end of the header, e.g. "Add event"
 * or a settings menu.
 *
 * Text follows `locale`, or the browser's language when it is not set: day names, dates and "today"/"this week" come
 * from `Intl`, and the other labels from a built-in list (English, French, German, Spanish, Italian, Portuguese,
 * Dutch, Vietnamese; other languages fall back to English). Today's column is tinted, inside the grid lines, and
 * carries a line at the current time. Overlapping events cascade, each stepped in from the one it overlaps; the hour
 * range grows to fit every event.
 *
 * Below 640px of width the planner shows three days, and below 420px one, of a strip that scrolls sideways and snaps
 * to a day: swiped on a touch screen, paged with the previous/next arrows that then appear in its header. It opens on
 * today, and the hour labels stay in place.
 *
 * @tag c2-week-planner
 *
 * @event {CustomEvent<WeekPlannerEventClickDetail>} event-click - Fired when an event block is activated; `detail.event` is the entry from `events`.
 * @event {CustomEvent<WeekPlannerParityChangeDetail>} parity-change - Fired when the switch shows the other kind of week; `detail.parity` is `odd` or `even`.
 * @event {CustomEvent<WeekPlannerWeekChangeDetail>} week-change - Fired when the header navigation of a dated planner shows another week; `detail.start` and `detail.end` are its first and last day as `YYYY-MM-DD`. Does not bubble.
 * @event {CustomEvent<WeekPlannerSlotClickDetail>} slot-click - With `editable`, fired when an empty spot or a day's "New event" button is activated: `{ day, date?, start, end }`, `start` snapped to `snap-minutes` and `end` an hour later. Add the event to `events` yourself.
 * @event {CustomEvent<WeekPlannerEventChangeDetail>} event-change - With `editable`, fired when an event is dropped after a drag or moved/resized from the keyboard: `{ event, changes }`, `event` the original entry and `changes` its new `start`, `end` and `day` or `date`. Update `events` yourself.
 *
 * @slot heading - Title at the start of the header, in place of the `heading` text. It names the planner unless `heading` or `aria-label` is set.
 * @slot actions - Controls at the end of the header, before the previous/next arrows, e.g. an "Add event" button.
 *
 * @csspart heading - Heading region wrapping the `heading` slot and the `heading` text fallback; assigned content keeps its own styles.
 * @csspart actions - Actions region wrapping the `actions` slot at the end of the header, before the previous/next arrows; assigned controls keep their own styles.
 * @csspart event - Each event block.
 *
 * @cssproperty {color} [--c2-week-planner--background=#ffffff]
 * @cssproperty {color} [--c2-week-planner--color=#18181b]
 * @cssproperty {border} [--c2-week-planner--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-week-planner--border-radius=8px]
 * @cssproperty {padding} [--c2-week-planner--padding=12px]
 * @cssproperty {font-family} [--c2-week-planner--font-family=inherit]
 * @cssproperty {font-size} [--c2-week-planner--font-size=14px]
 * @cssproperty {font-size} [--c2-week-planner__title--font-size=14px] - The `heading`.
 * @cssproperty {font-weight} [--c2-week-planner__title--font-weight=600]
 * @cssproperty {border} [--c2-week-planner__grid--border=1px solid #e4e4e7] - Lines between the day columns.
 * @cssproperty {border} [--c2-week-planner__hour--border=1px solid rgba(24, 24, 27, 0.06)] - Line under each hour. Translucent, so it stays visible over today's tint.
 * @cssproperty {pixel} [--c2-week-planner__hour--height=48px]
 * @cssproperty {pixel} [--c2-week-planner__hour-label--width=48px]
 * @cssproperty {color} [--c2-week-planner__hour-label--color=#71717a]
 * @cssproperty {font-size} [--c2-week-planner__hour-label--font-size=11px]
 * @cssproperty {pixel} [--c2-week-planner__actions--gap=8px] - Space between the controls in the `actions` slot.
 * @cssproperty {pixel} [--c2-week-planner__navigation--size=28px] - Previous/next day arrows, shown when the planner is too narrow for seven days.
 * @cssproperty {border-radius} [--c2-week-planner__navigation--border-radius=6px]
 * @cssproperty {color} [--c2-week-planner__navigation__hover--background=#f4f4f5]
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
 * @cssproperty {color} [--c2-week-planner__week-title--color=#71717a] - The dated week's range in the header.
 * @cssproperty {font-size} [--c2-week-planner__week-title--font-size=14px]
 * @cssproperty {font-weight} [--c2-week-planner__day-number--font-weight=600] - Day of the month in a dated week's day headers.
 * @cssproperty {color} [--c2-week-planner__slot__hover--background=rgba(2, 101, 220, 0.1)] - With `editable`, the hour under the pointer in an empty spot.
 * @cssproperty {border} [--c2-week-planner__preview--border=2px dashed rgb(2, 101, 220)] - Where a dragged event would land, and the focused "New event" button.
 * @cssproperty {color} [--c2-week-planner__preview--background=rgba(2, 101, 220, 0.1)]
 * @cssproperty {color} [--c2-week-planner__preview--color=rgb(2, 101, 220)]
 * @cssproperty {opacity} [--c2-week-planner__event__dragging--opacity=0.4] - The event being dragged, at its original place.
 * @cssproperty {pixel} [--c2-week-planner__resize-handle--height=6px] - With `editable`, the strip at the bottom of a block that resizes it.
 */
@customElement('c2-week-planner')
export class WeekPlanner extends LitElement {
  static override styles = unsafeCSS(styles)

  @state() private now = new Date()
  /** The day strip is scrolled to its first / last day; disables the matching arrow on a narrow planner. */
  @state() private atStart = true
  @state() private atEnd = true
  /** Where a dragged event would land. */
  @state() private preview?: DragPreview
  /** With `editable`, the snapped hour under the pointer in an empty spot. */
  @state() private hover?: { column: number; from: number }
  @query('.scroller') private scroller?: HTMLElement
  private readonly slotPresence = new SlotPresenceController(this, ['heading', 'actions'])
  private clock?: ReturnType<typeof setInterval>
  private resizeObserver?: ResizeObserver
  private overflowing = false
  /** Index of the leftmost day the strip shows, restored when a resize would leave it between two days. */
  private firstShownDay = 0
  /** First day of the dated week last rendered, to bring the strip back to its start when the week changes. */
  private renderedWeek = ''
  /** The columns and hour range of the last render, which the pointer and keyboard handlers work in. */
  private layout: { columns: DayColumn[]; firstHour: number; lastHour: number } = { columns: [], firstHour: 8, lastHour: 18 }
  private gesture?: PointerGesture
  /** Swallows the click that ends a drag, so dropping an event does not also open it or add one. */
  private suppressClick = false
  /** The event block to focus again once the app has applied a keyboard move: its key and new place. */
  private refocus?: { key: string; slot: string }

  /** The plan: `{ id?, title, day?, date?, start, end, weeks?, color? }` entries. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) events: WeekPlannerEvent[] = []
  /**
   * Shows the calendar week holding this date, `YYYY-MM-DD` (any day of the week). Empty — the default — shows a
   * typical week without dates. The header navigation updates it.
   */
  @property({ type: String }) date = ''
  /** Lets the user add events by clicking an empty spot and move or resize them by dragging; see `slot-click` and `event-change`. */
  @property({ type: Boolean }) editable = false
  /** Step, in minutes, that `slot-click` times, drags and keyboard moves snap to. */
  @property({ type: Number, attribute: 'snap-minutes' }) snapMinutes = 30
  /** Honours each event's `weeks` and shows the Odd week | Even week switch. Off by default: every event shows each week. */
  @property({ type: Boolean, attribute: 'alternate-weeks' }) alternateWeeks = false
  /** Kind of week shown with `alternate-weeks`. Defaults to the kind of the current ISO week. */
  @property({ type: String }) parity: WeekPlannerParity | '' = ''
  /** First hour on the scale; earlier events extend it. */
  @property({ type: Number, attribute: 'start-hour' }) startHour = 8
  /** Last hour on the scale; later events extend it. */
  @property({ type: Number, attribute: 'end-hour' }) endHour = 18
  /** First day of the week. Defaults to the convention of `locale` (Sunday in `en-US`, Monday in `fr` or `en-GB`). */
  @property({ attribute: 'week-start', reflect: true }) weekStart: WeekPlannerWeekStart | '' = ''
  /** Language of the planner's text and day names, e.g. `fr` or `en-GB`. Defaults to the browser's language. */
  @property({ type: String }) locale = ''
  /** Title shown at the start of the header, e.g. "Kids' schedule". It also names the planner for assistive technology. */
  @property() heading = ''
  /** Accessible name for the planner. Defaults to `heading`, else "Week plan" in the planner's language. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  override connectedCallback() {
    super.connectedCallback()
    this.now = new Date()
    this.clock = setInterval(() => (this.now = new Date()), 60_000)
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    clearInterval(this.clock)
    this.resizeObserver?.disconnect()
    this.resizeObserver = undefined
    this.overflowing = false
    this.endGesture()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    // A new plan or week ends any drag: the block it started on may be gone.
    if ((changed.has('events') || changed.has('date') || changed.has('editable')) && this.gesture) this.endGesture()
  }

  override updated(changed: PropertyValues<this>) {
    // A narrow planner shows one or three days of a scrollable strip; the observer brings today into view when the
    // strip starts to overflow and keeps the arrows' disabled state in step with the width.
    if (!this.resizeObserver && this.scroller && typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.handleResize())
      this.resizeObserver.observe(this.scroller)
    }
    const start = this.weekStartDate
    const week = start ? toIso(start) : ''
    if (week !== this.renderedWeek) {
      // Another week: a narrow strip opens on today when the week holds it, else on its first day.
      if (this.renderedWeek && this.overflowing && this.scroller) {
        const target = this.scroller.querySelector<HTMLElement>('.day-header.today') ?? this.scroller.querySelector<HTMLElement>('.day-header')
        if (target) this.scroller.scrollLeft = target.offsetLeft
        this.updateEdges()
      }
      this.renderedWeek = week
    }
    if (changed.has('events') && this.refocus) {
      const { key, slot } = this.refocus
      this.refocus = undefined
      const block = [...this.renderRoot.querySelectorAll<HTMLElement>('.event')].find((element) => element.dataset.key === key && element.dataset.slot === slot)
      block?.focus()
    }
  }

  private handleResize() {
    const scroller = this.scroller
    if (!scroller) return
    const overflowing = scroller.scrollWidth > scroller.clientWidth + 1
    const headers = [...scroller.querySelectorAll<HTMLElement>('.day-header')]
    if (overflowing) {
      const target = this.overflowing ? headers[this.firstShownDay] : (scroller.querySelector<HTMLElement>('.day-header.today') ?? headers[0])
      if (target) scroller.scrollLeft = target.offsetLeft
    }
    this.overflowing = overflowing
    this.updateEdges()
  }

  private updateEdges() {
    const scroller = this.scroller
    if (!scroller) return
    this.atStart = scroller.scrollLeft <= 1
    const dayWidth = scroller.querySelector<HTMLElement>('.day-header')?.offsetWidth
    if (dayWidth) this.firstShownDay = Math.min(6, Math.max(0, Math.round(scroller.scrollLeft / dayWidth)))
    this.atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 1
  }

  /** Moves the strip by the number of days it shows, so the arrows page through the week. */
  private scrollDays(direction: 1 | -1) {
    const scroller = this.scroller
    const day = scroller?.querySelector<HTMLElement>('.day-header')
    if (!scroller || !day?.offsetWidth) return
    const shown = Math.max(1, Math.round(scroller.clientWidth / day.offsetWidth))
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollBy({ left: direction * shown * day.offsetWidth, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  private get effectiveLocale() {
    return resolveLocale(this.locale)
  }

  /** First day of the week as `Date#getDay` numbers it: `week-start` when set, else the locale's convention. */
  private get firstWeekday(): Weekday {
    if (this.weekStart === 'sunday') return 0
    if (this.weekStart === 'monday') return 1
    if (this.weekStart === 'saturday') return 6
    return firstDayOfWeek(this.effectiveLocale)
  }

  /** First day of the dated week shown, or null for a typical week. */
  private get weekStartDate(): Date | null {
    const date = fromIso(this.date)
    if (!date) return null
    return addDays(date, -((date.getDay() - this.firstWeekday + 7) % 7))
  }

  private get labels(): Labels {
    return LABELS[this.effectiveLocale.toLowerCase().split('-')[0]] ?? LABELS.en
  }

  private get snap(): number {
    const snap = Math.round(Number(this.snapMinutes))
    return Number.isFinite(snap) && snap >= 1 ? Math.min(snap, 1440) : 30
  }

  /** "today", "this week", … in the planner's language. */
  private relative(unit: 'day' | 'week') {
    try {
      return new Intl.RelativeTimeFormat(this.effectiveLocale, { numeric: 'auto' }).format(0, unit)
    } catch {
      return unit === 'day' ? 'today' : 'this week'
    }
  }

  /** The Today button's label: "today" in the planner's language, capitalised. */
  private todayLabel() {
    const today = this.relative('day')
    return today.charAt(0).toLocaleUpperCase(this.effectiveLocale) + today.slice(1)
  }

  private get currentParity(): WeekPlannerParity {
    return isoWeek(this.now) % 2 === 0 ? 'even' : 'odd'
  }

  private get shownParity(): WeekPlannerParity {
    // A dated week has a kind of its own: the ISO number of its middle day decides it.
    const start = this.weekStartDate
    if (start) return isoWeek(addDays(start, 3)) % 2 === 0 ? 'even' : 'odd'
    return this.parity === 'odd' || this.parity === 'even' ? this.parity : this.currentParity
  }

  private get validEvents(): Valid[] {
    return (Array.isArray(this.events) ? this.events : []).flatMap((event) => {
      const from = minutesOf(event?.start)
      const to = minutesOf(event?.end)
      if (from === null || to === null || to <= from) return []
      if (event.date !== undefined && event.date !== '') {
        const date = fromIso(event.date)
        return date ? [{ event, from, to, date: toIso(date) }] : []
      }
      return event.day && DAYS.includes(event.day) ? [{ event, from, to }] : []
    })
  }

  private showParity(parity: WeekPlannerParity) {
    if (parity === this.shownParity) return
    this.parity = parity
    this.dispatchEvent(new CustomEvent<WeekPlannerParityChangeDetail>('parity-change', { detail: { parity }, bubbles: true, composed: true }))
  }

  /** Shows the week holding `date`; fires `week-change` when that is another week. */
  private showWeek(date: Date) {
    const before = this.weekStartDate
    this.date = toIso(date)
    const after = this.weekStartDate
    if (!after || (before && toIso(before) === toIso(after))) return
    this.dispatchEvent(new CustomEvent<WeekPlannerWeekChangeDetail>('week-change', { detail: { start: toIso(after), end: toIso(addDays(after, 6)) } }))
  }

  private openEvent(event: WeekPlannerEvent) {
    if (this.suppressClick) return
    this.dispatchEvent(new CustomEvent<WeekPlannerEventClickDetail>('event-click', { detail: { event }, bubbles: true, composed: true }))
  }

  private fireSlot(column: DayColumn, from: number) {
    const detail: WeekPlannerSlotClickDetail = { day: DAYS[column.weekday], start: formatMinutes(from), end: formatMinutes(Math.min(1440, from + 60)) }
    if (column.date) detail.date = toIso(column.date)
    this.dispatchEvent(new CustomEvent<WeekPlannerSlotClickDetail>('slot-click', { detail, bubbles: true, composed: true }))
  }

  /** Minutes since midnight at a pointer's height in a day column, snapped down to `snap-minutes`. */
  private minutesAt(dayElement: Element, clientY: number): number {
    const { firstHour, lastHour } = this.layout
    const rect = dayElement.getBoundingClientRect()
    const hourHeight = rect.height / Math.max(1, lastHour - firstHour) || 1
    const minutes = firstHour * 60 + ((clientY - rect.top) / hourHeight) * 60
    const snapped = Math.floor(minutes / this.snap) * this.snap
    return clamp(snapped, firstHour * 60, Math.max(firstHour * 60, Math.floor((lastHour * 60 - 1) / this.snap) * this.snap))
  }

  private handleDayClick(event: MouseEvent, column: number) {
    if (!this.editable || this.suppressClick) return
    if ((event.target as Element).closest('.event, .add')) return
    const slot = this.layout.columns[column]
    if (slot) this.fireSlot(slot, this.minutesAt(event.currentTarget as Element, event.clientY))
  }

  private handleDayHover(event: PointerEvent, column: number) {
    if (!this.editable || this.gesture || event.pointerType === 'touch' || (event.target as Element).closest('.event')) {
      if (this.hover) this.hover = undefined
      return
    }
    const from = this.minutesAt(event.currentTarget as Element, event.clientY)
    if (this.hover?.column !== column || this.hover.from !== from) this.hover = { column, from }
  }

  /** The placement `changes` for an event moved to a weekday (and, in a dated week, a date) from `from` to `to`. */
  private changesFor(event: WeekPlannerEvent, weekday: number, date: Date | undefined, from: number, to: number): WeekPlannerEventChanges {
    const changes: WeekPlannerEventChanges = { start: formatMinutes(from), end: formatMinutes(to) }
    if (event.date && date) changes.date = toIso(date)
    if (event.day) changes.day = DAYS[weekday]
    return changes
  }

  private fireChange(event: WeekPlannerEvent, changes: WeekPlannerEventChanges) {
    this.dispatchEvent(new CustomEvent<WeekPlannerEventChangeDetail>('event-change', { detail: { event, changes }, bubbles: true, composed: true }))
  }

  private startGesture(event: PointerEvent, item: Placed, column: number) {
    if (!this.editable || event.button !== 0 || !event.isPrimary || this.gesture) return
    const target = event.currentTarget as HTMLElement
    this.gesture = {
      item,
      mode: (event.target as Element).closest('.resize-handle') ? 'resize' : 'move',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      column,
      started: false,
      cancelled: false,
    }
    this.hover = undefined
    try {
      target.setPointerCapture(event.pointerId)
    } catch {
      // A synthetic pointer cannot be captured; the gesture still follows events on the block.
    }
    this.ownerDocument.addEventListener('keydown', this.handleGestureKey, true)
  }

  private moveGesture(event: PointerEvent) {
    const gesture = this.gesture
    if (!gesture || gesture.cancelled || event.pointerId !== gesture.pointerId) return
    if (!gesture.started && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < DRAG_THRESHOLD) return
    gesture.started = true
    const days = [...this.renderRoot.querySelectorAll<HTMLElement>('.day')]
    const origin = days[gesture.column]
    if (!origin) return
    const { firstHour, lastHour } = this.layout
    const hourHeight = origin.getBoundingClientRect().height / Math.max(1, lastHour - firstHour) || 1
    const delta = ((event.clientY - gesture.y) / hourHeight) * 60
    const { from, to } = gesture.item
    const snap = this.snap
    const snapped = (value: number) => Math.round(value / snap) * snap
    // Keep the block on the scale shown: the scale only grows when the app puts the event there.
    const low = Math.min(firstHour * 60, from)
    const high = Math.max(lastHour * 60, to)
    if (gesture.mode === 'resize') {
      const end = clamp(snapped(to + delta), from + Math.min(snap, to - from), high)
      this.preview = { event: gesture.item.event, column: gesture.column, from, to: end }
      return
    }
    // The column under the pointer, or the nearest one at either end of the strip.
    let column = gesture.column
    let best = Infinity
    days.forEach((day, index) => {
      const rect = day.getBoundingClientRect()
      const distance = event.clientX < rect.left ? rect.left - event.clientX : event.clientX > rect.right ? event.clientX - rect.right : 0
      if (distance < best) {
        best = distance
        column = index
      }
    })
    const duration = to - from
    const start = clamp(snapped(from + delta), low, Math.max(low, high - duration))
    this.preview = { event: gesture.item.event, column, from: start, to: Math.min(1440, start + duration) }
  }

  private endPointer(event: PointerEvent, commit: boolean) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const preview = this.preview
    if (gesture.started || gesture.cancelled) {
      // The click that follows the drop belongs to the drag.
      this.suppressClick = true
      setTimeout(() => (this.suppressClick = false))
    }
    this.endGesture()
    if (!commit || !gesture.started || gesture.cancelled || !preview) return
    const { item } = gesture
    const column = this.layout.columns[preview.column]
    if (!column) return
    if (preview.column === gesture.column && preview.from === item.from && preview.to === item.to) return
    this.fireChange(item.event, this.changesFor(item.event, column.weekday, column.date, preview.from, preview.to))
  }

  private endGesture() {
    this.gesture = undefined
    this.preview = undefined
    this.ownerDocument?.removeEventListener('keydown', this.handleGestureKey, true)
  }

  /** Escape drops a drag in progress; the block stays where it was. */
  private readonly handleGestureKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.gesture) return
    event.preventDefault()
    event.stopPropagation()
    this.gesture.cancelled = true
    this.preview = undefined
  }

  /** Alt+Arrow moves the focused block by `snap-minutes` or a day; Alt+Shift+Arrow Up/Down changes its end. */
  private handleEventKey(event: KeyboardEvent, item: Placed, column: number) {
    if (!this.editable || !event.altKey || event.ctrlKey || event.metaKey) return
    const key = event.key
    if (key !== 'ArrowUp' && key !== 'ArrowDown' && key !== 'ArrowLeft' && key !== 'ArrowRight') return
    event.preventDefault()
    const slot = this.layout.columns[column]
    if (!slot) return
    const snap = this.snap
    let { from, to } = item
    let weekday = slot.weekday
    let date = slot.date
    if (event.shiftKey) {
      if (key === 'ArrowUp') to = Math.max(from + Math.min(snap, to - from), to - snap)
      else if (key === 'ArrowDown') to = Math.min(1440, to + snap)
      else return
    } else if (key === 'ArrowUp') {
      const shift = Math.min(snap, from)
      from -= shift
      to -= shift
    } else if (key === 'ArrowDown') {
      const shift = Math.min(snap, 1440 - to)
      from += shift
      to += shift
    } else {
      const step = key === 'ArrowLeft' ? -1 : 1
      weekday = (weekday + step + 7) % 7
      if (date) date = addDays(date, step)
    }
    if (from === item.from && to === item.to && weekday === slot.weekday) return
    const changes = this.changesFor(item.event, weekday, date, from, to)
    this.refocus = { key: this.keyOf(item.event), slot: this.slotOf({ ...item.event, ...changes }) }
    this.fireChange(item.event, changes)
  }

  private keyOf(event: WeekPlannerEvent) {
    return event.id ?? event.title
  }

  private slotOf(event: WeekPlannerEvent) {
    return `${event.date ? `date:${event.date}` : `day:${event.day}`}|${event.start}`
  }

  private renderNavigation() {
    const labels = this.labels
    return html`<div class="navigation">
      <button class="nav" type="button" aria-label=${labels.previous} ?disabled=${this.atStart} @click=${() => this.scrollDays(-1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <button class="nav" type="button" aria-label=${labels.next} ?disabled=${this.atEnd} @click=${() => this.scrollDays(1)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>`
  }

  private renderWeekNavigation(start: Date) {
    const labels = this.labels
    const step = (days: number) => this.showWeek(addDays(fromIso(this.date) ?? start, days))
    return html`<div class="week-navigation">
      <button class="nav" type="button" aria-label=${labels.previousWeek} @click=${() => step(-7)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <button class="nav today-button" type="button" @click=${() => this.showWeek(new Date())}>${this.todayLabel()}</button>
      <button class="nav" type="button" aria-label=${labels.nextWeek} @click=${() => step(7)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
      </button>
    </div>`
  }

  /** "Sep 28 – Oct 4, 2026" in the planner's language. */
  private weekTitle(start: Date) {
    const end = addDays(start, 6)
    const format = new Intl.DateTimeFormat(this.effectiveLocale, { month: 'short', day: 'numeric', year: 'numeric' })
    // `formatRange` (ES2021) merges the shared month and year; the library's target types predate it.
    const range = (format as Intl.DateTimeFormat & { formatRange?: (from: Date, to: Date) => string }).formatRange
    return range ? range.call(format, start, end) : `${format.format(start)} – ${format.format(end)}`
  }

  private renderSwitch() {
    const week = isoWeek(this.now)
    const shown = this.shownParity
    const labels = this.labels
    const badge = (parity: WeekPlannerParity) =>
      parity === this.currentParity
        ? html`<c2-badge slot="suffix-icon" class="week-number" tone="primary" title=${this.relative('week')}
            >${week}<span class="visually-hidden">${this.relative('week')}</span></c2-badge
          >`
        : nothing
    return html`<c2-button-group
      class="switch"
      appearance="segmented"
      size="s"
      aria-label=${labels.kind}
      .value=${shown}
      @change=${(event: CustomEvent<{ value: string }>) => {
        // The group's change is composed; the planner reports it as parity-change instead.
        event.stopPropagation()
        if (event.detail.value === 'odd' || event.detail.value === 'even') this.showParity(event.detail.value)
      }}
    >
      <c2-button value="odd">${labels.odd}${badge('odd')}</c2-button>
      <c2-button value="even">${labels.even}${badge('even')}</c2-button>
    </c2-button-group>`
  }

  private renderEvent(item: Placed, dayName: string, firstHour: number, column: number) {
    const editable = this.editable
    const dragging = this.preview?.event === item.event
    return html`<button
      class="event ${editable ? 'editable' : ''} ${dragging ? 'dragging' : ''}"
      type="button"
      part="event"
      data-key=${this.keyOf(item.event)}
      data-slot=${this.slotOf(item.event)}
      aria-label=${`${item.event.title}, ${dayName} ${formatMinutes(item.from)}–${formatMinutes(item.to)}`}
      title=${item.event.title}
      style=${styleMap({
        '--from': String(item.from / 60 - firstHour),
        '--span': String((item.to - item.from) / 60),
        '--column': String(item.column),
        '--columns': String(item.columns),
        '--event-color': item.event.color || null,
        // A colour of the author's own keeps its text colour in every theme; only the default follows it.
        '--event-text-color': item.event.color ? item.event.textColor || '#ffffff' : null,
      })}
      @click=${() => this.openEvent(item.event)}
      @pointerdown=${(event: PointerEvent) => this.startGesture(event, item, column)}
      @pointermove=${(event: PointerEvent) => this.moveGesture(event)}
      @pointerup=${(event: PointerEvent) => this.endPointer(event, true)}
      @pointercancel=${(event: PointerEvent) => this.endPointer(event, false)}
      @keydown=${(event: KeyboardEvent) => this.handleEventKey(event, item, column)}
    >
      <span class="event-body">
        <span class="event-title">${item.event.title}</span>
        <span class="event-time">${formatMinutes(item.from)}–${formatMinutes(item.to)}</span>
      </span>
      ${editable ? html`<span class="resize-handle" aria-hidden="true"></span>` : nothing}
    </button>`
  }

  /** The keyboard way to add: a button at the column's first free hour, shown while it has focus. */
  private renderAdd(column: DayColumn, dayLabel: string, placed: Placed[], firstHour: number, lastHour: number) {
    const snap = this.snap
    let from = firstHour * 60
    for (let start = firstHour * 60; start + 60 <= lastHour * 60; start += snap) {
      if (!placed.some((item) => item.from < start + 60 && item.to > start)) {
        from = start
        break
      }
    }
    const to = Math.min(1440, from + 60)
    return html`<button
      class="add"
      type="button"
      aria-label=${`${this.labels.add}, ${dayLabel} ${formatMinutes(from)}–${formatMinutes(to)}`}
      style=${styleMap({ '--from': String(from / 60 - firstHour), '--span': String((to - from) / 60) })}
      @click=${() => this.fireSlot(column, from)}
    >
      <span aria-hidden="true">+ ${formatMinutes(from)}–${formatMinutes(to)}</span>
    </button>`
  }

  override render() {
    const weekStart = this.weekStartDate
    const dated = weekStart !== null
    const weekIsos = weekStart ? Array.from({ length: 7 }, (_, index) => toIso(addDays(weekStart, index))) : []
    // A dated week shows its own dated events and every weekday event; a typical week only weekday events.
    const all = this.validEvents.filter((item) => !item.date || weekIsos.includes(item.date))
    const usesParity = this.alternateWeeks
    const shown = this.shownParity
    const visible = all.filter(({ event, date }) => date || !usesParity || !event.weeks || event.weeks === 'all' || event.weeks === shown)

    const firstHour = Math.max(0, Math.min(Number.isFinite(this.startHour) ? Math.floor(this.startHour) : 8, ...all.map((item) => Math.floor(item.from / 60))))
    const lastHour = Math.min(24, Math.max(Number.isFinite(this.endHour) ? Math.ceil(this.endHour) : 18, ...all.map((item) => Math.ceil(item.to / 60))))
    const hours = Math.max(1, lastHour - firstHour)

    const first = this.firstWeekday
    const columns: DayColumn[] = Array.from({ length: 7 }, (_, index) =>
      weekStart ? { weekday: (first + index) % 7, date: addDays(weekStart, index) } : { weekday: (first + index) % 7 },
    )
    this.layout = { columns, firstHour, lastHour: firstHour + hours }
    const locale = this.effectiveLocale
    const shortName = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const longName = new Intl.DateTimeFormat(locale, { weekday: 'long' })
    const dayNumber = new Intl.DateTimeFormat(locale, { day: 'numeric' })
    const longDate = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' })
    // 2024-01-07 is a Sunday: index 0 of DAYS.
    const dayDate = (column: DayColumn) => column.date ?? new Date(2024, 0, 7 + column.weekday, 12)
    const todayIso = toIso(this.now)
    const todayShown = !usesParity || shown === this.currentParity
    const isToday = (column: DayColumn) => (column.date ? toIso(column.date) === todayIso : todayShown && column.weekday === this.now.getDay())
    const nowMinutes = this.now.getHours() * 60 + this.now.getMinutes()
    const nowOffset = nowMinutes / 60 - firstHour

    const hasHeading = Boolean(this.heading) || this.slotPresence.has('heading')
    const hasActions = this.slotPresence.has('actions')
    // Slotted heading markup names the planner through the heading itself; text set as a property names it directly.
    const labelledByHeading = !this.ariaLabel && !this.heading && hasHeading
    const editable = this.editable
    const preview = this.preview
    const hover = editable && !preview ? this.hover : undefined
    const block = (from: number, to: number) => styleMap({ '--from': String(from / 60 - firstHour), '--span': String((to - from) / 60) })

    return html`<section
      class="c2-week-planner"
      aria-label=${labelledByHeading ? nothing : this.ariaLabel || this.heading || this.labels.plan}
      aria-labelledby=${labelledByHeading ? 'heading' : nothing}
    >
      <div class="body">
        <header class="header ${dated ? 'dated' : ''} ${dated || usesParity || hasHeading || hasActions ? '' : 'navigation-only'}">
          <h2 class="title" part="heading" id="heading" ?hidden=${!hasHeading}>
            <slot name="heading" @slotchange=${this.slotPresence.handleSlotChange}>${this.heading}</slot>
          </h2>
          ${weekStart ? html`<p class="week-title" aria-live="polite">${this.weekTitle(weekStart)}</p>` : nothing}
          ${usesParity && !dated ? this.renderSwitch() : nothing}
          <div class="trailing">
            <div class="actions" part="actions" ?hidden=${!hasActions}><slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot></div>
            ${this.renderNavigation()} ${weekStart ? this.renderWeekNavigation(weekStart) : nothing}
          </div>
        </header>
        <div class="frame">
          <div class="gutter" aria-hidden="true">
            <div class="corner">&nbsp;</div>
            ${Array.from({ length: hours }, (_, hour) => html`<div class="hour-label">${formatMinutes((firstHour + hour) * 60)}</div>`)}
          </div>
          <div class="scroller" @scroll=${this.updateEdges}>
            <div class="grid" style=${styleMap({ '--hours': String(hours) })}>
              ${columns.map(
                (column) =>
                  html`<div class="day-header ${isToday(column) ? 'today' : ''}" aria-hidden="true">
                    ${
                      column.date
                        ? html`<span class="day-name">${shortName.format(column.date)}</span> <span class="day-number">${dayNumber.format(column.date)}</span>`
                        : shortName.format(dayDate(column))
                    }
                  </div>`,
              )}
              ${columns.map((column, index) => {
                const day = DAYS[column.weekday]
                const iso = column.date ? toIso(column.date) : ''
                const dayName = column.date ? longDate.format(column.date) : longName.format(dayDate(column))
                const placed = placeDay(visible.filter((item) => (item.date ? item.date === iso : item.event.day === day)))
                const today = isToday(column)
                return html`<div
                  class="day ${today ? 'today' : ''} ${editable ? 'editable' : ''}"
                  role="group"
                  aria-label=${today ? `${dayName}, ${this.relative('day')}` : dayName}
                  @click=${(event: MouseEvent) => this.handleDayClick(event, index)}
                  @pointermove=${(event: PointerEvent) => this.handleDayHover(event, index)}
                  @pointerleave=${() => (this.hover = undefined)}
                >
                  ${Array.from({ length: hours }, () => html`<div class="hour-line"></div>`)}
                  ${editable ? this.renderAdd(column, dayName, placed, firstHour, firstHour + hours) : nothing}
                  ${hover?.column === index ? html`<div class="slot-hover" aria-hidden="true" style=${block(hover.from, Math.min(1440, hover.from + 60))}></div>` : nothing}
                  ${placed.map((item) => this.renderEvent(item, dayName, firstHour, index))}
                  ${
                    preview?.column === index
                      ? html`<div class="preview" aria-hidden="true" style=${block(preview.from, preview.to)}>
                          <span class="event-title">${preview.event.title}</span>
                          <span class="event-time">${formatMinutes(preview.from)}–${formatMinutes(preview.to)}</span>
                        </div>`
                      : nothing
                  }
                  ${
                    today && nowOffset >= 0 && nowOffset <= hours
                      ? html`<div class="now" style=${styleMap({ '--from': String(nowOffset) })} aria-hidden="true"></div>`
                      : nothing
                  }
                </div>`
              })}
            </div>
          </div>
        </div>
      </div>
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-week-planner': WeekPlanner
  }
}
