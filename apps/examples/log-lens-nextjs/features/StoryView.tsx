'use client'

import { useMemo, useRef } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { StoryText } from '@/components/ui/PatternText'
import type { Analysis, Chapter } from '@/lib/analysis'
import type { Focus } from '@/lib/focus'
import { formatClock, formatDuration, formatNumber, shorten } from '@/lib/format'
import { quickAnswers } from '@/lib/insights'
import type { LensActions } from './types'

interface Props {
  analysis: Analysis
  lens: Focus
  actions: LensActions
}

const KIND_LABEL: Record<Chapter['kind'], string> = {
  opening: 'Overview',
  surge: 'Incident',
  'new-behaviour': 'Change',
  silence: 'Silence',
  recovery: 'Recovery',
  closing: 'Ending',
}

const TONE_BADGE: Record<Chapter['tone'], 'neutral' | 'info' | 'warning' | 'danger' | 'success'> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  danger: 'danger',
  success: 'success',
}

function ChapterIcon({ kind }: Readonly<{ kind: Chapter['kind'] }>) {
  switch (kind) {
    case 'surge':
      return <c2-feather-zap aria-hidden="true" />
    case 'new-behaviour':
      return <c2-feather-activity aria-hidden="true" />
    case 'silence':
      return <c2-feather-clock aria-hidden="true" />
    case 'recovery':
      return <c2-feather-crosshair aria-hidden="true" />
    case 'closing':
      return <c2-feather-file-text aria-hidden="true" />
    default:
      return <c2-feather-book-open aria-hidden="true" />
  }
}

function chapterId(chapter: Chapter): string {
  return `chapter-${chapter.id}`
}

function Rhythm({ analysis, actions }: Readonly<{ analysis: Analysis; actions: LensActions }>) {
  const chartRef = useRef<HTMLElementTagNameMap['c2-area-chart']>(null)
  const { timeline } = analysis
  const data = useMemo(
    () => timeline.buckets.map((bucket) => ({ time: bucket.start, total: bucket.total, warnings: bucket.warnings, errors: bucket.problems })),
    [timeline],
  )
  useElementProperties(chartRef, 'c2-area-chart', { data }, [data])
  useCustomEvent(chartRef, 'point-click', (event) => {
    const bucket = timeline.buckets[event.detail.index]
    if (bucket)
      actions.setLens({ window: { start: bucket.start, end: bucket.end, label: `${formatClock(bucket.start)} (${formatDuration(timeline.bucketMs)})` } })
  })
  useCustomEvent(chartRef, 'range-change', (event) => {
    const { min, max } = event.detail
    if (max - min < timeline.bucketMs || (min <= timeline.start && max >= timeline.end)) return
    actions.setLens({ window: { start: min, end: max, label: `${formatClock(min)}–${formatClock(max)}` } })
  })

  const span = Math.max(1, analysis.end - analysis.start)
  const peak = timeline.buckets.reduce((best, bucket) => (bucket.problems > best.problems ? bucket : best), timeline.buckets[0])

  return (
    <c2-card className="ll-panel ll-rhythm">
      <div slot="header" className="ll-panel__head">
        <div>
          <p className="ll-eyebrow">The file&apos;s rhythm</p>
          <h2>Volume and trouble over time</h2>
        </div>
        <span className="ll-muted">Drag across the chart to put a time window in the lens · one point = {formatDuration(timeline.bucketMs)}</span>
      </div>
      <c2-area-chart
        ref={chartRef}
        className="ll-rhythm__chart"
        x-field="time"
        x-type="time"
        axes="both"
        grid="y"
        legend="bottom"
        tooltip="axis"
        curve="smooth"
        zoom
        aria-label={`Records per ${formatDuration(timeline.bucketMs)}. Errors peak at ${peak?.problems ?? 0} around ${peak ? formatClock(peak.start) : ''}.`}
      >
        <c2-chart-series field="total" label="All records" />
        <c2-chart-series field="warnings" label="Warnings (right axis)" axis="right" />
        <c2-chart-series field="errors" label="Errors (right axis)" axis="right" />
      </c2-area-chart>
      <div className="ll-chapter-strip" aria-label="Chapters on the timeline">
        <span className="ll-chapter-strip__time">{formatClock(analysis.start)}</span>
        <div className="ll-chapter-strip__track">
          {analysis.chapters
            .filter((chapter) => chapter.kind !== 'opening' && chapter.kind !== 'closing')
            .map((chapter) => (
              <c2-icon-button
                key={chapter.id}
                className={`ll-marker ll-marker--${chapter.tone}`}
                style={{ left: `${((chapter.start - analysis.start) / span) * 100}%` }}
                aria-label={`${chapter.title} at ${formatClock(chapter.start)}`}
                tooltip={`${formatClock(chapter.start)} · ${chapter.title}`}
                onClick={() => document.getElementById(chapterId(chapter))?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              >
                <ChapterIcon kind={chapter.kind} />
              </c2-icon-button>
            ))}
        </div>
        <span className="ll-chapter-strip__time">{formatClock(analysis.end)}</span>
      </div>
    </c2-card>
  )
}

function ChapterCard({ chapter, analysis, actions }: Readonly<{ chapter: Chapter; analysis: Analysis; actions: LensActions }>) {
  const moment =
    chapter.kind === 'opening' || chapter.kind === 'closing'
      ? ''
      : chapter.end > chapter.start
        ? `${formatClock(chapter.start)} → ${formatClock(chapter.end)}`
        : formatClock(chapter.start)
  const patterns = chapter.patternIds.map((id) => analysis.patternById.get(id)).filter((pattern) => pattern !== undefined)
  return (
    <li className={`ll-chapter ll-chapter--${chapter.tone}`} id={chapterId(chapter)}>
      <span className="ll-chapter__dot" aria-hidden="true">
        <ChapterIcon kind={chapter.kind} />
      </span>
      <c2-card className="ll-chapter__card">
        <div slot="header" className="ll-chapter__head">
          <c2-badge tone={TONE_BADGE[chapter.tone]}>{KIND_LABEL[chapter.kind]}</c2-badge>
          <h3>{chapter.title}</h3>
          {moment && <span className="ll-chapter__time">{moment}</span>}
        </div>
        <p className="ll-chapter__text">
          <StoryText text={chapter.text} />
        </p>
        {chapter.facts.length > 0 && (
          <div className="ll-facts">
            {chapter.facts.map((fact) => (
              <c2-badge key={fact} tone="neutral">
                {fact}
              </c2-badge>
            ))}
          </div>
        )}
        {(chapter.focus || patterns.length > 0) && (
          <div slot="footer" className="ll-chapter__actions">
            {chapter.focus && (
              <>
                <c2-button className="ll-button--primary" onClick={() => actions.replaceLens(chapter.focus ?? {}, 'explore')}>
                  <c2-feather-terminal slot="prefix-icon" />
                  Read these records
                </c2-button>
                <c2-button className="ll-button--quiet" onClick={() => actions.replaceLens(chapter.focus ?? {}, 'differences')}>
                  What is different here?
                </c2-button>
              </>
            )}
            {patterns.slice(0, 4).map((pattern) => (
              <c2-button
                key={pattern.id}
                className="ll-button--quiet ll-pattern-chip"
                onClick={() => actions.openPattern(pattern.id)}
                aria-label={`Open pattern ${pattern.id}`}
              >
                <c2-feather-layers slot="prefix-icon" />
                {pattern.id} · {shorten(pattern.template, 28)}
              </c2-button>
            ))}
          </div>
        )}
      </c2-card>
    </li>
  )
}

function ServicesTree({ analysis, actions }: Readonly<{ analysis: Analysis; actions: LensActions }>) {
  const treeRef = useRef<HTMLElementTagNameMap['c2-tree']>(null)
  const items = useMemo(() => {
    const instances = new Map<string, Map<string, { count: number; problems: number; key: string }>>()
    for (const record of analysis.records) {
      const key = ['k8s.pod.name', 'service.instance.id', 'host.name'].find((candidate) => typeof record.resource[candidate] === 'string')
      if (!key) continue
      const name = String(record.resource[key])
      const byService = instances.get(record.service) ?? new Map()
      const entry = byService.get(name) ?? { count: 0, problems: 0, key }
      entry.count++
      if (record.severity === 'error' || record.severity === 'fatal') entry.problems++
      byService.set(name, entry)
      instances.set(record.service, byService)
    }
    return analysis.services.map((service) => ({
      value: `service\u0000${service.name}`,
      label: `${service.name} · ${formatNumber(service.count)}${service.problems ? ` · ${formatNumber(service.problems)} errors` : ''}`,
      children: [...(instances.get(service.name) ?? [])]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, entry]) => ({
          value: `attr\u0000${entry.key}\u0000${name}`,
          label: `${name} · ${formatNumber(entry.count)}${entry.problems ? ` · ${formatNumber(entry.problems)} errors` : ''}`,
        })),
    }))
  }, [analysis])
  const expanded = useMemo(() => analysis.services.filter((service) => service.problems > 0).map((service) => `service\u0000${service.name}`), [analysis])
  useElementProperties(treeRef, 'c2-tree', { items, expandedItems: expanded }, [items, expanded])
  useCustomEvent(treeRef, 'item-click', (event) => {
    const [kind, first, second] = event.detail.node.value.split('\u0000')
    if (kind === 'service') actions.setLens({ services: [first] })
    else if (kind === 'attr') actions.setLens({ attribute: { key: first, value: second } })
  })
  return (
    <c2-card className="ll-panel">
      <div slot="header" className="ll-panel__head">
        <div>
          <p className="ll-eyebrow">Where the records come from</p>
          <h2>Services and instances</h2>
        </div>
      </div>
      <c2-tree ref={treeRef} className="ll-tree" selection="single" aria-label="Services and their instances" />
    </c2-card>
  )
}

function QuickAnswers({ analysis, actions }: Readonly<{ analysis: Analysis; actions: LensActions }>) {
  const answers = useMemo(() => quickAnswers(analysis), [analysis])
  return (
    <c2-card className="ll-panel ll-answers">
      <div slot="header" className="ll-panel__head">
        <div>
          <p className="ll-eyebrow">If you only have a minute</p>
          <h2>Quick answers</h2>
        </div>
      </div>
      <dl className="ll-answers__list">
        {answers.map((answer) => (
          <div key={answer.question} className="ll-answer">
            <dt>{answer.question}</dt>
            <dd>
              <span>{answer.answer}</span>
              {(answer.focus || answer.patternId) && (
                <c2-button
                  className="ll-button--link"
                  onClick={() => (answer.patternId ? actions.openPattern(answer.patternId) : actions.replaceLens(answer.focus ?? {}, 'explore'))}
                >
                  Show me
                </c2-button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </c2-card>
  )
}

export function StoryView({ analysis, lens, actions }: Readonly<Props>) {
  const windowed = lens.window
  const chapters = windowed ? analysis.chapters.filter((chapter) => chapter.end >= windowed.start && chapter.start <= windowed.end) : analysis.chapters
  return (
    <div className="ll-story">
      <div className="ll-story__main">
        <Rhythm analysis={analysis} actions={actions} />
        <section aria-labelledby="story-title">
          <div className="ll-section-head">
            <h2 id="story-title">What happened, in order</h2>
            <span className="ll-muted">
              {windowed
                ? `${chapters.length} of ${analysis.chapters.length} chapters touch the lens window`
                : `${analysis.chapters.length} chapters, written from the records`}
            </span>
          </div>
          <ol className="ll-chapters">
            {chapters.map((chapter) => (
              <ChapterCard key={chapter.id} chapter={chapter} analysis={analysis} actions={actions} />
            ))}
          </ol>
        </section>
      </div>
      <aside className="ll-story__aside" aria-label="Answers and sources">
        <QuickAnswers analysis={analysis} actions={actions} />
        <ServicesTree analysis={analysis} actions={actions} />
      </aside>
    </div>
  )
}
