import assert from 'node:assert/strict'
import test from 'node:test'

import { telemetryDataset } from '../../lib/data/dataset.ts'
import type { AlertRule } from '../../lib/domain/telemetry.ts'
import {
  createAlertRuleDraft,
  createDeterministicRuleId,
  mergeAlertRules,
  previewAlertRule,
  validateAlertRuleDraft,
} from '../../features/alerts/alert-rules.ts'

const context = {
  services: telemetryDataset.services,
  destinations: telemetryDataset.destinations,
  rules: telemetryDataset.alertRules,
}

test('validates every required rule field without discarding valid input', () => {
  const result = validateAlertRuleDraft(
    {
      ...createAlertRuleDraft(),
      name: '   ',
      serviceIds: ['missing-service'],
      threshold: Number.NaN,
      evaluationWindowMinutes: 7,
      severity: '' as AlertRule['severity'],
      owner: '',
      destinationIds: ['missing-destination', 'missing-destination'],
      enabled: undefined,
    },
    context,
  )

  assert.equal(result.valid, false)
  assert.equal(result.firstInvalidField, 'name')
  assert.deepEqual(Object.keys(result.errors), ['name', 'serviceIds', 'threshold', 'evaluationWindowMinutes', 'severity', 'owner', 'destinationIds', 'enabled'])
})

test('requires a trimmed case-insensitively unique name', () => {
  const baseline = telemetryDataset.alertRules[0]
  const duplicate = validateAlertRuleDraft({ ...createAlertRuleDraft(baseline), name: `  ${baseline.name.toUpperCase()}  ` }, context)
  assert.match(duplicate.errors.name ?? '', /already exists/i)

  const editing = validateAlertRuleDraft({ ...createAlertRuleDraft(baseline), name: ` ${baseline.name} ` }, { ...context, editingRuleId: baseline.id })
  assert.equal(editing.valid, true)
  assert.equal(editing.value?.name, baseline.name)
})

test('enforces signal-specific finite threshold bounds and allowed windows', () => {
  const source = telemetryDataset.alertRules[0]
  const draft = createAlertRuleDraft(source)
  const editingContext = { ...context, editingRuleId: source.id }
  assert.match(validateAlertRuleDraft({ ...draft, signal: 'error-rate', threshold: 1.01 }, editingContext).errors.threshold ?? '', /between 0 and 1/i)
  assert.match(validateAlertRuleDraft({ ...draft, signal: 'saturation', threshold: 101 }, editingContext).errors.threshold ?? '', /between 0 and 100/i)
  assert.match(validateAlertRuleDraft({ ...draft, signal: 'latency', threshold: -1 }, editingContext).errors.threshold ?? '', /zero or greater/i)
  assert.equal(validateAlertRuleDraft({ ...draft, evaluationWindowMinutes: 30 }, editingContext).valid, true)
})

test('requires unique resolving services and synthetic destinations', () => {
  const draft = createAlertRuleDraft(telemetryDataset.alertRules[0])
  assert.match(validateAlertRuleDraft({ ...draft, serviceIds: [draft.serviceIds[0], draft.serviceIds[0]] }, context).errors.serviceIds ?? '', /unique/i)
  assert.match(
    validateAlertRuleDraft({ ...draft, destinationIds: [draft.destinationIds[0], draft.destinationIds[0]] }, context).errors.destinationIds ?? '',
    /unique/i,
  )
  assert.equal(validateAlertRuleDraft({ ...draft, destinationIds: [] }, context).valid, false)
})

test('creates stable local IDs and overlays immutable baseline rules', () => {
  const rules = telemetryDataset.alertRules
  assert.equal(createDeterministicRuleId(rules), 'local-rule-01')
  assert.equal(createDeterministicRuleId([...rules, { ...rules[0], id: 'local-rule-01' }, { ...rules[0], id: 'local-rule-03' }]), 'local-rule-02')

  const edited = { ...rules[0], name: 'Edited locally', origin: 'local' as const }
  const created = { ...rules[1], id: 'local-rule-01', name: 'Created locally', origin: 'local' as const }
  const merged = mergeAlertRules(rules, { [edited.id]: edited, [created.id]: created })
  assert.equal(merged.find(({ id }) => id === edited.id)?.name, 'Edited locally')
  assert.equal(merged.at(-1)?.id, 'local-rule-01')
  assert.equal(rules[0].origin, 'baseline')
})

test('projects a deterministic historical preview with firing intervals', () => {
  const draft = createAlertRuleDraft(telemetryDataset.alertRules.find(({ signal }) => signal === 'latency'))
  const first = previewAlertRule(draft, telemetryDataset)
  const second = previewAlertRule(draft, telemetryDataset)
  assert.deepEqual(first, second)
  assert.ok(first.samples.length > 0)
  assert.ok(first.samples.every(({ offsetMs, value }) => Number.isInteger(offsetMs) && Number.isFinite(value)))
  assert.equal(first.firingIntervals.length, first.samples.filter(({ firing }) => firing).length)
  assert.match(first.explanation, /synthetic historical/i)
})
