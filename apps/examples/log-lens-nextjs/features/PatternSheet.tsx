'use client'

import { useMemo, useRef } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { PatternText } from '@/components/ui/PatternText'
import { SeverityBadge } from '@/components/ui/SeverityBadge'
import type { Analysis } from '@/lib/analysis'
import { formatClock, formatDuration, formatNumber, formatPercent, formatTimestamp } from '@/lib/format'
import { patternHistograms } from '@/lib/insights'
import { SEVERITY_BANDS } from '@/lib/otlp'
import type { LensActions } from './types'

interface Props {
  analysis: Analysis
  patternId: string
  actions: LensActions
  onClose: () => void
}

function formatValue(value: number, unit: string): string {
  return `${Number.isInteger(value) ? formatNumber(value) : value.toFixed(value < 10 ? 2 : 1)}${unit}`
}

export function PatternSheet({ analysis, patternId, actions, onClose }: Readonly<Props>) {
  const sheetRef = useRef<HTMLElementTagNameMap['c2-sheet']>(null)
  const chartRef = useRef<HTMLElementTagNameMap['c2-bar-chart']>(null)
  const pattern = patternId ? analysis.patternById.get(patternId) : undefined

  const data = useMemo(() => {
    if (!pattern) return []
    const histogram =
      patternHistograms(
        analysis,
        pattern.records.map((index) => analysis.records[index]),
      ).get(pattern.id) ?? []
    return histogram.map((count, index) => ({ time: analysis.timeline.buckets[index].start, count }))
  }, [analysis, pattern])

  const traces = useMemo(() => {
    if (!pattern) return { total: 0, failed: 0 }
    const ids = new Set(pattern.records.map((index) => analysis.records[index].traceId).filter(Boolean))
    const failed = analysis.journeys.filter((journey) => journey.failed && ids.has(journey.traceId)).length
    return { total: ids.size, failed }
  }, [analysis, pattern])

  useElementProperties(sheetRef, 'c2-sheet', { open: Boolean(pattern) }, [pattern])
  useElementProperties(chartRef, 'c2-bar-chart', { data }, [data])
  useCustomEvent(sheetRef, 'close', onClose)

  const examples = pattern
    ? [...new Set([pattern.records[0], pattern.records[Math.floor(pattern.records.length / 2)], pattern.records[pattern.records.length - 1]])]
    : []

  return (
    <c2-sheet ref={sheetRef} side="right" className="ll-sheet" label={pattern ? `Pattern ${pattern.id}` : 'Pattern'}>
      <span slot="title">{pattern ? `Pattern ${pattern.id}` : 'Pattern'}</span>
      {pattern && (
        <div className="ll-sheet__body">
          <PatternText className="ll-pattern--block" template={pattern.template} />
          <div className="ll-facts">
            {SEVERITY_BANDS.filter((band) => pattern.severities[band]).map((band) => (
              <SeverityBadge key={band} severity={band} count={pattern.severities[band]} />
            ))}
            <c2-badge tone="neutral">
              {formatNumber(pattern.count)}× · {formatPercent(pattern.count / analysis.records.length, 1)} of the file
            </c2-badge>
            <c2-badge tone="neutral">{pattern.services.join(', ')}</c2-badge>
          </div>
          <p className="ll-muted">
            First at {formatClock(pattern.first, true)}, last at {formatClock(pattern.last, true)}
            {pattern.count > 1 ? ` — about every ${formatDuration((pattern.last - pattern.first) / (pattern.count - 1))}` : ' — logged only once'}.
            {traces.total > 0 && ` Part of ${formatNumber(traces.total)} requests, ${formatNumber(traces.failed)} of which failed.`}
          </p>

          <h3>When it is logged</h3>
          <c2-bar-chart
            ref={chartRef}
            className="ll-sheet__chart"
            x-field="time"
            x-type="time"
            axes="x"
            grid="none"
            legend="none"
            tooltip="axis"
            aria-label={`Occurrences of ${pattern.id} over time`}
          >
            <c2-chart-series field="count" label="Occurrences" />
          </c2-bar-chart>

          {pattern.slots.length > 0 && (
            <>
              <h3>What varies inside it</h3>
              <div className="ll-slots">
                {pattern.slots.map((slot) => (
                  <c2-card key={slot.position} className="ll-slot">
                    <div slot="header" className="ll-slot__head">
                      <code>{slot.label}</code>
                      <span className="ll-muted">
                        {slot.distinct >= 500 ? '500+' : formatNumber(slot.distinct)} distinct value{slot.distinct === 1 ? '' : 's'}
                      </span>
                    </div>
                    {slot.numeric && slot.distinct > 1 && (
                      <p className="ll-slot__numeric">
                        min <strong>{formatValue(slot.numeric.min, slot.numeric.unit)}</strong> · avg{' '}
                        <strong>{formatValue(slot.numeric.avg, slot.numeric.unit)}</strong> · max{' '}
                        <strong>{formatValue(slot.numeric.max, slot.numeric.unit)}</strong>
                      </p>
                    )}
                    {slot.distinct === 1 ? (
                      <p className="ll-muted">
                        Always <code>{slot.top[0]?.value}</code> — a constant the pattern miner could not tell apart from a value.
                      </p>
                    ) : slot.distinct > pattern.count * 0.8 ? (
                      <p className="ll-muted">
                        Unique on almost every line — an identifier such as {slot.top[0]?.value ? <code>{slot.top[0].value}</code> : 'an id'}.
                      </p>
                    ) : (
                      <ul className="ll-slot__values">
                        {slot.top.slice(0, 5).map((value) => (
                          <li key={value.value}>
                            <c2-progress value={value.count} max={pattern.count} label={`${value.value}: ${value.count}`}>
                              <code>{value.value}</code> · {formatNumber(value.count)}
                            </c2-progress>
                          </li>
                        ))}
                      </ul>
                    )}
                  </c2-card>
                ))}
              </div>
            </>
          )}

          <h3>Examples</h3>
          {examples.map((index) => {
            const record = analysis.records[index]
            return (
              <c2-code-viewer
                key={index}
                className="ll-code"
                language="text"
                wrap
                copyable
                code={`${formatTimestamp(record.time)}  ${record.severityText || record.severity.toUpperCase()}  ${record.service}\n${record.body}`}
              />
            )
          })}
        </div>
      )}
      {pattern && (
        <div slot="footer" className="ll-sheet__footer">
          <c2-button
            className="ll-button--primary"
            onClick={() => {
              actions.replaceLens({ patternId: pattern.id }, 'explore')
              onClose()
            }}
          >
            Read all {formatNumber(pattern.count)} records
          </c2-button>
          <c2-button
            className="ll-button--quiet"
            onClick={() => {
              actions.setLens({ patternId: pattern.id })
              onClose()
            }}
          >
            Add to lens
          </c2-button>
          {traces.total > 0 && (
            <c2-button
              className="ll-button--quiet"
              onClick={() => {
                actions.replaceLens({ patternId: pattern.id }, 'journeys')
                onClose()
              }}
            >
              Its requests
            </c2-button>
          )}
        </div>
      )}
    </c2-sheet>
  )
}
