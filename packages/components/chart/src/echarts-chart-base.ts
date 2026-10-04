import { property } from '@c2n/core/lit-helper.js'
import { ChartBase } from './chart-base.js'
import type { ChartAdapter, ChartBuildContext } from './chart-adapter.js'
import { createEchartsAdapter, type EchartsOptions } from './engines/echarts-adapter.js'
import type { EchartsFeature } from './engines/echarts-loader.js'
import type { ChartFrame } from './chart-types.js'

/** Multiplies the opacity of every style block a series option can carry. */
export function dimSeries(option: Record<string, unknown>, opacity: number): Record<string, unknown> {
  const dimmed: Record<string, unknown> = { ...option }
  for (const key of ['itemStyle', 'lineStyle', 'areaStyle', 'label']) {
    const style = option[key] as { opacity?: number } | undefined
    if (key === 'areaStyle' && !style) continue
    dimmed[key] = { ...style, opacity: (style?.opacity ?? 1) * opacity }
  }
  return dimmed
}

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

  /** Whether engine updates wait for the next frame. See `createEchartsAdapter`; a chart turns it off only for a reason. */
  protected readonly lazyEngineUpdates: boolean = true

  /** The ECharts modules this chart type needs registered. Keeps the rest of the library unloaded. */
  protected abstract readonly features: readonly EchartsFeature[]

  /** The option object for one series. */
  protected abstract seriesOption(index: number, context: ChartBuildContext): Record<string, unknown>

  /** Grid and axes for a cartesian chart. The pie and gauge charts override this to contribute neither. */
  protected coordinateSystem(context: ChartBuildContext): Record<string, unknown> {
    const { theme } = context
    const axisLine = { lineStyle: { color: theme.gridColor } }
    const axisLabel = { color: theme.axisColor, fontSize: theme.axisFontSize }
    // ECharts draws split lines on a value or time x axis by default, in its own light grey: theme them too.
    const splitLine = { lineStyle: { color: theme.gridColor, width: theme.gridWidth } }
    return {
      grid: { left: 48, right: 16, top: 16, bottom: 32, containLabel: false },
      xAxis: { type: this.xType === 'time' ? 'time' : this.xType === 'category' ? 'category' : 'value', axisLine, axisLabel, splitLine, data: context.labels },
      yAxis: { type: 'value', axisLine, axisLabel, splitLine },
    }
  }

  protected override createAdapter(): Promise<ChartAdapter> {
    // `legend` is always registered: hidden or not, `dispatchAction('legendUnSelect')` is the only public
    // way to toggle a series, so the component depends on the module even when it draws its own legend.
    return createEchartsAdapter([...this.features, 'legend'], this.renderer, this.lazyEngineUpdates) as unknown as Promise<ChartAdapter>
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
    const animate = this.animation === 'auto' && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const options: EchartsOptions = {
      animation: animate,
      animationDuration: animate ? 500 : 0,
      animationDurationUpdate: 0,
      animationEasing: 'cubicOut',
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
      series: series.map((item, index) => {
        const option: Record<string, unknown> = { name: item.label ?? item.field, ...this.seriesOption(index, context) }
        // A highlighted series comes forward (drawn on top, a heavier line) and the others fade back.
        if (context.highlighted < 0) return option
        if (index !== context.highlighted) return dimSeries(option, theme.dimmedOpacity)
        const lineStyle = option.lineStyle as { width?: number } | undefined
        return { ...option, z: 3, lineStyle: { ...lineStyle, width: (lineStyle?.width ?? theme.lineWidth) + 1 } }
      }),
    }
    return options
  }
}
