import type { SeverityBand } from '@/lib/otlp'
import { SEVERITY_LABEL, SEVERITY_TONE } from '@/lib/insights'

export function SeverityBadge({ severity, slot, count }: Readonly<{ severity: SeverityBand; slot?: string; count?: number }>) {
  return (
    <c2-badge slot={slot} tone={SEVERITY_TONE[severity]} className={`ll-severity ll-severity--${severity}`}>
      {SEVERITY_LABEL[severity]}
      {count !== undefined ? ` ${count}` : ''}
    </c2-badge>
  )
}
