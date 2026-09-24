import assert from 'node:assert/strict'
import test from 'node:test'
import { telemetryDataset } from '../../lib/data/dataset.ts'
import { buildDatasetIndexes } from '../../lib/data/indexes.ts'
import type { StorageLike } from '../../lib/storage/browser-store.ts'
import { STORAGE_KEYS, resetDashboardLayout } from '../../lib/storage/keys.ts'
import {
  DASHBOARD_BREAKPOINTS,
  buildDashboardPlacements,
  createDashboardLayoutStore,
  defaultDashboardLayout,
  moveDashboardPanel,
  resizeDashboardPanel,
  validateDashboardLayout,
} from '../../features/dashboards/dashboard-layout.ts'
import { DASHBOARD_PANEL_IDS, DASHBOARD_PANELS, dashboardPanelSizes } from '../../features/dashboards/panel-catalog.ts'
import { selectDashboardProjections } from '../../features/dashboards/dashboard-selectors.ts'
import { replayOffsetWindow } from '../../lib/query/time-window.ts'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }

  removeItem(key: string) {
    this.values.delete(key)
  }
}

test('catalog is a stable, diverse projection of the curated dataset panels', () => {
  assert.ok(DASHBOARD_PANELS.length >= 6)
  assert.deepEqual(DASHBOARD_PANEL_IDS, telemetryDataset.dashboard.panelIds)
  assert.equal(new Set(DASHBOARD_PANEL_IDS).size, DASHBOARD_PANEL_IDS.length)
  assert.ok(new Set(DASHBOARD_PANELS.map(({ kind }) => kind)).size >= 4)
  for (const panel of DASHBOARD_PANELS) {
    assert.ok(panel.summaryIntent.length > 20)
    assert.ok(panel.supportedSizes.includes(panel.defaultSize))
    assert.ok(panel.selector.metric.length > 0)
  }
})

test('panel projections use one environment, range, and replay snapshot with explicit units and alternatives', () => {
  const indexes = buildDatasetIndexes(telemetryDataset)
  const snapshot = { baselineInstant: telemetryDataset.baselineInstant, tick: 0, status: 'paused' as const, stepMs: 5_000 }
  const range = { kind: 'relative', value: '30m' } as const
  const projections = selectDashboardProjections(telemetryDataset, indexes, snapshot, { environmentId: 'production', range })
  assert.deepEqual(
    projections.map(({ panelId }) => panelId),
    DASHBOARD_PANEL_IDS,
  )
  for (const projection of projections) {
    assert.match(projection.updateKey, /^production:relative-30m:0:/)
    assert.ok(projection.summary.length > 15)
    assert.ok(projection.unit.length > 0)
    assert.ok(projection.chartRows.every(({ offsetMs, value, label }) => (label !== undefined || offsetMs <= 0) && Number.isFinite(value)))
    if (projection.kind === 'ranked-table') assert.ok(projection.rankedRows.length > 0)
  }
  const replayedSnapshot = { ...snapshot, tick: 1 }
  const replayed = selectDashboardProjections(telemetryDataset, indexes, replayedSnapshot, { environmentId: 'production', range })
  const window = replayOffsetWindow(telemetryDataset, replayedSnapshot, range)
  assert.ok(replayed.every(({ updateKey }) => updateKey.includes(':1:')))
  assert.ok(replayed.flatMap(({ chartRows }) => chartRows).every(({ offsetMs }) => offsetMs >= window.from && offsetMs <= window.to))
})

test('desktop and tablet defaults are complete exact permutations with allowed named sizes', () => {
  assert.deepEqual(DASHBOARD_BREAKPOINTS, ['desktop', 'tablet'])
  for (const breakpoint of DASHBOARD_BREAKPOINTS) {
    const layout = defaultDashboardLayout(breakpoint)
    assert.equal(layout.breakpoint, breakpoint)
    assert.deepEqual(new Set(layout.orderedPanelIds), new Set(DASHBOARD_PANEL_IDS))
    assert.equal(layout.orderedPanelIds.length, DASHBOARD_PANEL_IDS.length)
    assert.equal(validateDashboardLayout(layout), true)
    for (const panelId of DASHBOARD_PANEL_IDS) assert.ok(dashboardPanelSizes[panelId].includes(layout.sizes[panelId]))
  }
})

test('layout validation rejects duplicates, omissions, unknown IDs, unsupported sizes, and breakpoint mismatches', () => {
  const desktop = defaultDashboardLayout('desktop')
  assert.equal(validateDashboardLayout({ ...desktop, orderedPanelIds: [...desktop.orderedPanelIds.slice(1), desktop.orderedPanelIds[1]] }), false)
  assert.equal(validateDashboardLayout({ ...desktop, orderedPanelIds: desktop.orderedPanelIds.slice(1) }), false)
  assert.equal(validateDashboardLayout({ ...desktop, orderedPanelIds: [...desktop.orderedPanelIds.slice(1), 'unknown-panel'] }), false)
  assert.equal(validateDashboardLayout({ ...desktop, sizes: { ...desktop.sizes, traffic: 'large' } }), false)
  assert.equal(validateDashboardLayout({ ...desktop, breakpoint: 'tablet' }, 'desktop'), false)
})

test('move commands preserve a complete permutation and report boundaries without mutation', () => {
  const initial = defaultDashboardLayout('desktop')
  const firstId = initial.orderedPanelIds[0]
  const lastId = initial.orderedPanelIds.at(-1)!

  const beforeBoundary = moveDashboardPanel(initial, firstId, 'before')
  assert.equal(beforeBoundary.changed, false)
  assert.equal(beforeBoundary.reason, 'boundary')
  assert.equal(beforeBoundary.layout, initial)

  const afterBoundary = moveDashboardPanel(initial, lastId, 'after')
  assert.equal(afterBoundary.changed, false)
  assert.equal(afterBoundary.reason, 'boundary')

  const movedLast = moveDashboardPanel(initial, firstId, 'last')
  assert.equal(movedLast.changed, true)
  assert.equal(movedLast.position, DASHBOARD_PANEL_IDS.length)
  assert.equal(movedLast.layout.orderedPanelIds.at(-1), firstId)
  assert.deepEqual(new Set(movedLast.layout.orderedPanelIds), new Set(DASHBOARD_PANEL_IDS))

  const movedFirst = moveDashboardPanel(movedLast.layout, firstId, 'first')
  assert.deepEqual(movedFirst.layout.orderedPanelIds, initial.orderedPanelIds)
})

test('named size commands accept only supported sizes and preserve the previous record on boundaries', () => {
  const initial = defaultDashboardLayout('desktop')
  const supported = resizeDashboardPanel(initial, 'errors', 'large')
  assert.equal(supported.changed, true)
  assert.equal(supported.layout.sizes.errors, 'large')
  assert.equal(supported.size, 'large')

  const unchanged = resizeDashboardPanel(supported.layout, 'errors', 'large')
  assert.equal(unchanged.changed, false)
  assert.equal(unchanged.reason, 'unchanged')
  assert.equal(unchanged.layout, supported.layout)

  const unsupported = resizeDashboardPanel(initial, 'traffic', 'large')
  assert.equal(unsupported.changed, false)
  assert.equal(unsupported.reason, 'unsupported-size')
  assert.equal(unsupported.layout, initial)
})

test('grid packing prevents collisions, reflows after moves, and keeps tablet order linear', () => {
  const desktop = defaultDashboardLayout('desktop')
  const placements = buildDashboardPlacements(desktop)
  const occupied = new Set<string>()
  for (const panelId of desktop.orderedPanelIds) {
    const placement = placements[panelId]
    assert.ok(placement)
    const startRow = placement.row ?? 1
    const startCol = placement.col ?? 1
    const rowSpan = placement.rowSpan ?? 1
    const colSpan = placement.colSpan ?? 1
    for (let row = startRow; row < startRow + rowSpan; row += 1) {
      for (let col = startCol; col < startCol + colSpan; col += 1) {
        const cell = `${row}:${col}`
        assert.equal(occupied.has(cell), false, `${panelId} collided at ${cell}`)
        occupied.add(cell)
      }
    }
  }

  const moved = moveDashboardPanel(desktop, desktop.orderedPanelIds.at(-1)!, 'first').layout
  const movedPlacements = buildDashboardPlacements(moved)
  assert.deepEqual(movedPlacements[moved.orderedPanelIds[0]], { col: 1, row: 1, colSpan: 1, rowSpan: 1, visible: true })

  const tablet = defaultDashboardLayout('tablet')
  const tabletPlacements = buildDashboardPlacements(tablet)
  assert.deepEqual(
    tablet.orderedPanelIds.map((id) => ({ id, col: tabletPlacements[id].col, row: tabletPlacements[id].row })),
    tablet.orderedPanelIds.map((id, index) => ({ id, col: 1, row: index + 1 })),
  )
})

test('versioned stores recover invalid records independently and Reset layout leaves other app data intact', () => {
  const storage = new MemoryStorage()
  storage.setItem(STORAGE_KEYS.alerts, 'alert-data-must-survive')
  storage.setItem(STORAGE_KEYS.dashboardDesktop, JSON.stringify({ schemaVersion: 99, updatedAt: '2026-09-21T10:00:00.000Z', data: {} }))
  const desktopStore = createDashboardLayoutStore('desktop', () => storage)
  const tabletStore = createDashboardLayoutStore('tablet', () => storage)

  assert.deepEqual(desktopStore.hydrate(), defaultDashboardLayout('desktop'))
  const changedTablet = moveDashboardPanel(defaultDashboardLayout('tablet'), DASHBOARD_PANEL_IDS[0], 'last').layout
  assert.equal(tabletStore.set(changedTablet), true)
  assert.deepEqual(tabletStore.hydrate(), changedTablet)

  assert.equal(resetDashboardLayout(storage), true)
  assert.equal(storage.getItem(STORAGE_KEYS.dashboardDesktop), null)
  assert.equal(storage.getItem(STORAGE_KEYS.dashboardTablet), null)
  assert.equal(storage.getItem(STORAGE_KEYS.alerts), 'alert-data-must-survive')
})
