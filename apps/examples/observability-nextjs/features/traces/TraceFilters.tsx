'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useRef } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import type { Service } from '../../lib/domain/telemetry'

interface TraceFiltersProps {
  services: readonly Service[]
  operations: readonly string[]
}

function nextQuery(search: URLSearchParams, key: string, nextValue: string): string {
  const parameters = new URLSearchParams(search)
  if (nextValue) parameters.set(key, nextValue)
  else parameters.delete(key)
  parameters.delete('page')
  const query = parameters.toString()
  return query ? `?${query}` : './'
}

export function TraceFilters({ services, operations }: Readonly<TraceFiltersProps>) {
  const router = useRouter()
  const readonlySearch = useSearchParams()
  const search = useMemo(() => new URLSearchParams(readonlySearch.toString()), [readonlySearch])
  const queryRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const serviceRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const operationRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const statusRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const durationRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const replace = (key: string, value: string) => router.replace(nextQuery(search, key, value), { scroll: false })
  const query = search.get('q') ?? ''
  const service = search.get('service') ?? ''
  const operation = search.get('operation') ?? ''
  const status = search.get('status') ?? ''
  const duration = search.get('duration') ?? ''

  useElementProperties(queryRef, 'c2-text-field', { value: query }, [query])
  useElementProperties(serviceRef, 'c2-select', { value: service ? [service] : [] }, [service])
  useElementProperties(operationRef, 'c2-select', { value: operation ? [operation] : [] }, [operation])
  useElementProperties(statusRef, 'c2-select', { value: status ? [status] : [] }, [status])
  useElementProperties(durationRef, 'c2-select', { value: duration ? [duration] : [] }, [duration])
  useCustomEvent(queryRef, 'input', () => replace('q', queryRef.current?.value ?? ''))
  useCustomEvent(serviceRef, 'change', () => replace('service', serviceRef.current?.value[0] ?? ''))
  useCustomEvent(operationRef, 'change', () => replace('operation', operationRef.current?.value[0] ?? ''))
  useCustomEvent(statusRef, 'change', () => replace('status', statusRef.current?.value[0] ?? ''))
  useCustomEvent(durationRef, 'change', () => replace('duration', durationRef.current?.value[0] ?? ''))

  const criteria = [
    ['q', 'Text', query],
    ['service', 'Service', service],
    ['operation', 'Operation', operation],
    ['status', 'Status', status],
    ['duration', 'Duration', duration],
  ].filter((criterion): criterion is [string, string, string] => Boolean(criterion[2]))

  return (
    <section aria-labelledby="trace-filter-heading">
      <h2 id="trace-filter-heading" className="sr-only">
        Trace filters
      </h2>
      <div className="filter-bar">
        <label className="filter-field">
          <span>Search</span>
          <c2-text-field ref={queryRef} type="search" aria-label="Search traces" placeholder="Trace ID, operation, or attribute" clearable />
        </label>
        <label className="filter-field">
          <span>Service</span>
          <c2-select ref={serviceRef} aria-label="Filter traces by service" placeholder="All services">
            <c2-list-item value="">All services</c2-list-item>
            {services.map((item) => (
              <c2-list-item key={item.id} value={item.id}>
                {item.name}
              </c2-list-item>
            ))}
          </c2-select>
        </label>
        <label className="filter-field">
          <span>Operation</span>
          <c2-select ref={operationRef} aria-label="Filter traces by operation" placeholder="All operations">
            <c2-list-item value="">All operations</c2-list-item>
            {operations.map((item) => (
              <c2-list-item key={item} value={item}>
                {item}
              </c2-list-item>
            ))}
          </c2-select>
        </label>
        <label className="filter-field">
          <span>Status</span>
          <c2-select ref={statusRef} aria-label="Filter traces by status" placeholder="All statuses">
            <c2-list-item value="">All statuses</c2-list-item>
            <c2-list-item value="error">Error</c2-list-item>
            <c2-list-item value="ok">OK</c2-list-item>
          </c2-select>
        </label>
        <label className="filter-field">
          <span>Duration</span>
          <c2-select ref={durationRef} aria-label="Filter traces by duration" placeholder="Any duration">
            <c2-list-item value="">Any duration</c2-list-item>
            <c2-list-item value="under-100ms">Under 100 ms</c2-list-item>
            <c2-list-item value="100ms-500ms">100–500 ms</c2-list-item>
            <c2-list-item value="over-500ms">Over 500 ms</c2-list-item>
          </c2-select>
        </label>
      </div>
      {criteria.length > 0 && (
        <div className="criteria-list" aria-label="Active trace criteria">
          {criteria.map(([key, label, value]) => (
            <c2-link-button key={key} href={nextQuery(search, key, '')} aria-label={`Remove ${label.toLowerCase()} filter ${value}`}>
              {label}: {value} ×
            </c2-link-button>
          ))}
          <c2-link-button href="./">Clear all</c2-link-button>
        </div>
      )}
    </section>
  )
}
