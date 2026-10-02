/**
 * Path builders, memoised per curve.
 *
 * uPlot exposes its builders as factories that must be created once and reused: a fresh builder on every
 * option rebuild defeats its internal caching. They also live on the constructor, so they are only
 * reachable after the engine has loaded — hence the lazy lookup and the module-level cache.
 */
import type uPlot from 'uplot'
import type { Series } from 'uplot'
import { loadedUplot } from './uplot-loader.js'

export type ChartCurve = 'linear' | 'smooth' | 'step'

const cache = new Map<ChartCurve, Series.PathBuilder | undefined>()

/**
 * The path builder for a curve, or `undefined` for `linear` — uPlot's default is already a straight line,
 * and passing `undefined` keeps the fastest path.
 */
export function linePaths(curve: ChartCurve): Series.PathBuilder | undefined {
  if (curve === 'linear') return undefined
  if (cache.has(curve)) return cache.get(curve)

  // Read synchronously: an option object is built inside an adapter that already awaited the engine, and a
  // builder resolved a microtask later would arrive after uPlot had already read `paths` — every chart
  // would draw its first frame straight, and `curve` would only take effect on a later rebuild.
  const paths = loadedUplot()?.paths
  if (!paths) return undefined

  const builder = curve === 'smooth' ? paths.spline?.() : paths.stepped?.({ align: 1 })
  cache.set(curve, builder)
  return builder
}

/**
 * Applies an alpha to a resolved colour, for the fill under an area series.
 *
 * The theme controller always hands back a computed `rgb(…)` or `rgba(…)`, so this only has to handle those
 * two plus a hex literal a consumer may have set directly on a series.
 */
export function withAlpha(color: string, alpha: number): string {
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color.trim())
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((part) => part.trim())
    const [r, g, b] = parts
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (hex) {
    const value = parseInt(hex[1], 16)
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
  }
  return color
}

const barCache = new Map<string, Series.PathBuilder | undefined>()

/** uPlot's `BarsPathBuilderFacetUnit.ScaleValue`, which is a `const enum` and so cannot be imported here. */
const SCALE_VALUE = 1 as Series.BarsPathBuilderFacet['unit']

/**
 * The bars path builder for one series of a chart: `width` is the share of the band the whole group takes
 * and `gap` the share of each bar's slot given up to the gutter between grouped bars. Memoised on all four
 * arguments, since uPlot wants one builder reused rather than a fresh one per option rebuild.
 *
 * uPlot draws every series' bars on the same x, so a second series would sit exactly on top of the first.
 * Grouping is therefore ours to do: `disp` gives uPlot an explicit left edge and width per bar — in data
 * units, which is what it reads when no `unit` is set — placing each series in its own slot of the band.
 */
export function barPaths(width: number, gap: number, index: number, count: number, radius = 0): Series.PathBuilder | undefined {
  const key = `${width}:${gap}:${index}:${count}:${radius}`
  if (barCache.has(key)) return barCache.get(key)

  // Synchronous for the same reason as {@link linePaths}: a bar chart whose builder arrives one microtask
  // late draws its first frame as a line.
  const paths = loadedUplot()?.paths
  if (!paths) return undefined

  // `size[2]` is uPlot's minimum bar width in pixels, not a gap: one pixel, so a dense chart still paints.
  const size: [number, number, number] = [width, Infinity, 1]
  // uPlot expresses the corner radius as a share of the bar width. A tuple rounds only the value end,
  // keeping the baseline square so adjacent positive and negative bars still meet the axis cleanly.
  const roundedEnd: Series.BarsPathBuilderRadii = [radius, 0]
  const builder =
    count > 1
      ? paths.bars?.({
          size,
          radius: roundedEnd,
          disp: {
            // `unit: 1` is uPlot's "scale value": the numbers below are x values, not pixels or percentages.
            x0: { unit: SCALE_VALUE, values: (self) => layout(self, width, gap, count).left(index) },
            size: { unit: SCALE_VALUE, values: (self) => [layout(self, width, gap, count).barWidth] },
          },
        })
      : paths.bars?.({ size, radius: roundedEnd })

  barCache.set(key, builder)
  return builder
}

/** One group's geometry in data units, derived from the band width the x values themselves imply. */
export function layout(self: uPlot, width: number, gap: number, count: number) {
  const xs = self.data[0] as unknown as number[]
  const band = bandStep(xs) * width
  const slot = band / count
  return {
    barWidth: slot * (1 - gap),
    /** Left edge of series `index`'s bar at every x, centred on the band with the gutter split evenly. */
    left: (index: number) => xs.map((x) => x - band / 2 + index * slot + (slot * gap) / 2),
  }
}

/** Width of one band: the smallest gap between adjacent x values, which is how uPlot sizes bars itself. */
export function bandStep(xs: readonly number[]): number {
  let smallest = Infinity
  for (let index = 1; index < xs.length; index += 1) {
    const delta = Math.abs(xs[index] - xs[index - 1])
    if (delta > 0 && delta < smallest) smallest = delta
  }
  return Number.isFinite(smallest) ? smallest : 1
}

/** How a bar chart's series combine within a band. */
export type BarStack = 'none' | 'normal' | 'percent'

/** Both ends of every stacked segment, per engine series index (index 0, the x values, is left empty). */
export interface StackExtents {
  y0: (number | null)[][]
  y1: (number | null)[][]
}

const stackCache = new WeakMap<uPlot, { data: unknown; signature: string; extents: StackExtents }>()

/**
 * The stacked segments of the series uPlot currently shows, read from the instance itself so a legend toggle
 * re-stacks the remaining series without touching the data. Positive values stack upwards from zero and negative
 * ones downwards, each on its own running total, so a mixed-sign series never draws across the other stack.
 * `percent` divides every segment by the band's absolute total, which makes each band 100 high.
 *
 * Memoised on the instance's data array and visibility: the path builder, the scale range, the hit test and the
 * labels all ask for it during one redraw.
 */
export function stackExtents(self: uPlot, mode: BarStack): StackExtents {
  const signature = `${mode}:${self.series.map((series) => (series.show === false ? 0 : 1)).join('')}`
  const hit = stackCache.get(self)
  if (hit && hit.data === self.data && hit.signature === signature) return hit.extents

  const columns = self.data as unknown as ((number | null | undefined)[] | undefined)[]
  const length = (columns[0] ?? []).length
  const y0: (number | null)[][] = [[]]
  const y1: (number | null)[][] = [[]]
  const positive = new Array<number>(length).fill(0)
  const negative = new Array<number>(length).fill(0)
  const total = new Array<number>(length).fill(0)

  if (mode === 'percent') {
    for (let seriesIndex = 1; seriesIndex < columns.length; seriesIndex += 1) {
      if (self.series[seriesIndex]?.show === false) continue
      const column = columns[seriesIndex] ?? []
      for (let index = 0; index < length; index += 1) total[index] += Math.abs(Number(column[index] ?? 0) || 0)
    }
  }

  for (let seriesIndex = 1; seriesIndex < columns.length; seriesIndex += 1) {
    const column = columns[seriesIndex] ?? []
    const starts: (number | null)[] = new Array(length).fill(null)
    const ends: (number | null)[] = new Array(length).fill(null)
    if (self.series[seriesIndex]?.show !== false) {
      for (let index = 0; index < length; index += 1) {
        const raw = column[index]
        if (raw === null || raw === undefined || !Number.isFinite(raw)) continue
        const value = mode === 'percent' ? (total[index] > 0 ? (raw / total[index]) * 100 : 0) : raw
        const running = value < 0 ? negative : positive
        starts[index] = running[index]
        running[index] += value
        ends[index] = running[index]
      }
    }
    y0.push(starts)
    y1.push(ends)
  }

  const extents = { y0, y1 }
  stackCache.set(self, { data: self.data, signature, extents })
  return extents
}

/** The smallest and largest stacked end across the shown series, always including the zero baseline. */
export function stackRange(self: uPlot, mode: BarStack): [number, number] {
  const { y1 } = stackExtents(self, mode)
  let low = 0
  let high = 0
  for (let seriesIndex = 1; seriesIndex < y1.length; seriesIndex += 1) {
    for (const value of y1[seriesIndex]) {
      if (value === null) continue
      if (value < low) low = value
      if (value > high) high = value
    }
  }
  return [low, high]
}

const stackedCache = new Map<string, Series.PathBuilder | undefined>()

/**
 * The bars path builder for a stacked series: every series fills the whole group width, and `disp.y0`/`disp.y1`
 * hand uPlot each segment's two ends from {@link stackExtents}. Only the outermost shown series rounds its value
 * end; a radius on every segment would notch the stack at each seam.
 */
export function stackedBarPaths(width: number, mode: BarStack, radius = 0): Series.PathBuilder | undefined {
  const key = `${width}:${mode}:${radius}`
  if (stackedCache.has(key)) return stackedCache.get(key)

  const paths = loadedUplot()?.paths
  if (!paths) return undefined

  const builder = paths.bars?.({
    size: [width, Infinity, 1],
    radius: (self, seriesIndex) => {
      let outermost = 0
      for (let index = self.series.length - 1; index > 0; index -= 1) {
        if (self.series[index]?.show !== false) {
          outermost = index
          break
        }
      }
      return [seriesIndex === outermost ? radius : 0, 0]
    },
    disp: {
      y0: { unit: SCALE_VALUE, values: (self, seriesIndex) => stackExtents(self, mode).y0[seriesIndex] as number[] },
      y1: { unit: SCALE_VALUE, values: (self, seriesIndex) => stackExtents(self, mode).y1[seriesIndex] as number[] },
    },
  })

  stackedCache.set(key, builder)
  return builder
}
