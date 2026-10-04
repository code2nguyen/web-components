import { svg } from 'lit'
import type { FlowStatus } from './flow-types.js'

/** What a screen reader reads for each status, since the marker is a glyph. */
export const STATUS_LABELS: Record<FlowStatus, string> = {
  pending: 'Pending',
  current: 'Waiting',
  running: 'Running',
  success: 'Succeeded',
  error: 'Failed',
  warning: 'Succeeded with warnings',
  skipped: 'Skipped',
}

/** One 16×16 glyph per status. Filled glyphs cut their mark out with the node's own background colour. */
export const STATUS_ICONS: Record<FlowStatus, unknown> = {
  success: svg`<circle cx="8" cy="8" r="7" fill="currentColor"></circle><path d="M5 8.3l2 2 4-4.4" fill="none" class="cutout" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"></path>`,
  error: svg`<circle cx="8" cy="8" r="7" fill="currentColor"></circle><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" fill="none" class="cutout" stroke-width="1.7" stroke-linecap="round"></path>`,
  warning: svg`<path d="M8 1.6l6.8 12.1H1.2z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"></path><path d="M8 6v3.6" class="cutout" stroke-width="1.6" stroke-linecap="round"></path><circle cx="8" cy="11.6" r="0.95" class="cutout-fill"></circle>`,
  running: svg`<g class="spin"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity="0.22" stroke-width="2"></circle><path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></g>`,
  current: svg`<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"></circle><circle cx="8" cy="8" r="2.8" fill="currentColor"></circle>`,
  pending: svg`<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.4 2"></circle>`,
  skipped: svg`<circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"></circle><path d="M5.2 8h5.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>`,
}

export const MENU_ICONS = {
  zoomIn: svg`<circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5 14 14M7 5v4M5 7h4"></path>`,
  zoomOut: svg`<circle cx="7" cy="7" r="4.5"></circle><path d="M10.5 10.5 14 14M5 7h4"></path>`,
  fit: svg`<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"></path>`,
  layout: svg`<rect x="1.5" y="3" width="4" height="3" rx="0.8"></rect><rect x="10.5" y="1.5" width="4" height="3" rx="0.8"></rect><rect x="10.5" y="11.5" width="4" height="3" rx="0.8"></rect><path d="M5.5 4.5h2.5v-1.5h2.5M8 4.5v8.5h2.5"></path>`,
  add: svg`<path d="M8 3v10M3 8h10"></path>`,
  rename: svg`<path d="M10.5 2.5l3 3-8 8H2.5v-3z"></path><path d="M9 4l3 3"></path>`,
  remove: svg`<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 7v4M9.2 7v4"></path>`,
}
