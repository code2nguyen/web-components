import '../src/todo-list'
import type { TodoList } from '../src/todo-list'

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'default'
const main = document.querySelector('main')!

const tasks = JSON.stringify([
  { id: 'a', label: 'Draft the announcement', icon: 'mail', color: 'blue', done: true },
  { id: 'b', label: 'Review pricing copy', icon: 'document', color: 'teal', done: true, due: 'Mon' },
  { id: 'c', label: 'Ship the build', icon: 'rocket', color: 'violet', due: 'Today', urgent: true },
  { id: 'd', label: 'Book the team dinner', icon: 'restaurant', color: 'amber' },
])

const attributes: Record<string, string> = {
  default: 'customizable',
  persist: 'customizable storage-key="spec" persist-tasks',
  readonly: 'readonly',
  bar: 'progress="bar"',
  hero: 'progress="hero" customizable',
}

main.innerHTML =
  scenario === 'empty'
    ? '<c2-todo-list id="subject" heading="Weekend"><span slot="empty">Nothing planned yet.</span></c2-todo-list>'
    : scenario === 'all-done'
      ? `<c2-todo-list id="subject" heading="Weekend" tasks='${JSON.stringify([{ id: 'a', label: 'Long run', done: true }])}'></c2-todo-list>`
      : `<c2-todo-list id="subject" heading="Launch week" ${attributes[scenario] ?? ''} tasks='${tasks}'></c2-todo-list>`

const subject = document.querySelector<TodoList>('#subject')!
const events: string[] = []
for (const type of ['task-toggle', 'task-add', 'task-remove', 'task-change', 'tasks-change', 'look-change'] as const) {
  subject.addEventListener(type, () => {
    events.push(type)
    subject.dataset.events = events.join(' ')
  })
}

await subject.updateComplete
main.dataset.ready = 'true'
