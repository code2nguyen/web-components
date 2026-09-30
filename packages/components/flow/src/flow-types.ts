/** State of one step of the flow. The same vocabulary as `c2-steps`. */
export type FlowStatus =
  /** Not reached yet. */
  | 'pending'
  /** Reached, but waiting rather than working — a manual approval gate. */
  | 'current'
  /** Under way: the marker spins and the edges into the step animate. */
  | 'running'
  /** Finished successfully. */
  | 'success'
  /** Finished and failed. Its outgoing edges turn to the error colour. */
  | 'error'
  /** Finished with something worth reading. */
  | 'warning'
  /** Deliberately not run. Its edges are drawn dotted. */
  | 'skipped'

/** Main axis of the layout: columns from left to right, or rows from top to bottom. */
export type FlowDirection = 'LR' | 'TB'

/** How an edge is drawn: a smooth curve, or orthogonal segments with rounded corners. */
export type FlowEdgeType = 'bezier' | 'step'

export interface FlowPoint {
  x: number
  y: number
}

export interface FlowSize {
  width: number
  height: number
}

/** One step of the flow. */
export interface FlowNode<T = unknown> {
  /** Stable identity. Edges, the saved layout and the `node:<id>` slot refer to it. */
  id: string
  /** Name shown on the node and in the hover card. */
  label: string
  /** Defaults to `pending`. */
  status?: FlowStatus
  /** Secondary line under the label: a command, a job kind. */
  description?: string
  /** Short trailing value on the node, such as a duration. */
  meta?: string
  /** Rows of the default hover card, as `[label, value]` pairs or an object. */
  details?: [string, string][] | Record<string, string>
  /** Anything else the application needs in its render functions. */
  data?: T
}

/** A dependency: `target` comes after `source`. Cycles are allowed and drawn as back edges. */
export interface FlowEdge {
  source: string
  target: string
}

/** Positions keyed by node id, in canvas pixels (the top-left corner of each node). */
export type FlowLayout = Record<string, FlowPoint>

/** Handed to `renderNode` and `renderCard`. */
export interface FlowRenderContext<T = unknown> {
  node: FlowNode<T>
  status: FlowStatus
  selected: boolean
  direction: FlowDirection
}

/** Returns the body of one node or one hover card: a Lit template, a DOM node or a string. */
export type FlowRenderer = (context: FlowRenderContext) => unknown

/** Handed to `renderContextMenu`. */
export interface FlowContextMenuContext<T = unknown> {
  /** The node that was right-clicked, or `null` for the canvas. */
  node: FlowNode<T> | null
  /** The built-in rows (details, zoom, fit, direction, auto layout, lock) for that spot. */
  defaultItems: unknown
  /** Viewport coordinates the menu opens at. */
  x: number
  y: number
}

/**
 * Returns the rows of the context menu. `undefined` keeps the built-in rows; `null` lets the browser show its own
 * menu. To extend the built-in menu, return your rows together with `context.defaultItems`.
 */
export type FlowContextMenuRenderer = (context: FlowContextMenuContext) => unknown

export interface FlowNodeEventDetail<T = unknown> {
  node: FlowNode<T>
}

export interface FlowSelectionChangeDetail<T = unknown> {
  selected: string | null
  node: FlowNode<T> | null
}

/** Why the layout changed: a drag or keyboard nudge, an auto layout, a direction switch, or `setLayout()`. */
export type FlowLayoutChangeReason = 'drag' | 'reset' | 'direction' | 'api'

export interface FlowLayoutChangeDetail {
  /** Every node's position, or `null` when the flow went back to auto layout. */
  positions: FlowLayout | null
  direction: FlowDirection
  reason: FlowLayoutChangeReason
}

export interface FlowMenuSelectDetail<T = unknown> {
  /** The `value` of the activated `c2-menu-item`. */
  value: string
  checked: boolean
  data: unknown
  /** The node the menu was opened on, or `null` for the canvas. */
  node: FlowNode<T> | null
}
