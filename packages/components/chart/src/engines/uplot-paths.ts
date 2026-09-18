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
function layout(self: uPlot, width: number, gap: number, count: number) {
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
function bandStep(xs: readonly number[]): number {
  let smallest = Infinity
  for (let index = 1; index < xs.length; index += 1) {
    const delta = Math.abs(xs[index] - xs[index - 1])
    if (delta > 0 && delta < smallest) smallest = delta
  }
  return Number.isFinite(smallest) ? smallest : 1
}
