/**
 * Geometry of a Venn diagram: set sizes in, circles and region outlines out.
 *
 * Pure functions with no DOM and no engine, so the layout can be tested on its own. `@upsetjs/venn.js`
 * solves the proportional layout and finds the arcs where circles meet; everything that turns those into
 * *exclusive* regions (members of exactly these sets) lives here.
 *
 * **Why the region outlines are built by winding.** Canvas fills and zrender hit-tests with the non-zero
 * winding rule, and neither can clip one path by another. An exclusive region is written as the
 * intersection outlines of every superset of the region, each wound clockwise or counter-clockwise by
 * the parity of how many extra sets it adds. By inclusion–exclusion, a point that belongs to exactly the
 * sets `S ⊇ R` is inside `2^(|S|-|R|)` of those outlines, half of each orientation, so its winding number
 * is 1 when `S = R` and 0 otherwise. One path, filled and hit-tested exactly, with no clipping.
 */
import { computeTextCentre, intersectionArea, normalizeSolution, venn, type ICircle, type ISolution } from '@upsetjs/venn.js'

/** The largest number of sets a circle diagram can draw with every region present. */
export const OVERLAP_MAX_SETS = 3

/** One input row: how many members belong to *all* of `sets` (whatever else they belong to). */
export interface OverlapRow {
  sets: readonly string[]
  size: number
}

/** One exclusive region of the diagram. */
export interface OverlapRegion {
  /** Keys of the sets this region belongs to, in declaration order. */
  sets: string[]
  /** Members in exactly these sets and no other visible set. */
  size: number
  /** Members in all of these sets, whatever else they are in: the row's own `size`. */
  total: number
  /** `size` as a share of the union, from 0 to 1. */
  share: number
  /** Bit `i` set when the region is inside the `i`-th visible set. */
  mask: number
}

/** A circle in whatever unit the caller works in. */
export interface OverlapCircle {
  x: number
  y: number
  radius: number
}

export interface OverlapPoint {
  x: number
  y: number
}

export type OverlapLayoutMode = 'proportional' | 'uniform'

const popcount = (mask: number): number => {
  let count = 0
  for (let rest = mask; rest; rest >>= 1) count += rest & 1
  return count
}

/** Sorted, `|`-joined set keys: the identity of a combination regardless of the order it was written in. */
const comboKey = (keys: readonly string[]): string => [...keys].sort().join('|')

/**
 * Turns inclusive rows into the exclusive regions of the diagram, by inclusion–exclusion.
 *
 * A combination missing from `rows` counts as 0. Rows naming a set outside `keys` are ignored, which is
 * what hiding a set from the legend relies on. A negative result (inconsistent input) is clamped to 0.
 */
export function overlapRegions(keys: readonly string[], rows: readonly OverlapRow[]): { regions: OverlapRegion[]; union: number } {
  const lookup = new Map<string, number>()
  for (const row of rows) lookup.set(comboKey(row.sets), Number(row.size) || 0)

  const full = (1 << keys.length) - 1
  const keysOf = (mask: number): string[] => keys.filter((_, index) => mask & (1 << index))
  const inclusive: number[] = []
  for (let mask = 1; mask <= full; mask += 1) inclusive[mask] = lookup.get(comboKey(keysOf(mask))) ?? 0

  const regions: OverlapRegion[] = []
  let union = 0
  for (let mask = 1; mask <= full; mask += 1) {
    let size = 0
    for (let superset = mask; superset <= full; superset += 1) {
      if ((superset & mask) !== mask) continue
      size += (popcount(superset) - popcount(mask)) % 2 ? -inclusive[superset] : inclusive[superset]
    }
    size = Math.max(0, size)
    union += size
    regions.push({ sets: keysOf(mask), size, total: inclusive[mask], share: 0, mask })
  }
  for (const region of regions) region.share = union > 0 ? region.size / union : 0
  return { regions, union }
}

/**
 * Places one circle per set, in abstract units, in the order of `keys`.
 *
 * `proportional` sizes each circle by its set and solves the positions so that every pairwise overlap has
 * the right area; with three sets the triple overlap is a best fit, because three circles cannot match
 * every combination at once. `uniform` draws equal circles at fixed positions so every region has room.
 */
export function solveOverlap(keys: readonly string[], regions: readonly OverlapRegion[], mode: OverlapLayoutMode): OverlapCircle[] {
  const count = keys.length
  if (count === 0) return []

  if (mode === 'uniform') {
    if (count === 1) return [{ x: 0, y: 0, radius: 1 }]
    if (count === 2)
      return [
        { x: -0.62, y: 0, radius: 1 },
        { x: 0.62, y: 0, radius: 1 },
      ]
    const side = 1.15
    return [
      { x: -side / 2, y: side * 0.2887, radius: 1 },
      { x: side / 2, y: side * 0.2887, radius: 1 },
      { x: 0, y: -side * 0.5774, radius: 1 },
    ]
  }

  const totals = regions.map((region) => region.total)
  const largest = Math.max(...totals, 1)
  // A zero-sized set still gets a dot of a circle, so it keeps its label and the solver stays finite.
  const floor = largest * 1e-3
  if (count === 1) return [{ x: 0, y: 0, radius: Math.sqrt(Math.max(totals[0], floor) / Math.PI) }]

  const areas = regions.map((region) => ({
    sets: region.sets,
    size: region.sets.length === 1 ? Math.max(region.total, floor) : region.total,
  }))
  const solution: ISolution = normalizeSolution(venn(areas), Math.PI / 2)
  return keys.map((key) => {
    const circle = solution[key]
    return circle ? { x: circle.x, y: circle.y, radius: circle.radius } : { x: 0, y: 0, radius: Math.sqrt(floor / Math.PI) }
  })
}

/** Room kept free around the circles, for the set labels above and below them. */
export interface OverlapPadding {
  x: number
  y: number
}

/** Scales and centres `circles` into a `width` × `height` box. */
export function fitOverlap(circles: readonly OverlapCircle[], width: number, height: number, padding: OverlapPadding): OverlapCircle[] {
  if (circles.length === 0) return []
  const minX = Math.min(...circles.map((c) => c.x - c.radius))
  const maxX = Math.max(...circles.map((c) => c.x + c.radius))
  const minY = Math.min(...circles.map((c) => c.y - c.radius))
  const maxY = Math.max(...circles.map((c) => c.y + c.radius))
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const scale = Math.max(0, Math.min((width - 2 * padding.x) / spanX, (height - 2 * padding.y) / spanY))
  const offsetX = (width - spanX * scale) / 2 - minX * scale
  const offsetY = (height - spanY * scale) / 2 - minY * scale
  return circles.map((c) => ({ x: c.x * scale + offsetX, y: c.y * scale + offsetY, radius: c.radius * scale }))
}

const toSolver = (circle: OverlapCircle, index: number): ICircle => ({ x: circle.x, y: circle.y, radius: circle.radius, setid: String(index) })

/** A full circle as two arcs, wound clockwise (`sweep` 1, in y-down screen space) or counter-clockwise. */
function circlePath(circle: OverlapCircle, clockwise: boolean): string {
  const { x, y, radius } = circle
  const sweep = clockwise ? 1 : 0
  return `M ${x - radius} ${y} A ${radius} ${radius} 0 1 ${sweep} ${x + radius} ${y} A ${radius} ${radius} 0 1 ${sweep} ${x - radius} ${y} Z`
}

/**
 * The outline of the area shared by every circle in `members`, or `''` when they do not all meet.
 * venn.js traces its arcs with the sweep flag always set, so `clockwise: false` walks them backwards.
 */
function intersectionPath(members: readonly OverlapCircle[], clockwise: boolean): string {
  if (members.length === 1) return circlePath(members[0], clockwise)
  const stats: { arcs?: readonly { circle: ICircle; p1: OverlapPoint; p2: OverlapPoint; width: number; large?: boolean }[] } = {}
  const area = intersectionArea(members.map(toSolver), stats)
  const arcs = stats.arcs ?? []
  if (!(area > 0) || arcs.length === 0) return ''
  if (arcs.length === 1) return circlePath(arcs[0].circle, clockwise)

  const flag = (arc: (typeof arcs)[number]): number => ((arc.large ?? arc.width > arc.circle.radius) ? 1 : 0)
  const parts = [`M ${arcs[0].p2.x} ${arcs[0].p2.y}`]
  if (clockwise) {
    for (const arc of arcs) parts.push(`A ${arc.circle.radius} ${arc.circle.radius} 0 ${flag(arc)} 1 ${arc.p1.x} ${arc.p1.y}`)
  } else {
    for (let index = arcs.length - 1; index >= 0; index -= 1) {
      const arc = arcs[index]
      parts.push(`A ${arc.circle.radius} ${arc.circle.radius} 0 ${flag(arc)} 0 ${arc.p2.x} ${arc.p2.y}`)
    }
  }
  parts.push('Z')
  return parts.join(' ')
}

/**
 * The outline of the exclusive region `mask` (inside exactly those circles), as SVG path data that fills
 * and hit-tests correctly under the non-zero rule. `''` when the region does not exist in this layout.
 */
export function regionPath(circles: readonly OverlapCircle[], mask: number): string {
  const full = (1 << circles.length) - 1
  const parts: string[] = []
  for (let superset = mask; superset <= full; superset += 1) {
    if ((superset & mask) !== mask) continue
    const members = circles.filter((_, index) => superset & (1 << index))
    const clockwise = (popcount(superset) - popcount(mask)) % 2 === 0
    const path = intersectionPath(members, clockwise)
    // The region itself has to exist; a missing superset only means there is nothing to subtract.
    if (!path && superset === mask) return ''
    if (path) parts.push(path)
  }
  return parts.join(' ')
}

/** Whether `point` is inside exactly the circles of `mask`. */
export function maskAt(circles: readonly OverlapCircle[], point: OverlapPoint): number {
  let mask = 0
  circles.forEach((c, index) => {
    if ((point.x - c.x) ** 2 + (point.y - c.y) ** 2 <= c.radius * c.radius) mask |= 1 << index
  })
  return mask
}

/** Distance from `point` to the nearest circle edge. */
export function edgeClearance(circles: readonly OverlapCircle[], point: OverlapPoint): number {
  return Math.min(...circles.map((c) => Math.abs(Math.hypot(point.x - c.x, point.y - c.y) - c.radius)))
}

/**
 * Where a region's label goes: the point inside the region farthest from any edge, with that distance as
 * `clearance` so the caller can decide whether the text fits or needs a leader line. `undefined` when the
 * region has no area in this layout.
 */
export function regionLabelPoint(circles: readonly OverlapCircle[], mask: number): (OverlapPoint & { clearance: number }) | undefined {
  const interior = circles.filter((_, index) => mask & (1 << index)).map(toSolver)
  const exterior = circles.filter((_, index) => !(mask & (1 << index))).map(toSolver)
  if (interior.length === 0) return undefined
  const centre = computeTextCentre(interior, exterior) as OverlapPoint & { disjoint?: boolean }
  if (centre.disjoint || !Number.isFinite(centre.x) || !Number.isFinite(centre.y) || maskAt(circles, centre) !== mask) return undefined
  return { x: centre.x, y: centre.y, clearance: edgeClearance(circles, centre) }
}

/**
 * Where a label that does not fit inside its region goes instead: out from `from` along `direction` (by
 * default, straight away from the diagram's centre), to the first point that is clear of every circle by `gap`.
 */
export function leaderEnd(
  circles: readonly OverlapCircle[],
  from: OverlapPoint,
  gap: number,
  direction?: OverlapPoint,
): OverlapPoint & { direction: OverlapPoint } {
  let dx: number
  let dy: number
  if (direction) {
    dx = direction.x
    dy = direction.y
  } else {
    dx = from.x - circles.reduce((sum, c) => sum + c.x, 0) / circles.length
    dy = from.y - circles.reduce((sum, c) => sum + c.y, 0) / circles.length
  }
  let length = Math.hypot(dx, dy)
  if (length < 1e-6) {
    dx = Math.SQRT1_2
    dy = -Math.SQRT1_2
    length = 1
  }
  dx /= length
  dy /= length
  const reach = Math.max(...circles.map((c) => Math.hypot(c.x - from.x, c.y - from.y) + c.radius)) + gap
  let point = from
  for (let step = 2; step <= reach; step += 2) {
    point = { x: from.x + dx * step, y: from.y + dy * step }
    if (maskAt(circles, point) === 0 && edgeClearance(circles, point) >= gap) break
  }
  return { ...point, direction: { x: dx, y: dy } }
}

/** An axis-aligned box, for keeping labels apart. */
export interface OverlapBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Whether two boxes overlap once each is grown by `pad`. */
export function boxesOverlap(a: OverlapBox, b: OverlapBox, pad = 0): boolean {
  return a.x1 - pad < b.x2 && b.x1 - pad < a.x2 && a.y1 - pad < b.y2 && b.y1 - pad < a.y2
}
