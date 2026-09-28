'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { Segmented } from '@/components/ui/Segmented'
import type { Analysis } from '@/lib/analysis'
import type { Focus } from '@/lib/focus'
import { formatNumber, formatTimestamp } from '@/lib/format'
import { SEVERITY_LABEL } from '@/lib/insights'
import { SEVERITY_BANDS, type LogRecord, type SeverityBand } from '@/lib/otlp'
import type { LensActions } from './types'

const COLUMNS = ['timestamp', 'level', 'service', 'pattern', 'message'] as const

export function ExploreView({ analysis, records, lens, actions }: Readonly<{ analysis: Analysis; records: LogRecord[]; lens: Focus; actions: LensActions }>) {
  const viewerRef = useRef<HTMLElementTagNameMap['c2-log-viewer']>(null)
  const severityRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const serviceRef = useRef<HTMLElementTagNameMap['c2-select']>(null)
  const findRef = useRef<HTMLElementTagNameMap['c2-text-field']>(null)
  const wrapRef = useRef<HTMLElementTagNameMap['c2-switch']>(null)
  const [find, setFind] = useState('')
  const [mode, setMode] = useState<'highlight' | 'filter'>('highlight')
  const [wrap, setWrap] = useState(true)
  const [shown, setShown] = useState(records.length)

  const presentBands = useMemo(() => SEVERITY_BANDS.filter((band) => analysis.records.some((record) => record.severity === band)), [analysis])
  const entries = useMemo(
    () =>
      records.map((record) => ({
        timestamp: formatTimestamp(record.time),
        level: (record.severityText || record.severity).toUpperCase(),
        service: record.service,
        pattern: analysis.patternOf[record.index],
        message: record.body,
      })),
    [analysis, records],
  )

  useElementProperties(severityRef, 'c2-select', { value: lens.severities ?? [] }, [lens.severities])
  useElementProperties(serviceRef, 'c2-select', { value: lens.services ?? [] }, [lens.services])
  useElementProperties(viewerRef, 'c2-log-viewer', { columns: COLUMNS, wrap }, [wrap])
  useCustomEvent(severityRef, 'change', () => {
    const value = (severityRef.current?.value ?? []) as SeverityBand[]
    actions.setLens({ severities: value.length ? value : undefined })
  })
  useCustomEvent(serviceRef, 'change', () => {
    const value = serviceRef.current?.value ?? []
    actions.setLens({ services: value.length ? value : undefined })
  })
  useCustomEvent(findRef, 'input', () => setFind(findRef.current?.value ?? ''))
  useCustomEvent(findRef, 'clear', () => setFind(''))
  useCustomEvent(wrapRef, 'change', () => setWrap(Boolean(wrapRef.current?.checked)))

  // The viewer keeps its own buffer: replace it whenever the lens changes.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let active = true
    void customElements.whenDefined('c2-log-viewer').then(() => {
      if (!active) return
      viewer.clear()
      if (entries.length) viewer.appendEntries(entries)
    })
    return () => {
      active = false
    }
  }, [entries])

  // Setting a filter also anchors the viewport at the first entry, which is where an investigation starts.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    let active = true
    void customElements.whenDefined('c2-log-viewer').then(() => {
      if (!active) return
      viewer.setFilter(find.trim() ? { search: find.trim() } : null, mode)
      requestAnimationFrame(() => active && setShown(find.trim() && mode === 'filter' ? viewer.filteredCount : viewer.entryCount))
    })
    return () => {
      active = false
    }
  }, [entries, find, mode])

  return (
    <div className="ll-stack">
      <div className="ll-toolbar" role="toolbar" aria-label="Log filters">
        <c2-select ref={severityRef} className="ll-toolbar__select" multiple placeholder="All levels" aria-label="Levels in the lens">
          {presentBands.map((band) => (
            <c2-list-item key={band} value={band}>
              {SEVERITY_LABEL[band]}
            </c2-list-item>
          ))}
        </c2-select>
        <c2-select ref={serviceRef} className="ll-toolbar__select" multiple placeholder="All services" aria-label="Services in the lens">
          {analysis.services.map((service) => (
            <c2-list-item key={service.name} value={service.name}>
              {service.name}
            </c2-list-item>
          ))}
        </c2-select>
        <c2-text-field ref={findRef} className="ll-toolbar__find" type="search" placeholder="Find text in these records" aria-label="Find text" clearable>
          <c2-feather-search slot="prefix-icon" />
        </c2-text-field>
        <Segmented
          label="Find mode"
          value={mode}
          options={[
            { value: 'highlight', label: 'Highlight' },
            { value: 'filter', label: 'Only matches' },
          ]}
          onChange={setMode}
        />
        <c2-switch ref={wrapRef} checked={wrap} label="Wrap lines" />
      </div>
      <p className="ll-muted" aria-live="polite">
        {formatNumber(shown)} {shown === 1 ? 'record' : 'records'}
        {find.trim() && mode === 'highlight' ? ` · matches for “${find.trim()}” are highlighted` : ''} · hover a line to copy its message · Home / End jump to
        the first and last record
      </p>
      <c2-log-viewer ref={viewerRef} className="ll-logs" wrap={wrap} aria-label="Log records in the lens" />
    </div>
  )
}
