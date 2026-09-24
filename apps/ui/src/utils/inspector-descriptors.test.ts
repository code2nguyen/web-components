import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CSSDeclarationItem } from '../store/manifest-declaration-item.ts'
import { buildInspectorDescriptors, selectInspectorProperties } from './inspector-descriptors.ts'

const item = (property: string, type = 'pixel'): CSSDeclarationItem => ({
  cssVariable: `--c2-example__container--${property}`,
  type,
  default: '0',
  blocks: ['c2-example', 'container'],
  property,
})

test('every public property appears in exactly one descriptor', () => {
  const properties = [item('color', 'color'), item('width'), item('custom-thing', 'unknown')]
  const rows = buildInspectorDescriptors(properties)
  assert.deepEqual(rows.flatMap((row) => row.names).sort(), properties.map((entry) => entry.cssVariable).sort())
  assert.equal(rows.find((row) => row.names[0].endsWith('custom-thing'))?.controlFamily, 'text')
  assert.throws(() => buildInspectorDescriptors([...properties, properties[0]]), /duplicate/i)
})

test('four side and corner controls have exact documented order and cardinality', () => {
  const padding = ['padding-left', 'padding-top', 'padding-bottom', 'padding-right'].map((name) => item(name, 'padding'))
  const radius = ['border-bottom-left-radius', 'border-top-right-radius', 'border-top-left-radius', 'border-bottom-right-radius'].map((name) =>
    item(name, 'border-radius'),
  )
  const rows = buildInspectorDescriptors([...padding, ...radius])
  assert.deepEqual(rows.find((row) => row.controlFamily === 'padding-sides')?.names, [
    item('padding-top').cssVariable,
    item('padding-right').cssVariable,
    item('padding-bottom').cssVariable,
    item('padding-left').cssVariable,
  ])
  assert.deepEqual(rows.find((row) => row.controlFamily === 'radius-corners')?.names, [
    item('border-top-left-radius').cssVariable,
    item('border-top-right-radius').cssVariable,
    item('border-bottom-right-radius').cssVariable,
    item('border-bottom-left-radius').cssVariable,
  ])
})

test('shorthand and four longhands never become a five-name control', () => {
  const properties = [
    item('border-radius', 'border-radius'),
    ...['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'].map((name) =>
      item(name, 'border-radius'),
    ),
  ]
  const rows = buildInspectorDescriptors(properties)
  assert.deepEqual(
    rows.filter((row) => row.controlFamily.startsWith('radius')).map((row) => row.names.length),
    [1, 4],
  )
  assert.equal(new Set(rows.flatMap((row) => row.names)).size, 5)
})

test('incomplete longhand groups stay independent instead of gaining synthetic values', () => {
  const rows = buildInspectorDescriptors([item('padding-left', 'padding'), item('padding-right', 'padding')])
  assert.equal(rows.length, 2)
  assert.ok(rows.every((row) => row.names.length === 1 && row.controlFamily === 'text'))
})

test('selection follows the owning manifest even when its shared namespace differs from the tag', () => {
  const own = { ...item('color', 'color'), cssVariable: '--c2-chart--color' }
  const child = { ...item('width'), cssVariable: '--c2-child--width' }
  assert.deepEqual(
    selectInspectorProperties([own, child], [own]).map((entry) => entry.cssVariable),
    ['--c2-chart--color'],
  )
  assert.deepEqual(
    selectInspectorProperties([own, child], [child]).map((entry) => entry.cssVariable),
    ['--c2-child--width'],
  )
})
