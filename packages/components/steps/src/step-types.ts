/** State of a single step. */
export type StepStatus =
  /** Not reached yet. */
  | 'pending'
  /** The step the process is on, but not doing work — a wizard's active page. */
  | 'current'
  /** Under way: the marker spins. */
  | 'running'
  /** Finished successfully. */
  | 'success'
  /** Finished and failed. */
  | 'error'
  /** Finished with something worth reading. */
  | 'warning'
  /** Deliberately not run. */
  | 'skipped'

/** How the marker is drawn. */
export type StepsMarker =
  /** A glyph per status: check, cross, triangle, spinner, dot, dash. */
  | 'icon'
  /** The step's dotted position, coloured by status. */
  | 'number'
  /** No marker column at all. */
  | 'none'

/** One node of the `steps` property, the data-driven alternative to `c2-step` children. */
export interface StepNode {
  /**
   * Stable identity. A step keeps its DOM — and so its expanded state — across renders that reuse the same `id`,
   * and `updateStep` addresses a step by it. Without one a step is identified by its position, which is enough for
   * a trace that only ever grows at the end.
   */
  id?: string
  /** Primary text. */
  label?: string
  /** Secondary text beside the label, dimmed — a path, an id, a short note. */
  detail?: string
  /** Text at the end of the row: a duration, a count, a timestamp. */
  trailing?: string
  /**
   * State of this step. Left out on a step that has `children`, it is rolled up from them: the most urgent thing
   * inside wins, so a parent reports that it is running, or that something under it failed, on its own.
   */
  status?: StepStatus
  /** Sub-steps. A step that has them is a group: its own row is the summary, and these are the detail. */
  children?: StepNode[]
  /** Starts this group folded away. A group is expanded by default: every step in the list is a row you can see. */
  collapsed?: boolean
}

/** What a renderer is handed for one step. */
export interface StepContext {
  /** The node from the `steps` array. */
  node: StepNode
  /** Depth of nesting; `0` at the top level. */
  level: number
  /** 1-based position among its siblings. */
  position: number
  /** Dotted position through the whole tree — `3.1` is the first child of the third step. */
  path: string
  /** The status in effect, rolled up and `current`-derived. */
  status: StepStatus
}

/** Replaces part of a row's content. Returns anything Lit can render. */
export type StepRenderer = (context: StepContext) => unknown
