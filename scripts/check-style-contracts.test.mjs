import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

test('JSON mode exposes every sorted static failure, including those beyond human-output truncation', () => {
  const command = spawnSync(process.execPath, ['scripts/check-style-contracts.mjs', '--json'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(command.status, 1)
  const report = JSON.parse(command.stdout)
  assert.equal(report.kind, 'static-readiness')
  assert.equal(report.summary.failures, report.failures.length)
  assert.ok(report.failures.length > 50)
  for (const failure of [report.failures[0], report.failures[50], report.failures.at(-1)]) {
    assert.ok(failure.tag)
    assert.ok(failure.name)
    assert.ok(failure.category)
    assert.ok(failure.source)
    assert.ok(failure.state)
    assert.ok(failure.target)
  }
  const repeated = spawnSync(process.execPath, ['scripts/check-style-contracts.mjs', '--json'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(command.stdout, repeated.stdout)
})

test('unknown static-audit CLI options are input errors', () => {
  const command = spawnSync(process.execPath, ['scripts/check-style-contracts.mjs', '--unknown'], { cwd: process.cwd(), encoding: 'utf8' })
  assert.equal(command.status, 2)
})
