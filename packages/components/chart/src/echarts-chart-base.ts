import { property } from 'lit/decorators.js'
import { ChartBase } from './chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import { createEchartsAdapter, type EchartsOptions } from './engines/echarts-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame } from './chart-types.js'

/**
 * The ECharts half of the hierarchy. A concrete chart declares the engine modules it needs and how one
 * series is configured; everything else — theme, text styles, the disabled built-in tooltip and legend —
 * is settled here.
 *
 * Defines no tag and is never registered.
 */
export abstract class EchartsChartBase extends ChartBase {
  protected override readonly engineName = 'echarts' as const

  /** Which ECharts renderer to use. SVG prints and scales crisply; canvas is faster with many marks. */
  @property({ type: String }) renderer: 'canvas' | 'svg' = 'canvas'

  /** The ECharts modules this chart type needs registered. Keeps the rest of the library unloaded. */
  protected abstract readonly features: readonly EchartsFeature[]

  /** The option object for one series. */
  protected abstract seriesOption(index: number, context: ChartBuildContext): Record<string, unknown>

  /** Grid and axes for a cartesian chart. The pie and gauge charts override this to contribute neither. */
  protected coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const axisLine = { lineStyle: { color: theme.gridColor } }
    const axisLabel = { color: theme.axisColor, fontSize: theme.fontSize }
    return {
      grid: { left: 48, right: 16, top: 16, bottom: 32, containLabel: false },
      xAxis: { type: this.xType === 'time' ? 'time' : this.xType === 'category' ? 'category' : 'value', axisLine, axisLabel, data: context.labels },
      yAxis: { type: 'value', axisLine, axisLabel, splitLine: { lineStyle: { color: theme.gridColor } } },
    }
  }

  protected override createAdapter(): Promise<ChartAdapter> {
    // `legend` is always registered: hidden or not, `dispatchAction('legendUnSelect')` is the only public
    // way to toggle a series, so the component depends on the module even when it draws its own legend.
    return createEchartsAdapter([...this.features, 'legend'], this.renderer) as unknown as Promise<ChartAdapter>
  }

  protected override projectData(frame: ChartFrame, context: ChartBuildContext): unknown {
    return this.frameBuilder.echartsView(frame, this.dataShape(context))
  }

  /** Cartesian charts want `[x, y]` pairs; the labelled ones want `{ name, value }`. */
  protected dataShape(_context: ChartBuildContext): 'pairs' | 'values' | 'named' {
    return 'pairs'
  }

  protected override buildOptions(context: ChartBuildContext): unknown {
    const { theme, series } = context
    const options: EchartsOptions = {
      animation: this.animation === 'auto',
      color: theme.palette,
      textStyle: {
        fontFamily: theme.fontFamily === 'inherit' ? undefined : theme.fontFamily,
        fontSize: theme.fontSize,
        color: theme.color,
      },
      // The tooltip key is omitted rather than disabled: naming a component at all makes ECharts require
      // its module, and the component draws its own tooltip in the shadow DOM. `legend` stays because
      // `dispatchAction('legendUnSelect')` is the only public way to toggle a series, so we register it.
      legend: { show: false },
      ...this.coordinateSystem(context),
      series: series.map((item, index) => ({
        name: item.label ?? item.field,
        ...this.seriesOption(index, context),
      })),
    }
    return options
  }
}
