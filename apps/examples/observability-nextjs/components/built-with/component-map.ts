import { COMPONENT_USAGE } from '../../lib/data/component-usage.ts'
import type { ComponentUsageRecord } from '../../lib/domain/component-usage.ts'

export interface ComponentUsageGroup {
  id: 'page' | 'global-scope' | 'navigation' | 'app-shell' | 'built-with'
  label: string
  regions: readonly string[]
  records: readonly ComponentUsageRecord[]
}

const SHARED_GROUPS = [
  { id: 'global-scope', label: 'Global scope', regions: ['global-scope'] },
  { id: 'navigation', label: 'Navigation', regions: ['navigation'] },
  { id: 'app-shell', label: 'Application shell', regions: ['app-shell'] },
  { id: 'built-with', label: 'Developer guidance', regions: ['built-with'] },
] as const

function featureRegion(pathname: string): string {
  if (pathname.startsWith('/services')) return 'services'
  if (pathname.startsWith('/traces')) return 'traces'
  if (pathname.startsWith('/logs')) return 'logs'
  if (pathname.startsWith('/dashboards')) return 'dashboard'
  if (pathname.startsWith('/alerts') || pathname.startsWith('/incidents')) return 'alerts'
  return 'overview'
}

export function regionsForPathname(pathname: string): readonly string[] {
  const feature = featureRegion(pathname)
  const segments = pathname.split('/').filter(Boolean)
  const regions = [feature, 'data-state']
  if (['services', 'traces', 'logs', 'alerts'].includes(feature)) regions.push('tables')
  if (segments[0] === 'services' && segments.length === 2) regions.push('service-detail', 'details')
  if (segments[0] === 'traces' && segments.length === 2) regions.push('trace-detail', 'details')
  if (pathname.includes('/rules/') || pathname.startsWith('/incidents/')) regions.push('details')
  return [...regions, 'global-scope', 'navigation', 'app-shell', 'built-with']
}

export function componentGroupsForPathname(pathname: string): readonly ComponentUsageGroup[] {
  const allRegions = regionsForPathname(pathname)
  const sharedRegions = new Set<string>(SHARED_GROUPS.flatMap(({ regions }) => regions))
  const definitions: ReadonlyArray<Omit<ComponentUsageGroup, 'records'>> = [
    { id: 'page', label: 'Page composition', regions: allRegions.filter((region) => !sharedRegions.has(region)) },
    ...SHARED_GROUPS,
  ]
  const assigned = new Set<string>()

  return definitions.flatMap((definition) => {
    const records = COMPONENT_USAGE.filter((record) => !assigned.has(record.tag) && record.regions.some((region) => definition.regions.includes(region)))
    records.forEach(({ tag }) => assigned.add(tag))
    return records.length > 0 ? [{ ...definition, records }] : []
  })
}

export function componentSourcePathForRegions(record: ComponentUsageRecord, regions: readonly string[]): string {
  const directoryByRegion: Readonly<Record<string, string>> = {
    overview: '/features/overview/',
    services: '/features/services/',
    traces: '/features/traces/',
    'trace-detail': '/features/traces/',
    logs: '/features/logs/',
    dashboard: '/features/dashboards/',
    alerts: '/features/alerts/',
    'global-scope': '/components/scope/',
    navigation: '/components/app-shell/',
    'app-shell': '/components/app-shell/',
    'built-with': '/components/built-with/',
  }
  for (const region of regions) {
    const directory = directoryByRegion[region]
    const match = directory && record.sourcePaths.find((path) => path.includes(directory))
    if (match) return match
  }
  return record.sourcePaths[0]
}
