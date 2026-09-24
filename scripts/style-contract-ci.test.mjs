import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const workflow = (name) => readFileSync(new URL(`../.github/workflows/${name}.yml`, import.meta.url), 'utf8')

test('pull requests collect full-inventory diagnostics independently of changed-package tests', () => {
  const source = workflow('component-tests')
  assert.match(source, /branches:\s*\[develop, main\]/)
  assert.match(source, /name: Style-contract static diagnostic[\s\S]*?continue-on-error: true[\s\S]*?check-style-contracts\.mjs --json/)
  assert.match(source, /name: Style-contract browser diagnostic[\s\S]*?continue-on-error: true[\s\S]*?test:style-contracts/)
  assert.match(source, /name: Test changed component packages/)
  assert.match(source, /style-contract-static-report\.json/)
})

test('release and deployment record the audit before publishing or uploading', () => {
  for (const [name, laterStep] of [
    ['release', 'Version new release'],
    ['deploy', 'Upload Pages Artifact'],
  ]) {
    const source = workflow(name)
    const diagnostic = source.indexOf('name: Style-contract static diagnostic')
    assert.ok(diagnostic > 0, `${name}: missing style-contract diagnostic`)
    assert.ok(diagnostic < source.indexOf(`name: ${laterStep}`), `${name}: diagnostic must run before ${laterStep}`)
    assert.match(source.slice(diagnostic), /continue-on-error: true[\s\S]*?check-style-contracts\.mjs --json/)
    assert.match(source, /name: Upload style-contract static report/)
  }
})
