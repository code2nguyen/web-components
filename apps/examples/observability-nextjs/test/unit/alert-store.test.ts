import assert from 'node:assert/strict'
import test from 'node:test'

import { createEnvelope } from '../../lib/storage/envelope.ts'
import { STORAGE_KEYS, type AlertMutationData } from '../../lib/storage/keys.ts'
import type { StorageLike } from '../../lib/storage/browser-store.ts'
import { telemetryDataset } from '../../lib/data/dataset.ts'
import { createAlertRuleDraft } from '../../features/alerts/alert-rules.ts'
import { createAlertStore, transitionIncident, transitionRuleWorkflow } from '../../features/alerts/alert-store.ts'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  failSet = false

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    if (this.failSet) throw new DOMException('full', 'QuotaExceededError')
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

test('tracks draft-invalid-previewed-saved-edited transitions and preserves cancellation', () => {
  assert.equal(transitionRuleWorkflow('draft', 'validate-invalid'), 'invalid')
  assert.equal(transitionRuleWorkflow('invalid', 'preview'), 'previewed')
  assert.equal(transitionRuleWorkflow('previewed', 'save'), 'saved')
  assert.equal(transitionRuleWorkflow('saved', 'edit'), 'edited')
  assert.equal(transitionRuleWorkflow('edited', 'cancel'), 'saved')
  assert.equal(transitionRuleWorkflow('draft', 'cancel'), 'draft')
})

test('saves deterministic local overlays without mutating the baseline', () => {
  const storage = new MemoryStorage()
  const store = createAlertStore(telemetryDataset, () => storage)
  const baselineName = telemetryDataset.alertRules[0].name
  const draft = { ...createAlertRuleDraft(telemetryDataset.alertRules[0]), name: 'Locally edited latency' }
  const saved = store.save(draft, telemetryDataset.alertRules[0].id)
  assert.equal(saved.ok, true)
  assert.equal(saved.rule?.id, telemetryDataset.alertRules[0].id)
  assert.equal(store.effectiveRules()[0].name, 'Locally edited latency')
  assert.equal(telemetryDataset.alertRules[0].name, baselineName)

  const created = store.save({ ...draft, name: 'A separate local guardrail' })
  assert.equal(created.rule?.id, 'local-rule-01')
  assert.equal(store.effectiveRules().at(-1)?.id, 'local-rule-01')
})

test('failed persistence keeps valid in-memory state and reports recovery feedback', () => {
  const storage = new MemoryStorage()
  storage.failSet = true
  const store = createAlertStore(telemetryDataset, () => storage)
  const result = store.save({ ...createAlertRuleDraft(telemetryDataset.alertRules[0]), name: 'Session-only alert' })
  assert.equal(result.ok, false)
  assert.equal(result.persisted, false)
  assert.match(result.message, /session/i)
  assert.equal(store.effectiveRules().at(-1)?.name, 'Session-only alert')
})

test('hydrates valid persisted neighbors while isolating stale destinations', () => {
  const storage = new MemoryStorage()
  const first = { ...telemetryDataset.alertRules[0], name: 'Valid edit', origin: 'local' as const }
  const stale = { ...telemetryDataset.alertRules[1], name: 'Stale edit', destinationIds: ['removed-destination'], origin: 'local' as const }
  storage.values.set(
    STORAGE_KEYS.alerts,
    JSON.stringify(createEnvelope<AlertMutationData>({ rulesById: { [first.id]: first, [stale.id]: stale } }, '2026-09-21T10:00:00.000Z')),
  )

  const store = createAlertStore(telemetryDataset, () => storage)
  const hydrated = store.hydrate()
  assert.deepEqual(Object.keys(hydrated.rulesById), [first.id])
  assert.equal(store.effectiveRules().find(({ id }) => id === first.id)?.name, 'Valid edit')
  assert.equal(store.effectiveRules().find(({ id }) => id === stale.id)?.name, telemetryDataset.alertRules[1].name)
})

test('reset clears alert mutations only and restores baseline', () => {
  const storage = new MemoryStorage()
  storage.values.set(STORAGE_KEYS.theme, 'theme')
  storage.values.set(STORAGE_KEYS.dashboardDesktop, 'layout')
  const store = createAlertStore(telemetryDataset, () => storage)
  store.save({ ...createAlertRuleDraft(telemetryDataset.alertRules[0]), name: 'Temporary local rule' })
  assert.equal(store.reset(), true)
  assert.deepEqual(store.effectiveRules(), telemetryDataset.alertRules)
  assert.equal(storage.values.get(STORAGE_KEYS.theme), 'theme')
  assert.equal(storage.values.get(STORAGE_KEYS.dashboardDesktop), 'layout')
})

test('unknown rule commands fail without throwing or changing neighboring rules', () => {
  const store = createAlertStore(telemetryDataset, () => new MemoryStorage())
  const before = store.effectiveRules()
  const result = store.setEnabled('missing-rule', false)
  assert.equal(result.ok, false)
  assert.match(result.message, /not found/i)
  assert.deepEqual(store.effectiveRules(), before)
})

test('enforces incident triggered, acknowledged, muted, active and resolved transitions', () => {
  const incident = telemetryDataset.incidents[0]
  const acknowledged = transitionIncident(incident, 'acknowledged', 100, 'Demo on-call', 'Investigating')
  assert.equal(acknowledged.state, 'acknowledged')
  const muted = transitionIncident(acknowledged, 'muted', 200, 'Demo on-call', 'Maintenance window')
  assert.equal(muted.state, 'muted')
  const active = transitionIncident(muted, 'active', 300, 'Demo on-call', 'Window ended')
  assert.equal(active.state, 'active')
  const resolved = transitionIncident(active, 'resolved', 400, 'Demo on-call', 'Recovered')
  assert.equal(resolved.resolvedOffsetMs, 400)
  assert.throws(() => transitionIncident(resolved, 'acknowledged', 500, 'Demo on-call', 'Too late'), /Invalid incident transition/)
})
