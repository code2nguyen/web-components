import { buildNavigationHref, scopeSearchParams, type InvestigationState } from '../../lib/query/navigation-state.ts'

export function serviceDetailHref(serviceId: string, state: InvestigationState): string {
  const scope = scopeSearchParams(state)
  scope.set('return', buildNavigationHref('/services/', 'services', state))
  return `/services/${encodeURIComponent(serviceId)}/?${scope}`
}

export function signalDetailHref(pathname: string, state: InvestigationState, returnHref: string): string {
  const scope = scopeSearchParams(state)
  scope.set('return', returnHref)
  return `${pathname}?${scope}`
}
