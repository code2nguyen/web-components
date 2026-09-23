import type { AlertRule, Incident, IncidentEventState, IncidentState, TelemetryDataset } from '../../lib/domain/telemetry.ts'
import type { StorageLike } from '../../lib/storage/browser-store.ts'
import { createEnvelope } from '../../lib/storage/envelope.ts'
import { STORAGE_KEYS, createAlertOverlayValidator, type AlertMutationData, type StoredAlertRule } from '../../lib/storage/keys.ts'
import { createDeterministicRuleId, mergeAlertRules, validateAlertRuleDraft, type AlertRuleDraft, type AlertRuleValidationResult } from './alert-rules.ts'

export type RuleWorkflowState = 'draft' | 'invalid' | 'previewed' | 'saved' | 'edited'
export type RuleWorkflowEvent = 'validate-invalid' | 'preview' | 'save' | 'edit' | 'cancel'

const workflowTransitions: Record<RuleWorkflowState, Partial<Record<RuleWorkflowEvent, RuleWorkflowState>>> = {
  draft: { 'validate-invalid': 'invalid', preview: 'previewed', save: 'saved', cancel: 'draft' },
  invalid: { 'validate-invalid': 'invalid', preview: 'previewed', cancel: 'draft' },
  previewed: { 'validate-invalid': 'invalid', preview: 'previewed', save: 'saved', cancel: 'draft' },
  saved: { edit: 'edited', cancel: 'saved' },
  edited: { 'validate-invalid': 'invalid', preview: 'previewed', save: 'saved', cancel: 'saved' },
}

export function transitionRuleWorkflow(state: RuleWorkflowState, event: RuleWorkflowEvent): RuleWorkflowState {
  return workflowTransitions[state][event] ?? state
}

export interface AlertSaveResult {
  ok: boolean
  persisted: boolean
  rule: AlertRule | null
  validation: AlertRuleValidationResult
  message: string
}

export interface AlertStore {
  getSnapshot(): AlertMutationData
  hydrate(): AlertMutationData
  effectiveRules(): AlertRule[]
  save(draft: AlertRuleDraft, editingRuleId?: string): AlertSaveResult
  setEnabled(ruleId: string, enabled: boolean): AlertSaveResult
  reset(): boolean
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function parseNeighborSafe(raw: string | null, dataset: TelemetryDataset): AlertMutationData {
  if (!raw) return { rulesById: {} }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || (parsed as { schemaVersion?: unknown }).schemaVersion !== 1) return { rulesById: {} }
    const data = (parsed as { data?: unknown }).data
    if (!data || typeof data !== 'object' || !(data as { rulesById?: unknown }).rulesById || typeof (data as { rulesById: unknown }).rulesById !== 'object') {
      return { rulesById: {} }
    }
    const rulesById: Record<string, StoredAlertRule> = {}
    const validate = createAlertOverlayValidator({
      serviceIds: dataset.services.map(({ id }) => id),
      destinationIds: dataset.destinations.map(({ id }) => id),
    })
    for (const [id, rule] of Object.entries((data as { rulesById: Record<string, unknown> }).rulesById)) {
      if (validate({ rulesById: { [id]: rule } })) rulesById[id] = rule as StoredAlertRule
    }
    return { rulesById }
  } catch {
    return { rulesById: {} }
  }
}

export function createAlertStore(dataset: TelemetryDataset, storageFactory: () => StorageLike | null | undefined = defaultStorage): AlertStore {
  let snapshot: AlertMutationData = { rulesById: {} }
  const resolveStorage = () => {
    try {
      return storageFactory() ?? null
    } catch {
      return null
    }
  }
  const persist = () => {
    const storage = resolveStorage()
    if (!storage) return false
    try {
      storage.setItem(STORAGE_KEYS.alerts, JSON.stringify(createEnvelope(snapshot)))
      return true
    } catch {
      return false
    }
  }

  const store: AlertStore = {
    getSnapshot: () => snapshot,
    hydrate() {
      const storage = resolveStorage()
      if (!storage) return snapshot
      try {
        snapshot = parseNeighborSafe(storage.getItem(STORAGE_KEYS.alerts), dataset)
      } catch {
        snapshot = { rulesById: {} }
      }
      return snapshot
    },
    effectiveRules: () => mergeAlertRules(dataset.alertRules, snapshot.rulesById),
    save(draft, editingRuleId) {
      const effectiveRules = store.effectiveRules()
      const validation = validateAlertRuleDraft(draft, {
        services: dataset.services,
        destinations: dataset.destinations,
        rules: effectiveRules,
        editingRuleId,
      })
      if (!validation.valid || !validation.value) {
        return { ok: false, persisted: false, rule: null, validation, message: 'Fix the validation errors before saving.' }
      }
      const id = editingRuleId ?? createDeterministicRuleId(effectiveRules)
      const rule: StoredAlertRule = { id, ...validation.value, origin: 'local' }
      snapshot = { rulesById: { ...snapshot.rulesById, [id]: rule } }
      const persisted = persist()
      return {
        ok: persisted,
        persisted,
        rule,
        validation,
        message: persisted ? 'Alert rule saved locally.' : 'Alert rule is available for this session, but browser storage could not save it.',
      }
    },
    setEnabled(ruleId, enabled) {
      const rule = store.effectiveRules().find(({ id }) => id === ruleId)
      if (!rule) {
        const validation: AlertRuleValidationResult = {
          valid: false,
          errors: { name: 'Alert rule was not found.' },
          firstInvalidField: 'name',
          value: null,
        }
        return { ok: false, persisted: false, rule: null, validation, message: 'Alert rule was not found.' }
      }
      return store.save(
        {
          name: rule.name,
          signal: rule.signal,
          serviceIds: [...rule.serviceIds],
          operator: rule.operator,
          threshold: rule.threshold,
          evaluationWindowMinutes: rule.evaluationWindowMinutes,
          severity: rule.severity,
          owner: rule.owner,
          destinationIds: [...rule.destinationIds],
          enabled,
        },
        rule.id,
      )
    },
    reset() {
      snapshot = { rulesById: {} }
      const storage = resolveStorage()
      if (!storage) return false
      try {
        storage.removeItem(STORAGE_KEYS.alerts)
        return true
      } catch {
        return false
      }
    },
  }
  return store
}

const incidentTransitions: Record<IncidentEventState, ReadonlySet<IncidentState>> = {
  triggered: new Set(['acknowledged', 'muted']),
  active: new Set(['acknowledged', 'muted', 'resolved']),
  acknowledged: new Set(['muted', 'resolved']),
  muted: new Set(['active', 'resolved']),
  resolved: new Set(),
}

export function transitionIncident(incident: Incident, state: IncidentState, offsetMs: number, actor: string, note: string): Incident {
  const previous = incident.timeline.at(-1)?.state ?? 'triggered'
  if (!incidentTransitions[previous].has(state) || offsetMs < (incident.timeline.at(-1)?.offsetMs ?? incident.startedOffsetMs)) {
    throw new Error(`Invalid incident transition from ${previous} to ${state}`)
  }
  return {
    ...incident,
    state,
    resolvedOffsetMs: state === 'resolved' ? offsetMs : null,
    timeline: [
      ...incident.timeline,
      {
        id: `${incident.id}-event-${incident.timeline.length + 1}`,
        state,
        offsetMs,
        actor: actor.trim() || 'Demo on-call',
        note: note.trim() || `${state} in the local simulation`,
      },
    ],
  }
}
