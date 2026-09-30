import '../src/week-planner'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <c2-week-planner id="subject" locale="en-US" style="width: 760px"></c2-week-planner>
  <output aria-label="Last event"></output>
`

const subject = document.querySelector('c2-week-planner')!
const output = document.querySelector('output')!
subject.events = [
  { id: 'standup', title: 'Stand-up', day: 'mon', start: '08:30', end: '09:00' },
  { id: 'workshop', title: 'Workshop', day: 'tue', start: '10:00', end: '12:00' },
  { id: 'review', title: 'Review', day: 'tue', start: '11:00', end: '12:30', color: '#be185d' },
  { id: 'pickup', title: 'Pick-up', day: 'wed', start: '13:30', end: '17:00', weeks: 'even', color: '#0f766e' },
  { id: 'gym', title: 'Gym', day: 'wed', start: '18:00', end: '19:30', weeks: 'odd', color: '#52525b' },
  { id: 'broken', title: 'Broken', day: 'wed', start: '12:00', end: '11:00' },
]
if (scenario === 'every-week') subject.events = subject.events.filter((event) => !event.weeks)
if (scenario === 'early') subject.events = [{ title: 'Early run', day: 'fri', start: '06:00', end: '07:00' }]
subject.addEventListener('event-click', (event) => (output.value = `click:${event.detail.event.id}`))
subject.addEventListener('parity-change', (event) => (output.value = `parity:${event.detail.parity}`))

await subject.updateComplete
main.dataset.ready = 'true'
