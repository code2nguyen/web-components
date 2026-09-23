'use client'

import Link from 'next/link'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'
import { useReplay } from '../../providers/ReplayProvider'
import { useScope } from '../../providers/ScopeProvider'
import { useDemoState } from '../../providers/DemoStateProvider'
import { overviewProjection } from './overview-selectors'
import { withAppBasePath } from '../../lib/query/internal-href'
import { buildScopedHref, scopeSearchParams } from '../../lib/query/navigation-state'

const indexes = buildDatasetIndexes(telemetryDataset)

function tone(health: string): 'success' | 'warning' | 'danger' | 'neutral' {
  return health === 'healthy' ? 'success' : health === 'warning' ? 'warning' : health === 'critical' ? 'danger' : 'neutral'
}

export function OverviewDashboard() {
  const replay = useReplay()
  const { scope } = useScope()
  const { demoState, setDemoState } = useDemoState()
  const overview = overviewProjection(telemetryDataset, indexes, replay, scope.environmentId, scope.range)
  const detailHref = (pathname: string) => {
    const params = scopeSearchParams(scope)
    params.set('return', buildScopedHref('/', scope))
    return `${pathname}?${params}`
  }

  if (demoState === 'loading') return <c2-skeleton aria-label="Loading service health" />
  if (demoState === 'error')
    return (
      <c2-status-panel
        status="error"
        heading="Service health unavailable"
        description="This is a simulated local failure. The investigation scope is unchanged."
      >
        <c2-button slot="actions" onClick={() => setDemoState('normal')}>
          Return to normal
        </c2-button>
      </c2-status-panel>
    )
  if (demoState === 'empty')
    return (
      <c2-status-panel
        status="neutral"
        heading="No telemetry in this range"
        description="This is a synthetic empty state. The investigation scope is unchanged."
      >
        <c2-button slot="actions" onClick={() => setDemoState('normal')}>
          Return to normal
        </c2-button>
      </c2-status-panel>
    )

  return (
    <div className="feature-stack" data-testid="overview-dashboard">
      <section aria-labelledby="overview-kpis">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Operational pulse</p>
            <h1 id="overview-kpis">Service health</h1>
          </div>
          <c2-badge tone={overview.criticalServices ? 'danger' : 'success'}>{overview.criticalServices ? 'Action needed' : 'Nominal'}</c2-badge>
        </div>
        <div className="stat-grid">
          <c2-stat label="Healthy services" value={`${overview.healthyServices} / ${overview.services.length}`} tone="positive" />
          <c2-stat label="Critical services" value={String(overview.criticalServices)} tone={overview.criticalServices ? 'negative' : 'neutral'} />
          <c2-stat label="Traffic / min" value={overview.requestRate.toLocaleString()} />
          <c2-stat label="Peak p95" value={`${Math.round(overview.latencyP95Ms)} ms`} tone="warning" />
        </div>
      </section>

      <section aria-labelledby="attention-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Prioritized by impact</p>
            <h2 id="attention-heading">Needs attention</h2>
          </div>
          <Link href={buildScopedHref('/services/', scope)}>View all services</Link>
        </div>
        <div className="card-grid">
          {overview.services.slice(0, 4).map((service) => (
            <c2-card key={service.id} href={withAppBasePath(detailHref(`/services/${service.id}/`))} interactive>
              <span slot="header" className="card-title">
                <span>{service.name}</span>
                <c2-badge tone={tone(service.health)}>{service.health}</c2-badge>
              </span>
              <dl className="metric-list">
                <div>
                  <dt>p95 latency</dt>
                  <dd>{Math.round(service.latencyP95Ms)} ms</dd>
                </div>
                <div>
                  <dt>Error rate</dt>
                  <dd>{(service.errorRate * 100).toFixed(2)}%</dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{service.owner}</dd>
                </div>
              </dl>
            </c2-card>
          ))}
        </div>
      </section>

      <div className="split-grid">
        <section aria-labelledby="incidents-heading">
          <h2 id="incidents-heading">Active incidents</h2>
          {overview.activeIncidents.length ? (
            <div className="compact-list">
              {overview.activeIncidents.map((incident) => (
                <Link key={incident.id} href={detailHref(`/incidents/${incident.id}/`)} className="compact-row">
                  <c2-badge tone={incident.severity === 'critical' ? 'danger' : 'warning'}>{incident.severity}</c2-badge>
                  <span>{incident.id}</span>
                  <span>{incident.state}</span>
                </Link>
              ))}
            </div>
          ) : (
            <c2-status-panel status="neutral" heading="No active incidents" description="The selected synthetic scope is quiet." />
          )}
        </section>
        <section aria-labelledby="changes-heading">
          <h2 id="changes-heading">Recent changes</h2>
          <ol className="timeline-list">
            {overview.recentChanges.map((change) => (
              <li key={`${change.serviceId}-${change.version}`}>
                <strong>{change.serviceName}</strong>
                <span>
                  {change.version} · {change.summary}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="chart-summary">
        Text summary: average error rate is {(overview.errorRate * 100).toFixed(2)}%; peak p95 latency is {Math.round(overview.latencyP95Ms)} milliseconds.
      </p>
    </div>
  )
}
