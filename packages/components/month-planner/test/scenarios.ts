import '../src/month-planner'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <c2-month-planner id="subject" locale="en-US" week-start="monday" month="2026-09" style="width: 720px"></c2-month-planner>
  <output aria-label="Last event"></output>
`

const subject = document.querySelector('c2-month-planner')!
const output = document.querySelector('output')!
subject.events = [
  // September 10, 2026 is a Thursday, so with Monday first this vacation covers two week rows.
  { id: 'vacation', title: 'Vacation', start: '2026-09-10', end: '2026-09-15', color: '#0f766e' },
  { id: 'flight', title: 'Flight', start: '2026-09-10' },
  { id: 'broken', title: 'Broken', start: 'not a date' },
  // Crosses into October, so both months are marked in the picker; the other trips mark months in 2025 and 2027.
  { id: 'move', title: 'Moving week', start: '2026-09-28', end: '2026-10-04' },
  { id: 'past', title: 'Past trip', start: '2025-03-02' },
  { id: 'future', title: 'Future trip', start: '2027-06-01' },
]
if (scenario === 'attribute') {
  subject.removeAttribute('month')
  subject.setAttribute('month', '2026-11')
  subject.setAttribute('events', JSON.stringify([{ title: 'Ski trip', start: '2026-11-20', end: '2026-11-22' }]))
}
if (scenario === 'french') subject.locale = 'fr'
// The scenarios pin Monday; these ones let the locale decide.
const localeWeek = /^week-(.+)$/.exec(scenario)
if (localeWeek) {
  subject.removeAttribute('week-start')
  subject.locale = localeWeek[1]
}
if (scenario === 'french' || scenario === 'browser-locale') subject.removeAttribute('week-start')
if (scenario === 'browser-locale') subject.removeAttribute('locale')
if (scenario === 'compact') subject.style.width = '360px'
if (scenario === 'sunday') subject.weekStart = 'sunday'
if (scenario === 'no-picker') subject.setAttribute('month-picker', 'false')
if (scenario === 'heading' || scenario === 'actions' || scenario === 'actions-compact') subject.heading = 'Team holidays'
if (scenario === 'actions' || scenario === 'actions-compact') {
  subject.insertAdjacentHTML('beforeend', '<button slot="actions" type="button">Add event</button><button slot="actions" type="button">Settings</button>')
}
if (scenario === 'actions-compact') subject.style.width = '360px'
if (scenario === 'heading-slot') subject.insertAdjacentHTML('beforeend', '<span slot="heading">Team <em>holidays</em></span>')
subject.addEventListener('event-click', (event) => (output.value = `click:${event.detail.event.id}`))
subject.addEventListener('month-change', (event) => (output.value = `month:${event.detail.month}`))

await subject.updateComplete
main.dataset.ready = 'true'
