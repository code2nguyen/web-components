import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installedPackage, typeText } from '../src/installed.ts'
import { renderComponent, type ComponentRenderOptions } from '../src/render.ts'
import type { ComponentEntry } from '../src/registry-types.ts'

const badge: ComponentEntry = {
  id: 'badge',
  package: '@c2n/badge',
  title: 'Badge',
  description: 'A count or label.',
  category: 'Data display',
  status: 'stable',
  docsUrl: '',
  elements: [
    {
      tag: 'c2-badge',
      className: 'Badge',
      modulePath: '@c2n/badge',
      description: '',
      attributes: [{ name: 'kind', type: "'count' | 'label' | 'none'", default: "'count'" }],
      slots: [],
      events: [{ name: 'badge-change', type: 'CustomEvent<{ value: number }>' }],
      cssParts: [],
      cssProperties: [],
    },
  ],
  composition: { internal: [], slotted: [], usedBy: [] },
  install: { npm: 'npm i @c2n/badge', import: '', importClass: '' },
  examples: [],
  hasGallery: false,
}

const include: ComponentRenderOptions['include'] = new Set(['attributes', 'events'])

test('typeText reads a manifest type object and passes the registry text through', () => {
  assert.equal(typeText({ text: "'a' | 'b'" }), "'a' | 'b'")
  assert.equal(typeText('boolean'), 'boolean')
  assert.equal(typeText(undefined), undefined)
  assert.equal(typeText({}), undefined)
})

test('get_component markdown prints the type text of attributes and events from the registry', () => {
  const out = renderComponent(badge, { include, installed: null })
  assert.match(out, /\| `kind` \| `'count' \\\| 'label' \\\| 'none'` \|/)
  assert.match(out, /\| `badge-change` \| `CustomEvent<\{ value: number \}>` \|/)
})

test('get_component markdown prints the type text from an installed manifest, never [object Object]', () => {
  // An installed package's manifest is the analyzer's raw output: `type` is `{ text }` there.
  const root = mkdtempSync(join(tmpdir(), 'c2n-render-'))
  const previous = process.env.C2N_PROJECT_ROOT
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@c2n/badge': '*' } }))
    const dir = join(root, 'node_modules', '@c2n/badge')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@c2n/badge', version: '9.9.9', customElements: 'custom-elements.json' }))
    const declaration = {
      kind: 'class',
      name: 'Badge',
      tagName: 'c2-badge',
      attributes: [{ name: 'kind', type: { text: "'count' | 'label' | 'none'" }, default: "'count'", fieldName: 'kind' }],
      events: [{ name: 'badge-change', type: { text: 'CustomEvent<{ value: number }>' } }, { name: 'plain' }],
    }
    writeFileSync(join(dir, 'custom-elements.json'), JSON.stringify({ modules: [{ path: 'src/badge.js', declarations: [declaration] }] }))
    process.env.C2N_PROJECT_ROOT = root
    const installed = installedPackage('@c2n/badge')
    assert.ok(installed?.elements?.has('c2-badge'))
    const out = renderComponent(badge, { include, installed })
    assert.doesNotMatch(out, /object Object/)
    assert.match(out, /\| `kind` \| `'count' \\\| 'label' \\\| 'none'` \|/)
    assert.match(out, /\| `badge-change` \| `CustomEvent<\{ value: number \}>` \|/)
    assert.match(out, /\| `plain` \| — \|/)
  } finally {
    if (previous === undefined) delete process.env.C2N_PROJECT_ROOT
    else process.env.C2N_PROJECT_ROOT = previous
    rmSync(root, { recursive: true, force: true })
  }
})
