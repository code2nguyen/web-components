'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'
import { buildNavigationHref, parseNavigationState, parseReturnContext } from '../../lib/query/navigation-state'
import { parseDetailReturnContext } from '../../lib/query/internal-href'
import { useReplay } from '../../providers/ReplayProvider'
import { useScope } from '../../providers/ScopeProvider'
import { CorrelatedEvidence } from './CorrelatedEvidence'
import { ServiceMetrics } from './ServiceMetrics'
import { serviceDetailProjection } from './service-selectors'
import { signalDetailHref } from './service-navigation'
import { useAlertStore } from '../alerts/useAlertStore'

const indexes = buildDatasetIndexes(telemetryDataset)

export function ServiceDetail({ serviceId }: Readonly<{ serviceId: string }>) {
  const pathname = usePathname()
  const replay = useReplay()
  const { scope } = useScope()
  const { rules } = useAlertStore()
  const [returnHref, setReturnHref] = useState('/services/')
  const [currentHref, setCurrentHref] = useState(pathname)
  useEffect(() => {
    const synchronize = () => {
      const search = new URLSearchParams(window.location.search)
      setReturnHref(
        parseDetailReturnContext(search) ??
          parseReturnContext(search, ['/', '/services', '/services/']) ??
          buildNavigationHref('/services/', 'services', parseNavigationState('services', search)),
      )
      setCurrentHref(`${pathname}${window.location.search}`)
    }
    synchronize()
    window.addEventListener('popstate', synchronize)
    return () => window.removeEventListener('popstate', synchronize)
  }, [pathname])
  const state = useMemo(
    () => ({ ...parseNavigationState('services', ''), environmentId: scope.environmentId, range: scope.range }),
    [scope.environmentId, scope.range],
  )
  const snapshot = useMemo(
    () => ({ baselineInstant: telemetryDataset.baselineInstant, tick: replay.tick, status: replay.status, stepMs: replay.stepMs }),
    [replay.status, replay.stepMs, replay.tick],
  )
  const detail = useMemo(
    () => serviceDetailProjection(telemetryDataset, indexes, snapshot, serviceId, state.range, rules),
    [rules, serviceId, snapshot, state.range],
  )
  if (!detail) return <c2-status-panel status="error" heading="Service not found" description="The requested synthetic service is unavailable." />

  const { service } = detail
  const alertRuleHref = (ruleId: string) => {
    const href = signalDetailHref(ruleId.startsWith('local-rule-') ? '/alerts/rules/new/' : `/alerts/rules/${ruleId}/`, state, currentHref)
    return ruleId.startsWith('local-rule-') ? `${href}&edit=${encodeURIComponent(ruleId)}` : href
  }
  return (
    <div className="feature-stack">
      <nav aria-label="Breadcrumb">
        <Link href={returnHref}>
          {returnHref === '/' || returnHref.startsWith('/?') ? 'Overview' : returnHref.startsWith('/incidents/') ? 'Incident' : 'Services'}
        </Link>
        <span aria-hidden="true"> / </span>
        <span>{service.name}</span>
      </nav>
      <header className="section-heading">
        <div>
          <p className="eyebrow">
            Owned by {service.owner} · {service.environmentId} · replay tick {replay.tick}
          </p>
          <h1>{service.name}</h1>
        </div>
        <c2-badge tone={service.health === 'critical' ? 'danger' : service.health === 'warning' ? 'warning' : 'success'}>{service.health}</c2-badge>
      </header>
      <div className="stat-grid">
        <c2-stat label="Traffic / min" value={service.throughputPerMinute.toLocaleString()} />
        <c2-stat label="p50" value={`${service.latencyP50Ms} ms`} />
        <c2-stat label="p95" value={`${service.latencyP95Ms} ms`} tone="warning" />
        <c2-stat label="Errors" value={`${(service.errorRate * 100).toFixed(2)}%`} tone="negative" />
      </div>
      <ServiceMetrics metrics={detail.metrics} />
      <div className="split-grid">
        <section>
          <h2>Operations</h2>
          <div className="compact-list">
            {detail.operations.map((operation) => (
              <div className="compact-row" key={operation.name}>
                <strong>{operation.name}</strong>
                <span>{operation.latencyP95Ms} ms</span>
                <span>{(operation.errorRate * 100).toFixed(2)}%</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Dependencies</h2>
          <div className="compact-list">
            {detail.dependencies.map((dependency) => (
              <Link className="compact-row" key={dependency.id} href={signalDetailHref(`/services/${dependency.id}/`, state, currentHref)}>
                <strong>{dependency.name}</strong>
                <c2-badge tone={dependency.health === 'healthy' ? 'success' : 'warning'}>{dependency.health}</c2-badge>
              </Link>
            ))}
          </div>
        </section>
      </div>
      <section>
        <h2>Deployments</h2>
        <ol className="timeline-list">
          {detail.deployments.map((deployment) => (
            <li key={deployment.id}>
              <strong>{deployment.version}</strong>
              <span>{deployment.summary}</span>
            </li>
          ))}
        </ol>
      </section>
      <div className="split-grid">
        <section aria-labelledby="service-alerts-heading">
          <h2 id="service-alerts-heading">Current alert rules</h2>
          {detail.alerts.length ? (
            <div className="compact-list">
              {detail.alerts.map((rule) => (
                <Link className="compact-row" key={rule.id} href={alertRuleHref(rule.id)}>
                  <c2-badge tone={rule.severity === 'critical' ? 'danger' : 'warning'}>{rule.severity}</c2-badge>
                  <strong>{rule.name}</strong>
                  <span>{rule.enabled ? 'Enabled' : 'Disabled'}</span>
                </Link>
              ))}
            </div>
          ) : (
            <c2-status-panel
              status="neutral"
              heading="No current alert rules"
              description="No deterministic rule targets this service in the selected snapshot."
            />
          )}
        </section>
        <section aria-labelledby="service-incidents-heading">
          <h2 id="service-incidents-heading">Recent incidents</h2>
          {detail.incidents.length ? (
            <div className="compact-list">
              {detail.incidents.map((incident) => (
                <Link className="compact-row" key={incident.id} href={signalDetailHref(`/incidents/${incident.id}/`, state, currentHref)}>
                  <c2-badge tone={incident.severity === 'critical' ? 'danger' : 'warning'}>{incident.severity}</c2-badge>
                  <strong>{incident.id}</strong>
                  <span>{incident.state}</span>
                </Link>
              ))}
            </div>
          ) : (
            <c2-status-panel
              status="neutral"
              heading="No incidents in this range"
              description="Widen the selected time range to inspect earlier lifecycle records."
            />
          )}
        </section>
      </div>
      <CorrelatedEvidence traces={detail.traces} logs={detail.logs} state={state} currentHref={currentHref} />
    </div>
  )
}
