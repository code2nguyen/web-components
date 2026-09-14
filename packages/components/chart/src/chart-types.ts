/**
 * Public data and configuration types shared by every `c2-*-chart` element.
 *
 * The split this file encodes is the point of the whole package: a {@link ChartSeriesConfig} describes
 * *presentation* (what a series looks like and which field it reads), while {@link ChartInput} and
 * {@link ChartDataSource} carry *data*. Nothing in the data path knows about colours, and nothing in the
 * presentation path knows about buffers, so a source can be reused unchanged across chart types.
 */

/** A row is any plain object; values are read by `field`, which may be a dotted path (`stats.cpu`). */
export type ChartRow = Record<string, unknown>

/**
 * One column per axis: `[xs, ys1, ys2, …]`. This is the shape uPlot draws natively, so handing it in
 * costs no conversion at all.
 */
export type ChartColumnarInput = ArrayLike<number>[]

/**
 * Everything a chart accepts as `data`:
 *
 * - `number[]` — one series against its own index, the convenient shape for a sparkline.
 * - {@link ChartRow}`[]` — row objects read through `x-field` and each series' `field`.
 * - {@link ChartColumnarInput} — already columnar.
 * - {@link ChartFrame} — already normalised, handed straight through.
 */
export type ChartInput = number[] | ChartRow[] | ChartColumnarInput | ChartFrame

/**
 * A column of y values. Dense numeric data is a `Float64Array` (the fast path: appending is O(1) and no
 * engine has to convert it). A column that contains holes falls back to a plain array, because both
 * engines detect a gap with `== null` and `NaN` inside a typed array would silently poison the scale
 * range instead.
 */
export type ChartColumn = Float64Array | (number | null)[]

/**
 * The normalised form every chart works with internally, produced once per input by `ChartFrameBuilder`.
 *
 * The buffers are deliberately longer than `length`: appending a realtime point writes into the spare
 * capacity and bumps {@link revision} instead of reallocating, which is what makes a streaming tick cost
 * nothing but the engine redraw.
 */
export interface ChartFrame {
  /** X values, ascending. A time chart stores epoch **milliseconds**. */
  x: ChartColumn
  /** One column per series, each at least `length` long. */
  columns: ChartColumn[]
  /** How many entries of `x` and each column are valid. */
  length: number
  /** Allocated capacity of the buffers; `length` grows into it. */
  capacity: number
  /** Bumped on every in-place mutation, so every derived projection cache invalidates at once. */
  revision: number
  /** Category labels, when the x axis is categorical (`x-type="category"`, pie, gauge). */
  labels?: string[]
}

/** Marks a value as a `ChartFrame` without an `instanceof` check surviving a bundler boundary. */
export function isChartFrame(value: unknown): value is ChartFrame {
  return typeof value === 'object' && value !== null && 'columns' in value && 'length' in value && 'revision' in value
}

/**
 * One series: which field it reads and how it is drawn. Everything here is presentation except `field`,
 * which is the single point where a series touches the data.
 */
export interface ChartSeriesConfig {
  /** Key of the value in the row object; may be a dotted path such as `stats.cpu`. */
  field: string
  /** Legend and tooltip label. Falls back to the field name. */
  label?: string
  /** Explicit colour. Falls back to the palette slot for this series' index. */
  color?: string
  /** Stroke width in pixels; falls back to `--c2-chart__line--width`. */
  lineWidth?: number
  /** Draws the series against the secondary (right-hand) axis. */
  axis?: 'left' | 'right'
  /** Joins across gaps instead of breaking the line. */
  spanGaps?: boolean
  /** Leaves the series out without removing the definition. */
  hidden?: boolean
  /** Formats a value for the tooltip and the axis. Property only — no attribute equivalent. */
  format?: (value: number) => string
}

/** What the chart asks a {@link ChartDataSource} for. */
export interface ChartWindowRequest {
  /** Inclusive x domain the chart needs. Absent on the first load. */
  xMin?: number
  xMax?: number
  /** Points the chart can usefully draw at its current width; a source may decimate to this server-side. */
  maxPoints: number
  /** Aborted when the user keeps panning and this window is no longer wanted. */
  signal: AbortSignal
}

/** What a {@link ChartDataSource} returns. */
export interface ChartWindowResult {
  data: ChartInput
  /** Full domain of the dataset, so the chart can size its x scale before it holds every point. */
  domain?: { min: number; max: number }
}

/**
 * Lazy point source — the chart's equivalent of `TableDataSource`, used instead of `data`.
 *
 * `getWindow` is the pull half (first load, zoom, pan). `subscribe` is the push half: a tick handed to
 * the listener lands straight in the frame's spare capacity and redraws without a Lit update.
 */
export interface ChartDataSource {
  getWindow(request: ChartWindowRequest): Promise<ChartWindowResult>
  subscribe?(listener: (x: number, values: readonly (number | null)[]) => void): () => void
}

/** Identifies one datum, shared by the hover and click event details. */
export interface ChartPointEventDetail {
  /** Index of the point within the series. */
  index: number
  /** Index of the series the point belongs to. */
  seriesIndex: number
  /** The series definition. */
  series: ChartSeriesConfig
  /** The x value; epoch milliseconds on a time chart. */
  x: number
  /** The y value, or `null` at a gap. */
  y: number | null
  /** The category label, when the chart is categorical. */
  label?: string
}

/** One row of the tooltip: a series and its value at the hovered index. */
export interface ChartTooltipEntry {
  seriesIndex: number
  series: ChartSeriesConfig
  value: number | null
  /** `value` run through the series' `format`, or the chart's number formatter. */
  formatted: string
  color: string
}

/** What the tooltip slot and `renderTooltip` are handed. */
export interface ChartTooltipContext {
  /** Index of the hovered point. */
  index: number
  /** The hovered x value; epoch milliseconds on a time chart. */
  x: number
  /** `x` formatted for display. */
  formattedX: string
  /** Every visible series at this index, in draw order. */
  entries: ChartTooltipEntry[]
  /** Position within the plot area, in CSS pixels. */
  px: number
  py: number
}

/** Detail of the `range-change` event. */
export interface ChartRangeEventDetail {
  /** New lower bound of the x scale. */
  min: number
  /** New upper bound of the x scale. */
  max: number
}

/** Detail of the `series-toggle` event. */
export interface ChartSeriesToggleEventDetail {
  seriesIndex: number
  series: ChartSeriesConfig
  /** Whether the series is visible after the toggle. */
  visible: boolean
  /** Indices of every series now hidden. */
  hidden: number[]
}

/** Reads a possibly dotted `field` path out of a row. Re-exported so the package keeps its own subpath. */
export { getFieldValue } from '@c2n/core/data-helper.js'
