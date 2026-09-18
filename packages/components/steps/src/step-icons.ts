import { html } from 'lit'
import type { StepStatus } from './step-types.js'

/** What a screen reader reads for each status, since the marker is a glyph. */
export const STATUS_LABELS: Record<StepStatus, string> = {
  pending: 'Pending',
  current: 'Current',
  running: 'Running',
  success: 'Completed',
  error: 'Failed',
  warning: 'Completed with warnings',
  skipped: 'Skipped',
}

const CHECK = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M20 6 9 17l-5-5"></path>
</svg>`

const CROSS = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
  <path d="M18 6 6 18M6 6l12 12"></path>
</svg>`

const WARNING = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"></path>
  <path d="M12 9v4M12 17h.01"></path>
</svg>`

const SKIPPED = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <path d="M5 12h14"></path>
</svg>`

/** The states that draw a glyph. The rest are drawn by the marker's ring alone. */
export const STATUS_ICONS: Partial<Record<StepStatus, unknown>> = {
  success: CHECK,
  error: CROSS,
  warning: WARNING,
  skipped: SKIPPED,
}

/**
 * The status that stands for a group: the most urgent thing inside it. `skipped` only wins when there is nothing
 * else — a group where one step ran and the rest were skipped still reports that it ran. An empty group is
 * `pending`, because nothing in it has happened.
 */
const ROLLUP_ORDER: StepStatus[] = ['error', 'running', 'current', 'warning', 'pending']

export function rollupStatus(statuses: StepStatus[]): StepStatus {
  if (!statuses.length) return 'pending'
  for (const status of ROLLUP_ORDER) if (statuses.includes(status)) return status
  return statuses.every((status) => status === 'skipped') ? 'skipped' : 'success'
}
