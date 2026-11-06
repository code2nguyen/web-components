import type { MonthPlanner, MonthPlannerEvent } from '@c2n/components/month-planner'
import type { Scheduler } from '@c2n/components/scheduler'
import type { WeekPlanner, WeekPlannerEvent } from '@c2n/components/week-planner'

/**
 * Makes the editable planner examples live. `c2-month-planner`, `c2-week-planner` and `c2-scheduler` with
 * `data-planner-demo="editable"` play the application: the planners never rewrite `events`, so each
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

function wireScheduler(scheduler: Scheduler): void {
  const say = outputFor(scheduler)
  const time = (value: string) => value.slice(11)
  scheduler.addEventListener('range-select', ({ detail }) => {
    scheduler.events = [...scheduler.events, { id: `new-${next++}`, resource: detail.resource, start: detail.start, end: detail.end, title: 'New booking' }]
    say(`range-select: ${detail.resource}, ${time(detail.start)}–${time(detail.end)}`)
  })
  scheduler.addEventListener('event-change', ({ detail }) => {
    const { start, end, resource } = detail
    scheduler.events = scheduler.events.map((entry) => (entry === detail.event ? { ...entry, start, end, resource } : entry))
    say(`event-change: ${detail.event.title}, ${resource} ${time(start)}–${time(end)}`)
  })
  scheduler.addEventListener('event-click', ({ detail }) => say(`event-click: ${detail.event.title}`))
}

function seedExamples(): void {
  document.querySelectorAll<MonthPlanner | WeekPlanner | Scheduler>('[data-planner-demo="editable"]').forEach((planner) => {
    if (seeded.has(planner)) return
    if (planner.localName === 'c2-month-planner') wireMonth(planner as MonthPlanner)
    else if (planner.localName === 'c2-week-planner') wireWeek(planner as WeekPlanner)
    else if (planner.localName === 'c2-scheduler') wireScheduler(planner as Scheduler)
    else return
    seeded.add(planner)
  })
}

seedExamples()
new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
document.addEventListener('astro:page-load', seedExamples)
