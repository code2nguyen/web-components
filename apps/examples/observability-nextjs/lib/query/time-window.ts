import type { InvestigationRange } from './navigation-state.ts'
import type { ReplayClockSnapshot, TelemetryDataset } from '../domain/telemetry.ts'

const RANGE_MS = { '30m': 30 * 60_000, '2h': 2 * 60 * 60_000, '24h': 24 * 60 * 60_000 } as const

export function baselineReplaySnapshot(dataset: TelemetryDataset): ReplayClockSnapshot {
  return { baselineInstant: dataset.baselineInstant, tick: 0, status: 'paused', stepMs: 15_000 }
}

export function replayOffsetWindow(dataset: TelemetryDataset, snapshot: ReplayClockSnapshot, range: InvestigationRange): { from: number; to: number } {
  if (snapshot.baselineInstant !== dataset.baselineInstant) throw new Error('Replay snapshot baseline does not match the dataset')
  const replayOffset = snapshot.tick * snapshot.stepMs
  if (range.kind === 'relative') return { from: replayOffset - RANGE_MS[range.value], to: replayOffset }
  const baseline = Date.parse(dataset.baselineInstant)
  return { from: Date.parse(range.from) - baseline, to: Math.min(Date.parse(range.to) - baseline, replayOffset) }
}

export function isOffsetVisible(offsetMs: number, dataset: TelemetryDataset, snapshot: ReplayClockSnapshot, range: InvestigationRange): boolean {
  const window = replayOffsetWindow(dataset, snapshot, range)
  return offsetMs >= window.from && offsetMs <= window.to
}
