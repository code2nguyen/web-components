import assert from 'node:assert/strict'
import { test } from 'node:test'

import { boundsOf, layoutMindMap, resolveSides, type LayoutTopic } from './layout.ts'
import { countDescendants, fromOutline, insertNodes, moveNode, normalize, parseOutline, pathTo, removeNode, toOutline } from './tree.ts'
import type { MindMapNode } from './mind-map-types.ts'

const leaf = (id: string): LayoutTopic => ({ id, children: [] })
const size = () => ({ width: 100, height: 20 })
const options = { layout: 'both' as const, levelGap: 50, siblingGap: 10 }

test('sides: explicit sides are kept, the others go to the lighter side in order', () => {
  assert.deepEqual(resolveSides([{ weight: 5 }, { weight: 2 }, { weight: 2 }, { weight: 1 }], 'both'), ['right', 'left', 'left', 'left'])
  assert.deepEqual(resolveSides([{ side: 'left', weight: 1 }, { weight: 1 }], 'both'), ['left', 'right'])
  assert.deepEqual(resolveSides([{ side: 'left' }, {}], 'right'), ['right', 'right'])
  assert.deepEqual(resolveSides([{}, {}], 'left'), ['left', 'left'])
})

test('layout: the central topic is centred on the origin and branches grow outwards on each side', () => {
  const root: LayoutTopic = {
    id: 'r',
    children: [
      { ...leaf('a'), weight: 1 },
      { ...leaf('b'), weight: 1 },
    ],
  }
  const boxes = layoutMindMap(root, size, options)
  assert.deepEqual(boxes.get('r'), { x: -50, y: -10, width: 100, height: 20, side: 'center', level: 0, parent: null })
  assert.equal(boxes.get('a')!.x, 100)
  assert.equal(boxes.get('a')!.side, 'right')
  assert.equal(boxes.get('b')!.x, -200)
  assert.equal(boxes.get('b')!.side, 'left')
})

test('layout: a tidy tree: subtopics stack with the sibling gap and their parent is centred on them', () => {
  const root: LayoutTopic = { id: 'r', children: [{ id: 'a', side: 'right', children: [leaf('a1'), leaf('a2'), leaf('a3')] }] }
  const boxes = layoutMindMap(root, size, options)
  const ys = ['a1', 'a2', 'a3'].map((id) => boxes.get(id)!.y)
  assert.deepEqual(ys, [-40, -10, 20])
  assert.equal(boxes.get('a')!.y, -10)
  assert.equal(boxes.get('a1')!.x, 250)
  assert.equal(boxes.get('a1')!.level, 2)
  assert.equal(boxes.get('a1')!.parent, 'a')
})

test('layout: a subtree is as tall as its subtopics, so neighbouring subtrees never overlap', () => {
  const root: LayoutTopic = {
    id: 'r',
    children: [
      { id: 'a', side: 'right', children: [leaf('a1'), leaf('a2')] },
      { id: 'b', side: 'right', children: [] },
    ],
  }
  const boxes = layoutMindMap(root, size, options)
  const a2 = boxes.get('a2')!
  const b = boxes.get('b')!
  assert.ok(b.y >= a2.y + a2.height + 10 - 1e-9)
  // Taller topics push their neighbours apart too.
  const tall = layoutMindMap(root, (id) => (id === 'b' ? { width: 100, height: 80 } : { width: 100, height: 20 }), options)
  assert.ok(tall.get('b')!.y >= tall.get('a2')!.y + 20 + 10 - 1e-9)
})

test('layout: the left side is mirrored', () => {
  const root: LayoutTopic = { id: 'r', children: [{ id: 'a', side: 'left', children: [leaf('a1')] }] }
  const boxes = layoutMindMap(root, (id) => (id === 'a1' ? { width: 60, height: 20 } : size()), options)
  assert.equal(boxes.get('a')!.x, -200)
  assert.equal(boxes.get('a1')!.x, -200 - 50 - 60)
  assert.deepEqual(boundsOf(boxes.values()), { x: -310, y: -10, width: 360, height: 20 })
})

test('outline: an indented list both ways', () => {
  const map: MindMapNode = {
    id: 'r',
    label: 'Plan',
    children: [
      { id: 'a', label: 'Two\nlines', children: [{ id: 'b', label: 'Deep' }] },
      { id: 'c', label: 'Other' },
    ],
  }
  assert.equal(toOutline(map), '- Plan\n  - Two lines\n    - Deep\n  - Other')
  const back = fromOutline(toOutline(map))!
  assert.equal(back.label, 'Plan')
  assert.deepEqual(
    back.children!.map((child) => [child.label, (child.children ?? []).map((grand) => grand.label)]),
    [
      ['Two lines', ['Deep']],
      ['Other', []],
    ],
  )
  const forest = parseOutline('* One\n\t* Tab\n2. Two\nPlain\n    indented')
  assert.deepEqual(
    forest.map((node) => [node.label, (node.children ?? []).map((child) => child.label)]),
    [
      ['One', ['Tab']],
      ['Two', []],
      ['Plain', ['indented']],
    ],
  )
  assert.equal(fromOutline('- a\n- b')!.children!.length, 2)
  assert.equal(fromOutline('  '), null)
})

test('tree: normalize gives every node a unique id and keeps unknown fields', () => {
  const raw = {
    id: 'r',
    label: 'R',
    extra: 1,
    children: [{ id: 'x', label: 'A' }, { id: 'x', label: 'B' }, { label: 7 }, [], [{ id: 'y' }], { id: 'topic-0-1', label: 'Taken' }],
  }
  const doc = normalize(raw)!
  assert.equal(doc.extra, 1)
  const ids: string[] = []
  const walk = (node: MindMapNode) => {
    ids.push(node.id)
    for (const child of node.children ?? []) walk(child)
  }
  walk(doc)
  assert.equal(new Set(ids).size, ids.length)
  // Nested arrays are not topics.
  assert.deepEqual(
    doc.children!.map((child) => child.label),
    ['A', 'B', '7', 'Taken'],
  )
  assert.equal(doc.children![0].id, 'x')
  assert.equal(doc.children![2].label, '7')
  // Generated ids come from the path, so the server and the browser agree.
  assert.deepEqual(normalize(raw), doc)
  assert.equal(doc.children![2].id, 'topic-0-2')
})

test('tree: edits copy only the path to the change', () => {
  const doc: MindMapNode = {
    id: 'r',
    label: 'R',
    children: [
      { id: 'a', label: 'A', children: [{ id: 'a1', label: 'A1' }] },
      { id: 'b', label: 'B' },
    ],
  }
  const moved = moveNode(doc, 'a1', 'b', 0)
  assert.equal(moved.children![0].children!.length, 0)
  assert.equal(moved.children![1].children![0].id, 'a1')
  assert.equal(doc.children![0].children!.length, 1)
  // Reordering within one parent counts the index before the move.
  const reordered = moveNode(doc, 'a', 'r', 2)
  assert.deepEqual(
    reordered.children!.map((child) => child.id),
    ['b', 'a'],
  )
  // A topic cannot move into its own subtree.
  assert.equal(moveNode(doc, 'a', 'a1', 0), doc)
  const removed = removeNode(doc, 'a')
  assert.equal(removed.children!.length, 1)
  assert.equal(removed.children![0], doc.children![1])
  const inserted = insertNodes(doc, 'b', 5, [{ id: 'n', label: 'N' }])
  assert.equal(inserted.children![1].children![0].id, 'n')
  assert.deepEqual(
    pathTo(doc, 'a1')!.map((node) => node.id),
    ['r', 'a', 'a1'],
  )
  assert.equal(countDescendants(doc), 3)
})
