/**
 * The package barrel: registers every chart tag and re-exports the public API.
 *
 * Importing a single chart (`@c2n/components/chart/line-chart`) registers only that tag and pulls in only that
 * engine; this entry exists for an application that wants them all.
 */
import './line-chart.js'
import './area-chart.js'
import './bar-chart.js'
import './sparkline.js'
import './pie-chart.js'
import './gauge-chart.js'
import './radar-chart.js'
import './pyramid-chart.js'
import './butterfly-chart.js'
import './scatter-chart.js'
import './bubble-chart.js'
import './candlestick-chart.js'
import './overlap-chart.js'
import './map-chart.js'
import './map-layer.js'
import './chart-series.js'
import './chart-legend.js'
import './chart-tooltip.js'

export { ChartBase, type ChartEventMap, type ChartLegendChangeEventDetail, type ChartLegendItem, type ChartSeriesHighlightEventDetail } from './chart-base.js'
export { UplotChartBase, type UplotSeriesStyle } from './uplot-chart-base.js'
export { EchartsChartBase } from './echarts-chart-base.js'
export { LineChart } from './line-chart.js'
export { AreaChart } from './area-chart.js'
export { BarChart } from './bar-chart.js'
export { Sparkline } from './sparkline.js'
export { PieChart } from './pie-chart.js'
export { GaugeChart } from './gauge-chart.js'
export { RadarChart } from './radar-chart.js'
export { PyramidChart } from './pyramid-chart.js'
export { ButterflyChart } from './butterfly-chart.js'
export type { PyramidSizing, PyramidSort } from './pyramid-layout.js'
export { ScatterChart } from './scatter-chart.js'
export { BubbleChart } from './bubble-chart.js'
export { CandlestickChart } from './candlestick-chart.js'
export { OverlapChart, type OverlapChartEventMap, type OverlapSelectionChangeEventDetail } from './overlap-chart.js'
export {
  OVERLAP_MAX_SETS,
  fitOverlap,
  overlapRegions,
  regionPath,
  solveOverlap,
  type OverlapCircle,
  type OverlapLayoutMode,
  type OverlapRegion,
  type OverlapRow,
} from './overlap-layout.js'
export {
  MapChart,
  geodesic,
  type MapChartEventMap,
  type MapGeometryInput,
  type MapName,
  type MapRegion,
  type MapSelectionChangeEventDetail,
  type MapUnmatchedRowsEventDetail,
  type MapViewChangeEventDetail,
} from './map-chart.js'
export { MapLayer, MAP_LAYER_CHANGE_EVENT, type MapLayerConfig } from './map-layer.js'
export { createMapScale, mixColors, type MapScale, type MapScaleOptions } from './map-scale.js'
export type { MapFeature, MapFeatureProperties, MapProjection, MapSource } from './maps/map-source.js'
export { ChartSeries, SERIES_CHANGE_EVENT } from './chart-series.js'
export { ChartLegend } from './chart-legend.js'
export { ChartTooltip } from './chart-tooltip.js'
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
