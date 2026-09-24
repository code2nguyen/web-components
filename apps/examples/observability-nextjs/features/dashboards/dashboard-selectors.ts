import type { DatasetIndexes } from '../../lib/data/indexes.ts'
import type { MetricUnit, ReplayClockSnapshot, TelemetryDataset } from '../../lib/domain/telemetry.ts'
import { selectIncidents, selectMetricSeries, selectTraces } from '../../lib/query/selectors.ts'
import type { InvestigationRange } from '../../lib/query/navigation-state.ts'
import { isOffsetVisible, replayOffsetWindow } from '../../lib/query/time-window.ts'
import { DASHBOARD_PANELS, formatDashboardValue, type DashboardPanelDefinition, type DashboardPanelId } from './panel-catalog.ts'

export interface DashboardScope {
  environmentId: string
  range: InvestigationRange
}

export interface DashboardChartRow {
  offsetMs: number
  value: number
  label?: string
}

export interface DashboardRankedRow {
  id: string
  label: string
  value: number
  formattedValue: string
}

export interface DashboardProjection {
  panelId: DashboardPanelId
  title: string
  kind: DashboardPanelDefinition['kind']
  unit: MetricUnit
  description: string
  summary: string
  value: number | null
  formattedValue: string
  chartRows: readonly DashboardChartRow[]
  rankedRows: readonly DashboardRankedRow[]
  legend: readonly string[]
  updateKey: string
}

function average(values: readonly number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length
}

function latestValuesByService(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  scope: DashboardScope,
  metric: string,
): DashboardRankedRow[] {
  const services = new Map(dataset.services.map((service) => [service.id, service]))
  return selectMetricSeries(dataset, indexes, snapshot, { environmentId: scope.environmentId, metric })
    .flatMap((series) => {
      const latest = [...series.points]
        .reverse()
        .find(({ value, offsetMs }) => value !== null && isOffsetVisible(offsetMs, dataset, snapshot, scope.range))?.value
      if (latest === null || latest === undefined || !series.serviceId) return []
      return [
        {
          id: series.serviceId,
          label: services.get(series.serviceId)?.name ?? series.serviceId,
          value: Number(latest.toFixed(3)),
          formattedValue: formatDashboardValue(latest, series.unit),
        },
      ]
    })
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label))
}

function metricTrend(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  scope: DashboardScope,
  metric: string,
  aggregation: 'sum' | 'average' | 'p95',
): DashboardChartRow[] {
  const window = replayOffsetWindow(dataset, snapshot, scope.range)
  const buckets = new Map<number, number[]>()
  for (const series of selectMetricSeries(dataset, indexes, snapshot, { environmentId: scope.environmentId, metric })) {
    for (const point of series.points) {
      if (point.value === null || point.offsetMs < window.from || point.offsetMs > window.to) continue
      const values = buckets.get(point.offsetMs) ?? []
      values.push(point.value)
      buckets.set(point.offsetMs, values)
    }
  }
  const rows = [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([offsetMs, values]) => {
      const sorted = [...values].sort((left, right) => left - right)
      const value =
        aggregation === 'sum'
          ? values.reduce((sum, candidate) => sum + candidate, 0)
          : aggregation === 'p95'
            ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
            : (average(values) ?? 0)
      return { offsetMs, value: Number(value.toFixed(3)) }
    })
  return rows
}

function traceDistribution(dataset: TelemetryDataset, indexes: DatasetIndexes, snapshot: ReplayClockSnapshot, scope: DashboardScope): DashboardChartRow[] {
  const boundaries = [500, 1_000, 2_000, Number.POSITIVE_INFINITY]
  const labels = ['≤500 ms', '501–1,000 ms', '1,001–2,000 ms', '>2,000 ms']
  const counts = [0, 0, 0, 0]
  for (const trace of selectTraces(dataset, indexes, snapshot, { environmentId: scope.environmentId }).filter(({ startOffsetMs }) =>
    isOffsetVisible(startOffsetMs, dataset, snapshot, scope.range),
  )) {
    const bucket = boundaries.findIndex((boundary) => trace.durationMs <= boundary)
    counts[bucket] += 1
  }
  return counts.map((value, index) => ({ offsetMs: index, value, label: labels[index] }))
}

function projectionForPanel(
  panel: DashboardPanelDefinition,
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  scope: DashboardScope,
): DashboardProjection {
  const rangeKey = scope.range.kind === 'relative' ? `relative-${scope.range.value}` : `absolute-${scope.range.from}-${scope.range.to}`
  const updateKey = `${scope.environmentId}:${rangeKey}:${snapshot.tick}:${panel.id}`
  if (panel.selector.aggregation === 'count-active') {
    const incidents = selectIncidents(dataset, indexes, snapshot, {}).filter(
      (incident) =>
        incident.state !== 'resolved' &&
        incident.serviceIds.some((id) => indexes.servicesById.get(id)?.environmentId === scope.environmentId) &&
        isOffsetVisible(incident.startedOffsetMs, dataset, snapshot, scope.range),
    )
    const critical = incidents.filter(({ severity }) => severity === 'critical').length
    return {
      panelId: panel.id,
      title: panel.title,
      kind: panel.kind,
      unit: panel.unit,
      description: panel.description,
      summary: `${incidents.length} active synthetic incidents: ${critical} critical and ${incidents.length - critical} warning.`,
      value: incidents.length,
      formattedValue: formatDashboardValue(incidents.length, panel.unit),
      chartRows: [],
      rankedRows: [],
      legend: ['Critical incidents', 'Warning incidents'],
      updateKey,
    }
  }

  if (panel.selector.aggregation === 'histogram') {
    const chartRows = traceDistribution(dataset, indexes, snapshot, scope)
    const total = chartRows.reduce((sum, row) => sum + row.value, 0)
    return {
      panelId: panel.id,
      title: panel.title,
      kind: panel.kind,
      unit: panel.unit,
      description: panel.description,
      summary: `${total} visible traces. ${chartRows.map(({ label, value }) => `${label}: ${value}`).join('; ')}.`,
      value: total,
      formattedValue: formatDashboardValue(total, 'count'),
      chartRows,
      rankedRows: [],
      legend: ['Trace count per duration bucket'],
      updateKey,
    }
  }

  const rankedRows = latestValuesByService(dataset, indexes, snapshot, scope, panel.selector.metric)
  if (panel.selector.aggregation === 'ranking') {
    const top = rankedRows[0]
    return {
      panelId: panel.id,
      title: panel.title,
      kind: panel.kind,
      unit: panel.unit,
      description: panel.description,
      summary: top ? `${top.label} contributes the highest latest value at ${top.formattedValue}.` : 'No scoped service values are available.',
      value: top?.value ?? null,
      formattedValue: top?.formattedValue ?? 'Unavailable',
      chartRows: [],
      rankedRows: rankedRows.slice(0, 6),
      legend: ['Service', 'Latest request rate'],
      updateKey,
    }
  }

  const aggregation = panel.selector.aggregation === 'sum' ? 'sum' : panel.selector.aggregation === 'p95' ? 'p95' : 'average'
  const chartRows = metricTrend(dataset, indexes, snapshot, scope, panel.selector.metric, aggregation)
  const latest = chartRows.at(-1)?.value ?? null
  const values = chartRows.map(({ value }) => value)
  const minimum = values.length > 0 ? Math.min(...values) : null
  const maximum = values.length > 0 ? Math.max(...values) : null
  const top = rankedRows[0]
  const summary =
    latest === null
      ? 'No values are available for the selected environment, range, and replay instant.'
      : `${formatDashboardValue(latest, panel.unit)} latest; range ${formatDashboardValue(minimum, panel.unit)} to ${formatDashboardValue(maximum, panel.unit)}.${top ? ` Highest service: ${top.label}.` : ''}`
  return {
    panelId: panel.id,
    title: panel.title,
    kind: panel.kind,
    unit: panel.unit,
    description: panel.description,
    summary,
    value: latest,
    formattedValue: formatDashboardValue(latest, panel.unit),
    chartRows,
    rankedRows,
    legend: [panel.title, panel.unit],
    updateKey,
  }
}

export function selectDashboardProjections(
  dataset: TelemetryDataset,
  indexes: DatasetIndexes,
  snapshot: ReplayClockSnapshot,
  scope: DashboardScope,
): readonly DashboardProjection[] {
  return DASHBOARD_PANELS.map((panel) => projectionForPanel(panel, dataset, indexes, snapshot, scope))
}
