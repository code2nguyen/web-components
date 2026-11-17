/**
 * What the histogram draws over its bars: the density curve, the cumulative share line and the percentile markers.
 * Loaded with `import()` the first time a chart asks for one, so a plain histogram does not carry it.
 */
import type uPlot from 'uplot'
import { histogramPercentile, type HistogramModel } from './histogram-bins.js'

/** The share of a series' binned samples at or below each edge, in percent. */
export function histogramCumulative(model: HistogramModel, seriesIndex: number): number[] {
  const total = model.binned[seriesIndex] ?? 0
  let running = 0
  return model.edges.map((_edge, index) => {
    if (index > 0) running += model.bins[index - 1].counts[seriesIndex] ?? 0
    return total > 0 ? (running / total) * 100 : 0
  })
}

const DENSITY_POINTS = 128

/**
 * A Gaussian kernel density estimate of a series in count units (what a bin of the histogram's width would hold), as
 * `[x, y]` points across the bins, with Silverman's bandwidth. The samples are counted onto a fine grid first, so the
 * cost past that one pass does not grow with their number. Empty when the samples have no spread.
 */
export function histogramDensity(model: HistogramModel, seriesIndex: number): [number, number][] {
  const samples = model.sorted[seriesIndex] ?? []
  const n = samples.length
  const first = model.edges[0]
  const last = model.edges[model.edges.length - 1]
  if (n < 2 || !(last > first)) return []
  let mean = 0
  samples.forEach((sample, index) => (mean += (sample - mean) / (index + 1)))
  const deviation = Math.sqrt(samples.reduce((sum, sample) => sum + (sample - mean) ** 2, 0) / (n - 1))
  const spread = (histogramPercentile(model, seriesIndex, 75) - histogramPercentile(model, seriesIndex, 25)) / 1.34
  const bandwidth = 0.9 * (spread > 0 ? Math.min(deviation, spread) : deviation) * n ** -0.2
  if (!(bandwidth > 0)) return []

  const gap = (last - first) / (DENSITY_POINTS - 1)
  const grid = new Float64Array(DENSITY_POINTS)
  for (const sample of samples) {
    const cell = Math.round((sample - first) / gap)
    if (cell >= 0 && cell < DENSITY_POINTS) grid[cell] += 1
  }
  const scale = model.step / (bandwidth * Math.sqrt(2 * Math.PI))
  const reach = Math.ceil((4 * bandwidth) / gap)
  return Array.from({ length: DENSITY_POINTS }, (_point, point) => {
    let sum = 0
    for (let cell = Math.max(0, point - reach); cell <= Math.min(DENSITY_POINTS - 1, point + reach); cell += 1) {
      const distance = ((point - cell) * gap) / bandwidth
      if (grid[cell]) sum += grid[cell] * Math.exp(-0.5 * distance * distance)
    }
    return [first + point * gap, sum * scale]
  })
}

/** Everything {@link drawHistogramOverlay} needs from the chart. */
export interface HistogramOverlayRequest {
  model: HistogramModel
  density: boolean
  cumulative: boolean
  /** The percentiles to mark, 0–100. */
  marks: number[]
  horizontal: boolean
  /** Per series: its colour, or `undefined` for the single-series overlay and marker colours below. */
  colors: (string | undefined)[]
  /** Per series: the y scale its density is drawn against. */
  scales: string[]
  /** The 0–100 scale the cumulative share is drawn against. */
  cumulativeScale: string
  /** Per series: its opacity (dimmed while another is highlighted). */
  alphas: number[]
  overlayColor: string
  overlayWidth: number
  percentileColor: string
  percentileWidth: number
  font: string
  /** The canvas height of one label line. */
  lineHeight: number
  /** A marker's label, such as `p90`. */
  label: (p: number) => string
}

/** Draws the overlay lines and the percentile markers over the bars, clipped to the plot. */
export function drawHistogramOverlay(self: uPlot, request: HistogramOverlayRequest): void {
  const { model, horizontal, marks } = request
  const ratio = devicePixelRatio
  const ctx = self.ctx
  const { left, top, width, height } = self.bbox
  const at = (x: number, y: number, scale: string): [number, number] =>
    horizontal ? [self.valToPos(y, scale, true), self.valToPos(x, 'x', true)] : [self.valToPos(x, 'x', true), self.valToPos(y, scale, true)]

  ctx.save()
  ctx.beginPath()
  ctx.rect(left, top, width, height)
  ctx.clip()
  ctx.font = request.font
  let shown = 0
  request.colors.forEach((color, index) => {
    if (self.series[index + 1]?.show === false) return
    ctx.globalAlpha = request.alphas[index] ?? 1
    const points = request.density
      ? histogramDensity(model, index).map(([x, y]) => at(x, y, request.scales[index] ?? 'y'))
      : request.cumulative
        ? histogramCumulative(model, index).map((share, edge) => at(model.edges[edge], share, request.cumulativeScale))
        : []
    if (points.length > 1) {
      ctx.beginPath()
      points.forEach(([x, y], point) => (point ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.strokeStyle = color ?? request.overlayColor
      ctx.lineWidth = request.overlayWidth * ratio
      ctx.lineJoin = 'round'
      ctx.setLineDash([])
      ctx.stroke()
    }
    if (!marks.length) return
    ctx.strokeStyle = ctx.fillStyle = color ?? request.percentileColor
    ctx.lineWidth = request.percentileWidth * ratio
    ctx.setLineDash([4 * ratio, 3 * ratio])
    // Each series' labels take their own line, so two series' markers at one value stay readable.
    const offset = request.lineHeight * shown
    for (const p of marks) {
      const value = histogramPercentile(model, index, p)
      if (!Number.isFinite(value)) continue
      const position = self.valToPos(value, 'x', true)
      ctx.beginPath()
      if (horizontal) {
        ctx.moveTo(left, position)
        ctx.lineTo(left + width, position)
        ctx.textAlign = 'right'
        ctx.textBaseline = 'bottom'
        ctx.fillText(request.label(p), left + width - 4 * ratio, position - 2 * ratio - offset)
      } else {
        ctx.moveTo(position, top)
        ctx.lineTo(position, top + height)
        // A marker near the right edge puts its label on its left, inside the plot, rather than clipped by the canvas.
        const label = request.label(p)
        const flip = position + 4 * ratio + ctx.measureText(label).width > left + width
        ctx.textAlign = flip ? 'right' : 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(label, flip ? position - 4 * ratio : position + 4 * ratio, top + 2 * ratio + offset)
      }
      ctx.stroke()
    }
    shown += 1
  })
  ctx.restore()
}
