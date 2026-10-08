import { LitElement, html, isServer, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './state-timeline.scss?inline'
import {
  axisTicks,
  buildModel,
  formatDuration,
  rangeFormatter,
  segmentNear,
  type PlacedSegment,
  type TimelineModel,
  type TimelineRow,
} from './state-timeline-model.js'
import type {
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
/** Gap between the tooltip and its segment, and between the tooltip and the viewport edges. */
const TOOLTIP_GAP = 6
const NO_DATA = 'No data'

/** Position of a segment: its row, and its place among the drawn segments of that row. */
interface Cell {
  row: number
  position: number
}

/**
 * One band per series, coloured by the discrete state it was in over time: service health, deployment status, a
 * host's power state, a CI job's results. Hover or focus a segment for its state, times and duration.
 *
 * `series` holds the bands, each a list of segments with a `start`, an optional `end` and a `state`. Segments
 * without an `end` last until the next one starts, so a list of state changes is enough; the last one runs to the
 * end of the timeline. `states` names the values and picks their colours (`tone`); a value it does not list is shown
 * as written, with the next free palette colour. A `null` state marks a stretch with no data.
 *
 * The visible range is `start`–`end`, or the span of the data when they are not set. Times are milliseconds, ISO
 * strings or `Date`s; the axis and the tooltip show them in the browser's time zone.
 *
 * The timeline is a grid: one Tab stop, ← and → move between the segments of a band, ↑ and ↓ between bands, Home and
 * End jump to a band's ends, and Enter fires `segment-click`. Each segment's accessible name gives its band, state,
 * times and duration. A segment's state is written inside it when there is room.
 *
 * @tag c2-state-timeline
 *
 * @slot empty - Shown when there are no series. Defaults to "No data".
 *
 * @event {CustomEvent<StateTimelineSegmentEventDetail>} segment-click - Fired when a segment is clicked, or Enter or Space is pressed on it. Bubbles.
 * @event {CustomEvent<StateTimelineSegmentHoverEventDetail>} segment-hover - Fired when the pointer moves onto a segment, or off the segments (`segment: null`). Does not bubble.
 *
 * @csspart base - The timeline's frame.
 * @csspart row - One band: its label and its track.
 * @csspart label - A band's label.
 * @csspart track - The strip a band's segments are drawn on.
 * @csspart segment - One segment.
 * @csspart axis - The time axis under the bands.
 * @csspart tick - One label of the time axis.
 * @csspart legend - The list of states under the axis.
 * @csspart tooltip - The tooltip.
 * @csspart empty - Region wrapping the `empty` slot, shown only while there are no series.
 *
 * @cssproperty {color} [--c2-state-timeline--background=#ffffff] - Surface of the timeline; segment tints are mixed against it.
 * @cssproperty {color} [--c2-state-timeline--color=#18181b] - Text colour.
 * @cssproperty {font-family} [--c2-state-timeline--font-family=inherit] - Font of every text.
 * @cssproperty {font-size} [--c2-state-timeline--font-size=12px] - Size of every text.
 * @cssproperty {pixel} [--c2-state-timeline--gap=8px] - Space between the bands, the axis and the legend.
 * @cssproperty {pixel} [--c2-state-timeline__label--width=120px] - Width of the label column; `0px` hides the labels.
 * @cssproperty {color} [--c2-state-timeline__label--color=#18181b] - Colour of the band labels.
 * @cssproperty {font-weight} [--c2-state-timeline__label--font-weight=500] - Weight of the band labels.
 * @cssproperty {pixel} [--c2-state-timeline__row--height=28px] - Height of a band.
 * @cssproperty {pixel} [--c2-state-timeline__row--gap=6px] - Space between two bands.
 * @cssproperty {color} [--c2-state-timeline__track--background=#f4f4f5] - Strip behind a band's segments, visible where it has no data.
 * @cssproperty {border-radius} [--c2-state-timeline__track--border-radius=4px] - Rounding of the strip.
 * @cssproperty {pixel} [--c2-state-timeline__segment--gap=2px] - Space between two segments; `0px` draws a band as one continuous bar.
 * @cssproperty {border-radius} [--c2-state-timeline__segment--border-radius=4px] - Rounding of each segment.
 * @cssproperty {percentage} [--c2-state-timeline__segment--background-mix=32%] - Share of the state colour in a segment's fill; `100%` for solid fills.
 * @cssproperty {color} [--c2-state-timeline__segment--color=#18181b] - Colour of the state written inside a segment.
 * @cssproperty {font-weight} [--c2-state-timeline__segment--font-weight=500] - Weight of the state written inside a segment.
 * @cssproperty {percentage} [--c2-state-timeline__segment__hover--background-mix=52%] - Share of the state colour in the fill of the hovered or focused segment.
 * @cssproperty {outline} [--c2-state-timeline__segment__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the active segment.
 * @cssproperty {border} [--c2-state-timeline__segment__empty--border=1px dashed #bcbcc6] - Outline of a stretch with no data.
 * @cssproperty {color} [--c2-state-timeline__axis--color=#71717a] - Colour of the axis labels.
 * @cssproperty {border} [--c2-state-timeline__axis--border-top=1px solid #e4e4e7] - Line above the axis labels.
 * @cssproperty {color} [--c2-state-timeline__legend--color=#71717a] - Colour of the legend labels.
 * @cssproperty {pixel} [--c2-state-timeline__legend__swatch--size=10px] - Size of a legend swatch.
 * @cssproperty {border-radius} [--c2-state-timeline__legend__swatch--border-radius=999px] - Rounding of a legend swatch.
 * @cssproperty {color} [--c2-state-timeline__tooltip--background=#ffffff] - Fill of the tooltip.
 * @cssproperty {color} [--c2-state-timeline__tooltip--color=#18181b] - Text of the tooltip.
 * @cssproperty {color} [--c2-state-timeline__tooltip--muted-color=#71717a] - Field names of the tooltip.
 * @cssproperty {border} [--c2-state-timeline__tooltip--border=1px solid #d4d4d8] - Outline of the tooltip.
 * @cssproperty {border-radius} [--c2-state-timeline__tooltip--border-radius=8px] - Rounding of the tooltip.
 * @cssproperty {box-shadow} [--c2-state-timeline__tooltip--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Shadow of the tooltip.
 * @cssproperty {pixel} [--c2-state-timeline__tooltip--width=220px] - Width of the tooltip.
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
   * Labels and colours of the state values, in legend order. Values the data uses but this omits are added after them.
   * The legend lists only the states some visible segment is in.
   */
  @property({ converter: jsonPropertyConverter }) states: StateTimelineState[] = []

  /** First visible time: milliseconds or an ISO string. Defaults to the earliest time in the data. */
  @property() start?: StateTimelineTime

  /** Last visible time: milliseconds or an ISO string. Defaults to the latest time in the data; set it when the last states are still running. */
  @property() end?: StateTimelineTime

  /** Leaves the time axis out. */
  @property({ type: Boolean, attribute: 'hide-axis', reflect: true }) hideAxis = false

  /** Leaves the legend of states out. */
  @property({ type: Boolean, attribute: 'hide-legend', reflect: true }) hideLegend = false

  /** Language of the axis and tooltip times. Defaults to the page's `lang`, then the browser's. */
  @property() locale?: string

  /** Accessible name of the timeline. */
  @property({ attribute: 'aria-label' }) override ariaLabel: string | null = null

  /** Replaces the tooltip's contents. Return anything Lit renders, or `null` for no tooltip. Property only. */
  @property({ attribute: false }) renderTooltip?: (context: StateTimelineSegmentContext) => unknown

  @state() private trackWidth = DEFAULT_TRACK_WIDTH
  @state() private active: Cell = { row: 0, position: 0 }
  @state() private hover: Cell | null = null
  /** The tooltip follows the focus only while the keyboard is driving. */
  @state() private keyboardFocus = false
  @state() private focused = false

  #model: TimelineModel = buildModel([], [])
  #warnedInvalid = 0
  #resizeObserver?: ResizeObserver
  #tooltipFrame = 0
  #focusAfterUpdate = false

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
      this.hover = null
    }
    this.internals.ariaLabel = this.ariaLabel ?? 'State timeline'
  }

  protected override updated(): void {
    if (this.#focusAfterUpdate) {
      this.#focusAfterUpdate = false
      this.#cellElement(this.active)?.focus()
    }
    if (this.#tooltipCell) this.#placeTooltip()
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
    const track = this.renderRoot.querySelector<HTMLElement>('.axis-track, .track')
    const width = track?.clientWidth ?? 0
    if (width > 0 && Math.abs(width - this.trackWidth) > 1) this.trackWidth = width
  }

  get #locale(): string | undefined {
    if (this.locale) return this.locale
    if (isServer) return 'en'
    return this.closest('[lang]')?.getAttribute('lang') || undefined
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

  #onClick = (event: MouseEvent) => {
    const cell = this.#cellFrom(event)
    if (!cell) return
    this.active = cell
    this.#activate(cell)
  }

  #onPointerOver = (event: PointerEvent) => {
    const cell = this.#cellFrom(event)
    if (!cell || (this.hover && this.hover.row === cell.row && this.hover.position === cell.position)) return
    this.hover = cell
    this.dispatchEvent(new CustomEvent<StateTimelineSegmentHoverEventDetail>('segment-hover', { detail: { segment: this.#context(cell) } }))
  }

  #onPointerOut = (event: PointerEvent) => {
    if (!this.hover) return
    const into = event.relatedTarget instanceof Node ? event.relatedTarget : null
    const still = into && this.renderRoot.contains(into) && (into as Element).closest?.('.segment')
    if (still) return
    this.hover = null
    this.dispatchEvent(new CustomEvent<StateTimelineSegmentHoverEventDetail>('segment-hover', { detail: { segment: null } }))
  }

  #onPointerDown = () => {
    this.keyboardFocus = false
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
    this.active = next
    this.#focusAfterUpdate = true
  }

  /** The segment whose tooltip is showing: the hovered one, else the focused one while the keyboard drives. */
  get #tooltipCell(): Cell | null {
    if (this.hover && this.#placed(this.hover)) return this.hover
    return this.focused && this.keyboardFocus && this.#placed(this.active) ? this.active : null
  }

  #placeTooltip() {
    const cell = this.#tooltipCell
    const tip = this.renderRoot.querySelector<HTMLElement>('.tooltip')
    const mark = cell ? this.#cellElement(cell) : null
    if (isServer || !tip || !mark || typeof tip.showPopover !== 'function') return
    if (!tip.matches(':popover-open')) {
      try {
        tip.showPopover()
      } catch {
        return
      }
    }
    const box = mark.getBoundingClientRect()
    const { width, height } = tip.getBoundingClientRect()
    const left = Math.max(TOOLTIP_GAP, Math.min(box.left + box.width / 2 - width / 2, innerWidth - width - TOOLTIP_GAP))
    const below = box.bottom + TOOLTIP_GAP
    const top = innerHeight - below >= height + TOOLTIP_GAP || box.top < height + TOOLTIP_GAP ? below : box.top - height - TOOLTIP_GAP
    tip.style.left = `${Math.round(left)}px`
    tip.style.top = `${Math.round(Math.max(TOOLTIP_GAP, Math.min(top, innerHeight - height - TOOLTIP_GAP)))}px`
  }

  #schedulePlaceTooltip = () => {
    if (!this.#tooltipCell) return
    cancelAnimationFrame(this.#tooltipFrame)
    this.#tooltipFrame = requestAnimationFrame(() => this.#placeTooltip())
  }

  #percent(time: number): number {
    const span = this.#model.end - this.#model.start
    return span > 0 ? ((time - this.#model.start) / span) * 100 : 0
  }

  #toneClass(placed: PlacedSegment | { state: PlacedSegment['state'] }): string {
    return placed.state ? `tone-${placed.state.tone}` : 'is-empty'
  }

  #renderSegment(row: TimelineRow, rowIndex: number, placed: PlacedSegment, position: number, format: Intl.DateTimeFormat) {
    const label = placed.state?.label ?? NO_DATA
    const active = rowIndex === this.active.row && position === this.active.position
    const hovered = this.hover?.row === rowIndex && this.hover.position === position
    const name = `${row.label ? `${row.label}: ` : ''}${label}, ${format.format(placed.start)} – ${format.format(placed.end)}, ${formatDuration(placed.end - placed.start)}`
    const left = this.#percent(placed.from)
    return html`<div
      class=${classMap({ segment: true, [this.#toneClass(placed)]: true, active, hovered })}
      part="segment"
      role="gridcell"
      tabindex=${active ? 0 : -1}
      aria-label=${name}
      data-row=${rowIndex}
      data-position=${position}
      style=${styleMap({ left: `${left}%`, width: `${this.#percent(placed.to) - left}%` })}
    >
      <span class="segment-label" aria-hidden="true">${placed.state ? label : nothing}</span>
    </div>`
  }

  #renderTooltip(format: Intl.DateTimeFormat) {
    const cell = this.#tooltipCell
    const context = cell ? this.#context(cell) : null
    if (!cell || !context) return nothing
    const content = this.renderTooltip
      ? this.renderTooltip(context)
      : html`<div class="tooltip-title">${context.series.label}</div>
          <div class="tooltip-state"><span class=${classMap({ swatch: true, [this.#toneClass(this.#placed(cell)!)]: true })}></span>${context.label}</div>
          <dl>
            <dt>From</dt>
            <dd>${format.format(context.start)}</dd>
            <dt>To</dt>
            <dd>${format.format(context.end)}</dd>
            <dt>Duration</dt>
            <dd>${formatDuration(context.duration)}</dd>
          </dl>`
    if (content === null || content === undefined || content === nothing) return nothing
    // A top-layer popover, so no ancestor's overflow clips it; `#placeTooltip` positions it.
    return html`<div class="tooltip" part="tooltip" popover="manual" aria-hidden="true">${content}</div>`
  }

  #renderAxis() {
    if (this.hideAxis) return nothing
    const ticks = axisTicks(this.#model.start, this.#model.end, this.trackWidth, this.#locale)
    return html`<div class="axis" part="axis" aria-hidden="true">
      <div class="axis-spacer"></div>
      <div class="axis-track">
        ${ticks.map((tick) => {
          const left = this.#percent(tick.time)
          return html`<span class=${classMap({ tick: true, 'at-start': left < 6, 'at-end': left > 94 })} part="tick" style=${styleMap({ left: `${left}%` })}
            >${tick.label}</span
          >`
        })}
      </div>
    </div>`
  }

  #renderLegend() {
    // Only the states that are on screen, in the order of `states` and then of appearance.
    const used = new Set(this.#model.rows.flatMap((row) => row.segments.map((segment) => segment.state?.key ?? null)))
    const states = this.#model.states.filter((entry) => used.has(entry.key))
    const hasEmpty = used.has(null)
    if (this.hideLegend || (!states.length && !hasEmpty)) return nothing
    // The legend repeats what each segment's accessible name already says, so assistive technology skips it.
    return html`<ul class="legend" part="legend" aria-hidden="true">
      ${states.map((entry) => html`<li><span class=${classMap({ swatch: true, [`tone-${entry.tone}`]: true })}></span>${entry.label}</li>`)}
      ${hasEmpty ? html`<li><span class="swatch is-empty"></span>${NO_DATA}</li>` : nothing}
    </ul>`
  }

  override render() {
    const rows = this.#model.rows
    if (!rows.length) {
      return html`<div class="frame" part="base">
        <div class="empty" part="empty"><slot name="empty">${NO_DATA}</slot></div>
      </div>`
    }
    const format = rangeFormatter(this.#model.start, this.#model.end, this.#locale)
    return html`<div class="frame" part="base">
      <div
        class="rows"
        @click=${this.#onClick}
        @keydown=${this.#onKeyDown}
        @focusin=${this.#onFocusIn}
        @focusout=${this.#onFocusOut}
        @pointerover=${this.#onPointerOver}
        @pointerout=${this.#onPointerOut}
        @pointerdown=${this.#onPointerDown}
      >
        ${rows.map(
          (row, rowIndex) =>
            html`<div class="row" part="row" role="row">
              <div class="label" part="label" role="rowheader" title=${row.label}>${row.label}</div>
              <div class="track" part="track">${row.segments.map((placed, position) => this.#renderSegment(row, rowIndex, placed, position, format))}</div>
            </div>`,
        )}
      </div>
      ${this.#renderAxis()} ${this.#renderLegend()} ${this.#renderTooltip(format)}
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-state-timeline': StateTimeline
  }
}
