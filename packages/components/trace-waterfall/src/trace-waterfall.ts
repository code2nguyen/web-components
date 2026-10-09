import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import {
  buildModel,
  flatten,
  formatDuration,
  search,
  ticks,
  type TraceModel,
  type TraceNode,
  type TraceRow,
  type TraceSpan,
  type TraceTimeUnit,
} from './trace-model.js'
import styles from './trace-waterfall.scss?inline'

export type { TraceSpan, TraceSpanStatus, TraceTimeUnit } from './trace-model.js'

/** Number of series colours; services beyond it reuse them in order. */
const SERIES = 8
/**
 * A bar ending past this share of the axis has no room for its duration label after it: the label goes before the bar,
 * or inside it when the bar also starts near the beginning.
 */
const LABEL_FLIP = 0.75

export interface TraceWaterfallSelectionChangeEventDetail {
  /** `id` of the selected span. */
  id: string
  /** The span as it was given. */
  span: TraceSpan
}

export interface TraceWaterfallExpansionChangeEventDetail {
  /** `id` of the span whose children were shown or hidden. */
  id: string
  expanded: boolean
}

/** Events fired by {@link TraceWaterfall}, keyed for `addEventListener`. */
export interface TraceWaterfallEventMap {
  'selection-change': CustomEvent<TraceWaterfallSelectionChangeEventDetail>
  'expansion-change': CustomEvent<TraceWaterfallExpansionChangeEventDetail>
}

export interface TraceWaterfall {
  addEventListener: TypedAddEventListener<TraceWaterfall, TraceWaterfallEventMap>
  removeEventListener: TypedRemoveEventListener<TraceWaterfall, TraceWaterfallEventMap>
}

/**
 * The spans of one distributed trace as a tree, each with a bar placed on a shared time axis, the way Sentry, Datadog
 * APM and Grafana Tempo draw a trace.
 *
 * Hand it the spans through `spans`, as a property or as a JSON string in the attribute. Each span has an `id`, a
 * `name`, a `start` and either a `duration` or an `end`; `parentId` hangs it below another span, `service` colours its
 * bar (one series colour per service, in order of appearance) and `status: "error"` marks it in the error colour:
 *
 * ```html
 * <c2-trace-waterfall
 *   spans='[{"id":"a","name":"GET /orders","service":"web","start":0,"duration":120},
 *           {"id":"b","parentId":"a","name":"SELECT orders","service":"db","start":20,"duration":64}]'
 * ></c2-trace-waterfall>
 * ```
 *
 * Times can be absolute (epoch) or relative: the axis starts at the earliest span. `time-unit` says what the numbers
 * are in (`ms` by default; `ns` for OpenTelemetry's `startTimeUnixNano`, which may be passed as a numeric string).
 * Children are ordered by start time. A span whose parent is not in the trace is drawn as a root, so a partial trace
 * still renders.
 *
 * Every span starts open; `collapseAll()` and `expandAll()` reset them all. Clicking a row selects it and fires
 * `selection-change`, which is how an app opens a span's details next to the waterfall; `selected` sets the selection
 * from outside. `search` highlights the spans whose name or service contains the text, dims the others and opens the
 * spans above each match. The waterfall has no search box of its own, so pair it with `c2-search-field`.
 *
 * ### Keyboard
 *
 * Arrow Up and Down walk the spans, Home and End jump to the ends. Arrow Right opens a span, then moves to its first
 * child; Arrow Left closes it, then moves to its parent. Enter and Space select the focused span, and `*` opens every
 * sibling.
 *
 * @tag c2-trace-waterfall
 *
 * @slot empty - Shown instead of the waterfall while there are no spans.
 *
 * @csspart header - The row holding the column title and the time axis.
 * @csspart row - One span.
 * @csspart name - The name cell of a span: indentation, toggle, name and service.
 * @csspart bar - The duration bar of a span.
 * @csspart duration - The duration label next to a bar.
 *
 * @event {CustomEvent<TraceWaterfallSelectionChangeEventDetail>} selection-change - Fired when the user selects a span by click, Enter or Space. Does not bubble.
 * @event {CustomEvent<TraceWaterfallExpansionChangeEventDetail>} expansion-change - Fired after the user opens or closes a span. Does not bubble.
 *
 * @cssproperty {color} [--c2-trace-waterfall--background=#ffffff] - Background of the waterfall.
 * @cssproperty {color} [--c2-trace-waterfall--color=#18181b] - Text colour.
 * @cssproperty {font-family} [--c2-trace-waterfall--font-family=inherit] - Font of every row.
 * @cssproperty {font-size} [--c2-trace-waterfall--font-size=12px] - Font size of every row.
 * @cssproperty {border} [--c2-trace-waterfall--border=1px solid #e4e4e7] - Border around the waterfall.
 * @cssproperty {border-radius} [--c2-trace-waterfall--border-radius=8px] - Corner radius of the waterfall.
 * @cssproperty {length} [--c2-trace-waterfall--max-height=none] - Height at which the rows start scrolling under a sticky header.
 * @cssproperty {color} [--c2-trace-waterfall__header--background=#fafafa] - Background of the header row.
 * @cssproperty {color} [--c2-trace-waterfall__header--color=#71717a] - Text colour of the header row and the axis labels.
 * @cssproperty {length} [--c2-trace-waterfall__header--height=32px] - Height of the header row.
 * @cssproperty {length} [--c2-trace-waterfall__name--width=280px] - Width of the name column. It never takes more than 40% of the waterfall.
 * @cssproperty {border} [--c2-trace-waterfall__name--border-right=1px solid #e4e4e7] - Line between the name column and the timeline.
 * @cssproperty {length} [--c2-trace-waterfall__name--indent=16px] - Indentation per level of depth.
 * @cssproperty {color} [--c2-trace-waterfall__service--color=#71717a] - Colour of the service name after a span's name.
 * @cssproperty {color} [--c2-trace-waterfall__twisty--color=#71717a] - Colour of the open and close arrow.
 * @cssproperty {length} [--c2-trace-waterfall__row--height=28px] - Height of every row.
 * @cssproperty {border} [--c2-trace-waterfall__row--border-bottom=1px solid #f4f4f5] - Line under every row.
 * @cssproperty {color} [--c2-trace-waterfall__row__hover--background=#f4f4f5] - Background of the hovered row.
 * @cssproperty {color} [--c2-trace-waterfall__row__selected--background=#edf1fe] - Background of the selected row.
 * @cssproperty {outline} [--c2-trace-waterfall__row__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Ring around the keyboard-focused row.
 * @cssproperty {number} [--c2-trace-waterfall__row__dimmed--opacity=0.45] - Opacity of the rows that do not match `search`.
 * @cssproperty {color} [--c2-trace-waterfall__grid-line--color=#f4f4f5] - Colour of the vertical lines at each axis label.
 * @cssproperty {length} [--c2-trace-waterfall__timeline--padding-inline=12px] - Space between the timeline's edges and the start and end of the axis.
 * @cssproperty {length} [--c2-trace-waterfall__bar--height=12px] - Height of a duration bar.
 * @cssproperty {length} [--c2-trace-waterfall__bar--min-width=2px] - Narrowest a bar is drawn, so an instant span stays visible.
 * @cssproperty {border-radius} [--c2-trace-waterfall__bar--border-radius=4px] - Corner radius of a bar.
 * @cssproperty {color} [--c2-trace-waterfall__bar__error--background=#dc2626] - Colour of the bar of a span with `status: "error"`.
 * @cssproperty {color} [--c2-trace-waterfall__error--color=#dc2626] - Colour of the error marker before a failed span's name.
 * @cssproperty {color} [--c2-trace-waterfall__duration--color=#71717a] - Colour of the duration label.
 * @cssproperty {color} [--c2-trace-waterfall__match--background=rgba(250, 204, 21, 0.4)] - Highlight behind the part of a name matching `search`.
 * @cssproperty {color} [--c2-trace-waterfall__series-1--color=#0265dc] - Bar colour of the first service, and of spans without one.
 * @cssproperty {color} [--c2-trace-waterfall__series-2--color=#ea580c] - Bar colour of the second service.
 * @cssproperty {color} [--c2-trace-waterfall__series-3--color=#0f766e] - Bar colour of the third service.
 * @cssproperty {color} [--c2-trace-waterfall__series-4--color=#db2777] - Bar colour of the fourth service.
 * @cssproperty {color} [--c2-trace-waterfall__series-5--color=#a16207] - Bar colour of the fifth service.
 * @cssproperty {color} [--c2-trace-waterfall__series-6--color=#7c3aed] - Bar colour of the sixth service.
 * @cssproperty {color} [--c2-trace-waterfall__series-7--color=#0891b2] - Bar colour of the seventh service.
 * @cssproperty {color} [--c2-trace-waterfall__series-8--color=#52525b] - Bar colour of the eighth service; later services start over at the first.
 * @cssproperty {color} [--c2-trace-waterfall__empty--color=#71717a] - Colour of the empty message.
 * @cssproperty {padding} [--c2-trace-waterfall__empty--padding=32px 16px] - Space around the empty message.
 */
@customElement('c2-trace-waterfall')
export class TraceWaterfall extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The spans of the trace. As an attribute it is parsed as JSON. */
  @property({ converter: jsonPropertyConverter }) spans: TraceSpan[] | undefined

  /** Unit of every `start`, `end` and `duration`: `s`, `ms`, `us` or `ns`. */
  @property({ type: String, attribute: 'time-unit' }) timeUnit: TraceTimeUnit = 'ms'

  /** `id` of the selected span. */
  @property({ type: String }) selected = ''

  /** Highlights the spans whose name or service contains this text, dims the rest and opens the spans above each match. */
  @property({ type: String }) search = ''

  /** Accessible name of the span tree. */
  @property({ type: String }) label = 'Trace'

  /** Spans opened or closed by the user. */
  @state() private overrides = new Map<string, boolean>()
  /** Spans toggled while a search is active; dropped with the search so the earlier state comes back. */
  @state() private searchOverrides = new Map<string, boolean>()
  /** Spans below this level start closed. */
  @state() private openDepth = Number.POSITIVE_INFINITY
  @state() private focusedKey: string | undefined

  private model: TraceModel = buildModel(undefined)
  private rows: TraceRow[] = []
  private searchMatches = new Set<string>()
  private searchAncestors = new Set<string>()

  private get searching(): boolean {
    return this.search.trim() !== ''
  }

  /** Opens every span. */
  expandAll() {
    this.openDepth = Number.POSITIVE_INFINITY
    this.overrides = new Map()
    this.searchOverrides = new Map()
  }

  /** Closes every span, leaving the roots. */
  collapseAll() {
    this.openDepth = 1
    this.overrides = new Map()
    this.searchOverrides = new Map()
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    if (changed.has('spans') || changed.has('timeUnit')) {
      this.model = buildModel(this.spans, this.timeUnit)
    }
    if (changed.has('spans') || changed.has('timeUnit') || changed.has('search')) {
      ;({ matches: this.searchMatches, ancestors: this.searchAncestors } = search(this.model, this.search))
      this.searchOverrides = new Map()
    }
    this.rows = flatten(this.model.roots, (node, level) => this.isExpanded(node, level))
    if (!this.rows.some((row) => row.node.key === this.focusedKey)) {
      this.focusedKey = (this.rows.find((row) => row.node.span.id === this.selected) ?? this.rows[0])?.node.key
    }
  }

  private isExpanded(node: TraceNode, level: number): boolean {
    if (this.searching) {
      const toggled = this.searchOverrides.get(node.key)
      if (toggled !== undefined) return toggled
      if (this.searchAncestors.has(node.key)) return true
    }
    return this.overrides.get(node.key) ?? level < this.openDepth
  }

  override render() {
    if (!this.model.nodes.size) {
      return html`<div class="empty"><slot name="empty">No spans</slot></div>`
    }
    const total = this.model.total
    return html`
      <div class="waterfall">
        <div class="header" part="header" aria-hidden="true">
          <div class="name-header">${this.model.nodes.size} ${this.model.nodes.size === 1 ? 'span' : 'spans'}</div>
          <div class="axis">
            ${ticks(total).map((at, i, all) => html`<span class="tick ${i === 0 ? 'first' : i === all.length - 1 ? 'last' : ''}" style="--at: ${this.share(at)}">${formatDuration(at)}</span>`)}
          </div>
        </div>
        <div class="rows" role="tree" aria-label=${this.label} @keydown=${this.onKeydown} @click=${this.onClick} @focusin=${this.onFocusin}>
          ${repeat(
            this.rows,
            (row) => row.node.key,
            (row) => this.renderRow(row),
          )}
        </div>
      </div>
    `
  }

  /** Where `ms` falls on the axis, from 0 to 1. */
  private share(ms: number): number {
    return this.model.total > 0 ? ms / this.model.total : 0
  }

  private renderRow(row: TraceRow): TemplateResult {
    const { node } = row
    const span = node.span
    const branch = node.children.length > 0
    const error = span.status === 'error'
    const start = this.share(node.offset)
    const width = this.model.total > 0 ? this.share(node.duration) : 1
    const placement = start + width <= LABEL_FLIP ? '' : start > 0.2 ? 'before' : 'inside'
    const series = (Math.max(0, node.serviceIndex) % SERIES) + 1
    const duration = formatDuration(node.duration)
    const matched = this.searchMatches.has(node.key)
    const dimmed = this.searching && !matched
    const classes = [
      'row',
      `series-${series}`,
      span.id === this.selected ? 'selected' : '',
      matched ? 'matched' : '',
      dimmed ? 'dimmed' : '',
      error ? 'error' : '',
    ].join(' ')
    return html`<div
      class=${classes}
      part="row"
      role="treeitem"
      data-key=${node.key}
      aria-level=${row.level}
      aria-posinset=${row.posinset}
      aria-setsize=${row.setsize}
      aria-expanded=${branch ? String(row.expanded) : nothing}
      aria-selected=${span.id === this.selected ? 'true' : 'false'}
      tabindex=${node.key === this.focusedKey ? 0 : -1}
      style="--level: ${row.level}"
    >
      <div class="name" part="name">
        <span class="twisty ${branch ? 'branch' : ''}" data-toggle aria-hidden="true">
          ${
            branch
              ? html`<svg viewBox="0 0 16 16" width="12" height="12">
                  <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
                </svg>`
              : nothing
          }
        </span>
        ${error ? html`<span class="error-mark" role="img" aria-label="Error"></span>` : nothing}
        <span class="label" title=${span.name}>${this.highlight(String(span.name ?? ''))}</span>
        ${span.service ? html`<span class="service">${this.highlight(span.service)}</span>` : nothing}
      </div>
      <div class="timeline">
        <div class="track">
          <span class="bar" part="bar" style="--start: ${start}; --width: ${width}"></span>
          <span class="duration ${placement}" part="duration" style="--start: ${start}; --width: ${width}"
            >${duration}<span class="offset"> at ${formatDuration(node.offset)}</span></span
          >
        </div>
      </div>
    </div>`
  }

  /** Wraps each case-insensitive occurrence of the search text in a `<mark>`. */
  private highlight(text: string): TemplateResult | string {
    const query = this.search.trim().toLowerCase()
    if (!query) return text
    const lower = text.toLowerCase()
    const parts: (TemplateResult | string)[] = []
    let from = 0
    for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
      parts.push(text.slice(from, at), html`<mark>${text.slice(at, at + query.length)}</mark>`)
      from = at + query.length
    }
    if (from === 0) return text
    parts.push(text.slice(from))
    return html`${parts}`
  }

  private rowOf(event: Event): TraceRow | undefined {
    const element = event.composedPath().find((node): node is HTMLElement => node instanceof HTMLElement && node.dataset.key !== undefined)
    return element ? this.rows.find((row) => row.node.key === element.dataset.key) : undefined
  }

  private onFocusin = (event: FocusEvent) => {
    const row = this.rowOf(event)
    if (row) this.focusedKey = row.node.key
  }

  private onClick = (event: MouseEvent) => {
    const row = this.rowOf(event)
    if (!row) return
    this.focusedKey = row.node.key
    const toggle = event.composedPath().some((node) => node instanceof HTMLElement && node.dataset.toggle !== undefined)
    if (toggle && row.node.children.length) this.toggle(row, !row.expanded)
    else this.select(row)
  }

  private onKeydown = (event: KeyboardEvent) => {
    const index = this.rows.findIndex((row) => row.node.key === this.focusedKey)
    const row = this.rows[index]
    if (!row) return
    const branch = row.node.children.length > 0
    let target: TraceRow | undefined
    switch (event.key) {
      case 'ArrowDown':
        target = this.rows[index + 1]
        break
      case 'ArrowUp':
        target = this.rows[index - 1]
        break
      case 'Home':
        target = this.rows[0]
        break
      case 'End':
        target = this.rows[this.rows.length - 1]
        break
      case 'ArrowRight':
        if (branch && !row.expanded) this.toggle(row, true)
        else if (branch) target = this.rows[index + 1]
        break
      case 'ArrowLeft':
        if (branch && row.expanded) this.toggle(row, false)
        else target = row.parent
        break
      case 'Enter':
      case ' ':
        this.select(row)
        break
      case '*':
        for (const sibling of this.rows) {
          if (sibling.parent === row.parent && sibling.node.children.length && !sibling.expanded) this.toggle(sibling, true)
        }
        break
      default:
        return
    }
    event.preventDefault()
    if (target) void this.focusRow(target)
  }

  private select(row: TraceRow) {
    const span = row.node.span
    if (span.id === this.selected) return
    this.selected = span.id
    this.dispatchEvent(new CustomEvent<TraceWaterfallSelectionChangeEventDetail>('selection-change', { detail: { id: span.id, span } }))
  }

  private toggle(row: TraceRow, expanded: boolean) {
    if (this.searching) this.searchOverrides = new Map(this.searchOverrides).set(row.node.key, expanded)
    else this.overrides = new Map(this.overrides).set(row.node.key, expanded)
    this.dispatchEvent(new CustomEvent<TraceWaterfallExpansionChangeEventDetail>('expansion-change', { detail: { id: row.node.span.id, expanded } }))
  }

  private async focusRow(row: TraceRow) {
    this.focusedKey = row.node.key
    await this.updateComplete
    const element = this.renderRoot.querySelector<HTMLElement>(`[data-key="${CSS.escape(row.node.key)}"]`)
    element?.focus({ preventScroll: true })
    element?.scrollIntoView({ block: 'nearest' })
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-trace-waterfall': TraceWaterfall
  }
}
