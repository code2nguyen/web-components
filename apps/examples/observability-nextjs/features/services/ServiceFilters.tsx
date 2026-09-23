'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useRef } from 'react'
import { useElementProperties } from '../../components/c2n/element-bindings'
import { useCustomEvent } from '../../components/c2n/useCustomEvent'
import { withAppBasePath } from '../../lib/query/internal-href'

export function ServiceFilters() {
  const router = useRouter()
  const search = useSearchParams()
  const queryRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const statusRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const status = search.get('status') ?? ''

  const update = (key: string, value: string) => {
    const parameters = new URLSearchParams(search.toString())
    if (value) parameters.set(key, value)
    else parameters.delete(key)
    parameters.delete('page')
    router.replace(`/services/${parameters.size ? `?${parameters}` : ''}`, { scroll: false })
  }
  useCustomEvent(queryRef, 'input', () => update('q', queryRef.current?.value ?? ''))
  useElementProperties(statusRef, 'c2-select', { value: status ? [status] : [] }, [status])
  useCustomEvent(statusRef, 'change', () => update('status', statusRef.current?.value[0] ?? ''))

  return (
    <div className="filter-bar" aria-label="Service filters">
      <c2-text-field ref={queryRef} aria-label="Search services" placeholder="Search service or owner" value={search.get('q') ?? ''} clearable />
      <c2-select ref={statusRef} aria-label="Health status" placeholder="All health">
        <c2-list-item value="">All health</c2-list-item>
        <c2-list-item value="critical">Critical</c2-list-item>
        <c2-list-item value="warning">Warning</c2-list-item>
        <c2-list-item value="healthy">Healthy</c2-list-item>
      </c2-select>
      {(search.get('q') || status) && <c2-link-button href={withAppBasePath('/services/')}>Clear criteria</c2-link-button>}
    </div>
  )
}
