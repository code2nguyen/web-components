import type { TelemetryDataset } from '../domain/telemetry.ts'
import { validateTelemetryDataset } from '../domain/telemetry.ts'
import { createTelemetryDataset } from './generator.ts'

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

export function assertDatasetIntegrity(dataset: TelemetryDataset): void {
  const errors = validateTelemetryDataset(dataset)
  if (dataset.services.length < 8) errors.push('Dataset requires at least 8 services')
  if (dataset.traces.length < 150) errors.push('Dataset requires at least 150 traces')
  if (dataset.logs.length < 1_000) errors.push('Dataset requires at least 1,000 logs')
  if (dataset.alertRules.length < 8) errors.push('Dataset requires at least 8 alert rules')
  if (dataset.incidents.length < 6) errors.push('Dataset requires at least 6 incidents')
  if (errors.length > 0) throw new Error(`Telemetry dataset integrity failed:\n- ${errors.join('\n- ')}`)
}

const generatedDataset = createTelemetryDataset()
assertDatasetIntegrity(generatedDataset)

export const telemetryDataset = deepFreeze(generatedDataset)
