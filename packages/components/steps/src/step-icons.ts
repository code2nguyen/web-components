import { html } from 'lit'
import type { StepStatus } from './step-types.js'

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

const LOCK = html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="5" y="11" width="14" height="10" rx="2"></rect>
  <path d="M8 11V7a4 4 0 0 1 8 0v4"></path>
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
  locked: LOCK,
}

/**
 * The status that stands for a group: the most urgent thing inside it. `skipped` only wins when there is nothing
 * else — a group where one step ran and the rest were skipped still reports that it ran. An empty group is
 * `pending`, because nothing in it has happened. A group whose only unfinished steps are `locked` is locked.
 */
const ROLLUP_ORDER: StepStatus[] = ['error', 'running', 'current', 'warning', 'pending', 'locked']

export function rollupStatus(statuses: StepStatus[]): StepStatus {
  if (!statuses.length) return 'pending'
  for (const status of ROLLUP_ORDER) {
    // Locked work outranks a warning, unless a step is still open.
    if (status === 'warning' && statuses.includes('locked') && !statuses.includes('pending')) return 'locked'
    if (statuses.includes(status)) return status
  }
  return statuses.every((status) => status === 'skipped') ? 'skipped' : 'success'
}
