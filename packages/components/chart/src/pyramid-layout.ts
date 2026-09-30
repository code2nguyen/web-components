/**
 * The geometry behind `c2-pyramid-chart`, kept free of the DOM and of ECharts so it can be tested as plain
 * arithmetic.
 *
 * `layoutPyramid` orders the levels and decides how far down the outline each one reaches: its `depth`, from 0
 * at the apex to 1 at the base, and its share of the height. The `width` sizing is a classic funnel, where every
 * level is the same height and its base is as wide as its value; the other sizings keep the outline a triangle
 * (or a trapezoid, with a flat apex) and size each level's area or height instead. `pyramidShapes` turns that
 * into pixel outlines and `roundedPolygonPath` into the path the chart draws.
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
  /**
   * How far the level's base-side edge is from the apex, from 0 to 1; the edge's width grows linearly with it. Under
   * `width` sizing it is the value's share of the largest value.
   */
  depth: number
  /** Share of the pyramid's height the level takes, from 0 to 1. `undefined` under `width` sizing: every level is equally high. */
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

  // Under `width` sizing each level's apex-side edge is as wide as the level before it, so only an order by value
  // keeps the outline from zigzagging: the levels always read from the smallest at the apex.
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

/** The box the pyramid is drawn in, in plot pixels. */
export interface PyramidBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PyramidShapeOptions {
  /** The side the point is on. */
  apex: 'top' | 'bottom' | 'left' | 'right'
  /** Where the pyramid sits across its axis: `start` is the left (or top) edge of the box. */
  align: 'start' | 'center' | 'end'
  /** Space between adjacent levels, in pixels. */
  gap: number
  /** Width of the apex and of the base, in pixels. */
  minSize: number
  maxSize: number
}

/** One level's outline and the anchors its labels use, in plot pixels. */
export interface PyramidShape {
  /** The outline: the apex-side edge, then the base-side edge, going round. */
  points: [number, number][]
  /** The middle of the level. */
  centre: [number, number]
  /** The level's thickness along the axis, and its width across it halfway along. */
  thickness: number
  width: number
  /** Across the axis, where the level's two sides are halfway along it: towards the start, and towards the end. */
  sides: [number, number]
}

/**
 * Turns laid-out levels into outlines inside `box`. Both of a level's edges are linear in depth, so the edge at
 * depth `d` is `minSize + (maxSize - minSize) d` wide; the apex-side edge of a level is the base-side edge of the
 * one before it.
 */
export function pyramidShapes(levels: readonly PyramidLevel[], box: PyramidBox, options: PyramidShapeOptions): PyramidShape[] {
  const vertical = options.apex === 'top' || options.apex === 'bottom'
  const length = vertical ? box.height : box.width
  const cross = vertical ? box.width : box.height
  const alongStart = vertical ? box.y : box.x
  const crossStart = vertical ? box.x : box.y
  const apexAtStart = options.apex === 'top' || options.apex === 'left'
  const available = Math.max(0, length - options.gap * Math.max(0, levels.length - 1))
  const widthAt = (depth: number) => options.minSize + (options.maxSize - options.minSize) * depth
  const from = (width: number) => crossStart + (options.align === 'start' ? 0 : options.align === 'end' ? cross - width : (cross - width) / 2)
  const along = (distance: number) => (apexAtStart ? alongStart + distance : alongStart + length - distance)
  const point = (a: number, c: number): [number, number] => (vertical ? [c, a] : [a, c])

  let offset = 0
  let previous = 0
  return levels.map((level) => {
    const thickness = (level.height ?? 1 / levels.length) * available
    const near = along(offset)
    const far = along(offset + thickness)
    const nearWidth = widthAt(previous)
    const farWidth = widthAt(level.depth)
    const width = (nearWidth + farWidth) / 2
    const middle = along(offset + thickness / 2)
    offset += thickness + options.gap
    previous = level.depth
    return {
      points: [point(near, from(nearWidth)), point(near, from(nearWidth) + nearWidth), point(far, from(farWidth) + farWidth), point(far, from(farWidth))],
      centre: point(middle, from(width) + width / 2),
      thickness,
      width,
      sides: [from(width), from(width) + width],
    }
  })
}

/**
 * An SVG path through `points` with every corner rounded: each corner is cut `radius` pixels back along both of
 * its sides (less on a short side) and joined with a curve through the corner's own control point. Points closer
 * than half a pixel are merged, so a level that comes to a point is a rounded triangle.
 */
export function roundedPolygonPath(points: readonly [number, number][], radius: number): string {
  const corners: [number, number][] = []
  for (const point of points) {
    const last = corners[corners.length - 1]
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= 0.5) corners.push(point)
  }
  if (corners.length > 2 && Math.hypot(corners[0][0] - corners[corners.length - 1][0], corners[0][1] - corners[corners.length - 1][1]) < 0.5) corners.pop()
  if (corners.length < 3) return ''
  const round = (value: number) => Math.round(value * 100) / 100
  if (radius <= 0) return `M${corners.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`

  const count = corners.length
  let path = ''
  corners.forEach((corner, index) => {
    const before = corners[(index - 1 + count) % count]
    const after = corners[(index + 1) % count]
    const toBefore = Math.hypot(before[0] - corner[0], before[1] - corner[1])
    const toAfter = Math.hypot(after[0] - corner[0], after[1] - corner[1])
    const cut = Math.min(radius, toBefore / 2, toAfter / 2)
    const start = [corner[0] + ((before[0] - corner[0]) / toBefore) * cut, corner[1] + ((before[1] - corner[1]) / toBefore) * cut]
    const end = [corner[0] + ((after[0] - corner[0]) / toAfter) * cut, corner[1] + ((after[1] - corner[1]) / toAfter) * cut]
    path += `${index === 0 ? 'M' : 'L'}${round(start[0])} ${round(start[1])}Q${round(corner[0])} ${round(corner[1])} ${round(end[0])} ${round(end[1])}`
  })
  return `${path}Z`
}
