import type { FlowDirection, FlowEdge, FlowLayout, FlowPoint, FlowSize } from './flow-types.js'

export interface LayoutOptions {
  direction: FlowDirection
  /** Space between two ranks (columns in `LR`, rows in `TB`). */
  rankGap: number
  /** Space between two nodes of the same rank. */
  nodeGap: number
}

export interface Graph {
  ids: string[]
  /** Forward neighbours, after cycles are broken. */
  successors: Map<string, string[]>
  predecessors: Map<string, string[]>
  /** Indices into the edge list of the edges that close a cycle (self-loops included). */
  backEdges: Set<number>
}

export interface LayoutResult {
  positions: Map<string, FlowPoint>
  rank: Map<string, number>
  layers: string[][]
}

/**
 * Builds the adjacency of the graph and breaks its cycles: a depth-first walk in input order marks every edge that
 * leads back to a node still on the walk's stack as a back edge. Edges naming an unknown node are ignored.
 */
export function buildGraph(ids: string[], edges: FlowEdge[]): Graph {
  const known = new Set(ids)
  const out = new Map<string, { target: string; index: number }[]>(ids.map((id) => [id, []]))
  edges.forEach((edge, index) => {
    if (known.has(edge.source) && known.has(edge.target)) out.get(edge.source)!.push({ target: edge.target, index })
  })

  const backEdges = new Set<number>()
  const state = new Map<string, 1 | 2>() // 1: on the stack, 2: done
  for (const root of ids) {
    if (state.has(root)) continue
    // Iterative so a long pipeline cannot overflow the call stack.
    const stack: { id: string; next: number }[] = [{ id: root, next: 0 }]
    state.set(root, 1)
    while (stack.length) {
      const frame = stack[stack.length - 1]
      const children = out.get(frame.id)!
      if (frame.next >= children.length) {
        state.set(frame.id, 2)
        stack.pop()
        continue
      }
      const { target, index } = children[frame.next++]
      const seen = state.get(target)
      if (seen === 1) backEdges.add(index)
      else if (seen === undefined) {
        state.set(target, 1)
        stack.push({ id: target, next: 0 })
      }
    }
  }

  const successors = new Map<string, string[]>(ids.map((id) => [id, []]))
  const predecessors = new Map<string, string[]>(ids.map((id) => [id, []]))
  edges.forEach((edge, index) => {
    if (backEdges.has(index) || !known.has(edge.source) || !known.has(edge.target)) return
    successors.get(edge.source)!.push(edge.target)
    predecessors.get(edge.target)!.push(edge.source)
  })
  return { ids, successors, predecessors, backEdges }
}

/**
 * Layered ("Sugiyama-style") layout, small enough to ship in a component:
 *
 * 1. rank every node by the longest path from a source, so a step sits one rank after its latest dependency;
 * 2. order each rank by the barycentre of its neighbours, sweeping down and up a few times to remove crossings;
 * 3. stack each rank on the cross axis, centred, and space the ranks by the widest node in each.
 */
export function layoutGraph(graph: Graph, sizeOf: (id: string) => FlowSize, options: LayoutOptions): LayoutResult {
  const { ids, successors, predecessors } = graph
  const rank = new Map<string, number>()
  const indegree = new Map(ids.map((id) => [id, predecessors.get(id)!.length]))
  const queue = ids.filter((id) => indegree.get(id) === 0)
  for (const id of queue) rank.set(id, 0)
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head]
    for (const next of successors.get(id)!) {
      rank.set(next, Math.max(rank.get(next) ?? 0, rank.get(id)! + 1))
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }

  const layers: string[][] = []
  for (const id of ids) (layers[rank.get(id) ?? 0] ??= []).push(id)
  for (let r = 0; r < layers.length; r++) layers[r] ??= []

  const order = new Map<string, number>()
  const index = (layer: string[]) => layer.forEach((id, i) => order.set(id, i - (layer.length - 1) / 2))
  layers.forEach(index)
  const sweep = (layer: string[], neighbours: Map<string, string[]>) => {
    const centre = new Map(
      layer.map((id) => {
        const around = neighbours.get(id)!
        return [id, around.length ? around.reduce((sum, n) => sum + order.get(n)!, 0) / around.length : order.get(id)!]
      }),
    )
    layer.sort((a, b) => centre.get(a)! - centre.get(b)! || order.get(a)! - order.get(b)!)
    index(layer)
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let r = 1; r < layers.length; r++) sweep(layers[r], predecessors)
    for (let r = layers.length - 2; r >= 0; r--) sweep(layers[r], successors)
  }

  const horizontal = options.direction === 'LR'
  const main = (size: FlowSize) => (horizontal ? size.width : size.height)
  const cross = (size: FlowSize) => (horizontal ? size.height : size.width)
  const positions = new Map<string, FlowPoint>()
  let offset = 0
  for (const layer of layers) {
    if (!layer.length) continue
    const depth = Math.max(...layer.map((id) => main(sizeOf(id))))
    const breadth = layer.reduce((sum, id) => sum + cross(sizeOf(id)), 0) + options.nodeGap * (layer.length - 1)
    let along = -breadth / 2
    for (const id of layer) {
      const size = sizeOf(id)
      const m = offset + (depth - main(size)) / 2
      positions.set(id, horizontal ? { x: m, y: along } : { x: along, y: m })
      along += cross(size) + options.nodeGap
    }
    offset += depth + options.rankGap
  }
  return { positions, rank, layers }
}

/**
 * Merges a saved layout into a fresh auto layout when the graph changed since it was saved.
 *
 * Nodes that still exist keep their saved position. A node that is new is placed where the auto layout puts it
 * relative to its neighbours that already have a place — the offset between them in the auto layout is applied to
 * their saved positions and averaged — so a step inserted between two moved steps lands between them. A new node
 * with no placed neighbour follows the average displacement of the saved nodes. Every new node is then pushed along
 * the cross axis until it no longer overlaps a node that was placed before it. Saved ids that no longer exist are
 * dropped.
 */
export function mergeLayout(
  auto: Map<string, FlowPoint>,
  saved: FlowLayout,
  graph: Graph,
  edges: FlowEdge[],
  sizeOf: (id: string) => FlowSize,
  options: LayoutOptions,
): Map<string, FlowPoint> {
  const result = new Map<string, FlowPoint>()
  for (const id of graph.ids) {
    const point = saved[id]
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) result.set(id, { x: point.x, y: point.y })
  }
  if (!result.size) return new Map(auto)
  if (result.size === graph.ids.length) return result

  const shift = { x: 0, y: 0 }
  for (const [id, point] of result) {
    shift.x += point.x - auto.get(id)!.x
    shift.y += point.y - auto.get(id)!.y
  }
  shift.x /= result.size
  shift.y /= result.size

  const neighbours = new Map<string, string[]>(graph.ids.map((id) => [id, []]))
  for (const edge of edges) {
    if (!neighbours.has(edge.source) || !neighbours.has(edge.target) || edge.source === edge.target) continue
    neighbours.get(edge.source)!.push(edge.target)
    neighbours.get(edge.target)!.push(edge.source)
  }

  const placed = [...result.keys()]
  let pending = graph.ids.filter((id) => !result.has(id))
  while (pending.length) {
    const ready = pending.filter((id) => neighbours.get(id)!.some((n) => result.has(n)))
    // Nothing touches the placed part: seed the first remaining node from the average shift, then continue from it.
    const batch = ready.length ? ready : [pending[0]]
    for (const id of batch) {
      const own = auto.get(id)!
      const anchors = neighbours.get(id)!.filter((n) => result.has(n))
      let point: FlowPoint
      if (anchors.length) {
        point = { x: 0, y: 0 }
        for (const n of anchors) {
          point.x += result.get(n)!.x + own.x - auto.get(n)!.x
          point.y += result.get(n)!.y + own.y - auto.get(n)!.y
        }
        point.x /= anchors.length
        point.y /= anchors.length
      } else point = { x: own.x + shift.x, y: own.y + shift.y }
      result.set(id, avoidOverlap(id, point, placed, result, sizeOf, options))
      placed.push(id)
    }
    const done = new Set(batch)
    pending = pending.filter((id) => !done.has(id))
  }
  return result
}

function avoidOverlap(
  id: string,
  start: FlowPoint,
  others: string[],
  positions: Map<string, FlowPoint>,
  sizeOf: (id: string) => FlowSize,
  options: LayoutOptions,
) {
  const size = sizeOf(id)
  const gap = options.nodeGap
  const point = { ...start }
  const horizontal = options.direction === 'LR'
  for (let attempt = 0; attempt < 100; attempt++) {
    const hit = others.find((other) => {
      const p = positions.get(other)!
      const s = sizeOf(other)
      return point.x < p.x + s.width + gap && point.x + size.width + gap > p.x && point.y < p.y + s.height + gap && point.y + size.height + gap > p.y
    })
    if (!hit) break
    const p = positions.get(hit)!
    const s = sizeOf(hit)
    if (horizontal) point.y = p.y + s.height + gap
    else point.x = p.x + s.width + gap
  }
  return point
}
