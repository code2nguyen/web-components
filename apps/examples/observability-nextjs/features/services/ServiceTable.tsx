'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useRef } from 'react'
import type { Service } from '../../lib/domain/telemetry'
import type { TableColumnConfig } from '@c2n/table/table-types.js'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import type { InvestigationState } from '../../lib/query/navigation-state'
import { withAppBasePath } from '../../lib/query/internal-href'
import { serviceDetailHref } from './service-navigation'

function ServiceSparkline({ service }: Readonly<{ service: Service }>) {
  const ref = useRef<HTMLElementTagNameMap['c2-sparkline']>(null)
  const data = useMemo(() => [service.latencyP50Ms, service.latencyP95Ms * 0.72, service.latencyP50Ms * 1.1, service.latencyP95Ms], [service])
  useElementProperties(ref, 'c2-sparkline', { data }, [data])
  return <c2-sparkline ref={ref} slot={`cell:${service.id}:trend`} tone="auto" aria-label={`Latency trend for ${service.name}`} />
}

export function ServiceTable({ services, state }: Readonly<{ services: readonly Service[]; state: InvestigationState }>) {
  const router = useRouter()
  const tableRef = useRef<HTMLElementTagNameMap['c2-table']>(null)
  const rows = useMemo(
    () =>
      services.map((service) => ({
        ...service,
        healthLabel: service.health,
        latency: `${service.latencyP95Ms} ms`,
        errors: `${(service.errorRate * 100).toFixed(2)}%`,
      })),
    [services],
  )
  const columns = useMemo<TableColumnConfig[]>(
    () => [
      { field: 'name', header: 'Service', sortable: true, minWidth: 210 },
      { field: 'healthLabel', header: 'Health', sortable: true, width: '120px' },
      { field: 'owner', header: 'Owner', sortable: true, minWidth: 150 },
      { field: 'latency', header: 'p95 latency', sortable: true, width: '130px' },
      { field: 'errors', header: 'Error rate', sortable: true, width: '120px' },
      { field: 'trend', header: 'Latency trend', width: '140px', cellSlot: true },
    ],
    [],
  )
  useElementProperties(tableRef, 'c2-table', { rows, columns, rowKey: 'id' }, [rows, columns])
  useCustomEvent(tableRef, 'row-click', (event) => router.push(serviceDetailHref(String((event.detail.row as { id: string }).id), state)))

  return (
    <div className="table-frame">
      <c2-table ref={tableRef} aria-label="Services" sortable stripe empty-message="No services match these criteria">
        {services.map((service) => (
          <ServiceSparkline key={service.id} service={service} />
        ))}
      </c2-table>
      <div className="table-fallback" aria-label="Service list">
        {services.map((service) => (
          <a key={service.id} href={withAppBasePath(serviceDetailHref(service.id, state))}>
            <strong>{service.name}</strong>
            <span>
              {service.health} · {service.latencyP95Ms} ms · {(service.errorRate * 100).toFixed(2)}%
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}
