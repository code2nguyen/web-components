import type { StorageLike } from './browser-store.ts'
import type { Validator } from './envelope.ts'

export const STORAGE_KEYS = {
  alerts: 'c2n-observability:v1:alerts',
  dashboardDesktop: 'c2n-observability:v1:dashboard:desktop',
  dashboardTablet: 'c2n-observability:v1:dashboard:tablet',
  theme: 'c2n-observability:v1:theme',
} as const

export type Theme = 'light' | 'dark' | 'system'
export interface ThemePreference {
  theme: Theme
}
export type DashboardBreakpoint = 'desktop' | 'tablet'
export type DashboardPanelSize = 'small' | 'medium' | 'large'
export interface DashboardLayoutPreference {
  breakpoint: DashboardBreakpoint
  orderedPanelIds: string[]
  sizes: Record<string, DashboardPanelSize>
}

export interface StoredAlertRule {
  id: string
  name: string
  signal: 'latency' | 'error-rate' | 'throughput' | 'saturation'
  serviceIds: string[]
  operator: 'above' | 'below'
  threshold: number
  evaluationWindowMinutes: number
  severity: 'warning' | 'critical'
  owner: string
  destinationIds: string[]
  enabled: boolean
  origin: 'local'
}
export interface AlertMutationData {
  rulesById: Record<string, StoredAlertRule>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isUniqueSubset(values: string[], allowed: ReadonlySet<string>, requireValue = true): boolean {
  return (!requireValue || values.length > 0) && new Set(values).size === values.length && values.every((value) => allowed.has(value))
}

export const isThemePreference: Validator<ThemePreference> = (value: unknown): value is ThemePreference =>
  isObject(value) && (value.theme === 'light' || value.theme === 'dark' || value.theme === 'system')

export function createDashboardLayoutValidator({
  panelSizes,
}: {
  panelSizes: Readonly<Record<string, readonly DashboardPanelSize[]>>
}): Validator<DashboardLayoutPreference> {
  const panelIds = Object.keys(panelSizes)
  const expected = new Set(panelIds)
  return (value: unknown): value is DashboardLayoutPreference => {
    if (!isObject(value) || (value.breakpoint !== 'desktop' && value.breakpoint !== 'tablet')) return false
    if (!isStringArray(value.orderedPanelIds) || value.orderedPanelIds.length !== panelIds.length || !isUniqueSubset(value.orderedPanelIds, expected))
      return false
    if (!isObject(value.sizes) || Object.keys(value.sizes).length !== panelIds.length) return false
    const sizes = value.sizes
    return panelIds.every((panelId) => {
      const size = sizes[panelId]
      return typeof size === 'string' && panelSizes[panelId]?.includes(size as DashboardPanelSize)
    })
  }
}

function validThreshold(signal: StoredAlertRule['signal'], threshold: number): boolean {
  if (!Number.isFinite(threshold) || threshold < 0) return false
  if (signal === 'error-rate') return threshold <= 1
  if (signal === 'saturation') return threshold <= 100
  return true
}

export function createAlertOverlayValidator({
  serviceIds,
  destinationIds,
}: {
  serviceIds: readonly string[]
  destinationIds: readonly string[]
}): Validator<AlertMutationData> {
  const services = new Set(serviceIds)
  const destinations = new Set(destinationIds)
  return (value: unknown): value is AlertMutationData => {
    if (!isObject(value) || !isObject(value.rulesById)) return false
    const names = new Set<string>()
    for (const [id, candidate] of Object.entries(value.rulesById)) {
      if (!isObject(candidate) || candidate.id !== id || !/^[-a-zA-Z0-9_:.]+$/.test(id)) return false
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
      const normalizedName = name.toLocaleLowerCase()
      if (!name || names.has(normalizedName)) return false
      names.add(normalizedName)
      if (candidate.signal !== 'latency' && candidate.signal !== 'error-rate' && candidate.signal !== 'throughput' && candidate.signal !== 'saturation')
        return false
      if (!isStringArray(candidate.serviceIds) || !isUniqueSubset(candidate.serviceIds, services)) return false
      if (candidate.operator !== 'above' && candidate.operator !== 'below') return false
      if (typeof candidate.threshold !== 'number' || !validThreshold(candidate.signal, candidate.threshold)) return false
      if (!Number.isSafeInteger(candidate.evaluationWindowMinutes) || (candidate.evaluationWindowMinutes as number) <= 0) return false
      if (candidate.severity !== 'warning' && candidate.severity !== 'critical') return false
      if (typeof candidate.owner !== 'string' || !candidate.owner.trim()) return false
      if (!isStringArray(candidate.destinationIds) || !isUniqueSubset(candidate.destinationIds, destinations)) return false
      if (typeof candidate.enabled !== 'boolean' || candidate.origin !== 'local') return false
    }
    return true
  }
}

function removeKeys(storage: StorageLike, keys: readonly string[]): boolean {
  let success = true
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      success = false
    }
  }
  return success
}

export function resetDemoData(storage: StorageLike): boolean {
  return removeKeys(storage, [STORAGE_KEYS.alerts])
}

export function resetDashboardLayout(storage: StorageLike): boolean {
  return removeKeys(storage, [STORAGE_KEYS.dashboardDesktop, STORAGE_KEYS.dashboardTablet])
}
