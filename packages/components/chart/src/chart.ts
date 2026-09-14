/**
 * The package barrel: registers every chart tag and re-exports the public API.
 *
 * Importing a single chart (`@c2n/chart/line-chart.js`) registers only that tag and pulls in only that
 * engine; this entry exists for an application that wants them all.
 */
import './line-chart.js'
import './area-chart.js'
import './bar-chart.js'
import './sparkline.js'
import './pie-chart.js'
import './chart-series.js'

export { ChartBase, type ChartEventMap } from './chart-base.js'
export { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
export { EchartsChartBase } from './echarts-chart-base.js'
export { LineChart } from './line-chart.js'
export { AreaChart } from './area-chart.js'
export { BarChart } from './bar-chart.js'
export { Sparkline } from './sparkline.js'
export { PieChart } from './pie-chart.js'
export { ChartSeries, SERIES_CHANGE_EVENT } from './chart-series.js'
export { ChartFrameBuilder, columnValue, type NormalizeContext } from './chart-data.js'
export { ChartThemeController, PALETTE_SIZE, PROBE_COLORS, type ChartTheme } from './chart-theme.js'
export type { ChartAdapter, ChartAdapterEvents, ChartBuildContext } from './chart-adapter.js'
export type {
  ChartColumn,
  ChartColumnarInput,
  ChartDataSource,
  ChartFrame,
  ChartInput,
  ChartPointEventDetail,
  ChartRangeEventDetail,
  ChartRow,
  ChartSeriesConfig,
  ChartSeriesToggleEventDetail,
  ChartTooltipContext,
  ChartTooltipEntry,
  ChartWindowRequest,
  ChartWindowResult,
} from './chart-types.js'
export { isChartFrame } from './chart-types.js'
