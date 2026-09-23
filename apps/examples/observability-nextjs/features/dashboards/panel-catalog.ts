import type { DashboardPanel, DashboardPanelSize, MetricUnit } from '../../lib/domain/telemetry.ts'

export type DashboardPanelId = 'traffic' | 'latency' | 'errors' | 'saturation' | 'duration-distribution' | 'top-services' | 'incident-count'

export interface DashboardPanelDefinition extends Omit<DashboardPanel, 'id'> {
  id: DashboardPanelId
  selector: Readonly<{
    metric: string
    aggregation: 'sum' | 'average' | 'p95' | 'histogram' | 'ranking' | 'count-active'
  }>
  summaryIntent: string
}

export const DASHBOARD_PANELS: readonly DashboardPanelDefinition[] = Object.freeze([
  {
    id: 'traffic',
    title: 'Request traffic',
    kind: 'stat',
    metric: 'request-rate',
    unit: 'requests-per-second',
    defaultSize: 'small',
    supportedSizes: ['small', 'medium'],
    description: 'Current synthetic request volume.',
    selector: { metric: 'request-rate', aggregation: 'sum' },
    summaryIntent: 'Reports the latest aggregate request rate and whether the scoped traffic trend is rising or falling.',
  },
  {
    id: 'latency',
    title: 'P95 latency',
    kind: 'line',
    metric: 'latency-p95',
    unit: 'milliseconds',
    defaultSize: 'large',
    supportedSizes: ['medium', 'large'],
    description: 'P95 service latency over the selected range.',
    selector: { metric: 'latency-p95', aggregation: 'p95' },
    summaryIntent: 'Summarizes the scoped p95 latency range and names the service contributing the highest latest value.',
  },
  {
    id: 'errors',
    title: 'Error rate',
    kind: 'area',
    metric: 'error-rate',
    unit: 'percent',
    defaultSize: 'medium',
    supportedSizes: ['small', 'medium', 'large'],
    description: 'Synthetic error percentage by service.',
    selector: { metric: 'error-rate', aggregation: 'average' },
    summaryIntent: 'Reports the average scoped error percentage with explicit minimum and maximum values independent of color.',
  },
  {
    id: 'saturation',
    title: 'Saturation',
    kind: 'bar',
    metric: 'saturation',
    unit: 'percent',
    defaultSize: 'medium',
    supportedSizes: ['medium', 'large'],
    description: 'Relative resource saturation.',
    selector: { metric: 'saturation', aggregation: 'average' },
    summaryIntent: 'Compares latest saturation percentages by service and identifies the highest contributor in text.',
  },
  {
    id: 'duration-distribution',
    title: 'Trace duration',
    kind: 'distribution',
    metric: 'latency-p95',
    unit: 'milliseconds',
    defaultSize: 'medium',
    supportedSizes: ['medium', 'large'],
    description: 'Distribution of generated trace durations.',
    selector: { metric: 'trace-duration', aggregation: 'histogram' },
    summaryIntent: 'Groups visible trace durations into named millisecond buckets and exposes every bucket count as text.',
  },
  {
    id: 'top-services',
    title: 'Top contributors',
    kind: 'ranked-table',
    metric: 'request-rate',
    unit: 'requests-per-second',
    defaultSize: 'large',
    supportedSizes: ['medium', 'large'],
    description: 'Services ranked by generated request traffic.',
    selector: { metric: 'request-rate', aggregation: 'ranking' },
    summaryIntent: 'Ranks scoped services by latest request rate using text labels, numeric values, and ordinal position.',
  },
  {
    id: 'incident-count',
    title: 'Active incidents',
    kind: 'stat',
    metric: 'incident-count',
    unit: 'count',
    defaultSize: 'small',
    supportedSizes: ['small', 'medium'],
    description: 'Current unresolved synthetic incidents.',
    selector: { metric: 'incident-count', aggregation: 'count-active' },
    summaryIntent: 'Counts visible unresolved synthetic incidents and identifies their warning or critical severity mix.',
  },
] satisfies readonly DashboardPanelDefinition[])

export const DASHBOARD_PANEL_IDS = Object.freeze(DASHBOARD_PANELS.map(({ id }) => id)) as readonly DashboardPanelId[]

export const dashboardPanelSizes = Object.freeze(
  Object.fromEntries(DASHBOARD_PANELS.map(({ id, supportedSizes }) => [id, Object.freeze([...supportedSizes])])) as Readonly<
    Record<DashboardPanelId, readonly DashboardPanelSize[]>
  >,
)

export function dashboardPanelById(id: string): DashboardPanelDefinition | undefined {
  return DASHBOARD_PANELS.find((panel) => panel.id === id)
}

export function formatDashboardValue(value: number | null, unit: MetricUnit): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable'
  if (unit === 'percent') return `${value.toFixed(value >= 10 ? 1 : 2)}%`
  if (unit === 'milliseconds') return `${Math.round(value).toLocaleString('en-US')} ms`
  if (unit === 'requests-per-second') return `${value.toFixed(value >= 100 ? 0 : 1)} req/s`
  if (unit === 'bytes') return `${Math.round(value).toLocaleString('en-US')} B`
  return Math.round(value).toLocaleString('en-US')
}
