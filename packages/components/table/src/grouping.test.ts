import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildGroupTree, buildRemoteGroupTree, expansionResolver, flattenGroups, groupKey, toggleExpansion, type GroupNode } from './grouping.ts'

const rows = [
  { id: 1, region: 'EMEA', status: 'Paid' },
  { id: 2, region: 'APAC', status: 'Paid' },
  { id: 3, region: 'EMEA', status: 'Open' },
  { id: 4, region: '', status: 'Paid' },
]
const valueOf = (row: Record<string, unknown>, level: { field: string }) => row[level.field]
const byValue = (_level: unknown, nodes: GroupNode[]) => nodes.sort((a, b) => String(a.value).localeCompare(String(b.value)))

test('keys escape the separators and an empty value is its own group', () => {
  assert.equal(groupKey(undefined, 'a/b', 'x=y;z'), 'a%2Fb=x%3Dy%3Bz')
  const tree = buildGroupTree(rows, [{ field: 'region' }], valueOf, byValue)
  assert.deepEqual(
    tree.roots.map((node) => [node.key, node.count]),
    [
      ['region=', 1],
      ['region=APAC', 1],
      ['region=EMEA', 2],
    ],
  )
})

test('the display list follows the open groups and nests sub-groups', () => {
  const tree = buildGroupTree(rows, [{ field: 'region' }, { field: 'status' }], valueOf, byValue)
  const closed = new Set(['region=EMEA/status=Open'])
  const items = flattenGroups(tree, (node) => !closed.has(node.key))
  const lines = items.map((item) => (item.kind === 'group' ? item.node.key : `row ${rows[item.rowIndex].id}`))
  assert.deepEqual(lines, [
    'region=',
    'region=/status=Paid',
    'row 4',
    'region=APAC',
    'region=APAC/status=Paid',
    'row 2',
    'region=EMEA',
    'region=EMEA/status=Open',
    'region=EMEA/status=Paid',
    'row 1',
  ])
  assert.equal(tree.nodes.get('region=EMEA/status=Open')!.position, 7)
})

test('only the exception to the default is recorded', () => {
  let state = { expanded: undefined as readonly string[] | undefined, collapsed: undefined as readonly string[] | undefined, collapsedByDefault: false }
  state = { ...state, ...toggleExpansion(state, 'a', false) }
  assert.deepEqual(state, { expanded: undefined, collapsed: ['a'], collapsedByDefault: false })
  const isOpen = expansionResolver(state)
  assert.equal(isOpen('a'), false)
  assert.equal(isOpen('new'), true)
  state = { ...state, ...toggleExpansion(state, 'a', true) }
  assert.deepEqual(state.collapsed, [])

  const collapsed = { collapsedByDefault: true }
  const opened = toggleExpansion(collapsed, 'b', true)
  assert.deepEqual(opened.expanded, ['b'])
  assert.equal(expansionResolver({ ...collapsed, ...opened })('new'), false)
})

test('a remote tree nests ranges and places fetched blocks', () => {
  const lists = new Map([
    [
      '',
      [
        { value: 'A', count: 3 },
        { value: 'B', count: 2 },
      ],
    ],
  ])
  const tree = buildRemoteGroupTree([{ field: 'region' }], lists, (key) => (key === 'region=B' ? new Map([[0, [{ id: 'b1' }, { id: 'b2' }]]]) : undefined), 100)
  assert.equal(tree.source.length, 5)
  assert.deepEqual(tree.nodes.get('region=B')!.range, { start: 3, count: 2 })
  assert.deepEqual(tree.source[3], { id: 'b1' })
  assert.equal(tree.source[0], undefined)
  const items = flattenGroups(tree, () => true)
  assert.equal(items.length, 2 + 5)
})
