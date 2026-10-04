'use client'

import type { StepNode } from '@c2n/components/steps'
import { useMemo, useRef } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { isProblem, type Analysis } from '@/lib/analysis'
import { formatClock, formatDuration, shorten } from '@/lib/format'
import type { LensActions } from './types'

interface Props {
  analysis: Analysis
  traceId: string
  actions: LensActions
  onClose: () => void
}

export function JourneySheet({ analysis, traceId, actions, onClose }: Readonly<Props>) {
  const sheetRef = useRef<HTMLElementTagNameMap['c2-sheet']>(null)
  const stepsRef = useRef<HTMLElementTagNameMap['c2-steps']>(null)
  const journey = useMemo(() => (traceId ? analysis.journeys.find((item) => item.traceId === traceId) : undefined), [analysis, traceId])

  const steps = useMemo<StepNode[]>(() => {
    if (!journey) return []
    // One group per service hop, so the timeline reads like the request's path.
    const groups: StepNode[] = []
    let previous = journey.start
    for (const index of journey.records) {
      const record = analysis.records[index]
      const step: StepNode = {
        id: String(index),
        label: shorten(record.body, 120),
        detail: analysis.patternOf[index],
        trailing: `+${formatDuration(record.time - previous)}`,
        status: isProblem(record.severity) ? 'error' : record.severity === 'warn' ? 'warning' : 'success',
      }
      previous = record.time
      const last = groups[groups.length - 1]
      if (last && last.label === record.service) last.children?.push(step)
      else groups.push({ id: `hop-${index}`, label: record.service, detail: formatClock(record.time, true), children: [step] })
    }
    return groups
  }, [analysis, journey])

  useElementProperties(sheetRef, 'c2-sheet', { open: Boolean(journey) }, [journey])
  useElementProperties(stepsRef, 'c2-steps', { steps }, [steps])
  useCustomEvent(sheetRef, 'close', onClose)

  return (
    <c2-sheet ref={sheetRef} side="right" className="ll-sheet" label="Request timeline">
      <span slot="title">{journey ? (journey.failed ? 'Failed request' : 'Successful request') : 'Request'}</span>
      {journey && (
        <div className="ll-sheet__body">
          <div className="ll-facts">
            <c2-badge tone={journey.failed ? 'danger' : 'success'}>{journey.failed ? 'Failed' : 'Succeeded'}</c2-badge>
            <c2-badge tone="neutral">{formatDuration(journey.duration)}</c2-badge>
            <c2-badge tone="neutral">{journey.records.length} records</c2-badge>
            <c2-badge tone="neutral">{journey.services.join(' → ')}</c2-badge>
          </div>
          <p className="ll-muted ll-mono">trace {journey.traceId}</p>
          <c2-steps ref={stepsRef} className="ll-journey-steps" marker="icon" aria-label="Records of this request in order" />
        </div>
      )}
      {journey && (
        <div slot="footer" className="ll-sheet__footer">
          <c2-button
            className="ll-button--primary"
            onClick={() => {
              actions.replaceLens({ traceId: journey.traceId }, 'explore')
              onClose()
            }}
          >
            Read the raw records
          </c2-button>
          <c2-button
            className="ll-button--quiet"
            onClick={() => {
              actions.replaceLens(
                { window: { start: journey.start - 2000, end: journey.end + 2000, label: `±2 s around ${formatClock(journey.start)}` } },
                'explore',
              )
              onClose()
            }}
          >
            What else happened then?
          </c2-button>
        </div>
      )}
    </c2-sheet>
  )
}
