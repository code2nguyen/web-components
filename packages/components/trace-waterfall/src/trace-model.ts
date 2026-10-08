/** Outcome of a span, following the OpenTelemetry status codes. */
export type TraceSpanStatus = 'ok' | 'error' | 'unset'

/** Unit of the numbers in a span's `start`, `end` and `duration`. */
export type TraceTimeUnit = 's' | 'ms' | 'us' | 'ns'

/** One span of a trace. Fields the waterfall does not read are kept and handed back in events. */
export interface TraceSpan {
  /** Identifier, unique within the trace. */
  id: string
  /** `id` of the parent span. A span without one, or whose parent is not in the trace, is a root. */
  parentId?: string | null
  /** Operation name, e.g. `GET /api/orders`. */
  name: string
  /** Service that recorded the span. Spans of one service share a bar colour. */
  service?: string
  /** Start time, absolute or relative to the trace, in `time-unit`. A numeric string is accepted. */
  start: number | string
  /** Length, in `time-unit`. Ignored when `end` is given. */
  duration?: number | string
  /** End time, in `time-unit`. */
  end?: number | string
  /** `error` draws the bar in the error colour and marks the row. */
  status?: TraceSpanStatus
  [key: string]: unknown
}

/** A span placed on the trace's time axis, with times in milliseconds from the start of the trace. */
export interface TraceNode {
  /** Key of the row: the span's `id`, made unique when the trace repeats one. */
  key: string
  span: TraceSpan
  /** Milliseconds from the start of the trace. */
  offset: number
  /** Milliseconds. */
  duration: number
  /** Index of the span's service in order of first appearance; -1 without a service. */
  serviceIndex: number
  children: TraceNode[]
}

export interface TraceModel {
  roots: TraceNode[]
  /** Every node, by key. */
  nodes: Map<string, TraceNode>
  /** Milliseconds from the first start to the last end. */
  total: number
  /** Services in order of first appearance. */
  services: string[]
}

/** A visible line of the waterfall. */
export interface TraceRow {
  node: TraceNode
  index: number
  /** 1-based depth. */
  level: number
  posinset: number
  setsize: number
  expanded: boolean
  parent: TraceRow | undefined
}

const UNIT_TO_MS: Record<TraceTimeUnit, number> = { s: 1000, ms: 1, us: 1e-3, ns: 1e-6 }

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value)
    return Number.isFinite(number) ? number : undefined
  }
  return undefined
}

/**
 * Builds the span tree. Children are ordered by start time; a span whose parent is missing becomes a root, and a
 * parent chain that loops back on itself is broken at the earliest span of the loop.
 */
export function buildModel(spans: readonly TraceSpan[] | undefined, unit: TraceTimeUnit = 'ms'): TraceModel {
  const scale = UNIT_TO_MS[unit] ?? 1
  const valid = (Array.isArray(spans) ? spans : []).filter(
    (span): span is TraceSpan => span !== null && typeof span === 'object' && toNumber(span.start) !== undefined,
  )
  // Times are taken relative to the earliest start before scaling, so nanosecond epochs keep what precision they have.
  let origin = Number.POSITIVE_INFINITY
  for (const span of valid) origin = Math.min(origin, toNumber(span.start)!)

  const nodes = new Map<string, TraceNode>()
  const byId = new Map<string, TraceNode>()
  const services: string[] = []
  const ordered: TraceNode[] = []
  let total = 0
  for (const span of valid) {
    const start = toNumber(span.start)!
    const end = toNumber(span.end)
    const raw = end !== undefined ? end - start : (toNumber(span.duration) ?? 0)
    const offset = (start - origin) * scale
    const duration = Math.max(0, raw) * scale
    let serviceIndex = -1
    if (span.service) {
      serviceIndex = services.indexOf(span.service)
      if (serviceIndex === -1) serviceIndex = services.push(span.service) - 1
    }
    const id = String(span.id ?? '')
    let key = id
    for (let n = 2; nodes.has(key); n++) key = `${id}#${n}`
    const node: TraceNode = { key, span, offset, duration, serviceIndex, children: [] }
    nodes.set(key, node)
    if (!byId.has(id)) byId.set(id, node)
    ordered.push(node)
    total = Math.max(total, offset + duration)
  }

  const parentOf = (node: TraceNode): TraceNode | undefined => {
    const parentId = node.span.parentId
    if (parentId === undefined || parentId === null || parentId === '') return undefined
    const parent = byId.get(String(parentId))
    return parent === node ? undefined : parent
  }
  // A span is a root when walking up from it never reaches a span without a parent: that walk is a loop, and the
  // earliest span on it becomes the root so the rest of the loop still hangs below it.
  const loopRoots = new Set<TraceNode>()
  const settled = new Set<TraceNode>()
  for (const node of ordered) {
    const path: TraceNode[] = []
    const onPath = new Set<TraceNode>()
    let current: TraceNode | undefined = node
    while (current && !settled.has(current) && !onPath.has(current)) {
      path.push(current)
      onPath.add(current)
      current = parentOf(current)
    }
    if (current && onPath.has(current)) {
      const loop = path.slice(path.indexOf(current))
      loopRoots.add(loop.reduce((earliest, candidate) => (candidate.offset < earliest.offset ? candidate : earliest)))
    }
    for (const visited of path) settled.add(visited)
  }

  const roots: TraceNode[] = []
  for (const node of ordered) {
    const parent = loopRoots.has(node) ? undefined : parentOf(node)
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const byStart = (a: TraceNode, b: TraceNode) => a.offset - b.offset
  roots.sort(byStart)
  for (const node of ordered) node.children.sort(byStart)
  return { roots, nodes, total, services }
}

/** Lists the visible lines, depth first. */
export function flatten(roots: readonly TraceNode[], isExpanded: (node: TraceNode, level: number) => boolean): TraceRow[] {
  const rows: TraceRow[] = []
  const visit = (siblings: readonly TraceNode[], level: number, parent: TraceRow | undefined) => {
    siblings.forEach((node, i) => {
      const expanded = node.children.length > 0 && isExpanded(node, level)
      const row: TraceRow = { node, index: rows.length, level, posinset: i + 1, setsize: siblings.length, expanded, parent }
      rows.push(row)
      if (expanded) visit(node.children, level + 1, row)
    })
  }
  visit(roots, 1, undefined)
  return rows
}

/** Keys of the spans whose name or service contains `query` (case-insensitive), and of every span above one. */
export function search(model: TraceModel, query: string): { matches: Set<string>; ancestors: Set<string> } {
  const matches = new Set<string>()
  const ancestors = new Set<string>()
  const needle = query.trim().toLowerCase()
  if (!needle) return { matches, ancestors }
  const visit = (node: TraceNode): boolean => {
    let below = false
    for (const child of node.children) if (visit(child)) below = true
    if (below) ancestors.add(node.key)
    const text = `${node.span.name ?? ''}\n${node.span.service ?? ''}`.toLowerCase()
    if (text.includes(needle)) matches.add(node.key)
    return below || matches.has(node.key)
  }
  for (const root of model.roots) visit(root)
  return { matches, ancestors }
}

function trim(value: number, digits: number): string {
  return String(Number(value.toFixed(digits)))
}

/** Formats milliseconds the way trace viewers do: `850µs`, `12.4ms`, `1.25s`, `2m 5s`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0ms'
  if (ms < 1) return `${trim(ms * 1000, ms < 0.01 ? 2 : 0)}µs`
  if (ms < 1000) return `${trim(ms, ms < 10 ? 2 : ms < 100 ? 1 : 0)}ms`
  if (ms < 60_000) return `${trim(ms / 1000, 2)}s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

/** Positions of the axis labels: `count` equal steps from 0 to `total`, inclusive. */
export function ticks(total: number, count = 4): number[] {
  if (!(total > 0)) return [0]
  return Array.from({ length: count + 1 }, (_, i) => (total * i) / count)
}
