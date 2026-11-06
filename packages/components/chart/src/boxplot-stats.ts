/**
 * The statistics behind `c2-boxplot-chart`: quartiles, whiskers and outliers from samples, and the model that pools a
 * chart's rows into one box per category and series. Plain functions with no DOM, so they run on a server and in a
 * unit test alike.
 */
import { getFieldValue } from '@c2n/core/data-helper.js'

/** How far a whisker reaches: `tukey` to the furthest sample within 1.5 × IQR of the box, `range` to the min and max. */
export type BoxplotWhiskers = 'tukey' | 'range'

/** The five numbers of one box, with what lies past its whiskers. */
export interface BoxSummary {
  /** Where the lower whisker ends. */
  min: number
  /** The first quartile: the box's lower edge. */
  q1: number
  median: number
  /** The third quartile: the box's upper edge. */
  q3: number
  /** Where the upper whisker ends. */
  max: number
  /** The values past the whiskers, ascending. Empty under `range` whiskers. */
  outliers: number[]
  /** The arithmetic mean, when it is known. */
  mean?: number
  /** How many samples the box summarises, when it is known. */
  count?: number
}

/** A box as the chart draws it: one category of one series. */
export interface BoxplotBox extends BoxSummary {
  /** The category, the row's `label-field` value. */
  label: string
  /** The category's position on the axis. */
  category: number
  /** The series' position among the chart's series. */
  seriesIndex: number
  /** Whether the box came from a summary object rather than samples. */
  given: boolean
}

/** The boxes of a chart, by category and series. */
export interface BoxplotModel {
  /** The categories, in order of first appearance. */
  categories: string[]
  /** `boxes[category][series]`, or `null` where that category has no value for the series. */
  boxes: (BoxplotBox | null)[][]
  /** Every box, category by category and series by series within each. */
  list: BoxplotBox[]
}

/**
 * The `p` quantile of ascending `sorted`, by linear interpolation between the closest ranks (R's type 7, NumPy's and
 * Excel's `PERCENTILE.INC` default): the value at rank `(n − 1) × p`, interpolated between its neighbours.
 */
export function quantile(sorted: readonly number[], p: number): number {
  const n = sorted.length
  if (n === 0) return Number.NaN
  if (n === 1) return sorted[0]
  const rank = (n - 1) * Math.min(1, Math.max(0, p))
  const low = Math.floor(rank)
  const high = Math.min(n - 1, low + 1)
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low)
}

/**
 * The box of a set of samples. Quartiles are interpolated (see {@link quantile}). Under `tukey` whiskers (the default)
 * each whisker ends at the furthest sample within 1.5 × IQR of its quartile, and the samples past that fence are the
 * outliers; under `range` the whiskers run from the smallest sample to the largest and there are no outliers.
 * Values that are not finite numbers are skipped; `null` when none is left.
 */
export function summarizeSamples(samples: readonly unknown[], options: { whiskers?: BoxplotWhiskers } = {}): BoxSummary | null {
  const values: number[] = []
  for (const sample of samples) {
    const value = typeof sample === 'number' ? sample : typeof sample === 'string' && sample.trim() !== '' ? Number(sample) : Number.NaN
    if (Number.isFinite(value)) values.push(value)
  }
  if (values.length === 0) return null
  values.sort((a, b) => a - b)
  const q1 = quantile(values, 0.25)
  const median = quantile(values, 0.5)
  const q3 = quantile(values, 0.75)
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const count = values.length
  const first = values[0]
  const last = values[values.length - 1]
  if (options.whiskers === 'range') return { min: first, q1, median, q3, max: last, outliers: [], mean, count }
  const reach = 1.5 * (q3 - q1)
  const low = q1 - reach
  const high = q3 + reach
  let min = q1
  let max = q3
  const outliers: number[] = []
  for (const value of values) {
    if (value < low || value > high) outliers.push(value)
    else {
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  return { min, q1, median, q3, max, outliers, mean, count }
}

const finite = (value: unknown): number | undefined => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN
  return Number.isFinite(number) ? number : undefined
}

/**
 * A precomputed box, `{ min, q1, median, q3, max, outliers?, mean?, count? }`, as a backend or a query returns it, or
 * `null` when one of the five numbers is missing. The five are put in order, so a swapped pair still draws a box.
 */
export function readSummary(value: unknown): BoxSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const five = [record.min, record.q1, record.median, record.q3, record.max].map(finite)
  if (five.some((item) => item === undefined)) return null
  const [min, q1, median, q3, max] = (five as number[]).sort((a, b) => a - b)
  const outliers = Array.isArray(record.outliers)
    ? record.outliers
        .map(finite)
        .filter((item): item is number => item !== undefined)
        .sort((a, b) => a - b)
    : []
  const summary: BoxSummary = { min, q1, median, q3, max, outliers }
  const mean = finite(record.mean)
  const count = finite(record.count)
  if (mean !== undefined) summary.mean = mean
  if (count !== undefined) summary.count = count
  return summary
}

/** What {@link buildBoxplotModel} reads besides the rows. */
export interface BoxplotModelOptions {
  /** The row field naming the category; empty gives each row its own, numbered from 1. */
  labelField: string
  /** The row fields of the series, in order. */
  fields: readonly string[]
  whiskers?: BoxplotWhiskers
}

/**
 * Pools rows into boxes. Each series field may hold one sample (a number: rows with the same label pool theirs, so
 * long-format data works as it is), the samples of the category (an array of numbers), or a summary object, drawn as
 * given; a category with a summary object ignores the samples of its other rows for that series.
 */
export function buildBoxplotModel(rows: readonly unknown[], options: BoxplotModelOptions): BoxplotModel {
  const categories: string[] = []
  const index = new Map<string, number>()
  const samples: number[][][] = []
  const summaries: (BoxSummary | null)[][] = []
  rows.forEach((row, position) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return
    const raw = options.labelField ? getFieldValue(row as Record<string, unknown>, options.labelField) : undefined
    const unlabelled = raw === undefined || raw === null || raw === ''
    const label = unlabelled ? String(position + 1) : String(raw)
    // An unlabelled row is its own category, keyed apart from every real label, so a row labelled `"2"` never pools with it.
    const key = unlabelled ? `\u0000${position}` : `\u0001${label}`
    let category = index.get(key)
    if (category === undefined) {
      category = categories.length
      index.set(key, category)
      categories.push(label)
      samples.push(options.fields.map(() => []))
      summaries.push(options.fields.map(() => null))
    }
    options.fields.forEach((field, seriesIndex) => {
      const value = getFieldValue(row as Record<string, unknown>, field)
      if (Array.isArray(value)) {
        for (const item of value) {
          const number = finite(item)
          if (number !== undefined) samples[category][seriesIndex].push(number)
        }
        return
      }
      if (value && typeof value === 'object') {
        summaries[category][seriesIndex] ??= readSummary(value)
        return
      }
      const number = finite(value)
      if (number !== undefined) samples[category][seriesIndex].push(number)
    })
  })
  const list: BoxplotBox[] = []
  const boxes = categories.map((label, category) =>
    options.fields.map((_field, seriesIndex) => {
      const given = summaries[category][seriesIndex]
      const summary = given ?? summarizeSamples(samples[category][seriesIndex], { whiskers: options.whiskers })
      if (!summary) return null
      const box: BoxplotBox = { ...summary, label, category, seriesIndex, given: given !== null }
      list.push(box)
      return box
    }),
  )
  return { categories, boxes, list }
}
