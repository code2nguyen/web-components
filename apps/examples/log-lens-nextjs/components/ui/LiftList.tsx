'use client'

import type { AttributeLift } from '@/lib/analysis'
import { formatPercent } from '@/lib/format'

/** Attribute over-representation, as two bars per row: how often inside the set, how often outside. */
export function LiftList({
  lifts,
  inside,
  outside,
  onPick,
}: Readonly<{ lifts: readonly AttributeLift[]; inside: string; outside: string; onPick: (lift: AttributeLift) => void }>) {
  return (
    <ol className="ll-lifts">
      {lifts.map((lift) => (
        <li key={`${lift.key}=${lift.value}`} className="ll-lift">
          <div className="ll-lift__name">
            <code className="ll-lift__key">{lift.key}</code>
            <span className="ll-lift__eq">=</span>
            <code className="ll-lift__value" title={lift.value}>
              {lift.value}
            </code>
          </div>
          <div className="ll-lift__bars">
            <c2-progress
              className="ll-bar ll-bar--inside"
              value={Math.round(lift.targetShare * 1000) / 10}
              max={100}
              label={`${inside}: ${formatPercent(lift.targetShare)}`}
            >
              {inside} · {formatPercent(lift.targetShare)}
            </c2-progress>
            <c2-progress
              className="ll-bar ll-bar--outside"
              value={Math.round(lift.restShare * 1000) / 10}
              max={100}
              label={`${outside}: ${formatPercent(lift.restShare)}`}
            >
              {outside} · {formatPercent(lift.restShare)}
            </c2-progress>
          </div>
          <c2-badge tone={lift.lift >= 5 ? 'danger' : lift.lift >= 2 ? 'warning' : 'neutral'} className="ll-lift__ratio">
            {lift.lift >= 100 ? 'only here' : `${lift.lift.toFixed(1)}×`}
          </c2-badge>
          <c2-button className="ll-button--quiet ll-lift__action" onClick={() => onPick(lift)}>
            Add to lens
          </c2-button>
        </li>
      ))}
    </ol>
  )
}
