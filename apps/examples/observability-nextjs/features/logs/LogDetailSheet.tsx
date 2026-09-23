'use client'

import { useRef } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import { telemetryDataset } from '../../lib/data/dataset'
import type { LogRecord } from '../../lib/domain/telemetry'
import type { InvestigationState } from '../../lib/query/navigation-state'
import { LogCorrelationActions } from './CorrelationActions'
import styles from './logs.module.css'

export function LogDetailSheet({
  log,
  requestedId,
  state,
  traceExists,
  onClose,
}: Readonly<{ log: LogRecord | null; requestedId: string; state: InvestigationState; traceExists: boolean; onClose: () => void }>) {
  const ref = useRef<HTMLElementTagNameMap['c2-sheet']>(null)
  useElementProperties(ref, 'c2-sheet', { open: Boolean(requestedId) }, [requestedId])
  useCustomEvent(ref, 'close', onClose)
  return (
    <c2-sheet ref={ref} side="right" label={log ? `Log details for ${log.id}` : 'Unavailable log record'}>
      <span slot="title">{log ? 'Log record' : 'Log unavailable'}</span>
      {log ? (
        <div className="feature-stack">
          <div>
            <p className="eyebrow">{log.severity}</p>
            <h2 className="mono">{log.id}</h2>
          </div>
          <dl className="attribute-grid">
            <div>
              <dt>Timestamp</dt>
              <dd>{new Date(Date.parse(telemetryDataset.baselineInstant) + log.timestampOffsetMs).toISOString()}</dd>
            </div>
            <div>
              <dt>Service</dt>
              <dd>{log.serviceId}</dd>
            </div>
            <div>
              <dt>Trace ID</dt>
              <dd>{log.traceId ?? 'Not correlated'}</dd>
            </div>
            <div>
              <dt>Span ID</dt>
              <dd>{log.spanId ?? 'Not correlated'}</dd>
            </div>
          </dl>
          <section>
            <h3>Full message</h3>
            <p className={styles.message}>{log.message}</p>
          </section>
          <section>
            <h3>Structured attributes</h3>
            <dl className="attribute-grid">
              {Object.entries(log.attributes).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <LogCorrelationActions log={log} state={state} traceExists={traceExists} />
        </div>
      ) : (
        <c2-status-panel
          status="error"
          heading={`Log ${requestedId} was not found`}
          description="The selected record may be stale or outside this deterministic dataset."
        />
      )}
      <c2-button slot="footer" onClick={onClose}>
        Return to log results
      </c2-button>
    </c2-sheet>
  )
}
