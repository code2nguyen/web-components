import '../src/calendar'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <c2-calendar id="subject" locale="en-US" month="2026-09" style="width: 720px"></c2-calendar>
  <output aria-label="Last event"></output>
`

const subject = document.querySelector('c2-calendar')!
const output = document.querySelector('output')!
subject.events = [
  // September 10, 2026 is a Thursday, so with Monday first this vacation covers two week rows.
  { id: 'vacation', title: 'Vacation', start: '2026-09-10', end: '2026-09-15', color: '#0f766e' },
  { id: 'flight', title: 'Flight', start: '2026-09-10' },
  { id: 'broken', title: 'Broken', start: 'not a date' },
]
if (scenario === 'attribute') {
  subject.removeAttribute('month')
  subject.setAttribute('month', '2026-11')
  subject.setAttribute('events', JSON.stringify([{ title: 'Ski trip', start: '2026-11-20', end: '2026-11-22' }]))
}
if (scenario === 'sunday') subject.weekStart = 'sunday'
subject.addEventListener('event-click', (event) => (output.value = `click:${event.detail.event.id}`))
subject.addEventListener('month-change', (event) => (output.value = `month:${event.detail.month}`))

await subject.updateComplete
main.dataset.ready = 'true'
