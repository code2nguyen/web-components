import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { telemetryDataset } from '../../lib/data/dataset'
import { AlertsWorkspace } from '../../features/alerts/AlertsWorkspace'

export const metadata: Metadata = {
  title: 'Alerts and incidents',
  description: 'Manage locally persisted alert rules and inspect deterministic incident lifecycles.',
}

export default function AlertsPage() {
  return (
    <div className="feature-stack">
      <section id="alerts-server-baseline" aria-labelledby="alerts-baseline-heading">
        <h1 id="alerts-baseline-heading">Alerts and incidents</h1>
        <p>
          {telemetryDataset.alertRules.length} synthetic alert rules and {telemetryDataset.incidents.length} deterministic incidents are available at the paused
          production baseline.
        </p>
        <div className="compact-list">
          {telemetryDataset.alertRules.slice(0, 8).map((rule) => (
            <Link className="compact-row" key={rule.id} href={`/alerts/rules/${rule.id}/`}>
              <strong>{rule.name}</strong>
              <span>
                {rule.severity} · {rule.enabled ? 'enabled' : 'disabled'} · synthetic destinations only
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Suspense fallback={<c2-status-panel status="info" heading="Loading alert workspace" description="Preparing deterministic local alert data." />}>
        <AlertsWorkspace dataset={telemetryDataset} />
      </Suspense>
    </div>
  )
}
