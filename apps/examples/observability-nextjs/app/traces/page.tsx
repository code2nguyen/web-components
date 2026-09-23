import { Suspense } from 'react'
import Link from 'next/link'
import { TraceResults } from '../../features/traces/TraceResults'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'

const indexes = buildDatasetIndexes(telemetryDataset)

export default function TracesPage() {
  const traces = telemetryDataset.traces
    .filter(({ environmentId, startOffsetMs }) => environmentId === 'production' && startOffsetMs >= -2 * 60 * 60_000)
    .sort((left, right) => right.startOffsetMs - left.startOffsetMs)
  return (
    <div className="feature-stack">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Distributed tracing</p>
          <h1>Trace explorer</h1>
          <p>Find synthetic requests by service, operation, outcome, duration, time range, or text and preserve the investigation in the URL.</p>
        </div>
      </header>
      <section id="trace-server-baseline" aria-labelledby="trace-baseline-heading">
        <h2 id="trace-baseline-heading">Paused production baseline</h2>
        <p>{traces.length} traces in the last two hours. Showing the first 25 before interactive controls load.</p>
        <div className="compact-list">
          {traces.slice(0, 25).map((trace) => (
            <Link className="compact-row" key={trace.id} href={`/traces/${trace.id}/`}>
              <strong>{trace.rootOperation}</strong>
              <span>
                {indexes.servicesById.get(trace.rootServiceId)?.name ?? trace.rootServiceId} · {trace.status} · {trace.durationMs} ms
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Suspense
        fallback={
          <div className="skeleton-grid" aria-label="Loading trace search">
            <c2-skeleton />
            <c2-skeleton />
            <c2-skeleton />
          </div>
        }
      >
        <TraceResults />
      </Suspense>
    </div>
  )
}
