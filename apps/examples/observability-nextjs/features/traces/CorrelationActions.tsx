'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { parseNavigationState, parseReturnContext } from '../../lib/query/navigation-state'
import { parseDetailReturnContext, withAppBasePath } from '../../lib/query/internal-href'
import { useScope } from '../../providers/ScopeProvider'
import { buildLogsCorrelationHref } from './trace-search'

export function TraceCorrelationActions({ traceId, hasLogs }: Readonly<{ traceId: string; hasLogs: boolean }>) {
  const pathname = usePathname()
  const { scope } = useScope()
  const state = useMemo(
    () => ({ ...parseNavigationState('traces', ''), environmentId: scope.environmentId, range: scope.range }),
    [scope.environmentId, scope.range],
  )
  const [returnHref, setReturnHref] = useState('/traces/')
  const [detailReturn, setDetailReturn] = useState(pathname)
  useEffect(() => {
    const synchronize = () => {
      const search = new URLSearchParams(window.location.search)
      setReturnHref(parseDetailReturnContext(search) ?? parseReturnContext(search, ['/traces', '/traces/', '/logs', '/logs/']) ?? '/traces/')
      setDetailReturn(`${pathname}${window.location.search}`)
    }
    synchronize()
    window.addEventListener('popstate', synchronize)
    return () => window.removeEventListener('popstate', synchronize)
  }, [pathname])
  const logsHref = buildLogsCorrelationHref(traceId, state, detailReturn)
  return (
    <div className="page-actions">
      {hasLogs ? (
        <c2-link-button href={withAppBasePath(logsHref)}>View correlated logs</c2-link-button>
      ) : (
        <c2-link-button disabled aria-label="No correlated logs available">
          No correlated logs
        </c2-link-button>
      )}
      <c2-link-button href={withAppBasePath(returnHref)}>
        {returnHref.startsWith('/services/') ? 'Return to service detail' : 'Return to trace results'}
      </c2-link-button>
    </div>
  )
}
