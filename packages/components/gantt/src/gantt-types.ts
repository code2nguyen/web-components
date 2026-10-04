/** Zoom level: one column per day, with week or month ticks above it. */
export type GanttScale = 'day' | 'week' | 'month'

/** `split` keeps the task list beside the timeline, `compact` drops it and puts each label above its bar. */
export type GanttLayout = 'auto' | 'split' | 'compact'

/** A semantic tone, or a slot of the categorical palette shared with `@c2n/chart` (`1` to `8`). */
export type GanttTone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * One row of the chart. Dates are calendar days: `'YYYY-MM-DD'` strings are read as written, never as instants,
 * and a `Date` is reduced to its local calendar day. `end` is inclusive, so a task from `2026-10-01` to
 * `2026-10-05` lasts five days.
 */
export interface GanttTaskConfig {
  /** Stable key. Selection, `collapsed`, `parent` and `dependencies` all refer to tasks by it. */
  id: string
  label: string
  start?: string | Date
  /** Inclusive. Omitted means a one-day task; ignored for milestones and for groups, whose children set their span. */
  end?: string | Date
  /** Share of the work done, from 0 to 1. */
  progress?: number
  /** Id of the task this one belongs to. A task with children is a group. */
  parent?: string
  /** Ids of the tasks that must finish before this one starts (finish-to-start). */
  dependencies?: string[] | string
  /** A zero-length task, drawn as a diamond on its `start` day. */
  milestone?: boolean
  tone?: GanttTone
  /** Anything else is carried through to events and renderers untouched. */
  [key: string]: unknown
}

/** Detail of `task-click`: the task as it was given, and its element in markup mode. */
export interface GanttTaskEventDetail {
  id: string
  task: GanttTaskConfig
  /** The `c2-gantt-task` the task came from, when the chart reads its children. */
  element?: HTMLElement
}

/** Detail of `selection-change`. */
export interface GanttSelectionChangeEventDetail {
  /** Id of the selected task, or `null` when nothing is selected. */
  value: string | null
  task: GanttTaskConfig | null
  element?: HTMLElement
}

/** Detail of `group-toggle`. `collapsed` already holds the new state. */
export interface GanttGroupToggleEventDetail {
  id: string
  expanded: boolean
}

/** Detail of `task-hover`: the task under the pointer, or nulls when the pointer leaves the bars. */
export interface GanttTaskHoverEventDetail {
  id: string | null
  task: GanttTaskConfig | null
}

/** What `renderTooltip` receives. Dates are `YYYY-MM-DD`. */
export interface GanttTooltipContext {
  id: string
  task: GanttTaskConfig
  start: string
  end: string
  /** Length in days, both ends included. */
  days: number
  progress: number
  milestone: boolean
  group: boolean
  /** The predecessors, as tasks. */
  dependencies: GanttTaskConfig[]
}

/** What `renderLabel` receives for each cell of the task list. */
export interface GanttLabelContext {
  id: string
  task: GanttTaskConfig
  /** Nesting level, from 0 for a top-level task. */
  depth: number
  group: boolean
}
