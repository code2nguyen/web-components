import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { columnValue } from './chart-data.js'
import type { ChartEventMap, ChartLegendItem } from './chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame } from './chart-types.js'
import { layoutPyramid, type PyramidLevel, type PyramidSizing, type PyramidSort } from './pyramid-layout.js'
import './chart-series.js'

export interface PyramidChart {
  addEventListener: TypedAddEventListener<PyramidChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<PyramidChart, ChartEventMap>
}

/** Space between the plot box and the pyramid, in pixels. */
const INSET = 8

/** Length of the line joining an outside label to its level. */
const LABEL_LINE = 14

/** One level as ECharts receives it: the synthetic geometry plus what the labels read back. */
interface PyramidDatum {
  name: string
  value: number
  real: number
  share: number
  itemStyle: { color: string; height?: string; width?: string }
}

/**
 * A pyramid chart drawn by ECharts' funnel series. `label-field` names each level and the single series
 * supplies its value, so one row is one level, stacked from a narrow apex to a wide base.
 *
 * `sizing` decides what a level's size means. The default, `area`, keeps the outline a triangle and gives
 * each level a share of its area equal to its share of the total, which is the reading a pyramid invites.
 *
 * ```html
 * <c2-pyramid-chart label-field="plan"
 *   data='[{ "plan": "Enterprise", "accounts": 42 }, { "plan": "Team", "accounts": 1260 }]'>
 *   <c2-chart-series field="accounts" label="Accounts"></c2-chart-series>
 * </c2-pyramid-chart>
 * ```
 *
 * @tag c2-pyramid-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {border} [--c2-chart__slice--border=2px solid #ffffff] - Border drawn between adjacent levels.
 * @cssproperty {pixel} [--c2-chart__level--gap=0px] - Space between adjacent levels.
 * @cssproperty {length} [--c2-chart__level--min-width=0%] - Width of the apex, as a length or a percentage of the plot box. Above 0 the pyramid has a flat top.
 * @cssproperty {length} [--c2-chart__level--max-width=100%] - Width of the base, as a length or a percentage of the plot box.
 * @cssproperty {string} [--c2-chart__level--align=center] - Where the pyramid sits across its axis: `start`, `center` or `end`. A `start` pyramid is a right triangle.
 */
@customElement('c2-pyramid-chart')
export class PyramidChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['funnel']

  /**
   * What a level's size encodes. `area` and `height` keep a triangular outline and size each level's area or
   * height by its value; `equal` gives every level the same height, so only the order is encoded; `width`
   * sizes each level's base by its value, which is ECharts' own funnel, and always orders the levels by value.
   */
  @property({ type: String }) sizing: PyramidSizing = 'area'

  /** Order of the levels from the apex: `ascending` puts the smallest value at the apex, `none` keeps the data order. */
  @property({ type: String }) sort: PyramidSort = 'ascending'

  /** Where the point of the pyramid is. `bottom` draws it upside down; `start` and `end` lay it on its side. */
  @property({ type: String }) apex: 'top' | 'bottom' | 'start' | 'end' = 'top'

  /** Where the level labels are drawn, or `none` to leave them off. */
  @property({ type: String }) labels: 'none' | 'inside' | 'outside' = 'outside'

  /** Content shown by visible level labels. */
  @property({ type: String, attribute: 'label-content' }) labelContent: 'name' | 'value' | 'percent' | 'name-value' | 'name-percent' = 'name-value'

  constructor() {
    super()
    // Like a pie, a pyramid has no axis to follow: the tooltip is per level and a legend is usually wanted.
    this.tooltip = 'item'
    this.legend = 'end'
  }

  /** Levels the reader has switched off from the legend, by label. */
  @state() private hiddenLevels = new Set<string>()

  /**
   * Bumped when the plot's height changes while levels are spaced apart. Level heights are shares of the plot
   * and the gap is in pixels, so a resize has to rebuild them or the levels overflow or fall short.
   */
  @state() private layoutRevision = 0

  /** Data row of each level ECharts draws, by the index ECharts reports it under. */
  #drawnRows: number[] = []

  #resizeObserver?: ResizeObserver
  #observedHeight = 0

  protected override get legendDependsOnData(): boolean {
    return true
  }

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot || typeof ResizeObserver === 'undefined') return
    this.#resizeObserver = new ResizeObserver((entries) => {
      const height = Math.round(entries[entries.length - 1]?.contentRect.height ?? 0)
      if (height === this.#observedHeight) return
      this.#observedHeight = height
      if (this.#readLayout().gap > 0) this.layoutRevision += 1
    })
    this.#resizeObserver.observe(plot)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = undefined
    this.#observedHeight = 0
  }

  /** A pyramid has no grid and no axes. */
  protected override coordinateSystem(): Record<string, unknown> {
    return {}
  }

  /** One legend entry per level, as a pie lists its slices. */
  protected override legendItems(): ChartLegendItem[] {
    const labels = this.frame?.labels
    if (!labels || labels.length === 0) return super.legendItems()
    const series = this.resolvedSeries[0] ?? { field: '' }
    const theme = this.themeController.theme
    return labels.map((label, index) => ({
      label,
      color: theme.palette[index % theme.palette.length],
      visible: !this.hiddenLevels.has(label),
      toggle: () => this.setLevelVisible(label, this.hiddenLevels.has(label)),
      series,
      index,
    }))
  }

  /** Shows or hides one level, as the legend does. The remaining levels are laid out again to fill the shape. */
  setLevelVisible(label: string, visible: boolean): void {
    const next = new Set(this.hiddenLevels)
    if (visible) next.delete(label)
    else next.add(label)
    this.hiddenLevels = next
    this.notifyLegendChange()
  }

  /**
   * ECharts reports a level by its position in the data it was handed, which leaves out hidden and empty
   * levels. The events are translated back to data rows here, so the tooltip and the point events read the
   * right row.
   */
  protected override async createAdapter(): Promise<ChartAdapter> {
    const adapter = await super.createAdapter()
    const create = adapter.create.bind(adapter)
    const row = (index: number) => this.#drawnRows[index] ?? index
    adapter.create = (container, options, data, events) =>
      create(container, options, data, {
        ...events,
        hover: (detail) => events.hover(detail && { ...detail, index: row(detail.index) }),
        click: (detail) => events.click({ ...detail, index: row(detail.index) }),
      })
    return adapter
  }

  /** The drawn levels, apex first. */
  #levels(frame: ChartFrame, context: ChartBuildContext): PyramidLevel[] {
    const column = frame.columns[0]
    if (!column) return []
    const values = Array.from({ length: frame.length }, (_, index) => columnValue(column, index))
    const exclude = new Set<number>()
    frame.labels?.forEach((label, index) => {
      if (this.hiddenLevels.has(label)) exclude.add(index)
    })
    const layout = this.#readLayout()
    const box = this.#box(context)
    const cross = this.#horizontal ? box.height : box.width
    const minSize = toPixels(layout.minWidth, cross)
    const maxSize = toPixels(layout.maxWidth, cross)
    return layoutPyramid(values, { sizing: this.sizing, sort: this.sort, apexRatio: maxSize > 0 ? minSize / maxSize : 0, exclude })
  }

  protected override projectData(frame: ChartFrame, context: ChartBuildContext): unknown {
    const levels = this.#levels(frame, context)
    this.#drawnRows = levels.map((level) => level.index)
    const { palette } = context.theme
    const total = levels.reduce((sum, level) => sum + level.value, 0)
    const { gap } = this.#readLayout()
    const box = this.#box(context)
    const length = this.#horizontal ? box.width : box.height
    // Level heights are shares of the whole length, which also holds the gaps between them.
    const available = length > 0 ? Math.max(0, 1 - (gap * Math.max(0, levels.length - 1)) / length) : 1
    const data: PyramidDatum[] = levels.map((level) => {
      const itemStyle: PyramidDatum['itemStyle'] = { color: palette[level.index % palette.length] }
      if (level.height !== undefined) itemStyle[this.#horizontal ? 'width' : 'height'] = `${level.height * available * 100}%`
      return {
        name: frame.labels?.[level.index] ?? String(level.index),
        value: level.depth,
        real: level.value,
        share: total > 0 ? level.value / total : 0,
        itemStyle,
      }
    })
    return [data]
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const layout = this.#readLayout()
    const box = this.#box(context)
    const horizontal = this.#horizontal
    const align = this.#align(layout.align)
    const outsideSide = horizontal ? (align === 'bottom' ? 'top' : 'bottom') : align === 'right' ? 'left' : 'right'
    const showLabels = this.labels !== 'none'
    const label = {
      show: showLabels,
      position: this.labels === 'inside' ? 'inside' : outsideSide,
      color: this.labels === 'inside' ? theme.surface : theme.color,
      fontSize: theme.fontSize,
      formatter: (params: { data?: PyramidDatum }) => this.#labelText(params.data),
    }
    return {
      type: 'funnel',
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      orient: horizontal ? 'horizontal' : 'vertical',
      sort: this.#engineSort(),
      funnelAlign: align,
      gap: layout.gap,
      // The data carries synthetic depths from 0 to 1; pinning the extent keeps ECharts from re-ranging them.
      min: 0,
      max: 1,
      minSize: layout.minWidth,
      maxSize: layout.maxWidth,
      label,
      labelLine: { show: this.labels === 'outside', length: LABEL_LINE, lineStyle: { color: theme.gridColor, width: 1 } },
      // Thin levels near the apex would otherwise stack their outside labels on top of each other.
      labelLayout: { moveOverlap: horizontal ? 'shiftX' : 'shiftY' },
      itemStyle: levelBorder(this, theme.surface),
      emphasis: { label: { show: showLabels } },
    }
  }

  get #horizontal(): boolean {
    return this.apex === 'start' || this.apex === 'end'
  }

  get #rtl(): boolean {
    return typeof getComputedStyle === 'function' && getComputedStyle(this).direction === 'rtl'
  }

  /**
   * ECharts lays an `ascending` funnel out from its wide end, which puts the point at the top (or on the left).
   * The levels are ordered by their synthetic depth, which already follows the order `sort` asked for.
   */
  #engineSort(): 'ascending' | 'descending' {
    if (this.apex === 'top') return 'ascending'
    if (this.apex === 'bottom') return 'descending'
    const pointLeft = (this.apex === 'start') !== this.#rtl
    return pointLeft ? 'ascending' : 'descending'
  }

  #align(value: string): 'left' | 'center' | 'right' | 'top' | 'bottom' {
    if (value !== 'start' && value !== 'end') return 'center'
    if (this.#horizontal) return value === 'start' ? 'top' : 'bottom'
    return (value === 'start') !== this.#rtl ? 'left' : 'right'
  }

  /** The funnel's box inside the plot, leaving room on one side for outside labels. */
  #box(context: ChartBuildContext): { left: number; right: number; top: number; bottom: number; width: number; height: number } {
    const box = { left: INSET, right: INSET, top: INSET, bottom: INSET }
    if (this.labels === 'outside') {
      const horizontal = this.#horizontal
      const align = this.#align(this.#readLayout().align)
      if (horizontal) {
        const room = Math.ceil(context.theme.fontSize * 1.4) + LABEL_LINE + 6
        if (align === 'bottom') box.top += room
        else box.bottom += room
      } else {
        const room = Math.min(context.width * 0.5, this.#longestLabel(context) + LABEL_LINE + 10)
        if (align === 'right') box.left += room
        else box.right += room
      }
    }
    return {
      ...box,
      width: Math.max(0, context.width - box.left - box.right),
      height: Math.max(0, context.height - box.top - box.bottom),
    }
  }

  /** A width estimate for the longest label, enough to reserve room without measuring text. */
  #longestLabel(context: ChartBuildContext): number {
    const frame = this.frame
    const column = frame?.columns[0]
    if (!frame || !column) return 0
    let longest = 0
    for (let index = 0; index < frame.length; index += 1) {
      const value = columnValue(column, index) ?? 0
      const text = this.#labelText({ name: frame.labels?.[index] ?? '', real: value, share: 0.999, value: 0, itemStyle: { color: '' } })
      longest = Math.max(longest, text.length)
    }
    return longest * context.theme.fontSize * 0.58
  }

  #labelText(datum: PyramidDatum | undefined): string {
    if (!datum) return ''
    const series = this.resolvedSeries[0]
    const value = series?.format?.(datum.real) ?? this.formatValue(datum.real)
    const percent = `${new Intl.NumberFormat(this.locale, { maximumFractionDigits: 1 }).format(datum.share * 100)}%`
    switch (this.labelContent) {
      case 'name':
        return datum.name
      case 'value':
        return value
      case 'percent':
        return percent
      case 'name-percent':
        return `${datum.name} · ${percent}`
      default:
        return `${datum.name} · ${value}`
    }
  }

  /** The `--c2-chart__level--*` variables, read off the host as the engine needs them. */
  #readLayout(): { gap: number; minWidth: string; maxWidth: string; align: string } {
    if (typeof getComputedStyle !== 'function') return { gap: 0, minWidth: '0%', maxWidth: '100%', align: 'center' }
    const style = getComputedStyle(this)
    const read = (name: string) => style.getPropertyValue(name).trim()
    const gap = parseFloat(read('--c2-chart__level--gap'))
    return {
      gap: Number.isFinite(gap) && gap > 0 ? gap : 0,
      minWidth: toEngineSize(read('--c2-chart__level--min-width'), '0%'),
      maxWidth: toEngineSize(read('--c2-chart__level--max-width'), '100%'),
      align: read('--c2-chart__level--align') || 'center',
    }
  }
}

/** A CSS length as ECharts takes it: a percentage stays a string, anything else becomes pixels. */
function toEngineSize(value: string, fallback: string): string {
  if (!value) return fallback
  if (value.endsWith('%')) return Number.isFinite(parseFloat(value)) ? value : fallback
  const pixels = parseFloat(value)
  return Number.isFinite(pixels) ? String(pixels) : fallback
}

/** Resolves an engine size against the extent a percentage refers to. */
function toPixels(value: string, extent: number): number {
  const number = parseFloat(value)
  if (!Number.isFinite(number)) return 0
  return value.endsWith('%') ? (number / 100) * extent : number
}

/** Reads `--c2-chart__slice--border` off the host as ECharts' `{ borderColor, borderWidth }`. */
function levelBorder(host: HTMLElement, fallbackColor: string): { borderColor: string; borderWidth: number } {
  const value = getComputedStyle(host).getPropertyValue('--c2-chart__slice--border').trim()
  if (value === 'none') return { borderColor: 'transparent', borderWidth: 0 }
  if (!value) return { borderColor: fallbackColor, borderWidth: 2 }
  const width = parseFloat(value)
  const color = value.replace(/^\s*[\d.]+[a-z%]*\s*/i, '').replace(/^(solid|dashed|dotted|double|groove|ridge|inset|outset)\s*/i, '')
  return { borderColor: color || fallbackColor, borderWidth: Number.isFinite(width) ? width : 2 }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-pyramid-chart': PyramidChart
  }
}
