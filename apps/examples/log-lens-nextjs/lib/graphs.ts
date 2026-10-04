/**
 * Graphs derived from the analysis, shaped for `c2-flow` (structurally its `FlowNode` / `FlowEdge`; kept local so
 * `lib/` stays free of component imports and testable under plain Node).
 */
import type { Analysis } from './analysis.ts'
import { isProblem } from './analysis.ts'
import { formatNumber, formatPercent, shorten } from './format.ts'

export type GraphStatus = 'pending' | 'current' | 'running' | 'success' | 'error' | 'warning' | 'skipped'

export interface GraphNode {
  id: string
  label: string
  status?: GraphStatus
  description?: string
  meta?: string
  details?: [string, string][]
  data?: { patternId?: string; service?: string }
}

export interface GraphEdge {
  source: string
  target: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/** The divergence as a pipeline: the common path, then the fork into a failing and a healthy branch. */
export function divergenceGraph(analysis: Analysis): Graph {
  const { divergence, patternById } = analysis
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const chain = (ids: string[]) => ids.slice(1).forEach((id, index) => edges.push({ source: ids[index], target: id }))

  const shared = divergence.sharedPath.map((patternId) => {
    const pattern = patternById.get(patternId)
    const id = `shared:${patternId}`
    nodes.push({
      id,
      label: shorten(pattern?.template ?? patternId, 44),
      status: 'success',
      description: `${pattern?.services.join(', ') ?? ''} · both paths`,
      meta: patternId,
      details: [
        ['Pattern', pattern?.template ?? patternId],
        ['Seen in', 'failed and successful requests'],
      ],
      data: { patternId },
    })
    return id
  })
  chain(shared)

  const branch = (side: 'failed' | 'ok') => {
    const signatures = side === 'failed' ? divergence.signatures : divergence.missing
    const ids = signatures.map((signature) => {
      const pattern = patternById.get(signature.patternId)
      const own = side === 'failed' ? signature.failedShare : signature.okShare
      const other = side === 'failed' ? signature.okShare : signature.failedShare
      const id = `${side}:${signature.patternId}`
      nodes.push({
        id,
        label: shorten(pattern?.template ?? signature.patternId, 44),
        status: side === 'ok' ? 'success' : pattern && isProblem(pattern.severity) ? 'error' : 'warning',
        description: pattern?.services.join(', '),
        meta: formatPercent(own),
        details: [
          ['Pattern', pattern?.template ?? signature.patternId],
          [side === 'failed' ? 'In failed requests' : 'In successful requests', formatPercent(own)],
          [side === 'failed' ? 'In successful requests' : 'In failed requests', formatPercent(other)],
        ],
        data: { patternId: signature.patternId },
      })
      return id
    })
    chain(ids)
    if (ids.length && shared.length) edges.push({ source: shared[shared.length - 1], target: ids[0] })
  }
  branch('failed')
  branch('ok')
  return { nodes, edges }
}

/** Who talks to whom: one node per service, one edge per observed hop between consecutive records of a request. */
export function serviceMap(analysis: Analysis): Graph {
  const hops = new Map<string, { source: string; target: string; count: number; failed: number }>()
  const requests = new Map<string, number>()
  for (const journey of analysis.journeys) {
    for (const service of journey.services) requests.set(service, (requests.get(service) ?? 0) + 1)
    let previous = ''
    for (const index of journey.records) {
      const service = analysis.records[index].service
      if (previous && previous !== service) {
        const key = `${previous}\u0000${service}`
        const hop = hops.get(key) ?? { source: previous, target: service, count: 0, failed: 0 }
        hop.count++
        if (journey.failed) hop.failed++
        hops.set(key, hop)
      }
      previous = service
    }
  }
  // A hop seen only once or twice is noise (a stray log line), not a dependency.
  const edges = [...hops.values()].filter((hop) => hop.count >= Math.max(2, analysis.journeys.length * 0.002))
  const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]))
  const nodes: GraphNode[] = analysis.services
    .filter((service) => connected.has(service.name))
    .map((service) => {
      const errorShare = service.problems / service.count
      const warnShare = service.warnings / service.count
      const outgoing = edges.filter((edge) => edge.source === service.name)
      return {
        id: service.name,
        label: service.name,
        status: errorShare >= 0.005 ? 'error' : warnShare >= 0.005 ? 'warning' : 'success',
        description: `${formatNumber(requests.get(service.name) ?? 0)} requests`,
        meta: service.problems ? `${formatNumber(service.problems)} err` : formatNumber(service.count),
        details: [
          ['Records', formatNumber(service.count)],
          ['Errors', `${formatNumber(service.problems)} (${formatPercent(errorShare, 1)})`],
          ['Warnings', `${formatNumber(service.warnings)} (${formatPercent(warnShare, 1)})`],
          ...outgoing.map((edge): [string, string] => [
            `→ ${edge.target}`,
            `${formatNumber(edge.count)} hops, ${formatNumber(edge.failed)} in failed requests`,
          ]),
        ],
        data: { service: service.name },
      }
    })
  return { nodes, edges: edges.map(({ source, target }) => ({ source, target })) }
}
