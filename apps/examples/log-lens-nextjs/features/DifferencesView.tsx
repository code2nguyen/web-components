'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { registerEchartsElements } from '@/components/c2n/C2Registry'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { LiftList } from '@/components/ui/LiftList'
import { Segmented } from '@/components/ui/Segmented'
import { attributeLift, isProblem, journeyLift, type Analysis, type AttributeLift } from '@/lib/analysis'
import { isEmptyFocus, matchesFocus, type Focus } from '@/lib/focus'
import { formatNumber, formatPercent, shorten } from '@/lib/format'
import type { LogRecord } from '@/lib/otlp'
import type { LensActions } from './types'

type Target = 'lens' | 'errors' | 'trouble' | 'requests'

/** Inside share against outside share, back to back on one scale: the gap between the two sides is the finding. */
function Comparison({ lifts, inside, outside }: Readonly<{ lifts: readonly AttributeLift[]; inside: string; outside: string }>) {
  const ref = useRef<HTMLElementTagNameMap['c2-butterfly-chart']>(null)
  const data = useMemo(
    () =>
      lifts.slice(0, 8).map((lift) => ({
        attribute: shorten(`${lift.key}=${lift.value}`, 34),
        inside: Math.round(lift.targetShare * 1000) / 10,
        outside: Math.round(lift.restShare * 1000) / 10,
      })),
    [lifts],
  )
  useEffect(() => void registerEchartsElements(), [])
  useElementProperties(ref, 'c2-butterfly-chart', { data }, [data])
  return (
    <c2-butterfly-chart
      ref={ref}
      className="ll-butterfly"
      label-field="attribute"
      legend="top"
      tooltip="axis"
      aria-label={`Share of ${inside} and of ${outside} carrying each attribute, in percent`}
    >
      <c2-chart-series field="inside" label={`% of ${inside}`} />
      <c2-chart-series field="outside" label={`% of ${outside}`} />
    </c2-butterfly-chart>
  )
}

export function DifferencesView({
  analysis,
  records,
  lens,
  actions,
}: Readonly<{ analysis: Analysis; records: LogRecord[]; lens: Focus; actions: LensActions }>) {
  const hasLens = !isEmptyFocus(lens)
  const [target, setTarget] = useState<Target>(hasLens ? 'lens' : 'errors')
  const effective: Target = target === 'lens' && !hasLens ? 'errors' : target

  const { lifts, inside, outside, size, description } = useMemo(() => {
    if (effective === 'requests') {
      const failed = analysis.divergence.failed
      return {
        lifts: journeyLift(analysis.records, analysis.journeys, analysis.divergence.entry, 12),
        inside: 'failed',
        outside: 'successful',
        size: failed,
        description: `Comparing the ${formatNumber(failed)} failed requests with the ${formatNumber(analysis.divergence.ok)} successful requests of the same kind. Every attribute on any record of a request counts for that request.`,
      }
    }
    const predicate =
      effective === 'lens'
        ? (record: LogRecord) => matchesFocus(record, lens, analysis.patternOf)
        : effective === 'errors'
          ? (record: LogRecord) => isProblem(record.severity)
          : (record: LogRecord) => isProblem(record.severity) || record.severity === 'warn'
    const size = effective === 'lens' ? records.length : analysis.records.filter(predicate).length
    const label = effective === 'lens' ? 'the lens' : effective === 'errors' ? 'errors' : 'warnings & errors'
    return {
      lifts: attributeLift(analysis.records, predicate, 12),
      inside: effective === 'lens' ? 'in lens' : label,
      outside: 'the rest',
      size,
      description: `Comparing ${formatNumber(size)} records (${label}) with the other ${formatNumber(analysis.records.length - size)}. Identifiers are ignored: only values shared by many records can explain anything.`,
    }
  }, [analysis, effective, lens, records.length])

  const top = lifts[0]
  return (
    <div className="ll-stack">
      <div className="ll-section-head">
        <div>
          <p className="ll-eyebrow">What sets them apart</p>
          <h2>Attributes that are over-represented</h2>
          <p className="ll-muted">{description}</p>
        </div>
        <Segmented
          label="Compare"
          value={effective}
          options={[
            { value: 'lens', label: 'The lens', disabled: !hasLens },
            { value: 'errors', label: 'Errors' },
            { value: 'trouble', label: 'Warnings & errors' },
            { value: 'requests', label: 'Failed requests', disabled: !analysis.divergence.failed },
          ]}
          onChange={setTarget}
        />
      </div>
      {size === 0 ? (
        <c2-status-panel status="empty" heading="Nothing to compare" description="The chosen set is empty. Pick another comparison or widen the lens." />
      ) : lifts.length === 0 ? (
        <c2-status-panel
          status="info"
          heading="Nothing stands out"
          description="No attribute value is clearly more common in this set than in the rest: the problem is spread evenly, or the records carry few attributes."
        />
      ) : (
        <c2-card className="ll-panel">
          {top && (
            <p slot="header" className="ll-headline">
              <c2-marker variant="underline" className="ll-mark">
                {top.key} = {top.value}
              </c2-marker>{' '}
              is on {formatPercent(top.targetShare)} of {inside} but only {formatPercent(top.restShare)} of {outside}
              {top.lift < 100 ? ` — ${top.lift.toFixed(1)}× more likely.` : '.'}
            </p>
          )}
          <Comparison lifts={lifts} inside={inside} outside={outside} />
          <LiftList lifts={lifts} inside={inside} outside={outside} onPick={(lift) => actions.setLens({ attribute: { key: lift.key, value: lift.value } })} />
        </c2-card>
      )}
    </div>
  )
}
