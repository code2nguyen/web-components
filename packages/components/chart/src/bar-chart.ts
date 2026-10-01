import { property } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type uPlot from 'uplot'
import type { Options } from 'uplot'
import { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
import { bandStep, barPaths, layout, stackExtents, stackRange, stackedBarPaths, type BarStack } from './engines/uplot-paths.js'
import { createUplotAdapter } from './engines/uplot-adapter.js'
import { loadedUplot } from './engines/uplot-loader.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import type { ChartSeriesConfig } from './chart-types.js'
import './chart-series.js'

export type { BarStack } from './engines/uplot-paths.js'

/** Which way the bars run: up from a bottom baseline, or rightwards from a left one. */
export type BarOrientation = 'vertical' | 'horizontal'

/** Formats one bar's value label. `value` is the series' own value, never the stacked total. */
export type BarLabelFormatter = (value: number, series: ChartSeriesConfig, index: number) => string

export interface BarChart {
  addEventListener: TypedAddEventListener<BarChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<BarChart, ChartEventMap>
}

/** Space between a bar's value end and its outside label, and the inside label's margin, in CSS pixels. */
const LABEL_OFFSET = 4

/**
 * A bar chart drawn by uPlot's bars path builder, for categorical or time-bucketed values. Several series are
 * drawn side by side within each band, or stacked into one bar with `stack`. `orientation="horizontal"` lays the
 * categories down the left edge, which suits long category names and rankings, and `value-labels` prints each
 * bar's value on the chart.
 *
 * ```html
 * <c2-bar-chart label-field="team" legend="bottom" data='[{ "team": "Core", "shipped": 18 }]'>
 *   <c2-chart-series field="shipped" label="Shipped"></c2-chart-series>
 * </c2-bar-chart>
 * ```
 *
 * @tag c2-bar-chart
 *
 * @slotcomponent c2-chart-series
 */
@customElement('c2-bar-chart')
export class BarChart extends UplotChartBase {
  /** Share of each band a bar group occupies, from 0 to 1. */
  @property({ type: Number, attribute: 'bar-width' }) barWidth = 0.6

  /** Share of the group taken by the gaps between grouped bars, from 0 to 1. Unused when stacked. */
  @property({ type: Number, attribute: 'bar-gap' }) barGap = 0.1

  /**
   * Which way the bars run. `horizontal` puts the categories on the left axis, first at the top, and the values
   * along the bottom.
   */
  @property({ type: String, reflect: true }) orientation: BarOrientation = 'vertical'

  /**
   * How several series share a band. `none` groups them side by side; `normal` stacks them into one bar, positive
   * values upwards and negative ones downwards; `percent` stacks each band's shares of its total to 100.
   */
  @property({ type: String }) stack: BarStack = 'none'

  /**
   * Prints each bar's value: past the value end of a grouped bar, centred inside a stacked segment (left out when
   * the segment is too small to hold it).
   */
  @property({ type: Boolean, attribute: 'value-labels' }) valueLabels = false

  /** Formats the value labels. Defaults to the series' own `format`, then the chart's number format. Property only. */
  @property({ attribute: false }) formatLabel?: BarLabelFormatter

  protected override createAdapter(): Promise<ChartAdapter> {
    return createUplotAdapter(this.hitMode, (self, index) => this.#pick(self, index)) as unknown as Promise<ChartAdapter>
  }

  /** A stacked bar's segments depend on which series are shown, so a toggle has to repaint all of them. */
  override setSeriesVisible(index: number, visible: boolean): void {
    super.setSeriesVisible(index, visible)
    if (this.stack !== 'none') this.adapter?.redraw?.()
  }

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const color = this.colorOf(series, index, context.theme)
    return {
      stroke: color,
      fill: color,
      width: 0,
      // The builder places this series within the group, so it has to know how many there are.
      paths:
        this.stack === 'none'
          ? barPaths(this.barWidth, this.barGap, index, context.series.length, context.theme.barRadius)
          : stackedBarPaths(this.barWidth, this.stack, context.theme.barRadius),
      // A bar already marks its value; a dot on top of it is uPlot's line default showing through.
      points: { show: false },
    }
  }

  /** A band chart reads its x as discrete slots, so the scale is padded by half a band at each end. */
  protected override decorateOptions(options: Options, context: ChartBuildContext): Options {
    const horizontal = this.orientation === 'horizontal'
    const stacked = this.stack !== 'none'
    const scales = { ...options.scales }
    const axes = [...(options.axes ?? [])]

    scales.x = {
      ...scales.x,
      time: false,
      range: (_self, min, max) => [min - 0.5, max + 0.5],
      // Down the left edge, first category at the top, the way a ranked list reads.
      ...(horizontal ? { ori: 1 as const, dir: -1 as const } : {}),
    }
    if (horizontal) {
      scales.y = { ...scales.y, ori: 0 as const }
      if (scales.y2) scales.y2 = { ...scales.y2, ori: 0 as const }
    }

    // uPlot auto-ranges a scale on the raw values, which for a stack is the height of one segment, not the bar.
    // An explicit `y-min`/`y-max` still wins.
    if (stacked && !scales.y?.range) {
      scales.y = {
        ...scales.y,
        range: (self) => {
          const [low, high] = stackRange(self, this.stack)
          if (this.stack === 'percent') return [low < 0 ? -100 : 0, high > 0 || low >= 0 ? 100 : 0]
          const nice = loadedUplot()?.rangeNum(low, high, 0.1, true) ?? [low, high]
          return [Math.min(0, nice[0] ?? low), Math.max(0, nice[1] ?? high)]
        },
      }
    }

    if (horizontal) {
      // `side` 3 is the left edge and 2 the bottom; a right-hand series' axis goes to the top.
      if (axes[0]) axes[0] = { ...axes[0], side: 3, size: (self, values) => this.#categoryAxisSize(self, values, context) }
      if (axes[1]) axes[1] = { ...axes[1], side: 2 }
      if (axes[2]) axes[2] = { ...axes[2], side: 0 }
    }
    if (this.stack === 'percent' && axes[1]) {
      axes[1] = { ...axes[1], values: (_self: unknown, splits: number[]) => splits.map((value) => `${this.formatValue(value)}%`) }
    }

    return {
      ...options,
      scales,
      axes,
      // An outside label sits past the tallest bar, so the plot gives up that much room on the value end.
      ...(this.valueLabels && !stacked ? { padding: this.#labelPadding(context) } : {}),
      // A bar chart's cursor belongs on the band, not between two points.
      cursor: { ...options.cursor, x: true, y: false },
      hooks: { ...options.hooks, draw: [...(options.hooks?.draw ?? []), (self: uPlot) => this.#drawLabels(self, context)] },
    }
  }

  /** The series whose bar the cursor is on: its slot in a group, or the segment it is inside in a stack. */
  #pick(self: uPlot, index: number): number | undefined {
    const horizontal = this.orientation === 'horizontal'
    const along = (horizontal ? self.cursor.top : self.cursor.left) ?? 0
    const across = (horizontal ? self.cursor.left : self.cursor.top) ?? 0

    if (this.stack !== 'none') {
      const value = self.posToVal(across, 'y')
      const { y0, y1 } = stackExtents(self, this.stack)
      for (let seriesIndex = 1; seriesIndex < y1.length; seriesIndex += 1) {
        const start = y0[seriesIndex]?.[index]
        const end = y1[seriesIndex]?.[index]
        if (start === null || start === undefined || end === null || end === undefined) continue
        if (value >= Math.min(start, end) && value <= Math.max(start, end)) return seriesIndex - 1
      }
      return undefined
    }

    const count = self.series.length - 1
    if (count < 2) return undefined
    const xs = self.data[0] as unknown as number[]
    const band = bandStep(xs) * this.barWidth
    const offset = self.posToVal(along, 'x') - (xs[index] - band / 2)
    if (offset < 0 || offset > band) return undefined
    const slot = Math.min(count - 1, Math.floor(offset / (band / count)))
    return self.series[slot + 1]?.show === false ? undefined : slot
  }

  /** Room on the left for the longest category name, measured with the axis font, plus the tick and a gap. */
  #categoryAxisSize(self: uPlot, values: string[] | null, context: ChartBuildContext): number {
    if (!values?.length) return 50
    const context2d = self.ctx
    context2d.save()
    context2d.font = this.#font(context, context.theme.axisFontSize)
    const widest = Math.max(...values.map((value) => context2d.measureText(String(value)).width))
    context2d.restore()
    // The font is scaled to canvas pixels, the axis size is CSS pixels.
    return Math.ceil(widest / devicePixelRatio) + 18
  }

  /** uPlot's `padding` with the value end widened for outside labels; `null` keeps uPlot's own for that side. */
  #labelPadding(context: ChartBuildContext): Options['padding'] {
    const size = context.theme.fontSize
    if (this.orientation !== 'horizontal') return [size + LABEL_OFFSET * 2, null, null, null]
    // Text width is not known until the canvas exists, so the widest label is estimated from its length.
    const frame = this.frame
    let longest = 0
    if (frame) {
      context.series.forEach((series, seriesIndex) => {
        const column = frame.columns[seriesIndex]
        for (let index = 0; index < frame.length; index += 1) {
          const value = column?.[index]
          if (typeof value === 'number' && Number.isFinite(value)) longest = Math.max(longest, this.#labelText(value, series, index).length)
        }
      })
    }
    return [null, Math.ceil(longest * size * 0.62) + LABEL_OFFSET * 2, null, null]
  }

  #labelText(value: number, series: ChartSeriesConfig, index: number): string {
    return this.formatLabel?.(value, series, index) ?? series.format?.(value) ?? this.formatValue(value)
  }

  #font(context: ChartBuildContext, size: number): string {
    const family = context.theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : context.theme.fontFamily
    return `${size * devicePixelRatio}px ${family}`
  }

  /** Prints the value labels on the canvas, after uPlot has drawn the bars. */
  #drawLabels(self: uPlot, context: ChartBuildContext): void {
    if (!this.valueLabels) return
    const horizontal = this.orientation === 'horizontal'
    const stacked = this.stack !== 'none'
    const ratio = devicePixelRatio
    const ctx = self.ctx
    const xs = self.data[0] as unknown as number[]
    const count = self.series.length - 1
    const group = layout(self, this.barWidth, this.barGap, Math.max(1, count))
    const band = bandStep(xs) * this.barWidth
    // A bar's thickness in canvas pixels, which decides whether an inside label fits across it.
    const thickness = Math.abs(self.valToPos(band / (stacked ? 1 : Math.max(1, count)), 'x', true) - self.valToPos(0, 'x', true))
    const extents = stacked ? stackExtents(self, this.stack) : undefined
    const offset = LABEL_OFFSET * ratio
    const fontSize = context.theme.fontSize * ratio

    ctx.save()
    ctx.font = this.#font(context, context.theme.fontSize)
    for (let seriesIndex = 1; seriesIndex <= count; seriesIndex += 1) {
      const engineSeries = self.series[seriesIndex]
      const series = context.series[seriesIndex - 1]
      if (!series || engineSeries?.show === false) continue
      const scale = engineSeries?.scale ?? 'y'
      const column = self.data[seriesIndex] as unknown as (number | null | undefined)[]
      const lefts = stacked || count < 2 ? undefined : group.left(seriesIndex - 1)

      for (let index = 0; index < xs.length; index += 1) {
        const value = column[index]
        if (value === null || value === undefined || !Number.isFinite(value)) continue
        const text = this.#labelText(value, series, index)
        const width = ctx.measureText(text).width
        const centre = self.valToPos(lefts ? lefts[index] + group.barWidth / 2 : xs[index], 'x', true)

        if (extents) {
          const start = extents.y0[seriesIndex]?.[index]
          const end = extents.y1[seriesIndex]?.[index]
          if (start === null || start === undefined || end === null || end === undefined) continue
          const from = self.valToPos(start, scale, true)
          const to = self.valToPos(end, scale, true)
          const length = Math.abs(to - from)
          // Along the bar the segment has to hold the text; across it, the bar has to be thicker than the text.
          const fits = horizontal
            ? length >= width + offset * 2 && thickness >= fontSize + offset
            : length >= fontSize + offset && thickness >= width + offset * 2
          if (!fits) continue
          ctx.fillStyle = context.theme.surface
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          const middle = (from + to) / 2
          if (horizontal) ctx.fillText(text, middle, centre)
          else ctx.fillText(text, centre, middle)
          continue
        }

        const end = self.valToPos(value, scale, true)
        const negative = value < 0
        ctx.fillStyle = context.theme.color
        if (horizontal) {
          ctx.textAlign = negative ? 'right' : 'left'
          ctx.textBaseline = 'middle'
          ctx.fillText(text, end + (negative ? -offset : offset), centre)
        } else {
          ctx.textAlign = 'center'
          ctx.textBaseline = negative ? 'top' : 'bottom'
          ctx.fillText(text, centre, end + (negative ? offset : -offset))
        }
      }
    }
    ctx.restore()
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-bar-chart': BarChart
  }
}
