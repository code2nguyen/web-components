'use client'

import { useMemo, useState } from 'react'
import type { AlertPreview } from './alert-rules'
import styles from './alerts.module.css'

type PreviewState = 'normal' | 'loading' | 'empty' | 'error'

export function AlertRulePreview({ preview }: Readonly<{ preview: AlertPreview }>) {
  const [state, setState] = useState<PreviewState>('normal')
  const recent = preview.samples.slice(-25)
  const maximum = useMemo(() => Math.max(1, ...recent.map(({ value }) => value)), [recent])

  return (
    <section className={styles.preview} aria-labelledby="preview-heading">
      <div className={styles.headingRow}>
        <div>
          <p className={styles.eyebrow}>Local projection</p>
          <h2 id="preview-heading">Historical threshold preview</h2>
        </div>
        <div className={styles.actions} aria-label="Preview demonstration state">
          {(['normal', 'loading', 'empty', 'error'] as const).map((candidate) => (
            <c2-button key={candidate} toggle selected={state === candidate} onClick={() => setState(candidate)}>
              {candidate}
            </c2-button>
          ))}
        </div>
      </div>

      {state === 'loading' ? (
        <c2-status-panel status="info" heading="Calculating local preview" description="Reading deterministic metric samples." />
      ) : state === 'error' ? (
        <c2-status-panel status="error" heading="Preview unavailable" description="This recoverable demonstration does not affect your draft.">
          <c2-button slot="actions" onClick={() => setState('normal')}>
            Try again
          </c2-button>
        </c2-status-panel>
      ) : state === 'empty' || recent.length === 0 ? (
        <c2-status-panel status="neutral" heading="No historical samples" description="Choose at least one service with samples to preview this rule." />
      ) : (
        <>
          <p>{preview.explanation}</p>
          <p>
            <strong>{preview.firingIntervals.length}</strong> sample{preview.firingIntervals.length === 1 ? '' : 's'} would have fired.
          </p>
          <div
            className={styles.previewMeter}
            role="img"
            aria-label={`Twenty-five most recent synthetic samples; ${recent.filter(({ firing }) => firing).length} cross the threshold.`}
          >
            {recent.map((sample) => (
              <span
                key={sample.offsetMs}
                className={styles.previewBar}
                data-firing={sample.firing}
                style={{ height: `${Math.max(2, Math.round((sample.value / maximum) * 100))}%` }}
                title={`${sample.value}${sample.firing ? ', firing' : ''}`}
              />
            ))}
          </div>
          <c2-details label="Accessible preview data">
            <table>
              <thead>
                <tr>
                  <th>Offset</th>
                  <th>Value</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((sample) => (
                  <tr key={sample.offsetMs}>
                    <td>{sample.offsetMs} ms</td>
                    <td>{sample.value}</td>
                    <td>{sample.firing ? 'Would fire' : 'Within threshold'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </c2-details>
        </>
      )}
    </section>
  )
}
