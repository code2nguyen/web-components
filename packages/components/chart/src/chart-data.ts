/**
 * Normalisation and projection: everything between "what the consumer handed us" and "what the engine
 * wants", and nothing else. No colour, no axis, no label formatting — those are presentation and live in
 * the elements.
 *
 * Two rules make the realtime path cheap:
 *
 * 1. Normalisation is keyed on the **identity** of the input, so re-assigning the same array never redoes
 *    it, and a 100 000-point dataset is never deep-compared.
 * 2. Appending writes into spare capacity and bumps `frame.revision`, so every projection cache below
 *    invalidates together without anything being rebuilt eagerly.
 */
import { getFieldValue } from '@c2n/core/data-helper.js'
import { isChartFrame, type ChartColumn, type ChartFrame, type ChartInput, type ChartRow, type ChartSeriesConfig } from './chart-types.js'

/** What the builder needs to read rows; all of it derived from the element's presentation properties. */
export interface NormalizeContext {
  /** Row field holding the x value. Empty means "use the row index". */
  xField: string
  /** Row field holding the category label, for categorical charts. */
  labelField: string
  /** The series, in draw order; only their `field` is read here. */
  series: ChartSeriesConfig[]
  /** Changing this forces a re-read of the same input array. */
  signature: string
}

/** Growth factor for the spare capacity an append writes into. */
const GROWTH = 1.5
/** Smallest buffer we bother allocating. */
const MIN_CAPACITY = 16

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return value.getTime()
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN
  if (!Number.isNaN(parsed) && typeof value === 'string' && /[-:TZ]/.test(value)) return parsed
  const coerced = Number(value)
  return Number.isFinite(coerced) ? coerced : null
}

/** True when every entry is a real number, which is what lets the column be a `Float64Array`. */
function isDense(values: (number | null)[]): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === null) return false
  return true
}

/**
 * Packs one column. Dense data becomes a `Float64Array` with spare capacity; anything with a hole stays a
 * plain array, because both engines detect a gap with `== null` and `NaN` in a typed array would be read
 * as a real value and wreck the scale range.
 */
function packColumn(values: (number | null)[], capacity: number): ChartColumn {
  if (!isDense(values)) {
    const column = values.slice()
    column.length = capacity
    return column
  }
  const column = new Float64Array(capacity)
  for (let index = 0; index < values.length; index += 1) column[index] = values[index] as number
  return column
}

function capacityFor(length: number): number {
  return Math.max(MIN_CAPACITY, Math.ceil(length * GROWTH))
}

function readLength(column: ChartColumn): number {
  return column.length
}

/** Reads one value out of a column, normalising the two representations to `number | null`. */
export function columnValue(column: ChartColumn, index: number): number | null {
  const value = column[index]
  return value === null || value === undefined || Number.isNaN(value) ? null : (value as number)
}

function growColumn(column: ChartColumn, capacity: number): ChartColumn {
  if (column instanceof Float64Array) {
    const next = new Float64Array(capacity)
    next.set(column)
    return next
  }
  const next = column.slice()
  next.length = capacity
  return next
}

/** A column that must now hold a `null` but is currently typed: widen it to a plain array. */
function widenColumn(column: ChartColumn, length: number): (number | null)[] {
  if (!(column instanceof Float64Array)) return column
  const next: (number | null)[] = new Array(column.length)
  for (let index = 0; index < length; index += 1) next[index] = column[index]
  return next
}

/**
 * Builds and caches the normalised form of whatever a consumer assigned, and owns the projections each
 * engine consumes. One instance per chart element.
 */
export class ChartFrameBuilder {
  /** Keyed on the input reference: assigning the same array twice never re-reads it. */
  #frames = new WeakMap<object, { frame: ChartFrame; signature: string }>()
  /** uPlot views, invalidated by `frame.revision`. */
  #uplot = new WeakMap<ChartFrame, { revision: number; length: number; view: unknown[] }>()
  /** ECharts views, invalidated by `frame.revision` and the requested shape. */
  #echarts = new WeakMap<ChartFrame, Map<string, { revision: number; length: number; view: unknown[] }>>()

  /**
   * Normalises `input` into a {@link ChartFrame}. Returns the *same* frame for the same input reference
   * and signature, so this is safe to call on every update.
   */
  build(input: ChartInput | undefined, context: NormalizeContext): ChartFrame | undefined {
    if (input === undefined || input === null) return undefined
    if (isChartFrame(input)) return input
    if (!Array.isArray(input) || input.length === 0) {
      return { x: new Float64Array(MIN_CAPACITY), columns: [], length: 0, capacity: MIN_CAPACITY, revision: 0 }
    }

    const cached = this.#frames.get(input as object)
    if (cached && cached.signature === context.signature) return cached.frame

    const frame = this.#normalize(input, context)
    this.#frames.set(input as object, { frame, signature: context.signature })
    return frame
  }

  #normalize(input: ChartInput, context: NormalizeContext): ChartFrame {
    const rows = input as unknown[]
    const first = rows[0]

    // `number[]` — one series against its own index. The sparkline shape.
    if (typeof first === 'number') {
      const values = rows as number[]
      const capacity = capacityFor(values.length)
      const x = new Float64Array(capacity)
      for (let index = 0; index < values.length; index += 1) x[index] = index
      return { x, columns: [packColumn(values.map(toNumber), capacity)], length: values.length, capacity, revision: 0 }
    }

    // Columnar: `[xs, ys1, ys2…]`.
    if (Array.isArray(first) || ArrayBuffer.isView(first)) {
      const columns = rows as ArrayLike<number>[]
      const length = columns.length > 0 ? readLength(columns[0] as unknown as ChartColumn) : 0
      const capacity = capacityFor(length)
      const read = (source: ArrayLike<number>) => {
        const values: (number | null)[] = new Array(length)
        for (let index = 0; index < length; index += 1) values[index] = toNumber(source[index])
        return packColumn(values, capacity)
      }
      return { x: read(columns[0]), columns: columns.slice(1).map(read), length, capacity, revision: 0 }
    }

    // Row objects.
    return this.#fromRows(rows as ChartRow[], context)
  }

  #fromRows(rows: ChartRow[], context: NormalizeContext): ChartFrame {
    const length = rows.length
    const capacity = capacityFor(length)
    const xValues: (number | null)[] = new Array(length)
    const labels: string[] = []
    let hasLabels = false

    for (let index = 0; index < length; index += 1) {
      const row = rows[index]
      xValues[index] = context.xField ? toNumber(getFieldValue(row, context.xField)) : index
      if (context.labelField) {
        const label = getFieldValue(row, context.labelField)
        if (label !== undefined && label !== null) {
          labels[index] = String(label)
          hasLabels = true
        }
      }
    }

    // A categorical x (no usable x field, or labels present) falls back to the row index so the engines
    // still get a monotonic scale; the labels carry the meaning.
    for (let index = 0; index < length; index += 1) if (xValues[index] === null) xValues[index] = index

    const fields = context.series.length > 0 ? context.series.map((series) => series.field) : inferFields(rows, context)
    const columns = fields.map((field) => {
      const values: (number | null)[] = new Array(length)
      for (let index = 0; index < length; index += 1) values[index] = toNumber(getFieldValue(rows[index], field))
      return packColumn(values, capacity)
    })

    const frame: ChartFrame = { x: packColumn(xValues, capacity), columns, length, capacity, revision: 0 }
    if (hasLabels) frame.labels = labels
    return frame
  }

  /**
   * Appends one x and one value per series in place. Grows geometrically, and drops the oldest points once
   * `maxPoints` is reached, so a streaming chart holds a bounded ring rather than an unbounded array.
   */
  push(frame: ChartFrame, x: number, values: readonly (number | null)[], maxPoints: number): void {
    if (frame.columns.length === 0 && values.length > 0) {
      frame.columns = values.map(() => new Float64Array(frame.capacity))
    }
    if (frame.length >= frame.capacity) {
      const capacity = capacityFor(frame.length + 1)
      frame.x = growColumn(frame.x, capacity)
      frame.columns = frame.columns.map((column) => growColumn(column, capacity))
      frame.capacity = capacity
    }

    const at = frame.length
    writeAt(frame, 'x', at, x)
    for (let index = 0; index < frame.columns.length; index += 1) {
      const value = values[index] ?? null
      if (value === null) frame.columns[index] = widenColumn(frame.columns[index], at)
      frame.columns[index][at] = value as number
    }
    frame.length += 1

    if (maxPoints > 0 && frame.length > maxPoints) this.#trim(frame, frame.length - maxPoints)
    frame.revision += 1
  }

  /** Drops `count` points off the front, keeping the buffers and their capacity. */
  #trim(frame: ChartFrame, count: number): void {
    const remaining = frame.length - count
    shiftLeft(frame.x, count, remaining)
    for (const column of frame.columns) shiftLeft(column, count, remaining)
    if (frame.labels) frame.labels.splice(0, count)
    frame.length = remaining
  }

  /**
   * uPlot's view: `[xs, ys…]` sliced to `length`. A typed column becomes a `subarray`, which is a view
   * over the same buffer and costs nothing.
   */
  uplotView(frame: ChartFrame): unknown[] {
    const hit = this.#uplot.get(frame)
    if (hit && hit.revision === frame.revision && hit.length === frame.length) return hit.view
    const view = [sliceColumn(frame.x, frame.length), ...frame.columns.map((column) => sliceColumn(column, frame.length))]
    this.#uplot.set(frame, { revision: frame.revision, length: frame.length, view })
    return view
  }

  /**
   * ECharts' view, one array per series. `pairs` is `[[x, y], …]` for the cartesian charts, `named` is
   * `[{ name, value }, …]` for the ones whose marks are labelled rather than positioned (pie, gauge), and
   * `values` is a bare value list.
   */
  echartsView(frame: ChartFrame, shape: 'pairs' | 'values' | 'named'): unknown[] {
    let perShape = this.#echarts.get(frame)
    if (!perShape) {
      perShape = new Map()
      this.#echarts.set(frame, perShape)
    }
    const hit = perShape.get(shape)
    if (hit && hit.revision === frame.revision && hit.length === frame.length) return hit.view

    const view = frame.columns.map((column) => {
      const out: unknown[] = new Array(frame.length)
      for (let index = 0; index < frame.length; index += 1) {
        const value = columnValue(column, index)
        if (shape === 'pairs') out[index] = [columnValue(frame.x, index), value]
        else if (shape === 'named') out[index] = { name: frame.labels?.[index] ?? String(index), value }
        else out[index] = value
      }
      return out
    })
    perShape.set(shape, { revision: frame.revision, length: frame.length, view })
    return view
  }
}

/** Writes into `x` through the same widening rule the y columns use. */
function writeAt(frame: ChartFrame, key: 'x', index: number, value: number | null): void {
  if (value === null) frame[key] = widenColumn(frame[key], index)
  frame[key][index] = value as number
}

function shiftLeft(column: ChartColumn, count: number, remaining: number): void {
  if (column instanceof Float64Array) {
    column.copyWithin(0, count, count + remaining)
    return
  }
  for (let index = 0; index < remaining; index += 1) column[index] = column[index + count]
}

function sliceColumn(column: ChartColumn, length: number): ChartColumn {
  if (column instanceof Float64Array) return column.subarray(0, length)
  return column.slice(0, length)
}

/**
 * Every numeric key of the first row except the ones already spoken for by the x and label fields.
 *
 * Only a fallback: the element normally resolves the series first and passes them in. Plotting the x field
 * as a series is the bug this guards against.
 */
function inferFields(rows: ChartRow[], context: NormalizeContext): string[] {
  const row = rows[0] ?? {}
  return Object.keys(row).filter((key) => typeof row[key] === 'number' && key !== context.xField && key !== context.labelField)
}
