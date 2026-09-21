import assert from 'node:assert/strict'
import test from 'node:test'

import { renderManifestDescription } from './manifest-description.ts'

test('renders manifest code spans without instantiating their HTML', () => {
  assert.equal(renderManifestDescription('Wraps text in `<mark part="highlight">`.'), 'Wraps text in <code>&lt;mark part=&quot;highlight&quot;&gt;</code>.')
})

test('escapes raw HTML in manifest descriptions', () => {
  assert.equal(renderManifestDescription('Never trust <mark>raw manifest HTML</mark>.'), 'Never trust &lt;mark&gt;raw manifest HTML&lt;/mark&gt;.')
})

test('renders the other inline Markdown used by component documentation', () => {
  assert.equal(
    renderManifestDescription('An **important** [reference](https://example.com).'),
    'An <strong>important</strong> <a href="https://example.com">reference</a>.',
  )
})
