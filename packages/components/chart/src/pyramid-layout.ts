/**
 * The geometry behind `c2-pyramid-chart`, kept free of the DOM and of ECharts so it can be tested as plain
 * arithmetic.
 *
 * ECharts' funnel series draws each level as a trapezoid whose base-side edge is as wide as the level's value
 * and whose apex-side edge is as wide as the next smaller level's. That is the `width` sizing. The other
 * sizings keep the outline a triangle (or a trapezoid, with a flat apex) and decide how far down it each level
 * reaches instead. They are handed to ECharts as a synthetic value — the depth of the level's base-side edge,
 * from 0 at the apex to 1 at the base, which the series maps linearly onto `minSize…maxSize` — plus the
 * level's own height, so the funnel layout reproduces them exactly.
 */

/** How a level's value is turned into its size. */
export type PyramidSizing = 'area' | 'height' | 'width' | 'equal'

/** The order of the levels, read from the apex. */
export type PyramidSort = 'ascending' | 'descending' | 'none'

export interface PyramidLevel {
  /** Index of the row in the chart's data. */
  index: number
  /** The row's value. */
  value: number
  /** The synthetic value ECharts sizes the level's base-side edge by, from 0 to 1. */
  depth: number
  /**
   * Share of the pyramid's height the level takes, from 0 to 1. `undefined` under `width` sizing, where every
   * level is the same height and ECharts divides the height itself.
   */
  height?: number
}

export interface PyramidLayoutOptions {
  sizing: PyramidSizing
  sort: PyramidSort
  /** Width of the apex as a share of the width of the base, from 0 (a point) to 1 (a rectangle). */
  apexRatio?: number
  /** Rows to leave out, such as the levels switched off from the legend. */
  exclude?: ReadonlySet<number>
}

/**
 * Lays out the levels of a pyramid, apex first. A row whose value is missing, zero or negative has no size to
 * draw and is left out, as is every row in `exclude`.
 */
export function layoutPyramid(values: readonly (number | null | undefined)[], options: PyramidLayoutOptions): PyramidLevel[] {
  const drawn: { index: number; value: number }[] = []
  values.forEach((value, index) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0 && !options.exclude?.has(index)) drawn.push({ index, value })
  })
  if (drawn.length === 0) return []

  // Under `width` sizing ECharts orders the levels by their width, which is their value: the sort cannot be
  // honoured, so the levels always read from the smallest at the apex.
  const sort = options.sizing === 'width' ? 'ascending' : options.sort
  if (sort !== 'none') drawn.sort((a, b) => (sort === 'ascending' ? a.value - b.value : b.value - a.value) || a.index - b.index)

  if (options.sizing === 'width') {
    const max = Math.max(...drawn.map((level) => level.value))
    return drawn.map(({ index, value }) => ({ index, value, depth: value / max }))
  }

  const apex = Math.min(1, Math.max(0, options.apexRatio ?? 0))
  const total = drawn.reduce((sum, level) => sum + level.value, 0)
  let cumulative = 0
  let previous = 0
  return drawn.map(({ index, value }, position) => {
    cumulative += value
    const depth =
      position === drawn.length - 1
        ? 1
        : options.sizing === 'equal'
          ? (position + 1) / drawn.length
          : options.sizing === 'height'
            ? cumulative / total
            : depthForArea(cumulative / total, apex)
    const level = { index, value, depth, height: depth - previous }
    previous = depth
    return level
  })
}

/**
 * The depth from the apex at which a share `c` of the outline's area lies above. The outline's width at depth
 * `t` is `a + (1 - a) t`, so the area above it is `a t + (1 - a) t² / 2` out of `(1 + a) / 2` in all.
 */
function depthForArea(share: number, apex: number): number {
  if (apex >= 1) return share
  const k = (1 - apex) / 2
  return (-apex + Math.sqrt(apex * apex + 4 * k * share * ((1 + apex) / 2))) / (2 * k)
}

/**
 * Places labels along one axis as close to their levels as they can get without overlapping. `centres` are the
 * wanted positions (in any order), `sizes` each label's extent along the axis, and every label is kept whole
 * inside `min…max`. Returns the positions in the input order.
 */
export function spreadLabels(centres: readonly number[], sizes: readonly number[], min: number, max: number): number[] {
  const order = centres.map((_, index) => index).sort((a, b) => centres[a] - centres[b])
  const placed = centres.slice()
  // Down the axis, each label is pushed clear of the one before it and of the start.
  let edge = min
  for (const index of order) {
    const half = sizes[index] / 2
    placed[index] = Math.max(centres[index], edge + half)
    edge = placed[index] + half
  }
  // Back up it, anything pushed past the end is pulled in, dragging its neighbours along. The start wins when the
  // labels cannot all fit.
  edge = max
  for (let position = order.length - 1; position >= 0; position -= 1) {
    const index = order[position]
    const half = sizes[index] / 2
    placed[index] = Math.max(min + half, Math.min(placed[index], edge - half))
    edge = placed[index] - half
  }
  return placed
}

/** Near-black or white, whichever reads better on `background` (an `rgb(…)` or `#rrggbb` colour). */
export function readableTextOn(background: string, dark = '#18181b', light = '#ffffff'): string {
  const channels = parseColor(background)
  if (!channels) return light
  const luminance = relativeLuminance(channels)
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  const darkLuminance = relativeLuminance(parseColor(dark) ?? [0, 0, 0])
  return contrast(luminance, darkLuminance) >= contrast(luminance, 1) ? dark : light
}

function parseColor(value: string): [number, number, number] | undefined {
  const rgb = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(value)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value.trim())
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)]
  return undefined
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}
