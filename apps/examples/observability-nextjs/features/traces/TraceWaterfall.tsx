import type { Span, Trace } from '../../lib/domain/telemetry'

function SpanLabel({ span, trace }: Readonly<{ span: Span; trace: Trace }>) {
  const left = ((span.startOffsetMs - trace.startOffsetMs) / trace.durationMs) * 100
  const width = Math.max(1, (span.durationMs / trace.durationMs) * 100)
  return (
    <span slot="label" className="waterfall-label">
      <span>
        <strong>{span.operation}</strong>
        <small>
          {span.serviceId} · {span.durationMs} ms
        </small>
      </span>
      <span
        className={`timing-track ${span.status === 'error' ? 'is-error' : ''}`}
        aria-label={`${span.durationMs} milliseconds, starts ${span.startOffsetMs - trace.startOffsetMs} milliseconds into trace`}
      >
        <span style={{ marginInlineStart: `${left}%`, inlineSize: `${width}%` }} />
      </span>
    </span>
  )
}

export function TraceWaterfall({ trace, spans }: Readonly<{ trace: Trace; spans: readonly Span[] }>) {
  const root = spans.find(({ id }) => id === trace.rootSpanId)
  if (!root) return <c2-status-panel status="error" heading="Trace structure unavailable" description="The synthetic root span could not be resolved." />
  const children = spans.filter(({ parentSpanId }) => parentSpanId === root.id)
  return (
    <section aria-labelledby="waterfall-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Critical path</p>
          <h2 id="waterfall-heading">Span waterfall</h2>
        </div>
        <span>{trace.durationMs} ms total</span>
      </div>
      <c2-tree aria-label="Trace span hierarchy" expandedItems={[root.id]} value={[root.id]}>
        <c2-tree-item value={root.id} label={root.operation} expanded has-children>
          <SpanLabel span={root} trace={trace} />
          {children.map((span) => (
            <c2-tree-item key={span.id} value={span.id} label={span.operation}>
              <SpanLabel span={span} trace={trace} />
            </c2-tree-item>
          ))}
        </c2-tree-item>
      </c2-tree>
      <div className="span-details">
        {spans
          .filter((span) => span.status === 'error' || span.durationMs > trace.durationMs * 0.25)
          .map((span) => (
            <c2-details key={span.id} label={`${span.status === 'error' ? 'Failed' : 'Slow'}: ${span.operation}`}>
              <dl className="attribute-grid">
                {Object.entries(span.attributes).map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
              {span.events.map((event) => (
                <p key={`${span.id}-${event.offsetMs}`}>
                  <strong>{event.name}</strong> at +{event.offsetMs - trace.startOffsetMs} ms
                </p>
              ))}
              {span.error && <c2-status-panel status="error" heading={span.error.type} description={span.error.message} />}
            </c2-details>
          ))}
      </div>
    </section>
  )
}
