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
import {
  layoutPyramid,
  pyramidShapes,
  readableTextOn,
  roundedPolygonPath,
  spreadLabels,
  type PyramidLevel,
  type PyramidShape,
  type PyramidSizing,
  type PyramidSort,
} from './pyramid-layout.js'
import './chart-series.js'

export interface PyramidChart {
  addEventListener: TypedAddEventListener<PyramidChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<PyramidChart, ChartEventMap>
}

/** Space between the plot box and the pyramid, in pixels. */
const INSET = 8

/** Length of the line joining an outside label to its level. */
const LABEL_LINE = 14

/** One level as the level series receives it. */
interface PyramidDatum {
  name: string
  value: [number]
  real: number
  share: number
  itemStyle: { color: string; opacity?: number }
}

/** One outside label, in plot pixels. */
interface OutsideLabel {
  text: string
  /** Where the leader line leaves the level's side, where it bends, and where it meets the text. */
  points: [number, number][]
  x: number
  y: number
  align: 'left' | 'center' | 'right'
}

/** Everything the two series draw, for one plot size. */
interface PyramidGeometry {
  size: string
  shapes: PyramidShape[]
  labels: OutsideLabel[]
  radius: number
  border: { color: string; width: number }
}

/** What ECharts hands a custom series' `renderItem`, as far as this chart uses it. */
interface RenderParams {
  dataIndex: number
}
interface RenderApi {
  getWidth(): number
  getHeight(): number
}

/**
 * A pyramid chart. `label-field` names each level and the single series supplies its value, so one row is one
 * level, stacked from a narrow apex to a wide base. ECharts draws it, through a custom series: its own funnel
 * cannot round a level's corners or keep its labels apart.
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
 * @cssproperty {pixel} [--c2-chart__level--border-radius=4px] - Rounding of every level's corners, including the apex. `0` draws sharp corners.
 * @cssproperty {pixel} [--c2-chart__level--gap=0px] - Space between adjacent levels.
 * @cssproperty {length} [--c2-chart__level--min-width=0%] - Width of the apex, as a length or a percentage of the plot box. Above 0 the pyramid has a flat top.
 * @cssproperty {length} [--c2-chart__level--max-width=100%] - Width of the base, as a length or a percentage of the plot box.
 * @cssproperty {string} [--c2-chart__level--align=center] - Where the pyramid sits across its axis: `start`, `center` or `end`. A `start` pyramid is a right triangle.
 */
@customElement('c2-pyramid-chart')
export class PyramidChart extends EchartsChartBase {
  protected override readonly features: readonly EchartsFeature[] = ['custom']

  /**
   * What a level's size encodes. `area` and `height` keep a triangular outline and size each level's area or
   * height by its value; `equal` gives every level the same height, so only the order is encoded; `width`
   * gives every level the same height and sizes its base by its value, and always orders the levels by value.
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

  /** The drawn levels, apex first, as the last data projection laid them out. */
  #levels: PyramidLevel[] = []
  #data: PyramidDatum[] = []

  /** The geometry for the plot size ECharts last drew at; dropped whenever the data or the options change. */
  #geometry?: PyramidGeometry

  protected override get legendDependsOnData(): boolean {
    return true
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
    return this.#levels[index]?.index ?? index
  }

  protected override projectData(frame: ChartFrame, context: ChartBuildContext): unknown {
    const column = frame.columns[0]
    const values = column ? Array.from({ length: frame.length }, (_, index) => columnValue(column, index)) : []
    const exclude = new Set<number>()
    frame.labels?.forEach((label, index) => {
      if (this.hiddenLevels.has(label)) exclude.add(index)
    })
    const layout = this.#readLayout()
    const box = this.#box(context.width, context.height)
    const cross = this.#vertical ? box.width : box.height
    const minSize = toPixels(layout.minWidth, cross)
    const maxSize = toPixels(layout.maxWidth, cross)
    const levels = layoutPyramid(values, { sizing: this.sizing, sort: this.sort, apexRatio: maxSize > 0 ? minSize / maxSize : 0, exclude })

    const { palette, dimmedOpacity } = context.theme
    const total = levels.reduce((sum, level) => sum + level.value, 0)
    // A highlight names a level, so the other levels fade back one datum at a time, as a pie's slices do.
    const highlighted = this.highlighted !== null && (frame.labels ?? []).includes(this.highlighted) ? this.highlighted : null
    const data = levels.map((level, position): PyramidDatum => {
      const name = frame.labels?.[level.index] ?? String(level.index)
      const itemStyle: PyramidDatum['itemStyle'] = { color: palette[level.index % palette.length] }
      if (highlighted !== null && name !== highlighted) itemStyle.opacity = dimmedOpacity
      return { name, value: [position], real: level.value, share: total > 0 ? level.value / total : 0, itemStyle }
    })
    this.#levels = levels
    this.#data = data
    this.#geometry = undefined
    return [data, this.labels === 'outside' ? data.map((datum) => ({ name: datum.name, value: datum.value })) : []]
  }

  /** The level series, plus the one that draws the outside labels. */
  protected override buildOptions(context: ChartBuildContext): unknown {
    this.#geometry = undefined
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

  protected override seriesOption(): Record<string, unknown> {
    return { type: 'custom', coordinateSystem: 'none', animationDurationUpdate: 0, renderItem: this.#renderLevelItem }
  }

  /**
   * The outlines and labels for a plot of `width` by `height` pixels. Computed when ECharts draws, from the size
   * it draws at, so a resize needs no rebuild; kept until the size, the data or the options change.
   */
  protected levelGeometry(width: number, height: number): PyramidGeometry {
    const size = `${width}x${height}`
    if (this.#geometry?.size === size) return this.#geometry
    const layout = this.#readLayout()
    const box = this.#box(width, height)
    const vertical = this.#vertical
    const cross = vertical ? box.width : box.height
    const shapes = pyramidShapes(this.#levels, box, {
      apex: this.#physicalApex,
      align: this.#physicalAlign(layout.align),
      gap: layout.gap,
      minSize: toPixels(layout.minWidth, cross),
      maxSize: toPixels(layout.maxWidth, cross),
    })
    const theme = this.themeController.theme
    this.#geometry = {
      size,
      shapes,
      labels: this.labels === 'outside' ? this.#placeOutsideLabels(shapes, box, layout.align) : [],
      radius: layout.radius,
      border: levelBorder(this, theme.surface),
    }
    return this.#geometry
  }

  /**
   * Spreads the outside labels along the axis so the thin levels near the apex do not stack them on top of each
   * other, and joins each to its level's side with an elbowed leader line.
   */
  #placeOutsideLabels(shapes: PyramidShape[], box: { x: number; y: number; width: number; height: number }, alignValue: string): OutsideLabel[] {
    const vertical = this.#vertical
    const { fontSize } = this.themeController.theme
    const texts = this.#data.map((datum) => this.#labelText(datum))
    const sizes = texts.map((text) => (vertical ? fontSize * 1.35 : text.length * fontSize * 0.58 + 10))
    const centres = shapes.map((shape) => (vertical ? shape.centre[1] : shape.centre[0]))
    const placed = vertical ? spreadLabels(centres, sizes, box.y, box.y + box.height) : spreadLabels(centres, sizes, box.x, box.x + box.width)
    // The labels go on the side the pyramid is not aligned to.
    const before = this.#physicalAlign(alignValue) === 'end'
    const direction = before ? -1 : 1
    return shapes.map((shape, index) => {
      const side = before ? shape.sides[0] : shape.sides[1]
      if (vertical) {
        const textX = side + direction * LABEL_LINE
        return {
          text: texts[index],
          points: [
            [side + direction * 2, shape.centre[1]],
            [side + direction * 8, shape.centre[1]],
            [textX - direction * 3, placed[index]],
          ],
          x: textX,
          y: placed[index],
          align: before ? 'right' : 'left',
        }
      }
      const textY = before ? box.y - LABEL_LINE - fontSize * 0.7 : box.y + box.height + LABEL_LINE + fontSize * 0.7
      return {
        text: texts[index],
        points: [
          [shape.centre[0], side + direction * 2],
          [shape.centre[0], side + direction * 6],
          [placed[index], textY - direction * fontSize * 0.7],
        ],
        x: placed[index],
        y: textY,
        align: 'center',
      }
    })
  }

  // The same functions on every build, so ECharts updates the elements instead of replacing them.
  #renderLevelItem = (params: RenderParams, api: RenderApi): unknown => {
    const geometry = this.levelGeometry(api.getWidth(), api.getHeight())
    const shape = geometry.shapes[params.dataIndex]
    const datum = this.#data[params.dataIndex]
    if (!shape || !datum) return null
    const theme = this.themeController.theme
    const opacity = datum.itemStyle.opacity ?? 1
    const children: Record<string, unknown>[] = [
      {
        type: 'path',
        shape: { pathData: roundedPolygonPath(shape.points, geometry.radius) },
        style: { fill: datum.itemStyle.color, stroke: geometry.border.color, lineWidth: geometry.border.width, lineJoin: 'round', opacity },
        emphasis: { style: { shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.22)' } },
      },
    ]
    const text = this.labels === 'inside' ? this.#labelText(datum) : ''
    // An inside label needs room: on a sliver of a level it would spill over its neighbours.
    if (text && shape.thickness >= theme.fontSize * 1.2 && shape.width >= text.length * theme.fontSize * 0.55) {
      children.push({
        type: 'text',
        silent: true,
        style: {
          text,
          x: shape.centre[0],
          y: shape.centre[1],
          align: 'center',
          verticalAlign: 'middle',
          fill: readableTextOn(datum.itemStyle.color),
          fontSize: theme.fontSize,
          fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily,
          opacity,
        },
      })
    }
    return { type: 'group', children }
  }

  #renderLabelItem = (params: RenderParams, api: RenderApi): unknown => {
    const label = this.levelGeometry(api.getWidth(), api.getHeight()).labels[params.dataIndex]
    const datum = this.#data[params.dataIndex]
    if (!label || !datum) return null
    const theme = this.themeController.theme
    const opacity = datum.itemStyle.opacity ?? 1
    return {
      type: 'group',
      silent: true,
      children: [
        {
          type: 'polyline',
          silent: true,
          shape: { points: label.points },
          style: { fill: 'none', stroke: theme.mutedColor, lineWidth: 1, opacity: 0.6 * opacity },
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
            opacity,
          },
        },
      ],
    }
  }

  get #vertical(): boolean {
    return this.apex === 'top' || this.apex === 'bottom'
  }

  get #rtl(): boolean {
    return typeof getComputedStyle === 'function' && getComputedStyle(this).direction === 'rtl'
  }

  /** `apex` with `start` and `end` resolved against the writing direction. */
  get #physicalApex(): 'top' | 'bottom' | 'left' | 'right' {
    if (this.apex === 'top' || this.apex === 'bottom') return this.apex
    return (this.apex === 'start') !== this.#rtl ? 'left' : 'right'
  }

  /** `--c2-chart__level--align` across the axis, where `start` is the left (or top) of the box. */
  #physicalAlign(value: string): 'start' | 'center' | 'end' {
    if (value !== 'start' && value !== 'end') return 'center'
    // Across a side-on pyramid the axis is vertical, where the writing direction does not apply.
    if (!this.#vertical || !this.#rtl) return value
    return value === 'start' ? 'end' : 'start'
  }

  /** The pyramid's box inside the plot, leaving room on one side for outside labels. */
  #box(width: number, height: number): { x: number; y: number; width: number; height: number } {
    const inset = { left: INSET, right: INSET, top: INSET, bottom: INSET }
    if (this.labels === 'outside') {
      const before = this.#physicalAlign(this.#readLayout().align) === 'end'
      const { fontSize } = this.themeController.theme
      if (this.#vertical) {
        const room = Math.min(width * 0.5, this.#longestLabel() * fontSize * 0.58 + LABEL_LINE + 10)
        if (before) inset.left += room
        else inset.right += room
      } else {
        const room = Math.ceil(fontSize * 1.4) + LABEL_LINE + 6
        if (before) inset.top += room
        else inset.bottom += room
      }
    }
    return {
      x: inset.left,
      y: inset.top,
      width: Math.max(0, width - inset.left - inset.right),
      height: Math.max(0, height - inset.top - inset.bottom),
    }
  }

  /** The length of the longest label, in characters, enough to reserve room without measuring text. */
  #longestLabel(): number {
    const frame = this.frame
    const column = frame?.columns[0]
    if (!frame || !column) return 0
    let longest = 0
    for (let index = 0; index < frame.length; index += 1) {
      const real = columnValue(column, index) ?? 0
      const text = this.#labelText({ name: frame.labels?.[index] ?? '', real, share: 0.999, value: [0], itemStyle: { color: '' } })
      longest = Math.max(longest, text.length)
    }
    return longest
  }

  #labelText(datum: PyramidDatum): string {
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

  /** The `--c2-chart__level--*` variables, read off the host. */
  #readLayout(): { gap: number; radius: number; minWidth: string; maxWidth: string; align: string } {
    if (typeof getComputedStyle !== 'function') return { gap: 0, radius: 4, minWidth: '0%', maxWidth: '100%', align: 'center' }
    const style = getComputedStyle(this)
    const read = (name: string) => style.getPropertyValue(name).trim()
    const gap = parseFloat(read('--c2-chart__level--gap'))
    const radius = parseFloat(read('--c2-chart__level--border-radius'))
    return {
      gap: Number.isFinite(gap) && gap > 0 ? gap : 0,
      radius: Number.isFinite(radius) ? Math.max(0, radius) : 4,
      minWidth: read('--c2-chart__level--min-width') || '0%',
      maxWidth: read('--c2-chart__level--max-width') || '100%',
      align: read('--c2-chart__level--align') || 'center',
    }
  }
}

/** Resolves a length, or a percentage of `extent`, to pixels. */
function toPixels(value: string, extent: number): number {
  const number = parseFloat(value)
  if (!Number.isFinite(number)) return 0
  return value.endsWith('%') ? (number / 100) * extent : number
}

/** Reads `--c2-chart__slice--border` off the host as a stroke colour and width. */
function levelBorder(host: HTMLElement, fallbackColor: string): { color: string; width: number } {
  const value = getComputedStyle(host).getPropertyValue('--c2-chart__slice--border').trim()
  if (value === 'none') return { color: 'transparent', width: 0 }
  if (!value) return { color: fallbackColor, width: 2 }
  const width = parseFloat(value)
  const color = value.replace(/^\s*[\d.]+[a-z%]*\s*/i, '').replace(/^(solid|dashed|dotted|double|groove|ridge|inset|outset)\s*/i, '')
  return { color: color || fallbackColor, width: Number.isFinite(width) ? width : 2 }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-pyramid-chart': PyramidChart
  }
}
