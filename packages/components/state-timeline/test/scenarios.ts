import { html } from 'lit'
import '../src/state-timeline'
import type { StateTimelineSeries, StateTimelineState } from '../src/state-timeline'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const states: StateTimelineState[] = [
  { value: 'ok', label: 'Operational', tone: 'success' },
  { value: 'degraded', label: 'Degraded', tone: 'warning' },
  { value: 'down', label: 'Outage', tone: 'danger' },
]

// Three hours of status on 8 October 2026, UTC. The spec pins the time zone so the formatted times are stable.
const series: StateTimelineSeries[] = [
  {
    id: 'api',
    label: 'API',
    segments: [
      { start: '2026-10-08T09:00:00Z', state: 'ok' },
      { start: '2026-10-08T10:00:00Z', state: 'degraded' },
      { start: '2026-10-08T10:30:00Z', state: 'ok' },
    ],
  },
  {
    id: 'db',
    label: 'Database',
    segments: [
      { start: '2026-10-08T09:00:00Z', end: '2026-10-08T10:15:00Z', state: 'ok' },
      { start: '2026-10-08T10:15:00Z', end: '2026-10-08T10:45:00Z', state: 'down' },
      { start: '2026-10-08T10:45:00Z', state: 'ok' },
    ],
  },
  {
    id: 'worker',
    label: 'Worker',
    segments: [
      { start: '2026-10-08T09:00:00Z', state: 'ok' },
      { start: '2026-10-08T11:00:00Z', state: null },
    ],
  },
]

const changes: StateTimelineSeries[] = [
  {
    label: 'Build',
    segments: [
      { start: Date.UTC(2026, 9, 8, 9), end: Date.UTC(2026, 9, 8, 9, 6), state: 'passed', run: 101 },
      { start: Date.UTC(2026, 9, 8, 9, 10), end: Date.UTC(2026, 9, 8, 9, 14), state: 'failed', run: 102 },
      { start: Date.UTC(2026, 9, 8, 9, 20), end: Date.UTC(2026, 9, 8, 9, 27), state: 'passed', run: 103 },
    ],
  },
]

main.innerHTML = `<button id="before">Before</button>
  <c2-state-timeline id="subject" locale="en-GB" aria-label="Service status">
    <span slot="empty">Nothing reported yet</span>
  </c2-state-timeline>
  <button id="after">After</button>
  <output aria-label="Events"></output>`

const subject = document.querySelector('c2-state-timeline')!
const output = document.querySelector('output')!
const log: string[] = []
subject.addEventListener('segment-click', (event) => {
  log.push(`click:${event.detail.series.label}:${event.detail.state}:${event.detail.segmentIndex}`)
  output.textContent = log.join(' ')
})
subject.addEventListener('segment-hover', (event) => {
  log.push(`hover:${event.detail.segment ? event.detail.segment.label : 'none'}`)
  output.textContent = log.join(' ')
})

if (scenario === 'default' || scenario === 'tooltip') {
  subject.series = series
  subject.states = states
  subject.end = '2026-10-08T12:00:00Z'
}
if (scenario === 'auto') subject.series = changes
if (scenario === 'attribute') {
  subject.setAttribute('series', JSON.stringify(changes))
  subject.setAttribute('states', JSON.stringify([{ value: 'failed', label: 'Failed', tone: 'danger' }]))
}
if (scenario === 'tooltip') subject.renderTooltip = (context) => html`<strong class="custom">${context.series.label} is ${context.label}</strong>`

await subject.updateComplete
// The axis is measured on the first ResizeObserver delivery.
await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
main.dataset.ready = 'true'
