'use client'

import type { Dashboard } from '@c2n/dashboard'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useElementProperties } from '@/components/c2n/element-bindings'
import { useCustomEvent } from '@/components/c2n/useCustomEvent'
import { telemetryDataset } from '@/lib/data/dataset'
import { buildDatasetIndexes } from '@/lib/data/indexes'
import { useAppContext } from '@/providers/AppProviders'
import { useDemoState } from '@/providers/DemoStateProvider'
import { useReplay } from '@/providers/ReplayProvider'
import { useScope } from '@/providers/ScopeProvider'
import { DashboardPanel } from './DashboardPanel'
import { PanelControls } from './PanelControls'
import {
  buildDashboardPlacements,
  createDashboardLayoutStore,
  dashboardRowCount,
  moveDashboardPanel,
  resizeDashboardPanel,
  type DashboardMove,
} from './dashboard-layout'
import { selectDashboardProjections, type DashboardScope } from './dashboard-selectors'
import { dashboardPanelById, type DashboardPanelId } from './panel-catalog'
import styles from './dashboard.module.css'

const indexes = buildDatasetIndexes(telemetryDataset)
const SIZE_NAMES = { small: 'Small', medium: 'Medium', large: 'Large' } as const

function rangeLabel(range: DashboardScope['range']): string {
  if (range.kind === 'relative') return range.value === '24h' ? '24 hours' : range.value === '2h' ? '2 hours' : '30 minutes'
  return `${range.from.slice(0, 10)}–${range.to.slice(0, 10)} UTC`
}

function viewportBreakpoint(): 'desktop' | 'tablet' {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches ? 'tablet' : 'desktop'
}

export function OperationalDashboard() {
  const dashboardRef = useRef<Dashboard>(null)
  const desktopStoreRef = useRef(createDashboardLayoutStore('desktop'))
  const tabletStoreRef = useRef(createDashboardLayoutStore('tablet'))
  const desktopLayout = useSyncExternalStore(desktopStoreRef.current.subscribe, desktopStoreRef.current.getSnapshot, desktopStoreRef.current.getServerSnapshot)
  const tabletLayout = useSyncExternalStore(tabletStoreRef.current.subscribe, tabletStoreRef.current.getSnapshot, tabletStoreRef.current.getServerSnapshot)
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet'>('desktop')
  const { scope } = useScope()
  const replay = useReplay()
  const { demoState, setDemoState } = useDemoState()
  const { announce } = useAppContext()

  useEffect(() => {
    desktopStoreRef.current.hydrate()
    tabletStoreRef.current.hydrate()
    const media = window.matchMedia('(max-width: 900px)')
    const synchronize = () => setBreakpoint(viewportBreakpoint())
    synchronize()
    media.addEventListener('change', synchronize)
    return () => media.removeEventListener('change', synchronize)
  }, [])

  const layout = breakpoint === 'desktop' ? desktopLayout : tabletLayout
  const store = breakpoint === 'desktop' ? desktopStoreRef.current : tabletStoreRef.current
  const placements = useMemo(() => buildDashboardPlacements(layout), [layout])
  const dashboardScope = useMemo<DashboardScope>(() => ({ environmentId: scope.environmentId, range: scope.range }), [scope.environmentId, scope.range])
  const snapshot = useMemo(
    // Dataset selectors deliberately reject a clock from another baseline. The
    // dashboard uses the dataset's fixed UTC origin while sharing the global
    // clock's logical tick, status, and cadence.
    () => ({ baselineInstant: telemetryDataset.baselineInstant, tick: replay.tick, status: replay.status, stepMs: replay.stepMs }),
    [replay.status, replay.stepMs, replay.tick],
  )
  const projections = useMemo(() => selectDashboardProjections(telemetryDataset, indexes, snapshot, dashboardScope), [dashboardScope, snapshot])
  const projectionById = useMemo(() => new Map(projections.map((projection) => [projection.panelId, projection])), [projections])

  useElementProperties(dashboardRef, 'c2-dashboard', { layout: placements }, [placements])
  useCustomEvent(dashboardRef, 'layout-change', () => announce('Dashboard track size adjusted. Named panel size and order remain in the saved layout.'))

  const persist = (next: typeof layout, message: string) => {
    const persisted = store.set(next)
    announce(persisted ? message : `${message} Browser storage is unavailable, so the change lasts for this session.`)
  }

  const movePanel = (panelId: DashboardPanelId, move: DashboardMove) => {
    const result = moveDashboardPanel(layout, panelId, move)
    const panel = dashboardPanelById(panelId)
    if (!result.changed) {
      announce(`${panel?.title ?? panelId} is already at that boundary.`)
      return
    }
    persist(result.layout, `${panel?.title ?? panelId} moved to position ${result.position} of ${layout.orderedPanelIds.length}.`)
  }

  const resizePanel = (panelId: DashboardPanelId, size: 'small' | 'medium' | 'large') => {
    const result = resizeDashboardPanel(layout, panelId, size)
    const panel = dashboardPanelById(panelId)
    if (!result.changed) {
      announce(
        result.reason === 'unsupported-size'
          ? `${SIZE_NAMES[size]} is not supported for ${panel?.title ?? panelId}.`
          : `${panel?.title ?? panelId} is already ${SIZE_NAMES[size]}.`,
      )
      return
    }
    persist(result.layout, `${panel?.title ?? panelId} resized to ${SIZE_NAMES[size]}.`)
  }

  const resetLayout = () => {
    desktopStoreRef.current.reset()
    tabletStoreRef.current.reset()
    announce('Dashboard layout reset to the documented desktop and tablet defaults.')
  }

  return (
    <section className={styles.workspace} data-testid="operational-dashboard">
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>Operations · {scope.environmentId}</p>
          <h1>Operational dashboard</h1>
          <p>Seven curated panels share one environment, range, and deterministic replay clock.</p>
        </div>
        <div className={styles.headerActions}>
          <c2-button-group
            appearance="segmented"
            selection="single"
            value={String((['normal', 'loading', 'empty', 'error'] as const).indexOf(demoState))}
            size="s"
            aria-label="Dashboard demonstration state"
          >
            {(['normal', 'loading', 'empty', 'error'] as const).map((state) => (
              <c2-button
                key={state}
                selected={demoState === state}
                toggle
                aria-label={`Show ${state} dashboard state`}
                onClick={() => {
                  setDemoState(state)
                  announce(`Dashboard demonstration state changed to ${state}.`)
                }}
              >
                <span className={styles.srOnly}>Show {state} dashboard state</span>
                <span aria-hidden="true">{state[0].toUpperCase() + state.slice(1)}</span>
              </c2-button>
            ))}
          </c2-button-group>
          <c2-button onClick={resetLayout} aria-label="Reset dashboard layout">
            Reset layout
          </c2-button>
        </div>
      </header>

      <div className={styles.scopeSummary}>
        <c2-badge tone={replay.status === 'playing' ? 'success' : 'neutral'}>{replay.status === 'playing' ? 'Live replay' : 'Paused baseline'}</c2-badge>
        <span>
          Replay snapshot: {replay.status} at tick {replay.tick}
        </span>
        <span>
          {rangeLabel(dashboardScope.range)} · {breakpoint} layout
        </span>
        <c2-progress value={Math.min(replay.tick, 12)} max={12} show-value label="Replay window">
          Replay window
          <span slot="value">tick {replay.tick}</span>
        </c2-progress>
      </div>

      <c2-dashboard
        ref={dashboardRef}
        className={styles.dashboard}
        columns={breakpoint === 'desktop' ? 4 : 1}
        rows={Array.from({ length: dashboardRowCount(layout) }, () => 'minmax(300px,auto)').join(' ')}
        min-column-width={breakpoint === 'desktop' ? 180 : 280}
        min-row-height={260}
        aria-label="Curated operational panels"
      >
        {layout.orderedPanelIds.map((panelId, index) => {
          const panel = dashboardPanelById(panelId)
          const projection = projectionById.get(panelId as DashboardPanelId)
          const placement = placements[panelId]
          if (!panel || !projection || !placement) return null
          return (
            <c2-dash-card
              key={panelId}
              card-id={panelId}
              data-panel-id={panelId}
              data-panel-size={layout.sizes[panelId]}
              data-update-key={projection.updateKey}
              col={placement.col}
              row={placement.row}
              col-span={placement.colSpan}
              row-span={placement.rowSpan}
              min-width={180}
              min-height={260}
              resize={breakpoint === 'desktop' ? 'both' : 'vertical'}
              expand-full
            >
              <span id={`${panelId}-title`} slot="header">
                {panel.title}
              </span>
              <span slot="actions" className={styles.panelPosition}>
                Panel {index + 1} of {layout.orderedPanelIds.length} · {SIZE_NAMES[layout.sizes[panelId]]}
              </span>
              <div className={styles.panelBody}>
                <DashboardPanel projection={projection} demoState={demoState} />
              </div>
              <PanelControls
                panel={panel}
                position={index + 1}
                count={layout.orderedPanelIds.length}
                size={layout.sizes[panelId]}
                onMove={(move) => movePanel(panel.id, move)}
                onResize={(size) => resizePanel(panel.id, size)}
              />
              <span slot="footer">
                {panel.description} · {projection.unit}
              </span>
            </c2-dash-card>
          )
        })}
      </c2-dashboard>

      <c2-details label="Dashboard data-quality fixtures" className={styles.fixtures}>
        <ul>
          <li>
            <strong>Zero:</strong> active incidents may resolve to 0 without an empty-state substitution.
          </li>
          <li>
            <strong>Unavailable:</strong> null metric points are omitted and called out as unavailable in text.
          </li>
          <li>
            <strong>Extreme:</strong> duration buckets include traces above 2,000 ms without clipping their count.
          </li>
          <li>
            <strong>Mixed units:</strong> milliseconds, percentages, counts, and requests per second remain in separate panels.
          </li>
        </ul>
      </c2-details>
    </section>
  )
}
