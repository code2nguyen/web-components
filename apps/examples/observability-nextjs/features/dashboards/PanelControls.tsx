'use client'

import type { MouseEvent } from 'react'
import type { DashboardPanelSize } from '@/lib/storage/keys'
import type { DashboardMove } from './dashboard-layout'
import type { DashboardPanelDefinition } from './panel-catalog'
import styles from './dashboard.module.css'

const SIZE_LABELS: Readonly<Record<DashboardPanelSize, string>> = { small: 'Small', medium: 'Medium', large: 'Large' }

export interface PanelControlsProps {
  panel: DashboardPanelDefinition
  position: number
  count: number
  size: DashboardPanelSize
  onMove: (move: DashboardMove) => void
  onResize: (size: DashboardPanelSize) => void
}

export function PanelControls({ panel, position, count, size, onMove, onResize }: PanelControlsProps) {
  const retainFocus = (event: MouseEvent<HTMLElement>, action: () => void) => {
    const target = event.currentTarget
    action()
    requestAnimationFrame(() => target.focus())
  }

  return (
    <div className={styles.panelControls} aria-label={`${panel.title} layout controls`}>
      <span className={styles.controlLabel}>Move</span>
      <c2-button-group appearance="joined" size="s" aria-label={`Move ${panel.title}`}>
        <c2-button aria-label={`Move ${panel.title} first`} disabled={position === 1} onClick={(event) => retainFocus(event, () => onMove('first'))}>
          <span className={styles.srOnly}>Move {panel.title} first</span>
          <span aria-hidden="true">First</span>
        </c2-button>
        <c2-button aria-label={`Move ${panel.title} before`} disabled={position === 1} onClick={(event) => retainFocus(event, () => onMove('before'))}>
          <span className={styles.srOnly}>Move {panel.title} before</span>
          <span aria-hidden="true">Before</span>
        </c2-button>
        <c2-button aria-label={`Move ${panel.title} after`} disabled={position === count} onClick={(event) => retainFocus(event, () => onMove('after'))}>
          <span className={styles.srOnly}>Move {panel.title} after</span>
          <span aria-hidden="true">After</span>
        </c2-button>
        <c2-button aria-label={`Move ${panel.title} last`} disabled={position === count} onClick={(event) => retainFocus(event, () => onMove('last'))}>
          <span className={styles.srOnly}>Move {panel.title} last</span>
          <span aria-hidden="true">Last</span>
        </c2-button>
      </c2-button-group>

      <span className={styles.controlLabel}>Size</span>
      <c2-button-group
        appearance="segmented"
        selection="single"
        value={String((['small', 'medium', 'large'] as const).indexOf(size))}
        size="s"
        aria-label={`Resize ${panel.title}`}
      >
        {(['small', 'medium', 'large'] as const).map((candidate) => (
          <c2-button
            key={candidate}
            aria-label={`Set ${panel.title} size to ${SIZE_LABELS[candidate]}`}
            selected={size === candidate}
            toggle
            disabled={!panel.supportedSizes.includes(candidate)}
            onClick={(event) => retainFocus(event, () => onResize(candidate))}
          >
            <span className={styles.srOnly}>
              Set {panel.title} size to {SIZE_LABELS[candidate]}
            </span>
            <span aria-hidden="true">{SIZE_LABELS[candidate]}</span>
          </c2-button>
        ))}
      </c2-button-group>
    </div>
  )
}
