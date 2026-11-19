import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flowList, parseFrontmatter } from './frontmatter.ts'

test('keywords read the same from a flow list and a block list, apostrophes included', () => {
  const inline = parseFrontmatter("---\ntitle: Rate\nkeywords: ['stars', \"review\", 'it''s', plain]\n---\nbody").frontmatter
  assert.deepEqual(flowList(inline.keywords), ['stars', 'review', "it's", 'plain'])
  const block = parseFrontmatter("---\ntitle: Rate\nkeywords:\n  - stars\n  - 'it''s'\ncategory: Inputs\n---\n").frontmatter
  assert.deepEqual(flowList(block.keywords), ['stars', "it's"])
  assert.equal(block.category, 'Inputs')
})

test('a block-list item with a comma stays one keyword', () => {
  const block = parseFrontmatter('---\nkeywords:\n  - right click, context\n  - menu\n---\n').frontmatter
  assert.deepEqual(flowList(block.keywords), ['right click, context', 'menu'])
})
