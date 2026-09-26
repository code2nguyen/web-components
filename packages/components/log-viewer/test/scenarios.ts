import '../src/log-viewer'
import type { LogViewer } from '../src/log-viewer'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = '<c2-log-viewer id="subject" aria-label="Worker logs"></c2-log-viewer>'
const subject = document.querySelector<LogViewer>('c2-log-viewer')!
if (scenario === 'entries')
  subject.appendEntries([
    { timestamp: '12:00', level: 'info', source: 'worker', message: 'Ready' },
    { timestamp: '12:01', level: 'warn', source: 'worker', message: 'Retry requested\nAttempt 2' },
    { timestamp: '12:02', level: 'error', source: 'api', message: '<failed>' },
    { timestamp: '12:03', level: 'debug', source: 'api', message: 'Ready' },
  ])
if (scenario === 'tall')
  subject.appendEntries([
    { level: 'error', message: Array.from({ length: 120 }, (_, i) => `long line ${i}`).join('\n') },
    { level: 'info', message: 'After tall row' },
  ])
if (scenario === 'long') subject.appendEntries({ level: 'error', message: 'x'.repeat(500) })
if (scenario === 'many')
  subject.appendEntries(
    Array.from({ length: 10000 }, (_, index) => ({
      message: `entry ${index}` + '\ncontinuation'.repeat(index % 4),
      level: index % 2 ? 'info' : 'error',
    })),
  )
await subject.updateComplete
await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
main.dataset.ready = 'true'
