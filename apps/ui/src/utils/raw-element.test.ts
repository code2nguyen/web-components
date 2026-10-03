import assert from 'node:assert/strict'
import test from 'node:test'

import { escapeHtml, rawElement, serializeAttributes, stripServerRendering } from './raw-element.ts'

const serverRendered =
  '<c2-badge defer-hydration tone="primary"><template shadowrootmode="open"><style>:host{}</style><span></span></template><!--lit-part abc-->Latest<!--/lit-part--></c2-badge>'

test('stripServerRendering removes declarative shadow roots, Lit markers and defer-hydration', () => {
  assert.equal(stripServerRendering(serverRendered), '<c2-badge tone="primary">Latest</c2-badge>')
})

test('rawElement builds the tag and cleans the slotted HTML', () => {
  assert.equal(
    rawElement('c2-details', { label: 'More', open: true, hidden: false }, serverRendered),
    '<c2-details label="More" open><c2-badge tone="primary">Latest</c2-badge></c2-details>',
  )
})

test('escapeHtml escapes the characters that end text or a double-quoted attribute', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & "Jerry"</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &quot;Jerry&quot;&lt;/a&gt;')
  assert.equal(escapeHtml("it's"), "it's")
})

test('serializeAttributes writes true as a bare attribute and omits false, null and undefined', () => {
  assert.equal(serializeAttributes({ open: true, hidden: false, label: null, value: undefined }), ' open')
})

test('serializeAttributes quotes strings and numbers and escapes them', () => {
  assert.equal(serializeAttributes({ label: 'Say "hi" <now>', max: 10, empty: '' }), ' label="Say &quot;hi&quot; &lt;now&gt;" max="10" empty=""')
})

test('serializeAttributes writes objects and arrays as JSON the components parse back', () => {
  const rows = [{ id: 1, name: 'A & "B"' }]
  const html = serializeAttributes({ rows, options: { dense: true } })
  assert.equal(html, ' rows="[{&quot;id&quot;:1,&quot;name&quot;:&quot;A &amp; \\&quot;B\\&quot;&quot;}]" options="{&quot;dense&quot;:true}"')
  const unescaped = (html.match(/rows="([^"]*)"/)?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  assert.deepEqual(JSON.parse(unescaped), rows)
})

test('serializeAttributes rejects an attribute name that would break out of the tag', () => {
  for (const name of ['a b', 'a"', 'a>', 'a=b', 'a/', 'a\u0001', '']) {
    assert.throws(() => serializeAttributes({ [name]: 'x' }), TypeError, name)
  }
  // An omitted value is never written, so its name is not checked.
  assert.equal(serializeAttributes({ 'a b': false }), '')
})

test('rawElement wraps plain inner HTML unchanged', () => {
  assert.equal(rawElement('c2-tree-item', { value: 'src', expanded: true }, '<b>src</b>'), '<c2-tree-item value="src" expanded><b>src</b></c2-tree-item>')
  assert.equal(rawElement('c2-badge'), '<c2-badge></c2-badge>')
})

test('rawElement nests', () => {
  const items = ['a', 'b'].map((value) => rawElement('c2-list-item', { value }, escapeHtml(value.toUpperCase()))).join('')
  assert.equal(rawElement('c2-list', {}, items), '<c2-list><c2-list-item value="a">A</c2-list-item><c2-list-item value="b">B</c2-list-item></c2-list>')
})

test('rawElement rejects an invalid tag name', () => {
  for (const tag of ['', '1x', 'c2-x><script', 'c2 x']) assert.throws(() => rawElement(tag), TypeError, tag)
})
