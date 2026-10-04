import type { FlowDirection, FlowEdgeType, FlowPoint } from './flow-types.js'

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

/** Where an edge's route runs: its SVG path, the point halfway along it (where its label goes) and its end point. */
export interface EdgeRoute {
  d: string
  mid: FlowPoint
  end: FlowPoint
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

function routeLeftToRight(a: Rect, b: Rect, type: FlowEdgeType, back: boolean, map: (p: FlowPoint) => FlowPoint): EdgeRoute {
  const start = { x: a.x + a.width, y: a.y + a.height / 2 }
  const end = { x: b.x, y: b.y + b.height / 2 }
  const polyline = (points: FlowPoint[], radius: number): EdgeRoute => {
    const mapped = points.map(map)
    return { d: roundedPolyline(mapped, radius), mid: polylineMidpoint(mapped), end: map(end) }
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
  return { d: `M${point(s)} C${point(c1)} ${point(c2)} ${point(e)}`, mid, end: e }
}

/**
 * The route of an edge from the source's outgoing side to the target's incoming side: right to left edges in
 * `LR`, bottom to top in `TB`. A back edge (one that closes a cycle, or a self-loop) is routed round the outside
 * of the two nodes so it never runs through them. Every route arrives at the target along the main axis, so an
 * arrowhead at `end` points right in `LR` and down in `TB`.
 */
export function edgeRoute(source: Rect, target: Rect, direction: FlowDirection, type: FlowEdgeType, back: boolean): EdgeRoute {
  if (direction === 'LR') return routeLeftToRight(source, target, type, back, (p) => p)
  return routeLeftToRight(flip(source), flip(target), type, back, (p) => ({ x: p.y, y: p.x }))
}

/** The SVG path of an edge; see {@link edgeRoute}. */
export function edgePath(source: Rect, target: Rect, direction: FlowDirection, type: FlowEdgeType, back: boolean): string {
  return edgeRoute(source, target, direction, type, back).d
}
