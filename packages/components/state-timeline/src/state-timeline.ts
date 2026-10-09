import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './state-timeline.scss?inline'
import {
  axisTicks,
  buildModel,
  durationStep,
  formatDuration,
  momentFormatter,
  placeMarkers,
  rangeFormatter,
  segmentAt,
  segmentNear,
  stackLabels,
  stateTotals,
  timeOutsideBaseline,
  type PlacedSegment,
  type ResolvedState,
  type TimelineModel,
  type TimelineRow,
} from './state-timeline-model.js'
import type {
  StateTimelineMarker,
  StateTimelineMomentContext,
  StateTimelineSegmentContext,
  StateTimelineSegmentEventDetail,
  StateTimelineSegmentHoverEventDetail,
  StateTimelineSeries,
  StateTimelineState,
  StateTimelineTime,
} from './state-timeline-types.js'

export type * from './state-timeline-types.js'
export { formatDuration } from './state-timeline-model.js'

/** Events fired by `c2-state-timeline`. */
export interface StateTimelineEventMap {
  'segment-click': CustomEvent<StateTimelineSegmentEventDetail>
  'segment-hover': CustomEvent<StateTimelineSegmentHoverEventDetail>
}

export interface StateTimeline {
  addEventListener: TypedAddEventListener<StateTimeline, StateTimelineEventMap>
  removeEventListener: TypedRemoveEventListener<StateTimeline, StateTimelineEventMap>
}

/** Track width assumed before the element has been measured, and on a server. */
const DEFAULT_TRACK_WIDTH = 600
/** Gap between the tooltip and the time line. */
const TOOLTIP_GAP = 12
const NO_DATA = 'No data'

/** Position of a segment: its row, and its place among the drawn segments of that row. */
interface Cell {
  row: number
  position: number
}

/** The moment the time line and the tooltip show, and the segment that put it there. */
interface Moment {
  time: number
  focus: Cell | null
}

/**
 * One band per series, coloured by the discrete state it was in over time: service health, deployment status, a
 * host's power state, a CI job's results. The normal state stays quiet so the exceptions stand out.
 *
 * `series` holds the bands, each a list of segments with a `start`, an optional `end` and a `state`. Segments
 * without an `end` last until the next one starts, so a list of state changes is enough; the last one runs to the
 * end of the timeline. `states` names the values and picks their colours (`tone`); a value it does not list is shown
 * as written, with the next free palette colour. A `null` state marks a stretch with no data.
 *
 * Mark one state as the `baseline` (operational, passing, on): it is drawn as a pale wash with no text, every other
 * state as a solid fill labelled where it fits, and each band ends with the time it spent outside the baseline. A dot
 * before each band's label shows the state it is in at the end of the range, and the legend gives each state's total.
 *
 * Hovering draws a line through every band, and the tooltip lists what each one was doing at that moment. The
 * visible range is `start`–`end`, or the span of the data; times are shown in the browser's time zone. `markers` pins
 * events such as deploys above the bands.
 *
 * The timeline is a grid: one Tab stop, ← and → move between the segments of a band, ↑ and ↓ between bands, Home and
 * End jump to a band's ends, and Enter fires `segment-click`. Each segment's accessible name gives its band, state,
 * times and duration.
 *
 * @tag c2-state-timeline
 *
 * @slot heading - Title shown at the start of the header row, before the legend.
 * @slot empty - Shown when there are no series. Defaults to "No data".
 *
 * @event {CustomEvent<StateTimelineSegmentEventDetail>} segment-click - Fired when a segment is clicked, or Enter or Space is pressed on it. Bubbles.
 * @event {CustomEvent<StateTimelineSegmentHoverEventDetail>} segment-hover - Fired when the pointer moves onto a segment, or off the segments (`segment: null`). Does not bubble.
 *
 * @csspart base - The timeline's frame.
 * @csspart header - Row above the bands holding the `heading` slot and the legend.
 * @csspart legend - The list of states with their total times.
 * @csspart markers - Strip of event pins above the bands.
 * @csspart marker - One event pin.
 * @csspart row - One band: its label, its track and its summary.
 * @csspart label - A band's label, with the dot of its current state.
 * @csspart track - The strip a band's segments are drawn on.
 * @csspart segment - One segment.
 * @csspart summary - Time a band spent outside the baseline state.
 * @csspart axis - The time axis under the bands.
 * @csspart tick - One label of the time axis.
 * @csspart crosshair - The line marking the hovered or focused moment.
 * @csspart tooltip - The tooltip.
 * @csspart empty - Region wrapping the `empty` slot, shown only while there are no series.
 *
 * @cssproperty {pixel} [--c2-state-timeline--width=100%] - Width of the timeline; it fills its container by default.
 * @cssproperty {color} [--c2-state-timeline--background=#ffffff] - Surface of the timeline; the baseline wash is mixed against it.
 * @cssproperty {color} [--c2-state-timeline--color=#18181b] - Text colour.
 * @cssproperty {font-family} [--c2-state-timeline--font-family=inherit] - Font of every text.
 * @cssproperty {font-size} [--c2-state-timeline--font-size=12px] - Size of every text.
 * @cssproperty {pixel} [--c2-state-timeline--gap=12px] - Space between the header, the bands and the axis.
 * @cssproperty {font-weight} [--c2-state-timeline__heading--font-weight=600] - Weight of the `heading` slot's text.
 * @cssproperty {pixel} [--c2-state-timeline__label--width=120px] - Width of the label column; `0px` hides the labels.
 * @cssproperty {color} [--c2-state-timeline__label--color=#18181b] - Colour of the band labels.
 * @cssproperty {font-weight} [--c2-state-timeline__label--font-weight=500] - Weight of the band labels.
 * @cssproperty {pixel} [--c2-state-timeline__summary--width=72px] - Width of the summary column. The column only shows when a state is the baseline.
 * @cssproperty {color} [--c2-state-timeline__summary--color=#18181b] - Colour of the time outside the baseline.
 * @cssproperty {pixel} [--c2-state-timeline__row--height=24px] - Height of a band.
 * @cssproperty {pixel} [--c2-state-timeline__row--gap=8px] - Space between two bands.
 * @cssproperty {border} [--c2-state-timeline__row--border-top=0px solid transparent] - Rule above each band; set it with a `0px` row gap for a table look.
 * @cssproperty {color} [--c2-state-timeline__track--background=#f4f4f5] - Strip behind a band's segments, visible where it has no data.
 * @cssproperty {border-radius} [--c2-state-timeline__track--border-radius=4px] - Rounding of the strip and of the segments at its ends.
 * @cssproperty {pixel} [--c2-state-timeline__segment--height=100%] - Height of a segment that is not the baseline, as a length or a share of the band.
 * @cssproperty {pixel} [--c2-state-timeline__segment--gap=1px] - Space between two segments; `0px` joins them.
 * @cssproperty {border-radius} [--c2-state-timeline__segment--border-radius=0px] - Rounding of each segment's inner ends.
 * @cssproperty {percentage} [--c2-state-timeline__segment--background-mix=100%] - Share of the state colour in a segment that is not the baseline.
 * @cssproperty {color} [--c2-state-timeline__segment--color=#ffffff] - Colour of the state written inside a segment.
 * @cssproperty {font-weight} [--c2-state-timeline__segment--font-weight=500] - Weight of the state written inside a segment.
 * @cssproperty {outline} [--c2-state-timeline__segment__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the active segment.
 * @cssproperty {border} [--c2-state-timeline__segment__empty--border=1px dashed #bcbcc6] - Outline of a stretch with no data.
 * @cssproperty {color} [--c2-state-timeline__segment__baseline--color] - Colour of the baseline wash. Unset, the baseline state's own tone.
 * @cssproperty {percentage} [--c2-state-timeline__segment__baseline--background-mix=24%] - Share of the colour in the baseline wash.
 * @cssproperty {pixel} [--c2-state-timeline__segment__baseline--height=100%] - Height of a baseline segment; a few pixels draw it as a line.
 * @cssproperty {color} [--c2-state-timeline__axis--color=#71717a] - Colour of the axis labels.
 * @cssproperty {border} [--c2-state-timeline__axis--border-top=1px solid #e4e4e7] - Line above the axis labels.
 * @cssproperty {color} [--c2-state-timeline__crosshair--color=#18181b] - Colour of the time line and of its time label.
 * @cssproperty {color} [--c2-state-timeline__marker--color=#71717a] - Colour of the event pins' labels.
 * @cssproperty {border} [--c2-state-timeline__marker--border-left=1px solid #bcbcc6] - Stem of an event pin.
 * @cssproperty {color} [--c2-state-timeline__legend--color=#71717a] - Colour of the legend labels.
 * @cssproperty {pixel} [--c2-state-timeline__swatch--size=8px] - Size of the state dots in labels, the legend and the tooltip.
 * @cssproperty {border-radius} [--c2-state-timeline__swatch--border-radius=999px] - Rounding of the state dots.
 * @cssproperty {color} [--c2-state-timeline__tooltip--background=#ffffff] - Fill of the tooltip.
 * @cssproperty {color} [--c2-state-timeline__tooltip--color=#18181b] - Text of the tooltip.
 * @cssproperty {color} [--c2-state-timeline__tooltip--muted-color=#71717a] - Secondary text of the tooltip.
 * @cssproperty {border} [--c2-state-timeline__tooltip--border=1px solid #d4d4d8] - Outline of the tooltip.
 * @cssproperty {border-radius} [--c2-state-timeline__tooltip--border-radius=8px] - Rounding of the tooltip.
 * @cssproperty {box-shadow} [--c2-state-timeline__tooltip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Shadow of the tooltip.
 * @cssproperty {pixel} [--c2-state-timeline__tooltip--width=280px] - Width of the tooltip.
 * @cssproperty {color} [--c2-state-timeline__tone-primary--color=rgb(2, 101, 220)] - `tone: 'primary'`.
 * @cssproperty {color} [--c2-state-timeline__tone-success--color=#15803d] - `tone: 'success'`.
 * @cssproperty {color} [--c2-state-timeline__tone-warning--color=#a16207] - `tone: 'warning'`.
 * @cssproperty {color} [--c2-state-timeline__tone-danger--color=#dc2626] - `tone: 'danger'`.
 * @cssproperty {color} [--c2-state-timeline__tone-neutral--color=#71717a] - `tone: 'neutral'`.
 * @cssproperty {color} [--c2-state-timeline__series-1--color=#0265dc] - `tone: 1`, the first automatic colour; the eight slots match the chart palette.
 * @cssproperty {color} [--c2-state-timeline__series-2--color=#ea580c] - `tone: 2`.
 * @cssproperty {color} [--c2-state-timeline__series-3--color=#0f766e] - `tone: 3`.
 * @cssproperty {color} [--c2-state-timeline__series-4--color=#db2777] - `tone: 4`.
 * @cssproperty {color} [--c2-state-timeline__series-5--color=#a16207] - `tone: 5`.
 * @cssproperty {color} [--c2-state-timeline__series-6--color=#7c3aed] - `tone: 6`.
 * @cssproperty {color} [--c2-state-timeline__series-7--color=#0891b2] - `tone: 7`.
 * @cssproperty {color} [--c2-state-timeline__series-8--color=#52525b] - `tone: 8`.
 * @cssproperty {color} [--c2-state-timeline__empty--color=#71717a] - Colour of the empty-state text.
 * @cssproperty {padding} [--c2-state-timeline__empty--padding=32px 16px] - Padding of the empty state.
 */
@customElement('c2-state-timeline')
export class StateTimeline extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  /** The bands, as an array or a JSON attribute. Assign a new array to change the data. */
  @property({ converter: jsonPropertyConverter }) series: StateTimelineSeries[] = []

  /**
   * Labels and colours of the state values, in legend order; mark the normal one `baseline`. Values the data uses but
   * this omits are added after them. The legend lists only the states some visible segment is in.
   */
  @property({ converter: jsonPropertyConverter }) states: StateTimelineState[] = []

  /** Events pinned above the bands, as `{ time, label }` objects. Those outside the visible range are left out. */
  @property({ converter: jsonPropertyConverter }) markers: StateTimelineMarker[] = []

  /** First visible time: milliseconds or an ISO string. Defaults to the earliest time in the data. */
  @property() start?: StateTimelineTime

  /** Last visible time: milliseconds or an ISO string. Defaults to the latest time in the data; set it when the last states are still running. */
  @property() end?: StateTimelineTime

  /** Leaves the time axis out. */
  @property({ type: Boolean, attribute: 'hide-axis', reflect: true }) hideAxis = false

  /** Leaves the legend of states out. */
  @property({ type: Boolean, attribute: 'hide-legend', reflect: true }) hideLegend = false

  /** Leaves out the column with each band's time outside the baseline state. */
  @property({ type: Boolean, attribute: 'hide-summary', reflect: true }) hideSummary = false

  /** Language of the axis and tooltip times. Defaults to the page's `lang`, then the browser's. */
  @property() locale?: string

  /** Accessible name of the timeline. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Replaces the tooltip's contents. Return anything Lit renders, or `null` for no tooltip. Property only. */
  @property({ attribute: false }) renderTooltip?: (context: StateTimelineMomentContext) => unknown

  @state() private trackWidth = DEFAULT_TRACK_WIDTH
  @state() private active: Cell = { row: 0, position: 0 }
  @state() private pointer: Moment | null = null
  /** The time line and tooltip follow the focus only while the keyboard is driving. */
  @state() private keyboardFocus = false
  @state() private focused = false

  #model: TimelineModel = buildModel([], [])
  #warnedInvalid = 0
  #hovered: Cell | null = null
  #resizeObserver?: ResizeObserver
  #tooltipFrame = 0
  #focusAfterUpdate = false
  readonly #slots = new SlotPresenceController(this, ['heading'])

  override connectedCallback(): void {
    super.connectedCallback()
    this.internals.role = 'grid'
    if (isServer) return
    this.#resizeObserver ??= new ResizeObserver(() => this.#measure())
    this.#resizeObserver.observe(this)
    addEventListener('scroll', this.#schedulePlaceTooltip, { capture: true, passive: true })
    addEventListener('resize', this.#schedulePlaceTooltip, { passive: true })
  }

  override disconnectedCallback(): void {
    this.#resizeObserver?.disconnect()
    cancelAnimationFrame(this.#tooltipFrame)
    removeEventListener('scroll', this.#schedulePlaceTooltip, { capture: true })
    removeEventListener('resize', this.#schedulePlaceTooltip)
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('series') || changed.has('states') || changed.has('start') || changed.has('end')) {
      this.#model = buildModel(this.series, this.states, this.start, this.end)
      if (this.#model.invalid && this.#model.invalid !== this.#warnedInvalid) {
        console.warn(`c2-state-timeline: ${this.#model.invalid} segment(s) skipped because their start or end is not a readable time.`)
      }
      this.#warnedInvalid = this.#model.invalid
      this.active = this.#clamp(this.active)
      this.pointer = null
      this.#hovered = null
    }
    this.internals.ariaLabel = this.ariaLabel ?? 'State timeline'
  }

  protected override updated(): void {
    if (this.#focusAfterUpdate) {
      this.#focusAfterUpdate = false
      this.#cellElement(this.active)?.focus()
    }
    if (this.#moment) this.#placeTooltip()
  }

  /** The bands as read from `series`: segments sorted, ends filled in and clipped to the visible range. */
  get rows(): readonly TimelineRow[] {
    return this.#model.rows
  }

  /** The visible range, in milliseconds. */
  get range(): { start: number; end: number } {
    return { start: this.#model.start, end: this.#model.end }
  }

  #measure() {
    const track = this.renderRoot.querySelector<HTMLElement>('.track')
    const width = track?.clientWidth ?? 0
    if (width > 0 && Math.abs(width - this.trackWidth) > 1) this.trackWidth = width
  }

  get #locale(): string | undefined {
    if (this.locale) return this.locale
    if (isServer) return 'en'
    return this.closest('[lang]')?.getAttribute('lang') || undefined
  }

  get #baseline(): ResolvedState | undefined {
    return this.#model.states.find((entry) => entry.baseline)
  }

  /** The nearest cell that holds a segment, or the first one. */
  #clamp(cell: Cell): Cell {
    const rows = this.#model.rows
    const row = rows[cell.row]?.segments.length ? cell.row : rows.findIndex((candidate) => candidate.segments.length)
    if (row < 0) return { row: 0, position: 0 }
    return { row, position: Math.min(Math.max(0, cell.row === row ? cell.position : 0), rows[row].segments.length - 1) }
  }

  #placed(cell: Cell | null): PlacedSegment | undefined {
    return cell ? this.#model.rows[cell.row]?.segments[cell.position] : undefined
  }

  #cellElement(cell: Cell): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`.segment[data-row="${cell.row}"][data-position="${cell.position}"]`)
  }

  #context(cell: Cell): StateTimelineSegmentContext | null {
    const row = this.#model.rows[cell.row]
    const placed = row?.segments[cell.position]
    if (!row || !placed) return null
    return {
      series: row.series,
      seriesIndex: row.index,
      segment: placed.segment,
      segmentIndex: placed.index,
      state: placed.state?.key ?? null,
      label: placed.state?.label ?? NO_DATA,
      start: placed.start,
      end: placed.end,
      duration: placed.end - placed.start,
    }
  }

  #cellFrom(event: Event): Cell | null {
    const target = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.classList.contains('segment'))
    if (!target) return null
    return { row: Number(target.dataset.row), position: Number(target.dataset.position) }
  }

  #activate(cell: Cell) {
    const detail = this.#context(cell)
    if (!detail) return
    this.dispatchEvent(new CustomEvent<StateTimelineSegmentEventDetail>('segment-click', { detail, bubbles: true, composed: true }))
  }

  #setHovered(cell: Cell | null) {
    const same = cell && this.#hovered && cell.row === this.#hovered.row && cell.position === this.#hovered.position
    if (same || (!cell && !this.#hovered)) return
    this.#hovered = cell
    this.dispatchEvent(new CustomEvent<StateTimelineSegmentHoverEventDetail>('segment-hover', { detail: { segment: cell ? this.#context(cell) : null } }))
  }

  #onClick = (event: MouseEvent) => {
    const cell = this.#cellFrom(event)
    if (!cell) return
    this.active = cell
    this.#activate(cell)
  }

  /** The time under the pointer, read from the first track: every track spans the same range at the same x. */
  #onPointerMove = (event: PointerEvent) => {
    const track = this.renderRoot.querySelector<HTMLElement>('.track')
    if (!track) return
    const box = track.getBoundingClientRect()
    const share = (event.clientX - box.left) / box.width
    const cell = this.#cellFrom(event)
    this.#setHovered(cell)
    if (!(share >= 0 && share <= 1)) {
      this.pointer = null
      return
    }
    this.keyboardFocus = false
    this.pointer = { time: this.#model.start + share * (this.#model.end - this.#model.start), focus: cell }
  }

  #onPointerLeave = () => {
    this.pointer = null
    this.#setHovered(null)
  }

  #onFocusIn = (event: FocusEvent) => {
    const cell = this.#cellFrom(event)
    this.focused = true
    if (cell && (cell.row !== this.active.row || cell.position !== this.active.position)) this.active = cell
  }

  #onFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget instanceof Node && this.renderRoot.contains(event.relatedTarget)) return
    this.focused = false
  }

  #onKeyDown = (event: KeyboardEvent) => {
    const rows = this.#model.rows
    const { row, position } = this.active
    const current = rows[row]?.segments[position]
    if (!current) return
    let next: Cell | null = null
    switch (event.key) {
      case 'ArrowLeft':
        next = { row, position: Math.max(0, position - 1) }
        break
      case 'ArrowRight':
        next = { row, position: Math.min(rows[row].segments.length - 1, position + 1) }
        break
      case 'Home':
        next = { row, position: 0 }
        break
      case 'End':
        next = { row, position: rows[row].segments.length - 1 }
        break
      case 'ArrowUp':
      case 'ArrowDown': {
        const step = event.key === 'ArrowUp' ? -1 : 1
        for (let candidate = row + step; candidate >= 0 && candidate < rows.length; candidate += step) {
          const near = segmentNear(rows[candidate], current.from, current.to)
          if (near >= 0) {
            next = { row: candidate, position: near }
            break
          }
        }
        next ??= { row, position }
        break
      }
      case 'Enter':
      case ' ':
        event.preventDefault()
        this.keyboardFocus = true
        this.#activate(this.active)
        return
      default:
        return
    }
    event.preventDefault()
    this.keyboardFocus = true
    this.pointer = null
    this.active = next
    this.#focusAfterUpdate = true
  }

  /** The moment on show: under the pointer, else the middle of the focused segment while the keyboard drives. */
  get #moment(): Moment | null {
    if (this.pointer) return this.pointer
    const placed = this.focused && this.keyboardFocus ? this.#placed(this.active) : undefined
    return placed ? { time: (placed.from + placed.to) / 2, focus: this.active } : null
  }

  #momentContext(moment: Moment): StateTimelineMomentContext {
    return {
      time: moment.time,
      focus: moment.focus ? this.#context(moment.focus) : null,
      rows: this.#model.rows.map((row, index) => {
        const position = segmentAt(row, moment.time)
        return { series: row.series, seriesIndex: row.index, segment: position < 0 ? null : this.#context({ row: index, position }) }
      }),
    }
  }

  /** Puts the tooltip beside the time line, on whichever side has room, level with the top of the bands. */
  #placeTooltip() {
    const moment = this.#moment
    const tip = this.renderRoot.querySelector<HTMLElement>('.tooltip')
    const track = this.renderRoot.querySelector<HTMLElement>('.track')
    const rows = this.renderRoot.querySelector<HTMLElement>('.rows')
    if (isServer || !moment || !tip || !track || !rows || typeof tip.showPopover !== 'function') return
    if (!tip.matches(':popover-open')) {
      try {
        tip.showPopover()
      } catch {
        return
      }
    }
    const box = track.getBoundingClientRect()
    const x = box.left + (this.#percent(moment.time) / 100) * box.width
    const { width, height } = tip.getBoundingClientRect()
    const right = x + TOOLTIP_GAP
    const left = right + width + 4 <= innerWidth ? right : Math.max(4, x - TOOLTIP_GAP - width)
    const top = Math.max(4, Math.min(rows.getBoundingClientRect().top, innerHeight - height - 4))
    tip.style.left = `${Math.round(left)}px`
    tip.style.top = `${Math.round(top)}px`
  }

  #schedulePlaceTooltip = () => {
    if (!this.#moment) return
    cancelAnimationFrame(this.#tooltipFrame)
    this.#tooltipFrame = requestAnimationFrame(() => this.#placeTooltip())
  }

  #percent(time: number): number {
    const span = this.#model.end - this.#model.start
    return span > 0 ? ((time - this.#model.start) / span) * 100 : 0
  }

  #tone(state: ResolvedState | null | undefined): string {
    return state ? `tone-${state.tone}` : 'is-empty'
  }

  #renderSegment(row: TimelineRow, rowIndex: number, placed: PlacedSegment, position: number, format: Intl.DateTimeFormat) {
    const label = placed.state?.label ?? NO_DATA
    const active = rowIndex === this.active.row && position === this.active.position
    const baseline = placed.state?.baseline ?? false
    const name = `${row.label ? `${row.label}: ` : ''}${label}, ${format.format(placed.start)} – ${format.format(placed.end)}, ${formatDuration(placed.end - placed.start)}`
    const left = this.#percent(placed.from)
    const classes = {
      segment: true,
      [this.#tone(placed.state)]: true,
      'is-baseline': baseline,
      'at-start': placed.from <= this.#model.start,
      'at-end': placed.to >= this.#model.end,
      active,
    }
    return html`<div
      class=${classMap(classes)}
      part="segment"
      role="gridcell"
      tabindex=${active ? 0 : -1}
      aria-label=${name}
      data-row=${rowIndex}
      data-position=${position}
      style=${styleMap({ left: `${left}%`, width: `${this.#percent(placed.to) - left}%` })}
    >
      <span class="segment-label" aria-hidden="true">${placed.state && !baseline ? label : nothing}</span>
    </div>`
  }

  #renderRow(row: TimelineRow, rowIndex: number, format: Intl.DateTimeFormat, summary: boolean) {
    const last = row.segments[row.segments.length - 1]
    const outside = timeOutsideBaseline(row)
    const outsideText = outside > 0 ? formatDuration(outside) : '—'
    const baseline = this.#baseline
    const spoken = [
      last ? `now ${last.state?.label ?? NO_DATA}` : '',
      summary && baseline ? `${outside > 0 ? outsideText : 'no time'} outside ${baseline.label}` : '',
    ]
      .filter(Boolean)
      .join(', ')
    return html`<div class="row" part="row" role="row">
      <div class="label" part="label" role="rowheader" title=${row.label}>
        ${last ? html`<span class=${classMap({ swatch: true, [this.#tone(last.state)]: true })} aria-hidden="true"></span>` : nothing}
        <span class="label-text">${row.label}</span>${spoken ? html`<span class="visually-hidden">, ${spoken}</span>` : nothing}
      </div>
      <div class="track" part="track">${row.segments.map((placed, position) => this.#renderSegment(row, rowIndex, placed, position, format))}</div>
      ${summary ? html`<div class="summary" part="summary" aria-hidden="true">${outsideText}</div>` : nothing}
    </div>`
  }

  #renderTooltip(moment: Moment, format: Intl.DateTimeFormat) {
    const context = this.#momentContext(moment)
    const step = durationStep(this.#model.start, this.#model.end)
    const content = this.renderTooltip
      ? this.renderTooltip(context)
      : html`<div class="tooltip-time">${format.format(context.time)}</div>
          ${context.rows.map((entry, index) => {
            const segment = entry.segment
            const row = this.#model.rows[index]
            const placed = segment ? row.segments[segmentAt(row, context.time)] : undefined
            const exception = !placed?.state?.baseline
            const left = segment ? segment.end - context.time : 0
            return html`<div class=${classMap({ 'tooltip-row': true, 'is-exception': exception, 'is-focus': moment.focus?.row === index })}>
              <span class=${classMap({ swatch: true, [this.#tone(placed?.state)]: true })}></span>
              <span class="tooltip-name">${entry.series.label} · ${segment ? segment.label : NO_DATA}</span>
              <span class="tooltip-left">${segment && left > 0 && exception ? `${formatDuration(left, step)} left` : ''}</span>
            </div>`
          })}
          ${
            context.focus
              ? html`<div class="tooltip-focus">
                  ${context.focus.series.label} · ${context.focus.label}: ${format.format(context.focus.start)} – ${format.format(context.focus.end)},
                  ${formatDuration(context.focus.duration)}
                </div>`
              : nothing
          }`
    if (content === null || content === undefined || content === nothing) return nothing
    // A top-layer popover, so no ancestor's overflow clips it; `#placeTooltip` positions it.
    return html`<div class="tooltip" part="tooltip" popover="manual" aria-hidden="true">${content}</div>`
  }

  #renderLegend() {
    // Only the states that are on screen, in the order of `states` and then of appearance, each with its total time.
    const totals = stateTotals(this.#model)
    const states = this.#model.states.filter((entry) => totals.has(entry.key))
    if (this.hideLegend || (!states.length && !totals.has(null))) return nothing
    // The legend repeats what each segment's accessible name already says, so assistive technology skips it.
    return html`<ul class="legend" part="legend" aria-hidden="true">
      ${states.map(
        (entry) =>
          html`<li>
            <span class=${classMap({ swatch: true, [`tone-${entry.tone}`]: true })}></span>${entry.label}
            ${entry.baseline ? nothing : html`<b>${formatDuration(totals.get(entry.key)!)}</b>`}
          </li>`,
      )}
      ${totals.has(null) ? html`<li><span class="swatch is-empty"></span>${NO_DATA} <b>${formatDuration(totals.get(null)!)}</b></li>` : nothing}
    </ul>`
  }

  #renderMarkers() {
    const markers = placeMarkers(this.markers, this.#model.start, this.#model.end)
    if (!markers.length) return nothing
    // Labels are measured by estimate (about 6.5px a character at the 12px default), which is enough to keep
    // neighbours on separate levels without a layout pass.
    const levels = stackLabels(markers.map((marker) => ({ x: (this.#percent(marker.time) / 100) * this.trackWidth, width: marker.label.length * 6.5 + 4 })))
    const depth = Math.max(...levels) + 1
    return html`<div class="lanes markers" part="markers" aria-hidden="true" style=${styleMap({ '--_levels': String(depth) })}>
      <div></div>
      <div class="lane">
        ${markers.map((marker, index) => {
          const left = this.#percent(marker.time)
          return html`<span
            class=${classMap({ marker: true, 'at-start': left < 8, 'at-end': left > 92 })}
            part="marker"
            style=${styleMap({ left: `${left}%`, '--_level': String(levels[index]) })}
            >${marker.label}</span
          >`
        })}
      </div>
      <div></div>
    </div>`
  }

  #renderAxis(moment: Moment | null) {
    if (this.hideAxis) return nothing
    const ticks = axisTicks(this.#model.start, this.#model.end, this.trackWidth, this.#locale)
    const pill = moment ? momentFormatter(this.#model.start, this.#model.end, this.#locale).format(moment.time) : ''
    return html`<div class="lanes axis" part="axis" aria-hidden="true">
      <div></div>
      <div class="lane axis-track">
        ${ticks.map((tick) => {
          const left = this.#percent(tick.time)
          return html`<span class=${classMap({ tick: true, 'at-start': left < 6, 'at-end': left > 94 })} part="tick" style=${styleMap({ left: `${left}%` })}
            >${tick.label}</span
          >`
        })}
        ${moment ? html`<span class="crosshair-time" style=${styleMap({ left: `${this.#percent(moment.time)}%` })}>${pill}</span>` : nothing}
      </div>
      <div></div>
    </div>`
  }

  override render() {
    const rows = this.#model.rows
    if (!rows.length) {
      return html`<div class="frame" part="base">
        <div class="empty" part="empty"><slot name="empty">${NO_DATA}</slot></div>
      </div>`
    }
    const format = rangeFormatter(this.#model.start, this.#model.end, this.#locale)
    const summary = !this.hideSummary && !!this.#baseline
    const moment = this.#moment
    const header = this.#slots.has('heading') || !this.hideLegend
    return html`<div class=${classMap({ frame: true, 'has-summary': summary })} part="base">
      <div class="header" part="header" ?hidden=${!header}>
        <div class="heading"><slot name="heading" @slotchange=${this.#slots.handleSlotChange}></slot></div>
        ${this.#renderLegend()}
      </div>
      <div class="plot">
        ${this.#renderMarkers()}
        <div
          class="rows"
          @click=${this.#onClick}
          @keydown=${this.#onKeyDown}
          @focusin=${this.#onFocusIn}
          @focusout=${this.#onFocusOut}
          @pointermove=${this.#onPointerMove}
          @pointerleave=${this.#onPointerLeave}
        >
          ${rows.map((row, rowIndex) => this.#renderRow(row, rowIndex, format, summary))}
        </div>
        ${this.#renderAxis(moment)}
        ${
          moment
            ? html`<div class="lanes overlay" aria-hidden="true">
                <div></div>
                <div class="lane"><span class="crosshair" part="crosshair" style=${styleMap({ left: `${this.#percent(moment.time)}%` })}></span></div>
                <div></div>
              </div>`
            : nothing
        }
      </div>
      ${moment ? this.#renderTooltip(moment, format) : nothing}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-state-timeline': StateTimeline
  }
}
