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

/** A side of a node, where an edge leaves or arrives. */
export type FlowSide = 'top' | 'right' | 'bottom' | 'left'

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

/**
 * Outline of a node: a rounded rectangle (`rect`, the default), a `pill`, a `diamond` (a decision), a `circle`, a
 * `note` with a folded corner, or a `slanted` parallelogram (an input or output).
 */
export type FlowNodeShape = 'rect' | 'pill' | 'diamond' | 'circle' | 'note' | 'slanted'

/**
 * How an end of an edge is drawn: an `arrow` (the default at the target), `none` (the default at the source), or one
 * of the crow's-foot cardinalities of an entity-relationship diagram: `one` (exactly one, two bars), `zero-one` (a
 * circle and a bar), `many` (a crow's foot), `one-many` (a bar and a crow's foot) or `zero-many` (a circle and a
 * crow's foot).
 */
export type FlowEdgeMarker = 'arrow' | 'none' | 'one' | 'zero-one' | 'many' | 'one-many' | 'zero-many'

/**
 * One row of a node: a column of a table, a field of a class. Every row is a port: an edge that names it in
 * `sourcePort` or `targetPort` leaves or arrives at the row instead of the middle of the node's side.
 */
export interface FlowNodeRow {
  /** Unique within its node. Edges refer to it as `sourcePort` / `targetPort`. */
  id: string
  /** The row's name. */
  label: string
  /** Short trailing value, such as a column's type. */
  meta?: string
  /** Shown before the label, like a node's `icon`: a Lit template, a DOM node or a string. Decorative. */
  icon?: unknown
  /** Rows of the row's own hover card, as `[label, value]` pairs or an object. Without them the node's card shows. */
  details?: [string, string][] | Record<string, string>
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
  /** Outline of the node; `rect` when unset. The text is centred in a `diamond` and a `circle`, and may wrap there. */
  shape?: FlowNodeShape
  /** Fill of this node, any CSS colour, over `--c2-flow__node--background-color`. */
  background?: string
  /** Text colour of this node, any CSS colour, over `--c2-flow__node--color`. */
  color?: string
  /**
   * Shown before the label in the default body: a Lit template, a DOM node (such as an icon element) or a string
   * (an emoji). Decorative: the label names the node.
   */
  icon?: unknown
  /**
   * Rows drawn under the label in the default body, each a port edges can attach to; see {@link FlowNodeRow}. A body
   * drawn by `renderNode` or a `node:<id>` slot marks its own ports with a `data-flow-port="<row id>"` attribute.
   */
  rows?: FlowNodeRow[]
  /**
   * How many of `rows` show before the rest fold into a "+ N more" row, over the flow's `row-limit`; 0 shows them
   * all. Rows an edge meets always show.
   */
  rowLimit?: number
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
  /**
   * The side of the source node the edge leaves by. Unset, it is the outgoing side of the `direction` (`right` in
   * `LR`, `bottom` in `TB`). An `editable` flow reports the side the user drew the edge from in `edge-add`.
   */
  sourceSide?: FlowSide
  /**
   * The side of the target node the edge arrives by. Unset, it is the incoming side of the `direction` (`left` in
   * `LR`, `top` in `TB`). An edge with neither side set is routed exactly as before, back edges looping round the
   * outside of the nodes; one with a side set runs from the middle of one side to the middle of the other.
   */
  targetSide?: FlowSide
  /**
   * The row of the source node the edge leaves from: the `id` of one of its `rows`, or the `data-flow-port` of an
   * element in a custom body. The edge then meets that row's `left` or `right` side: the one `sourceSide` names, else
   * the one facing the target. Two nodes can be joined by several edges between different rows.
   */
  sourcePort?: string
  /** The row of the target node the edge arrives at; see `sourcePort`. */
  targetPort?: string
  /** How the source end is drawn; `none` when unset. */
  sourceMarker?: FlowEdgeMarker
  /** How the target end is drawn; `arrow` when unset. */
  targetMarker?: FlowEdgeMarker
}

/** Positions keyed by node id, in canvas pixels (the top-left corner of each node). */
export type FlowLayout = Record<string, FlowPoint>

/** Handed to `renderNode` and `renderCard`. */
export interface FlowRenderContext<T = unknown> {
  node: FlowNode<T>
  status: FlowStatus
  selected: boolean
  direction: FlowDirection
  /** For `renderCard` only: the row whose card is open, when the pointer is on a row that has `details`. */
  row?: FlowNodeRow
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
  /** Set with `source`: the side of `source` the connection was drawn from, for the new edge's `sourceSide`. */
  sourceSide?: FlowSide
  /** Set with `source` when the connection was drawn from a row: the row, for the new edge's `sourcePort`. */
  sourcePort?: string
  /**
   * Set with `source`: the side of the new node that `position` puts on the drop point, facing the source (the side
   * opposite `sourceSide`), for the new edge's `targetSide`.
   */
  targetSide?: FlowSide
}

/** `rows-toggle`: the user showed or folded the rows past the limit of node `id`. */
export interface FlowRowsToggleDetail {
  id: string
  /** Whether every row now shows. */
  expanded: boolean
}

/**
 * `row-move`: the user moved row `row` of node `id` from index `from` to index `to` of its `rows`, in an `editable`
 * flow. The flow does not reorder them: move the row in the node's `rows`.
 */
export interface FlowRowMoveDetail {
  id: string
  row: string
  /** Its index in `rows` before the move. */
  from: number
  /** Its index in `rows` after the move, counted once the row is taken out and put back. */
  to: number
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
 * `edge-delete`: the user asked to delete the edge from `source` to `target` (between those rows, when it has ports).
 * Also the base of `edge-add`, which never names an edge that already exists, nor the same node twice unless between
 * two different rows of it (a table referencing itself).
 */
export interface FlowEdgeEventDetail {
  source: string
  target: string
  /** The edge's `sourcePort`, when it has one. */
  sourcePort?: string
  /** The edge's `targetPort`, when it has one. */
  targetPort?: string
}

/**
 * `edge-add`: the user connected `source` to `target`. Add an edge with these four fields to `edges`; the sides make
 * it leave and arrive where the user drew it.
 */
export interface FlowEdgeAddDetail extends FlowEdgeEventDetail {
  /**
   * The side of `source` whose handle the connection was dragged from; for a keyboard connection (`C`), the
   * outgoing side of the `direction`.
   */
  sourceSide: FlowSide
  /**
   * The side of `target` it arrives by: the handle it was dropped on, else the side of the target nearest the
   * pointer; for a keyboard connection, the incoming side of the `direction`.
   */
  targetSide: FlowSide
  /** Set when the connection was dragged from a row's handle: that row. */
  sourcePort?: string
  /** Set when the connection was dropped on a row of the target: that row. */
  targetPort?: string
}

/**
 * `edge-edit`: the user changed the label of the edge from `source` to `target` with the inline editor. Set the
 * edge's `label`, or remove it when `label` is empty.
 */
export interface FlowEdgeEditDetail {
  source: string
  target: string
  sourcePort?: string
  targetPort?: string
  /** The new label, trimmed. Empty when the user cleared it; never the current label. */
  label: string
}
