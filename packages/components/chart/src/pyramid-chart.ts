import { state } from 'lit/decorators.js'
import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { EchartsChartBase } from './echarts-chart-base.js'
import { columnValue } from './chart-data.js'
import type { ChartEventMap, ChartLegendItem } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame } from './chart-types.js'
import { layoutPyramid, readableTextOn, spreadLabels, type PyramidLevel, type PyramidSizing, type PyramidSort } from './pyramid-layout.js'
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
  itemStyle: { color: string; height?: string; width?: string; opacity?: number }
  /** An inside label's colour, picked against the level's own fill. */
  label?: { color: string }
}

/** One outside label as the label series draws it, in plot pixels. */
interface OutsideLabel {
  text: string
  /** Where the leader line leaves the level's edge, where it bends, and where it meets the text. */
  points: [number, number][]
  x: number
  y: number
  align: 'left' | 'center' | 'right'
  opacity: number
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
  // `custom` draws the outside labels: ECharts gives a funnel's own labels no way to avoid each other.
  protected override readonly features: readonly EchartsFeature[] = ['funnel', 'custom']

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

  /** The outside labels, drawn by their own series in the order the levels are. */
  #outsideLabels: OutsideLabel[] = []

  #resizeObserver?: ResizeObserver
  #observedSize = ''

  protected override get legendDependsOnData(): boolean {
    return true
  }

  protected override firstUpdated(): void {
    super.firstUpdated()
    const plot = this.plotElement
    if (!plot || typeof ResizeObserver === 'undefined') return
    this.#resizeObserver = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      const size = rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : ''
      if (size === this.#observedSize) return
      const first = this.#observedSize === ''
      this.#observedSize = size
      // Outside labels and gaps are laid out in pixels, so they have to follow the funnel ECharts rescales itself.
      if (!first && (this.labels === 'outside' || this.#readLayout().gap > 0)) this.layoutRevision += 1
    })
    this.#resizeObserver.observe(plot)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = undefined
    this.#observedSize = ''
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
      ...this.legendEntryState(label, !this.hiddenLevels.has(label), (visible) => this.setLevelVisible(label, visible)),
      series,
      index,
    }))
  }

  /**
   * Shows or hides one level, as the legend does with `legend-action="toggle"`. The remaining levels are laid out
   * again to fill the shape.
   */
  setLevelVisible(label: string, visible: boolean): void {
    const next = new Set(this.hiddenLevels)
    if (visible) next.delete(label)
    else next.add(label)
    this.hiddenLevels = next
    this.notifyLegendChange()
  }

  /**
   * ECharts reports a level by its position in the data it was handed, which leaves out hidden and empty levels
   * and follows the layout order. Both engine events are translated back to data rows here, so the tooltip, the
   * point events and a click's highlight all read the right row.
   */
  protected override handleEngineHover(detail: { index: number; seriesIndex: number; px: number; py: number } | null): void {
    super.handleEngineHover(detail && { ...detail, index: this.#rowOf(detail.index) })
  }

  protected override handleEngineClick(detail: { index: number; seriesIndex: number }): void {
    super.handleEngineClick({ ...detail, index: this.#rowOf(detail.index) })
  }

  /** A click on a level highlights that level. */
  protected override highlightKeyAt(detail: { index: number; seriesIndex: number }): string | undefined {
    return this.frame?.labels?.[detail.index]
  }

  #rowOf(index: number): number {
    return this.#drawnRows[index] ?? index
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
    // A highlight names a level, so the other levels fade back one datum at a time, as a pie's slices do.
    const highlighted = this.highlighted !== null && (frame.labels ?? []).includes(this.highlighted) ? this.highlighted : null
    const data: PyramidDatum[] = levels.map((level) => {
      const name = frame.labels?.[level.index] ?? String(level.index)
      const itemStyle: PyramidDatum['itemStyle'] = { color: palette[level.index % palette.length] }
      if (level.height !== undefined) itemStyle[this.#horizontal ? 'width' : 'height'] = `${level.height * available * 100}%`
      if (highlighted !== null && name !== highlighted) itemStyle.opacity = context.theme.dimmedOpacity
      return {
        name,
        value: level.depth,
        real: level.value,
        share: total > 0 ? level.value / total : 0,
        itemStyle,
        ...(this.labels === 'inside' ? { label: { color: readableTextOn(itemStyle.color) } } : {}),
      }
    })
    this.#outsideLabels = this.labels === 'outside' ? this.#placeOutsideLabels(levels, data, context, available) : []
    return [data, this.#outsideLabels.map((_, index) => ({ value: [index] }))]
  }

  /**
   * ECharts' funnel labels sit at the middle of their level and cannot be moved (`labelLayout` never sees them and
   * FunnelView writes their position straight into the text style), so the thin levels near the apex would stack
   * their labels on top of each other. The levels' geometry is known here, so the labels are spread along the axis
   * and drawn by a series of their own, each with a leader line from its level's edge.
   */
  #placeOutsideLabels(levels: PyramidLevel[], data: PyramidDatum[], context: ChartBuildContext, available: number): OutsideLabel[] {
    const layout = this.#readLayout()
    const box = this.#box(context)
    const horizontal = this.#horizontal
    const align = this.#align(layout.align)
    const length = horizontal ? box.width : box.height
    const cross = horizontal ? box.height : box.width
    const start = horizontal ? box.left : box.top
    const crossStart = horizontal ? box.top : box.left
    const apexAtStart = horizontal ? this.#engineSort() === 'ascending' : this.apex === 'top'
    const minSize = toPixels(layout.minWidth, cross)
    const maxSize = toPixels(layout.maxWidth, cross)
    const { fontSize, dimmedOpacity } = context.theme
    const highlighted = this.highlighted

    let offset = 0
    let previousDepth = 0
    const levelsAt = levels.map((level) => {
      const size = (level.height ?? 1 / levels.length) * available * length
      const centre = offset + size / 2
      offset += size + layout.gap
      // Both of a level's edges are linear in depth, so its width halfway along is the width at the mean depth.
      const width = minSize + (maxSize - minSize) * ((previousDepth + level.depth) / 2)
      previousDepth = level.depth
      return { centre: apexAtStart ? start + centre : start + length - centre, width }
    })
    const texts = data.map((datum) => this.#labelText(datum))
    const sizes = texts.map((text) => (horizontal ? text.length * fontSize * 0.58 + 10 : fontSize * 1.35))
    const placed = spreadLabels(
      levelsAt.map((level) => level.centre),
      sizes,
      start,
      start + length,
    )

    // Which side of the funnel the labels go on: away from the edge it is aligned to.
    const nearSide = horizontal ? align === 'bottom' : align === 'right'
    return levelsAt.map((level, index) => {
      const lead = nearSide ? crossStart + edgeOffset(align, cross, level.width, true) : crossStart + edgeOffset(align, cross, level.width, false)
      const direction = nearSide ? -1 : 1
      const opacity = highlighted !== null && data[index].name !== highlighted ? dimmedOpacity : 1
      if (horizontal) {
        const textY = nearSide ? box.top - LABEL_LINE - fontSize * 0.7 : box.top + box.height + LABEL_LINE + fontSize * 0.7
        const endY = textY - direction * fontSize * 0.7
        return {
          text: texts[index],
          points: [
            [level.centre, lead],
            [level.centre, lead + direction * 6],
            [placed[index], endY],
          ],
          x: placed[index],
          y: textY,
          align: 'center',
          opacity,
        }
      }
      const textX = lead + direction * LABEL_LINE
      return {
        text: texts[index],
        points: [
          [lead + direction * 2, level.centre],
          [lead + direction * 8, level.centre],
          [textX - direction * 3, placed[index]],
        ],
        x: textX,
        y: placed[index],
        align: nearSide ? 'right' : 'left',
        opacity,
      }
    })
  }

  /** The funnel, plus the series that draws its outside labels. */
  protected override buildOptions(context: ChartBuildContext): unknown {
    const options = super.buildOptions(context) as { series?: Record<string, unknown>[] }
    if (this.labels !== 'outside') return options
    return {
      ...options,
      series: [
        ...(options.series ?? []),
        { type: 'custom', name: 'labels', coordinateSystem: 'none', silent: true, z: 5, animationDurationUpdate: 0, renderItem: this.#renderLabelItem },
      ],
    }
  }

  // The same function on every build, so ECharts updates the label elements instead of replacing them.
  #renderLabelItem = (params: { dataIndex: number }): unknown => {
    const label = this.#outsideLabels[params.dataIndex]
    if (!label) return null
    const theme = this.themeController.theme
    return {
      type: 'group',
      silent: true,
      children: [
        {
          type: 'polyline',
          silent: true,
          shape: { points: label.points },
          style: { fill: 'none', stroke: theme.mutedColor, lineWidth: 1, opacity: 0.6 * label.opacity },
        },
        {
          type: 'text',
          silent: true,
          style: {
            text: label.text,
            x: label.x,
            y: label.y,
            align: label.align,
            verticalAlign: 'middle',
            fill: theme.color,
            fontSize: theme.fontSize,
            fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily,
            opacity: label.opacity,
          },
        },
      ],
    }
  }

  protected override seriesOption(_index: number, context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const layout = this.#readLayout()
    const box = this.#box(context)
    const horizontal = this.#horizontal
    const align = this.#align(layout.align)
    const outsideSide = horizontal ? (align === 'bottom' ? 'top' : 'bottom') : align === 'right' ? 'left' : 'right'
    // Outside labels are drawn by their own series (see #placeOutsideLabels); the funnel only draws inside ones.
    const showLabels = this.labels === 'inside'
    const label = {
      show: showLabels,
      position: this.labels === 'inside' ? 'inside' : outsideSide,
      // Inside labels carry their own colour, picked against each level's fill.
      color: theme.color,
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
      labelLine: { show: false },
      // Outside labels sit where #placeOutsideLabels spread them, clear of each other.
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

/** Where a level's edge sits across the axis, from the start of the box: its far edge, or with `near` its near one. */
function edgeOffset(align: string, cross: number, width: number, near: boolean): number {
  const from = align === 'left' || align === 'top' ? 0 : align === 'right' || align === 'bottom' ? cross - width : (cross - width) / 2
  return near ? from : from + width
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
