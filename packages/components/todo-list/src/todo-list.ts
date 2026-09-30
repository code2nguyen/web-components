import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { html as staticHtml, unsafeStatic, type StaticValue } from 'lit/static-html.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/reorder-list'
import type { ReorderEventDetail } from '@c2n/reorder-list'
import '@c2n/task-icons'
import { isTaskIconName, taskIconCatalog, taskIconCategories, taskIconTag, type TaskIconName, type TaskIconCategory } from '@c2n/task-icons/task-icon-names.js'
import { suggestTaskIcon } from '@c2n/task-icons/suggest-task-icon.js'
import styles from './todo-list.scss?inline'

/** Pen colours: the tick, the strike line, icons and a task's text. Each background maps them to readable inks. */
export const todoPens = ['blue', 'red', 'green', 'violet', 'graphite'] as const
export type TodoPen = (typeof todoPens)[number]

/** Highlighter colours for a task's background, mixed into the list's own background so they suit every theme. */
export const todoHighlights = ['yellow', 'green', 'blue', 'pink', 'orange', 'violet'] as const
export type TodoHighlight = (typeof todoHighlights)[number]

/** Background presets of the customize panel. `default` follows the component's CSS variables and the theme. */
export const todoBackgrounds = ['default', 'paper', 'mint', 'sky', 'blush', 'sand', 'night'] as const
export type TodoBackground = (typeof todoBackgrounds)[number]

export type TodoProgress = 'ring' | 'bar' | 'hero' | 'none'
export type TodoDensity = 'cozy' | 'compact'
export type TodoDoneMark = 'tick' | 'cross'
export type TodoFilter = 'all' | 'active' | 'done'

export interface TodoTask {
  /** Stable identity. Generated when missing. */
  id?: string
  /** The task, as plain text. */
  label: string
  /** More information: a quantity, an address, a link. Shown as a second line and edited by clicking the task. */
  note?: string
  done?: boolean
  /** Crossed off without being done ("won't do"). Counts as closed in the progress. */
  dropped?: boolean
  /** Moved to the archive section: out of the list and the progress, restorable. */
  archived?: boolean
  /** An optional `@c2n/task-icons` name (`mail`, `milk`, `run`…). */
  icon?: string
  /** Highlighter background, e.g. for an important task. */
  highlight?: TodoHighlight
  /** Pen colour of the task's text. */
  ink?: TodoPen
  /** Short due text shown after the task: `Today`, `Fri`, `9:30`. */
  due?: string
  /** Draws the due text in the red pen and counts the task in the summary. */
  urgent?: boolean
}

/** What the customize panel changes. Every key is optional: a missing key keeps the authored look. */
export interface TodoListLook {
  background?: TodoBackground
  pen?: TodoPen
  doneMark?: TodoDoneMark
  progress?: TodoProgress
  density?: TodoDensity
}

export interface TodoTaskEventDetail {
  task: TodoTask
  tasks: TodoTask[]
}

export interface TodoTaskReorderEventDetail extends TodoTaskEventDetail {
  fromIndex: number
  toIndex: number
}

export interface TodoTasksChangeEventDetail {
  tasks: TodoTask[]
}

export interface TodoLookChangeEventDetail {
  look: TodoListLook
}

/** Events fired by {@link TodoList}, keyed for `addEventListener`. */
export interface TodoListEventMap {
  'task-toggle': CustomEvent<TodoTaskEventDetail>
  'task-add': CustomEvent<TodoTaskEventDetail>
  'task-remove': CustomEvent<TodoTaskEventDetail>
  'task-archive': CustomEvent<TodoTaskEventDetail>
  'task-restore': CustomEvent<TodoTaskEventDetail>
  'task-change': CustomEvent<TodoTaskEventDetail>
  'task-reorder': CustomEvent<TodoTaskReorderEventDetail>
  'tasks-change': CustomEvent<TodoTasksChangeEventDetail>
  'look-change': CustomEvent<TodoLookChangeEventDetail>
}

export interface TodoList {
  addEventListener: TypedAddEventListener<TodoList, TodoListEventMap>
  removeEventListener: TypedRemoveEventListener<TodoList, TodoListEventMap>
}

type TaskEventFactory = (detail: TodoTaskEventDetail) => CustomEvent<TodoTaskEventDetail>
type MenuAction = 'note' | 'style' | 'drop' | 'archive' | 'delete'

const STORAGE_PREFIX = 'c2-todo-list:'
const ICON_COLUMNS = 8
const SWIPE_OPEN = -152
const TOAST_MS = 5000
const v = (name: string) => `--c2-todo-list__${name}`

interface Preset {
  label: string
  surface: string
  ink: string
  muted: string
  line: string
  soft: string
  pens: Record<TodoPen, string>
  dark?: boolean
}

// Each background is a complete, checked palette: its text colour follows from it, and it only offers pens that read
// on it (4.5:1 or better). The values are set inline on an element inside the shadow root, so a viewer's choice
// wins over the variables an application sets on the host; `Reset` removes them and hands the look back.
const PRESETS: Record<Exclude<TodoBackground, 'default'>, Preset> = {
  paper: {
    label: 'Paper',
    surface: '#fbf8f1',
    ink: '#2a2622',
    muted: '#6f665b',
    line: '#e6dfd2',
    soft: '#f3eee3',
    pens: { blue: '#2b59c3', red: '#b8322a', green: '#2f7148', violet: '#6b3fb5', graphite: '#4a4744' },
  },
  mint: {
    label: 'Mint',
    surface: '#f1faf5',
    ink: '#10281f',
    muted: '#43645a',
    line: '#cfe6da',
    soft: '#e2f3ea',
    pens: { blue: '#1d4ed8', red: '#b4234f', green: '#0f6b63', violet: '#7a3db8', graphite: '#3c4f48' },
  },
  sky: {
    label: 'Sky',
    surface: '#f2f7fe',
    ink: '#0f1f35',
    muted: '#475b76',
    line: '#d3e1f4',
    soft: '#e4eefb',
    pens: { blue: '#1d4ed8', red: '#be123c', green: '#0f6b63', violet: '#6d28d9', graphite: '#3f4b5c' },
  },
  blush: {
    label: 'Blush',
    surface: '#fdf3f5',
    ink: '#2d1520',
    muted: '#744857',
    line: '#f1d6de',
    soft: '#f9e5ea',
    pens: { blue: '#1d4ed8', red: '#be185d', green: '#0f6b63', violet: '#6d28d9', graphite: '#4d3a42' },
  },
  sand: {
    label: 'Sand',
    surface: '#f8f1e4',
    ink: '#2b2014',
    muted: '#6d5a41',
    line: '#e8dcc6',
    soft: '#f0e6d3',
    pens: { blue: '#1e40af', red: '#9a3412', green: '#166534', violet: '#6b21a8', graphite: '#4a3f33' },
  },
  night: {
    label: 'Night',
    surface: '#1a1a1f',
    ink: '#f1f0ee',
    muted: '#a3a0a8',
    line: '#2e2e35',
    soft: '#26262c',
    pens: { blue: '#7fb0ff', red: '#ff8a80', green: '#6ee7b7', violet: '#c4b5fd', graphite: '#c9c7cc' },
    dark: true,
  },
}

function presetVars(preset: Preset): Record<string, string> {
  const vars: Record<string, string> = {
    [v('container--background-color')]: preset.surface,
    [v('container--color')]: preset.ink,
    [v('container--border')]: `1px solid ${preset.line}`,
    [v('meta--color')]: preset.muted,
    [v('label__done--color')]: preset.muted,
    [v('track--color')]: preset.line,
    [v('chip--background-color')]: preset.soft,
    [v('row__divider--color')]: preset.line,
    [v('row__hover--background-color')]: preset.soft,
    [v('panel--background-color')]: preset.soft,
    [v('mark--color')]: preset.muted,
    [v('add--border-color')]: preset.line,
    [v('accent--color')]: preset.pens.blue,
    [v('dropped--color')]: preset.pens.red,
    [v('on-accent--color')]: preset.dark ? '#0b1220' : '#ffffff',
  }
  for (const pen of todoPens) vars[v(`pen-${pen}--color`)] = preset.pens[pen]
  if (preset.dark) vars[v('container--box-shadow')] = '0 24px 60px rgba(0, 0, 0, 0.45)'
  return vars
}

const COMPACT_VARS: Record<string, string> = {
  [v('row--padding')]: '5px 8px',
  [v('mark--size')]: '24px',
  [v('icon--size')]: '18px',
  [v('container--gap')]: '12px',
}

// The pens' defaults, as in the stylesheet's `$theme` map, for the one place a pen is referenced from script.
const PEN_DEFAULTS: Record<TodoPen, string> = { blue: '#0265dc', red: '#dc2626', green: '#0f766e', violet: '#7c3aed', graphite: '#71717a' }
const PEN_LABELS: Record<TodoPen, string> = { blue: 'Blue ink', red: 'Red ink', green: 'Green ink', violet: 'Violet ink', graphite: 'Graphite' }
const HIGHLIGHT_LABELS: Record<TodoHighlight, string> = {
  yellow: 'Yellow highlighter',
  green: 'Green highlighter',
  blue: 'Blue highlighter',
  pink: 'Pink highlighter',
  orange: 'Orange highlighter',
  violet: 'Violet highlighter',
}
const CATEGORY_LABELS: Record<TaskIconCategory, string> = {
  work: 'Work',
  communication: 'Communication',
  tech: 'Tech',
  learning: 'Learning',
  health: 'Health',
  sport: 'Sport',
  home: 'Home',
  family: 'Family & friends',
  food: 'Food & groceries',
  shopping: 'Shopping',
  finance: 'Money',
  travel: 'Travel',
  leisure: 'Leisure',
  nature: 'Nature',
  planning: 'Planning',
}
const PROGRESS_OPTIONS: [TodoProgress, string][] = [
  ['ring', 'Ring'],
  ['bar', 'Bar'],
  ['hero', 'Hero'],
  ['none', 'None'],
]
const FILTERS: [TodoFilter, string][] = [
  ['all', 'All'],
  ['active', 'To do'],
  ['done', 'Done'],
]

// Hand-drawn marks: an open pen circle, a tick, a cross and a slightly wavy strike line.
const CIRCLE = 'M12 4.6c4.3-.3 7.5 3 7.3 7.3-.1 4.1-3.3 7.3-7.4 7.2-4.1-.1-7.2-3.3-7-7.5.2-3.5 2.6-6.2 6-6.9'
const TICK = 'M4.5 12.6c1.7 1.5 3 3.2 4 5.2 2.8-5.6 6.3-9.7 11.2-13'
const CROSS = 'M6.5 6.8c3.6 3.2 7.2 7 10.8 10.6M17.2 6.4c-3.9 3.5-7.4 7.4-10.6 11.2'
const DASH = 'M5 12.5c4.6-.6 9.3-.6 14 .2'
const STRIKE = 'M1 6.2C18 4.3 34 7.4 52 5.3S84 3.9 99 5.6'

const iconTags = new Map<TaskIconName, StaticValue>()
function renderTaskIcon(name: TaskIconName): TemplateResult {
  let tag = iconTags.get(name)
  if (!tag) {
    tag = unsafeStatic(taskIconTag(name))
    iconTags.set(name, tag)
  }
  return staticHtml`<${tag} class="icon"></${tag}>`
}

const iconGroups = taskIconCategories.map((category) => ({
  category,
  label: CATEGORY_LABELS[category],
  icons: taskIconCatalog.filter((icon) => icon.category === category),
}))

let idCounter = 0
function newTaskId(): string {
  idCounter += 1
  return `task-${Date.now().toString(36)}-${idCounter}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return (list as readonly unknown[]).includes(value)
}

/** Keep only the keys of a stored look that are still valid, so a stale or edited entry cannot break the list. */
function sanitizeLook(value: unknown): TodoListLook {
  if (!isRecord(value)) return {}
  const look: TodoListLook = {}
  if (includes(todoBackgrounds, value.background)) look.background = value.background
  if (includes(todoPens, value.pen)) look.pen = value.pen
  if (value.doneMark === 'tick' || value.doneMark === 'cross') look.doneMark = value.doneMark
  if (PROGRESS_OPTIONS.some(([option]) => option === value.progress)) look.progress = value.progress as TodoProgress
  if (value.density === 'cozy' || value.density === 'compact') look.density = value.density
  return look
}

function sanitizeTasks(value: unknown): TodoTask[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((task): task is TodoTask => isRecord(task) && typeof task.label === 'string')
}

/** `"Milk - 2 L barista"` → label `Milk`, note `2 L barista`. */
function splitDraft(draft: string): { label: string; note?: string } {
  const [label, ...rest] = draft.split(/\s+[-–—]\s+/)
  const note = rest.join(' - ').trim()
  return note ? { label: label.trim(), note } : { label: draft.trim() }
}

interface Swipe {
  id: string
  pointerId: number
  x0: number
  y0: number
  base: number
  dx: number
  active: boolean
}

interface Toast {
  message: string
  undo: () => void
}

/**
 * A to-do list with the feel of a paper one: tasks are plain text, checked off with a hand-drawn tick (or cross) and
 * a pen-stroke through the text. Progress shows as a ring beside the heading, a bar, or a large hero ring. Click a
 * task to add a note; drag the grip to reorder; swipe a row left to archive or delete it and right to check it, or
 * use its ⋯ menu (also a right-click, and the keys E, Delete, X and N). Archived tasks collect in a section at the
 * bottom, and every removal can be undone.
 *
 * Tasks can carry an optional icon from `@c2n/task-icons`, a highlighter background and a pen colour for the text.
 * With `customizable`, a palette button opens a panel for the background (whose text colour follows), the pen, the
 * done mark, the progress style, the density and the selected task's icon and colours; with `storage-key` those
 * choices are remembered in `localStorage`.
 *
 * @tag c2-todo-list
 *
 * @slot actions - Extra controls at the end of the header, before the customize button.
 * @slot empty - Content shown when the list has no tasks at all. Defaults to a short sentence.
 *
 * @event {CustomEvent<TodoTaskEventDetail>} task-toggle - A task was checked or unchecked. `detail.task` is the updated task.
 * @event {CustomEvent<TodoTaskEventDetail>} task-add - A task was added from the add field, or a deletion was undone.
 * @event {CustomEvent<TodoTaskEventDetail>} task-remove - A task was deleted. `detail.task` is the removed task.
 * @event {CustomEvent<TodoTaskEventDetail>} task-archive - A task was moved to the archive.
 * @event {CustomEvent<TodoTaskEventDetail>} task-restore - An archived task was restored, or an archive was undone.
 * @event {CustomEvent<TodoTaskEventDetail>} task-change - A task's note, icon, highlight, pen or won't-do state changed.
 * @event {CustomEvent<TodoTaskReorderEventDetail>} task-reorder - A task was dragged, or moved with the keyboard, to a new position.
 * @event {CustomEvent<TodoTasksChangeEventDetail>} tasks-change - Fired after every change to the tasks with the new list, for two-way binding.
 * @event {CustomEvent<TodoLookChangeEventDetail>} look-change - The viewer changed the look in the customize panel, or reset it.
 *
 * @cssproperty {color} [--c2-todo-list__container--background-color=#ffffff] - Background of the list.
 * @cssproperty {color} [--c2-todo-list__container--color=#18181b] - Text colour of the heading and tasks.
 * @cssproperty {border} [--c2-todo-list__container--border=1px solid #e4e4e7] - Border of the list.
 * @cssproperty {border-radius} [--c2-todo-list__container--border-radius=14px] - Corner radius of the list.
 * @cssproperty {shadow} [--c2-todo-list__container--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Shadow of the list.
 * @cssproperty {pixel} [--c2-todo-list__container--padding=20px] - Inner padding of the list.
 * @cssproperty {pixel} [--c2-todo-list__container--gap=16px] - Space between the header, filters, tasks and add field.
 * @cssproperty {pixel} [--c2-todo-list__heading--font-size=18px] - Font size of the heading.
 * @cssproperty {font-weight} [--c2-todo-list__heading--font-weight=600] - Font weight of the heading.
 * @cssproperty {color} [--c2-todo-list__meta--color=#71717a] - Colour of the progress summary, notes and panel labels.
 * @cssproperty {pixel} [--c2-todo-list__meta--font-size=12px] - Font size of the progress summary and notes.
 * @cssproperty {color} [--c2-todo-list__accent--color=#0265dc] - The pen of ticks, strike lines, the progress and the add button.
 * @cssproperty {color} [--c2-todo-list__on-accent--color=#ffffff] - Text drawn on the accent colour.
 * @cssproperty {color} [--c2-todo-list__track--color=#e4e4e7] - Unfilled part of the progress ring and bar.
 * @cssproperty {pixel} [--c2-todo-list__ring--size=44px] - Size of the progress ring beside the heading.
 * @cssproperty {number} [--c2-todo-list__ring--stroke-width=4.5] - Stroke of the progress ring, in units of its 48x48 canvas.
 * @cssproperty {pixel} [--c2-todo-list__hero-ring--size=120px] - Size of the hero progress ring.
 * @cssproperty {number} [--c2-todo-list__hero-ring--stroke-width=7] - Stroke of the hero ring, in units of its 48x48 canvas.
 * @cssproperty {pixel} [--c2-todo-list__bar--height=8px] - Height of the progress bar.
 * @cssproperty {color} [--c2-todo-list__chip--background-color=#f4f4f5] - Background of the filter tabs and note editor.
 * @cssproperty {spacing} [--c2-todo-list__row--padding=9px 8px] - Padding of a task row.
 * @cssproperty {pixel} [--c2-todo-list__row--gap=8px] - Space between the parts of a task row.
 * @cssproperty {border-radius} [--c2-todo-list__row--border-radius=8px] - Corner radius of a task row.
 * @cssproperty {color} [--c2-todo-list__row__divider--color=#f4f4f5] - Line between task rows.
 * @cssproperty {color} [--c2-todo-list__row__hover--background-color=#fafafa] - Background of a hovered task row.
 * @cssproperty {pixel} [--c2-todo-list__mark--size=28px] - Size of the hand-drawn check mark.
 * @cssproperty {color} [--c2-todo-list__mark--color=#a1a1aa] - Pen of the open circle before a task is checked.
 * @cssproperty {number} [--c2-todo-list__mark--stroke-width=2.6] - Stroke of the tick and cross, in units of their 24x24 canvas.
 * @cssproperty {color} [--c2-todo-list__dropped--color=#dc2626] - Pen of the cross on a task that won't be done.
 * @cssproperty {pixel} [--c2-todo-list__label--font-size=14px] - Font size of a task.
 * @cssproperty {color} [--c2-todo-list__label__done--color=#71717a] - Colour of a checked task's text.
 * @cssproperty {pixel} [--c2-todo-list__icon--size=20px] - Size of a task's icon.
 * @cssproperty {color} [--c2-todo-list__add--border-color=#d4d4d8] - Colour of the dashed border around the add field.
 * @cssproperty {color} [--c2-todo-list__panel--background-color=#fafafa] - Background of the customize panel and task menu.
 * @cssproperty {border-radius} [--c2-todo-list__panel--border-radius=8px] - Corner radius of the customize panel and task menu.
 * @cssproperty {color} [--c2-todo-list__archive-action--background-color=#a16207] - Swipe action that archives a task.
 * @cssproperty {color} [--c2-todo-list__delete-action--background-color=#dc2626] - Swipe action that deletes a task.
 * @cssproperty {color} [--c2-todo-list__done-action--background-color=#15803d] - Swipe-right hint that checks a task.
 * @cssproperty {color} [--c2-todo-list__toast--background-color=#18181b] - Background of the undo message.
 * @cssproperty {color} [--c2-todo-list__toast--color=#fafafa] - Text of the undo message.
 * @cssproperty {outline} [--c2-todo-list__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of every control.
 * @cssproperty {duration} [--c2-todo-list--transition-duration=200ms] - Duration of the pen strokes, swipes and progress animations.
 * @cssproperty {color} [--c2-todo-list__pen-blue--color=#0265dc] - The `blue` pen.
 * @cssproperty {color} [--c2-todo-list__pen-red--color=#dc2626] - The `red` pen.
 * @cssproperty {color} [--c2-todo-list__pen-green--color=#0f766e] - The `green` pen.
 * @cssproperty {color} [--c2-todo-list__pen-violet--color=#7c3aed] - The `violet` pen.
 * @cssproperty {color} [--c2-todo-list__pen-graphite--color=#71717a] - The `graphite` pen.
 * @cssproperty {color} [--c2-todo-list__highlight-yellow--color=#facc15] - The `yellow` highlighter, mixed into the background.
 * @cssproperty {color} [--c2-todo-list__highlight-green--color=#22c55e] - The `green` highlighter, mixed into the background.
 * @cssproperty {color} [--c2-todo-list__highlight-blue--color=#3b82f6] - The `blue` highlighter, mixed into the background.
 * @cssproperty {color} [--c2-todo-list__highlight-pink--color=#ec4899] - The `pink` highlighter, mixed into the background.
 * @cssproperty {color} [--c2-todo-list__highlight-orange--color=#f97316] - The `orange` highlighter, mixed into the background.
 * @cssproperty {color} [--c2-todo-list__highlight-violet--color=#8b5cf6] - The `violet` highlighter, mixed into the background.
 */
@customElement('c2-todo-list')
export class TodoList extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Title of the list. */
  @property() heading = ''

  /** Heading level (1-6) the title is announced with. */
  @property({ type: Number, attribute: 'heading-level' }) headingLevel = 2

  /** Icon beside the heading, a `@c2n/task-icons` name. Suggested from the heading when missing; `none` shows no icon. */
  @property() icon = ''

  /** The tasks. Accepts a JSON array in the attribute. The list updates it as the user works. */
  @property({ converter: jsonPropertyConverter }) tasks: TodoTask[] = []

  /** How progress is drawn: a ring beside the heading, a bar under it, a large ring above it, or not at all. The viewer's choice in the customize panel wins. */
  @property() progress: TodoProgress = 'ring'

  /** Shows the palette button and its customize panel. */
  @property({ type: Boolean }) customizable = false

  /**
   * Remembers the viewer's customization in `localStorage` under `c2-todo-list:<storage-key>`. Give every list on a
   * site its own key.
   */
  @property({ attribute: 'storage-key' }) storageKey = ''

  /** With `storage-key`, also remembers the tasks, which then win over the `tasks` the page provides. */
  @property({ type: Boolean, attribute: 'persist-tasks' }) persistTasks = false

  /** Tasks cannot be checked, added, reordered, removed or edited. The look can still be customized. */
  @property({ type: Boolean }) readonly = false

  /** Placeholder of the add field. */
  @property() placeholder = 'Add a task — a note after a dash'

  /** The viewer's customization. Set it to apply a look from script; the panel and `storage-key` keep it up to date. */
  @property({ attribute: false }) look: TodoListLook = {}

  @state() private filter: TodoFilter = 'all'
  @state() private panelOpen = false
  @state() private selectedId: string | undefined
  @state() private expandedId: string | undefined
  @state() private menuId: string | undefined
  @state() private swipe: Swipe | undefined
  @state() private swipedId: string | undefined
  @state() private toast: Toast | undefined
  @state() private showArchived = false
  @state() private draft = ''
  @state() private iconQuery = ''

  private loadedKey: string | undefined
  private pendingFocus: (() => void) | undefined
  private toastTimer: ReturnType<typeof setTimeout> | undefined
  private suppressClick = false

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('pointerdown', this.handleOutsidePointer, true)
  }

  override disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.handleOutsidePointer, true)
    clearTimeout(this.toastTimer)
    super.disconnectedCallback()
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('storageKey') || changed.has('persistTasks')) this.restore()
    if (changed.has('tasks')) {
      const tasks = Array.isArray(this.tasks) ? this.tasks : []
      if (tasks !== this.tasks || tasks.some((task) => !task.id)) {
        this.tasks = tasks.map((task) => (task.id ? task : { ...task, id: newTaskId() }))
      }
    }
  }

  protected override updated(): void {
    const focus = this.pendingFocus
    this.pendingFocus = undefined
    focus?.()
  }

  /** Forget the viewer's customization and return to the authored look. */
  resetLook(): void {
    this.look = {}
    this.persist()
    this.dispatchEvent(new CustomEvent<TodoLookChangeEventDetail>('look-change', { detail: { look: {} } }))
  }

  // Storage ----------------------------------------------------------------------------------------------------------

  private get storageId(): string | undefined {
    return this.storageKey ? `${STORAGE_PREFIX}${this.storageKey}` : undefined
  }

  private restore(): void {
    const key = this.storageId
    if (!key || key === this.loadedKey) return
    this.loadedKey = key
    let stored: unknown
    try {
      stored = JSON.parse(window.localStorage.getItem(key) ?? 'null')
    } catch {
      return
    }
    if (!isRecord(stored)) return
    this.look = sanitizeLook(stored.look)
    const tasks = this.persistTasks ? sanitizeTasks(stored.tasks) : undefined
    if (tasks) this.tasks = tasks
  }

  private persist(): void {
    const key = this.storageId
    if (!key) return
    this.loadedKey = key
    try {
      const look = sanitizeLook(this.look)
      const empty = Object.keys(look).length === 0 && !this.persistTasks
      if (empty) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, JSON.stringify(this.persistTasks ? { look, tasks: this.tasks } : { look }))
    } catch {
      // Storage can be full or blocked (private mode, a sandboxed frame); the list keeps working without it.
    }
  }

  // Changes ----------------------------------------------------------------------------------------------------------

  private commitTasks(tasks: TodoTask[], event: TaskEventFactory, task: TodoTask): void {
    this.tasks = tasks
    this.persist()
    this.dispatchEvent(event({ task, tasks }))
    this.dispatchEvent(new CustomEvent<TodoTasksChangeEventDetail>('tasks-change', { detail: { tasks } }))
  }

  private replaceTask(task: TodoTask, patch: Partial<TodoTask>, event: TaskEventFactory): TodoTask {
    const updated = { ...task, ...patch }
    this.commitTasks(
      this.tasks.map((item) => (item.id === task.id ? updated : item)),
      event,
      updated,
    )
    return updated
  }

  private setLook(patch: TodoListLook): void {
    this.look = sanitizeLook({ ...this.look, ...patch })
    this.persist()
    this.dispatchEvent(new CustomEvent<TodoLookChangeEventDetail>('look-change', { detail: { look: this.look } }))
  }

  private showToast(message: string, undo: () => void): void {
    clearTimeout(this.toastTimer)
    this.toast = { message, undo }
    this.toastTimer = setTimeout(() => (this.toast = undefined), TOAST_MS)
  }

  private undo(): void {
    const toast = this.toast
    clearTimeout(this.toastTimer)
    this.toast = undefined
    toast?.undo()
  }

  private toggleTask(task: TodoTask): void {
    if (this.readonly) return
    this.replaceTask(task, { done: !task.done, dropped: false }, (detail) => new CustomEvent('task-toggle', { detail }))
  }

  private toggleDropped(task: TodoTask): void {
    if (this.readonly) return
    this.replaceTask(task, { dropped: !task.dropped, done: false }, (detail) => new CustomEvent('task-change', { detail }))
  }

  private patchTask(task: TodoTask, patch: Partial<TodoTask>): void {
    if (this.readonly) return
    this.replaceTask(task, patch, (detail) => new CustomEvent('task-change', { detail }))
  }

  private focusAfterRemoval(index: number): void {
    this.pendingFocus = () => {
      const marks = [...this.renderRoot.querySelectorAll<HTMLElement>('.tasks .mark')]
      const target = marks[Math.min(index, marks.length - 1)] ?? this.renderRoot.querySelector<HTMLElement>('.add-input')
      target?.focus()
    }
  }

  private archiveTask(task: TodoTask): void {
    if (this.readonly) return
    const index = this.visibleTasks().findIndex((item) => item.id === task.id)
    this.closeRow(task)
    const archived = this.replaceTask(task, { archived: true }, (detail) => new CustomEvent('task-archive', { detail }))
    this.focusAfterRemoval(index)
    this.showToast(`Archived “${task.label}”`, () => this.restoreTask(archived))
  }

  private restoreTask(task: TodoTask): void {
    this.replaceTask(task, { archived: false }, (detail) => new CustomEvent('task-restore', { detail }))
  }

  private removeTask(task: TodoTask): void {
    if (this.readonly) return
    const position = this.tasks.findIndex((item) => item.id === task.id)
    const index = this.visibleTasks().findIndex((item) => item.id === task.id)
    this.closeRow(task)
    this.commitTasks(
      this.tasks.filter((item) => item.id !== task.id),
      (detail) => new CustomEvent('task-remove', { detail }),
      task,
    )
    if (index >= 0) this.focusAfterRemoval(index)
    this.showToast(`Deleted “${task.label}”`, () => {
      const tasks = [...this.tasks]
      tasks.splice(Math.min(position, tasks.length), 0, task)
      this.commitTasks(tasks, (detail) => new CustomEvent('task-add', { detail }), task)
    })
  }

  private addTask(event: Event): void {
    event.preventDefault()
    const { label, note } = splitDraft(this.draft)
    if (!label || this.readonly) return
    const task: TodoTask = { id: newTaskId(), label, ...(note ? { note } : {}) }
    this.draft = ''
    if (this.filter === 'done') this.filter = 'all'
    this.commitTasks([...this.tasks, task], (detail) => new CustomEvent('task-add', { detail }), task)
  }

  private handleReorder(event: CustomEvent<ReorderEventDetail>): void {
    // The inner list's events are an implementation detail: the list reports its own `task-reorder` instead.
    event.stopPropagation()
    const byId = new Map(this.tasks.map((task) => [task.id, task]))
    const ordered = event.detail.order.map((item) => byId.get(item.key)).filter((task): task is TodoTask => !!task)
    const moved = byId.get(event.detail.item.key)
    if (!moved) return
    const tasks = [...ordered, ...this.tasks.filter((task) => task.archived)]
    const { fromIndex, toIndex } = event.detail
    this.tasks = tasks
    this.persist()
    this.dispatchEvent(new CustomEvent<TodoTaskReorderEventDetail>('task-reorder', { detail: { task: moved, tasks, fromIndex, toIndex } }))
    this.dispatchEvent(new CustomEvent<TodoTasksChangeEventDetail>('tasks-change', { detail: { tasks } }))
  }

  // Menus, notes and the panel -----------------------------------------------------------------------------------

  private closeRow(task: TodoTask): void {
    if (this.menuId === task.id) this.menuId = undefined
    if (this.swipedId === task.id) this.swipedId = undefined
    if (this.expandedId === task.id) this.expandedId = undefined
    if (this.selectedId === task.id) this.selectedId = undefined
  }

  private readonly handleOutsidePointer = (event: PointerEvent): void => {
    if (!this.menuId && !this.swipedId) return
    const path = event.composedPath()
    const within = (predicate: (node: HTMLElement) => boolean) => path.some((node) => node instanceof HTMLElement && predicate(node))
    if (this.menuId && !within((node) => node.classList.contains('menu') || node.classList.contains('more'))) this.menuId = undefined
    if (this.swipedId && !within((node) => node.dataset.swipeRow === this.swipedId)) this.swipedId = undefined
  }

  private openMenu(task: TodoTask, focusFirst: boolean): void {
    this.menuId = this.menuId === task.id ? undefined : task.id
    if (this.menuId && focusFirst) this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.menu [role="menuitem"]')?.focus()
  }

  private closeMenu(task: TodoTask): void {
    this.menuId = undefined
    this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>(`[data-swipe-row="${task.id}"] .more`)?.focus()
  }

  private handleMenuKey(event: KeyboardEvent, task: TodoTask): void {
    const items = [...this.renderRoot.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')]
    const index = items.indexOf(event.target as HTMLElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closeMenu(task)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    } else if (event.key === 'Tab') {
      this.menuId = undefined
    }
  }

  private runMenu(task: TodoTask, action: MenuAction): void {
    this.menuId = undefined
    if (action === 'note') this.openNote(task)
    if (action === 'style') {
      this.selectedId = task.id
      this.panelOpen = true
      this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.task-editor [role="radio"][aria-checked="true"]')?.focus()
    }
    if (action === 'drop') this.toggleDropped(task)
    if (action === 'archive') this.archiveTask(task)
    if (action === 'delete') this.removeTask(task)
  }

  private openNote(task: TodoTask): void {
    if (this.suppressClick) return
    this.expandedId = this.expandedId === task.id ? undefined : task.id
    if (this.expandedId && !this.readonly) this.pendingFocus = () => this.renderRoot.querySelector<HTMLTextAreaElement>('.note-input')?.focus()
  }

  private handleRowKey(event: KeyboardEvent, task: TodoTask): void {
    const target = event.target as HTMLElement
    if (target.matches('textarea, input') || event.metaKey || event.ctrlKey || event.altKey || this.readonly) return
    const key = event.key.toLowerCase()
    if (key === 'e') this.archiveTask(task)
    else if (key === 'delete' || key === 'backspace') this.removeTask(task)
    else if (key === 'x') this.toggleDropped(task)
    else if (key === 'n') this.openNote(task)
    else if (key === 'contextmenu' || (event.shiftKey && key === 'f10')) this.openMenu(task, true)
    else return
    event.preventDefault()
  }

  private handlePanelKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    this.panelOpen = false
    this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.customize')?.focus()
  }

  private moveIconFocus(event: KeyboardEvent): void {
    const buttons = [...this.renderRoot.querySelectorAll<HTMLElement>('.icon-option')]
    const index = buttons.indexOf(event.target as HTMLElement)
    if (index < 0) return
    const steps: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: ICON_COLUMNS, ArrowUp: -ICON_COLUMNS }
    let next: number | undefined
    if (event.key in steps) next = index + steps[event.key]
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = buttons.length - 1
    if (next === undefined || next < 0 || next >= buttons.length) return
    event.preventDefault()
    buttons.forEach((button, position) => (button.tabIndex = position === next ? 0 : -1))
    buttons[next].focus()
  }

  // Swipe ------------------------------------------------------------------------------------------------------------

  private handleSwipeDown(event: PointerEvent, task: TodoTask): void {
    // Only the grip starts a reorder; everything else in the row belongs to the swipe and the row's own controls.
    if ((event.target as HTMLElement).closest('.grip')) return
    event.stopPropagation()
    if (this.readonly || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
    if ((event.target as HTMLElement).closest('textarea, input')) return
    this.suppressClick = false
    this.swipe = {
      id: task.id!,
      pointerId: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      base: this.swipedId === task.id ? SWIPE_OPEN : 0,
      dx: 0,
      active: false,
    }
  }

  private handleSwipeMove(event: PointerEvent): void {
    const swipe = this.swipe
    if (!swipe || swipe.pointerId !== event.pointerId) return
    const deltaX = event.clientX - swipe.x0
    const deltaY = event.clientY - swipe.y0
    if (!swipe.active) {
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
        this.swipe = undefined
        return
      }
      if (Math.abs(deltaX) < 8) return
      ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    }
    this.swipe = { ...swipe, active: true, dx: Math.max(-190, Math.min(130, swipe.base + deltaX)) }
  }

  private handleSwipeUp(event: PointerEvent, task: TodoTask): void {
    const swipe = this.swipe
    if (!swipe || swipe.pointerId !== event.pointerId) return
    this.swipe = undefined
    if (!swipe.active) return
    this.suppressClick = true
    setTimeout(() => (this.suppressClick = false))
    if (swipe.dx > 90) {
      this.swipedId = undefined
      this.toggleTask(task)
    } else if (swipe.dx < -70) {
      this.swipedId = task.id
      this.menuId = undefined
    } else {
      this.swipedId = undefined
    }
  }

  // Render -----------------------------------------------------------------------------------------------------------

  private visibleTasks(): TodoTask[] {
    return this.tasks.filter((task) => !task.archived)
  }

  private iconOf(task: TodoTask): TaskIconName | undefined {
    return task.icon && isTaskIconName(task.icon) ? task.icon : undefined
  }

  private get headerIcon(): TaskIconName | undefined {
    if (this.icon === 'none') return undefined
    if (this.icon && isTaskIconName(this.icon)) return this.icon
    return this.heading ? suggestTaskIcon(this.heading) : undefined
  }

  override render() {
    const active = this.visibleTasks()
    const total = active.length
    const closed = active.filter((task) => task.done || task.dropped).length
    const percent = total ? Math.round((closed / total) * 100) : 0
    const progress = this.look.progress ?? this.progress
    const preset = this.look.background && this.look.background !== 'default' ? PRESETS[this.look.background] : undefined
    const containerStyle: Record<string, string> = {
      ...(preset ? presetVars(preset) : {}),
      ...(this.look.density === 'compact' ? COMPACT_VARS : {}),
      ...(this.look.pen ? { [v('accent--color')]: `var(${v(`pen-${this.look.pen}--color`)}, ${PEN_DEFAULTS[this.look.pen]})` } : {}),
    }
    const allDone = total > 0 && closed === total
    const urgent = active.filter((task) => task.urgent && !task.done && !task.dropped).length
    const summary = total === 0 ? 'No tasks yet' : allDone ? 'All done. Nice work.' : `${closed} of ${total} done`
    const meta = urgent && !allDone ? `${summary} · ${urgent} urgent` : summary
    const classes = {
      container: true,
      [`progress-${progress}`]: true,
      [`background-${this.look.background ?? 'default'}`]: true,
      'all-done': allDone,
      readonly: this.readonly,
    }

    return html`
      <section class=${classMap(classes)} style=${styleMap(containerStyle)}>
        ${this.renderHeader(progress, percent, closed, total, meta)}
        ${progress === 'bar' ? html`<div class="bar" aria-hidden="true"><span class="bar-fill" style=${styleMap({ width: `${percent}%` })}></span></div>` : nothing}
        ${this.panelOpen && this.customizable ? this.renderPanel() : nothing} ${total > 0 ? this.renderFilters(total, closed) : nothing}
        ${this.renderTasks(active)} ${this.readonly ? nothing : this.renderAdd()} ${this.renderArchive()}
        ${
          this.toast
            ? html`<div class="toast" role="status">
                <span class="toast-message">${this.toast.message}</span>
                <button class="toast-undo" type="button" @click=${this.undo}>Undo</button>
              </div>`
            : nothing
        }
      </section>
    `
  }

  private renderHeader(progress: TodoProgress, percent: number, closed: number, total: number, meta: string) {
    const ring = progress === 'ring' || progress === 'hero'
    const icon = this.headerIcon
    return html`
      <header class="header">
        ${
          ring
            ? html`<div class="ring" role="img" aria-label=${`${percent}% complete, ${closed} of ${total} tasks done`}>
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <circle class="ring-track" cx="24" cy="24" r="20" pathLength="100"></circle>
                  <circle class="ring-fill" cx="24" cy="24" r="20" pathLength="100" style=${styleMap({ strokeDasharray: `${percent} 100` })}></circle>
                </svg>
                <span class=${classMap({ 'ring-value': true, 'with-icon': !!icon && progress === 'ring' })} aria-hidden="true">
                  ${
                    total > 0 && closed === total
                      ? html`<svg class="ring-check pen" viewBox="0 0 24 24"><path d=${TICK}></path></svg>`
                      : progress === 'hero'
                        ? html`${percent}<small>%</small>`
                        : icon
                          ? renderTaskIcon(icon)
                          : percent
                  }
                </span>
              </div>`
            : nothing
        }
        ${icon && !ring ? html`<span class="list-icon" aria-hidden="true">${renderTaskIcon(icon)}</span>` : nothing}
        <div class="titles">
          ${
            this.heading
              ? html`<div class="heading" role="heading" aria-level=${Math.min(6, Math.max(1, Math.round(this.headingLevel) || 2))}>${this.heading}</div>`
              : nothing
          }
          <p class="meta" aria-live="polite">${meta}</p>
        </div>
        <div class="actions">
          <slot name="actions"></slot>
          ${
            this.customizable
              ? html`<button
                  class="customize"
                  type="button"
                  aria-label="Customize look"
                  aria-expanded=${this.panelOpen ? 'true' : 'false'}
                  aria-controls="panel"
                  @click=${() => (this.panelOpen = !this.panelOpen)}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 21.5a9.5 9.5 0 1 1 9.5-9.5c0 2.7-2.1 4-3.9 4h-1.9a1.9 1.9 0 0 0-1.4 3.2 1.4 1.4 0 0 1-2.3 2.3z"></path>
                    <circle class="dot" cx="7.5" cy="11.5" r="1.3"></circle>
                    <circle class="dot" cx="10.5" cy="7.3" r="1.3"></circle>
                    <circle class="dot" cx="15.5" cy="8.3" r="1.3"></circle>
                  </svg>
                </button>`
              : nothing
          }
        </div>
      </header>
    `
  }

  private renderFilters(total: number, closed: number) {
    const counts: Record<TodoFilter, number> = { all: total, active: total - closed, done: closed }
    return html`
      <div class="filters" role="group" aria-label="Show">
        ${FILTERS.map(
          ([filter, label]) => html`
            <button class="filter" type="button" aria-pressed=${this.filter === filter ? 'true' : 'false'} @click=${() => (this.filter = filter)}>
              ${label}<span class="count">${counts[filter]}</span>
            </button>
          `,
        )}
      </div>
    `
  }

  private renderTasks(active: TodoTask[]) {
    if (active.length === 0) {
      return html`<div class="empty"><slot name="empty">No tasks yet. Add your first one below.</slot></div>`
    }
    const visible = active.filter((task) =>
      this.filter === 'active' ? !task.done && !task.dropped : this.filter === 'done' ? task.done || task.dropped : true,
    )
    if (visible.length === 0) {
      return html`<p class="empty">${this.filter === 'done' ? 'Nothing crossed off yet. You’ve got this.' : 'Everything’s done. Enjoy the calm.'}</p>`
    }
    const reorderable = !this.readonly && this.filter === 'all' && visible.length > 1
    return html`
      <c2-reorder-list
        class="tasks"
        aria-label=${this.heading ? `${this.heading} tasks` : 'Tasks'}
        ?editable=${reorderable}
        @reorder=${this.handleReorder}
        @change=${(event: Event) => event.stopPropagation()}
      >
        ${repeat(
          visible,
          (task) => task.id,
          (task) => this.renderTask(task, reorderable),
        )}
      </c2-reorder-list>
    `
  }

  private renderMark(task: TodoTask): TemplateResult {
    const crossForDone = this.look.doneMark === 'cross'
    if (task.done) return html`<svg class="pen stroke" viewBox="0 0 24 24" aria-hidden="true"><path d=${crossForDone ? CROSS : TICK}></path></svg>`
    if (task.dropped) return html`<svg class="pen stroke dropped" viewBox="0 0 24 24" aria-hidden="true"><path d=${crossForDone ? DASH : CROSS}></path></svg>`
    return html`<svg class="pen open" viewBox="0 0 24 24" aria-hidden="true"><path d=${CIRCLE}></path></svg>`
  }

  private renderTask(task: TodoTask, reorderable: boolean) {
    const id = task.id!
    const icon = this.iconOf(task)
    const swipe = this.swipe?.id === id ? this.swipe : undefined
    const offset = swipe?.active ? swipe.dx : this.swipedId === id ? SWIPE_OPEN : 0
    const closed = !!task.done || !!task.dropped
    const expanded = this.expandedId === id
    const selected = this.panelOpen && this.customizable && this.selectedId === id
    const ink = task.ink && includes(todoPens, task.ink) ? task.ink : undefined
    const highlight = task.highlight && includes(todoHighlights, task.highlight) ? task.highlight : undefined
    const status = task.dropped ? `${task.label}, won’t do` : task.label
    return html`
      <div class="task-slot" data-reorder-key=${id} data-reorder-label=${task.label} data-swipe-row=${id}>
        ${
          this.readonly
            ? nothing
            : html`<div class=${classMap({ 'swipe-actions': true, visible: offset !== 0 })} aria-hidden="true">
                <span class="swipe-done" style=${styleMap({ opacity: String(Math.max(0, Math.min(1, offset / 90))) })}>
                  <svg class="pen" viewBox="0 0 24 24"><path d=${TICK}></path></svg>${task.done ? 'Undo' : 'Done'}
                </span>
                <span class="swipe-buttons">
                  <button class="swipe-archive" type="button" tabindex="-1" @click=${() => this.archiveTask(task)}>
                    <svg viewBox="0 0 24 24"><path d="M3.5 4.5h17v4h-17zM5 8.5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10M10 12.5h4"></path></svg>Archive
                  </button>
                  <button class="swipe-delete" type="button" tabindex="-1" @click=${() => this.removeTask(task)}>
                    <svg viewBox="0 0 24 24">
                      <path d="M3.5 6.5h17M9 6.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5.5 6.5l1 13A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5l1-13"></path></svg
                    >Delete
                  </button>
                </span>
              </div>`
        }
        <div
          class=${classMap({
            task: true,
            done: !!task.done,
            dropped: !!task.dropped,
            closed,
            selected,
            swiping: !!swipe?.active,
            [`ink-${ink}`]: !!ink,
            [`highlight-${highlight}`]: !!highlight,
          })}
          style=${styleMap({ transform: offset ? `translateX(${offset}px)` : '' })}
          @pointerdown=${(event: PointerEvent) => this.handleSwipeDown(event, task)}
          @pointermove=${this.handleSwipeMove}
          @pointerup=${(event: PointerEvent) => this.handleSwipeUp(event, task)}
          @pointercancel=${() => (this.swipe = undefined)}
          @keydown=${(event: KeyboardEvent) => this.handleRowKey(event, task)}
          @contextmenu=${(event: MouseEvent) => {
            if (this.readonly) return
            event.preventDefault()
            this.openMenu(task, false)
          }}
        >
          ${
            reorderable
              ? html`<span class="grip" title="Drag to reorder" aria-hidden="true"
                  ><svg viewBox="0 0 24 24">
                    <circle cx="9" cy="6" r="1.4"></circle>
                    <circle cx="15" cy="6" r="1.4"></circle>
                    <circle cx="9" cy="12" r="1.4"></circle>
                    <circle cx="15" cy="12" r="1.4"></circle>
                    <circle cx="9" cy="18" r="1.4"></circle>
                    <circle cx="15" cy="18" r="1.4"></circle></svg
                ></span>`
              : nothing
          }
          <button
            class="mark"
            type="button"
            role="checkbox"
            aria-checked=${task.done ? 'true' : 'false'}
            aria-label=${status}
            ?disabled=${this.readonly}
            @click=${() => this.toggleTask(task)}
          >
            ${this.renderMark(task)}
          </button>
          ${icon ? html`<span class="task-icon">${renderTaskIcon(icon)}</span>` : nothing}
          <div class="body">
            <button class="label" type="button" aria-expanded=${expanded ? 'true' : 'false'} @click=${() => this.openNote(task)}>
              <span class="label-text"
                >${task.label}${
                  task.done
                    ? html`<svg class="strike" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                        <path d=${STRIKE} vector-effect="non-scaling-stroke"></path>
                      </svg>`
                    : nothing
                }</span
              >
            </button>
            ${task.note && !expanded ? html`<p class="note">${task.note.split('\n')[0]}</p>` : nothing}
            ${
              expanded
                ? html`<textarea
                    class="note-input"
                    aria-label=${`Note for ${task.label}`}
                    rows=${Math.max(2, (task.note ?? '').split('\n').length)}
                    placeholder="Add a note: a quantity, an address, a link…"
                    .value=${task.note ?? ''}
                    ?readonly=${this.readonly}
                    @change=${(event: Event) => this.patchTask(task, { note: (event.target as HTMLTextAreaElement).value })}
                    @keydown=${(event: KeyboardEvent) => {
                      if (event.key !== 'Escape') return
                      event.stopPropagation()
                      ;(event.target as HTMLTextAreaElement).blur()
                      this.expandedId = undefined
                    }}
                  ></textarea>`
                : nothing
            }
          </div>
          ${task.due ? html`<span class=${classMap({ due: true, urgent: !!task.urgent && !closed })}>${task.due}</span>` : nothing}
          ${
            this.readonly
              ? nothing
              : html`<button
                  class=${classMap({ more: true, open: this.menuId === id })}
                  type="button"
                  aria-label=${`Actions for ${task.label}`}
                  aria-haspopup="menu"
                  aria-expanded=${this.menuId === id ? 'true' : 'false'}
                  @click=${() => this.openMenu(task, false)}
                  @keydown=${(event: KeyboardEvent) => {
                    if (event.key !== 'ArrowDown') return
                    event.preventDefault()
                    this.openMenu(task, true)
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="5.5" cy="12" r="1.5"></circle>
                    <circle cx="12" cy="12" r="1.5"></circle>
                    <circle cx="18.5" cy="12" r="1.5"></circle>
                  </svg>
                </button>`
          }
        </div>
        ${this.menuId === id ? this.renderMenu(task) : nothing}
      </div>
    `
  }

  private renderMenu(task: TodoTask) {
    const items: [MenuAction, string, string, string][] = [
      ['note', task.note ? 'Edit note' : 'Add a note', 'N', 'M4 5h16v11H9l-5 4z'],
      ['drop', task.dropped ? 'Undo won’t do' : 'Won’t do', 'X', 'M6.5 6.5l11 11M17.5 6.5l-11 11'],
      ['archive', 'Archive', 'E', 'M3.5 4.5h17v4h-17zM5 8.5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10M10 12.5h4'],
      ['delete', 'Delete', 'Del', 'M3.5 6.5h17M9 6.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5.5 6.5l1 13A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5l1-13'],
    ]
    if (this.customizable) items.splice(1, 0, ['style', 'Icon & colour', '', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'])
    return html`
      <div class="menu" role="menu" aria-label=${`Actions for ${task.label}`} @keydown=${(event: KeyboardEvent) => this.handleMenuKey(event, task)}>
        ${items.map(
          ([action, label, key, path]) => html`
            <button
              class=${classMap({ 'menu-item': true, danger: action === 'delete', separated: action === 'archive' })}
              type="button"
              role="menuitem"
              @click=${() => this.runMenu(task, action)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>
              <span class="menu-label">${label}</span>
              ${key ? html`<kbd>${key}</kbd>` : nothing}
            </button>
          `,
        )}
      </div>
    `
  }

  private renderAdd() {
    return html`
      <form class="add" @submit=${this.addTask}>
        <svg class="add-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
        <input
          class="add-input"
          type="text"
          aria-label="New task"
          .value=${this.draft}
          placeholder=${this.placeholder}
          @input=${(event: Event) => (this.draft = (event.target as HTMLInputElement).value)}
        />
        <button class="add-button" type="submit" ?disabled=${!this.draft.trim()}>Add</button>
      </form>
    `
  }

  private renderArchive() {
    const archived = this.tasks.filter((task) => task.archived)
    if (archived.length === 0) return nothing
    return html`
      <div class="archive">
        <button
          class="archive-toggle"
          type="button"
          aria-expanded=${this.showArchived ? 'true' : 'false'}
          @click=${() => (this.showArchived = !this.showArchived)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 4.5h17v4h-17zM5 8.5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10M10 12.5h4"></path></svg>
          <span>Archived · ${archived.length}</span>
          <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
        </button>
        ${
          this.showArchived
            ? html`<ul class="archived">
                ${archived.map(
                  (task) => html`
                    <li class="archived-task">
                      <span class="archived-label">${task.label}</span>
                      ${
                        this.readonly
                          ? nothing
                          : html`<button class="text-button" type="button" aria-label=${`Restore ${task.label}`} @click=${() => this.restoreTask(task)}>
                                Restore
                              </button>
                              <button class="text-button danger" type="button" aria-label=${`Delete ${task.label}`} @click=${() => this.removeTask(task)}>
                                Delete
                              </button>`
                      }
                    </li>
                  `,
                )}
              </ul>`
            : nothing
        }
      </div>
    `
  }

  private renderPanel() {
    const look = this.look
    const background = look.background ?? 'default'
    const progress = look.progress ?? this.progress
    const density = look.density ?? 'cozy'
    const doneMark = look.doneMark ?? 'tick'
    const selected = this.tasks.find((task) => task.id === this.selectedId && !task.archived)
    const radio = (checked: boolean) => (checked ? 'true' : 'false')
    return html`
      <div class="panel" id="panel" role="region" aria-label="Customize" @keydown=${this.handlePanelKey}>
        <div class="panel-head">
          <span class="panel-title">Customize</span>
          <button class="reset" type="button" ?disabled=${Object.keys(look).length === 0} @click=${() => this.resetLook()}>Reset</button>
        </div>

        <div class="field">
          <span class="field-label" id="background-label">Background</span>
          <div class="swatches" role="radiogroup" aria-labelledby="background-label">
            ${todoBackgrounds.map((option) => {
              const preset = option === 'default' ? undefined : PRESETS[option]
              return html`<button
                class="background-swatch"
                type="button"
                role="radio"
                aria-checked=${radio(background === option)}
                aria-label=${preset?.label ?? 'Default'}
                title=${preset?.label ?? 'Default'}
                style=${styleMap(preset ? { '--_swatch': preset.surface, '--_swatch-ink': preset.ink } : {})}
                @click=${() => this.setLook({ background: option })}
              >
                <span aria-hidden="true">Aa</span>
              </button>`
            })}
          </div>
        </div>

        <div class="field">
          <span class="field-label" id="pen-label">Pen</span>
          <div class="swatches" role="radiogroup" aria-labelledby="pen-label">
            ${todoPens.map(
              (pen) =>
                html`<button
                  class="pen-swatch pen-${pen}"
                  type="button"
                  role="radio"
                  aria-checked=${radio(look.pen === pen)}
                  aria-label=${PEN_LABELS[pen]}
                  title=${PEN_LABELS[pen]}
                  @click=${() => this.setLook({ pen })}
                ></button>`,
            )}
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <span class="field-label" id="mark-label">Done mark</span>
            <div class="segmented" role="radiogroup" aria-labelledby="mark-label">
              ${(['tick', 'cross'] as const).map(
                (option) =>
                  html`<button
                    class="segment"
                    type="button"
                    role="radio"
                    aria-checked=${radio(doneMark === option)}
                    @click=${() => this.setLook({ doneMark: option })}
                  >
                    <svg class="pen" viewBox="0 0 24 24" aria-hidden="true"><path d=${option === 'tick' ? TICK : CROSS}></path></svg>
                    ${option === 'tick' ? 'Tick' : 'Cross'}
                  </button>`,
              )}
            </div>
          </div>
          <div class="field">
            <span class="field-label" id="density-label">Density</span>
            <div class="segmented" role="radiogroup" aria-labelledby="density-label">
              ${(['cozy', 'compact'] as const).map(
                (option) =>
                  html`<button
                    class="segment"
                    type="button"
                    role="radio"
                    aria-checked=${radio(density === option)}
                    @click=${() => this.setLook({ density: option })}
                  >
                    ${option === 'cozy' ? 'Cozy' : 'Compact'}
                  </button>`,
              )}
            </div>
          </div>
        </div>

        <div class="field">
          <span class="field-label" id="progress-label">Progress</span>
          <div class="segmented" role="radiogroup" aria-labelledby="progress-label">
            ${PROGRESS_OPTIONS.map(
              ([option, label]) =>
                html`<button
                  class="segment"
                  type="button"
                  role="radio"
                  aria-checked=${radio(progress === option)}
                  @click=${() => this.setLook({ progress: option })}
                >
                  ${label}
                </button>`,
            )}
          </div>
        </div>

        ${this.readonly ? nothing : this.renderTaskEditor(selected)} ${this.storageKey ? html`<p class="saved">Saved in this browser</p>` : nothing}
      </div>
    `
  }

  private renderTaskEditor(task: TodoTask | undefined) {
    if (!task) {
      return html`<div class="field task-editor">
        <span class="field-label">Task</span>
        <p class="hint">Choose “Icon & colour” in a task’s ⋯ menu to give it an icon, a highlighter or a pen colour.</p>
      </div>`
    }
    const current = this.iconOf(task)
    const query = this.iconQuery.trim().toLowerCase()
    const matches = (icon: (typeof taskIconCatalog)[number]) =>
      !query || icon.name.includes(query) || icon.title.toLowerCase().includes(query) || icon.keywords.some((keyword) => keyword.startsWith(query))
    const groups = iconGroups.map((group) => ({ ...group, icons: group.icons.filter(matches) })).filter((group) => group.icons.length > 0)
    const names = groups.flatMap((group) => group.icons.map((icon) => icon.name))
    const focusable = current && names.includes(current) ? current : names[0]
    const radio = (checked: boolean) => (checked ? 'true' : 'false')
    return html`
      <div class="field task-editor">
        <span class="field-label">Task · <span class="editing">${task.label}</span></span>

        <span class="sub-label" id="highlight-label">Highlighter</span>
        <div class="swatches" role="radiogroup" aria-labelledby="highlight-label">
          <button
            class="highlight-swatch none"
            type="button"
            role="radio"
            aria-checked=${radio(!task.highlight)}
            aria-label="No highlighter"
            title="None"
            @click=${() => this.patchTask(task, { highlight: undefined })}
          ></button>
          ${todoHighlights.map(
            (highlight) =>
              html`<button
                class="highlight-swatch highlight-${highlight}"
                type="button"
                role="radio"
                aria-checked=${radio(task.highlight === highlight)}
                aria-label=${HIGHLIGHT_LABELS[highlight]}
                title=${HIGHLIGHT_LABELS[highlight]}
                @click=${() => this.patchTask(task, { highlight })}
              >
                <span aria-hidden="true">Aa</span>
              </button>`,
          )}
        </div>

        <span class="sub-label" id="ink-label">Text colour</span>
        <div class="swatches" role="radiogroup" aria-labelledby="ink-label">
          <button
            class="pen-swatch default"
            type="button"
            role="radio"
            aria-checked=${radio(!task.ink)}
            aria-label="Default text colour"
            title="Default"
            @click=${() => this.patchTask(task, { ink: undefined })}
          ></button>
          ${todoPens.map(
            (pen) =>
              html`<button
                class="pen-swatch pen-${pen}"
                type="button"
                role="radio"
                aria-checked=${radio(task.ink === pen)}
                aria-label=${`${PEN_LABELS[pen]} text`}
                title=${PEN_LABELS[pen]}
                @click=${() => this.patchTask(task, { ink: pen })}
              ></button>`,
          )}
        </div>

        <span class="sub-label">Icon</span>
        <div class="icon-tools">
          <button class="no-icon" type="button" aria-pressed=${current ? 'false' : 'true'} @click=${() => this.patchTask(task, { icon: undefined })}>
            No icon
          </button>
          <input
            class="icon-search"
            type="search"
            aria-label="Search icons"
            placeholder=${`Search ${taskIconCatalog.length} icons`}
            .value=${this.iconQuery}
            @input=${(event: Event) => (this.iconQuery = (event.target as HTMLInputElement).value)}
          />
        </div>
        <div class=${classMap({ 'icon-picker': true, [`ink-${task.ink}`]: !!task.ink })} @keydown=${this.moveIconFocus}>
          ${groups.map(
            (group) => html`
              <div class="icon-group" role="group" aria-label=${group.label}>
                <span class="icon-group-label" aria-hidden="true">${group.label}</span>
                <div class="icon-grid">
                  ${group.icons.map(
                    ({ name, title }) =>
                      html`<button
                        class="icon-option"
                        type="button"
                        aria-label=${title}
                        title=${title}
                        aria-pressed=${name === current ? 'true' : 'false'}
                        tabindex=${name === focusable ? 0 : -1}
                        @click=${() => this.patchTask(task, { icon: name })}
                      >
                        ${renderTaskIcon(name)}
                      </button>`,
                  )}
                </div>
              </div>
            `,
          )}
          ${groups.length === 0 ? html`<p class="hint">No icon matches “${this.iconQuery}”.</p>` : nothing}
        </div>
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-todo-list': TodoList
  }
}
