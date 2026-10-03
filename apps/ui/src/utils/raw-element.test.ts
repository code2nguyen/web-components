import assert from 'node:assert/strict'
import test from 'node:test'

import { rawElement, stripServerRendering } from './raw-element.ts'

const serverRendered =
  '<c2-badge defer-hydration tone="primary"><template shadowrootmode="open"><style>:host{}</style><span></span></template><!--lit-part abc-->Latest<!--/lit-part--></c2-badge>'

test('stripServerRendering removes declarative shadow roots, Lit markers and defer-hydration', () => {
  assert.equal(stripServerRendering(serverRendered), '<c2-badge tone="primary">Latest</c2-badge>')
})

test('rawElement builds the tag with @c2n/core/raw-html.js and cleans the slotted HTML', () => {
  assert.equal(
    rawElement('c2-details', { label: 'More', open: true, hidden: false }, serverRendered),
    '<c2-details label="More" open><c2-badge tone="primary">Latest</c2-badge></c2-details>',
  )
})
