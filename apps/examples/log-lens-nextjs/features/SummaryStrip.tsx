'use client'

import type { Analysis } from '@/lib/analysis'
import { formatDate, formatDuration, formatNumber, formatPercent } from '@/lib/format'

interface Props {
  analysis: Analysis
  source: { name: string; size: number; format: string; parseMs: number }
}

export function SummaryStrip({ analysis, source }: Readonly<Props>) {
  const { records, patterns, journeys, divergence } = analysis
  const failed = journeys.filter((journey) => journey.failed).length
  const errorShare = analysis.problems / records.length
  return (
    <section className="ll-summary" aria-label="File summary">
      <c2-stat value={formatNumber(records.length)} label="Records">
        <span slot="description">
          {source.format} · {(source.size / 1024 / 1024).toFixed(1)} MB
        </span>
      </c2-stat>
      <c2-stat value={formatDuration(analysis.end - analysis.start)} label="Time span">
        <span slot="description">{formatDate(analysis.start)} (UTC)</span>
      </c2-stat>
      <c2-stat value={formatNumber(patterns.length)} label="Message patterns">
        <span slot="description">{Math.max(1, Math.round(records.length / Math.max(1, patterns.length)))} lines per pattern</span>
      </c2-stat>
      <c2-stat value={formatPercent(errorShare, 1)} label="Errors" tone={errorShare > 0.05 ? 'negative' : errorShare > 0 ? 'warning' : 'positive'}>
        <span slot="description">{formatNumber(analysis.problems)} error or fatal records</span>
      </c2-stat>
      <c2-stat value={formatNumber(journeys.length)} label="Requests" tone={failed ? 'warning' : 'neutral'}>
        <span slot="description">
          {journeys.length ? `${formatNumber(failed)} failed · ${formatNumber(divergence.ok + divergence.failed)} compared` : 'No trace ids in this file'}
        </span>
      </c2-stat>
    </section>
  )
}
