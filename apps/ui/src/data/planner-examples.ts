import type { MonthPlanner, MonthPlannerEvent } from '@c2n/month-planner'
import type { WeekPlanner, WeekPlannerEvent } from '@c2n/week-planner'

/**
 * Makes the editable planner examples live. `c2-month-planner[data-planner-demo="editable"]` and
 * `c2-week-planner[data-planner-demo="editable"]` play the application: the planners never rewrite `events`, so each
 * add, move and resize is applied here, and what happened is written into the `output` next to the planner.
 */

const seeded = new WeakSet<Element>()
let next = 1

function outputFor(planner: Element): (text: string) => void {
  const output = planner.parentElement?.querySelector('output')
  return (text) => {
    if (output) output.textContent = text
  }
}

function wireMonth(planner: MonthPlanner): void {
  const say = outputFor(planner)
  const add = (entry: MonthPlannerEvent) => {
    planner.events = [...planner.events, entry]
  }
  planner.addEventListener('day-click', ({ detail }) => {
    add({ id: `new-${next++}`, title: 'New event', start: detail.date })
    say(`day-click: ${detail.date}`)
  })
  planner.addEventListener('range-select', ({ detail }) => {
    add({ id: `new-${next++}`, title: 'New trip', start: detail.start, end: detail.end, color: '#b45309' })
    say(`range-select: ${detail.start} → ${detail.end}`)
  })
  planner.addEventListener('event-change', ({ detail }) => {
    planner.events = planner.events.map((entry) => (entry === detail.event ? { ...entry, ...detail.changes } : entry))
    say(`event-change: ${detail.event.title}, ${detail.changes.start} → ${detail.changes.end}`)
  })
  planner.addEventListener('event-click', ({ detail }) => say(`event-click: ${detail.event.title}`))
}

function wireWeek(planner: WeekPlanner): void {
  const say = outputFor(planner)
  planner.addEventListener('slot-click', ({ detail }) => {
    const entry: WeekPlannerEvent = { id: `new-${next++}`, title: 'New event', start: detail.start, end: detail.end }
    planner.events = [...planner.events, detail.date ? { ...entry, date: detail.date } : { ...entry, day: detail.day }]
    say(`slot-click: ${detail.date ?? detail.day}, ${detail.start}–${detail.end}`)
  })
  planner.addEventListener('event-change', ({ detail }) => {
    planner.events = planner.events.map((entry) => (entry === detail.event ? { ...entry, ...detail.changes } : entry))
    const { day, date, start, end } = detail.changes
    say(`event-change: ${detail.event.title}, ${date ?? day} ${start}–${end}`)
  })
  planner.addEventListener('week-change', ({ detail }) => say(`week-change: ${detail.start} → ${detail.end}`))
  planner.addEventListener('event-click', ({ detail }) => say(`event-click: ${detail.event.title}`))
}

function seedExamples(): void {
  document.querySelectorAll<MonthPlanner | WeekPlanner>('[data-planner-demo="editable"]').forEach((planner) => {
    if (seeded.has(planner)) return
    if (planner.localName === 'c2-month-planner') wireMonth(planner as MonthPlanner)
    else if (planner.localName === 'c2-week-planner') wireWeek(planner as WeekPlanner)
    else return
    seeded.add(planner)
  })
}

seedExamples()
new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
document.addEventListener('astro:page-load', seedExamples)
