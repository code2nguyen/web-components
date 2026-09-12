import assert from 'node:assert/strict'
import test from 'node:test'
import { hasGlobalTestImpact, selectComponentTestDirectories } from './run-changed-component-tests.mjs'

const suites = ['open-packages/chatbot/test', 'packages/components/button/test', 'packages/components/select/test']

test('selects only directly changed component packages', () => {
  assert.deepEqual(selectComponentTestDirectories(['packages/components/button/src/button.ts', 'apps/ui/src/pages/index.astro'], suites), [
    'packages/components/button/test',
  ])
})

test('selects every changed component package once', () => {
  assert.deepEqual(
    selectComponentTestDirectories(
      ['packages/components/select/src/select.ts', 'open-packages/chatbot/test/chatbot.spec.ts', 'packages/components/select/src/select.scss'],
      suites,
    ),
    ['open-packages/chatbot/test', 'packages/components/select/test'],
  )
})

test('runs all suites for shared runtime and test infrastructure changes', () => {
  for (const file of ['packages/core/src/dom-helper.ts', 'packages/tools/sass/variables.scss', 'tests/component-fixture.ts', 'playwright.config.ts']) {
    assert.equal(hasGlobalTestImpact([file]), true)
    assert.deepEqual(selectComponentTestDirectories([file], suites), suites)
  }
})

test('ignores packages without a component suite', () => {
  assert.deepEqual(selectComponentTestDirectories(['packages/components/table/src/table.ts'], suites), [])
})
