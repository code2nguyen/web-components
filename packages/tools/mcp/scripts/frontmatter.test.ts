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

test('intents, sentences with commas and apostrophes, read from a block list', () => {
  const block = parseFrontmatter("---\nintents:\n  - 'Pick one option, from a long list.'\n  - 'Show a user''s photo.'\n---\n").frontmatter
  assert.deepEqual(flowList(block.intents), ['Pick one option, from a long list.', "Show a user's photo."])
})

test('only the generator placeholder shape is a placeholder intent', async () => {
  const { PLACEHOLDER_INTENT } = await import('./frontmatter.ts')
  for (const placeholder of ['TODO: what a developer wants done.', 'todo : a need', 'TBD:', 'TBD', 'todo'])
    assert.ok(PLACEHOLDER_INTENT.test(placeholder), placeholder)
  // Deliberately not placeholders: only the generator's shape is recognised, never a guess at other spellings.
  for (const intent of ['Todo items the user ticks off as they go.', 'Todo-list items the user checks off.', 'Todo–list items', 'TODO - a need'])
    assert.ok(!PLACEHOLDER_INTENT.test(intent), intent)
})
