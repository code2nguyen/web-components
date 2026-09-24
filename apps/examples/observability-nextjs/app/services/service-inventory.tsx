'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { ServiceFilters } from '../../features/services/ServiceFilters'
import { ServiceTable } from '../../features/services/ServiceTable'
import { useDemoState } from '../../providers/DemoStateProvider'
import { parseNavigationState } from '../../lib/query/navigation-state'
import { withAppBasePath } from '../../lib/query/internal-href'
import { telemetryDataset } from '../../lib/data/dataset'
import { buildDatasetIndexes } from '../../lib/data/indexes'
import { projectServices } from '../../lib/query/service-projection'
import { useReplay } from '../../providers/ReplayProvider'

const indexes = buildDatasetIndexes(telemetryDataset)

export function ServiceInventory() {
  const search = useSearchParams()
  const replay = useReplay()
  const { demoState, setDemoState } = useDemoState()
  const state = parseNavigationState('services', search, { allowedEnvironmentIds: ['production', 'staging'] })
  const queryValue = state.filters.q
  const statusValue = state.filters.status
  const query = (typeof queryValue === 'string' ? queryValue : '').trim().toLowerCase()
  const requestedStatus = Array.isArray(statusValue) ? statusValue[0] : statusValue
  const status = requestedStatus === 'degraded' ? 'warning' : requestedStatus
  const services = projectServices(telemetryDataset, indexes, replay, state.range, state.environmentId)
  const rows = services.filter(
    (service) => (!status || service.health === status) && (!query || `${service.name} ${service.owner}`.toLowerCase().includes(query)),
  )
  useEffect(() => {
    const baseline = document.getElementById('service-server-baseline')
    if (baseline) baseline.hidden = true
  }, [])
  return (
    <>
      <ServiceFilters />
      <p aria-live="polite">{rows.length} services</p>
      {demoState === 'loading' ? (
        <div className="skeleton-grid" aria-label="Loading service inventory">
          <c2-skeleton />
          <c2-skeleton />
          <c2-skeleton />
        </div>
      ) : demoState === 'error' ? (
        <c2-status-panel status="error" heading="Service inventory unavailable" description="This is a recoverable local demonstration state.">
          <c2-button slot="actions" onClick={() => setDemoState('normal')}>
            Return to normal
          </c2-button>
        </c2-status-panel>
      ) : demoState === 'empty' ? (
        <c2-status-panel status="neutral" heading="No telemetry in this range" description="This is a synthetic empty state. The active scope is unchanged.">
          <c2-button slot="actions" onClick={() => setDemoState('normal')}>
            Return to normal
          </c2-button>
        </c2-status-panel>
      ) : rows.length ? (
        <ServiceTable services={rows} state={state} />
      ) : (
        <c2-status-panel status="neutral" heading="No matching services" description="Remove a criterion or change the environment.">
          <c2-link-button slot="actions" href={withAppBasePath('/services/')}>
            Clear filters
          </c2-link-button>
        </c2-status-panel>
      )}
    </>
  )
}
