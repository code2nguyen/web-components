import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareSourceManifest, extractSourceCssProperties } from './lib/style-contract-source.mjs'

const tag = 'c2-example'
const sourceFile = 'src/example.ts'
const source = `/**
 * @tag c2-example
 * @cssproperty {border} [--c2-example--border-left=1px solid red]
 * @cssproperty {color} [--c2-example--color=blue]
 */
export class Example {}`
const manifestProperties = [
  { name: '--c2-example--border-left', type: { text: 'border' }, default: '1px solid red' },
  { name: '--c2-example--color', type: { text: 'color' }, default: 'blue' },
]

test('extracts exact name, type, default, and source location', () => {
  assert.deepEqual(extractSourceCssProperties(source, tag, sourceFile), [
    { name: '--c2-example--border-left', type: 'border', default: '1px solid red', source: `${sourceFile}:3` },
    { name: '--c2-example--color', type: 'color', default: 'blue', source: `${sourceFile}:4` },
  ])
  assert.deepEqual(compareSourceManifest({ tag, source, sourceFile, manifestProperties }), [])
})

test('rejects stale generated name, type, and default', () => {
  const failures = compareSourceManifest({
    tag,
    source,
    sourceFile,
    manifestProperties: [{ name: '--c2-example--borde-left', type: { text: 'pixel' }, default: '2px' }, manifestProperties[1]],
  })
  assert.ok(
    failures.some(({ category, name, suggestion }) => category === 'missing-manifest' && name.endsWith('border-left') && suggestion?.endsWith('borde-left')),
  )
  assert.ok(failures.some(({ category }) => category === 'stale-manifest'))
  const drift = compareSourceManifest({
    tag,
    source,
    sourceFile,
    manifestProperties: [{ ...manifestProperties[0], type: { text: 'pixel' }, default: '2px' }, manifestProperties[1]],
  })
  assert.deepEqual(
    drift.map(({ category }) => category),
    ['type-mismatch', 'default-mismatch'],
  )
})

test('rejects duplicate source declarations', () => {
  const repeated = source.replace(' */', ' * @cssproperty {color} [--c2-example--color=blue]\n */')
  assert.ok(compareSourceManifest({ tag, source: repeated, sourceFile, manifestProperties }).some(({ category }) => category === 'duplicate-property'))
})
