import type { DashCardPlacement } from '@c2n/dashboard'
import { createBrowserStore, type BrowserStore, type StorageLike } from '../../lib/storage/browser-store.ts'
import {
  STORAGE_KEYS,
  createDashboardLayoutValidator,
  type DashboardBreakpoint,
  type DashboardLayoutPreference,
  type DashboardPanelSize,
} from '../../lib/storage/keys.ts'
import { DASHBOARD_PANEL_IDS, DASHBOARD_PANELS, dashboardPanelSizes, type DashboardPanelId } from './panel-catalog.ts'

export const DASHBOARD_BREAKPOINTS = ['desktop', 'tablet'] as const satisfies readonly DashboardBreakpoint[]

const DEFAULT_SIZES = Object.freeze(
  Object.fromEntries(DASHBOARD_PANELS.map(({ id, defaultSize }) => [id, defaultSize])) as Readonly<Record<DashboardPanelId, DashboardPanelSize>>,
)

const TABLET_ORDER: readonly DashboardPanelId[] = Object.freeze([
  'traffic',
  'incident-count',
  'latency',
  'errors',
  'saturation',
  'duration-distribution',
  'top-services',
])

function copySizes(): Record<string, DashboardPanelSize> {
  return { ...DEFAULT_SIZES }
}

export function defaultDashboardLayout(breakpoint: DashboardBreakpoint): DashboardLayoutPreference {
  return Object.freeze({
    breakpoint,
    orderedPanelIds: Object.freeze([...(breakpoint === 'desktop' ? DASHBOARD_PANEL_IDS : TABLET_ORDER)]) as unknown as string[],
    sizes: Object.freeze(copySizes()) as Record<string, DashboardPanelSize>,
  })
}

const dashboardLayoutValidator = createDashboardLayoutValidator({ panelSizes: dashboardPanelSizes })

export function validateDashboardLayout(value: unknown, breakpoint?: DashboardBreakpoint): value is DashboardLayoutPreference {
  return dashboardLayoutValidator(value) && (breakpoint === undefined || value.breakpoint === breakpoint)
}

export function createDashboardLayoutStore(
  breakpoint: DashboardBreakpoint,
  storage?: () => StorageLike | null | undefined,
): BrowserStore<DashboardLayoutPreference> {
  return createBrowserStore({
    key: breakpoint === 'desktop' ? STORAGE_KEYS.dashboardDesktop : STORAGE_KEYS.dashboardTablet,
    defaultValue: defaultDashboardLayout(breakpoint),
    validate: (value): value is DashboardLayoutPreference => validateDashboardLayout(value, breakpoint),
    storage,
  })
}

export type DashboardMove = 'before' | 'after' | 'first' | 'last'
export interface DashboardLayoutResult {
  layout: DashboardLayoutPreference
  changed: boolean
  reason: 'moved' | 'resized' | 'boundary' | 'unknown-panel' | 'unsupported-size' | 'unchanged'
  position?: number
  size?: DashboardPanelSize
}

export function moveDashboardPanel(layout: DashboardLayoutPreference, panelId: string, move: DashboardMove): DashboardLayoutResult {
  const from = layout.orderedPanelIds.indexOf(panelId)
  if (from < 0) return { layout, changed: false, reason: 'unknown-panel' }
  const last = layout.orderedPanelIds.length - 1
  const to = move === 'first' ? 0 : move === 'last' ? last : move === 'before' ? Math.max(0, from - 1) : Math.min(last, from + 1)
  if (to === from) return { layout, changed: false, reason: 'boundary', position: from + 1 }
  const orderedPanelIds = [...layout.orderedPanelIds]
  orderedPanelIds.splice(from, 1)
  orderedPanelIds.splice(to, 0, panelId)
  return {
    layout: { ...layout, orderedPanelIds },
    changed: true,
    reason: 'moved',
    position: to + 1,
  }
}

export function resizeDashboardPanel(layout: DashboardLayoutPreference, panelId: string, size: DashboardPanelSize): DashboardLayoutResult {
  const supported = dashboardPanelSizes[panelId as DashboardPanelId]
  if (!supported) return { layout, changed: false, reason: 'unknown-panel' }
  if (!supported.includes(size)) return { layout, changed: false, reason: 'unsupported-size' }
  if (layout.sizes[panelId] === size) return { layout, changed: false, reason: 'unchanged', size }
  return { layout: { ...layout, sizes: { ...layout.sizes, [panelId]: size } }, changed: true, reason: 'resized', size }
}

const DESKTOP_COLUMNS = 4
const SIZE_SPAN: Readonly<Record<DashboardPanelSize, number>> = { small: 1, medium: 2, large: 4 }

export function buildDashboardPlacements(layout: DashboardLayoutPreference): Record<string, DashCardPlacement> {
  if (layout.breakpoint === 'tablet') {
    return Object.fromEntries(layout.orderedPanelIds.map((panelId, index) => [panelId, { col: 1, row: index + 1, colSpan: 1, rowSpan: 1, visible: true }]))
  }

  const occupied = new Set<string>()
  const placements: Record<string, DashCardPlacement> = {}
  for (const panelId of layout.orderedPanelIds) {
    const colSpan = SIZE_SPAN[layout.sizes[panelId] ?? 'medium']
    let row = 1
    let placed = false
    while (!placed) {
      for (let col = 1; col <= DESKTOP_COLUMNS - colSpan + 1; col += 1) {
        const cells = Array.from({ length: colSpan }, (_, offset) => `${row}:${col + offset}`)
        if (cells.every((cell) => !occupied.has(cell))) {
          cells.forEach((cell) => occupied.add(cell))
          placements[panelId] = { col, row, colSpan, rowSpan: 1, visible: true }
          placed = true
          break
        }
      }
      if (!placed) row += 1
    }
  }
  return placements
}

export function dashboardRowCount(layout: DashboardLayoutPreference): number {
  return Math.max(1, ...Object.values(buildDashboardPlacements(layout)).map(({ row = 1, rowSpan = 1 }) => row + rowSpan - 1))
}
