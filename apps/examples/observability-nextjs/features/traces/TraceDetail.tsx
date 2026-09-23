'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import type { LogRecord, Service, Span, Trace } from '../../lib/domain/telemetry'
import { telemetryDataset } from '../../lib/data/dataset'
import { useReplay } from '../../providers/ReplayProvider'
import { TraceWaterfall } from './TraceWaterfall'
import { TraceCorrelationActions } from './CorrelationActions'
import { useScope } from '../../providers/ScopeProvider'
import { isOffsetVisible } from '../../lib/query/time-window'
import { buildScopedHref } from '../../lib/query/navigation-state'

export function TraceDetail({
  trace,
  spans,
  service,
  correlatedLogs,
}: Readonly<{ trace: Trace; spans: readonly Span[]; service: Service | null; correlatedLogs: readonly LogRecord[] }>) {
  const replay = useReplay()
  const { scope } = useScope()
  const visibleLogs = useMemo(
    () => correlatedLogs.filter(({ timestampOffsetMs }) => isOffsetVisible(timestampOffsetMs, telemetryDataset, replay, scope.range)),
    [correlatedLogs, replay, scope.range],
  )
  return (
    <div className="feature-stack">
      <nav aria-label="Breadcrumb">
        <Link href={buildScopedHref('/traces/', scope)}>Traces</Link>
        <span aria-hidden="true"> / </span>
        <span>{trace.id}</span>
      </nav>
      <header className="section-heading">
        <div>
          <p className="eyebrow">{service?.name ?? trace.rootServiceId}</p>
          <h1>{trace.rootOperation}</h1>
          <p className="mono">{trace.id}</p>
        </div>
        <c2-badge tone={trace.status === 'error' ? 'danger' : 'success'}>{trace.status}</c2-badge>
      </header>
      <div className="stat-grid">
        <c2-stat label="Duration" value={`${trace.durationMs} ms`} />
        <c2-stat label="Spans" value={String(spans.length)} />
        <c2-stat label="Environment" value={trace.environmentId} />
        <c2-stat label="Correlated logs" value={String(visibleLogs.length)} />
      </div>
      <section aria-labelledby="trace-attributes-heading">
        <h2 id="trace-attributes-heading">Trace attributes</h2>
        <dl className="attribute-grid">
          {Object.entries(trace.attributes).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>
      <nav className="criteria-list" aria-label="Jump to span details">
        {spans.map((span) => (
          <c2-link-button key={span.id} href={`#${span.id}`}>
            {span.operation}
          </c2-link-button>
        ))}
      </nav>
      <TraceWaterfall trace={trace} spans={spans} />
      <section aria-labelledby="span-details-heading">
        <h2 id="span-details-heading">Complete span details</h2>
        <div className="span-details">
          {spans.map((span) => (
            <c2-details id={span.id} key={span.id} label={`${span.operation} · ${span.durationMs} ms`} expanded={span.status === 'error'}>
              <p>
                <strong>Timing:</strong> starts +{span.startOffsetMs - trace.startOffsetMs} ms, ends +
                {span.startOffsetMs - trace.startOffsetMs + span.durationMs} ms.
              </p>
              <p>
                <strong>Relationship:</strong> {span.parentSpanId ? `child of ${span.parentSpanId}` : 'root span'}.
              </p>
              <dl className="attribute-grid">
                {Object.entries(span.attributes).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
              {span.events.length > 0 && (
                <ol>
                  {span.events.map((event) => (
                    <li key={`${span.id}-${event.offsetMs}`}>
                      <strong>{event.name}</strong> at +{event.offsetMs - trace.startOffsetMs} ms
                    </li>
                  ))}
                </ol>
              )}
              {span.error && (
                <c2-status-panel status="error" heading={span.error.type} description={span.error.message}>
                  <pre slot="content">{span.error.stack ?? 'No synthetic stack captured.'}</pre>
                </c2-status-panel>
              )}
            </c2-details>
          ))}
        </div>
      </section>
      <p className="chart-summary">
        Shared replay snapshot: {replay.status} at tick {replay.tick}, baseline {telemetryDataset.baselineInstant}.
      </p>
      <TraceCorrelationActions traceId={trace.id} hasLogs={visibleLogs.length > 0} />
    </div>
  )
}
