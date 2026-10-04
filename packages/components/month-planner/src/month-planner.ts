import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { queryAll, state } from 'lit/decorators.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { firstDayOfWeek, resolveLocale, type Weekday } from '@c2n/core/locale-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import styles from './month-planner.scss?inline'

export type MonthPlannerWeekStart = 'monday' | 'sunday' | 'saturday'

/** One entry in the plan: a single day, or a span from `start` to `end` (both inclusive, `YYYY-MM-DD`). */
export interface MonthPlannerEvent {
  /** Identifies the event in `event-click`. */
  id?: string
  title: string
  start: string
  /** Last day of the event; omit for a one-day event. */
  end?: string
  /** Bar colour, any CSS colour. Defaults to `--c2-month-planner__event--background`. */
  color?: string
  /**
   * Text colour on a bar with its own `color`. Defaults to white, which suits a mid-to-dark colour in both themes;
   * set a dark one for a light `color`.
   */
  textColor?: string
}

export interface MonthPlannerEventClickDetail {
  event: MonthPlannerEvent
}

export interface MonthPlannerDayClickDetail {
  /** The day activated, as `YYYY-MM-DD`. */
  date: string
}

export interface MonthPlannerRangeSelectDetail {
  /** First day of the range, as `YYYY-MM-DD`. */
  start: string
  /** Last day of the range (inclusive, never before `start`), as `YYYY-MM-DD`. */
  end: string
}

export interface MonthPlannerEventChangeDetail {
  /** The entry from `events`, unchanged. */
  event: MonthPlannerEvent
  /** Its new first and last day, as `YYYY-MM-DD` (`end` is set even for a one-day event). */
  changes: { start: string; end: string }
}

export interface MonthPlannerMonthChangeDetail {
  /** The month now shown, as `YYYY-MM`. */
  month: string
}

/** Events fired by {@link MonthPlanner}, keyed for `addEventListener`. */
export interface MonthPlannerEventMap {
  'event-click': CustomEvent<MonthPlannerEventClickDetail>
  'month-change': CustomEvent<MonthPlannerMonthChangeDetail>
  'day-click': CustomEvent<MonthPlannerDayClickDetail>
  'range-select': CustomEvent<MonthPlannerRangeSelectDetail>
  'event-change': CustomEvent<MonthPlannerEventChangeDetail>
}

export interface MonthPlanner {
  addEventListener: TypedAddEventListener<MonthPlanner, MonthPlannerEventMap>
  removeEventListener: TypedRemoveEventListener<MonthPlanner, MonthPlannerEventMap>
}

interface Segment {
  event: MonthPlannerEvent
  column: number
  span: number
  lane: number
  /** The event begins in this week (rounded left end). */
  starts: boolean
  /** The event ends in this week (rounded right end). */
  ends: boolean
}

interface DatedEvent {
  event: MonthPlannerEvent
  start: Date
  end: Date
}

/** A press on a day (a range) or on an event bar (a move, or a resize from one of its edges), until it is released. */
interface Gesture {
  kind: 'range' | 'move' | 'start' | 'end'
  pointerId: number
  x: number
  y: number
  /** The day pressed. */
  anchor: Date
  /** The day under the pointer now. */
  hovered: Date
  /** Past the movement threshold: a drag, not a click. */
  active: boolean
  /** The event dragged, with its dates when the press began. */
  item?: DatedEvent
}

/** Movement, in pixels, below which a press stays a click. */
const DRAG_THRESHOLD = 4

interface Labels {
  previousMonth: string
  nextMonth: string
  previousYear: string
  nextYear: string
  chooseMonth: string
  hasEvents: string
  noEvents: string
}

/** Words the browser cannot translate through `Intl`, by language; any other language falls back to English. */
const LABELS: Record<string, Labels> = {
  en: {
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    previousYear: 'Previous year',
    nextYear: 'Next year',
    chooseMonth: 'Choose a month',
    hasEvents: 'has events',
    noEvents: 'No events',
  },
  fr: {
    previousMonth: 'Mois précédent',
    nextMonth: 'Mois suivant',
    previousYear: 'Année précédente',
    nextYear: 'Année suivante',
    chooseMonth: 'Choisir un mois',
    hasEvents: 'contient des événements',
    noEvents: 'Aucun événement',
  },
  de: {
    previousMonth: 'Vorheriger Monat',
    nextMonth: 'Nächster Monat',
    previousYear: 'Vorheriges Jahr',
    nextYear: 'Nächstes Jahr',
    chooseMonth: 'Monat auswählen',
    hasEvents: 'hat Termine',
    noEvents: 'Keine Termine',
  },
  es: {
    previousMonth: 'Mes anterior',
    nextMonth: 'Mes siguiente',
    previousYear: 'Año anterior',
    nextYear: 'Año siguiente',
    chooseMonth: 'Elegir un mes',
    hasEvents: 'tiene eventos',
    noEvents: 'Sin eventos',
  },
  it: {
    previousMonth: 'Mese precedente',
    nextMonth: 'Mese successivo',
    previousYear: 'Anno precedente',
    nextYear: 'Anno successivo',
    chooseMonth: 'Scegli un mese',
    hasEvents: 'ha eventi',
    noEvents: 'Nessun evento',
  },
  pt: {
    previousMonth: 'Mês anterior',
    nextMonth: 'Próximo mês',
    previousYear: 'Ano anterior',
    nextYear: 'Próximo ano',
    chooseMonth: 'Escolher um mês',
    hasEvents: 'tem eventos',
    noEvents: 'Sem eventos',
  },
  nl: {
    previousMonth: 'Vorige maand',
    nextMonth: 'Volgende maand',
    previousYear: 'Vorig jaar',
    nextYear: 'Volgend jaar',
    chooseMonth: 'Kies een maand',
    hasEvents: 'heeft afspraken',
    noEvents: 'Geen afspraken',
  },
  vi: {
    previousMonth: 'Tháng trước',
    nextMonth: 'Tháng sau',
    previousYear: 'Năm trước',
    nextYear: 'Năm sau',
    chooseMonth: 'Chọn tháng',
    hasEvents: 'có sự kiện',
    noEvents: 'Không có sự kiện',
  },
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
 * across time zones. The header moves between months; `month` picks the one shown. `heading` puts a title of the
 * planner's own in front of the month (the `heading` slot takes markup instead, such as an editable field), and the
 * `actions` slot puts buttons of your own, e.g. "Add event", before the month navigation.
 *
 * The month title opens a month picker (turn it off with `month-picker="false"`): a year stepper over the twelve
 * months, where a dot and a soft tint mark every month that has events. Arrow keys move between months, Page Up/Page Down change the year, Enter picks and Escape closes.
 *
 * Below 480px of width the planner turns compact, as a phone calendar does: each day is its date over one dot per
 * event, a tap picks a day (arrow keys move between days) and that day's events are listed under the grid. It opens
 * on today, or on the 1st of another month.
 *
 * With `editable` the planner becomes a place to plan: clicking (or pressing Enter or Space on) a day fires `day-click`,
 * and pressing on one day and releasing on another highlights the days between and fires `range-select`. Event bars can
 * be dragged to another day (`event-change` with the new `start` and `end`, same length), or resized by dragging their
 * start or end edge; Escape cancels a drag, and a press that does not move stays an `event-click`. From the keyboard,
 * arrow keys move between days, and on a focused bar Alt+Arrow Left/Right moves it by a day, Alt+Arrow Up/Down by a
 * week and Alt+Shift+Arrow Left/Right changes its end. The planner never changes `events` itself: update them in the
 * handler. A compact planner fires `day-click` on a tap as well.
 *
 * Text follows `locale`, or the browser's language when it is not set: month and day names, "Today" and "this month"
 * come from `Intl`, and the navigation labels from a built-in list (English, French, German, Spanish, Italian,
 * Portuguese, Dutch, Vietnamese; other languages fall back to English).
 *
 * @tag c2-month-planner
 *
 * @event {CustomEvent<MonthPlannerEventClickDetail>} event-click - Fired when an event bar is activated; `detail.event` is the entry from `events`.
 * @event {CustomEvent<MonthPlannerMonthChangeDetail>} month-change - Fired when the header navigation shows another month; `detail.month` is `YYYY-MM`.
 * @event {CustomEvent<MonthPlannerDayClickDetail>} day-click - With `editable`: a day's empty area was clicked, tapped or activated with Enter/Space; `detail.date` is `YYYY-MM-DD`. Does not bubble.
 * @event {CustomEvent<MonthPlannerRangeSelectDetail>} range-select - With `editable`: a press on one day was released on another; `detail.start` and `detail.end` are the first and last day (`YYYY-MM-DD`, inclusive, ordered). Does not bubble.
 * @event {CustomEvent<MonthPlannerEventChangeDetail>} event-change - With `editable`: an event bar was dragged, resized or moved with Alt+Arrow keys; `detail.event` is the entry from `events` and `detail.changes` its new `start` and `end`. The planner does not apply it. Does not bubble.
 *
 * @slot heading - Title at the start of the header, in place of the `heading` text. It names the planner unless `heading` or `aria-label` is set.
 * @slot actions - Controls at the end of the header, before the month navigation, e.g. an "Add event" button.
 *
 * @csspart heading - Heading region wrapping the `heading` slot and the `heading` text fallback; assigned content keeps its own styles.
 * @csspart actions - Actions region wrapping the `actions` slot at the end of the header, before the month navigation; assigned controls keep their own styles.
 * @csspart event - Each event bar (one per week the event covers).
 * @csspart agenda-event - Each event in the compact layout's list of the selected day.
 *
 * @cssproperty {color} [--c2-month-planner--background=#ffffff]
 * @cssproperty {color} [--c2-month-planner--color=#18181b]
 * @cssproperty {border} [--c2-month-planner--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-month-planner--border-radius=8px]
 * @cssproperty {padding} [--c2-month-planner--padding=12px]
 * @cssproperty {font-family} [--c2-month-planner--font-family=inherit]
 * @cssproperty {font-size} [--c2-month-planner--font-size=14px]
 * @cssproperty {font-weight} [--c2-month-planner__title--font-weight=600]
 * @cssproperty {font-size} [--c2-month-planner__heading--font-size=14px] - The `heading`.
 * @cssproperty {font-weight} [--c2-month-planner__heading--font-weight=600]
 * @cssproperty {pixel} [--c2-month-planner__actions--gap=8px] - Space between the controls in the `actions` slot.
 * @cssproperty {pixel} [--c2-month-planner__navigation--size=32px]
 * @cssproperty {border-radius} [--c2-month-planner__navigation--border-radius=6px]
 * @cssproperty {color} [--c2-month-planner__navigation__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-month-planner__weekday--color=#71717a]
 * @cssproperty {font-size} [--c2-month-planner__weekday--font-size=12px]
 * @cssproperty {border} [--c2-month-planner__day--border=1px solid #e4e4e7] - Grid line between days.
 * @cssproperty {pixel} [--c2-month-planner__day--min-height=88px]
 * @cssproperty {font-size} [--c2-month-planner__day--font-size=12px]
 * @cssproperty {color} [--c2-month-planner__day__outside--background=#fafafa] - Background of the neighbouring months' days.
 * @cssproperty {color} [--c2-month-planner__day__outside--color=#71717a]
 * @cssproperty {color} [--c2-month-planner__day__today--background=rgba(2, 101, 220, 0.05)] - Tint of today's box; it stays inside the grid lines.
 * @cssproperty {color} [--c2-month-planner__day__today--color=rgb(2, 101, 220)] - Colour of today's date number.
 * @cssproperty {font-weight} [--c2-month-planner__day__today--font-weight=600]
 * @cssproperty {color} [--c2-month-planner__event--background=rgb(2, 101, 220)] - Bar colour of an event without its own `color`.
 * @cssproperty {color} [--c2-month-planner__event--color=#ffffff]
 * @cssproperty {pixel} [--c2-month-planner__event--height=22px]
 * @cssproperty {pixel} [--c2-month-planner__event--gap=2px] - Space between stacked lanes.
 * @cssproperty {border-radius} [--c2-month-planner__event--border-radius=4px]
 * @cssproperty {font-size} [--c2-month-planner__event--font-size=12px]
 * @cssproperty {font-weight} [--c2-month-planner__event--font-weight=500]
 * @cssproperty {opacity} [--c2-month-planner__event__hover--opacity=0.88]
 * @cssproperty {outline} [--c2-month-planner__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {pixel} [--c2-month-planner__focus--outline-offset=2px]
 * @cssproperty {color} [--c2-month-planner__title__hover--background=#f4f4f5] - Month title button, when the picker is on.
 * @cssproperty {color} [--c2-month-planner__picker--background=#ffffff]
 * @cssproperty {border} [--c2-month-planner__picker--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-month-planner__picker--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-month-planner__picker--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {padding} [--c2-month-planner__picker--padding=12px]
 * @cssproperty {pixel} [--c2-month-planner__picker--width=280px]
 * @cssproperty {pixel} [--c2-month-planner__month--height=44px]
 * @cssproperty {border-radius} [--c2-month-planner__month--border-radius=6px]
 * @cssproperty {color} [--c2-month-planner__month--color=#71717a] - A month without events.
 * @cssproperty {color} [--c2-month-planner__month__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-month-planner__month__selected--background=rgb(2, 101, 220)] - The month shown in the planner.
 * @cssproperty {color} [--c2-month-planner__month__selected--color=#ffffff]
 * @cssproperty {outline} [--c2-month-planner__month__current--outline=1px solid #a1a1aa] - Today's month.
 * @cssproperty {font-weight} [--c2-month-planner__month__marked--font-weight=600] - A month that has events.
 * @cssproperty {color} [--c2-month-planner__month__marked--color=#18181b]
 * @cssproperty {color} [--c2-month-planner__month__marked--background=rgba(2, 101, 220, 0.1)] - Soft tint behind a month that has events.
 * @cssproperty {color} [--c2-month-planner__month__marked__hover--background=rgba(2, 101, 220, 0.18)]
 * @cssproperty {color} [--c2-month-planner__marker--color=rgb(2, 101, 220)] - Dot on a month that has events.
 * @cssproperty {pixel} [--c2-month-planner__marker--size=6px]
 * @cssproperty {color} [--c2-month-planner__date__selected--background=#18181b] - Circle behind the selected day, in the compact layout.
 * @cssproperty {color} [--c2-month-planner__date__selected--color=#ffffff]
 * @cssproperty {color} [--c2-month-planner__date__today__selected--background=rgb(2, 101, 220)] - Circle behind today when it is selected.
 * @cssproperty {color} [--c2-month-planner__date__today__selected--color=#ffffff]
 * @cssproperty {pixel} [--c2-month-planner__dot--size=5px] - Event dot under a day, in the compact layout.
 * @cssproperty {color} [--c2-month-planner__agenda-event__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-month-planner__day__hover--background=#f4f4f5] - A day under the pointer, with `editable`.
 * @cssproperty {color} [--c2-month-planner__day__range--background=rgba(2, 101, 220, 0.1)] - Days of a range being selected, with `editable`.
 * @cssproperty {opacity} [--c2-month-planner__event__dragging--opacity=0.88] - The bar being dragged or resized.
 * @cssproperty {box-shadow} [--c2-month-planner__event__dragging--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - The bar being dragged or resized.
 * @cssproperty {pixel} [--c2-month-planner__handle--width=6px] - Width of the start and end edges that resize a bar, with `editable`.
 * @cssproperty {color} [--c2-month-planner__handle--color=#ffffff] - Grip shown on a resize edge under the pointer; a bar with its own `textColor` uses that instead.
 */
@customElement('c2-month-planner')
export class MonthPlanner extends LitElement {
  static override styles = unsafeCSS(styles)

  @state() private visibleMonth = beginningOfMonth(new Date())
  @state() private pickerOpen = false
  /** Day picked in the compact layout, as `YYYY-MM-DD`; its events are listed under the grid. */
  @state() private selectedDay = ''
  @state() private pickerYear = new Date().getFullYear()
  /** Month index (0–11) holding the picker's roving tab stop. */
  @state() private pickerFocus = 0
  @queryAll('.picker-month') private readonly monthButtons!: NodeListOf<HTMLButtonElement>
  private readonly slotPresence = new SlotPresenceController(this, ['heading', 'actions'])
  /** Days highlighted while a range is dragged, as ordered `YYYY-MM-DD`. */
  @state() private range: { start: string; end: string } | null = null
  /** An event being dragged or resized, drawn at its new dates. */
  @state() private preview: DatedEvent | null = null
  private gesture: Gesture | null = null
  /** Swallows the click the browser sends after a drag. */
  private suppressClick = false
  /** An event moved from the keyboard, focused again once the app has applied the change. */
  private refocus: MonthPlannerEvent | null = null

  /** The plan: `{ id?, title, start, end?, color? }` entries with `YYYY-MM-DD` dates. Accepts a JSON string as an attribute. */
  @property({ converter: jsonPropertyConverter }) events: MonthPlannerEvent[] = []
  /** Month shown, as `YYYY-MM`. Defaults to the current month; the header navigation updates it. */
  @property({ type: String }) month = ''
  /** Language of the planner's text, month and day names, e.g. `fr` or `en-GB`. Defaults to the browser's language. */
  @property({ type: String }) locale = ''
  /** First day of the week. Defaults to the convention of `locale` (Sunday in `en-US`, Monday in `fr` or `en-GB`). */
  @property({ attribute: 'week-start', reflect: true }) weekStart: MonthPlannerWeekStart | '' = ''
  /** Makes the month title open a year and month picker. Set `month-picker="false"` for a plain title. */
  @property({ type: Boolean, attribute: 'month-picker' }) monthPicker = true
  /** Title shown at the start of the header, before the month, e.g. "Team holidays". It also names the planner for assistive technology. */
  @property() heading = ''
  /**
   * Lets the user plan on the grid: a click on a day fires `day-click`, a drag across days `range-select`, and dragging
   * or resizing an event bar (or Alt+Arrow keys on it) `event-change`. The planner never changes `events` itself.
   */
  @property({ type: Boolean }) editable = false
  /** Accessible name for the planner; defaults to `heading`, else the month title. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('month')) {
      const month = parseMonth(this.month)
      if (month) this.visibleMonth = month
    }
  }

  protected override updated(changed: PropertyValues<this>) {
    if (changed.has('events') && this.refocus) {
      const moved = this.refocus
      this.refocus = null
      const events = Array.isArray(this.events) ? this.events : []
      // The app usually replaces the entry with a new object: find it again by id, else by title.
      let index = events.indexOf(moved)
      if (index === -1 && moved.id !== undefined) index = events.findIndex((event) => event?.id === moved.id)
      if (index === -1) index = events.findIndex((event) => event?.title === moved.title)
      if (index !== -1) this.renderRoot.querySelector<HTMLButtonElement>(`.event[data-index="${index}"]`)?.focus()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.ownerDocument.removeEventListener('pointerdown', this.handleOutsidePointer, true)
    this.endGesture()
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

  private get labels(): Labels {
    return LABELS[this.effectiveLocale.toLowerCase().split('-')[0]] ?? LABELS.en
  }

  /** The Today button's label: "today" in the planner's language, capitalised. */
  private todayLabel() {
    const today = this.relative('day')
    return today.charAt(0).toLocaleUpperCase(this.effectiveLocale) + today.slice(1)
  }

  /** "today", "this month" in the planner's language. */
  private relative(unit: 'day' | 'month') {
    try {
      return new Intl.RelativeTimeFormat(this.effectiveLocale, { numeric: 'auto' }).format(0, unit)
    } catch {
      return unit === 'day' ? 'today' : 'this month'
    }
  }

  private showMonth(month: Date) {
    if (toMonth(month) === toMonth(this.visibleMonth)) return
    this.visibleMonth = month
    this.month = toMonth(month)
    this.dispatchEvent(new CustomEvent<MonthPlannerMonthChangeDetail>('month-change', { detail: { month: this.month }, bubbles: true, composed: true }))
  }

  private openEvent(event: MonthPlannerEvent) {
    if (this.consumeSuppressedClick()) return
    this.dispatchEvent(new CustomEvent<MonthPlannerEventClickDetail>('event-click', { detail: { event }, bubbles: true, composed: true }))
  }

  /** `YYYY-MM` of every month an event touches. */
  private markedMonths() {
    const months = new Set<string>()
    for (const event of Array.isArray(this.events) ? this.events : []) {
      const start = fromIso(event?.start)
      if (!start) continue
      const end = fromIso(event.end) ?? start
      // A malformed multi-decade event should not stall rendering: stop after 100 years of months.
      for (let month = beginningOfMonth(start), count = 0; month <= end && count < 1200; month = beginningOfMonth(month, 1), count++) months.add(toMonth(month))
    }
    return months
  }

  private handleOutsidePointer = (event: PointerEvent) => {
    if (!event.composedPath().includes(this)) this.closePicker(false)
  }

  private async openPicker() {
    this.pickerYear = this.visibleMonth.getFullYear()
    this.pickerFocus = this.visibleMonth.getMonth()
    this.pickerOpen = true
    this.ownerDocument.addEventListener('pointerdown', this.handleOutsidePointer, true)
    await this.updateComplete
    this.monthButtons[this.pickerFocus]?.focus()
  }

  private closePicker(restoreFocus = true) {
    if (!this.pickerOpen) return
    this.pickerOpen = false
    this.ownerDocument.removeEventListener('pointerdown', this.handleOutsidePointer, true)
    if (restoreFocus) this.renderRoot.querySelector<HTMLButtonElement>('.title-button')?.focus()
  }

  private pickMonth(month: number) {
    this.showMonth(new Date(this.pickerYear, month, 1, 12))
    this.closePicker()
  }

  private async movePickerFocus(month: number) {
    const year = this.pickerYear + Math.floor(month / 12)
    this.pickerYear = year
    this.pickerFocus = ((month % 12) + 12) % 12
    await this.updateComplete
    this.monthButtons[this.pickerFocus]?.focus()
  }

  private handlePickerKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closePicker()
      return
    }
    if (!(event.target as HTMLElement).classList.contains('picker-month')) return
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4, PageUp: -12, PageDown: 12 }
    let target = event.key in moves ? this.pickerFocus + moves[event.key] : null
    if (event.key === 'Home') target = 0
    if (event.key === 'End') target = 11
    if (target === null) return
    event.preventDefault()
    this.movePickerFocus(target)
  }

  private handlePickerFocusout(event: FocusEvent) {
    const next = event.relatedTarget as Node | null
    if (next && !this.renderRoot.contains(next)) this.closePicker(false)
  }

  private renderPicker(locale: string) {
    const marked = this.markedMonths()
    const year = this.pickerYear
    const short = new Intl.DateTimeFormat(locale, { month: 'short' })
    const long = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })
    const now = new Date()
    const shown = this.visibleMonth
    return html`<div
      class="picker"
      role="dialog"
      aria-label=${this.labels.chooseMonth}
      @keydown=${this.handlePickerKeydown}
      @focusout=${this.handlePickerFocusout}
    >
      <div class="picker-year">
        <button class="nav" type="button" aria-label=${this.labels.previousYear} @click=${() => this.movePickerFocus(this.pickerFocus - 12)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <span class="picker-year-label" aria-live="polite">${year}</span>
        <button class="nav" type="button" aria-label=${this.labels.nextYear} @click=${() => this.movePickerFocus(this.pickerFocus + 12)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </div>
      <div class="picker-months">
        ${Array.from({ length: 12 }, (_, month) => {
          const date = new Date(year, month, 1, 12)
          const hasEvents = marked.has(toMonth(date))
          const selected = year === shown.getFullYear() && month === shown.getMonth()
          const current = year === now.getFullYear() && month === now.getMonth()
          const label = [long.format(date), hasEvents ? this.labels.hasEvents : '', current ? this.relative('month') : ''].filter(Boolean).join(', ')
          return html`<button
            class="picker-month ${hasEvents ? 'marked' : ''} ${selected ? 'selected' : ''} ${current ? 'current' : ''}"
            type="button"
            aria-label=${label}
            aria-current=${selected ? 'true' : nothing}
            tabindex=${month === this.pickerFocus ? '0' : '-1'}
            @click=${() => this.pickMonth(month)}
          >
            <span>${short.format(date)}</span>
            <span class="marker" aria-hidden="true"></span>
          </button>`
        })}
      </div>
    </div>`
  }

  private get firstGridDay() {
    const first = this.visibleMonth
    const offset = (first.getDay() - this.firstWeekday + 7) % 7
    return addDays(first, -offset)
  }

  /** Every event with valid dates, its end clamped to its start. */
  private get datedEvents(): DatedEvent[] {
    const preview = this.preview
    return (Array.isArray(this.events) ? this.events : []).flatMap((event) => {
      if (preview && event === preview.event) return [preview]
      const start = fromIso(event?.start)
      const end = fromIso(event?.end) ?? start
      return start && end ? [{ event, start, end: end < start ? start : end }] : []
    })
  }

  /** The compact layout's selected day: the picked one while it is in the month shown, else today, else the 1st. */
  private get shownDay(): string {
    const month = toMonth(this.visibleMonth)
    if (this.selectedDay.startsWith(month)) return this.selectedDay
    const today = toIso(new Date())
    return today.startsWith(month) ? today : toIso(this.visibleMonth)
  }

  private async selectDay(date: Date, focus = false) {
    if (date.getMonth() !== this.visibleMonth.getMonth() || date.getFullYear() !== this.visibleMonth.getFullYear()) this.showMonth(beginningOfMonth(date))
    this.selectedDay = toIso(date)
    if (!focus) return
    await this.updateComplete
    this.renderRoot.querySelector<HTMLButtonElement>('.day-select[tabindex="0"]')?.focus()
  }

  /** The compact layout is on: the planner is narrower than its breakpoint. */
  private get compact() {
    const agenda = this.renderRoot.querySelector('.agenda')
    return agenda ? getComputedStyle(agenda).display !== 'none' : false
  }

  private consumeSuppressedClick() {
    if (!this.suppressClick) return false
    this.suppressClick = false
    return true
  }

  private handleDayClick(date: Date) {
    if (this.consumeSuppressedClick()) return
    if (!this.editable || this.compact) this.selectDay(date)
    // On the full grid a click plans on that day without leaving the month; it still moves the keyboard's tab stop.
    else if (toMonth(date) === toMonth(this.visibleMonth)) this.selectedDay = toIso(date)
    if (this.editable) this.dispatchEvent(new CustomEvent<MonthPlannerDayClickDetail>('day-click', { detail: { date: toIso(date) } }))
  }

  /** The day whose cell is nearest the point, so a drag past the grid's edge stops at its last day. */
  private dayAt(x: number, y: number): Date | null {
    let best: { date: string; distance: number } | null = null
    for (const day of this.renderRoot.querySelectorAll<HTMLElement>('.day[data-date]')) {
      const rect = day.getBoundingClientRect()
      const dx = Math.max(rect.left - x, 0, x - rect.right)
      const dy = Math.max(rect.top - y, 0, y - rect.bottom)
      const distance = dx * dx + dy * dy
      if (!best || distance < best.distance) best = { date: day.dataset.date!, distance }
      if (distance === 0) break
    }
    return best ? fromIso(best.date) : null
  }

  private beginGesture(event: PointerEvent, kind: Gesture['kind'], item?: DatedEvent) {
    if (!this.editable || event.button !== 0 || !event.isPrimary || this.gesture) return
    if (kind === 'range' && this.compact) return
    const anchor = this.dayAt(event.clientX, event.clientY)
    if (!anchor) return
    this.gesture = { kind, pointerId: event.pointerId, x: event.clientX, y: event.clientY, anchor, hovered: anchor, active: false, item }
    const view = this.ownerDocument.defaultView
    view?.addEventListener('pointermove', this.handleGestureMove)
    view?.addEventListener('pointerup', this.handleGestureUp)
    view?.addEventListener('pointercancel', this.handleGestureCancel)
    this.ownerDocument.addEventListener('keydown', this.handleGestureKeydown, true)
  }

  private endGesture() {
    this.gesture = null
    this.range = null
    this.preview = null
    const view = this.ownerDocument.defaultView
    view?.removeEventListener('pointermove', this.handleGestureMove)
    view?.removeEventListener('pointerup', this.handleGestureUp)
    view?.removeEventListener('pointercancel', this.handleGestureCancel)
    this.ownerDocument.removeEventListener('keydown', this.handleGestureKeydown, true)
  }

  /** Swallows the click the browser may send after a drag; the flag lapses if it sends none. */
  private suppressNextClick() {
    this.suppressClick = true
    setTimeout(() => (this.suppressClick = false))
  }

  /** New dates for the dragged event once the pointer has moved `delta` days from where it was pressed. */
  private movedDates(gesture: Gesture, delta: number): { start: Date; end: Date } {
    const { start, end } = gesture.item!
    if (gesture.kind === 'start') {
      const moved = addDays(start, delta)
      return { start: moved > end ? end : moved, end }
    }
    if (gesture.kind === 'end') {
      const moved = addDays(end, delta)
      return { start, end: moved < start ? start : moved }
    }
    return { start: addDays(start, delta), end: addDays(end, delta) }
  }

  private handleGestureMove = (event: PointerEvent) => {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    if (!gesture.active && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < DRAG_THRESHOLD) return
    gesture.active = true
    event.preventDefault()
    gesture.hovered = this.dayAt(event.clientX, event.clientY) ?? gesture.hovered
    if (gesture.kind === 'range') {
      const [start, end] = [toIso(gesture.anchor), toIso(gesture.hovered)].sort()
      if (this.range?.start !== start || this.range?.end !== end) this.range = { start, end }
      return
    }
    const { start, end } = this.movedDates(gesture, dayDiff(gesture.anchor, gesture.hovered))
    if (this.preview?.start.getTime() !== start.getTime() || this.preview?.end.getTime() !== end.getTime()) {
      this.preview = { event: gesture.item!.event, start, end }
    }
  }

  private handleGestureUp = (event: PointerEvent) => {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    this.endGesture()
    if (!gesture.active) return
    if (gesture.kind === 'range') {
      // Released on the day it began: the click that follows reports it as that day.
      if (toIso(gesture.anchor) === toIso(gesture.hovered)) return
      this.suppressNextClick()
      const [start, end] = [toIso(gesture.anchor), toIso(gesture.hovered)].sort()
      this.dispatchEvent(new CustomEvent<MonthPlannerRangeSelectDetail>('range-select', { detail: { start, end } }))
      return
    }
    this.suppressNextClick()
    const { start, end } = this.movedDates(gesture, dayDiff(gesture.anchor, gesture.hovered))
    this.changeEvent(gesture.item!, start, end)
  }

  private handleGestureCancel = (event: PointerEvent) => {
    if (this.gesture && event.pointerId === this.gesture.pointerId) this.endGesture()
  }

  private handleGestureKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.gesture) return
    event.preventDefault()
    event.stopPropagation()
    const wasActive = this.gesture.active
    this.endGesture()
    if (wasActive) this.suppressNextClick()
  }

  /** Fires `event-change` when the dates differ from the entry's own. */
  private changeEvent(item: DatedEvent, start: Date, end: Date) {
    if (start.getTime() === item.start.getTime() && end.getTime() === item.end.getTime()) return false
    this.dispatchEvent(
      new CustomEvent<MonthPlannerEventChangeDetail>('event-change', { detail: { event: item.event, changes: { start: toIso(start), end: toIso(end) } } }),
    )
    return true
  }

  /** Alt+Arrow keys move a focused bar by a day or a week; Alt+Shift+Arrow Left/Right change its end. */
  private handleEventKeydown(event: KeyboardEvent, item: DatedEvent) {
    if (!this.editable || !event.altKey || event.ctrlKey || event.metaKey) return
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const step = steps[event.key]
    if (step === undefined || (event.shiftKey && Math.abs(step) !== 1)) return
    event.preventDefault()
    const end = addDays(item.end, step)
    const changed = event.shiftKey
      ? this.changeEvent(item, item.start, end < item.start ? item.start : end)
      : this.changeEvent(item, addDays(item.start, step), end)
    if (changed) this.refocus = item.event
  }

  private handleDayKeydown(event: KeyboardEvent, date: Date) {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    if (!(event.key in moves)) return
    event.preventDefault()
    this.selectDay(addDays(date, moves[event.key]), true)
  }

  /** Cuts every event that touches the week into one bar and stacks overlapping bars into lanes. */
  private segmentsOf(weekStart: Date): Segment[] {
    const weekEnd = addDays(weekStart, 6)
    const events = this.datedEvents
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

  private eventLabel({ event, start, end }: DatedEvent, dateLabel: Intl.DateTimeFormat) {
    return end > start ? `${event.title}, ${dateLabel.format(start)} – ${dateLabel.format(end)}` : `${event.title}, ${dateLabel.format(start)}`
  }

  private renderWeek(weekStart: Date, today: string, selected: string, dateLabel: Intl.DateTimeFormat) {
    const segments = this.segmentsOf(weekStart)
    const dated = this.datedEvents
    const range = this.range
    const events = Array.isArray(this.events) ? this.events : []
    const lanes = segments.reduce((count, segment) => Math.max(count, segment.lane + 1), 0)
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
    return html`<div class="week" style=${styleMap({ '--lanes': String(lanes) })}>
      ${days.map((date, index) => {
        const value = toIso(date)
        const outside = date.getMonth() !== this.visibleMonth.getMonth()
        const inRange = range !== null && value >= range.start && value <= range.end
        return html`<div
          class="day ${outside ? 'outside' : ''} ${value === today ? 'today' : ''} ${inRange ? 'in-range' : ''}"
          data-date=${value}
          style=${styleMap({ gridColumn: String(index + 1) })}
        >
          <span class="date ${value === today ? 'today' : ''}" aria-current=${value === today ? 'date' : nothing}>${date.getDate()}</span>
          ${this.renderDaySelect(date, value, value === today, value === selected, dated, dateLabel)}
        </div>`
      })}
      ${segments.map((segment) => {
        const item = dated.find((entry) => entry.event === segment.event)!
        const dragging = this.preview?.event === segment.event
        return html`<button
          class="event ${segment.starts ? 'starts' : ''} ${segment.ends ? 'ends' : ''} ${dragging ? 'dragging' : ''}"
          type="button"
          part="event"
          data-index=${events.indexOf(segment.event)}
          aria-label=${this.eventLabel(item, dateLabel)}
          aria-keyshortcuts=${this.editable ? 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown Alt+Shift+ArrowLeft Alt+Shift+ArrowRight' : nothing}
          title=${segment.event.title}
          style=${styleMap({
            gridColumn: `${segment.column + 1} / span ${segment.span}`,
            gridRow: String(segment.lane + 2),
            '--event-color': segment.event.color || null,
            // A colour of the author's own keeps its text colour in every theme; only the default follows it.
            '--event-text-color': segment.event.color ? segment.event.textColor || '#ffffff' : null,
          })}
          @click=${() => this.openEvent(segment.event)}
          @pointerdown=${(event: PointerEvent) => this.beginGesture(event, 'move', item)}
          @keydown=${(event: KeyboardEvent) => this.handleEventKeydown(event, item)}
        >
          <span class="event-title">${segment.event.title}</span>
          ${this.editable && segment.starts ? this.renderHandle('start', item) : nothing}
          ${this.editable && segment.ends ? this.renderHandle('end', item) : nothing}
        </button>`
      })}
    </div>`
  }

  /** An edge of an editable bar that resizes it from that side. */
  private renderHandle(side: 'start' | 'end', item: DatedEvent) {
    return html`<span
      class="handle handle-${side}"
      aria-hidden="true"
      @pointerdown=${(event: PointerEvent) => {
        // The bar's own listener would start a move instead.
        event.stopPropagation()
        this.beginGesture(event, side, item)
      }}
    ></span>`
  }

  /** The compact layout's day: a date in a circle over one dot per event (three at most), picking the listed day. */
  private renderDaySelect(date: Date, value: string, today: boolean, selected: boolean, dated: DatedEvent[], dateLabel: Intl.DateTimeFormat) {
    const onDay = dated.filter((item) => item.start <= date && item.end >= date)
    const label = `${dateLabel.format(date)}${today ? `, ${this.relative('day')}` : ''}${onDay.length ? `, ${this.labels.hasEvents}` : ''}`
    return html`<button
      class="day-select"
      type="button"
      tabindex=${selected ? '0' : '-1'}
      aria-pressed=${selected ? 'true' : 'false'}
      aria-label=${label}
      @click=${() => this.handleDayClick(date)}
      @pointerdown=${(event: PointerEvent) => this.beginGesture(event, 'range')}
      @keydown=${(event: KeyboardEvent) => this.handleDayKeydown(event, date)}
    >
      <span class="date-number" aria-hidden="true">${date.getDate()}</span>
      <span class="dots" aria-hidden="true"
        >${onDay.slice(0, 3).map((item) => html`<span class="dot" style=${styleMap({ '--event-color': item.event.color || null })}></span>`)}</span
      >
      <span class="visually-hidden">${value}</span>
    </button>`
  }

  /** The compact layout's list of the selected day's events. */
  private renderAgenda(selected: string, locale: string) {
    const day = fromIso(selected)!
    const heading = new Intl.DateTimeFormat(locale, { weekday: 'long', month: 'long', day: 'numeric' }).format(day)
    const range = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
    const dateLabel = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' })
    const onDay = this.datedEvents.filter((item) => item.start <= day && item.end >= day)
    return html`<section class="agenda" aria-label=${heading}>
      <h3 class="agenda-heading">${heading}</h3>
      ${
        onDay.length
          ? html`<ul class="agenda-list">
              ${onDay.map(
                (item) =>
                  html`<li>
                    <button
                      class="agenda-event"
                      type="button"
                      part="agenda-event"
                      aria-label=${this.eventLabel(item, dateLabel)}
                      style=${styleMap({ '--event-color': item.event.color || null })}
                      @click=${() => this.openEvent(item.event)}
                    >
                      <span class="swatch" aria-hidden="true"></span>
                      <span class="agenda-text">
                        <span class="agenda-name">${item.event.title}</span>
                        ${item.end > item.start ? html`<span class="agenda-when">${range.format(item.start)} – ${range.format(item.end)}</span>` : nothing}
                      </span>
                    </button>
                  </li>`,
              )}
            </ul>`
          : html`<p class="agenda-empty">${this.labels.noEvents}</p>`
      }
    </section>`
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
    const selected = this.shownDay

    const hasHeading = Boolean(this.heading) || this.slotPresence.has('heading')
    // Slotted heading markup names the planner through the heading itself; text set as a property names it directly.
    const labelledByHeading = !this.ariaLabel && !this.heading && hasHeading

    const gesture = this.preview ? (this.gesture?.kind === 'move' ? 'moving' : 'resizing') : ''
    return html`<section
      class="c2-month-planner ${this.editable ? 'editable' : ''} ${gesture}"
      aria-label=${labelledByHeading ? nothing : this.ariaLabel || this.heading || title}
      aria-labelledby=${labelledByHeading ? 'heading' : nothing}
    >
      <header class="header">
        <h2 class="heading" part="heading" id="heading" ?hidden=${!hasHeading}>
          <slot name="heading" @slotchange=${this.slotPresence.handleSlotChange}>${this.heading}</slot>
        </h2>
        <h2 class="title" aria-live="polite">
          ${
            this.monthPicker
              ? html`<button
                  class="title-button"
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded=${this.pickerOpen ? 'true' : 'false'}
                  @click=${() => (this.pickerOpen ? this.closePicker() : this.openPicker())}
                >
                  ${title}
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>`
              : title
          }
        </h2>
        <div class="trailing">
          <div class="actions" part="actions" ?hidden=${!this.slotPresence.has('actions')}>
            <slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot>
          </div>
          <div class="navigation">
            <button class="nav" type="button" aria-label=${this.labels.previousMonth} @click=${() => this.showMonth(beginningOfMonth(this.visibleMonth, -1))}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <button class="nav today-button" type="button" @click=${() => this.showMonth(beginningOfMonth(new Date()))}>${this.todayLabel()}</button>
            <button class="nav" type="button" aria-label=${this.labels.nextMonth} @click=${() => this.showMonth(beginningOfMonth(this.visibleMonth, 1))}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>
        ${this.monthPicker && this.pickerOpen ? this.renderPicker(locale) : nothing}
      </header>
      <div class="weekdays" aria-hidden="true">${Array.from({ length: 7 }, (_, index) => html`<span>${weekdays.format(addDays(first, index))}</span>`)}</div>
      <div class="weeks">${Array.from({ length: weeks }, (_, week) => this.renderWeek(addDays(first, week * 7), today, selected, dateLabel))}</div>
      ${this.renderAgenda(selected, locale)}
    </section>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-month-planner': MonthPlanner
  }
}
