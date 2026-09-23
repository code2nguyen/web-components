'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo, useRef } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import type { Service } from '../../lib/domain/telemetry'

function queryWith(search: URLSearchParams, key: string, value: string): string {
  const next = new URLSearchParams(search)
  if (value) next.set(key, value)
  else next.delete(key)
  next.delete('page')
  next.delete('log')
  return next.size ? `?${next}` : './'
}

export function LogFilters({ services }: Readonly<{ services: readonly Service[] }>) {
  const router = useRouter()
  const readonlySearch = useSearchParams()
  const search = useMemo(() => new URLSearchParams(readonlySearch.toString()), [readonlySearch])
  const queryRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const serviceRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const severityRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const query = search.get('q') ?? ''
  const service = search.get('service') ?? ''
  const severity = search.get('severity') ?? ''

  useElementProperties(queryRef, 'c2-text-field', { value: query }, [query])
  useElementProperties(serviceRef, 'c2-select', { value: service ? [service] : [] }, [service])
  useElementProperties(severityRef, 'c2-select', { value: severity ? [severity] : [] }, [severity])
  useCustomEvent(queryRef, 'input', () => router.replace(queryWith(search, 'q', queryRef.current?.value ?? ''), { scroll: false }))
  useCustomEvent(serviceRef, 'change', () => router.replace(queryWith(search, 'service', serviceRef.current?.value[0] ?? ''), { scroll: false }))
  useCustomEvent(severityRef, 'change', () => router.replace(queryWith(search, 'severity', severityRef.current?.value[0] ?? ''), { scroll: false }))

  const criteria = [
    ['q', 'Text', query],
    ['service', 'Service', service],
    ['severity', 'Severity', severity],
    ['trace', 'Trace', search.get('trace') ?? ''],
  ].filter((item): item is [string, string, string] => Boolean(item[2]))
  return (
    <section aria-labelledby="log-filter-heading">
      <h2 id="log-filter-heading" className="sr-only">
        Log filters
      </h2>
      <div className="filter-bar">
        <label className="filter-field">
          <span>Search</span>
          <c2-text-field ref={queryRef} type="search" aria-label="Search log messages and attributes" placeholder="Message, ID, or attribute" clearable />
        </label>
        <label className="filter-field">
          <span>Service</span>
          <c2-select ref={serviceRef} aria-label="Filter logs by service" placeholder="All services">
            <c2-list-item value="">All services</c2-list-item>
            {services.map((item) => (
              <c2-list-item key={item.id} value={item.id}>
                {item.name}
              </c2-list-item>
            ))}
          </c2-select>
        </label>
        <label className="filter-field">
          <span>Severity</span>
          <c2-select ref={severityRef} aria-label="Filter logs by severity" placeholder="All severities">
            <c2-list-item value="">All severities</c2-list-item>
            {['debug', 'info', 'warn', 'error', 'fatal'].map((item) => (
              <c2-list-item key={item} value={item}>
                {item}
              </c2-list-item>
            ))}
          </c2-select>
        </label>
      </div>
      {criteria.length > 0 && (
        <div className="criteria-list" aria-label="Active log criteria">
          {criteria.map(([key, label, value]) => (
            <c2-link-button key={key} href={queryWith(search, key, '')} aria-label={`Remove ${label.toLowerCase()} filter ${value}`}>
              {label}: {value} ×
            </c2-link-button>
          ))}
          <c2-link-button href="./">Clear all</c2-link-button>
        </div>
      )}
    </section>
  )
}
