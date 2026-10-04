import '../src/week-planner'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!
main.innerHTML = `
  <c2-week-planner id="subject" locale="en-US" week-start="monday" style="width: 760px"></c2-week-planner>
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
if (scenario === 'alternate' || scenario === 'odd') subject.alternateWeeks = true
if (scenario === 'odd') subject.parity = 'odd'
if (scenario === 'french') subject.locale = 'fr'
// The scenarios pin Monday; these ones let the locale decide.
const localeWeek = /^week-(.+)$/.exec(scenario)
if (localeWeek) {
  subject.removeAttribute('week-start')
  subject.locale = localeWeek[1]
}
if (scenario === 'french' || scenario === 'browser-locale') subject.removeAttribute('week-start')
if (scenario === 'french' || scenario === 'browser-locale') subject.alternateWeeks = true
if (scenario === 'browser-locale') subject.removeAttribute('locale')
if (scenario === 'every-week') subject.events = subject.events.filter((event) => !event.weeks)
// Container widths: 360px shows one day, 560px three.
if (scenario === 'narrow') subject.style.width = '360px'
if (scenario === 'medium') subject.style.width = '560px'
if (scenario === 'heading' || scenario === 'heading-alternate') subject.heading = 'Team schedule'
if (scenario === 'heading-alternate') subject.alternateWeeks = true
if (scenario === 'actions' || scenario === 'actions-narrow') {
  subject.heading = 'Team schedule'
  subject.insertAdjacentHTML('beforeend', '<button slot="actions" type="button">Add event</button><button slot="actions" type="button">Settings</button>')
}
if (scenario === 'actions-narrow') subject.style.width = '360px'
if (scenario === 'actions-only') subject.insertAdjacentHTML('beforeend', '<button slot="actions" type="button">Add event</button>')
if (scenario === 'heading-slot') subject.insertAdjacentHTML('beforeend', '<span slot="heading">Kids’ <em>schedule</em></span>')
if (scenario === 'early') subject.events = [{ title: 'Early run', day: 'fri', start: '06:00', end: '07:00' }]
// Dated and editable scenarios: 2026-09-30 is the Wednesday the specs pin the clock to.
const dated = /^(dated|editable)/.test(scenario)
if (dated || scenario === 'dateless-with-dates') {
  subject.events = [
    ...subject.events.filter((event) => !event.weeks && event.id !== 'broken'),
    { id: 'dentist', title: 'Dentist', date: '2026-10-01', start: '14:00', end: '15:00', color: '#0f766e' },
    { id: 'trip', title: 'Trip', date: '2026-10-07', start: '09:00', end: '10:00' },
  ]
}
if (dated) subject.date = '2026-09-30'
if (scenario === 'dated-sunday') subject.weekStart = 'sunday'
if (scenario === 'dated-french') subject.locale = 'fr'
if (scenario === 'dated-narrow') subject.style.width = '360px'
if (scenario.startsWith('editable')) subject.editable = true
if (scenario === 'editable-snap') subject.snapMinutes = 15
if (scenario === 'editable-dateless') subject.date = ''
subject.addEventListener('event-click', (event) => (output.value = `click:${event.detail.event.id}`))
subject.addEventListener('parity-change', (event) => (output.value = `parity:${event.detail.parity}`))
subject.addEventListener('week-change', (event) => {
  output.value = `week:${event.detail.start}..${event.detail.end}`
  output.dataset.bubbles = String(event.bubbles)
})
subject.addEventListener('slot-click', ({ detail }) => (output.value = `slot:${detail.day}|${detail.date ?? ''}|${detail.start}-${detail.end}`))
// Like an app would: the planner reports the change, the page applies it.
subject.addEventListener('event-change', ({ detail }) => {
  output.value = `change:${detail.event.id}:${JSON.stringify(detail.changes)}`
  subject.events = subject.events.map((event) => (event === detail.event ? { ...event, ...detail.changes } : event))
})

await subject.updateComplete
main.dataset.ready = 'true'
