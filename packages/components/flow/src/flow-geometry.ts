import type { FlowDirection, FlowEdgeType, FlowPoint, FlowSide } from './flow-types.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** How far a step edge or a back edge runs straight out of a node before it turns. */
const STUB = 20
/** How far below (`LR`) or beside (`TB`) the two nodes a back edge loops round. */
const LOOP_CLEARANCE = 28

const round = (value: number) => Math.round(value * 10) / 10
const point = (p: FlowPoint) => `${round(p.x)},${round(p.y)}`

/** Swaps the axes, so every path is computed left to right and mirrored for `TB`. */
const flip = (rect: Rect): Rect => ({ x: rect.y, y: rect.x, width: rect.height, height: rect.width })

/**
 * Where an edge's route runs: its SVG path, the point halfway along it (where its label goes), its end point and the
 * angle (degrees, clockwise from pointing right) it arrives at the target with, which is where its arrowhead points.
 * A route between chosen sides also carries its bounding box, which can reach past the two nodes.
 */
export interface EdgeRoute {
  d: string
  mid: FlowPoint
  end: FlowPoint
  angle: number
  bounds?: Rect
}

/** The point halfway along a polyline, measured by length. */
function polylineMidpoint(points: FlowPoint[]): FlowPoint {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let rest = lengths.reduce((sum, length) => sum + length, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] && lengths[i] > 0) {
      const t = rest / lengths[i]
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }
    }
    rest -= lengths[i]
  }
  return points[points.length - 1]
}

/** An orthogonal path through `points` with its corners rounded by up to `radius`. */
export function roundedPolyline(points: FlowPoint[], radius: number): string {
  let d = `M${point(points[0])}`
  for (let i = 1; i < points.length - 1; i++) {
    const [prev, cur, next] = [points[i - 1], points[i], points[i + 1]]
    const inLength = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    const outLength = Math.hypot(next.x - cur.x, next.y - cur.y)
    if (!inLength || !outLength) continue
    const r = Math.min(radius, inLength / 2, outLength / 2)
    const before = { x: cur.x - ((cur.x - prev.x) / inLength) * r, y: cur.y - ((cur.y - prev.y) / inLength) * r }
    const after = { x: cur.x + ((next.x - cur.x) / outLength) * r, y: cur.y + ((next.y - cur.y) / outLength) * r }
    d += ` L${point(before)} Q${point(cur)} ${point(after)}`
  }
  return `${d} L${point(points[points.length - 1])}`
}

function routeLeftToRight(a: Rect, b: Rect, type: FlowEdgeType, back: boolean, map: (p: FlowPoint) => FlowPoint, angle: number): EdgeRoute {
  const start = { x: a.x + a.width, y: a.y + a.height / 2 }
  const end = { x: b.x, y: b.y + b.height / 2 }
  const polyline = (points: FlowPoint[], radius: number): EdgeRoute => {
    const mapped = points.map(map)
    return { d: roundedPolyline(mapped, radius), mid: polylineMidpoint(mapped), end: map(end), angle }
  }
  if (back) {
    // Out of the source, round the far side of both nodes, and back into the target.
    const low = Math.max(a.y + a.height, b.y + b.height) + LOOP_CLEARANCE
    const points = [start, { x: start.x + STUB, y: start.y }, { x: start.x + STUB, y: low }, { x: end.x - STUB, y: low }, { x: end.x - STUB, y: end.y }, end]
    return polyline(points, type === 'step' ? 8 : 16)
  }
  if (type === 'step') {
    const points =
      end.x - start.x >= STUB * 2
        ? [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]
        : [
            start,
            { x: start.x + STUB, y: start.y },
            { x: start.x + STUB, y: (start.y + end.y) / 2 },
            { x: end.x - STUB, y: (start.y + end.y) / 2 },
            { x: end.x - STUB, y: end.y },
            end,
          ]
    return polyline(points, 8)
  }
  const pull = Math.max(28, Math.abs(end.x - start.x) / 2)
  const [s, c1, c2, e] = [start, { x: start.x + pull, y: start.y }, { x: end.x - pull, y: end.y }, end].map(map)
  // The curve is symmetric about its centre, so t = 0.5 is also halfway along its length.
  const mid = { x: (s.x + 3 * c1.x + 3 * c2.x + e.x) / 8, y: (s.y + 3 * c1.y + 3 * c2.y + e.y) / 8 }
  return { d: `M${point(s)} C${point(c1)} ${point(c2)} ${point(e)}`, mid, end: e, angle }
}

/**
 * The route of an edge from the source's outgoing side to the target's incoming side: right to left edges in
 * `LR`, bottom to top in `TB`. A back edge (one that closes a cycle, or a self-loop) is routed round the outside
 * of the two nodes so it never runs through them. Every route arrives at the target along the main axis, so an
 * arrowhead at `end` points right in `LR` and down in `TB`.
 */
export function edgeRoute(source: Rect, target: Rect, direction: FlowDirection, type: FlowEdgeType, back: boolean): EdgeRoute {
  if (direction === 'LR') return routeLeftToRight(source, target, type, back, (p) => p, 0)
  return routeLeftToRight(flip(source), flip(target), type, back, (p) => ({ x: p.y, y: p.x }), 90)
}

// ---------------------------------------------------------------------------------------------------------------
// Routes between chosen sides

export const FLOW_SIDES: readonly FlowSide[] = ['top', 'right', 'bottom', 'left']

/** The side an edge leaves a node by, and the side it arrives by, when the edge does not name them. */
export function defaultSides(direction: FlowDirection): { source: FlowSide; target: FlowSide } {
  return direction === 'TB' ? { source: 'bottom', target: 'top' } : { source: 'right', target: 'left' }
}

/** The side facing the other way. */
export const oppositeSide = (side: FlowSide): FlowSide => (({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' }) as const)[side]

/** The outward unit normal of a side. */
const NORMALS: Record<FlowSide, FlowPoint> = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } }

/** The angle an edge arriving through `side` points in: into the node, against the side's normal. */
const ARRIVAL: Record<FlowSide, number> = { left: 0, top: 90, right: 180, bottom: -90 }

/** The middle of one side of a rectangle: where an edge meets it. */
export function sidePoint(rect: Rect, side: FlowSide): FlowPoint {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
}

/**
 * The side of `rect` nearest `p`. Ties go to the earlier side of `order`, so a point exactly as near two sides picks
 * the one the caller prefers.
 */
export function nearestSide(rect: Rect, p: FlowPoint, order: readonly FlowSide[] = FLOW_SIDES): FlowSide {
  const distance: Record<FlowSide, number> = {
    top: Math.abs(p.y - rect.y),
    bottom: Math.abs(rect.y + rect.height - p.y),
    left: Math.abs(p.x - rect.x),
    right: Math.abs(rect.x + rect.width - p.x),
  }
  return order.reduce((best, side) => (distance[side] < distance[best] ? side : best), order[0])
}

const boundsOf = (points: FlowPoint[]): Rect => {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}

const same = (p: FlowPoint, q: FlowPoint) => Math.abs(p.x - q.x) < 0.01 && Math.abs(p.y - q.y) < 0.01

/** Drops repeated points. */
const dedupe = (points: FlowPoint[]) => points.filter((p, i) => i === 0 || !same(p, points[i - 1]))

/** Drops the middle one of three points in a row, so the corners left are real turns. */
function straighten(points: FlowPoint[]): FlowPoint[] {
  const out: FlowPoint[] = []
  for (const p of points) {
    const [before, last] = [out[out.length - 2], out[out.length - 1]]
    if (
      before &&
      last &&
      ((Math.abs(before.x - last.x) < 0.01 && Math.abs(last.x - p.x) < 0.01) || (Math.abs(before.y - last.y) < 0.01 && Math.abs(last.y - p.y) < 0.01))
    ) {
      out[out.length - 1] = p
    } else out.push(p)
  }
  return out
}

/** Whether the axis-aligned segment from `p` to `q` runs through the inside of `rect`. */
function crosses(p: FlowPoint, q: FlowPoint, rect: Rect): boolean {
  const inset = 1
  const [x0, x1] = [rect.x + inset, rect.x + rect.width - inset]
  const [y0, y1] = [rect.y + inset, rect.y + rect.height - inset]
  if (x1 <= x0 || y1 <= y0) return false
  return Math.max(p.x, q.x) > x0 && Math.min(p.x, q.x) < x1 && Math.max(p.y, q.y) > y0 && Math.min(p.y, q.y) < y1
}

/** A turn back on itself: the segment into `b` and the one out of it point in opposite directions. */
function reverses(a: FlowPoint, b: FlowPoint, c: FlowPoint): boolean {
  const [ux, uy, vx, vy] = [b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y]
  return ux * vx + uy * vy < 0 && Math.abs(ux * vy - uy * vx) < 0.01
}

/**
 * The orthogonal route between two sides: straight out of the source side for a stub, at most three segments, and
 * straight into the target side. Of the candidate routes (an L, a Z with its bend halfway or along a stub, or a loop
 * round the outside of both nodes) it takes the one that runs through neither node, then the shortest, counting
 * every turn as a little extra length.
 */
function stepPoints(a: Rect, sa: FlowSide, b: Rect, sb: FlowSide): FlowPoint[] {
  const start = sidePoint(a, sa)
  const end = sidePoint(b, sb)
  const s = { x: start.x + NORMALS[sa].x * STUB, y: start.y + NORMALS[sa].y * STUB }
  const t = { x: end.x + NORMALS[sb].x * STUB, y: end.y + NORMALS[sb].y * STUB }
  const left = Math.min(a.x, b.x) - LOOP_CLEARANCE
  const right = Math.max(a.x + a.width, b.x + b.width) + LOOP_CLEARANCE
  const top = Math.min(a.y, b.y) - LOOP_CLEARANCE
  const bottom = Math.max(a.y + a.height, b.y + b.height) + LOOP_CLEARANCE
  const xs = [s.x, t.x, (s.x + t.x) / 2, left, right]
  const ys = [s.y, t.y, (s.y + t.y) / 2, top, bottom]
  const candidates: FlowPoint[][] = [
    ...xs.map((m) => [start, s, { x: m, y: s.y }, { x: m, y: t.y }, t, end]),
    ...ys.map((m) => [start, s, { x: s.x, y: m }, { x: t.x, y: m }, t, end]),
  ]
  let best: FlowPoint[] = straighten(dedupe([start, s, t, end]))
  let bestScore = Infinity
  for (const candidate of candidates) {
    const raw = dedupe(candidate)
    let score = 0
    for (let i = 2; i < raw.length; i++) if (reverses(raw[i - 2], raw[i - 1], raw[i])) score += 1e7
    const points = straighten(raw)
    if (points.length < 2) continue
    for (let i = 1; i < points.length; i++) {
      const [p, q] = [points[i - 1], points[i]]
      score += Math.hypot(q.x - p.x, q.y - p.y)
      if (crosses(p, q, a)) score += 1e6
      if (b !== a && crosses(p, q, b)) score += 1e6
    }
    score += (points.length - 2) * 12
    if (score < bestScore) {
      bestScore = score
      best = points
    }
  }
  return best
}

/** Whether `p` is inside `rect`, more than a pixel in from its outline. */
const inside = (p: FlowPoint, rect: Rect) => p.x > rect.x + 1 && p.x < rect.x + rect.width - 1 && p.y > rect.y + 1 && p.y < rect.y + rect.height - 1

/** Sampled points of a cubic Bézier curve. */
function sampleCubic(p0: FlowPoint, p1: FlowPoint, p2: FlowPoint, p3: FlowPoint, count = 48): FlowPoint[] {
  const points: FlowPoint[] = []
  for (let i = 0; i <= count; i++) {
    const t = i / count
    const u = 1 - t
    const [k0, k1, k2, k3] = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
    points.push({ x: k0 * p0.x + k1 * p1.x + k2 * p2.x + k3 * p3.x, y: k0 * p0.y + k1 * p1.y + k2 * p2.y + k3 * p3.y })
  }
  return points
}

/** How far a curve's control point sits out from a side, given how far ahead of that side the other end is. */
const pull = (ahead: number) => (ahead >= 0 ? Math.max(28, ahead / 2) : Math.max(28, 6.25 * Math.sqrt(-ahead)))

/**
 * The route of an edge from the middle of side `sa` of `source` to the middle of side `sb` of `target`. It leaves
 * perpendicular to its source side and arrives perpendicular to its target side, whatever the two sides are (the
 * same side, opposite sides, or the target behind the source). A `step` route goes round both nodes rather than
 * through them; a `bezier` route is a single curve, unless that curve would cut through one of the nodes: it then
 * takes the step route with wide rounded corners, as a back edge does.
 */
export function sideEdgeRoute(source: Rect, sa: FlowSide, target: Rect, sb: FlowSide, type: FlowEdgeType): EdgeRoute {
  const angle = ARRIVAL[sb]
  if (type === 'step') {
    const points = stepPoints(source, sa, target, sb)
    return { d: roundedPolyline(points, 8), mid: polylineMidpoint(points), end: points[points.length - 1], angle, bounds: boundsOf(points) }
  }
  const s = sidePoint(source, sa)
  const e = sidePoint(target, sb)
  const [na, nb] = [NORMALS[sa], NORMALS[sb]]
  const pa = pull((e.x - s.x) * na.x + (e.y - s.y) * na.y)
  const pb = pull((s.x - e.x) * nb.x + (s.y - e.y) * nb.y)
  const c1 = { x: s.x + na.x * pa, y: s.y + na.y * pa }
  const c2 = { x: e.x + nb.x * pb, y: e.y + nb.y * pb }
  const samples = sampleCubic(s, c1, c2, e)
  if (samples.some((p) => inside(p, source) || inside(p, target))) {
    // The curve would cut through a node (a target behind its source, two sides facing away from each other): go
    // round the outside like a back edge, on the step route with wide rounded corners.
    const points = stepPoints(source, sa, target, sb)
    return { d: roundedPolyline(points, 16), mid: polylineMidpoint(points), end: points[points.length - 1], angle, bounds: boundsOf(points) }
  }
  return { d: `M${point(s)} C${point(c1)} ${point(c2)} ${point(e)}`, mid: polylineMidpoint(samples), end: e, angle, bounds: boundsOf(samples) }
}

/**
 * The route of an edge leaving `source` by `sourceSide` and arriving at `target` by `targetSide`. A side left out is
 * the default for the direction (the outgoing side of the source, the incoming side of the target); when both sides
 * are the defaults the edge takes the {@link edgeRoute} it always had, back-edge loop included.
 */
export function routeBetween(
  source: Rect,
  target: Rect,
  direction: FlowDirection,
  type: FlowEdgeType,
  back: boolean,
  sourceSide?: FlowSide,
  targetSide?: FlowSide,
): EdgeRoute {
  const defaults = defaultSides(direction)
  const sa = sourceSide ?? defaults.source
  const sb = targetSide ?? defaults.target
  if (sa === defaults.source && sb === defaults.target) return edgeRoute(source, target, direction, type, back)
  return sideEdgeRoute(source, sa, target, sb, type)
}

/**
 * The SVG path of an edge; see {@link edgeRoute}. With `sourceSide` or `targetSide`, the path between those sides
 * (the default for any side left out); see {@link routeBetween}.
 */
export function edgePath(
  source: Rect,
  target: Rect,
  direction: FlowDirection,
  type: FlowEdgeType,
  back: boolean,
  sourceSide?: FlowSide,
  targetSide?: FlowSide,
): string {
  return routeBetween(source, target, direction, type, back, sourceSide, targetSide).d
}
