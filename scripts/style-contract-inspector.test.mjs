import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'
import { discoverPublishableContracts } from './lib/style-contract-discovery.mjs'
import { auditComposedInspectorMappings, auditInspectorMappings, auditInspectorRegistration } from './lib/style-contract-inspector.mjs'

test('every publishable package is registered in the UI manifest list', () => {
  const inventory = discoverPublishableContracts(resolve('.'))
  const source = readFileSync('apps/ui/src/store/component-manifests.ts', 'utf8')
  assert.deepEqual(auditInspectorRegistration(inventory.packages, source), [])
})

test('exact descriptor ownership rejects duplicate, missing, or wrong-target properties', () => {
  const property = { tag: 'c2-example', name: '--c2-example--color', type: 'color' }
  assert.deepEqual(auditInspectorMappings([property]), [])
  assert.ok(auditInspectorMappings([property, property]).some(({ category }) => category === 'duplicate-control'))
  assert.ok(auditInspectorMappings([{ ...property, writeTarget: 'c2-other' }]).some(({ category }) => category === 'wrong-target'))
})

test('composed child properties retain their child owner and expose missing/overlapping mappings', () => {
  const parent = { tag: 'c2-parent', declaration: { cssProperties: [{ name: '--c2-parent--color' }], slotComponents: ['c2-child'] } }
  const child = { tag: 'c2-child', declaration: { cssProperties: [{ name: '--c2-child--color' }] } }
  assert.deepEqual(auditComposedInspectorMappings([parent, child]), [])
  assert.ok(auditComposedInspectorMappings([parent]).some(({ category }) => category === 'missing-child-owner'))
  assert.ok(
    auditComposedInspectorMappings([parent, { ...child, declaration: { cssProperties: [{ name: '--c2-parent--color' }] } }]).some(
      ({ category }) => category === 'ambiguous-child-owner',
    ),
  )
})
