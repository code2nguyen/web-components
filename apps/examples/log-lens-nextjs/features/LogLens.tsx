'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { analyze, type Analysis } from '@/lib/analysis'
import { applyFocus, type Focus } from '@/lib/focus'
import { formatNumber } from '@/lib/format'
import { LogParseError, parseOtlpLogs } from '@/lib/otlp'
import { createSampleJsonl } from '@/lib/sample'
import { AppHeader } from './AppHeader'
import { DifferencesView } from './DifferencesView'
import { ExploreView } from './ExploreView'
import { JourneysView } from './JourneysView'
import { JourneySheet } from './JourneySheet'
import { Landing } from './Landing'
import { LensBar } from './LensBar'
import { PatternSheet } from './PatternSheet'
import { PatternsView } from './PatternsView'
import { StoryView } from './StoryView'
import { SummaryStrip } from './SummaryStrip'
import type { LensActions, View } from './types'

interface Source {
  name: string
  size: number
  format: string
  parseMs: number
}

type Status = { kind: 'empty' } | { kind: 'loading'; name: string } | { kind: 'error'; message: string; name: string } | { kind: 'ready' }

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'story', label: 'Story' },
  { id: 'patterns', label: 'Patterns' },
  { id: 'journeys', label: 'Journeys' },
  { id: 'differences', label: 'Differences' },
  { id: 'explore', label: 'Raw logs' },
]

export function LogLens() {
  const [status, setStatus] = useState<Status>({ kind: 'empty' })
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [lens, setLensState] = useState<Focus>({})
  const [view, setView] = useState<View>('story')
  const [patternId, setPatternId] = useState('')
  const [traceId, setTraceId] = useState('')
  const toastRef = useRef<HTMLElementTagNameMap['c2-toast-region']>(null)
  const tabsRef = useRef<HTMLElementTagNameMap['c2-tabs']>(null)

  const notify = useCallback((heading: string, message: string, variant: 'success' | 'warning' | 'info' = 'info') => {
    void customElements.whenDefined('c2-toast-region').then(() => toastRef.current?.show({ heading, message, variant, duration: 5000 }))
  }, [])

  const load = useCallback(
    async (name: string, size: number, read: () => Promise<string>) => {
      setStatus({ kind: 'loading', name })
      try {
        const text = await read()
        // Let the loading state paint before the synchronous parse.
        await new Promise((resolve) => setTimeout(resolve, 30))
        const started = performance.now()
        const parsed = parseOtlpLogs(text)
        const result = analyze(parsed.records)
        const parseMs = performance.now() - started
        setAnalysis(result)
        setSource({ name, size, format: parsed.format === 'otlp-jsonl' ? 'OTLP JSON Lines' : 'OTLP JSON', parseMs })
        setLensState({})
        setView('story')
        setPatternId('')
        setTraceId('')
        setStatus({ kind: 'ready' })
        notify(
          `Read ${formatNumber(result.records.length)} records`,
          `${formatNumber(result.patterns.length)} patterns and ${formatNumber(result.chapters.length)} story chapters in ${Math.round(parseMs)} ms.`,
          'success',
        )
        if (parsed.warnings.length) notify(`${parsed.warnings.length} lines skipped`, parsed.warnings[0], 'warning')
      } catch (error) {
        const message = error instanceof LogParseError ? error.message : `The file could not be read: ${error instanceof Error ? error.message : String(error)}`
        setStatus({ kind: 'error', message, name })
      }
    },
    [notify],
  )

  const openFile = useCallback((file: File) => void load(file.name, file.size, () => file.text()), [load])
  const openSample = useCallback(() => {
    const text = createSampleJsonl()
    void load('shop-checkout.otlp.jsonl', text.length, async () => text)
  }, [load])

  const reset = useCallback(() => {
    setStatus({ kind: 'empty' })
    setAnalysis(null)
    setSource(null)
    setLensState({})
  }, [])

  const actions = useMemo<LensActions>(
    () => ({
      setLens: (patch, nextView) => {
        setLensState((current) => ({ ...current, ...patch }))
        if (nextView) setView(nextView)
      },
      replaceLens: (next, nextView) => {
        setLensState(next)
        if (nextView) setView(nextView)
      },
      clearLens: (key) =>
        setLensState((current) => {
          if (!key) return {}
          const next = { ...current }
          delete next[key]
          return next
        }),
      openPattern: setPatternId,
      openTrace: setTraceId,
      goTo: setView,
    }),
    [],
  )

  useElementProperties(tabsRef, 'c2-tabs', { selectedTab: view }, [view, status.kind])
  useCustomEvent(tabsRef, 'selection-change', (event) => {
    const next = VIEWS.find((item) => item.id === event.detail.value)
    if (next) setView(next.id)
  })

  const lensRecords = useMemo(() => (analysis ? applyFocus(analysis.records, lens, analysis.patternOf) : []), [analysis, lens])
  const ready = status.kind === 'ready' && analysis && source

  return (
    <div className="ll-app">
      <AppHeader fileName={ready ? source.name : undefined} onReset={reset} onSample={openSample} />
      <c2-toast-region ref={toastRef} position="bottom-right" label="Notifications" />

      {!ready ? (
        <Landing
          status={status.kind === 'ready' ? 'empty' : status.kind}
          fileName={status.kind === 'loading' || status.kind === 'error' ? status.name : ''}
          error={status.kind === 'error' ? status.message : ''}
          onFile={openFile}
          onSample={openSample}
        />
      ) : (
        <main className="ll-main" id="main">
          <SummaryStrip analysis={analysis} source={source} />
          <nav className="ll-nav" aria-label="Analysis views">
            <c2-tabs ref={tabsRef} selected-tab={view} aria-label="Analysis views">
              {VIEWS.map((item) => (
                <c2-tab key={item.id} for={item.id} selected={view === item.id}>
                  {item.label}
                </c2-tab>
              ))}
              {VIEWS.map((item) => (
                <div key={item.id} id={item.id} aria-hidden={view !== item.id} />
              ))}
            </c2-tabs>
          </nav>
          <LensBar analysis={analysis} lens={lens} matching={lensRecords.length} actions={actions} />
          <section className="ll-view" aria-label={VIEWS.find((item) => item.id === view)?.label}>
            {view === 'story' && <StoryView analysis={analysis} lens={lens} actions={actions} />}
            {view === 'patterns' && <PatternsView analysis={analysis} records={lensRecords} lens={lens} actions={actions} />}
            {view === 'journeys' && <JourneysView analysis={analysis} records={lensRecords} actions={actions} />}
            {view === 'differences' && <DifferencesView analysis={analysis} records={lensRecords} lens={lens} actions={actions} />}
            {view === 'explore' && <ExploreView analysis={analysis} records={lensRecords} lens={lens} actions={actions} />}
          </section>
          <PatternSheet analysis={analysis} patternId={patternId} actions={actions} onClose={() => setPatternId('')} />
          <JourneySheet analysis={analysis} traceId={traceId} actions={actions} onClose={() => setTraceId('')} />
        </main>
      )}
    </div>
  )
}
