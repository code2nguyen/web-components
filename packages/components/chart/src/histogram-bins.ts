/** The histogram's binning as plain functions, free of the DOM, so the figures can be computed outside the chart. */

/** How the samples are cut. With nothing set, the bins follow Sturges' rule on a nice width. */
export interface HistogramBinOptions {
  /** Roughly how many bins; the width is rounded to 1, 2, 2.5 or 5 times a power of ten. */
  count?: number
  /** The width of every bin. Wins over `count`. */
  width?: number
  /** Where the first bin starts; samples below it are left out. */
  start?: number
  /** Where the last bin ends; samples above it are left out. */
  end?: number
}

/** One bin: its edges and one count per series. The last bin includes its upper edge. */
export interface HistogramBin {
  from: number
  to: number
  counts: number[]
}

export interface HistogramModel {
  bins: HistogramBin[]
  /** The bin edges, one more than the bins. */
  edges: number[]
  step: number
  /** Each series' samples, ascending. */
  sorted: number[][]
  /** How many samples of each series fall inside the bins. */
  binned: number[]
}

const MAX_BINS = 1000

/** Rounds away float noise, so an edge prints as `0.3`, not `0.30000000000000004`. */
const tidy = (value: number): number => Number(value.toPrecision(12))

export function niceStep(span: number, count: number): number {
  const raw = span / Math.max(1, count)
  if (!(raw > 0) || !Number.isFinite(raw)) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  const ratio = raw / power
  return tidy((ratio <= 1 ? 1 : ratio <= 2 ? 2 : ratio <= 2.5 ? 2.5 : ratio <= 5 ? 5 : 10) * power)
}

/** Adds the finite samples of a value (a number, a numeric string, or an array of them) to `into`. */
export function collectSamples(value: unknown, into: number[]): void {
  for (const item of Array.isArray(value) ? value : [value]) {
    const sample = typeof item === 'number' ? item : typeof item === 'string' && item.trim() !== '' ? Number(item) : Number.NaN
    if (Number.isFinite(sample)) into.push(sample)
  }
}

/** Cuts the samples of every series into one shared set of bins, so the bars of several series line up. */
export function binHistogram(series: readonly (readonly number[])[], options: HistogramBinOptions = {}): HistogramModel {
  const sorted = series.map((samples) => [...samples].sort((a, b) => a - b))
  const total = sorted.reduce((sum, samples) => sum + samples.length, 0)
  const min = Math.min(...sorted.map((samples) => samples[0] ?? Infinity))
  const max = Math.max(...sorted.map((samples) => samples[samples.length - 1] ?? -Infinity))
  const hasStart = Number.isFinite(options.start)
  const hasEnd = Number.isFinite(options.end)
  const low = hasStart ? (options.start as number) : min
  const high = hasEnd ? (options.end as number) : max
  const binned = sorted.map(() => 0)
  if (!total || !(high >= low)) return { bins: [], edges: [], step: 0, sorted, binned }

  const span = high - low
  let step =
    (options.width ?? 0) > 0
      ? (options.width as number)
      : niceStep(span, (options.count ?? 0) > 0 ? (options.count as number) : Math.ceil(Math.log2(total)) + 1)
  if (span / step > MAX_BINS) step = niceStep(span, MAX_BINS)
  const start = hasStart ? low : tidy(Math.floor(low / step) * step)
  let count = Math.max(1, Math.ceil(tidy((high - start) / step)))
  if (!hasEnd && tidy(start + count * step) < max) count += 1
  const edges = Array.from({ length: count + 1 }, (_, index) => tidy(start + index * step))
  if (hasEnd) edges[count] = high
  const end = edges[count]

  const bins = edges.slice(1).map((to, index) => ({ from: edges[index], to, counts: sorted.map(() => 0) }))
  sorted.forEach((samples, seriesIndex) => {
    for (const sample of samples) {
      if (sample < start || sample > end) continue
      let index = Math.min(count - 1, Math.floor((sample - start) / step))
      // Division can put a sample on an edge one bin off (0.3 / 0.1 is 2.999…).
      while (index < count - 1 && sample >= edges[index + 1]) index += 1
      while (index > 0 && sample < edges[index]) index -= 1
      bins[index].counts[seriesIndex] += 1
      binned[seriesIndex] += 1
    }
  })
  return { bins, edges, step, sorted, binned }
}

/** The `p`th percentile (0–100) of a series' samples, interpolated linearly (R-7, the NumPy default); `NaN` without samples. */
export function histogramPercentile(model: HistogramModel, seriesIndex: number, p: number): number {
  const sorted = model.sorted[seriesIndex] ?? []
  if (!sorted.length) return Number.NaN
  const rank = (sorted.length - 1) * Math.min(1, Math.max(0, p / 100))
  const low = Math.floor(rank)
  return sorted[low] + ((sorted[Math.min(sorted.length - 1, low + 1)] ?? 0) - sorted[low]) * (rank - low)
}
