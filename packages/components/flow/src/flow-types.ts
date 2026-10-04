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

/** Edge of the canvas the `actions` toolbar sits on. */
export type FlowActionsPlacement = 'top' | 'right' | 'bottom' | 'left'

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
  /**
   * Where the node goes, in canvas pixels (its top-left corner). The flow places it there instead of where the auto
   * layout would, unless the user has already moved it: a saved or dragged position wins over the one the node first
   * arrived with. Changing the value later moves the node. This is how an application puts the node it creates for a
   * `node-add` event where the user asked for it.
   */
  position?: FlowPoint
  /** Anything else the application needs in its render functions. */
  data?: T
}

/** A dependency: `target` comes after `source`. Cycles are allowed and drawn as back edges. */
export interface FlowEdge {
  source: string
  target: string
  /**
   * Short text drawn halfway along the edge, such as the "yes" and "no" of a decision's branches. It is read out with
   * the relations of both nodes. In an `editable` flow the user edits it in place (`edge-edit`).
   */
  label?: string
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
  /** The edge that was right-clicked (only possible in an `editable` flow), or `null`. */
  edge: FlowEdge | null
  /**
   * The built-in rows for that spot: the view controls on the canvas (preceded by **Add node** in an `editable`
   * flow), **Rename** and **Delete** on a node and **Edit label** and **Delete** on an edge of an `editable` flow,
   * `nothing` on a node of a read-only one.
   */
  defaultItems: unknown
  /** Viewport coordinates the menu opens at. */
  x: number
  y: number
}

/**
 * Returns the rows of the context menu. `undefined` keeps the built-in rows (none on a node, so the browser shows its
 * own menu there); `null` lets the browser show its own menu. To extend the canvas menu, return your rows together
 * with `context.defaultItems`.
 */
export type FlowContextMenuRenderer = (context: FlowContextMenuContext) => unknown

export interface FlowNodeEventDetail<T = unknown> {
  node: FlowNode<T>
}

export interface FlowSelectionChangeDetail<T = unknown> {
  selected: string | null
  node: FlowNode<T> | null
}

/**
 * Why the layout changed: a drag or keyboard nudge, an auto layout, a direction switch, `setLayout()`, or (in an
 * `editable` flow) a node added or removed, which pins every position so the rest of the diagram stays put.
 */
export type FlowLayoutChangeReason = 'drag' | 'reset' | 'direction' | 'api' | 'edit'

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
  /** The edge the menu was opened on (`editable` flows only), or `null`. */
  edge: FlowEdge | null
}

/**
 * `node-add`: the user asked for a new node in an `editable` flow. The flow does not create it: append a node with
 * `position` to `nodes` (and, when `source` is set, an edge from `source` to it to `edges`).
 */
export interface FlowNodeAddDetail {
  /** Top-left corner for the new node, in canvas pixels, ready to use as its `position`. */
  position: FlowPoint
  /** Set when the node was asked for by dropping a connection on empty canvas: the node the connection started from. */
  source?: string
}

/** `node-edit`: the user renamed a node with the inline editor. Update the node's `label`. */
export interface FlowNodeEditDetail {
  id: string
  /** The new label, trimmed. Never empty and never the current label. */
  label: string
}

/** `node-delete`: the user asked to delete a node. Remove it, and the edges that touch it. */
export interface FlowNodeDeleteDetail {
  id: string
}

/**
 * `edge-add` and `edge-delete`: the user connected two nodes, or asked to delete an edge. `edge-add` never names the
 * same node twice nor a pair that is already connected.
 */
export interface FlowEdgeEventDetail {
  source: string
  target: string
}

/**
 * `edge-edit`: the user changed the label of the edge from `source` to `target` with the inline editor. Set the
 * edge's `label`, or remove it when `label` is empty.
 */
export interface FlowEdgeEditDetail {
  source: string
  target: string
  /** The new label, trimmed. Empty when the user cleared it; never the current label. */
  label: string
}
