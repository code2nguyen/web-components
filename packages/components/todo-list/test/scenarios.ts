import '../src/todo-list'
import type { TodoList, TodoListLook, TodoTask } from '../src/todo-list'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'default'
const main = document.querySelector('main')!

const week: TodoTask[] = [
  { id: 'a', label: 'Send the Q3 report to Léa', icon: 'mail', done: true, due: 'Mon' },
  { id: 'b', label: 'Dentist appointment', note: 'Dr. Martin, 14 rue Oberkampf\nBring the insurance card', due: 'Tue 9:30' },
  { id: 'c', label: 'Renew passport', highlight: 'yellow', due: 'Today', urgent: true },
  { id: 'd', label: 'Call the plumber about the leak', dropped: true },
  { id: 'e', label: 'Book the train to Lyon', icon: 'flight', note: 'Friday evening, back Sunday' },
  { id: 'f', label: 'Birthday present for Anna', icon: 'gift', ink: 'violet', due: 'Sat' },
  { id: 'g', label: 'Pay the electricity bill', archived: true },
]

const groceries: TodoTask[] = [
  { id: 'g1', label: 'Tomatoes', icon: 'vegetables', note: '6, on the vine', done: true },
  { id: 'g2', label: 'Green lentils', icon: 'legumes', note: '500 g' },
  { id: 'g3', label: 'Spinach', icon: 'salad', dropped: true },
  { id: 'g4', label: 'Oat milk', icon: 'milk', note: '2 L · barista', done: true },
  { id: 'g5', label: 'Comté', icon: 'cheese', highlight: 'orange', note: 'For Saturday’s dinner' },
  { id: 'g6', label: 'Free-range eggs', icon: 'egg' },
  { id: 'g7', label: 'Salmon fillets', icon: 'fish' },
  { id: 'g8', label: 'Sourdough loaf', icon: 'bread', done: true },
  { id: 'g9', label: 'Basmati rice', icon: 'grain' },
]

const plain: TodoTask[] = [
  { id: 'p1', label: 'Water the plants', done: true },
  { id: 'p2', label: 'Call mom' },
  { id: 'p3', label: 'Finish chapter 4', highlight: 'pink' },
  { id: 'p4', label: 'Go for a run' },
]

const looks: Record<string, TodoListLook> = {
  paper: { background: 'paper' },
  night: { background: 'night', pen: 'green' },
  mint: { background: 'mint', pen: 'violet', doneMark: 'cross' },
  sky: { background: 'sky', progress: 'hero' },
}

type Setup = { heading: string; attributes: string; tasks: TodoTask[] }
const setups: Record<string, Setup> = {
  default: { heading: 'This week', attributes: 'customizable', tasks: week },
  persist: { heading: 'This week', attributes: 'customizable storage-key="spec" persist-tasks', tasks: week },
  readonly: { heading: 'This week', attributes: 'readonly', tasks: week },
  bar: { heading: 'This week', attributes: 'progress="bar"', tasks: week },
  hero: { heading: 'This week', attributes: 'progress="hero" customizable', tasks: week },
  groceries: { heading: 'Groceries', attributes: 'customizable', tasks: groceries },
  plain: { heading: 'Sunday', attributes: 'customizable icon="none"', tasks: plain },
  'all-done': { heading: 'Weekend', attributes: '', tasks: [{ id: 'a', label: 'Long run', done: true }] },
  empty: { heading: 'Weekend', attributes: '', tasks: [] },
}
const setup = setups[scenario] ?? setups.default

main.innerHTML = `<c2-todo-list id="subject" heading="${setup.heading}" ${setup.attributes}>${
  scenario === 'empty' ? '<span slot="empty">Nothing planned yet.</span>' : ''
}</c2-todo-list>`

const subject = document.querySelector<TodoList>('#subject')!
subject.tasks = setup.tasks
const look = params.get('look')
if (look && looks[look]) subject.look = looks[look]

const events: string[] = []
for (const type of [
  'task-toggle',
  'task-add',
  'task-remove',
  'task-archive',
  'task-restore',
  'task-change',
  'task-reorder',
  'tasks-change',
  'look-change',
] as const) {
  subject.addEventListener(type, () => {
    events.push(type)
    subject.dataset.events = events.join(' ')
  })
}

await subject.updateComplete
main.dataset.ready = 'true'
