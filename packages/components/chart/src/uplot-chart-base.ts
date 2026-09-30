import { property } from '@c2n/core/lit-helper.js'
import type { AlignedData, Axis, Options, Series } from 'uplot'
import { ChartBase } from './chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import { createUplotAdapter, type UplotHitMode } from './engines/uplot-adapter.js'
import type { ChartFrame, ChartSeriesConfig } from './chart-types.js'

const DAY = 86_400_000
const YEAR = 365 * DAY

/** uPlot scale key for the secondary y axis, which `c2-chart-series[axis=right]` draws against. */
const RIGHT_SCALE = 'y2'

/** The per-series drawing options a concrete uPlot chart contributes. */
export type UplotSeriesStyle = Omit<Series, 'label' | 'show'>

/**
 * The uPlot half of the hierarchy: the cartesian presentation shared by the line, area, bar and sparkline
 * charts, and the option object built from it. A concrete chart supplies only {@link seriesStyle}, which
 * is what makes a new uPlot chart type roughly ten lines.
 *
 * Defines no tag and is never registered.
 *
 * @cssproperty {color} [--c2-chart__axis-line--color=#e4e4e7] - Colour of the axis rules uPlot draws at the plot edges.
 */
export abstract class UplotChartBase extends ChartBase {
  protected override readonly engineName = 'uplot' as const

  /**
   * Which grid lines are drawn. A string rather than a boolean because a boolean attribute reads as `true`
   * whenever it is present — `grid="false"` in markup would turn the grid *on*, and there would be no way to
   * turn it off from HTML at all. `y` (the default) draws the horizontal lines, matching `axes`' shape.
   */
  @property({ type: String }) grid: 'both' | 'x' | 'y' | 'none' = 'y'

  /** Which axes are drawn. */
  @property({ type: String }) axes: 'both' | 'x' | 'y' | 'none' = 'both'

  /** Lower bound of the y scale. Auto-ranged when unset. */
  @property({ type: Number, attribute: 'y-min' }) yMin?: number

  /** Upper bound of the y scale. Auto-ranged when unset. */
  @property({ type: Number, attribute: 'y-max' }) yMax?: number

  /** Lets the user drag horizontally to zoom the x scale. */
  @property({ type: Boolean }) zoom = false

  /** The cursor crosshair. */
  @property({ type: String }) cursor: 'x' | 'none' = 'x'

  /** How one series of this chart type is drawn. The only thing a concrete uPlot chart must supply. */
  protected abstract seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle

  /** Last chance to adjust the finished option object; the sparkline strips its chrome here. */
  protected decorateOptions(options: Options, _context: ChartBuildContext): Options {
    return options
  }

  /** How the cursor picks a series: the nearest line, or (area charts) the fill it is inside. */
  protected readonly hitMode: UplotHitMode = 'nearest'

  protected override createAdapter(): Promise<ChartAdapter> {
    return createUplotAdapter(this.hitMode) as unknown as Promise<ChartAdapter>
  }

  protected override projectData(frame: ChartFrame): unknown {
    return this.frameBuilder.uplotView(frame) as unknown as AlignedData
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    const { theme, series, width, height } = context
    const showX = this.axes === 'both' || this.axes === 'x'
    const showY = this.axes === 'both' || this.axes === 'y'
    // A series drawn against `axis="right"` needs a scale of its own, or it would share the left one and the
    // whole point of a second axis — two quantities at different magnitudes — would be lost.
    const hasRight = series.some((item) => item.axis === 'right')

    // `scale` and `side` are spread in only for the right-hand axis: uPlot fills its per-index defaults with
    // `assign`, which copies an explicit `undefined` straight over them — the x axis would lose its side and
    // stop being drawn at the bottom.
    const axis = (show: boolean, isX: boolean, scale?: string): Axis => ({
      ...(scale ? { scale, side: 1 as const } : {}),
      show,
      stroke: theme.axisColor,
      font: `${theme.axisFontSize}px ${theme.fontFamily === 'inherit' ? 'system-ui, sans-serif' : theme.fontFamily}`,
      ticks: { show, stroke: theme.gridColor, width: 1 },
      // Only the left axis contributes grid lines; a second set from the right one would not line up with it.
      grid:
        scale === RIGHT_SCALE
          ? { show: false }
          : { show: isX ? this.grid === 'x' || this.grid === 'both' : this.grid === 'y' || this.grid === 'both', stroke: theme.gridColor, width: 1 },
      values: isX
        ? (_self: unknown, splits: number[]) => splits.map((value) => this.formatAxisX(value))
        : (_self: unknown, splits: number[]) => splits.map((value) => this.formatValue(value)),
    })

    const options: Options = {
      width: Math.max(1, Math.floor(width)),
      height: Math.max(1, Math.floor(height)),
      // We render our own legend in the light of the shadow DOM; uPlot's is DOM inside the plot.
      legend: { show: false },
      cursor: this.cursor === 'none' ? { show: false } : { show: true, x: true, y: false, drag: { x: this.zoom, y: false, setScale: this.zoom } },
      scales: {
        x: {
          // uPlot's own time scale works in seconds. We keep epoch milliseconds in the frame and format
          // ticks ourselves, so nothing has to be converted per revision and the labels match ECharts.
          time: false,
        },
        y: { range: this.yRange() },
        ...(hasRight ? { [RIGHT_SCALE]: { range: this.yRange() } } : {}),
      },
      axes: [axis(showX, true), axis(showY, false), ...(hasRight ? [axis(showY, false, RIGHT_SCALE)] : [])],
      series: [
        {},
        ...series.map((item, index) => {
          const style = this.seriesStyle(item, index, context)
          return {
            label: item.label ?? item.field,
            show: !context.hidden.has(index),
            // Spread in only for the right-hand axis, as for the axes above: an explicit `undefined` is copied over uPlot's
            // default, and a series left without the `y` scale key cannot be mapped to a pixel, so the cursor could
            // never tell which series it is nearest (it always reported the first).
            ...(item.axis === 'right' ? { scale: RIGHT_SCALE } : {}),
            ...style,
            // A highlighted series comes forward with a heavier line, and the others fade back.
            ...this.highlightStyle(style, index, context),
          }
        }),
      ],
    }

    return this.decorateOptions(options, context)
  }

  /** The highlight on top of a series' own style: a heavier stroke for the highlighted one, fading for the rest. */
  protected highlightStyle(style: UplotSeriesStyle, index: number, context: ChartBuildContext): UplotSeriesStyle {
    if (context.highlighted < 0) return {}
    if (index !== context.highlighted) return { alpha: context.theme.dimmedOpacity }
    return style.stroke ? { width: (style.width ?? context.theme.lineWidth) + 1 } : {}
  }

  /** A fixed y range when either bound is set, otherwise uPlot's own auto-ranging. */
  private yRange(): Options['scales'] extends undefined ? never : [number | null, number | null] | undefined {
    if (this.yMin === undefined && this.yMax === undefined) return undefined
    return [this.yMin ?? null, this.yMax ?? null]
  }

  /**
   * Axis tick labels are terser than the tooltip's. The unit comes from the span the chart covers, because a
   * fixed date format repeats itself once the engine picks sub-day increments: an hour of samples would label
   * every tick "Jan 1".
   */
  protected formatAxisX(value: number): string {
    // Rows with a `label-field` name their own ticks, as the ECharts charts' category axes do: a year, a quarter or
    // a region is a name, not a quantity to print as "2,021". uPlot picks its own splits, and on a handful of rows
    // (a bar chart's bands) those land on halves; a tick between two rows has no name, so it stays blank.
    const labels = this.frame?.labels
    if (labels) {
      const index = this.#indexOfX(value)
      return index < 0 ? '' : (labels[index] ?? '')
    }
    if (this.xType !== 'time') return this.formatValue(value)
    const span = this.xSpan()
    const options: Intl.DateTimeFormatOptions =
      span > 0 && span < DAY ? { hour: 'numeric', minute: '2-digit' } : span < YEAR ? { month: 'short', day: 'numeric' } : { month: 'short', year: 'numeric' }
    return new Intl.DateTimeFormat(this.locale, options).format(new Date(value))
  }

  /** The row whose x value is `value`, or `-1`. Label axes are short, so a scan is cheaper than an index. */
  #indexOfX(value: number): number {
    const frame = this.frame
    if (!frame) return -1
    for (let index = 0; index < frame.length; index += 1) if (frame.x[index] === value) return index
    return -1
  }
}
