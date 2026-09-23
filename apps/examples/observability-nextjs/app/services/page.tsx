import { Suspense } from 'react'
import Link from 'next/link'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'
import { projectServices } from '../../lib/query/service-projection'
import { baselineReplaySnapshot } from '../../lib/query/time-window'
import { ServiceInventory } from './service-inventory'

const baselineServices = projectServices(
  telemetryDataset,
  buildDatasetIndexes(telemetryDataset),
  baselineReplaySnapshot(telemetryDataset),
  { kind: 'relative', value: '2h' },
  'production',
)

export default function ServicesPage() {
  return (
    <div className="feature-stack">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Services</h1>
          <p>Compare health, latency, traffic, and ownership across the selected synthetic environment.</p>
        </div>
      </header>
      <section id="service-server-baseline" aria-labelledby="service-baseline-heading">
        <h2 id="service-baseline-heading">Paused production baseline</h2>
        <p>Eight production services are available before the interactive filters upgrade.</p>
        <div className="compact-list">
          {baselineServices.map((service) => (
            <Link className="compact-row" key={service.id} href={`/services/${service.id}/`}>
              <strong>{service.name}</strong>
              <span>
                {service.health} · {service.latencyP95Ms} ms · {(service.errorRate * 100).toFixed(2)}%
              </span>
            </Link>
          ))}
        </div>
      </section>
      <Suspense fallback={<c2-skeleton aria-label="Loading service filters" />}>
        <ServiceInventory />
      </Suspense>
    </div>
  )
}
