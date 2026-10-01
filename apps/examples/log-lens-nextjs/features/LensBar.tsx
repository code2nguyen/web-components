'use client'

import type { Analysis } from '@/lib/analysis'
import { isEmptyFocus, type Focus, type FocusKey } from '@/lib/focus'
import { formatClock, formatNumber, formatPercent, shorten } from '@/lib/format'
import { SEVERITY_LABEL } from '@/lib/insights'
import type { LensActions } from './types'

interface Props {
  analysis: Analysis
  lens: Focus
  matching: number
  actions: LensActions
}

function chips(lens: Focus, analysis: Analysis): Array<{ key: FocusKey; label: string }> {
  const list: Array<{ key: FocusKey; label: string }> = []
  if (lens.window) list.push({ key: 'window', label: lens.window.label ?? `${formatClock(lens.window.start)}–${formatClock(lens.window.end)}` })
  if (lens.severities?.length) list.push({ key: 'severities', label: lens.severities.map((severity) => SEVERITY_LABEL[severity]).join(' + ') })
  if (lens.services?.length) list.push({ key: 'services', label: lens.services.join(', ') })
  if (lens.patternId) {
    const pattern = analysis.patternById.get(lens.patternId)
    list.push({ key: 'patternId', label: pattern ? `${pattern.id} “${shorten(pattern.template, 36)}”` : lens.patternId })
  }
  if (lens.traceId) list.push({ key: 'traceId', label: `trace ${lens.traceId.slice(0, 10)}…` })
  if (lens.attribute) list.push({ key: 'attribute', label: `${lens.attribute.key} = ${shorten(lens.attribute.value, 32)}` })
  if (lens.search) list.push({ key: 'search', label: `“${lens.search}”` })
  return list
}

export function LensBar({ analysis, lens, matching, actions }: Readonly<Props>) {
  const empty = isEmptyFocus(lens)
  const total = analysis.records.length
  return (
    <div className={`ll-lensbar${empty ? ' ll-lensbar--empty' : ''}`} role="region" aria-label="Lens" aria-live="polite">
      <span className="ll-lensbar__title">
        <c2-feather-crosshair aria-hidden="true" />
        Lens
      </span>
      {empty ? (
        <span className="ll-muted">Everything, {formatNumber(total)} records. Click a chapter, pattern, request or attribute to narrow every view to it.</span>
      ) : (
        <>
          <div className="ll-lensbar__chips">
            {chips(lens, analysis).map((chip) => (
              <c2-button key={chip.key} className="ll-chip" aria-label={`Remove ${chip.label} from the lens`} onClick={() => actions.clearLens(chip.key)}>
                {chip.label}
                <c2-feather-x slot="suffix-icon" />
              </c2-button>
            ))}
          </div>
          <span className="ll-lensbar__count">
            {formatNumber(matching)} of {formatNumber(total)} records · {formatPercent(matching / total, 1)}
          </span>
          <c2-button className="ll-button--quiet" onClick={() => actions.clearLens()}>
            Clear lens
          </c2-button>
        </>
      )}
    </div>
  )
}
