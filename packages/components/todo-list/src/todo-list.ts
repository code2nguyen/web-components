import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { html as staticHtml, unsafeStatic, type StaticValue } from 'lit/static-html.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/task-icons'
import { isTaskIconName, taskIconCatalog, taskIconTag, type TaskIconName } from '@c2n/task-icons/task-icon-names.js'
import { suggestTaskIcon } from '@c2n/task-icons/suggest-task-icon.js'
import styles from './todo-list.scss?inline'

/** Colour of a task's icon tile, and the accent choices of the customize panel. */
export const todoColors = ['blue', 'teal', 'green', 'amber', 'orange', 'pink', 'violet', 'slate'] as const
export type TodoColor = (typeof todoColors)[number]

/** Background presets of the customize panel. `default` follows the component's CSS variables and the theme. */
export const todoBackgrounds = ['default', 'mint', 'peach', 'lilac', 'rose', 'sky', 'midnight'] as const
export type TodoBackground = (typeof todoBackgrounds)[number]

export type TodoProgress = 'ring' | 'bar' | 'hero' | 'none'
export type TodoDensity = 'cozy' | 'compact'
export type TodoFilter = 'all' | 'active' | 'done'

export interface TodoTask {
  /** Stable identity. Generated when missing. */
  id?: string
  label: string
  done?: boolean
  /** A `@c2n/task-icons` name (`mail`, `run`, `cook`…). Suggested from the label when missing. */
  icon?: string
  /** Tile colour. Assigned in turn when missing. */
  color?: TodoColor
  /** Short due text shown as a chip: `Today`, `Fri`, `9:30`. */
  due?: string
  /** Draws the due chip in the accent colour. */
  urgent?: boolean
}

/** What the customize panel changes. Every key is optional: a missing key keeps the authored look. */
export interface TodoListLook {
  background?: TodoBackground
  accent?: TodoColor
  progress?: TodoProgress
  density?: TodoDensity
}

export interface TodoTaskEventDetail {
  task: TodoTask
  tasks: TodoTask[]
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
  'task-change': CustomEvent<TodoTaskEventDetail>
  'tasks-change': CustomEvent<TodoTasksChangeEventDetail>
  'look-change': CustomEvent<TodoLookChangeEventDetail>
}

export interface TodoList {
  addEventListener: TypedAddEventListener<TodoList, TodoListEventMap>
  removeEventListener: TypedRemoveEventListener<TodoList, TodoListEventMap>
}

const STORAGE_PREFIX = 'c2-todo-list:'
const FALLBACK_ICON: TaskIconName = 'note'
const ICON_COLUMNS = 8
const v = (name: string) => `--c2-todo-list__${name}`

// Values each background preset writes onto the list's container. They are set inline on an element inside the
// shadow root, so a viewer's choice wins over the variables an application sets on the host, and `Reset` (which
// removes them) hands the look back to the application and the theme.
const BACKGROUND_PRESETS: Record<Exclude<TodoBackground, 'default'>, { label: string; swatch: string; ground: string; vars: Record<string, string> }> = {
  mint: { label: 'Mint', swatch: '#f4fbf8', ground: '#cfe9dd', vars: light('#f4fbf8', '#0f2a22', '#3d5c52', '#d3ebe0', '#e2f3eb', '#b9dccb') },
  peach: { label: 'Peach', swatch: '#fff8f2', ground: '#f6dcc8', vars: light('#fff8f2', '#2b1a10', '#6b4a36', '#f3dfcf', '#fbeadf', '#ecc9b0') },
  lilac: { label: 'Lilac', swatch: '#f9f7ff', ground: '#e0d9fa', vars: light('#f9f7ff', '#1e1537', '#574b7a', '#e6e0fa', '#efebfd', '#d2c8f3') },
  rose: { label: 'Rose', swatch: '#fff7fa', ground: '#f6d5e1', vars: light('#fff7fa', '#2d1320', '#6e4459', '#f5dde6', '#fbe8ef', '#ecc3d3') },
  sky: { label: 'Sky', swatch: '#f5f9ff', ground: '#d6e6fb', vars: light('#f5f9ff', '#0f1f33', '#44566d', '#dde9f8', '#e8f0fb', '#c3d6ee') },
  midnight: {
    label: 'Midnight',
    swatch: '#18181b',
    ground: '#3f3f46',
    vars: {
      ...light('#18181b', '#f4f4f5', '#a1a1aa', '#2e2e33', '#232327', '#3f3f46'),
      [v('container--border')]: '1px solid #27272a',
      [v('container--box-shadow')]: '0 24px 60px rgba(0, 0, 0, 0.45)',
      [v('accent--color')]: '#5aa3ff',
      [v('on-accent--color')]: '#0b1220',
      [v('swatch-blue--color')]: '#5aa3ff',
      [v('swatch-teal--color')]: '#2dd4bf',
      [v('swatch-green--color')]: '#4ade80',
      [v('swatch-amber--color')]: '#fbbf24',
      [v('swatch-orange--color')]: '#fb923c',
      [v('swatch-pink--color')]: '#f472b6',
      [v('swatch-violet--color')]: '#a78bfa',
      [v('swatch-slate--color')]: '#a1a1aa',
    },
  },
}

function light(surface: string, ink: string, muted: string, track: string, chip: string, line: string): Record<string, string> {
  return {
    [v('container--background-color')]: surface,
    [v('container--color')]: ink,
    [v('container--border')]: `1px solid ${line}`,
    [v('meta--color')]: muted,
    [v('label__done--color')]: muted,
    [v('track--color')]: track,
    [v('chip--background-color')]: chip,
    [v('row__hover--background-color')]: chip,
    [v('row__selected--background-color')]: chip,
    [v('panel--background-color')]: chip,
    [v('check--border-color')]: line,
    [v('add--border-color')]: line,
  }
}

const COMPACT_VARS: Record<string, string> = {
  [v('row--padding')]: '6px 8px',
  [v('tile--size')]: '30px',
  [v('tile--border-radius')]: '8px',
  [v('icon--size')]: '16px',
  [v('check--size')]: '20px',
  [v('container--gap')]: '12px',
}

const COLOR_LABELS: Record<TodoColor, string> = {
  blue: 'Blue',
  teal: 'Teal',
  green: 'Green',
  amber: 'Amber',
  orange: 'Orange',
  pink: 'Pink',
  violet: 'Violet',
  slate: 'Slate',
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

const iconTags = new Map<TaskIconName, StaticValue>()
function renderTaskIcon(name: TaskIconName): TemplateResult {
  let tag = iconTags.get(name)
  if (!tag) {
    tag = unsafeStatic(taskIconTag(name))
    iconTags.set(name, tag)
  }
  return staticHtml`<${tag} class="icon"></${tag}>`
}

let idCounter = 0
function newTaskId(): string {
  idCounter += 1
  return `task-${Date.now().toString(36)}-${idCounter}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Keep only the keys of a stored look that are still valid, so a stale or edited entry cannot break the list. */
function sanitizeLook(value: unknown): TodoListLook {
  if (!isRecord(value)) return {}
  const look: TodoListLook = {}
  if ((todoBackgrounds as readonly unknown[]).includes(value.background)) look.background = value.background as TodoBackground
  if ((todoColors as readonly unknown[]).includes(value.accent)) look.accent = value.accent as TodoColor
  if (PROGRESS_OPTIONS.some(([option]) => option === value.progress)) look.progress = value.progress as TodoProgress
  if (value.density === 'cozy' || value.density === 'compact') look.density = value.density
  return look
}

function sanitizeTasks(value: unknown): TodoTask[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((task): task is TodoTask => isRecord(task) && typeof task.label === 'string')
}

/**
 * A to-do list that shows its progress at a glance: a ring beside the title (or a bar, or a large hero ring), tasks
 * with a coloured icon tile each, filters, and an add field that picks a fitting icon from what you type. With
 * `customizable` a palette button opens a panel where the viewer changes the background, the accent, the progress
 * style, the density and each task's icon and colour; with `storage-key` those choices are remembered in
 * `localStorage`.
 *
 * Task icons come from `@c2n/task-icons`.
 *
 * @tag c2-todo-list
 *
 * @slot actions - Extra controls at the end of the header, before the customize button.
 * @slot empty - Content shown when the list has no tasks at all. Defaults to a short sentence.
 *
 * @event {CustomEvent<TodoTaskEventDetail>} task-toggle - A task was checked or unchecked. `detail.task` is the updated task.
 * @event {CustomEvent<TodoTaskEventDetail>} task-add - A task was added from the add field.
 * @event {CustomEvent<TodoTaskEventDetail>} task-remove - A task was deleted. `detail.task` is the removed task.
 * @event {CustomEvent<TodoTaskEventDetail>} task-change - A task's icon or colour was changed in the customize panel.
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
 * @cssproperty {color} [--c2-todo-list__meta--color=#71717a] - Colour of the progress summary and panel labels.
 * @cssproperty {pixel} [--c2-todo-list__meta--font-size=12px] - Font size of the progress summary.
 * @cssproperty {color} [--c2-todo-list__accent--color=#0265dc] - Progress, checked boxes, the add button and urgent chips.
 * @cssproperty {color} [--c2-todo-list__on-accent--color=#ffffff] - Check marks and text drawn on the accent colour.
 * @cssproperty {color} [--c2-todo-list__track--color=#e4e4e7] - Unfilled part of the progress ring and bar.
 * @cssproperty {pixel} [--c2-todo-list__ring--size=44px] - Size of the progress ring beside the heading.
 * @cssproperty {number} [--c2-todo-list__ring--stroke-width=4.5] - Stroke of the progress ring, in units of its 48x48 canvas.
 * @cssproperty {pixel} [--c2-todo-list__hero-ring--size=120px] - Size of the hero progress ring.
 * @cssproperty {number} [--c2-todo-list__hero-ring--stroke-width=7] - Stroke of the hero ring, in units of its 48x48 canvas.
 * @cssproperty {pixel} [--c2-todo-list__bar--height=8px] - Height of the progress bar.
 * @cssproperty {color} [--c2-todo-list__chip--background-color=#f4f4f5] - Background of the filter tabs and due chips.
 * @cssproperty {spacing} [--c2-todo-list__row--padding=10px 8px] - Padding of a task row.
 * @cssproperty {pixel} [--c2-todo-list__row--gap=12px] - Space between the parts of a task row.
 * @cssproperty {border-radius} [--c2-todo-list__row--border-radius=8px] - Corner radius of a task row.
 * @cssproperty {color} [--c2-todo-list__row__hover--background-color=#fafafa] - Background of a hovered task row.
 * @cssproperty {color} [--c2-todo-list__row__selected--background-color=#f4f4f5] - Background of the task being customized.
 * @cssproperty {pixel} [--c2-todo-list__tile--size=36px] - Size of a task's icon tile.
 * @cssproperty {border-radius} [--c2-todo-list__tile--border-radius=10px] - Corner radius of a task's icon tile.
 * @cssproperty {pixel} [--c2-todo-list__icon--size=18px] - Size of the icon inside a tile.
 * @cssproperty {pixel} [--c2-todo-list__check--size=22px] - Size of the round check box.
 * @cssproperty {color} [--c2-todo-list__check--border-color=#d4d4d8] - Border of an unchecked check box.
 * @cssproperty {pixel} [--c2-todo-list__label--font-size=14px] - Font size of a task label.
 * @cssproperty {color} [--c2-todo-list__label__done--color=#71717a] - Colour of a finished task's label.
 * @cssproperty {color} [--c2-todo-list__add--border-color=#d4d4d8] - Colour of the dashed border around the add field.
 * @cssproperty {color} [--c2-todo-list__panel--background-color=#fafafa] - Background of the customize panel.
 * @cssproperty {border-radius} [--c2-todo-list__panel--border-radius=8px] - Corner radius of the customize panel.
 * @cssproperty {outline} [--c2-todo-list__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of every control.
 * @cssproperty {duration} [--c2-todo-list--transition-duration=200ms] - Duration of the check, strike-through and progress animations.
 * @cssproperty {color} [--c2-todo-list__swatch-blue--color=#0265dc] - The `blue` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-teal--color=#0f766e] - The `teal` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-green--color=#15803d] - The `green` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-amber--color=#a16207] - The `amber` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-orange--color=#ea580c] - The `orange` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-pink--color=#db2777] - The `pink` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-violet--color=#7c3aed] - The `violet` task and accent colour.
 * @cssproperty {color} [--c2-todo-list__swatch-slate--color=#52525b] - The `slate` task and accent colour.
 */
@customElement('c2-todo-list')
export class TodoList extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Title of the list. */
  @property() heading = ''

  /** Heading level (1-6) the title is announced with. */
  @property({ type: Number, attribute: 'heading-level' }) headingLevel = 2

  /** The tasks. Accepts a JSON array in the attribute. The list updates it as the user checks, adds and removes tasks. */
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

  /** Tasks cannot be checked, added, removed or edited. The look can still be customized. */
  @property({ type: Boolean }) readonly = false

  /** Placeholder of the add field. */
  @property() placeholder = 'Add a task'

  /** The viewer's customization. Set it to apply a look from script; the panel and `storage-key` keep it up to date. */
  @property({ attribute: false }) look: TodoListLook = {}

  @state() private filter: TodoFilter = 'all'
  @state() private panelOpen = false
  @state() private selectedId: string | undefined
  @state() private draft = ''
  @state() private iconQuery = ''

  private loadedKey: string | undefined
  private pendingFocus: (() => void) | undefined

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

  private commitTasks(tasks: TodoTask[], event: (detail: TodoTaskEventDetail) => CustomEvent<TodoTaskEventDetail>, task: TodoTask): void {
    this.tasks = tasks
    this.persist()
    this.dispatchEvent(event({ task, tasks }))
    this.dispatchEvent(new CustomEvent<TodoTasksChangeEventDetail>('tasks-change', { detail: { tasks } }))
  }

  private setLook(patch: TodoListLook): void {
    this.look = sanitizeLook({ ...this.look, ...patch })
    this.persist()
    this.dispatchEvent(new CustomEvent<TodoLookChangeEventDetail>('look-change', { detail: { look: this.look } }))
  }

  private iconOf(task: TodoTask): TaskIconName {
    if (task.icon && isTaskIconName(task.icon)) return task.icon
    return suggestTaskIcon(task.label) ?? FALLBACK_ICON
  }

  private colorOf(task: TodoTask, index: number): TodoColor {
    return task.color && (todoColors as readonly string[]).includes(task.color) ? task.color : todoColors[index % todoColors.length]
  }

  private toggleTask(task: TodoTask): void {
    if (this.readonly) return
    const updated = { ...task, done: !task.done }
    this.commitTasks(
      this.tasks.map((item) => (item === task ? updated : item)),
      (detail) => new CustomEvent('task-toggle', { detail }),
      updated,
    )
  }

  private removeTask(task: TodoTask): void {
    if (this.readonly) return
    const index = this.tasks.indexOf(task)
    const tasks = this.tasks.filter((item) => item !== task)
    if (this.selectedId === task.id) this.selectedId = undefined
    this.commitTasks(tasks, (detail) => new CustomEvent('task-remove', { detail }), task)
    // Keep the keyboard where it was: on the next task's check box, else the previous one, else the add field.
    this.pendingFocus = () => {
      const checks = [...this.renderRoot.querySelectorAll<HTMLElement>('.check')]
      const target = checks[Math.min(index, checks.length - 1)] ?? this.renderRoot.querySelector<HTMLElement>('.add-input')
      target?.focus()
    }
  }

  private addTask(event: Event): void {
    event.preventDefault()
    const label = this.draft.trim()
    if (!label || this.readonly) return
    const task: TodoTask = { id: newTaskId(), label, done: false, icon: this.iconOf({ label }), color: todoColors[this.tasks.length % todoColors.length] }
    this.draft = ''
    if (this.filter === 'done') this.filter = 'all'
    this.commitTasks([...this.tasks, task], (detail) => new CustomEvent('task-add', { detail }), task)
  }

  private patchTask(task: TodoTask, patch: Partial<TodoTask>): void {
    if (this.readonly) return
    const updated = { ...task, ...patch }
    this.commitTasks(
      this.tasks.map((item) => (item === task ? updated : item)),
      (detail) => new CustomEvent('task-change', { detail }),
      updated,
    )
  }

  private selectTask(task: TodoTask): void {
    this.selectedId = task.id
    this.panelOpen = true
  }

  private togglePanel(): void {
    this.panelOpen = !this.panelOpen
  }

  private closePanel(event: KeyboardEvent): void {
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

  override render() {
    const tasks = this.tasks
    const total = tasks.length
    const done = tasks.filter((task) => task.done).length
    const ratio = total ? done / total : 0
    const percent = Math.round(ratio * 100)
    const progress = this.look.progress ?? this.progress
    const background = this.look.background && this.look.background !== 'default' ? BACKGROUND_PRESETS[this.look.background] : undefined
    const containerStyle: Record<string, string> = {
      ...(background?.vars ?? {}),
      ...(this.look.density === 'compact' ? COMPACT_VARS : {}),
      ...(this.look.accent ? { [v('accent--color')]: `var(${v(`swatch-${this.look.accent}--color`)})` } : {}),
    }
    const allDone = total > 0 && done === total
    const summary = total === 0 ? 'No tasks yet' : allDone ? 'All done. Nice work.' : `${done} of ${total} done`
    const urgent = tasks.filter((task) => task.urgent && !task.done).length
    const meta = urgent && !allDone ? `${summary} · ${urgent} urgent` : summary

    return html`
      <section class=${classMap({ container: true, [`progress-${progress}`]: true, 'all-done': allDone })} style=${styleMap(containerStyle)}>
        ${this.renderHeader(progress, percent, done, total, meta)}
        ${
          progress === 'bar'
            ? html`<div class="bar" aria-hidden="true"><span class="bar-fill" style=${styleMap({ width: `${percent}%` })}></span></div>`
            : nothing
        }
        ${this.panelOpen && this.customizable ? this.renderPanel() : nothing} ${total > 0 ? this.renderFilters(total, done) : nothing} ${this.renderTasks()}
        ${this.readonly ? nothing : this.renderAdd()}
      </section>
    `
  }

  private renderHeader(progress: TodoProgress, percent: number, done: number, total: number, meta: string) {
    const ring = progress === 'ring' || progress === 'hero'
    const progressLabel = `${percent}% complete, ${done} of ${total} tasks done`
    return html`
      <header class="header">
        ${
          ring
            ? html`<div class="ring" role="img" aria-label=${progressLabel}>
                <svg viewBox="0 0 48 48" aria-hidden="true">
                  <circle class="ring-track" cx="24" cy="24" r="20" pathLength="100"></circle>
                  <circle class="ring-fill" cx="24" cy="24" r="20" pathLength="100" style=${styleMap({ strokeDasharray: `${percent} 100` })}></circle>
                </svg>
                <span class="ring-value" aria-hidden="true">
                  ${
                    total > 0 && done === total
                      ? html`<svg class="ring-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>`
                      : progress === 'hero'
                        ? html`${percent}<small>%</small>`
                        : percent
                  }
                </span>
              </div>`
            : nothing
        }
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
                  @click=${this.togglePanel}
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

  private renderFilters(total: number, done: number) {
    const counts: Record<TodoFilter, number> = { all: total, active: total - done, done }
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

  private renderTasks() {
    const indexed = this.tasks.map((task, index) => ({ task, index }))
    const visible = indexed.filter(({ task }) => (this.filter === 'active' ? !task.done : this.filter === 'done' ? !!task.done : true))
    if (this.tasks.length === 0) {
      return html`<div class="empty"><slot name="empty">No tasks yet. Add your first one below.</slot></div>`
    }
    if (visible.length === 0) {
      return html`<p class="empty">${this.filter === 'done' ? 'Nothing finished yet. You’ve got this.' : 'Everything’s done. Enjoy the calm.'}</p>`
    }
    return html`
      <ul class="tasks">
        ${repeat(
          visible,
          ({ task }) => task.id,
          ({ task, index }) => this.renderTask(task, index),
        )}
      </ul>
    `
  }

  private renderTask(task: TodoTask, index: number) {
    const color = this.colorOf(task, index)
    const selected = this.panelOpen && this.customizable && task.id === this.selectedId
    const editable = this.customizable && !this.readonly
    const icon = renderTaskIcon(this.iconOf(task))
    return html`
      <li class=${classMap({ task: true, done: !!task.done, selected })}>
        <button
          class="check"
          type="button"
          role="checkbox"
          aria-checked=${task.done ? 'true' : 'false'}
          aria-label=${task.label}
          ?disabled=${this.readonly}
          @click=${() => this.toggleTask(task)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>
        </button>
        ${
          editable
            ? html`<button
                class="tile color-${color}"
                type="button"
                aria-label=${`Change icon for ${task.label}`}
                aria-pressed=${selected ? 'true' : 'false'}
                @click=${() => this.selectTask(task)}
              >
                ${icon}
              </button>`
            : html`<span class="tile color-${color}">${icon}</span>`
        }
        <span class="label">${task.label}</span>
        ${task.due ? html`<span class=${classMap({ due: true, urgent: !!task.urgent && !task.done })}>${task.due}</span>` : nothing}
        ${
          this.readonly
            ? nothing
            : html`<button class="remove" type="button" aria-label=${`Delete ${task.label}`} @click=${() => this.removeTask(task)}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"></path></svg>
              </button>`
        }
      </li>
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

  private renderPanel() {
    const look = this.look
    const background = look.background ?? 'default'
    const progress = look.progress ?? this.progress
    const density = look.density ?? 'cozy'
    const selectedIndex = this.tasks.findIndex((task) => task.id === this.selectedId)
    const selected = selectedIndex >= 0 ? this.tasks[selectedIndex] : undefined
    return html`
      <div class="panel" id="panel" role="region" aria-label="Customize" @keydown=${this.closePanel}>
        <div class="panel-head">
          <span class="panel-title">Customize</span>
          <button class="reset" type="button" ?disabled=${Object.keys(look).length === 0} @click=${() => this.resetLook()}>Reset</button>
        </div>

        <div class="field">
          <span class="field-label" id="background-label">Background</span>
          <div class="swatches" role="radiogroup" aria-labelledby="background-label">
            ${todoBackgrounds.map((option) => {
              const preset = option === 'default' ? undefined : BACKGROUND_PRESETS[option]
              return html`<button
                class="background-swatch"
                type="button"
                role="radio"
                aria-checked=${background === option ? 'true' : 'false'}
                aria-label=${preset?.label ?? 'Default'}
                title=${preset?.label ?? 'Default'}
                style=${styleMap(preset ? { '--_swatch': preset.swatch, '--_ground': preset.ground } : {})}
                @click=${() => this.setLook({ background: option })}
              ></button>`
            })}
          </div>
        </div>

        <div class="field">
          <span class="field-label" id="accent-label">Accent</span>
          <div class="swatches" role="radiogroup" aria-labelledby="accent-label">
            ${todoColors.map(
              (color) =>
                html`<button
                  class="color-swatch color-${color}"
                  type="button"
                  role="radio"
                  aria-checked=${look.accent === color ? 'true' : 'false'}
                  aria-label=${COLOR_LABELS[color]}
                  title=${COLOR_LABELS[color]}
                  @click=${() => this.setLook({ accent: color })}
                ></button>`,
            )}
          </div>
        </div>

        <div class="field-row">
          <div class="field">
            <span class="field-label" id="progress-label">Progress</span>
            <div class="segmented" role="radiogroup" aria-labelledby="progress-label">
              ${PROGRESS_OPTIONS.map(
                ([option, label]) =>
                  html`<button
                    class="segment"
                    type="button"
                    role="radio"
                    aria-checked=${progress === option ? 'true' : 'false'}
                    @click=${() => this.setLook({ progress: option })}
                  >
                    ${label}
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
                    aria-checked=${density === option ? 'true' : 'false'}
                    @click=${() => this.setLook({ density: option })}
                  >
                    ${option === 'cozy' ? 'Cozy' : 'Compact'}
                  </button>`,
              )}
            </div>
          </div>
        </div>

        ${this.readonly ? nothing : this.renderTaskEditor(selected, selectedIndex)}
        ${this.storageKey ? html`<p class="saved">Saved in this browser</p>` : nothing}
      </div>
    `
  }

  private renderTaskEditor(task: TodoTask | undefined, index: number) {
    if (!task) {
      return html`<div class="field task-editor">
        <span class="field-label">Task icon</span>
        <p class="hint">Select a task’s icon to change it.</p>
      </div>`
    }
    const current = this.iconOf(task)
    const color = this.colorOf(task, index)
    const query = this.iconQuery.trim().toLowerCase()
    const icons = query
      ? taskIconCatalog.filter(
          ({ name, title, keywords }) => name.includes(query) || title.toLowerCase().includes(query) || keywords.some((keyword) => keyword.startsWith(query)),
        )
      : taskIconCatalog
    const focusable = icons.some(({ name }) => name === current) ? current : icons[0]?.name
    return html`
      <div class="field task-editor">
        <span class="field-label">Task icon · <span class="editing">${task.label}</span></span>
        <input
          class="icon-search"
          type="search"
          aria-label="Search icons"
          placeholder=${`Search ${taskIconCatalog.length} icons`}
          .value=${this.iconQuery}
          @input=${(event: Event) => (this.iconQuery = (event.target as HTMLInputElement).value)}
        />
        <div class="icon-grid color-${color}" role="group" aria-label="Icons" @keydown=${this.moveIconFocus}>
          ${icons.map(
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
          ${icons.length === 0 ? html`<p class="hint">No icon matches “${this.iconQuery}”.</p>` : nothing}
        </div>
        <div class="swatches" role="radiogroup" aria-label="Icon colour">
          ${todoColors.map(
            (option) =>
              html`<button
                class="color-swatch small color-${option}"
                type="button"
                role="radio"
                aria-checked=${color === option ? 'true' : 'false'}
                aria-label=${COLOR_LABELS[option]}
                title=${COLOR_LABELS[option]}
                @click=${() => this.patchTask(task, { color: option })}
              ></button>`,
          )}
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
