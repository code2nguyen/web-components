'use client'

import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export const ENVIRONMENT_IDS = ['production', 'staging'] as const
export const RELATIVE_RANGES = ['30m', '2h', '24h'] as const

export type EnvironmentId = (typeof ENVIRONMENT_IDS)[number]
export type RelativeRange = (typeof RELATIVE_RANGES)[number]

export type InvestigationRange = { kind: 'relative'; value: RelativeRange } | { kind: 'absolute'; from: string; to: string }

export interface GlobalScope {
  environmentId: EnvironmentId
  range: InvestigationRange
}

interface ScopeContextValue {
  scope: GlobalScope
  setEnvironment: (environmentId: EnvironmentId) => void
  setRelativeRange: (range: RelativeRange) => void
  setAbsoluteRange: (from: string, to: string) => boolean
}

export const DEFAULT_SCOPE: GlobalScope = { environmentId: 'production', range: { kind: 'relative', value: '2h' } }

const ScopeContext = createContext<ScopeContextValue | undefined>(undefined)

function isEnvironment(value: string | null): value is EnvironmentId {
  return ENVIRONMENT_IDS.some((candidate) => candidate === value)
}

function isRelativeRange(value: string | null): value is RelativeRange {
  return RELATIVE_RANGES.some((candidate) => candidate === value)
}

function validDatePair(from: string | null, to: string | null): from is string {
  if (!from || !to) return false
  const fromTime = Date.parse(from)
  const toTime = Date.parse(to)
  return Number.isFinite(fromTime) && Number.isFinite(toTime) && fromTime < toTime
}

function parseScope(search: string): GlobalScope {
  const parameters = new URLSearchParams(search)
  const requestedEnvironment = parameters.get('env')
  const environmentId = isEnvironment(requestedEnvironment) ? requestedEnvironment : DEFAULT_SCOPE.environmentId
  const from = parameters.get('from')
  const to = parameters.get('to')

  if (validDatePair(from, to)) return { environmentId, range: { kind: 'absolute', from, to: to! } }

  const range = parameters.get('range')
  return { environmentId, range: { kind: 'relative', value: isRelativeRange(range) ? range : '2h' } }
}

function scopesEqual(left: GlobalScope, right: GlobalScope): boolean {
  if (left.environmentId !== right.environmentId || left.range.kind !== right.range.kind) return false
  if (left.range.kind === 'relative' && right.range.kind === 'relative') return left.range.value === right.range.value
  return left.range.kind === 'absolute' && right.range.kind === 'absolute' && left.range.from === right.range.from && left.range.to === right.range.to
}

export function ScopeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname()
  const router = useRouter()
  const [scope, setScope] = useState<GlobalScope>(DEFAULT_SCOPE)

  useEffect(() => {
    const syncFromLocation = () => {
      const nextScope = parseScope(window.location.search)
      setScope((current) => (scopesEqual(current, nextScope) ? current : nextScope))
    }
    syncFromLocation()
    window.addEventListener('popstate', syncFromLocation)
    return () => window.removeEventListener('popstate', syncFromLocation)
  }, [pathname])

  const writeScope = useCallback(
    (nextScope: GlobalScope) => {
      setScope(nextScope)
      const parameters = new URLSearchParams(window.location.search)
      if (nextScope.environmentId === DEFAULT_SCOPE.environmentId) parameters.delete('env')
      else parameters.set('env', nextScope.environmentId)

      parameters.delete('range')
      parameters.delete('from')
      parameters.delete('to')
      if (nextScope.range.kind === 'absolute') {
        parameters.set('from', nextScope.range.from)
        parameters.set('to', nextScope.range.to)
      } else if (nextScope.range.value !== '2h') parameters.set('range', nextScope.range.value)
      parameters.delete('page')

      const query = parameters.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router],
  )

  const setEnvironment = useCallback((environmentId: EnvironmentId) => writeScope({ ...scope, environmentId }), [scope, writeScope])
  const setRelativeRange = useCallback((value: RelativeRange) => writeScope({ ...scope, range: { kind: 'relative', value } }), [scope, writeScope])
  const setAbsoluteRange = useCallback(
    (from: string, to: string) => {
      if (!validDatePair(from, to)) return false
      writeScope({ ...scope, range: { kind: 'absolute', from, to } })
      return true
    },
    [scope, writeScope],
  )

  const value = useMemo(() => ({ scope, setEnvironment, setRelativeRange, setAbsoluteRange }), [scope, setAbsoluteRange, setEnvironment, setRelativeRange])
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>
}

export function useScope(): ScopeContextValue {
  const context = useContext(ScopeContext)
  if (!context) throw new Error('useScope must be used inside ScopeProvider')
  return context
}
