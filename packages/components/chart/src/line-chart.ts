import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { Options } from 'uplot'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
import { linePaths } from './engines/uplot-paths.js'
import type { ChartEventMap } from './chart-base.js'
import type { ChartBuildContext } from './chart-adapter.js'
import type { ChartReferenceLine, ChartSeriesConfig } from './chart-types.js'
import './chart-series.js'
import type { ChartKindMessage } from './messages.js'

/** The code of `reference-lines`, loaded once, the first time a chart has some. */
let referenceLines: typeof import('./reference-lines.js') | undefined
let referenceLinesLoad: Promise<unknown> | undefined

export interface LineChart {
  addEventListener: TypedAddEventListener<LineChart, ChartEventMap>
  removeEventListener: TypedRemoveEventListener<LineChart, ChartEventMap>
}

/**
 * A line chart over a time or numeric x axis, drawn on canvas by uPlot.
 *
 * Series are declared as `c2-chart-series` children — the same authoring shape as `c2-table`'s columns —
 * or through the `series` property. With neither, one line is drawn per numeric key of the first row.
 *
 * ```html
 * <c2-line-chart x-type="time" x-field="t" legend="bottom" data='[{ "t": 1704067200000, "cpu": 12 }]'>
 *   <c2-chart-series field="cpu" label="CPU"></c2-chart-series>
 * </c2-line-chart>
 * ```
 *
 * Realtime feeds should call `appendPoint()` rather than reassigning `data`: it writes into the frame's
 * spare capacity and redraws without a Lit update.
 *
 * `reference-lines` draws horizontal rules and bands behind the series (a target, control limits, sigma zones), and
 * a series with `points="only"` draws markers without a line, which flags a few points of another. Together with the
 * functions of `@c2n/chart/spc.js` they make a control chart.
 *
 * @tag c2-line-chart
 *
 * @slotcomponent c2-chart-series
 *
 * @cssproperty {pixel} [--c2-chart__line--width=2px] - Stroke width of a line series.
 * @cssproperty {pixel} [--c2-chart__point--radius=2.5px] - Radius of a data point marker.
 */
@customElement('c2-line-chart')
export class LineChart extends UplotChartBase {
  protected override get chartKind(): ChartKindMessage {
    return 'lineChart'
  }

  /** Interpolation between points. */
  @property({ type: String }) curve: 'linear' | 'smooth' | 'step' = 'linear'

  /** When point markers are drawn. `auto` lets uPlot show them once points are far enough apart. */
  @property({ type: String }) points: 'auto' | 'always' | 'none' = 'auto'

  /**
   * Horizontal rules at a y value, or bands between `value` and `value2`, each `{ value, value2?, label?, tone? }`, drawn
   * behind the series in the annotation tones and read out in the chart's accessible name. The y scale stretches to
   * show them unless `y-min`/`y-max` fix it. A band's fill uses `--c2-chart__annotation-range--opacity`, a rule the
   * `--c2-chart__annotation-line--*` width and style.
   */
  @property({ converter: jsonPropertyConverter, attribute: 'reference-lines' }) referenceLines?: ChartReferenceLine[]

  protected override seriesStyle(series: ChartSeriesConfig, index: number, context: ChartBuildContext): UplotSeriesStyle {
    const { theme } = context
    const stroke = this.colorOf(series, index, theme)
    const points = series.points ?? this.points
    if (points === 'only') {
      // Solid dots a little larger than a line's, so a flagged point reads over the line it sits on.
      return {
        stroke,
        width: series.lineWidth ?? theme.lineWidth,
        paths: () => null,
        spanGaps: false,
        points: { show: true, size: theme.pointRadius * 3.2, fill: stroke },
      }
    }
    return {
      stroke,
      width: series.lineWidth ?? theme.lineWidth,
      paths: linePaths(this.curve),
      spanGaps: series.spanGaps ?? false,
      points: {
        show: points === 'none' ? false : points === 'always' ? true : undefined,
        size: theme.pointRadius * 2,
      },
    }
  }

  protected override decorateOptions(options: Options, context: ChartBuildContext): Options {
    if (!this.referenceLines?.length) return options
    if (referenceLines)
      return referenceLines.decorateReferenceLines(options, context, this, (expression, fallback) => this.themeController.resolveColor(expression, fallback))
    // First use on the page: draw without them, then rebuild once the module is in.
    referenceLinesLoad ??= import('./reference-lines.js').then((module) => (referenceLines = module))
    void referenceLinesLoad.then(() => this.requestUpdate('referenceLines', null))
    return options
  }

  protected override accessibleSummary(resolved?: ChartSeriesConfig[]): string {
    const summary = super.accessibleSummary(resolved)
    return referenceLines && !this.getAttribute('aria-label')?.trim()
      ? referenceLines.describeReferenceLines(summary, this, (value) => this.formatValue(value))
      : summary
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-line-chart': LineChart
  }
}
