'use client'

import { useMemo, useState } from 'react'
import { LiftList } from '@/components/ui/LiftList'
import { Segmented } from '@/components/ui/Segmented'
import { attributeLift, isProblem, journeyLift, type Analysis } from '@/lib/analysis'
import { isEmptyFocus, matchesFocus, type Focus } from '@/lib/focus'
import { formatNumber, formatPercent } from '@/lib/format'
import type { LogRecord } from '@/lib/otlp'
import type { LensActions } from './types'

type Target = 'lens' | 'errors' | 'trouble' | 'requests'

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
              <strong>
                {top.key} = {top.value}
              </strong>{' '}
              is on {formatPercent(top.targetShare)} of {inside} but only {formatPercent(top.restShare)} of {outside}
              {top.lift < 100 ? ` — ${top.lift.toFixed(1)}× more likely.` : '.'}
            </p>
          )}
          <LiftList lifts={lifts} inside={inside} outside={outside} onPick={(lift) => actions.setLens({ attribute: { key: lift.key, value: lift.value } })} />
        </c2-card>
      )}
    </div>
  )
}
