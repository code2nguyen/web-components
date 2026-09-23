'use client'

import Link from 'next/link'
import type { LogRecord, Trace } from '../../lib/domain/telemetry'
import type { InvestigationState } from '../../lib/query/navigation-state'
import { useDemoState } from '../../providers/DemoStateProvider'
import { signalDetailHref } from './service-navigation'

export function CorrelatedEvidence({
  traces,
  logs,
  state,
  currentHref,
}: Readonly<{ traces: readonly Trace[]; logs: readonly LogRecord[]; state: InvestigationState; currentHref: string }>) {
  const { demoState } = useDemoState()
  if (demoState === 'loading') return <c2-skeleton aria-label="Loading correlated evidence" />
  if (demoState === 'error')
    return (
      <c2-status-panel
        status="error"
        heading="Evidence unavailable"
        description="A local demonstration error was requested. Return Demo state to Normal to recover."
      />
    )
  if (demoState === 'empty')
    return <c2-status-panel status="neutral" heading="No correlated evidence" description="No trace or log matched the simulated state." />
  return (
    <div className="split-grid">
      <section aria-labelledby="recent-traces">
        <h2 id="recent-traces">Recent traces</h2>
        <div className="compact-list">
          {traces.map((trace) => (
            <Link key={trace.id} href={signalDetailHref(`/traces/${trace.id}/`, state, currentHref)} className="compact-row">
              <c2-badge tone={trace.status === 'error' ? 'danger' : 'success'}>{trace.status}</c2-badge>
              <span>{trace.rootOperation}</span>
              <span>{trace.durationMs} ms</span>
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="related-logs">
        <h2 id="related-logs">Correlated logs</h2>
        <div className="log-list">
          {logs.map((log) => (
            <Link
              key={log.id}
              href={`${signalDetailHref('/logs/', state, currentHref)}&log=${encodeURIComponent(log.id)}${log.traceId ? `&trace=${encodeURIComponent(log.traceId)}` : ''}`}
            >
              <c2-badge tone={log.severity === 'error' || log.severity === 'fatal' ? 'danger' : log.severity === 'warn' ? 'warning' : 'neutral'}>
                {log.severity}
              </c2-badge>
              <span>{log.message}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
