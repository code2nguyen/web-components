import assert from 'node:assert/strict'
import test from 'node:test'

import { groupEntries, parseCommit, renderMarkdown } from './generate-changelog.mjs'

const commit = (subject, body = '') => ({ hash: '0123456789abcdef', subject, body })

test('reads conventional commits with their scopes', () => {
  assert.deepEqual(parseCommit(commit('feat(table): group rows by one or more fields')), {
    type: 'feat',
    scopes: ['table'],
    text: 'Group rows by one or more fields',
    hash: '0123456',
  })
  assert.equal(parseCommit(commit('test(menu, tree): cover keyboard focus')), null)
  assert.deepEqual(parseCommit(commit('fix(list, select): keep focus on close'))?.scopes, ['list', 'select'])
})

test('drops housekeeping, release commits and noise', () => {
  for (const subject of [
    'chore: bump deps',
    'ci(release): retry push',
    'test(ui): add case',
    'chore(release): publish v0.0.19',
    'update',
    'wip tabs',
    'stash',
  ]) {
    assert.equal(parseCommit(commit(subject)), null, subject)
  }
  assert.equal(parseCommit(commit('fix(ci): build before type-checking')), null)
})

test('marks breaking changes from ! or a BREAKING CHANGE footer', () => {
  assert.equal(parseCommit(commit('feat(core)!: drop the old helper'))?.type, 'breaking')
  assert.equal(parseCommit(commit('refactor(core): rename helper', 'BREAKING CHANGE: renamed'))?.type, 'breaking')
})

test('files docs-site scopes separately', () => {
  assert.equal(parseCommit(commit('fix(ui): keep the drawer close button on one row'))?.type, 'site')
  assert.equal(parseCommit(commit('feat(ui, table): sticky header'))?.type, 'feat')
})

test('classifies free-form sentences and finds the component they name', () => {
  assert.deepEqual(parseCommit(commit('Add c2-banner component')), { type: 'feat', scopes: ['banner'], text: 'Add c2-banner component', hash: '0123456' })
  assert.equal(parseCommit(commit('Fix tabs accessibility and chart font sizing'))?.type, 'fix')
  assert.equal(parseCommit(commit('Make switch thumb follow track height'))?.type, 'improve')
  assert.equal(parseCommit(commit('fix attachment browser tests')), null)
})

test('keeps a leading file name lowercase', () => {
  assert.equal(parseCommit(commit('feat(ui): llms.txt for agents'))?.text, 'llms.txt for agents')
})

test('groups by section order and removes duplicates', () => {
  const entries = ['fix(a): one', 'feat(b): two', 'feat(c): two', 'fix(ui): site'].map((subject) => parseCommit(commit(subject)))
  const sections = groupEntries(entries)
  assert.deepEqual(
    sections.map((section) => [section.type, section.items.length]),
    [
      ['feat', 1],
      ['fix', 1],
      ['site', 1],
    ],
  )
  const markdown = renderMarkdown([{ version: '1.0.0', date: '2026-10-01', sections }])
  assert.match(markdown, /## \[1\.0\.0\]\(.+\/releases\/tag\/v1\.0\.0\) — 2026-10-01/)
  assert.match(markdown, /- \*\*b:\*\* Two \(\[0123456\]/)
})
