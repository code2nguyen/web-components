import assert from 'node:assert/strict'
import test from 'node:test'

import { analyze } from '../../lib/analysis.ts'
import { divergenceGraph, serviceMap } from '../../lib/graphs.ts'
import { parseOtlpLogs } from '../../lib/otlp.ts'
import { createSampleJsonl } from '../../lib/sample.ts'

const analysis = analyze(parseOtlpLogs(createSampleJsonl()).records)

test('the divergence graph is the common path, then a failing and a healthy branch', () => {
  const { nodes, edges } = divergenceGraph(analysis)
  const ids = new Set(nodes.map((node) => node.id))
  assert.ok(
    edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)),
    'every edge joins two nodes',
  )
  const lastShared = `shared:${analysis.divergence.sharedPath.at(-1)}`
  const fork = edges.filter((edge) => edge.source === lastShared).map((edge) => edge.target.split(':')[0])
  assert.deepEqual(fork.sort(), ['failed', 'ok'])
  assert.ok(nodes.filter((node) => node.id.startsWith('failed:')).some((node) => node.status === 'error'))
  assert.ok(nodes.filter((node) => node.id.startsWith('ok:')).every((node) => node.status === 'success'))
  assert.ok(nodes.every((node) => node.data?.patternId && analysis.patternById.has(node.data.patternId)))
})

test('the service map follows request hops and marks the failing services', () => {
  const { nodes, edges } = serviceMap(analysis)
  const status = Object.fromEntries(nodes.map((node) => [node.id, node.status]))
  assert.equal(status.payment, 'error')
  assert.equal(status.cart, 'success')
  assert.ok(edges.some((edge) => edge.source === 'checkout' && edge.target === 'payment'))
  assert.ok(edges.some((edge) => edge.source === 'frontend' && edge.target === 'cart'))
})
