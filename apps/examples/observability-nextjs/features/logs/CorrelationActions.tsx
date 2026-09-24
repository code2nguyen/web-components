'use client'

import type { LogRecord } from '../../lib/domain/telemetry'
import type { InvestigationState } from '../../lib/query/navigation-state'
import { buildTraceCorrelationHref } from './log-search'
import { withAppBasePath } from '../../lib/query/internal-href'

export function LogCorrelationActions({ log, state, traceExists }: Readonly<{ log: LogRecord; state: InvestigationState; traceExists: boolean }>) {
  if (!log.traceId || !traceExists)
    return (
      <c2-status-panel status="neutral" align="start" heading="No trace correlation" description="This synthetic log is not connected to an available trace." />
    )
  return <c2-link-button href={withAppBasePath(buildTraceCorrelationHref(log, state))}>Open trace {log.traceId}</c2-link-button>
}
