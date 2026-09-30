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
import type { ReorderEventDetail, ReorderSwipeAction, ReorderSwipeActionEventDetail } from '@c2n/reorder-list'
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

/** Colour palettes: each sets the six highlighters and the five pens, in a light and a dark variant. */
export const todoPalettes = ['classic', 'pastel', 'vivid', 'earth', 'ocean', 'retro'] as const
export type TodoPalette = (typeof todoPalettes)[number]

/** What the customize panel changes. Every key is optional: a missing key keeps the authored look. */
export interface TodoListLook {
  background?: TodoBackground
  palette?: TodoPalette
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
type MenuAction = 'note' | 'icon' | 'drop' | 'archive' | 'delete'
type Submenu = 'highlight' | 'ink'

const STORAGE_PREFIX = 'c2-todo-list:'
const ICON_COLUMNS = 8
const TOAST_MS = 5000
// Swiping a row left reveals Archive and Delete, swiping it right checks it. The list cancels the inner list's own
// delete and applies each action to its data.
const SWIPE_ACTIONS: ReorderSwipeAction[] = [
  { id: 'archive', label: 'Archive', side: 'end', tone: 'warning', icon: 'archive' },
  { id: 'delete', label: 'Delete', side: 'end', tone: 'danger', icon: 'delete' },
  { id: 'toggle', label: 'Done', side: 'start', tone: 'success', icon: 'check' },
]
const v = (name: string) => `--c2-todo-list__${name}`

interface Preset {
  label: string
  surface: string
  ink: string
  muted: string
  line: string
  soft: string
  dark?: boolean
}

// Each background sets its surfaces and its text colour; the pens and highlighters on it come from a palette. The values are set inline on an element inside the shadow root, so a viewer's choice
// wins over the variables an application sets on the host; `Reset` removes them and hands the look back.
const PRESETS: Record<Exclude<TodoBackground, 'default'>, Preset> = {
  paper: {
    label: 'Paper',
    surface: '#fbf8f1',
    ink: '#2a2622',
    muted: '#6f665b',
    line: '#e6dfd2',
    soft: '#f3eee3',
  },
  mint: {
    label: 'Mint',
    surface: '#f1faf5',
    ink: '#10281f',
    muted: '#43645a',
    line: '#cfe6da',
    soft: '#e2f3ea',
  },
  sky: {
    label: 'Sky',
    surface: '#f2f7fe',
    ink: '#0f1f35',
    muted: '#475b76',
    line: '#d3e1f4',
    soft: '#e4eefb',
  },
  blush: {
    label: 'Blush',
    surface: '#fdf3f5',
    ink: '#2d1520',
    muted: '#744857',
    line: '#f1d6de',
    soft: '#f9e5ea',
  },
  sand: {
    label: 'Sand',
    surface: '#f8f1e4',
    ink: '#2b2014',
    muted: '#6d5a41',
    line: '#e8dcc6',
    soft: '#f0e6d3',
  },
  night: {
    label: 'Night',
    surface: '#1a1a1f',
    ink: '#f1f0ee',
    muted: '#a3a0a8',
    line: '#2e2e35',
    soft: '#26262c',
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
    [v('on-accent--color')]: preset.dark ? '#0b1220' : '#ffffff',
  }
  if (preset.dark) vars[v('container--box-shadow')] = '0 24px 60px rgba(0, 0, 0, 0.45)'
  return vars
}

interface Palette {
  label: string
  /** How much highlighter ink is mixed into a light background, in percent; dark backgrounds take `darkStrength`. */
  strength: number
  darkStrength: number
  highlights: Record<TodoHighlight, string>
  light: Record<TodoPen, string>
  dark: Record<TodoPen, string>
}

// Every palette is checked by script: each pen, and each background's text colour, reads at 4.5:1 or better on every
// background preset, plain and under each of the palette's highlighters, in the matching light or dark variant.
const PALETTES: Record<TodoPalette, Palette> = {
  classic: {
    label: 'Classic',
    strength: 22,
    darkStrength: 18,
    highlights: { yellow: '#facc15', green: '#22c55e', blue: '#3b82f6', pink: '#ec4899', orange: '#f97316', violet: '#8b5cf6' },
    light: { blue: '#0255bb', red: '#ad1f1f', green: '#0c645e', violet: '#6d34d2', graphite: '#585860' },
    dark: { blue: '#67abff', red: '#f88686', green: '#2dd4bf', violet: '#b198fa', graphite: '#a5a5ad' },
  },
  pastel: {
    label: 'Pastel',
    strength: 50,
    darkStrength: 18,
    highlights: { yellow: '#fde68a', green: '#a7f3d0', blue: '#bfdbfe', pink: '#fbcfe8', orange: '#fed7aa', violet: '#ddd6fe' },
    light: { blue: '#3552a0', red: '#a8334a', green: '#2c6656', violet: '#62469a', graphite: '#4f5460' },
    dark: { blue: '#a3bdf7', red: '#f5a8b3', green: '#95dcc4', violet: '#cdbbf4', graphite: '#cfd3da' },
  },
  vivid: {
    label: 'Vivid',
    strength: 30,
    darkStrength: 18,
    highlights: { yellow: '#facc15', green: '#22c55e', blue: '#0ea5e9', pink: '#f43f5e', orange: '#f97316', violet: '#a855f7' },
    light: { blue: '#1b48c7', red: '#a31919', green: '#116032', violet: '#7420be', graphite: '#3f3f46' },
    dark: { blue: '#6aaefc', red: '#fb8484', green: '#4ade80', violet: '#c996fd', graphite: '#d4d4d8' },
  },
  earth: {
    label: 'Earth',
    strength: 30,
    darkStrength: 18,
    highlights: { yellow: '#d4a017', green: '#8fae7e', blue: '#7d98b3', pink: '#c98a8a', orange: '#d2764a', violet: '#9c7aa6' },
    light: { blue: '#34507a', red: '#923926', green: '#465f33', violet: '#664673', graphite: '#554b44' },
    dark: { blue: '#aec0da', red: '#eba993', green: '#bdd3a2', violet: '#d1b7dc', graphite: '#dad1c8' },
  },
  ocean: {
    label: 'Ocean',
    strength: 34,
    darkStrength: 18,
    highlights: { yellow: '#f6d98b', green: '#7dd3c0', blue: '#7cc4f5', pink: '#f7a1a1', orange: '#fbbf8a', violet: '#b8b3f0' },
    light: { blue: '#0b4a82', red: '#a83341', green: '#0c615d', violet: '#5344a6', graphite: '#434f60' },
    dark: { blue: '#93c8ff', red: '#ffa8b2', green: '#84e3d9', violet: '#bdb5ff', graphite: '#cfd8e3' },
  },
  retro: {
    label: 'Retro',
    strength: 28,
    darkStrength: 18,
    highlights: { yellow: '#e0b83a', green: '#9bb34a', blue: '#2fa4a0', pink: '#d6456f', orange: '#f08a3c', violet: '#8e5bb5' },
    light: { blue: '#1d4972', red: '#953421', green: '#385f1d', violet: '#643687', graphite: '#473d35' },
    dark: { blue: '#94bcea', red: '#f4a592', green: '#bade90', violet: '#d4aeef', graphite: '#dcd3ca' },
  },
}

function paletteVars(palette: Palette, dark: boolean): Record<string, string> {
  const pens = dark ? palette.dark : palette.light
  const vars: Record<string, string> = {
    [v('accent--color')]: pens.blue,
    [v('dropped--color')]: pens.red,
    '--_highlight-strength': `${dark ? palette.darkStrength : palette.strength}%`,
  }
  for (const pen of todoPens) vars[v(`pen-${pen}--color`)] = pens[pen]
  for (const highlight of todoHighlights) vars[v(`highlight-${highlight}--color`)] = palette.highlights[highlight]
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
  if (includes(todoPalettes, value.palette)) look.palette = value.palette
  if (includes(todoPens, value.pen)) look.pen = value.pen
  if (value.doneMark === 'tick' || value.doneMark === 'cross') look.doneMark = value.doneMark
  if (PROGRESS_OPTIONS.some(([option]) => option === value.progress)) look.progress = value.progress as TodoProgress
  if (value.density === 'cozy' || value.density === 'compact') look.density = value.density
  return look
}

/** Whether a `#rgb`, `#rrggbb` or `rgb()` colour is dark enough to call for light pens. */
function isDark(color: string): boolean {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color)?.[1]
  const full = hex?.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex
  const channels = full
    ? [0, 2, 4].map((index) => Number.parseInt(full.slice(index, index + 2), 16))
    : color
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number)
  if (!channels || channels.length < 3) return false
  const [r, g, b] = channels.map((channel) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2
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

interface Toast {
  message: string
  undo: () => void
}

/**
 * A to-do list with the feel of a paper one: tasks are plain text, checked off with a hand-drawn tick (or cross) and
 * a pen stroke through the text. Progress shows as a ring beside the heading, a bar, or a large hero ring. Click a
 * task to add a note, drag a row to reorder it, and swipe it left to archive or delete it or right to check it (the
 * swipe and the reordering come from `c2-reorder-list`). The row's ⋯ menu (also a right-click, and the keys N, I, X,
 * E and Delete) holds the same actions plus the task's icon, highlighter and text colour, each changed in place.
 * Archived tasks collect in a section at the bottom, and every removal can be undone.
 *
 * With `customizable`, a palette button swaps the tasks for a panel that styles the whole list: the background
 * (whose text colour and pens follow from it), the pen, the done mark, the density and the progress style. With
 * `storage-key` those choices are remembered in `localStorage`.
 *
 * The swipe actions are drawn by the inner `c2-reorder-list`: recolour them with its
 * `--c2-reorder-list__swipe-action__{warning,danger,success}--background-color` variables, set on this element.
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

  /** Shows the palette button and its customize panel, where the viewer styles the whole list. */
  @property({ type: Boolean }) customizable = false

  /**
   * Remembers the viewer's customization in `localStorage` under `c2-todo-list:<storage-key>`. Give every list on a
   * site its own key.
   */
  @property({ attribute: 'storage-key' }) storageKey = ''

  /** With `storage-key`, also remembers the tasks, which then win over the `tasks` the page provides. */
  @property({ type: Boolean, attribute: 'persist-tasks' }) persistTasks = false

  /** Tasks cannot be checked, added, reordered, swiped, removed or edited. The look can still be customized. */
  @property({ type: Boolean }) readonly = false

  /** Placeholder of the add field. */
  @property() placeholder = 'Add a task — a note after a dash'

  /** The viewer's customization. Set it to apply a look from script; the panel and `storage-key` keep it up to date. */
  @property({ attribute: false }) look: TodoListLook = {}

  @state() private filter: TodoFilter = 'all'
  @state() private panelOpen = false
  @state() private expandedId: string | undefined
  @state() private menuId: string | undefined
  @state() private submenu: Submenu | undefined
  @state() private iconPickerId: string | undefined
  @state() private toast: Toast | undefined
  @state() private showArchived = false
  @state() private draft = ''
  @state() private iconQuery = ''
  /** Whether the default background turned out dark (a dark theme), which picks a palette's dark variant. */
  @state() private darkSurface = false

  private loadedKey: string | undefined
  private pendingFocus: (() => void) | undefined
  private toastTimer: ReturnType<typeof setTimeout> | undefined

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('pointerdown', this.handleOutsidePointer, true)
    document.addEventListener('keydown', this.handleDocumentEscape)
  }

  override disconnectedCallback(): void {
    document.removeEventListener('pointerdown', this.handleOutsidePointer, true)
    document.removeEventListener('keydown', this.handleDocumentEscape)
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
    if (this.look.palette && (!this.look.background || this.look.background === 'default')) {
      // The resolved variable, not the painted colour, which is mid-transition right after a change.
      const surface = getComputedStyle(this).getPropertyValue(v('container--background-color')).trim()
      const dark = isDark(surface || '#ffffff')
      if (dark !== this.darkSurface) this.darkSurface = dark
    }
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

  private handleSwipeAction(event: CustomEvent<ReorderSwipeActionEventDetail>): void {
    // The list owns its tasks, so it cancels the inner list's own delete and applies the action to the data instead.
    event.preventDefault()
    event.stopPropagation()
    const task = this.tasks.find((item) => item.id === event.detail.item.key)
    if (!task) return
    const id = event.detail.action.id
    if (id === 'archive') this.archiveTask(task)
    else if (id === 'delete') this.removeTask(task)
    else if (id === 'toggle') this.toggleTask(task)
  }

  // Menus, popovers and notes ----------------------------------------------------------------------------------------

  private closeRow(task: TodoTask): void {
    if (this.menuId === task.id) this.closeMenus()
    if (this.iconPickerId === task.id) this.iconPickerId = undefined
    if (this.expandedId === task.id) this.expandedId = undefined
  }

  private closeMenus(): void {
    this.menuId = undefined
    this.submenu = undefined
  }

  private readonly handleOutsidePointer = (event: PointerEvent): void => {
    if (!this.menuId && !this.iconPickerId) return
    const path = event.composedPath()
    const within = (...classes: string[]) => path.some((node) => node instanceof HTMLElement && classes.some((name) => node.classList.contains(name)))
    if (this.menuId && !within('menu', 'more')) this.closeMenus()
    if (this.iconPickerId && !within('icon-popover', 'task-icon')) this.iconPickerId = undefined
  }

  /** Escape closes an open menu or icon picker wherever focus is, e.g. after a menu opened on hover. */
  private readonly handleDocumentEscape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    const task = this.tasks.find((item) => item.id === (this.menuId ?? this.iconPickerId))
    if (!task) return
    if (this.menuId && this.submenu) {
      this.submenu = undefined
    } else if (this.menuId) {
      this.closeMenus()
      this.focusRowButton(task, '.more')
    } else {
      this.closeIconPicker(task)
    }
  }

  private openMenu(task: TodoTask, focusFirst: boolean): void {
    this.iconPickerId = undefined
    this.submenu = undefined
    this.menuId = this.menuId === task.id ? undefined : task.id
    if (this.menuId && focusFirst) this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.menu > [role="menuitem"]')?.focus()
  }

  private focusRowButton(task: TodoTask, selector: string): void {
    this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>(`[data-reorder-key="${task.id}"] ${selector}`)?.focus()
  }

  private handleMenuKey(event: KeyboardEvent, task: TodoTask): void {
    const target = event.target as HTMLElement
    if (target.closest('.submenu')) return
    const items = [...this.renderRoot.querySelectorAll<HTMLElement>('.menu > [role="menuitem"]')]
    const index = items.indexOf(target)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closeMenus()
      this.focusRowButton(task, '.more')
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      this.submenu = undefined
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    } else if ((event.key === 'ArrowRight' || event.key === 'ArrowLeft') && target.dataset.submenu) {
      event.preventDefault()
      event.stopPropagation()
      this.openSubmenu(target.dataset.submenu as Submenu, true)
    } else if (event.key === 'Tab') {
      this.closeMenus()
    }
  }

  private openSubmenu(name: Submenu, focus: boolean): void {
    this.submenu = name
    if (focus) this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.submenu [aria-checked="true"], .submenu [role="menuitemradio"]')?.focus()
  }

  private handleSubmenuKey(event: KeyboardEvent): void {
    const swatches = [...this.renderRoot.querySelectorAll<HTMLElement>('.submenu [role="menuitemradio"]')]
    const index = swatches.indexOf(event.target as HTMLElement)
    const back = () => {
      const name = this.submenu
      this.submenu = undefined
      this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>(`.menu [data-submenu="${name}"]`)?.focus()
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      back()
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault()
      event.stopPropagation()
      const next = index + (event.key === 'ArrowRight' ? 1 : -1)
      if (next < 0) back()
      else swatches[Math.min(next, swatches.length - 1)]?.focus()
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
    } else if (event.key === 'Tab') {
      this.closeMenus()
    }
  }

  private runMenu(task: TodoTask, action: MenuAction): void {
    this.closeMenus()
    if (action === 'note') this.openNote(task)
    if (action === 'icon') this.openIconPicker(task, '.more')
    if (action === 'drop') this.toggleDropped(task)
    if (action === 'archive') this.archiveTask(task)
    if (action === 'delete') this.removeTask(task)
  }

  private openIconPicker(task: TodoTask, returnTo: string): void {
    if (this.readonly) return
    this.closeMenus()
    this.iconQuery = ''
    this.iconReturn = returnTo
    this.iconPickerId = this.iconPickerId === task.id ? undefined : task.id
    if (this.iconPickerId) {
      this.pendingFocus = () => {
        this.renderRoot.querySelector<HTMLElement>('.icon-popover .icon-search')?.focus()
        // Open on the current icon's category rather than the top of the set.
        const picker = this.renderRoot.querySelector<HTMLElement>('.icon-popover .icon-picker')
        const current = picker?.querySelector<HTMLElement>('.icon-option[aria-pressed="true"]')
        const group = current?.closest<HTMLElement>('.icon-group')
        if (picker && group) picker.scrollTop = group.offsetTop - picker.offsetTop
      }
    }
  }

  private iconReturn = '.more'

  private closeIconPicker(task: TodoTask): void {
    this.iconPickerId = undefined
    const selector = this.iconOf(task) ? '.task-icon' : this.iconReturn
    this.focusRowButton(task, selector)
  }

  private openNote(task: TodoTask): void {
    this.expandedId = this.expandedId === task.id ? undefined : task.id
    if (this.expandedId && !this.readonly) this.pendingFocus = () => this.renderRoot.querySelector<HTMLTextAreaElement>('.note-input')?.focus()
  }

  private handleRowKey(event: KeyboardEvent, task: TodoTask): void {
    const target = event.target as HTMLElement
    if (target.closest('textarea, input, .menu, .icon-popover') || event.metaKey || event.ctrlKey || event.altKey || this.readonly) return
    const key = event.key.toLowerCase()
    if (key === 'e') this.archiveTask(task)
    else if (key === 'delete' || key === 'backspace') this.removeTask(task)
    else if (key === 'x') this.toggleDropped(task)
    else if (key === 'n') this.openNote(task)
    else if (key === 'i') this.openIconPicker(task, '.more')
    else if (key === 'contextmenu' || (event.shiftKey && key === 'f10')) this.openMenu(task, true)
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  private handlePanelKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    this.closePanel()
  }

  private openPanel(): void {
    this.closeMenus()
    this.iconPickerId = undefined
    this.panelOpen = !this.panelOpen
    if (this.panelOpen) this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.panel [role="radio"][aria-checked="true"]')?.focus()
  }

  private resetFromPanel(): void {
    this.resetLook()
    // Reset disables itself; keep the keyboard in the panel.
    this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.panel [role="radio"][aria-checked="true"]')?.focus()
  }

  private closePanel(): void {
    this.panelOpen = false
    this.pendingFocus = () => this.renderRoot.querySelector<HTMLElement>('.customize')?.focus()
  }

  private moveIconFocus(event: KeyboardEvent, task: TodoTask): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.closeIconPicker(task)
      return
    }
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
    // A background preset or a chosen palette brings the palette's checked pens and highlighters; with neither, the
    // list keeps the application's variables and the theme.
    const palette = preset || this.look.palette ? PALETTES[this.look.palette ?? 'classic'] : undefined
    const dark = preset ? !!preset.dark : this.darkSurface
    const containerStyle: Record<string, string> = {
      ...(preset ? presetVars(preset) : {}),
      ...(palette ? paletteVars(palette, dark) : {}),
      ...(this.look.density === 'compact' ? COMPACT_VARS : {}),
      ...(this.look.pen ? { [v('accent--color')]: `var(${v(`pen-${this.look.pen}--color`)}, ${PEN_DEFAULTS[this.look.pen]})` } : {}),
    }
    const allDone = total > 0 && closed === total
    const urgent = active.filter((task) => task.urgent && !task.done && !task.dropped).length
    const summary = total === 0 ? 'No tasks yet' : allDone ? 'All done. Nice work.' : `${closed} of ${total} done`
    const meta = urgent && !allDone ? `${summary} · ${urgent} urgent` : summary
    const panel = this.panelOpen && this.customizable
    const classes = {
      container: true,
      [`progress-${progress}`]: true,
      [`background-${this.look.background ?? 'default'}`]: true,
      'all-done': allDone,
      readonly: this.readonly,
      customizing: panel,
    }

    return html`
      <section class=${classMap(classes)} style=${styleMap(containerStyle)}>
        ${this.renderHeader(progress, percent, closed, total, meta)}
        ${progress === 'bar' ? html`<div class="bar" aria-hidden="true"><span class="bar-fill" style=${styleMap({ width: `${percent}%` })}></span></div>` : nothing}
        ${
          panel
            ? this.renderPanel()
            : html`<div class="view">
                ${total > 0 ? this.renderFilters(total, closed) : nothing} ${this.renderTasks(active)} ${this.readonly ? nothing : this.renderAdd()}
                ${this.renderArchive()}
              </div>`
        }
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
                  @click=${this.openPanel}
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
        ?swipeable=${!this.readonly}
        .swipeActions=${SWIPE_ACTIONS}
        @reorder=${this.handleReorder}
        @swipe-action=${this.handleSwipeAction}
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
    const closed = !!task.done || !!task.dropped
    const expanded = this.expandedId === id
    const ink = task.ink && includes(todoPens, task.ink) ? task.ink : undefined
    const highlight = task.highlight && includes(todoHighlights, task.highlight) ? task.highlight : undefined
    const status = task.dropped ? `${task.label}, won’t do` : task.label
    return html`
      <div class="task-slot" data-reorder-key=${id} data-reorder-label=${task.label}>
        <div
          class=${classMap({
            task: true,
            done: !!task.done,
            dropped: !!task.dropped,
            closed,
            active: this.menuId === id || this.iconPickerId === id,
            [`ink-${ink}`]: !!ink,
            [`highlight-${highlight}`]: !!highlight,
          })}
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
          ${
            icon
              ? this.readonly
                ? html`<span class="task-icon">${renderTaskIcon(icon)}</span>`
                : html`<button
                    class="task-icon"
                    type="button"
                    aria-label=${`Change icon for ${task.label}`}
                    aria-haspopup="dialog"
                    aria-expanded=${this.iconPickerId === id ? 'true' : 'false'}
                    @click=${() => this.openIconPicker(task, '.task-icon')}
                  >
                    ${renderTaskIcon(icon)}
                  </button>`
              : nothing
          }
          <div class="body">
            <span class="label" @click=${() => this.openNote(task)}
              ><span class="label-text"
                >${task.label}${
                  task.done
                    ? html`<svg class="strike" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                        <path d=${STRIKE} vector-effect="non-scaling-stroke"></path>
                      </svg>`
                    : nothing
                }</span
              ></span
            >
            ${task.note && !expanded ? html`<p class="note" @click=${() => this.openNote(task)}>${task.note.split('\n')[0]}</p>` : nothing}
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
        ${this.menuId === id ? this.renderMenu(task) : nothing} ${this.iconPickerId === id ? this.renderIconPopover(task) : nothing}
      </div>
    `
  }

  private renderMenu(task: TodoTask) {
    const item = (action: MenuAction, label: string, key: string, path: string, classes: Record<string, boolean> = {}) => html`
      <button
        class=${classMap({ 'menu-item': true, ...classes })}
        type="button"
        role="menuitem"
        @mouseenter=${() => (this.submenu = undefined)}
        @click=${() => this.runMenu(task, action)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d=${path}></path></svg>
        <span class="menu-label">${label}</span>
        ${key ? html`<kbd>${key}</kbd>` : nothing}
      </button>
    `
    const trigger = (name: Submenu, label: string, swatch: string) => html`
      <button
        class=${classMap({ 'menu-item': true, 'has-submenu': true, open: this.submenu === name })}
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded=${this.submenu === name ? 'true' : 'false'}
        data-submenu=${name}
        @mouseenter=${() => this.openSubmenu(name, false)}
        @click=${() => this.openSubmenu(name, true)}
      >
        <span class=${`menu-swatch ${swatch}`} aria-hidden="true"></span>
        <span class="menu-label">${label}</span>
        <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"></path></svg>
      </button>
    `
    return html`
      <div class="menu" role="menu" aria-label=${`Actions for ${task.label}`} @keydown=${(event: KeyboardEvent) => this.handleMenuKey(event, task)}>
        ${item('note', task.note ? 'Edit note' : 'Add a note', 'N', 'M4 5h16v11H9l-5 4z')}
        ${item('icon', this.iconOf(task) ? 'Change icon' : 'Add an icon', 'I', 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z')}
        ${trigger('highlight', 'Highlight', task.highlight ? `highlight-swatch highlight-${task.highlight}` : 'highlight-swatch none')}
        ${trigger('ink', 'Text colour', task.ink ? `pen-swatch pen-${task.ink}` : 'pen-swatch default')}
        ${item('drop', task.dropped ? 'Undo won’t do' : 'Won’t do', 'X', 'M6.5 6.5l11 11M17.5 6.5l-11 11')}
        ${item('archive', 'Archive', 'E', 'M3.5 4.5h17v4h-17zM5 8.5v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10M10 12.5h4', { separated: true })}
        ${item('delete', 'Delete', 'Del', 'M3.5 6.5h17M9 6.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5.5 6.5l1 13A1.5 1.5 0 0 0 8 21h8a1.5 1.5 0 0 0 1.5-1.5l1-13', {
          danger: true,
        })}
        ${this.submenu ? this.renderSubmenu(task, this.submenu) : nothing}
      </div>
    `
  }

  private renderSubmenu(task: TodoTask, name: Submenu) {
    const choose = (patch: Partial<TodoTask>) => {
      this.patchTask(task, patch)
    }
    const radio = (checked: boolean) => (checked ? 'true' : 'false')
    const swatches =
      name === 'highlight'
        ? [
            html`<button
              class="highlight-swatch none"
              type="button"
              role="menuitemradio"
              aria-checked=${radio(!task.highlight)}
              aria-label="No highlight"
              title="None"
              @click=${() => choose({ highlight: undefined })}
            ></button>`,
            ...todoHighlights.map(
              (highlight) =>
                html`<button
                  class="highlight-swatch highlight-${highlight}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${radio(task.highlight === highlight)}
                  aria-label=${HIGHLIGHT_LABELS[highlight]}
                  title=${HIGHLIGHT_LABELS[highlight]}
                  @click=${() => choose({ highlight })}
                >
                  <span aria-hidden="true">Aa</span>
                </button>`,
            ),
          ]
        : [
            html`<button
              class="pen-swatch default"
              type="button"
              role="menuitemradio"
              aria-checked=${radio(!task.ink)}
              aria-label="Default text colour"
              title="Default"
              @click=${() => choose({ ink: undefined })}
            ></button>`,
            ...todoPens.map(
              (pen) =>
                html`<button
                  class="pen-swatch pen-${pen}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${radio(task.ink === pen)}
                  aria-label=${`${PEN_LABELS[pen]} text`}
                  title=${PEN_LABELS[pen]}
                  @click=${() => choose({ ink: pen })}
                ></button>`,
            ),
          ]
    return html`<div
      class=${`submenu submenu-${name}`}
      role="menu"
      aria-label=${name === 'highlight' ? 'Highlight' : 'Text colour'}
      @keydown=${this.handleSubmenuKey}
      @mouseenter=${() => (this.submenu = name)}
    >
      ${swatches}
    </div>`
  }

  private renderIconPopover(task: TodoTask) {
    const current = this.iconOf(task)
    const query = this.iconQuery.trim().toLowerCase()
    const matches = (icon: (typeof taskIconCatalog)[number]) =>
      !query || icon.name.includes(query) || icon.title.toLowerCase().includes(query) || icon.keywords.some((keyword) => keyword.startsWith(query))
    const groups = iconGroups.map((group) => ({ ...group, icons: group.icons.filter(matches) })).filter((group) => group.icons.length > 0)
    const names = groups.flatMap((group) => group.icons.map((icon) => icon.name))
    const focusable = current && names.includes(current) ? current : names[0]
    const pick = (icon: TaskIconName | undefined) => {
      this.patchTask(task, { icon })
      this.closeIconPicker({ ...task, icon })
    }
    return html`
      <div
        class=${classMap({ 'icon-popover': true, [`ink-${task.ink}`]: !!task.ink })}
        role="dialog"
        aria-label=${`Icon for ${task.label}`}
        @keydown=${(event: KeyboardEvent) => this.moveIconFocus(event, task)}
      >
        <div class="icon-tools">
          <input
            class="icon-search"
            type="search"
            aria-label="Search icons"
            placeholder=${`Search ${taskIconCatalog.length} icons`}
            .value=${this.iconQuery}
            @input=${(event: Event) => (this.iconQuery = (event.target as HTMLInputElement).value)}
          />
          <button class="no-icon" type="button" aria-pressed=${current ? 'false' : 'true'} @click=${() => pick(undefined)}>No icon</button>
        </div>
        <div class="icon-picker">
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
                        @click=${() => pick(name)}
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
    const radio = (checked: boolean) => (checked ? 'true' : 'false')
    return html`
      <div class="panel" id="panel" role="region" aria-label="Customize the list" @keydown=${this.handlePanelKey}>
        <div class="panel-head">
          <span class="panel-title">Customize the list</span>
          <button class="reset" type="button" ?disabled=${Object.keys(look).length === 0} @click=${this.resetFromPanel}>Reset</button>
        </div>
        <p class="hint">Applies to the whole list. Style one task from its ⋯ menu, or click its icon.</p>

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
          <span class="field-label" id="palette-label">Palette</span>
          <div class="palettes" role="radiogroup" aria-labelledby="palette-label">
            ${todoPalettes.map((option) => {
              const choice = PALETTES[option]
              const selected = (look.palette ?? (look.background && look.background !== 'default' ? 'classic' : undefined)) === option
              return html`<button
                class="palette-swatch"
                type="button"
                role="radio"
                aria-checked=${radio(selected)}
                @click=${() => this.setLook({ palette: option })}
              >
                <span class="palette-chips" aria-hidden="true">
                  ${todoHighlights.map((highlight) => html`<span class="palette-chip" style=${styleMap({ background: choice.highlights[highlight] })}></span>`)}
                </span>
                <span class="palette-name">${choice.label}</span>
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

        <div class="panel-foot">
          ${this.storageKey ? html`<span class="saved">Saved in this browser</span>` : html`<span></span>`}
          <button class="done-button" type="button" @click=${this.closePanel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"></path></svg>
            Back to the list
          </button>
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
