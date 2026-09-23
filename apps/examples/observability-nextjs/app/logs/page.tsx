import { Suspense } from 'react'
import Link from 'next/link'
import { LogResults } from '../../features/logs/LogResults'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'

const indexes = buildDatasetIndexes(telemetryDataset)

export default function LogsPage() {
  const logs = telemetryDataset.logs
    .filter(({ environmentId, timestampOffsetMs }) => environmentId === 'production' && timestampOffsetMs >= -2 * 60 * 60_000)
    .sort((left, right) => right.timestampOffsetMs - left.timestampOffsetMs)
  return (
    <div className="feature-stack">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Structured events</p>
          <h1>Log explorer</h1>
          <p>Search one thousand deterministic log records, inspect structured context, and move safely between correlated signals.</p>
        </div>
      </header>
      <section id="log-server-baseline" aria-labelledby="log-baseline-heading">
        <h2 id="log-baseline-heading">Paused production baseline</h2>
        <p>{logs.length} logs in the last two hours. Showing the first 25 before interactive controls load.</p>
        <div className="compact-list">
          {logs.slice(0, 25).map((log) => (
            <Link className="compact-row" key={log.id} href={`/logs/?log=${log.id}`}>
              <strong>{log.message}</strong>
              <span>
                {log.severity} · {indexes.servicesById.get(log.serviceId)?.name ?? log.serviceId} · {log.traceId ?? 'Uncorrelated'}
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Suspense
        fallback={
          <div className="skeleton-grid" aria-label="Loading log search">
            <c2-skeleton />
            <c2-skeleton />
            <c2-skeleton />
          </div>
        }
      >
        <LogResults />
      </Suspense>
    </div>
  )
}
