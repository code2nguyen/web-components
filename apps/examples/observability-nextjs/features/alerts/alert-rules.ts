import type { AlertRule, AlertSeverity, AlertSignal, MetricPoint, TelemetryDataset } from '../../lib/domain/telemetry.ts'

export const ALERT_EVALUATION_WINDOWS = [5, 10, 15, 30, 60] as const
export type AlertEvaluationWindow = (typeof ALERT_EVALUATION_WINDOWS)[number]

export interface AlertRuleDraft {
  name: string
  signal: AlertSignal
  serviceIds: string[]
  operator: AlertRule['operator']
  threshold: number
  evaluationWindowMinutes: number
  severity: AlertSeverity | ''
  owner: string
  destinationIds: string[]
  enabled: boolean | undefined
}

export type AlertRuleField = keyof AlertRuleDraft
export type AlertRuleErrors = Partial<Record<AlertRuleField, string>>

export interface AlertRuleValidationContext {
  services: TelemetryDataset['services']
  destinations: TelemetryDataset['destinations']
  rules: readonly AlertRule[]
  editingRuleId?: string
}

export interface AlertRuleValidationResult {
  valid: boolean
  errors: AlertRuleErrors
  firstInvalidField: AlertRuleField | null
  value: Omit<AlertRule, 'id' | 'origin'> | null
}

export interface AlertPreviewSample extends MetricPoint {
  value: number
  firing: boolean
}

export interface AlertPreview {
  samples: AlertPreviewSample[]
  firingIntervals: Array<{ offsetMs: number; value: number }>
  explanation: string
}

export function createAlertRuleDraft(rule?: AlertRule): AlertRuleDraft {
  if (rule) {
    return {
      name: rule.name,
      signal: rule.signal,
      serviceIds: [...rule.serviceIds],
      operator: rule.operator,
      threshold: rule.threshold,
      evaluationWindowMinutes: rule.evaluationWindowMinutes,
      severity: rule.severity,
      owner: rule.owner,
      destinationIds: [...rule.destinationIds],
      enabled: rule.enabled,
    }
  }
  return {
    name: '',
    signal: 'latency',
    serviceIds: [],
    operator: 'above',
    threshold: 500,
    evaluationWindowMinutes: 5,
    severity: 'warning',
    owner: '',
    destinationIds: [],
    enabled: true,
  }
}

function thresholdError(signal: AlertSignal, threshold: number): string | undefined {
  if (!Number.isFinite(threshold)) return 'Threshold must be a finite number.'
  if (threshold < 0) return 'Threshold must be zero or greater.'
  if (signal === 'error-rate' && threshold > 1) return 'Error-rate threshold must be between 0 and 1.'
  if (signal === 'saturation' && threshold > 100) return 'Saturation threshold must be between 0 and 100.'
  return undefined
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length
}

export function validateAlertRuleDraft(draft: AlertRuleDraft, context: AlertRuleValidationContext): AlertRuleValidationResult {
  const errors: AlertRuleErrors = {}
  const name = draft.name.trim()
  const owner = draft.owner.trim()
  const serviceIds = new Set(context.services.map(({ id }) => id))
  const destinationIds = new Set(context.destinations.map(({ id }) => id))

  if (!name) errors.name = 'Enter a rule name.'
  else if (
    context.rules.some(({ id, name: existingName }) => id !== context.editingRuleId && existingName.trim().toLocaleLowerCase() === name.toLocaleLowerCase())
  ) {
    errors.name = 'A rule with this name already exists.'
  }
  if (draft.serviceIds.length === 0) errors.serviceIds = 'Select at least one service.'
  else if (!hasUniqueValues(draft.serviceIds)) errors.serviceIds = 'Selected services must be unique.'
  else if (draft.serviceIds.some((id) => !serviceIds.has(id))) errors.serviceIds = 'One or more selected services are unavailable.'

  const invalidThreshold = thresholdError(draft.signal, draft.threshold)
  if (invalidThreshold) errors.threshold = invalidThreshold
  if (!ALERT_EVALUATION_WINDOWS.includes(draft.evaluationWindowMinutes as AlertEvaluationWindow)) {
    errors.evaluationWindowMinutes = 'Choose an allowed positive evaluation window.'
  }
  if (draft.severity !== 'warning' && draft.severity !== 'critical') errors.severity = 'Choose warning or critical severity.'
  if (!owner) errors.owner = 'Enter an owner.'
  if (draft.destinationIds.length === 0) errors.destinationIds = 'Select at least one synthetic destination.'
  else if (!hasUniqueValues(draft.destinationIds)) errors.destinationIds = 'Selected destinations must be unique.'
  else if (draft.destinationIds.some((id) => !destinationIds.has(id))) errors.destinationIds = 'One or more synthetic destinations are unavailable.'
  if (typeof draft.enabled !== 'boolean') errors.enabled = 'Choose whether the rule is enabled.'

  const firstInvalidField = (Object.keys(errors)[0] as AlertRuleField | undefined) ?? null
  return {
    valid: firstInvalidField === null,
    errors,
    firstInvalidField,
    value:
      firstInvalidField === null
        ? {
            name,
            signal: draft.signal,
            serviceIds: [...draft.serviceIds],
            operator: draft.operator,
            threshold: draft.threshold,
            evaluationWindowMinutes: draft.evaluationWindowMinutes,
            severity: draft.severity as AlertSeverity,
            owner,
            destinationIds: [...draft.destinationIds],
            enabled: draft.enabled as boolean,
          }
        : null,
  }
}

export function createDeterministicRuleId(rules: readonly Pick<AlertRule, 'id'>[]): string {
  const ids = new Set(rules.map(({ id }) => id))
  let sequence = 1
  while (ids.has(`local-rule-${String(sequence).padStart(2, '0')}`)) sequence += 1
  return `local-rule-${String(sequence).padStart(2, '0')}`
}

export function mergeAlertRules(baseline: readonly AlertRule[], overlays: Readonly<Record<string, AlertRule>>): AlertRule[] {
  const baselineIds = new Set(baseline.map(({ id }) => id))
  return [
    ...baseline.map((rule) => overlays[rule.id] ?? rule),
    ...Object.values(overlays)
      .filter(({ id }) => !baselineIds.has(id))
      .sort((left, right) => left.id.localeCompare(right.id)),
  ]
}

function metricForSignal(signal: AlertSignal): string {
  if (signal === 'latency') return 'latency-p95'
  if (signal === 'throughput') return 'request-rate'
  return signal
}

export function previewAlertRule(draft: AlertRuleDraft, dataset: TelemetryDataset): AlertPreview {
  const selected = new Set(draft.serviceIds)
  const threshold = draft.signal === 'error-rate' ? draft.threshold * 100 : draft.threshold
  const samples = dataset.metricSeries
    .filter(({ metric, serviceId }) => metric === metricForSignal(draft.signal) && serviceId !== null && selected.has(serviceId))
    .flatMap(({ points }) => points)
    .filter((point): point is AlertPreviewSample => point.value !== null)
    .sort((left, right) => left.offsetMs - right.offsetMs)
    .map(({ offsetMs, value }) => ({ offsetMs, value, firing: draft.operator === 'above' ? value > threshold : value < threshold }))

  return {
    samples,
    firingIntervals: samples.filter(({ firing }) => firing).map(({ offsetMs, value }) => ({ offsetMs, value })),
    explanation: `This synthetic historical projection compares ${samples.length} local samples with the ${draft.operator} ${draft.threshold} threshold. It is a preview, not production alert evaluation.`,
  }
}
