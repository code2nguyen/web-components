import { LitElement, html, nothing, svg, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { provideContextMenuData } from '@c2n/core/context-menu-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { ariaKeyShortcuts, isApplePlatform, matchesStroke, parseShortcut } from '@c2n/core/shortcut-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { ContextMenuContext, ContextMenuSelectEventDetail } from '@c2n/context-menu'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { avoidOverlap, buildGraph, layoutGraph, mergeLayout, type Graph, type LayoutOptions } from './flow-layout.js'
import {
  FLOW_SIDES,
  defaultSides,
  facingSides,
  nearestSide,
  oppositeSide,
  routeBetween,
  rowPoint,
  sidePoint,
  type EdgeAnchors,
  type EdgeRoute,
  type Rect,
} from './flow-geometry.js'
import { MENU_ICONS, STATUS_ICONS } from './flow-icons.js'
import { flowMessages } from './messages.js'
import type {
  FlowActionsPlacement,
  FlowContextMenuRenderer,
  FlowDirection,
  FlowEdge,
  FlowEdgeAddDetail,
  FlowEdgeEditDetail,
  FlowEdgeEventDetail,
  FlowEdgeMarker,
  FlowEdgeType,
  FlowLayout,
  FlowLayoutChangeDetail,
  FlowLayoutChangeReason,
  FlowMenuSelectDetail,
  FlowNode,
  FlowNodeAddDetail,
  FlowNodeDeleteDetail,
  FlowNodeEditDetail,
  FlowNodeEventDetail,
  FlowNodeRow,
  FlowNodeShape,
  FlowPoint,
  FlowRenderContext,
  FlowRenderer,
  FlowRowMoveDetail,
  FlowRowsToggleDetail,
  FlowSelectionChangeDetail,
  FlowSide,
  FlowSize,
  FlowStatus,
} from './flow-types.js'
import styles from './flow.scss?inline'

import '@c2n/context-menu'
import '@c2n/kbd'

export type * from './flow-types.js'
export { buildGraph, layoutGraph, mergeLayout } from './flow-layout.js'
export { edgePath } from './flow-geometry.js'

/** Events fired by {@link Flow}, keyed for `addEventListener`. */
export interface FlowEventMap {
  'node-click': CustomEvent<FlowNodeEventDetail>
  'selection-change': CustomEvent<FlowSelectionChangeDetail>
  'layout-change': CustomEvent<FlowLayoutChangeDetail>
  'flow-menu-select': CustomEvent<FlowMenuSelectDetail>
  'node-add': CustomEvent<FlowNodeAddDetail>
  'node-edit': CustomEvent<FlowNodeEditDetail>
  'node-delete': CustomEvent<FlowNodeDeleteDetail>
  'edge-add': CustomEvent<FlowEdgeAddDetail>
  'edge-delete': CustomEvent<FlowEdgeEventDetail>
  'edge-edit': CustomEvent<FlowEdgeEditDetail>
  'rows-toggle': CustomEvent<FlowRowsToggleDetail>
  'row-move': CustomEvent<FlowRowMoveDetail>
}

export interface Flow {
  addEventListener: TypedAddEventListener<Flow, FlowEventMap>
  removeEventListener: TypedRemoveEventListener<Flow, FlowEventMap>
}

interface StoredLayout {
  v: 1
  direction?: FlowDirection
  positions?: FlowLayout | null
  /** Nodes whose rows past the limit are shown. */
  expanded?: string[]
}

/** The card key of a node's "+ N more" row, which lists the rows it folds. Not a row id: it carries no edges. */
const MORE_ROWS = '\u0000more'

const STORAGE_VERSION = 1
const MIN_ZOOM = 0.25
const DEFAULT_FIT_MIN_ZOOM = MIN_ZOOM
const MAX_ZOOM = 2
const ZOOM_STEP = 1.2
const FIT_PADDING = 24
const DRAG_THRESHOLD = 4
const NUDGE = 8
const NUDGE_LARGE = 24
const TWEEN_DURATION = 320
const ESTIMATED_SIZE: FlowSize = { width: 200, height: 56 }

const SHAPES = new Set<FlowNodeShape>(['rect', 'pill', 'diamond', 'circle', 'note', 'slanted'])

/**
 * The outlines CSS cannot draw with a border, in a 100×100 box stretched over the node; the stroke keeps its width
 * however the box is stretched. A pill and a note are the node's own border.
 */
const OUTLINES: Partial<Record<FlowNodeShape, unknown>> = {
  diamond: svg`<polygon points="50,0.5 99.5,50 50,99.5 0.5,50" vector-effect="non-scaling-stroke"></polygon>`,
  circle: svg`<ellipse cx="50" cy="50" rx="49.5" ry="49.5" vector-effect="non-scaling-stroke"></ellipse>`,
  // Its sides lean out past the box at the corners, so their middles, where the edges arrive, are the box's sides.
  slanted: svg`<polygon points="5,0.5 105,0.5 95,99.5 -5,99.5" vector-effect="non-scaling-stroke"></polygon>`,
}
/** Two presses this close in time (ms) and space (px) on the same thing are a double click, or a double tap. */
const DOUBLE_TAP_TIME = 500
const DOUBLE_TAP_DISTANCE = 8

const ACTIONS_PLACEMENTS: readonly FlowActionsPlacement[] = ['top', 'right', 'bottom', 'left']

/** The zoom shortcuts every canvas app uses: ⌘ on Apple platforms, Ctrl elsewhere. `=` is the unshifted `+` key. */
const ZOOM_IN_KEYS = 'mod+plus, mod+='
const ZOOM_OUT_KEYS = 'mod+minus'
const FIT_KEYS = 'mod+0'

function matchesKeys(keys: string, event: KeyboardEvent) {
  return parseShortcut(keys).some(({ strokes }) => strokes.length === 1 && matchesStroke(strokes[0], event))
}

type EdgeState = 'idle' | 'done' | 'active' | 'failed' | 'blocked'

const finished = (status: FlowStatus) => status === 'success' || status === 'warning'

function edgeState(source: FlowStatus, target: FlowStatus): EdgeState {
  if (source === 'error') return 'failed'
  if (source === 'skipped' || target === 'skipped') return 'blocked'
  if (finished(source)) return target === 'running' || target === 'current' ? 'active' : 'done'
  return 'idle'
}

function detailRows(details: FlowNode['details']): [string, string][] {
  if (!details) return []
  return Array.isArray(details) ? details : Object.entries(details)
}

/** The well-formed rows of a node. */
const rowsOf = (node: FlowNode): FlowNodeRow[] => (Array.isArray(node.rows) ? node.rows.filter((row) => !!row && typeof row.id === 'string' && !!row.id) : [])

/** See `edgeEnds()`. */
type NodeEnds = Map<string, Map<string, { in: boolean; out: boolean }>>

const statusOf = (node: FlowNode): FlowStatus => (node.status && node.status in STATUS_ICONS ? node.status : 'pending')

/** The message a screen reader reads for each status, since the marker is a glyph. */
const STATUS_MESSAGES = {
  pending: 'statusPending',
  current: 'statusCurrent',
  running: 'statusRunning',
  success: 'statusSuccess',
  error: 'statusError',
  warning: 'statusWarning',
  skipped: 'statusSkipped',
} as const satisfies Record<FlowStatus, string>

const pairKey = (source: string, target: string) => `${source}\u0000${target}`

/** A port id, or `undefined` for anything else (an empty string included). */
const portId = (value: unknown): string | undefined => (typeof value === 'string' && value ? value : undefined)

type EdgeIdentity = Pick<FlowEdge, 'source' | 'target' | 'sourcePort' | 'targetPort'>

/** Identity of an edge: its two nodes, and its two rows when it has any, since two tables can be linked by several columns. */
const edgeKey = (edge: EdgeIdentity) => {
  const [sourcePort, targetPort] = [portId(edge.sourcePort), portId(edge.targetPort)]
  const pair = pairKey(edge.source, edge.target)
  return sourcePort || targetPort ? `${pair}\u0000${sourcePort ?? ''}\u0000${targetPort ?? ''}` : pair
}

/** The ports of an edge, for the detail of an event about it: only those it has. */
const portsOf = (edge: EdgeIdentity): Pick<FlowEdge, 'sourcePort' | 'targetPort'> => {
  const ports: Pick<FlowEdge, 'sourcePort' | 'targetPort'> = {}
  const [sourcePort, targetPort] = [portId(edge.sourcePort), portId(edge.targetPort)]
  if (sourcePort) ports.sourcePort = sourcePort
  if (targetPort) ports.targetPort = targetPort
  return ports
}

const MARKERS = new Set<FlowEdgeMarker>(['arrow', 'none', 'one', 'zero-one', 'many', 'one-many', 'zero-many'])

/**
 * The crow's-foot ends, drawn in a 20×12 box whose right edge touches the node: the crow's foot spreads to the full
 * height there, bars stand across the line, and a circle (filled with the canvas) sits further out.
 */
const MARKER_PATHS: Partial<Record<FlowEdgeMarker, unknown>> = {
  one: svg`<path d="M-4 -5V5M-8 -5V5"></path>`,
  'zero-one': svg`<path d="M-4 -5V5"></path><circle class="marker-ring" cx="-11" cy="0" r="3"></circle>`,
  many: svg`<path d="M-12 0L0 -6M-12 0L0 6"></path>`,
  'one-many': svg`<path d="M-12 0L0 -6M-12 0L0 6M-15 -5V5"></path>`,
  'zero-many': svg`<path d="M-12 0L0 -6M-12 0L0 6"></path><circle class="marker-ring" cx="-16" cy="0" r="3"></circle>`,
}

const markerOf = (value: unknown, fallback: FlowEdgeMarker): FlowEdgeMarker => (MARKERS.has(value as FlowEdgeMarker) ? (value as FlowEdgeMarker) : fallback)

/** Where a row sits in its node, in canvas pixels from the top of the node's border box; `inset` is its top border. */
interface PortBox {
  top: number
  height: number
  inset: number
}

/** The geometry of an edge's two ends: the nodes it joins, the sides it uses and, for rows, where on those sides. */
interface EdgeEnds {
  a: Rect
  b: Rect
  sides: { source: FlowSide; target: FlowSide }
  anchors: EdgeAnchors
  /** Whether either end is on a row. */
  ported: boolean
}

/** A key press without Ctrl, ⌘ or Alt: the single-letter editing shortcuts must not shadow browser or app chords. */
const plainKey = (event: KeyboardEvent, key: string) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === key

/** A connection being drawn from `source`: by the pointer (`point` follows it) or by the keyboard (`target` is chosen). */
interface Connection {
  source: string
  /** The side of `source` it leaves by: the handle the drag started on, or the outgoing side for the keyboard. */
  sourceSide: FlowSide
  /** Pointer position in canvas pixels; `null` while the keyboard chooses. */
  point: FlowPoint | null
  /** The row of `source` it was dragged from, when it started on a row's handle. */
  sourcePort?: string
  /** The node under the pointer, or the keyboard's candidate. */
  target: string | null
  /** The row of `target` under the pointer, if any. */
  targetPort?: string
  /** The side of `target` it would arrive by; `null` without a target. */
  targetSide: FlowSide | null
  keyboard: boolean
}

const isSide = (value: unknown): value is FlowSide => typeof value === 'string' && (FLOW_SIDES as readonly string[]).includes(value)

/**
 * A pipeline or dependency graph drawn as nodes and smooth edges on a pannable, zoomable canvas, in the spirit of
 * React Flow but controlled in its topology: the graph comes from the `nodes` and `edges` properties (an `editable`
 * flow lets the user ask for changes, which the application applies), each node carries a {@link FlowStatus}, and
 * edges take their style from the statuses at both ends (an edge into a running step animates, one out of a failed
 * step turns red, one touching a skipped step is dotted). Every edge ends in an arrowhead at its target, in the edge's
 * own colour; `--c2-flow__arrow--display: none` turns them off. An edge with a `label` shows it halfway along, as a
 * small pill (the "yes" and "no" of a decision), and screen readers hear it with the relations of both nodes.
 *
 * **Status marker.** The default node body starts with a marker for its status. A plain diagram, where the status
 * means nothing, hides it with `--c2-flow__marker--display: none`; the label then starts flush with the padding.
 *
 * **Sides.** An edge leaves its source by the outgoing side of the `direction` and arrives by the incoming side,
 * unless it names a `sourceSide` or `targetSide` (`top`, `right`, `bottom`, `left`): it then runs from the middle of
 * that side, leaving and arriving perpendicular to it, in either edge type. The dots where edges meet a node sit on
 * the sides they use. The auto layout does not read the sides.
 *
 * **Layout.** Nodes are placed by a built-in layered layout: one column (`direction="LR"`) or row (`"TB"`) per
 * dependency depth, siblings ordered to reduce crossings. Cycles are allowed; the edges that close them are routed
 * round the outside of the nodes. Dragging a node (or Alt+arrow on a focused one) switches the flow to a custom
 * layout, saved in `localStorage` under `storage-key` and restored on the next visit. When the graph has changed
 * since, the saved layout is merged: kept nodes stay where they were, new nodes are placed relative to their
 * already-placed neighbours, removed ones are dropped. **Auto layout** in the context menu, or `resetLayout()`,
 * goes back to the computed layout.
 *
 * **Context menu.** Right-click, long-press, or Shift+F10 / the context-menu key on the canvas opens a
 * `c2-context-menu` with the view controls: zoom in, zoom out, fit view, layout direction, auto layout and lock
 * layout. A node has no menu of its own until `renderContextMenu` returns rows for it; the canvas rows never open on
 * a node. `renderContextMenu` replaces or extends the canvas rows; rows it adds fire `flow-menu-select`, except
 * `value="flow:details"`, which selects the node and fires `node-click`.
 *
 * **Hover card.** Hovering or focusing a node opens a card next to it after `open-delay` milliseconds, with its
 * status, description and `details`. The pointer can move into the card, so it can hold links and buttons.
 * `renderCard`, or a `card:<id>` slot, replaces its content; `no-card` turns it off.
 *
 * **Shapes and colours.** A node's `shape` draws it as a pill, a diamond, a circle, a folded note or a slanted
 * box instead of a rounded rectangle; `background` and `color` paint that one node, and `icon` puts an icon before its
 * label. Edges still meet the middle of a side, which is where each shape's outline is.
 *
 * **Custom nodes.** `renderNode` returns the body of each node (a Lit template, a DOM node or a string), or a
 * framework renders it into the `node:<id>` slot. Handles, dragging, edges and the card still come from the flow.
 *
 * **Rows and ports (schema diagrams).** A node's `rows` are drawn as a list under its label (a table's columns, with
 * the column type as `meta` and a key icon as `icon`), and each row is a port: an edge with `sourcePort` or
 * `targetPort` leaves or arrives at that row, on its left or right side, whichever faces the other end unless the
 * edge names one. Several edges may join the same two nodes through different rows, and a node may be joined to
 * itself between two of its rows. A custom body marks its own ports with `data-flow-port="<id>"`. Hovering a row
 * highlights its edges and the rows at their far ends; a row with `details` opens its own hover card. Screen readers
 * hear the rows and the rows each edge joins ("After customers.id through customer_id."). Past `row-limit` (or a
 * node's `rowLimit`) the other rows fold into a "+ N more" row, whose card lists them: a click on it, Shift+Enter on
 * the node or its context menu shows them all (`rows-toggle`). Rows an edge meets always show. In an `editable` flow a
 * hovered row shows a grip: dragging it moves the row among the node's shown rows, live, with its edges, and fires
 * `row-move` on release (Escape puts it back); `R` on a focused node does the same from the keyboard (arrows pick a
 * row, Alt+arrows move it, Enter or Escape ends), and a row's context menu has **Move row up** and **Move row down**. `sourceMarker` and
 * `targetMarker` draw an end as an `arrow` (the target's default), `none` (the source's) or a crow's-foot cardinality:
 * `one`, `zero-one`, `many`, `one-many`, `zero-many`. With `edge-type="step"`, `direction="LR"`,
 * `--c2-flow__marker--display: none` and a monospace `--c2-flow__row--font-family`, a flow is an entity-relationship
 * diagram. In an `editable` flow a node with rows is connected row to row: each row has a handle on both sides, and
 * `edge-add` names the rows (`node-add`, `edge-delete` and `edge-edit` too); the keyboard still connects whole nodes.
 *
 * **Keyboard.** One node is in the tab order; arrow keys follow the edges (forward to the next step, back to the
 * previous one, across to a sibling of the same rank), Enter selects, Alt+arrow moves the node (8px, 24px with
 * Shift), Ctrl/⌘ + `+` and Ctrl/⌘ + `-` zoom and Ctrl/⌘ + `0` fits the view, while focus is in the flow (the
 * browser's page zoom keeps those keys everywhere else). Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page.
 *
 * **Editing.** `editable` lets the user draw the diagram. The flow stays controlled: it never changes `nodes` or
 * `edges` itself, it fires an event and the application updates the properties.
 *
 * - *Add a node*: double-click (or double-tap) empty canvas (unless `no-double-click-add`), choose **Add node** in
 *   the canvas menu, press `N` or Enter on the empty canvas, or call `addNode()`: `node-add` with the `position` to
 *   give the new node. `N` and `addNode()` place it where it is easy to find: connected after the selected node (`N`:
 *   the focused node, when it is the selected one), else beside the focused node, else in the middle of the view;
 *   always in a spot no node covers, and the view pans to show it once the application has added it.
 * - *Rename*: double-click a node, press Enter on the selected node or F2 on the focused one, or choose **Rename**:
 *   an inline field opens over the label. Enter or leaving the field commits (`node-edit`), Escape cancels. A node
 *   drawn by `renderNode` or a `node:<id>` slot gets the field over its whole body and the same event, but must
 *   render `label` itself to show the change. `editLabel(id)` opens the field from script, e.g. on a new node.
 * - *Connect*: a hovered, focused or selected node shows a handle in the middle of each of its four sides; drag one.
 *   Released on another node it fires `edge-add` (never a self-loop or a duplicate) with the `sourceSide` it was
 *   dragged from and the `targetSide` it arrives by: the handle it was dropped on, else the side of the target nearest
 *   the pointer. Store both on the edge and it is drawn between those sides. Released on empty canvas it fires
 *   `node-add` with `source` and `sourceSide`, for a connected new node. From the keyboard, `C` on the focused node
 *   starts a connection, the arrow keys or Tab choose the target, Enter connects and Escape cancels; it connects the
 *   outgoing side of the `direction` to the incoming one (`right` to `left` in `LR`, `bottom` to `top` in `TB`).
 * - *Label an edge*: double-click an edge or its label, press Enter or F2 on the selected edge, or choose **Edit
 *   label** in its menu: the same inline field opens halfway along the edge. Enter or leaving the field commits
 *   (`edge-edit`, with an empty `label` when the user cleared it), Escape cancels. `editEdgeLabel()` opens it from script.
 * - *Delete*: Delete or Backspace on the focused node fires `node-delete`. An edge is selected by a click, or by `E`
 *   on a focused node (repeat to step through its edges); Delete then fires `edge-delete`. The node and edge
 *   context menus have a **Delete** row.
 *
 * In an editable flow a change to the graph never moves the nodes already on the canvas: the current positions are
 * pinned as a custom layout (`layout-change` with reason `edit`) and the view keeps its pan and zoom.
 *
 * **Actions.** Buttons slotted into `actions` sit in a toolbar over the canvas, at the top by default;
 * `actions-placement` moves it to the `right`, `bottom` or `left` edge, where it stacks vertically. Wire them to the
 * public methods: `addNode()` asks for a node as `N` does (with `no-double-click-add`, it is the way a pointer adds
 * one), and `dragNewNode(event)`, called from the same button's `pointerdown`, lets the user drag the new node onto
 * the canvas as a design tool drags a shape; `resetLayout()` goes back to the auto layout, `fitView()`,
 * `zoomIn()` and `zoomOut()` move the view. The toolbar's look and its alignment along the edge are CSS variables.
 *
 * @tag c2-flow
 *
 * @slot node:{id} - Body of the node whose `id` is `{id}`, e.g. `slot="node:build"`. Replaces `renderNode` and the default body for that node.
 * @slot card:{id} - Content of the hover card of node `{id}`. Replaces `renderCard` and the default card for that node.
 * @slot actions - Buttons drawn over the canvas, along the edge `actions-placement` names, e.g. add node, auto layout (`resetLayout()`) or fit view (`fitView()`). They form a toolbar: the arrow keys move between them.
 *
 * @event {CustomEvent<FlowNodeEventDetail>} node-click - A node was clicked, activated with Enter or Space, or chosen with a `flow:details` context-menu row. Does not bubble.
 * @event {CustomEvent<FlowSelectionChangeDetail>} selection-change - The selected node changed through the user. `detail.selected` is its id, or `null`. Does not bubble.
 * @event {CustomEvent<FlowLayoutChangeDetail>} layout-change - The user moved a node, switched direction or went back to auto layout, or `setLayout()` was called. Does not bubble.
 * @event {CustomEvent<FlowMenuSelectDetail>} flow-menu-select - A context-menu row added by `renderContextMenu` was activated, with the node it was opened on. Does not bubble.
 * @event {CustomEvent<FlowNodeAddDetail>} node-add - `editable` only: the user asked for a node at `detail.position` (canvas pixels, the node's top-left corner), connected from `detail.source` (by its side `detail.sourceSide`, into the new node's `detail.targetSide`) when it came from a connection dropped on empty canvas. Append it to `nodes`. Does not bubble.
 * @event {CustomEvent<FlowNodeEditDetail>} node-edit - `editable` only: the user renamed node `detail.id` to `detail.label` with the inline editor. Does not bubble.
 * @event {CustomEvent<FlowNodeDeleteDetail>} node-delete - `editable` only: the user asked to delete node `detail.id`. Does not bubble.
 * @event {CustomEvent<FlowEdgeAddDetail>} edge-add - `editable` only: the user connected `detail.source` to `detail.target`, from side `detail.sourceSide` of the source to side `detail.targetSide` of the target, or between rows `detail.sourcePort` and `detail.targetPort` (an end on a row has no side: it faces the other end). Never an existing edge, nor a self-loop except between two different rows of one node. Does not bubble.
 * @event {CustomEvent<FlowEdgeEventDetail>} edge-delete - `editable` only: the user asked to delete the edge from `detail.source` to `detail.target`. Does not bubble.
 * @event {CustomEvent<FlowRowMoveDetail>} row-move - `editable` only: the user moved row `detail.row` of node `detail.id` from index `detail.from` to `detail.to` of its `rows`, by its grip, the keyboard (`R`) or the row's context menu. Move it in `rows`. Does not bubble.
 * @event {CustomEvent<FlowRowsToggleDetail>} rows-toggle - The user showed or folded the rows of node `detail.id` past the `row-limit` (the "+ N more" row, Shift+Enter or the context menu). Does not bubble.
 * @event {CustomEvent<FlowEdgeEditDetail>} edge-edit - `editable` only: the user changed the label of the edge from `detail.source` to `detail.target` to `detail.label` with the inline editor; an empty `label` removes it. Does not bubble.
 *
 * @csspart actions - The toolbar around the `actions` slot.
 *
 * @internalcomponent c2-context-menu
 * @internalcomponent c2-kbd
 *
 * @cssproperty {pixel} [--c2-flow--height=480px] - Height of the canvas.
 * @cssproperty {justify-content} [--c2-flow__actions--align=flex-start] - Where the actions toolbar sits along its edge: `flex-start`, `center` or `flex-end`.
 * @cssproperty {pixel} [--c2-flow__actions--offset=12px] - Distance between the actions toolbar and the edge of the canvas.
 * @cssproperty {pixel} [--c2-flow__actions--gap=4px] - Space between two action buttons.
 * @cssproperty {padding} [--c2-flow__actions--padding=4px]
 * @cssproperty {color} [--c2-flow__actions--background-color=#ffffff]
 * @cssproperty {border} [--c2-flow__actions--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-flow__actions--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-flow__actions--box-shadow=0 1px 2px rgba(24, 24, 27, 0.06)]
 * @cssproperty {color} [--c2-flow--background-color=#fafafa] - Canvas background.
 * @cssproperty {border} [--c2-flow--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-flow--border-radius=8px]
 * @cssproperty {font-family} --c2-flow--font-family
 * @cssproperty {color} [--c2-flow__dot--color=#ebebed] - Colour of the canvas dot grid.
 * @cssproperty {pixel} [--c2-flow__dot--size=1px] - Radius of one grid dot.
 * @cssproperty {pixel} [--c2-flow__dot--gap=20px] - Spacing of the dot grid at 100% zoom; it scales with the zoom, within the two bounds below.
 * @cssproperty {pixel} [--c2-flow__dot--min-gap=14px] - Smallest dot spacing, reached when zoomed out.
 * @cssproperty {pixel} [--c2-flow__dot--max-gap=32px] - Largest dot spacing, reached when zoomed in.
 * @cssproperty {pixel} [--c2-flow__rank--gap=72px] - Space between two ranks of the auto layout.
 * @cssproperty {pixel} [--c2-flow__node--gap=20px] - Space between two nodes of the same rank.
 * @cssproperty {pixel} [--c2-flow__node--width=200px]
 * @cssproperty {padding} [--c2-flow__node--padding-top=10px]
 * @cssproperty {padding} [--c2-flow__node--padding-right=12px]
 * @cssproperty {padding} [--c2-flow__node--padding-bottom=10px]
 * @cssproperty {padding} [--c2-flow__node--padding-left=12px]
 * @cssproperty {color} [--c2-flow__node--background-color=#ffffff]
 * @cssproperty {color} [--c2-flow__node--color=#18181b]
 * @cssproperty {border} [--c2-flow__node--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-flow__node--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-flow__node--box-shadow=0 1px 2px rgba(24, 24, 27, 0.06)]
 * @cssproperty {color} [--c2-flow__node__hover--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-flow__node__selected--border-color=rgb(2, 101, 220)]
 * @cssproperty {box-shadow} [--c2-flow__node__selected--box-shadow=0 0 0 3px rgba(2, 101, 220, 0.2)]
 * @cssproperty {outline} [--c2-flow__node__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 * @cssproperty {box-shadow} [--c2-flow__node__dragging--box-shadow=0 10px 28px rgba(24, 24, 27, 0.14)] - Shadow of a node while it is dragged.
 * @cssproperty {number} [--c2-flow__node__skipped--opacity=0.6] - Opacity of the body of a skipped node.
 * @cssproperty {font-size} [--c2-flow__label--font-size=14px]
 * @cssproperty {font-weight} [--c2-flow__label--font-weight=500]
 * @cssproperty {font-size} [--c2-flow__description--font-size=12px] - Size of the description and the meta value.
 * @cssproperty {color} [--c2-flow__description--color=#71717a]
 * @cssproperty {pixel} [--c2-flow__handle--size=7px] - Diameter of the dots on the sides of a node that edges leave or arrive by.
 * @cssproperty {color} [--c2-flow__handle--background-color=#ffffff]
 * @cssproperty {color} [--c2-flow__handle--border-color=#a1a1aa]
 * @cssproperty {color} [--c2-flow__edge--color=#d4d4d8] - Edge between steps that have not run yet.
 * @cssproperty {pixel} [--c2-flow__edge--width=1.5px]
 * @cssproperty {color} [--c2-flow__edge__done--color=#a1a1aa] - Edge out of a finished step.
 * @cssproperty {color} [--c2-flow__edge__active--color=rgb(2, 101, 220)] - Animated edge into a running or waiting step.
 * @cssproperty {color} [--c2-flow__edge__failed--color=#dc2626] - Edge out of a failed step.
 * @cssproperty {pixel} [--c2-flow__edge__highlighted--width=2.5px] - Edges of the hovered or selected node.
 * @cssproperty {time} [--c2-flow__edge--animation-duration=600ms] - One cycle of the active edge's dash animation.
 * @cssproperty {pixel} [--c2-flow__arrow--size=8px] - Length and width of the arrowhead at the target end of every edge. It takes the edge's colour.
 * @cssproperty {display} [--c2-flow__arrow--display=block] - `none` draws the edges without arrowheads.
 * @cssproperty {pixel} [--c2-flow__edge-marker--size=12px] - Height of a crow's-foot end (`one`, `many`…); it is 5/3 as long. It takes the edge's colour and width.
 * @cssproperty {color} [--c2-flow__edge-label--background-color=#ffffff] - Background of the pill an edge's `label` is drawn in, so it stays readable over the line and the dot grid.
 * @cssproperty {color} [--c2-flow__edge-label--color=#71717a]
 * @cssproperty {font-size} [--c2-flow__edge-label--font-size=12px]
 * @cssproperty {font-weight} [--c2-flow__edge-label--font-weight=500]
 * @cssproperty {padding} [--c2-flow__edge-label--padding=1px 8px]
 * @cssproperty {border} [--c2-flow__edge-label--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-flow__edge-label--border-radius=999px]
 * @cssproperty {display} [--c2-flow__marker--display=inline-flex] - The status marker of the default node body. `none` hides it and the label sits flush with the padding.
 * @cssproperty {color} [--c2-flow__success--color=#16a34a]
 * @cssproperty {color} [--c2-flow__error--color=#dc2626]
 * @cssproperty {color} [--c2-flow__warning--color=#d97706]
 * @cssproperty {color} [--c2-flow__running--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-flow__current--color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-flow__pending--color=#a1a1aa]
 * @cssproperty {color} [--c2-flow__skipped--color=#a1a1aa]
 * @cssproperty {pixel} [--c2-flow__card--width=300px]
 * @cssproperty {padding} [--c2-flow__card--padding=14px]
 * @cssproperty {color} [--c2-flow__card--background-color=#ffffff]
 * @cssproperty {color} [--c2-flow__card--color=#18181b]
 * @cssproperty {border} [--c2-flow__card--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-flow__card--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-flow__card--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {font-size} [--c2-flow__card--font-size=14px]
 * @cssproperty {pixel} [--c2-flow__card--offset=8px] - Distance between the node and its hover card.
 * @cssproperty {color} [--c2-flow__card__term--color=#71717a] - Labels of the card's detail rows.
 * @cssproperty {time} [--c2-flow__card--transition-duration=150ms]
 * @cssproperty {outline} [--c2-flow__canvas__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the empty canvas of an `editable` flow, the one place that takes focus when there is no node.
 * @cssproperty {pixel} [--c2-flow__connector--size=12px] - Diameter of the connection handles an `editable` flow shows in the middle of each side of a hovered, focused or selected node.
 * @cssproperty {color} [--c2-flow__connector--background-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-flow__connector--border-color=#ffffff]
 * @cssproperty {color} [--c2-flow__node__connect-target--border-color=rgb(2, 101, 220)] - Border of the node a connection would be made to.
 * @cssproperty {border} [--c2-flow__ghost--border=1.5px dashed rgb(2, 101, 220)] - Outline of the placeholder that follows the pointer while `dragNewNode()` drags a new node onto the canvas.
 * @cssproperty {color} [--c2-flow__ghost--background-color=rgba(2, 101, 220, 0.06)]
 * @cssproperty {box-shadow} [--c2-flow__node__connect-target--box-shadow=0 0 0 3px rgba(2, 101, 220, 0.2)]
 * @cssproperty {color} [--c2-flow__edge__draft--color=rgb(2, 101, 220)] - The edge drawn while a connection is being made.
 * @cssproperty {color} [--c2-flow__edge__selected--color=rgb(2, 101, 220)] - Selected edge of an `editable` flow.
 * @cssproperty {pixel} [--c2-flow__edge__selected--width=2.5px]
 * @cssproperty {pixel} [--c2-flow__edge-hit--width=12px] - Width of the invisible band round an edge that a click selects it by.
 * @cssproperty {color} [--c2-flow__editor--background-color=#ffffff] - Inline label editor.
 * @cssproperty {color} [--c2-flow__editor--color=#18181b]
 * @cssproperty {border} [--c2-flow__editor--border=1px solid #bcbcc6]
 * @cssproperty {border-radius} [--c2-flow__editor--border-radius=4px]
 * @cssproperty {outline} [--c2-flow__editor__focus--outline=2px solid rgba(2, 101, 220, 0.4)]
 *
 * @cssproperty {pixel} [--c2-flow__icon--size=16px] - Size of a node's `icon` and of a row's.
 * @cssproperty {color} [--c2-flow__icon--color=currentColor] - Colour of a node's `icon`; the node's text colour by default.
 * @cssproperty {border} [--c2-flow__rows--border-top=1px solid #e4e4e7] - Line between a node's header and its rows.
 * @cssproperty {pixel} [--c2-flow__row--min-height=32px]
 * @cssproperty {padding} [--c2-flow__row--padding=0 12px]
 * @cssproperty {pixel} [--c2-flow__row--gap=8px] - Space between a row's icon, label and meta.
 * @cssproperty {font-family} --c2-flow__row--font-family - Font of the rows, e.g. a monospace one for a schema.
 * @cssproperty {font-size} [--c2-flow__row--font-size=13px]
 * @cssproperty {border} [--c2-flow__row--border-top=1px solid #f4f4f5] - Line between two rows.
 * @cssproperty {color} [--c2-flow__row__highlighted--background-color=rgba(2, 101, 220, 0.08)] - The hovered row and the rows at the far end of its edges, and the row a connection would arrive at.
 * @cssproperty {color} [--c2-flow__row-meta--color=#71717a] - A row's `meta`, such as a column type.
 * @cssproperty {font-size} [--c2-flow__row-meta--font-size=12px]
 * @cssproperty {color} [--c2-flow__row-grip--color=#a1a1aa] - The grip an `editable` flow shows on a hovered row, which reorders the rows.
 * @cssproperty {color} [--c2-flow__row__moving--background-color=rgba(2, 101, 220, 0.12)] - The row being moved, by its grip or the keyboard.
 * @cssproperty {color} [--c2-flow__row-more--color=rgb(2, 101, 220)] - The "+ N more" row of a node past its `row-limit`.
 * @cssproperty {font-size} [--c2-flow__row-more--font-size=12px]
 * @cssproperty {color} [--c2-flow__shape--border-color=#bcbcc6] - Outline of a diamond, circle or slanted node, and the fold of a note.
 * @cssproperty {pixel} [--c2-flow__shape--border-width=1px] - Width of that outline.
 * @cssproperty {pixel} [--c2-flow__shape__diamond--min-height=88px] - A diamond's least height, so its middle has room for the label.
 * @cssproperty {pixel} [--c2-flow__shape__circle--size=128px] - Width and height of a circle node.
 * @cssproperty {pixel} [--c2-flow__shape__note--fold-size=14px] - Size of a note's folded corner.
 * @cssproperty {color} [--c2-flow__shape__focus--color=rgba(2, 101, 220, 0.6)] - Focus ring of a diamond, circle or slanted node, drawn along its outline in place of `--c2-flow__node__focus--outline`.
 * @cssproperty {pixel} [--c2-flow__shape__focus--width=2px] - How much wider than the outline that ring is.
 */
@customElement('c2-flow')
export class Flow extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The steps. A property, or a JSON attribute. */
  @property({ converter: jsonPropertyConverter }) nodes: FlowNode[] = []

  /** The dependencies between steps. A property, or a JSON attribute. */
  @property({ converter: jsonPropertyConverter }) edges: FlowEdge[] = []

  /** Main axis of the auto layout. The user can switch it from the context menu; the choice is saved with the layout. */
  @property() direction: FlowDirection = 'LR'

  /** Edge shape: smooth curves or rounded orthogonal segments. */
  @property({ attribute: 'edge-type' }) edgeType: FlowEdgeType = 'bezier'

  /** `localStorage` key the custom layout and direction are saved under. Empty disables persistence. */
  @property({ attribute: 'storage-key' }) storageKey = ''

  /**
   * Lets the user add, rename, connect and delete nodes and delete edges. The flow fires `node-add`, `node-edit`,
   * `node-delete`, `edge-add` and `edge-delete` and the application updates `nodes` and `edges`.
   */
  @property({ type: Boolean }) editable = false

  /**
   * Turns off adding a node by double-clicking (or double-tapping) empty canvas, for an application whose `actions`
   * toolbar has an add button calling `addNode()`: a double-click then only selects nothing, and no node appears
   * where the user merely meant to deselect or zoom. The canvas menu's **Add node**, `N` and Enter still add one.
   */
  @property({ type: Boolean, attribute: 'no-double-click-add' }) noDoubleClickAdd = false

  /** Edge of the canvas the `actions` toolbar sits on: `top` or `bottom` lay the buttons out in a row, `left` or `right` in a column (and the arrow keys follow). */
  @property({ attribute: 'actions-placement' }) actionsPlacement: FlowActionsPlacement = 'top'

  /**
   * Least zoom fitting the view may choose (`fitView()`, the first render, a resize or new data while the user has
   * not panned or zoomed), from 0.25 to 1. A flow too large for its box at this zoom shows its start instead of its
   * middle: the first rank sits at the left edge (`LR`) or the top edge (`TB`), centred across if it fits that way.
   * Raise it for a small preview whose labels must stay readable. Zooming by hand still goes down to 25%.
   */
  @property({ type: Number, attribute: 'fit-min-zoom' }) fitMinZoom = DEFAULT_FIT_MIN_ZOOM

  /**
   * How many rows a node shows before the rest fold into a "+ N more" row the user clicks to show them (Shift+Enter or
   * the context menu from the keyboard); a node's own `rowLimit` wins. Rows an edge meets always show. 0 shows every
   * row. Which nodes are open is saved with the layout under `storage-key`.
   */
  @property({ type: Number, attribute: 'row-limit' }) rowLimit = 0

  /** Turns off moving nodes; panning, zooming, selection and the hover card still work. */
  @property({ type: Boolean }) locked = false

  /** Id of the selected node, or `null`. */
  @property() selected: string | null = null

  /** Turns off the hover card. */
  @property({ type: Boolean, attribute: 'no-card' }) noCard = false

  /** Turns off the context menu, so the browser shows its own. */
  @property({ type: Boolean, attribute: 'no-context-menu' }) noContextMenu = false

  /** Delay before the hover card opens, in milliseconds. */
  @property({ type: Number, attribute: 'open-delay' }) openDelay = 400

  /** Delay before the hover card closes once the pointer or focus has left the node and the card, in milliseconds. */
  @property({ type: Number, attribute: 'close-delay' }) closeDelay = 200

  /** Body of each node; see {@link FlowRenderer}. A property only, since it holds a function. */
  @property({ attribute: false }) renderNode: FlowRenderer | undefined = undefined

  /** Content of the hover card; see {@link FlowRenderer}. A property only. */
  @property({ attribute: false }) renderCard: FlowRenderer | undefined = undefined

  /** Rows of the context menu; see {@link FlowContextMenuRenderer}. A property only. */
  @property({ attribute: false }) renderContextMenu: FlowContextMenuRenderer | undefined = undefined

  @state() private tx = 0
  @state() private ty = 0
  @state() private zoom = 1
  @state() private cardId: string | null = null
  /** The row of `cardId` whose own card is open, or `null` for the node's card. */
  @state() private cardPort: string | null = null
  @state() private highlightId: string | null = null
  /** The row under the pointer: its edges and the rows at their far ends are highlighted. */
  @state() private highlightPort: { node: string; port: string } | null = null
  /** Nodes whose rows past the limit are shown. */
  @state() private expanded = new Set<string>()
  /**
   * A row being moved: by its grip (`pointer`) or the keyboard (`R`). While it moves, its node draws it at `to` among
   * its other shown rows, so the edges follow it.
   */
  @state() private rowMove: { node: string; row: string; to: number; pointer: boolean } | null = null
  @state() private focusId: string | null = null
  /** Where the placeholder of a node dragged in by `dragNewNode()` is, in canvas pixels; null when not over the canvas. */
  @state() private ghost: FlowPoint | null = null
  @state() private draggingId: string | null = null
  @state() private panning = false
  @state() private custom = false
  @state() private editingId: string | null = null
  /** Key of the edge whose label is being edited. */
  @state() private editingEdge: string | null = null
  @state() private selectedEdge: string | null = null
  @state() private connection: Connection | null = null
  @state() private announcement = ''

  private readonly msg = new LocalizeController(this, flowMessages)

  @query('.stage') private stage?: HTMLElement
  @query('.card') private card?: HTMLElement

  private readonly internals = isServer ? undefined : this.attachInternals()

  private graph: Graph = buildGraph([], [])
  private layers: string[][] = []
  private rank = new Map<string, number>()
  private positions = new Map<string, FlowPoint>()
  private sizes = new Map<string, FlowSize>()
  /** Every port of every node, as measured: rows of the default body and `data-flow-port` elements of custom ones. */
  private ports = new Map<string, Map<string, PortBox>>()
  /** The nodes' content may have changed, so the ports are measured again after the next render. */
  private portsDirty = true
  /** The rows each node's edges meet, by node id: those always show past the row limit. */
  private linkedPorts = new Map<string, Set<string>>()
  /** What each node slot had assigned when it last changed; see `handleNodeSlotChange`. */
  private slotted = new WeakMap<HTMLSlotElement, Node[]>()
  /** Rows to highlight in this render, as `node\0port`: the hovered row and the rows at the far end of its edges. */
  private litRows = new Set<string>()
  /** Positions the user chose (or that were restored): the input of the merge on every re-layout. */
  private pinned: FlowLayout = {}
  private byId = new Map<string, FlowNode>()
  /** The trimmed `label` of every labelled edge, by edge key. */
  private edgeLabels = new Map<string, string>()
  private topologyKey = ''
  private layoutDirection: FlowDirection | null = null
  private storageLoaded = false
  /** The user panned or zoomed, so a resize no longer refits the view. */
  private viewTouched = false
  private fitted = false

  /** A press on a node; `more` when it was on the node's "+ N more" row, which a click toggles. */
  private drag: { id: string; startX: number; startY: number; origin: FlowPoint; moved: boolean; pointerId: number; more: boolean } | null = null
  /** A press on empty canvas, or on an edge of an editable flow (`edge`), until it moves far enough to pan. */
  private pan: { startX: number; startY: number; tx: number; ty: number; moved: boolean; pointerId: number; edge: string | null } | null = null
  private tween = 0
  private menuNode: FlowNode | null = null
  private menuEdge: FlowEdge | null = null
  private menuPoint: FlowPoint | null = null
  /** A press on a row's grip, until it moves far enough to start moving the row. */
  private rowDrag: { node: string; row: string; startY: number; moved: boolean; pointerId: number } | null = null
  /** The row under the pointer when the context menu opened on a node. */
  private menuRow: string | null = null
  /** A press on a node's connection handle, until it moves far enough to become a connection. */
  private connectDrag: { source: string; side: FlowSide; port?: string; startX: number; startY: number; moved: boolean; pointerId: number } | null = null
  private lastTap: { target: string; time: number; x: number; y: number } | null = null
  /** The position each node's own `position` field was last applied with, so an unchanged value does not undo a drag. */
  private appliedPositions = new Map<string, string>()
  /** The graph changed in an editable flow: save and report the pinned layout once rendered. */
  private editedLayout = false
  /** A keyboard `N`: focus the node the application adds in answer. */
  private focusAdded: Set<string> | null = null
  /** The node that last had focus, while focus stays in the flow or its toolbar; see `lastFocusedNode()`. */
  private lastFocusedId: string | null = null
  private newNodeDrag: { pointerId: number; startX: number; startY: number; moved: boolean } | null = null
  private readonly slotPresence = new SlotPresenceController(this, ['actions'])
  /** A keyboard delete: where focus goes once the application has removed the node. */
  private refocus: { removed: string; next: string | null } | null = null
  private openTimer: ReturnType<typeof setTimeout> | undefined
  /** The card `openTimer` opens, as `node\0port`. */
  private pendingCard: string | null = null
  private closeTimer: ReturnType<typeof setTimeout> | undefined
  private cleanupCard: (() => void) | null = null
  private stageObserver: ResizeObserver | null = null
  private nodeObserver: ResizeObserver | null = null

  constructor() {
    super()
    if (this.internals) {
      this.internals.role = 'group'
      this.internals.ariaRoleDescription = 'flow diagram'
    }
    // On the host, not the stage: focus can also leave from the slotted toolbar, which the stage never hears about.
    this.addEventListener('focusout', this.handleHostFocusOut)
  }

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.stageObserver = new ResizeObserver(() => {
      if (!this.viewTouched) this.fitView()
    })
    this.nodeObserver = new ResizeObserver(() => {
      this.portsDirty = true
      this.measure()
    })
    if (this.hasUpdated) this.observe()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.stageObserver?.disconnect()
    this.nodeObserver?.disconnect()
    this.stageObserver = this.nodeObserver = null
    cancelAnimationFrame(this.tween)
    this.clearCardTimers()
    this.stopCardPositioning()
    this.endNewNodeDrag()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public API

  /**
   * Scales and centres the view so every node is visible, never above 100% nor below `fit-min-zoom`. A flow that
   * does not fit at `fit-min-zoom` is aligned to its start instead.
   */
  fitView(): void {
    const view = this.fitFor(this.positions)
    if (!view) return
    this.tx = view.tx
    this.ty = view.ty
    this.zoom = view.zoom
    this.fitted = true
  }

  /**
   * Asks for a new node as `N` does: connected after the selected node, else beside the node that last had focus in the
   * flow (a toolbar button calling this has taken focus by then), else in the middle of the view, in a spot no node
   * covers. Fires `node-add`; once the application has added the node, it is selected and focused, and the view pans
   * to show it if it is out of sight. Does nothing unless the flow is `editable`.
   */
  addNode(): void {
    if (!this.editable) return
    const selected = this.selected !== null && this.byId.has(this.selected) ? this.selected : null
    this.requestNodeNearby(selected ?? this.focusedNodeId() ?? this.lastFocusedNode(), selected !== null)
  }

  /**
   * Shows (`expanded` true) or folds (false) the rows of node `id` past its row limit; toggles them when `expanded` is
   * left out. Saved under `storage-key`. Does nothing for a node with no rows past its limit.
   */
  toggleRows(id: string, expanded?: boolean): void {
    if (!this.foldsRows(id)) return
    const open = expanded ?? !this.expanded.has(id)
    if (open === this.expanded.has(id)) return
    const next = new Set(this.expanded)
    if (open) next.add(id)
    else next.delete(id)
    this.expanded = next
    this.save()
  }

  zoomIn(): void {
    this.zoomAround(ZOOM_STEP)
  }

  zoomOut(): void {
    this.zoomAround(1 / ZOOM_STEP)
  }

  /** The current position of every node, rounded to whole pixels. */
  getLayout(): FlowLayout {
    return Object.fromEntries([...this.positions].map(([id, p]) => [id, { x: Math.round(p.x), y: Math.round(p.y) }]))
  }

  /** Applies a custom layout (merged like a restored one) and saves it under `storage-key`. */
  setLayout(positions: FlowLayout): void {
    this.pinned = { ...positions }
    this.custom = Object.keys(this.pinned).length > 0
    this.relayout()
    this.save()
    this.emitLayout('api')
  }

  /** Discards the custom layout, clears it from storage and animates back to the auto layout. */
  resetLayout(): void {
    this.pinned = {}
    this.custom = false
    const from = new Map(this.positions)
    this.relayout()
    this.save()
    this.animateFrom(from)
    this.emitLayout('reset')
  }

  /**
   * Opens the inline label editor on node `id`, as a double-click would; for example on the node an application has
   * just added for `node-add`. Does nothing unless the flow is `editable` and the node is rendered.
   */
  async editLabel(id: string): Promise<void> {
    if (!this.editable || !this.byId.has(id)) return
    this.hideCard(true)
    this.cancelConnection()
    this.focusId = id
    this.editingEdge = null
    this.editingId = id
    await this.updateComplete
    const input = this.renderRoot.querySelector<HTMLInputElement>('.label-editor')
    input?.focus()
    input?.select()
  }

  /**
   * Opens the inline label editor on the edge from `source` to `target` (between rows `sourcePort` and `targetPort`,
   * for an edge between rows), as a double-click would; for example on the branch an application has just added to a
   * decision. Does nothing unless the flow is `editable` and the edge exists.
   */
  async editEdgeLabel(source: string, target: string, sourcePort?: string, targetPort?: string): Promise<void> {
    await this.openEdgeEditor(edgeKey({ source, target, sourcePort, targetPort }))
  }

  private async openEdgeEditor(key: string) {
    const edge = this.edgeByKey(key)
    if (!this.editable || !edge || !this.positions.has(edge.source) || !this.positions.has(edge.target)) return
    this.hideCard(true)
    this.cancelConnection()
    this.editingId = null
    this.editingEdge = key
    await this.updateComplete
    const input = this.renderRoot.querySelector<HTMLInputElement>('.label-editor--edge')
    input?.focus()
    input?.select()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Layout

  private readPixels(name: string, fallback: number) {
    if (isServer) return fallback
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }

  private layoutOptions(): LayoutOptions {
    const tb = this.direction === 'TB'
    const rankGap = this.readPixels('--c2-flow__rank--gap', 72)
    const nodeGap = this.readPixels('--c2-flow__node--gap', 20)
    // Rows are shorter than columns are wide, so a top-to-bottom flow packs its ranks tighter.
    return { direction: this.direction, rankGap: tb ? rankGap * 0.7 : rankGap, nodeGap }
  }

  private sizeOf = (id: string): FlowSize => this.sizes.get(id) ?? ESTIMATED_SIZE

  private relayout() {
    const ids = this.nodes.map((node) => node.id)
    this.graph = buildGraph(ids, this.edges)
    const options = this.layoutOptions()
    const result = layoutGraph(this.graph, this.sizeOf, options)
    this.layers = result.layers
    this.rank = result.rank
    this.positions = this.custom ? mergeLayout(result.positions, this.pinned, this.graph, this.edges, this.sizeOf, options) : result.positions
    this.layoutDirection = this.direction
    if (this.focusId === null || !this.byId.has(this.focusId)) this.focusId = this.layers.flat()[0] ?? null
    this.requestUpdate()
  }

  private loadStorage() {
    this.storageLoaded = true
    this.appliedPositions.clear()
    const stored = this.readStorage()
    this.pinned = stored?.positions ?? {}
    this.custom = Object.keys(this.pinned).length > 0
    this.expanded = new Set(Array.isArray(stored?.expanded) ? stored.expanded.filter((id) => typeof id === 'string') : [])
    if (stored?.direction === 'LR' || stored?.direction === 'TB') this.direction = stored.direction
  }

  private readStorage(): StoredLayout | null {
    if (!this.storageKey || isServer) return null
    try {
      const stored = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as StoredLayout | null
      return stored && stored.v === STORAGE_VERSION ? stored : null
    } catch {
      return null
    }
  }

  private save() {
    if (!this.storageKey || isServer) return
    try {
      const stored: StoredLayout = { v: STORAGE_VERSION, direction: this.direction, positions: this.custom ? this.getLayout() : null }
      if (this.expanded.size) stored.expanded = [...this.expanded]
      localStorage.setItem(this.storageKey, JSON.stringify(stored))
    } catch {
      // Storage full or blocked: the layout still applies for this visit.
    }
  }

  private emitLayout(reason: FlowLayoutChangeReason) {
    this.dispatchEvent(
      new CustomEvent<FlowLayoutChangeDetail>('layout-change', {
        detail: { positions: this.custom ? this.getLayout() : null, direction: this.direction, reason },
      }),
    )
  }

  /**
   * Measures every node, and its ports when its content may have changed; a size that changed re-runs the layout, so
   * custom bodies and late fonts are accounted for, and a port that moved redraws the edges.
   */
  private measure() {
    const root = this.renderRoot as ShadowRoot | undefined
    if (!root) return
    let changed = false
    const measurePorts = this.portsDirty
    let portsChanged = false
    const seen = new Set<string>()
    for (const element of root.querySelectorAll<HTMLElement>('.node')) {
      const id = element.dataset.nodeId!
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      if (!size.width && !size.height) continue
      seen.add(id)
      const previous = this.sizes.get(id)
      const resized = !previous || previous.width !== size.width || previous.height !== size.height
      if (resized) {
        this.sizes.set(id, size)
        changed = true
      }
      if (measurePorts || resized) portsChanged = this.measurePorts(element, id) || portsChanged
    }
    if (measurePorts) {
      this.portsDirty = false
      for (const id of this.ports.keys()) {
        if (seen.has(id)) continue
        this.ports.delete(id)
        portsChanged = true
      }
    }
    if (!changed) {
      if (portsChanged) this.requestUpdate()
      return
    }
    this.relayout()
    if (!this.viewTouched) this.fitView()
  }

  /** The elements in node `id` that carry `data-flow-port`, in its shadow body or in the light DOM slotted into it. */
  private portElements(element: HTMLElement, id: string, port?: string) {
    const selector = port === undefined ? '[data-flow-port]' : `[data-flow-port="${CSS.escape(port)}"]`
    const slotted = [...this.querySelectorAll<HTMLElement>(`:scope > [slot="node:${CSS.escape(id)}"]`)]
    return [
      ...element.querySelectorAll<HTMLElement>(selector),
      ...slotted.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll<HTMLElement>(selector)]),
      // The fallback body of a slot that has content is in the DOM but not drawn.
    ].filter((el) => el.getClientRects().length > 0)
  }

  /** Measures the ports of node `id`; returns whether any moved, appeared or went away. */
  private measurePorts(element: HTMLElement, id: string) {
    const nodeRect = element.getBoundingClientRect()
    // The viewport is scaled by the zoom; the ports are kept in canvas pixels.
    const scale = element.offsetHeight ? nodeRect.height / element.offsetHeight : 0
    const boxes = new Map<string, PortBox>()
    if (scale > 0) {
      for (const el of this.portElements(element, id)) {
        const port = el.getAttribute('data-flow-port')
        if (!port || boxes.has(port)) continue
        const rect = el.getBoundingClientRect()
        const top = Math.round(((rect.top - nodeRect.top) / scale) * 10) / 10
        boxes.set(port, { top, height: Math.round((rect.height / scale) * 10) / 10, inset: element.clientTop })
      }
    }
    const previous = this.ports.get(id)
    const same =
      (previous?.size ?? 0) === boxes.size &&
      [...boxes].every(([port, box]) => {
        const old = previous?.get(port)
        return !!old && old.top === box.top && old.height === box.height && old.inset === box.inset
      })
    if (same) return false
    if (boxes.size) this.ports.set(id, boxes)
    else this.ports.delete(id)
    return true
  }

  private observe() {
    if (this.stage) this.stageObserver?.observe(this.stage)
    this.nodeObserver?.disconnect()
    for (const element of this.renderRoot.querySelectorAll('.node')) this.nodeObserver?.observe(element)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // View

  private fitFor(positions: Map<string, FlowPoint>) {
    const stage = this.stage
    if (!stage || !positions.size) return null
    const width = stage.clientWidth
    const height = stage.clientHeight
    if (!width || !height) return null
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const [id, p] of positions) {
      const size = this.sizeOf(id)
      x0 = Math.min(x0, p.x)
      y0 = Math.min(y0, p.y)
      x1 = Math.max(x1, p.x + size.width)
      y1 = Math.max(y1, p.y + size.height)
    }
    // Leave room for back edges looping below or beside the nodes.
    if (this.graph.backEdges.size) {
      if (this.direction === 'LR') y1 += 36
      else x1 += 36
    }
    // And for the edges between chosen sides, which can run out past the nodes.
    const rects = this.nodeRects(positions)
    this.edges.forEach((edge, index) => {
      const bounds = this.sidedEdge(edge) ? this.routeOf(edge, index, positions, rects)?.bounds : undefined
      if (!bounds) return
      x0 = Math.min(x0, bounds.x)
      y0 = Math.min(y0, bounds.y)
      x1 = Math.max(x1, bounds.x + bounds.width)
      y1 = Math.max(y1, bounds.y + bounds.height)
    })
    const minZoom = this.resolvedFitMinZoom()
    const fit = Math.min(1, (width - FIT_PADDING * 2) / (x1 - x0), (height - FIT_PADDING * 2) / (y1 - y0))
    const zoom = Math.max(minZoom, fit)
    const centre = { tx: (width - (x1 - x0) * zoom) / 2 - x0 * zoom, ty: (height - (y1 - y0) * zoom) / 2 - y0 * zoom }
    // The default keeps the view centred even when 25% is too small to fit, as it always was.
    if (minZoom === DEFAULT_FIT_MIN_ZOOM || fit >= minZoom) return { zoom, ...centre }
    // Too large for the box at the least zoom: show where the flow starts, centred across if it fits that way.
    const start = { tx: FIT_PADDING - x0 * zoom, ty: FIT_PADDING - y0 * zoom }
    const fitsX = (x1 - x0) * zoom <= width - FIT_PADDING * 2
    const fitsY = (y1 - y0) * zoom <= height - FIT_PADDING * 2
    return this.direction === 'LR' ? { zoom, tx: start.tx, ty: fitsY ? centre.ty : start.ty } : { zoom, tx: fitsX ? centre.tx : start.tx, ty: start.ty }
  }

  /** `fitMinZoom` held to [0.25, 1]; anything but a finite number counts as the default. */
  private resolvedFitMinZoom() {
    const value = Number(this.fitMinZoom)
    if (this.fitMinZoom === null || this.fitMinZoom === undefined || !Number.isFinite(value)) return DEFAULT_FIT_MIN_ZOOM
    return Math.min(1, Math.max(MIN_ZOOM, value))
  }

  private zoomAround(factor: number, cx?: number, cy?: number) {
    const stage = this.stage
    if (!stage) return
    const x = cx ?? stage.clientWidth / 2
    const y = cy ?? stage.clientHeight / 2
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
    this.tx = x - ((x - this.tx) * zoom) / this.zoom
    this.ty = y - ((y - this.ty) * zoom) / this.zoom
    this.zoom = zoom
    this.viewTouched = true
    this.hideCard()
  }

  /** Moves every node from `from` to its current position, and the view to the fit of the new layout. */
  private animateFrom(from: Map<string, FlowPoint>) {
    cancelAnimationFrame(this.tween)
    const target = new Map(this.positions)
    const view = this.fitFor(target)
    this.viewTouched = false
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !view) {
      if (view) this.fitView()
      return
    }
    const start = performance.now()
    const startView = { tx: this.tx, ty: this.ty, zoom: this.zoom }
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / TWEEN_DURATION)
      const e = 1 - Math.pow(1 - t, 3)
      for (const [id, p] of target) {
        const f = from.get(id) ?? p
        this.positions.set(id, { x: f.x + (p.x - f.x) * e, y: f.y + (p.y - f.y) * e })
      }
      this.tx = startView.tx + (view.tx - startView.tx) * e
      this.ty = startView.ty + (view.ty - startView.ty) * e
      this.zoom = startView.zoom + (view.zoom - startView.zoom) * e
      this.requestUpdate()
      if (t < 1) this.tween = requestAnimationFrame(step)
      else this.positions = target
    }
    this.tween = requestAnimationFrame(step)
  }

  private setDirection(direction: FlowDirection) {
    if (direction === this.direction) return
    const from = new Map(this.positions)
    this.direction = direction
    this.pinned = {}
    this.custom = false
    this.relayout()
    this.save()
    this.animateFrom(from)
    this.emitLayout('direction')
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Selection

  private select(id: string | null, click = false) {
    this.selectedEdge = null
    const node = id ? (this.byId.get(id) ?? null) : null
    if (id !== this.selected) {
      this.selected = id
      this.dispatchEvent(new CustomEvent<FlowSelectionChangeDetail>('selection-change', { detail: { selected: id, node } }))
    }
    if (click && node) this.dispatchEvent(new CustomEvent<FlowNodeEventDetail>('node-click', { detail: { node } }))
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Pointer

  private nodeIdFromEvent(event: Event): string | null {
    for (const target of event.composedPath()) {
      if (target === this) break
      if (target instanceof HTMLElement && target.dataset.nodeId !== undefined && target.classList.contains('node')) return target.dataset.nodeId
    }
    return null
  }

  /** Whether the event comes from (or through) an element of the shadow root carrying `className`. */
  private fromPart(event: Event, className: string) {
    for (const target of event.composedPath()) {
      if (target === this) break
      if (target instanceof Element && target.classList.contains(className)) return target
    }
    return null
  }

  /** The edge under the event: its hit band or its label. */
  private edgeKeyFromEvent(event: Event): string | null {
    const part = (this.fromPart(event, 'edge-hit') ?? this.fromPart(event, 'edge-label')) as HTMLElement | SVGElement | null
    return part?.dataset.edgeKey ?? null
  }

  /** Viewport coordinates to canvas pixels. */
  private toCanvas(clientX: number, clientY: number): FlowPoint {
    const stage = this.stage
    if (!stage) return { x: 0, y: 0 }
    const rect = stage.getBoundingClientRect()
    return { x: (clientX - rect.left - stage.clientLeft - this.tx) / this.zoom, y: (clientY - rect.top - stage.clientTop - this.ty) / this.zoom }
  }

  /** The topmost node under a point in canvas pixels. */
  private nodeAt(point: FlowPoint): string | null {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const id = this.nodes[i].id
      const p = this.positions.get(id)
      const size = this.sizeOf(id)
      if (p && point.x >= p.x && point.x <= p.x + size.width && point.y >= p.y && point.y <= p.y + size.height) return id
    }
    return null
  }

  /** The rectangle node `id` takes, in canvas pixels. */
  private rectOf(id: string, positions: Map<string, FlowPoint> = this.positions) {
    const p = positions.get(id)
    return p ? { ...p, ...this.sizeOf(id) } : null
  }

  /**
   * Where a connection from `source` dragged to `point` would arrive: the node whose side handle is under the point
   * (handles reach past the node's box), else the topmost node under the point, by its side nearest the point. Ties
   * go to the incoming side of the direction. On a node with rows, the handles are those of its rows and the point
   * picks the row it is level with, by its left or right side; a connection from a row may end on another row of its
   * own node.
   */
  private dropTarget(point: FlowPoint, source: string, sourcePort?: string): { target: string | null; side: FlowSide | null; port?: string } {
    // The handle's visible radius plus the 6px of hit area round it (`.connector::before`).
    const reach = this.readPixels('--c2-flow__connector--size', 12) / 2 + 6
    const near = (handle: FlowPoint) => Math.hypot(point.x - handle.x, point.y - handle.y) <= reach
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const id = this.nodes[i].id
      const rect = this.rectOf(id)
      const ports = this.ports.get(id)
      if (!rect || (id === source && !(sourcePort && ports))) continue
      if (ports) {
        for (const [port, box] of ports) {
          if (id === source && port === sourcePort) continue
          for (const side of ['left', 'right'] as const) if (near(rowPoint(rect, side, box.top, box.height))) return { target: id, side, port }
        }
        continue
      }
      for (const side of FLOW_SIDES) if (near(sidePoint(rect, side))) return { target: id, side }
    }
    const target = this.nodeAt(point)
    const rect = target === null ? null : this.rectOf(target)
    if (target === null || !rect) return { target: null, side: null }
    const side: FlowSide = point.x < rect.x + rect.width / 2 ? 'left' : 'right'
    for (const [port, box] of this.ports.get(target) ?? []) {
      if (point.y >= rect.y + box.top && point.y <= rect.y + box.top + box.height) {
        return target === source && (!sourcePort || port === sourcePort) ? { target: null, side: null } : { target, side, port }
      }
    }
    const incoming = defaultSides(this.direction).target
    return { target, side: nearestSide(rect, point, [incoming, ...FLOW_SIDES.filter((side) => side !== incoming)]) }
  }

  /** A second press on the same thing, soon after and close to the first: a double click, or a double tap. */
  private isDoubleTap(target: string, event: PointerEvent) {
    const last = this.lastTap
    const tap = { target, time: event.timeStamp, x: event.clientX, y: event.clientY }
    const double =
      !!last && last.target === target && tap.time - last.time < DOUBLE_TAP_TIME && Math.hypot(tap.x - last.x, tap.y - last.y) < DOUBLE_TAP_DISTANCE
    this.lastTap = double ? null : tap
    return double
  }

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !this.stage || this.fromPart(event, 'label-editor')) return
    const id = this.nodeIdFromEvent(event)
    const connector = this.editable && id ? (this.fromPart(event, 'connector') as HTMLElement | null) : null
    const grip = this.editable && id ? (this.fromPart(event, 'row-grip') as HTMLElement | null) : null
    if (id && grip) {
      const row = grip.closest<HTMLElement>('[data-flow-port]')?.dataset.flowPort
      if (row) this.rowDrag = { node: id, row, startY: event.clientY, moved: false, pointerId: event.pointerId }
    } else if (id && connector) {
      const side = isSide(connector.dataset.side) ? connector.dataset.side : defaultSides(this.direction).source
      const port = portId(connector.dataset.port)
      this.connectDrag = { source: id, side, port, startX: event.clientX, startY: event.clientY, moved: false, pointerId: event.pointerId }
    } else if (id) {
      // A locked flow still tracks the press on a node, so it can tell a click from a pan.
      const more = !!this.fromPart(event, 'row-more')
      this.drag = { id, startX: event.clientX, startY: event.clientY, origin: { ...this.positions.get(id)! }, moved: false, pointerId: event.pointerId, more }
    } else {
      const edge = this.editable ? this.edgeKeyFromEvent(event) : null
      this.pan = { startX: event.clientX, startY: event.clientY, tx: this.tx, ty: this.ty, moved: false, pointerId: event.pointerId, edge }
    }
    this.stage.setPointerCapture(event.pointerId)
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (this.rowDrag && event.pointerId === this.rowDrag.pointerId) {
      const drag = this.rowDrag
      if (!drag.moved && Math.abs(event.clientY - drag.startY) < DRAG_THRESHOLD) return
      if (!drag.moved) {
        drag.moved = true
        this.hideCard(true)
      }
      const node = this.byId.get(drag.node)
      const p = this.positions.get(drag.node)
      if (!node || !p) return
      // The slot among the other shown rows the pointer is past the middle of.
      const y = this.toCanvas(event.clientX, event.clientY).y - p.y
      const ports = this.ports.get(drag.node)
      const others = this.visibleRows(node).shown.filter((row) => row.id !== drag.row)
      const to = others.filter((row) => {
        const box = ports?.get(row.id)
        return !!box && box.top + box.height / 2 < y
      }).length
      if (this.rowMove?.to !== to || this.rowMove.row !== drag.row) {
        this.rowMove = { node: drag.node, row: drag.row, to, pointer: true }
        this.portsDirty = true
      }
      return
    }
    if (this.connectDrag && event.pointerId === this.connectDrag.pointerId) {
      const { source, side, port, startX, startY } = this.connectDrag
      if (!this.connectDrag.moved && Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return
      if (!this.connectDrag.moved) {
        this.connectDrag.moved = true
        this.hideCard(true)
      }
      const point = this.toCanvas(event.clientX, event.clientY)
      const { target, side: targetSide, port: targetPort } = this.dropTarget(point, source, port)
      this.connection = { source, sourceSide: side, sourcePort: port, point, target, targetPort, targetSide, keyboard: false }
    } else if (this.drag && event.pointerId === this.drag.pointerId) {
      const dx = event.clientX - this.drag.startX
      const dy = event.clientY - this.drag.startY
      if (!this.drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (this.locked) return
      if (!this.drag.moved) {
        this.drag.moved = true
        this.draggingId = this.drag.id
        this.hideCard(true)
      }
      this.positions.set(this.drag.id, { x: this.drag.origin.x + dx / this.zoom, y: this.drag.origin.y + dy / this.zoom })
      this.requestUpdate()
    } else if (this.pan && event.pointerId === this.pan.pointerId) {
      const dx = event.clientX - this.pan.startX
      const dy = event.clientY - this.pan.startY
      if (!this.pan.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      if (!this.pan.moved) {
        this.pan.moved = true
        this.panning = true
        this.viewTouched = true
        this.hideCard(true)
      }
      this.tx = this.pan.tx + dx
      this.ty = this.pan.ty + dy
    }
  }

  private handlePointerUp = (event: PointerEvent) => {
    const released = event.type === 'pointerup'
    if (this.rowDrag && event.pointerId === this.rowDrag.pointerId) {
      const { moved } = this.rowDrag
      const move = this.rowMove
      this.rowDrag = null
      this.endRowMove()
      if (moved && released && move) this.moveRow(move.node, move.row, move.to)
      return
    }
    if (this.connectDrag && event.pointerId === this.connectDrag.pointerId) {
      const { source, moved } = this.connectDrag
      const connection = this.connection
      this.connectDrag = null
      this.connection = null
      if (!moved) {
        if (released) this.select(source, true)
      } else if (released && connection?.point) this.finishConnection(connection)
    }
    if (this.drag && event.pointerId === this.drag.pointerId) {
      const { id, moved, more } = this.drag
      this.drag = null
      this.draggingId = null
      if (moved) this.commitCustomLayout()
      else if (released && more) this.userToggleRows(id)
      else if (released) {
        this.select(id, true)
        if (this.editable && this.isDoubleTap(`node:${id}`, event)) void this.editLabel(id)
      }
    }
    if (this.pan && event.pointerId === this.pan.pointerId) {
      const { moved, edge } = this.pan
      this.pan = null
      this.panning = false
      if (!moved && released) {
        if (edge) {
          this.selectEdge(edge)
          // Delete and F2 act on the selected edge from wherever focus is in the flow; when it is outside (a click on an
          // edge, unlike one on a node, focuses nothing), the canvas takes it while the edge is selected, so they
          // reach the flow at all.
          if (!(this.renderRoot as ShadowRoot).activeElement) void this.updateComplete.then(() => this.stage?.focus({ preventScroll: true }))
          if (this.edgeByKey(edge) && this.isDoubleTap(`edge:${edge}`, event)) void this.openEdgeEditor(edge)
        } else {
          this.select(null)
          if (this.editable && !this.noDoubleClickAdd && this.isDoubleTap('canvas', event)) {
            this.requestNode(this.centred(this.toCanvas(event.clientX, event.clientY)))
          }
        }
      }
    }
  }

  private commitCustomLayout() {
    this.pinned = this.getLayout()
    this.custom = true
    this.save()
    this.emitLayout('drag')
  }

  /**
   * The stage clips its content but is still a scroll container: focusing a node out of sight (a click on one cut by
   * the edge, the keyboard, a node just added) makes the browser scroll it, which shifts the drawing without the pan
   * the pointer maths use. Fold any such scroll into the pan, so the node stays in sight and drags stay under the pointer.
   */
  private handleStageScroll = () => {
    const stage = this.stage
    if (!stage || (!stage.scrollLeft && !stage.scrollTop)) return
    this.tx -= stage.scrollLeft
    this.ty -= stage.scrollTop
    stage.scrollLeft = 0
    stage.scrollTop = 0
    this.viewTouched = true
  }

  private handleWheel = (event: WheelEvent) => {
    // A plain wheel scrolls the page; Ctrl/⌘ (and a trackpad pinch, which reports ctrlKey) zooms.
    if (!(event.ctrlKey || event.metaKey) || !this.stage) return
    event.preventDefault()
    const rect = this.stage.getBoundingClientRect()
    this.zoomAround(Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left, event.clientY - rect.top)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Editing

  private labelOf = (id: string) => this.byId.get(id)?.label ?? id

  /** The label of a row: its `label` in `rows`, else its id (a port of a custom body). */
  private rowLabel(id: string, port: string) {
    return this.rowOf(id, port)?.label ?? port
  }

  private rowOf(id: string, port: string): FlowNodeRow | undefined {
    const rows = this.byId.get(id)?.rows
    return Array.isArray(rows) ? rows.find((row) => row?.id === port) : undefined
  }

  /** The row limit of node `id`: its own `rowLimit`, else the flow's; 0 for none. */
  private limitOf(node: FlowNode) {
    const limit = Number(node.rowLimit ?? this.rowLimit)
    return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 0
  }

  /**
   * The rows of `node` that show and those folded into its "+ N more" row: past its limit, only the rows an edge meets
   * show, unless the user opened the node.
   */
  private visibleRows(node: FlowNode): { shown: FlowNodeRow[]; hidden: FlowNodeRow[] } {
    const rows = rowsOf(node)
    const limit = this.limitOf(node)
    if (!limit || rows.length <= limit || this.expanded.has(node.id)) return { shown: rows, hidden: [] }
    const linked = this.linkedPorts.get(node.id) ?? new Set<string>()
    const shown: FlowNodeRow[] = []
    const hidden: FlowNodeRow[] = []
    rows.forEach((row, index) => (index < limit || linked.has(row.id) ? shown : hidden).push(row))
    return { shown, hidden }
  }

  /** Whether node `id` has rows past its limit to show or fold, open or not. */
  private foldsRows(id: string) {
    const node = this.byId.get(id)
    if (!node) return false
    const limit = this.limitOf(node)
    return !!limit && rowsOf(node).length > limit && (this.expanded.has(id) || this.visibleRows(node).hidden.length > 0)
  }

  /** The user toggled the rows of node `id`: as `toggleRows`, and reported. */
  private userToggleRows(id: string) {
    if (!this.foldsRows(id)) return
    this.toggleRows(id)
    const expanded = this.expanded.has(id)
    this.hideCard(true)
    this.announce(this.msg.t(expanded ? 'rowsShown' : 'rowsFolded', this.labelOf(id)))
    this.dispatchEvent(new CustomEvent<FlowRowsToggleDetail>('rows-toggle', { detail: { id, expanded } }))
  }

  /** Stops showing a row being moved anywhere but in its own place. */
  private endRowMove() {
    if (!this.rowMove) return
    this.rowMove = null
    this.portsDirty = true
  }

  /**
   * Asks for row `row` of node `id` to go to slot `to` among the node's other shown rows (its folded rows keep their
   * place): fires `row-move` with its indices in `rows`. Returns whether it moved.
   */
  private moveRow(id: string, row: string, to: number) {
    const node = this.byId.get(id)
    if (!node || !this.editable) return false
    // Indices into the node's own `rows`, malformed entries included, since that is the array the application moves in.
    const raw = Array.isArray(node.rows) ? node.rows : []
    const moving = rowsOf(node).find((r) => r.id === row)
    const from = moving ? raw.indexOf(moving) : -1
    if (!moving || from < 0) return false
    const rest = raw.filter((r) => r !== moving)
    const others = this.visibleRows(node).shown.filter((r) => r !== moving)
    const slot = Math.max(0, Math.min(to, others.length))
    // Before the shown row now in that slot, or just after the last shown row.
    const index = slot < others.length ? rest.indexOf(others[slot]) : rest.indexOf(others[others.length - 1]) + 1
    if (index === from) return false
    this.dispatchEvent(new CustomEvent<FlowRowMoveDetail>('row-move', { detail: { id, row, from, to: index } }))
    return true
  }

  /** The slot of row `row` among the shown rows of node `id`, and how many there are. */
  private rowSlot(id: string, row: string) {
    const node = this.byId.get(id)
    const shown = node ? this.visibleRows(node).shown : []
    return { index: shown.findIndex((r) => r.id === row), total: shown.length }
  }

  /** `R` on a node with rows: picks its first row to move, until Enter or Escape. */
  private startRowKeyboard(id: string) {
    const node = this.byId.get(id)
    const shown = node ? this.visibleRows(node).shown : []
    if (!node || shown.length < 2) return false
    this.hideCard(true)
    const row = shown[0]
    this.rowMove = { node: id, row: row.id, to: 0, pointer: false }
    this.announce(this.msg.t('rowMovePrompt', node.label, row.label, 1, shown.length))
    return true
  }

  private handleRowKey(event: KeyboardEvent, move: { node: string; row: string; to: number; pointer: boolean }) {
    const step = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[event.key]
    if (step) {
      event.preventDefault()
      const node = this.byId.get(move.node)
      const shown = node ? this.visibleRows(node).shown : []
      const { index } = this.rowSlot(move.node, move.row)
      if (event.altKey) {
        // Alt moves the row; the application reorders `rows`, and the row stays the one picked.
        if (this.moveRow(move.node, move.row, index + step)) {
          const at = Math.max(0, Math.min(shown.length - 1, index + step))
          this.announce(this.msg.t('rowMoved', this.rowLabel(move.node, move.row), at + 1, shown.length))
        }
        return
      }
      const next = shown[Math.max(0, Math.min(shown.length - 1, index + step))]
      if (next && next.id !== move.row) {
        this.rowMove = { ...move, row: next.id }
        this.announce(this.msg.t('rowPicked', next.label, shown.indexOf(next) + 1, shown.length))
      }
    } else if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.rowMove = null
      this.announce(this.msg.t('rowMoveEnded'))
    }
  }

  /** "orders.customer_id" for an end on a row, else the node's label. */
  private endLabel(id: string, port?: string) {
    return port ? `${this.labelOf(id)}.${this.rowLabel(id, port)}` : this.labelOf(id)
  }

  private hasEdge(source: string, target: string, sourcePort?: string, targetPort?: string) {
    const key = edgeKey({ source, target, sourcePort, targetPort })
    return this.edges.some((edge) => edgeKey(edge) === key)
  }

  /**
   * Whether connecting `source` to `target` would make a new edge: no duplicate, and no self-loop except between two
   * different rows of one node (a table referencing itself).
   */
  private canConnect(source: string, target: string | null, sourcePort?: string, targetPort?: string): target is string {
    if (target === null || !this.byId.has(target)) return false
    if (target === source && !(sourcePort && targetPort && sourcePort !== targetPort)) return false
    return !this.hasEdge(source, target, sourcePort, targetPort)
  }

  private edgeByKey(key: string | null): FlowEdge | null {
    return key === null ? null : (this.edges.find((edge) => edgeKey(edge) === key) ?? null)
  }

  private announce(text: string) {
    this.announcement = text
  }

  /** The size a new node is expected to take: that of a measured node, or the estimate. */
  private typicalSize(): FlowSize {
    return this.sizes.values().next().value ?? ESTIMATED_SIZE
  }

  /** Top-left corner that centres a typical node on `point`. */
  private centred(point: FlowPoint): FlowPoint {
    const size = this.typicalSize()
    return { x: point.x - size.width / 2, y: point.y - size.height / 2 }
  }

  /** Top-left corner for a node dropped at `point` at the end of a connection: the middle of its side `side` on the point. */
  private sideAt(point: FlowPoint, side: FlowSide): FlowPoint {
    const size = this.typicalSize()
    const offset = sidePoint({ x: 0, y: 0, ...size }, side)
    return { x: point.x - offset.x, y: point.y - offset.y }
  }

  /** A spot near `start` that no node covers, for the nodes the keyboard asks for. */
  private freeSpot(start: FlowPoint): FlowPoint {
    const id = '\u0000new'
    const size = this.typicalSize()
    return avoidOverlap(id, start, [...this.positions.keys()], this.positions, (key) => (key === id ? size : this.sizeOf(key)), this.layoutOptions())
  }

  private requestNode(position: FlowPoint, source?: string, fromKeyboard = false, sides?: { source: FlowSide; target: FlowSide }, sourcePort?: string) {
    if (fromKeyboard) this.focusAdded = new Set(this.byId.keys())
    const detail: FlowNodeAddDetail = { position: { x: Math.round(position.x), y: Math.round(position.y) } }
    if (source !== undefined) detail.source = source
    if (source !== undefined && sides) {
      detail.sourceSide = sides.source
      detail.targetSide = sides.target
    }
    if (source !== undefined && sourcePort) detail.sourcePort = sourcePort
    this.dispatchEvent(new CustomEvent<FlowNodeAddDetail>('node-add', { detail }))
  }

  /**
   * The node that last had focus while focus is still in the flow: a toolbar button takes focus before its `click`
   * calls `addNode()`, and the node the user was on should still count.
   */
  private lastFocusedNode(): string | null {
    const id = this.lastFocusedId
    return id !== null && this.byId.has(id) ? id : null
  }

  /** The node that has focus, if focus is on one. */
  private focusedNodeId(): string | null {
    const active = (this.renderRoot as ShadowRoot).activeElement
    const id = active instanceof HTMLElement ? (active.closest<HTMLElement>('.node')?.dataset.nodeId ?? null) : null
    return id !== null && this.byId.has(id) ? id : null
  }

  /**
   * `N` and `addNode()`: a node next to `id`, connected after it when `connect` (the next rank along the layout's
   * axis), else beside it (the next spot across the axis); without `id`, one in the middle of the view. Always in a
   * spot no node covers.
   */
  private requestNodeNearby(id: string | null, connect: boolean) {
    const p = id !== null ? this.positions.get(id) : undefined
    if (id !== null && p) {
      const size = this.sizeOf(id)
      const { rankGap, nodeGap } = this.layoutOptions()
      const lr = this.direction === 'LR'
      const start = connect
        ? lr
          ? { x: p.x + size.width + rankGap, y: p.y }
          : { x: p.x, y: p.y + size.height + rankGap }
        : lr
          ? { x: p.x, y: p.y + size.height + nodeGap }
          : { x: p.x + size.width + nodeGap, y: p.y }
      this.requestNode(this.freeSpot(start), connect ? id : undefined, true)
      return
    }
    const stage = this.stage
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    this.requestNode(this.freeSpot(this.centred(this.toCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2))), undefined, true)
  }

  /**
   * Starts dragging a new node onto the canvas from outside it, the way a design tool drags a shape from its toolbar:
   * call it from the `pointerdown` of a button in the `actions` slot. While the pointer is over the canvas a
   * placeholder follows it; releasing there fires `node-add` at that spot (moved aside if it would cover a node), and
   * the node is then selected and focused like one `addNode()` asked for. Released elsewhere (the toolbar included),
   * or Escape, cancels. A press that does not move, or comes back to the button, adds nothing here, so the same
   * button can call `addNode()` on `click`. On a touch screen,
   * give the button `touch-action: none` so the drag is not taken as a page scroll. Does nothing unless `editable`.
   */
  dragNewNode(event: PointerEvent): void {
    if (!this.editable || (event.pointerType === 'mouse' && event.button !== 0)) return
    this.endNewNodeDrag()
    this.newNodeDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, moved: false }
    window.addEventListener('pointermove', this.handleNewNodeMove)
    window.addEventListener('pointerup', this.handleNewNodeUp)
    window.addEventListener('pointercancel', this.endNewNodeDrag)
    window.addEventListener('keydown', this.handleNewNodeKey, true)
  }

  /**
   * Canvas position of a new node centred on a viewport point, or null when the point is outside the canvas or over
   * the actions toolbar: a press that wanders a few pixels and is released back on the add button is that button's
   * click, not a drop under the toolbar as well. The toolbar is the visible panel (the slot's box), not the `.actions`
   * strip that positions it along the whole edge: canvas beside the panel still takes a drop.
   */
  private dropPoint(clientX: number, clientY: number): FlowPoint | null {
    const inside = (rect: DOMRect | undefined) => !!rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    if (!inside(this.stage?.getBoundingClientRect())) return null
    const actions = this.renderRoot.querySelector<HTMLElement>('.actions')
    const panel = actions?.querySelector('slot')
    if (actions && !actions.hidden && panel && inside(panel.getBoundingClientRect())) return null
    return this.centred(this.toCanvas(clientX, clientY))
  }

  private handleNewNodeMove = (event: PointerEvent) => {
    const drag = this.newNodeDrag
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
    drag.moved = true
    event.preventDefault()
    this.ghost = this.dropPoint(event.clientX, event.clientY)
  }

  private handleNewNodeUp = (event: PointerEvent) => {
    const drag = this.newNodeDrag
    if (!drag || event.pointerId !== drag.pointerId) return
    const point = drag.moved ? this.dropPoint(event.clientX, event.clientY) : null
    this.endNewNodeDrag()
    if (point) this.requestNode(this.freeSpot(point), undefined, true)
  }

  private handleNewNodeKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !this.newNodeDrag) return
    event.preventDefault()
    event.stopPropagation()
    this.endNewNodeDrag()
  }

  private endNewNodeDrag = () => {
    this.newNodeDrag = null
    this.ghost = null
    window.removeEventListener('pointermove', this.handleNewNodeMove)
    window.removeEventListener('pointerup', this.handleNewNodeUp)
    window.removeEventListener('pointercancel', this.endNewNodeDrag)
    window.removeEventListener('keydown', this.handleNewNodeKey, true)
  }

  /** Pans the view, if needed, so node `id` is in sight with a margin; the zoom stays as it is. */
  private reveal(id: string) {
    const stage = this.stage
    const p = this.positions.get(id)
    if (!stage || !p) return
    const size = this.sizeOf(id)
    const shift = (start: number, length: number, room: number) => {
      const end = start + length
      // Too big to fit: show its start.
      if (length > room - FIT_PADDING * 2 || start < FIT_PADDING) return FIT_PADDING - start
      return end > room - FIT_PADDING ? room - FIT_PADDING - end : 0
    }
    const dx = shift(p.x * this.zoom + this.tx, size.width * this.zoom, stage.clientWidth)
    const dy = shift(p.y * this.zoom + this.ty, size.height * this.zoom, stage.clientHeight)
    if (!dx && !dy) return
    this.tx += dx
    this.ty += dy
    this.viewTouched = true
  }

  /**
   * Ends a connection: an edge to its target, or a new connected node at its point when there is no target, placed
   * with the side facing the source (opposite the source side) on the point.
   */
  private finishConnection({ source, sourceSide, sourcePort, target, targetSide, targetPort, point }: Connection) {
    if (target === null) {
      const side = oppositeSide(sourceSide)
      if (point) this.requestNode(this.sideAt(point, side), source, false, { source: sourceSide, target: side }, sourcePort)
      return
    }
    if (!this.canConnect(source, target, sourcePort, targetPort)) return
    const detail: FlowEdgeAddDetail = { source, target, ...portsOf({ source, target, sourcePort, targetPort }) }
    // An end on a row faces the other end by itself, wherever the nodes later move: its side is left out, so an
    // application storing the detail does not pin it.
    if (!detail.sourcePort) detail.sourceSide = sourceSide
    if (!detail.targetPort) detail.targetSide = targetSide ?? defaultSides(this.direction).target
    this.dispatchEvent(new CustomEvent<FlowEdgeAddDetail>('edge-add', { detail }))
  }

  private cancelConnection() {
    this.connection = null
    this.connectDrag = null
  }

  /** The nodes a connection from `source` can go to, in reading order: along the layout's main axis, then across. */
  private connectionTargets(source: string) {
    const [main, cross] = this.direction === 'LR' ? (['x', 'y'] as const) : (['y', 'x'] as const)
    const at = (id: string) => this.positions.get(id) ?? { x: 0, y: 0 }
    return this.nodes
      .map((node) => node.id)
      .filter((id) => this.canConnect(source, id))
      .sort((a, b) => at(a)[main] - at(b)[main] || at(a)[cross] - at(b)[cross])
  }

  private startKeyboardConnection(source: string) {
    const targets = this.connectionTargets(source)
    if (!targets.length) {
      this.announce(this.msg.t('alreadyConnected', this.labelOf(source)))
      return
    }
    this.hideCard(true)
    const main = this.direction === 'LR' ? 'x' : 'y'
    const from = this.positions.get(source)![main]
    const target = targets.find((id) => this.positions.get(id)![main] > from) ?? targets[0]
    const sides = defaultSides(this.direction)
    this.connection = { source, sourceSide: sides.source, point: null, target, targetSide: sides.target, keyboard: true }
    this.announce(this.msg.t('connectPrompt', this.labelOf(source), this.labelOf(target)))
  }

  private handleConnectionKey(event: KeyboardEvent, connection: Connection) {
    const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1, Tab: event.shiftKey ? -1 : 1 } as Record<string, number>)[event.key]
    if (step) {
      event.preventDefault()
      const targets = this.connectionTargets(connection.source)
      if (!targets.length) return
      const index = targets.indexOf(connection.target ?? '')
      const next = index < 0 ? 0 : (index + step + targets.length) % targets.length
      this.connection = { ...connection, target: targets[next] }
      this.announce(this.msg.t('connectTarget', this.labelOf(targets[next]), next + 1, targets.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      this.connection = null
      if (this.canConnect(connection.source, connection.target)) {
        this.finishConnection({ ...connection, point: null })
        this.announce(this.msg.t('connected', this.labelOf(connection.source), this.labelOf(connection.target)))
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.cancelConnection()
      this.announce(this.msg.t('connectionCancelled'))
    }
  }

  /** `position` of `total` when `E` steps through several edges of a node; `total` 0 otherwise. */
  private selectEdge(key: string, position = 0, total = 0) {
    const edge = this.edgeByKey(key)
    if (!edge) return
    this.select(null)
    this.selectedEdge = key
    this.hideCard(true)
    const [source, target] = [this.endLabel(edge.source, portId(edge.sourcePort)), this.endLabel(edge.target, portId(edge.targetPort))]
    this.announce(this.msg.t('edgeSelected', source, target, edge.label?.trim() ?? '', position, total))
  }

  /** `E` on a node: selects its edges one after the other. */
  private stepEdges(id: string) {
    const keys = [...new Set(this.edges.filter((edge) => edge.source === id || edge.target === id).map((edge) => edgeKey(edge)))]
    if (!keys.length) {
      this.announce(this.msg.t('noEdges', this.labelOf(id)))
      return
    }
    const index = (keys.indexOf(this.selectedEdge ?? '') + 1) % keys.length
    this.selectEdge(keys[index], index + 1, keys.length > 1 ? keys.length : 0)
  }

  private deleteNode(id: string, fromKeyboard = false) {
    if (fromKeyboard) {
      const index = this.nodes.findIndex((node) => node.id === id)
      const next = this.graph.predecessors.get(id)?.[0] ?? this.graph.successors.get(id)?.[0] ?? this.nodes[index + 1]?.id ?? this.nodes[index - 1]?.id ?? null
      this.refocus = { removed: id, next }
    }
    this.dispatchEvent(new CustomEvent<FlowNodeDeleteDetail>('node-delete', { detail: { id } }))
  }

  private deleteEdge(edge: FlowEdge) {
    this.dispatchEvent(new CustomEvent<FlowEdgeEventDetail>('edge-delete', { detail: { source: edge.source, target: edge.target, ...portsOf(edge) } }))
  }

  private commitEdgeEdit(refocus: boolean) {
    const key = this.editingEdge
    if (key === null) return
    const label = this.renderRoot.querySelector<HTMLInputElement>('.label-editor--edge')?.value.trim() ?? ''
    this.editingEdge = null
    const edge = this.edgeByKey(key)
    if (edge && label !== (edge.label ?? '').trim()) {
      this.dispatchEvent(new CustomEvent<FlowEdgeEditDetail>('edge-edit', { detail: { source: edge.source, target: edge.target, ...portsOf(edge), label } }))
    }
    if (refocus) this.refocusAfterEdgeEdit()
  }

  /** Back to the node keyboard focus was on, or to the canvas. */
  private refocusAfterEdgeEdit() {
    if (this.focusId !== null && this.byId.has(this.focusId)) void this.focusNode(this.focusId)
    else void this.updateComplete.then(() => this.stage?.focus())
  }

  private commitEdit(refocus: boolean) {
    if (this.editingEdge !== null) return this.commitEdgeEdit(refocus)
    const id = this.editingId
    if (id === null) return
    const label = this.renderRoot.querySelector<HTMLInputElement>('.label-editor')?.value.trim() ?? ''
    this.editingId = null
    const node = this.byId.get(id)
    if (node && label && label !== node.label) this.dispatchEvent(new CustomEvent<FlowNodeEditDetail>('node-edit', { detail: { id, label } }))
    if (refocus) void this.focusNode(id)
  }

  private handleEditorKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      this.commitEdit(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (this.editingEdge !== null) {
        this.editingEdge = null
        this.refocusAfterEdgeEdit()
        return
      }
      const id = this.editingId
      this.editingId = null
      if (id !== null) void this.focusNode(id)
    }
  }

  private handleEditorBlur = () => this.commitEdit(false)

  /** The editing shortcuts. Returns whether the key was one of them. */
  private handleEditKey(event: KeyboardEvent, id: string | null): boolean {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const edge = this.edgeByKey(this.selectedEdge)
      if (edge) this.deleteEdge(edge)
      else if (id !== null) this.deleteNode(id, true)
      else return false
      event.preventDefault()
      return true
    }
    if (this.selectedEdge !== null && this.edgeByKey(this.selectedEdge) && (event.key === 'F2' || (event.key === 'Enter' && !event.shiftKey))) {
      event.preventDefault()
      void this.openEdgeEditor(this.selectedEdge)
      return true
    }
    if (plainKey(event, 'n')) {
      event.preventDefault()
      this.requestNodeNearby(id, id !== null && id === this.selected)
      return true
    }
    if (id === null) {
      // The empty canvas, the only place that takes focus when there is no node.
      if (event.key !== 'Enter' || this.nodes.length) return false
      event.preventDefault()
      this.requestNodeNearby(null, false)
      return true
    }
    if (event.key === 'F2' || (event.key === 'Enter' && id === this.selected && !event.shiftKey)) {
      event.preventDefault()
      this.select(id)
      void this.editLabel(id)
      return true
    }
    if (plainKey(event, 'c')) {
      event.preventDefault()
      this.startKeyboardConnection(id)
      return true
    }
    if (plainKey(event, 'r') && this.startRowKeyboard(id)) {
      event.preventDefault()
      return true
    }
    if (plainKey(event, 'e')) {
      event.preventDefault()
      this.stepEdges(id)
      return true
    }
    return false
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Keyboard

  private handleKeydown = (event: KeyboardEvent) => {
    // The label editor handles its own keys.
    if (this.fromPart(event, 'label-editor')) return
    if (this.connection?.keyboard) return this.handleConnectionKey(event, this.connection)
    if (this.rowMove && !this.rowMove.pointer) return this.handleRowKey(event, this.rowMove)
    if (this.rowDrag?.moved && event.key === 'Escape') {
      // Escape while dragging a row puts it back.
      event.stopPropagation()
      this.rowDrag = null
      this.endRowMove()
      return
    }
    if (this.connection && event.key === 'Escape') {
      event.stopPropagation()
      this.cancelConnection()
      return
    }
    const id = this.nodeIdFromEvent(event)
    if (event.key === 'Escape') {
      if (this.cardId) {
        this.hideCard(true)
        event.stopPropagation()
      } else if (this.selectedEdge) {
        this.selectedEdge = null
        event.stopPropagation()
      } else if (this.selected) this.select(null)
      return
    }
    if (matchesKeys(ZOOM_IN_KEYS, event)) return this.keyZoom(event, ZOOM_STEP)
    if (matchesKeys(ZOOM_OUT_KEYS, event)) return this.keyZoom(event, 1 / ZOOM_STEP)
    if (matchesKeys(FIT_KEYS, event)) {
      event.preventDefault()
      this.viewTouched = false
      this.fitView()
      return
    }
    if (id && event.key === 'Enter' && event.shiftKey && this.foldsRows(id)) {
      event.preventDefault()
      this.userToggleRows(id)
      return
    }
    if (this.editable && this.handleEditKey(event, id)) return
    if (!id) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      this.select(id, true)
      return
    }
    const arrow = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[event.key]
    if (!arrow) return
    event.preventDefault()
    if (event.altKey) {
      if (this.locked) return
      const step = event.shiftKey ? NUDGE_LARGE : NUDGE
      const p = this.positions.get(id)!
      this.positions.set(id, { x: p.x + arrow[0] * step, y: p.y + arrow[1] * step })
      this.commitCustomLayout()
      this.requestUpdate()
      return
    }
    const horizontal = this.direction === 'LR'
    const along = horizontal ? arrow[0] : arrow[1]
    const across = horizontal ? arrow[1] : arrow[0]
    let next: string | undefined
    if (along > 0) next = this.nearest(id, this.graph.successors.get(id) ?? [])
    else if (along < 0) next = this.nearest(id, this.graph.predecessors.get(id) ?? [])
    else {
      const layer = [...(this.layers[this.rank.get(id) ?? 0] ?? [])]
      const axis = horizontal ? 'y' : 'x'
      layer.sort((a, b) => this.positions.get(a)![axis] - this.positions.get(b)![axis])
      next = layer[layer.indexOf(id) + across]
    }
    if (next) {
      this.selectedEdge = null
      void this.focusNode(next)
    }
  }

  /** Of `candidates`, the one closest to `id` on the cross axis: arrowing forward goes straight ahead first. */
  private nearest(id: string, candidates: string[]) {
    const axis = this.direction === 'LR' ? 'y' : 'x'
    const from = this.positions.get(id)![axis]
    return [...candidates].sort((a, b) => Math.abs(this.positions.get(a)![axis] - from) - Math.abs(this.positions.get(b)![axis] - from))[0]
  }

  private keyZoom(event: KeyboardEvent, factor: number) {
    event.preventDefault()
    this.zoomAround(factor)
  }

  private async focusNode(id: string) {
    this.focusId = id
    await this.updateComplete
    this.renderRoot.querySelector<HTMLElement>(`.node[data-node-id="${CSS.escape(id)}"]`)?.focus()
  }

  private handleFocusIn = (event: FocusEvent) => {
    const id = this.nodeIdFromEvent(event)
    if (!id) return
    // Reordering from the keyboard belongs to the node it started on.
    if (this.rowMove && !this.rowMove.pointer && this.rowMove.node !== id) this.rowMove = null
    this.lastFocusedId = id
    this.focusId = id
    this.highlightId = id
    this.scheduleCard(id)
  }

  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    // A keyboard connection lasts while focus stays in the flow.
    if (this.connection?.keyboard && !(next && this.renderRoot.contains(next))) this.cancelConnection()
    if (this.rowMove && !this.rowMove.pointer && !(next && this.renderRoot.contains(next))) this.rowMove = null
    if (next && (this.card?.contains(next) || this.contains(next))) return
    this.highlightId = null
    this.scheduleCardClose()
  }

  /**
   * Focus left the flow altogether, from a node or from the toolbar (which counts as inside): a later `addNode()` no
   * longer goes beside the node it was last on. A target in the shadow root is retargeted to the host here.
   */
  private handleHostFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (!(next && (next === this || this.contains(next) || this.renderRoot.contains(next)))) this.lastFocusedId = null
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Hover card

  private handleNodeEnter = (event: PointerEvent) => {
    const id = (event.currentTarget as HTMLElement).dataset.nodeId!
    if (this.drag || this.pan?.moved) return
    this.highlightId = id
    // The card opens from `handleNodeOver` (`pointerover` comes first), which knows the row under the pointer.
  }

  private handleNodeLeave = (event: PointerEvent) => {
    this.highlightId = null
    this.highlightPort = null
    if (event.pointerType !== 'touch') this.scheduleCardClose()
  }

  /** The `data-flow-port` of the row the event comes from, inside the node it reached; a row's handle counts as the row. */
  private portFromEvent(event: Event): string | null {
    for (const target of event.composedPath()) {
      if (target === this || (target instanceof HTMLElement && target.classList.contains('node'))) break
      if (!(target instanceof HTMLElement)) continue
      if (target.dataset.flowPort) return target.dataset.flowPort
      if (target.classList.contains('row-more')) return MORE_ROWS
      if (target.classList.contains('connector') && target.dataset.port) return target.dataset.port
    }
    return null
  }

  /** The pointer moved onto another part of a node: a row lights its edges, and a row with `details` opens its own card. */
  private handleNodeOver = (event: PointerEvent) => {
    if (this.drag || this.pan?.moved || this.connection) return
    const id = (event.currentTarget as HTMLElement).dataset.nodeId!
    const port = this.portFromEvent(event)
    if (port === MORE_ROWS) {
      if (this.highlightPort) this.highlightPort = null
      if (event.pointerType !== 'touch') this.scheduleCard(id, MORE_ROWS)
      return
    }
    const current = this.highlightPort
    if (port === null) {
      if (current) this.highlightPort = null
    } else if (current?.node !== id || current.port !== port) this.highlightPort = { node: id, port }
    if (event.pointerType === 'touch') return
    const row = port === null ? undefined : this.rowOf(id, port)
    this.scheduleCard(id, row?.details ? port : null)
  }

  private scheduleCard(id: string, port: string | null = null) {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    if (this.noCard || this.draggingId || this.editingId !== null || this.editingEdge !== null || this.connection) return
    if (this.cardId === id && this.cardPort === port) {
      // Back on the card that is open: a switch to another one that was about to happen is off.
      this.cancelPendingCard()
      return
    }
    const key = `${id}\u0000${port ?? ''}`
    if (this.openTimer !== undefined && this.pendingCard === key) return
    clearTimeout(this.openTimer)
    // Moving from one node's card to the next node's (or a row's) opens it at once, like a menu bar.
    const delay = this.cardId ? 0 : this.openDelay
    this.pendingCard = key
    this.openTimer = setTimeout(() => {
      this.openTimer = undefined
      this.pendingCard = null
      this.cardId = id
      this.cardPort = port
    }, delay)
  }

  private cancelPendingCard() {
    clearTimeout(this.openTimer)
    this.openTimer = undefined
    this.pendingCard = null
  }

  private scheduleCardClose() {
    this.cancelPendingCard()
    if (!this.cardId || this.closeTimer) return
    this.closeTimer = setTimeout(() => {
      this.closeTimer = undefined
      this.cardId = null
      this.cardPort = null
    }, this.closeDelay)
  }

  private hideCard(now = false) {
    this.cancelPendingCard()
    if (now) {
      clearTimeout(this.closeTimer)
      this.closeTimer = undefined
      this.cardId = null
      this.cardPort = null
    } else this.scheduleCardClose()
  }

  private clearCardTimers() {
    this.cancelPendingCard()
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
  }

  private handleCardEnter = () => {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
  }

  private handleCardKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    const id = this.cardId
    this.hideCard(true)
    if (id) void this.focusNode(id)
  }

  private handleCardLeave = () => {
    if (this.card?.matches(':focus-within')) return
    this.scheduleCardClose()
  }

  private stopCardPositioning() {
    this.cleanupCard?.()
    this.cleanupCard = null
  }

  private syncCard() {
    const card = this.card
    if (!card) return
    const node = this.cardId ? this.renderRoot.querySelector<HTMLElement>(`.node[data-node-id="${CSS.escape(this.cardId)}"]`) : null
    // A row's card sits next to the row.
    const row =
      node && this.cardId && this.cardPort !== null
        ? this.cardPort === MORE_ROWS
          ? node.querySelector<HTMLElement>('.row-more')
          : this.portElements(node, this.cardId, this.cardPort)[0]
        : null
    const anchor = row ?? node
    this.stopCardPositioning()
    if (!anchor) {
      if (card.matches(':popover-open')) card.hidePopover()
      return
    }
    try {
      if (!card.matches(':popover-open')) card.showPopover()
    } catch {
      return
    }
    const gap = this.readPixels('--c2-flow__card--offset', 8)
    // A row's card goes beside its node, where it does not cover the rows below.
    const placement = this.direction === 'LR' && this.cardPort === null ? 'bottom' : 'right'
    this.cleanupCard = autoUpdate(anchor, card, async () => {
      const { x, y } = await computePosition(anchor, card, {
        placement,
        strategy: 'fixed',
        middleware: [offset(gap), flip({ padding: 8 }), shift({ padding: 8 })],
      })
      card.style.left = `${x}px`
      card.style.top = `${y}px`
    })
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Context menu

  private buildMenu = (context: ContextMenuContext) => {
    const data = context.data as { node?: FlowNode; edge?: FlowEdge } | undefined
    const node = data?.node ?? null
    const edge = data?.edge ?? null
    // The view controls belong to the canvas: a node has no built-in rows unless the flow is editable, so it opens a
    // menu only when `renderContextMenu` gives it one.
    // A node with folded rows offers to show them, in a read-only flow too.
    const rowItem =
      node && this.foldsRows(node.id)
        ? html`<c2-menu-item value="flow:toggle-rows" aria-keyshortcuts="Shift+Enter"
            >${this.menuIcon(this.expanded.has(node.id) ? MENU_ICONS.hideRows : MENU_ICONS.showRows)}${this.msg.t(
              this.expanded.has(node.id) ? 'showFewerRows' : 'showAllRows',
            )}<c2-kbd slot="shortcut">⇧↵</c2-kbd></c2-menu-item
          >`
        : nothing
    // The row under the pointer can move up or down among the node's shown rows.
    const menuRow = this.editable && node && this.highlightPort?.node === node.id ? this.highlightPort.port : null
    const slot = menuRow && node ? this.rowSlot(node.id, menuRow) : null
    const moveItems =
      slot && slot.index >= 0 && slot.total > 1
        ? html`<c2-menu-item value="flow:row-up" ?disabled=${slot.index === 0}>${this.menuIcon(MENU_ICONS.rowUp)}${this.msg.t('moveRowUp')}</c2-menu-item>
            <c2-menu-item value="flow:row-down" ?disabled=${slot.index === slot.total - 1}
              >${this.menuIcon(MENU_ICONS.rowDown)}${this.msg.t('moveRowDown')}</c2-menu-item
            >
            <hr />`
        : nothing
    const nodeItems = this.editable ? html`${moveItems}${rowItem}${rowItem === nothing ? nothing : html`<hr />`}${this.editMenuItems(node)}` : rowItem
    const defaultItems = node ? nodeItems : edge ? (this.editable ? this.editMenuItems(null) : nothing) : this.defaultMenuItems()
    const custom = this.renderContextMenu?.({ node, edge, defaultItems, x: context.x, y: context.y })
    const rows = custom === undefined ? (defaultItems === nothing ? null : defaultItems) : custom
    if (rows !== null && rows !== undefined && rows !== nothing && rows !== false) {
      this.menuNode = node
      this.menuRow = menuRow
      this.menuEdge = edge
      this.menuPoint = this.toCanvas(context.x, context.y)
      this.hideCard(true)
      this.cancelConnection()
    }
    return rows
  }

  /** The rows of a node or an edge in an editable flow. */
  private editMenuItems(node: FlowNode | null) {
    return html`
      ${
        node
          ? html`<c2-menu-item value="flow:rename" aria-keyshortcuts="F2"
              >${this.menuIcon(MENU_ICONS.rename)}${this.msg.t('rename')}<c2-kbd slot="shortcut">F2</c2-kbd></c2-menu-item
            >`
          : nothing
      }
      ${
        node
          ? nothing
          : html`<c2-menu-item value="flow:edit-label" aria-keyshortcuts="F2"
              >${this.menuIcon(MENU_ICONS.rename)}${this.msg.t('editLabel')}<c2-kbd slot="shortcut">F2</c2-kbd></c2-menu-item
            >`
      }
      <c2-menu-item value="flow:delete" aria-keyshortcuts="Delete"
        >${this.menuIcon(MENU_ICONS.remove)}${this.msg.t('delete')}<c2-kbd slot="shortcut">Del</c2-kbd></c2-menu-item
      >
    `
  }

  private menuIcon(icon: unknown) {
    return html`<svg
      slot="prefix-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${icon}
    </svg>`
  }

  private defaultMenuItems() {
    const lr = this.direction === 'LR'
    // Written the way each platform's own menus do: ⌘+ on Apple platforms, Ctrl + + elsewhere.
    const mod = isApplePlatform() ? '⌘' : 'Ctrl '
    return html`
      ${
        this.editable
          ? html`<c2-menu-item value="flow:add-node" aria-keyshortcuts="N"
                >${this.menuIcon(MENU_ICONS.add)}${this.msg.t('addNode')}<c2-kbd slot="shortcut">N</c2-kbd></c2-menu-item
              >
              <hr />`
          : nothing
      }
      <c2-menu-item value="flow:zoom-in" keep-open aria-keyshortcuts=${ariaKeyShortcuts(ZOOM_IN_KEYS)}
        >${this.menuIcon(MENU_ICONS.zoomIn)}${this.msg.t('zoomIn')}<c2-kbd slot="shortcut">${mod}+</c2-kbd></c2-menu-item
      >
      <c2-menu-item value="flow:zoom-out" keep-open aria-keyshortcuts=${ariaKeyShortcuts(ZOOM_OUT_KEYS)}
        >${this.menuIcon(MENU_ICONS.zoomOut)}${this.msg.t('zoomOut')}<c2-kbd slot="shortcut">${mod}−</c2-kbd></c2-menu-item
      >
      <c2-menu-item value="flow:fit" aria-keyshortcuts=${ariaKeyShortcuts(FIT_KEYS)}
        >${this.menuIcon(MENU_ICONS.fit)}${this.msg.t('fitView')}<c2-kbd slot="shortcut">${mod}0</c2-kbd></c2-menu-item
      >
      <hr />
      <h6>${this.msg.t('layout')}</h6>
      <c2-menu-item type="radio" name="flow-direction" value="flow:direction-lr" .checked=${lr}>${this.msg.t('leftToRight')}</c2-menu-item>
      <c2-menu-item type="radio" name="flow-direction" value="flow:direction-tb" .checked=${!lr}>${this.msg.t('topToBottom')}</c2-menu-item>
      <c2-menu-item value="flow:auto-layout" ?disabled=${!this.custom}>${this.menuIcon(MENU_ICONS.layout)}${this.msg.t('autoLayout')}</c2-menu-item>
      <c2-menu-item type="checkbox" value="flow:lock" .checked=${this.locked}>${this.msg.t('lockLayout')}</c2-menu-item>
    `
  }

  private handleMenuSelect = (event: CustomEvent<ContextMenuSelectEventDetail>) => {
    const { value, checked, data } = event.detail
    const node = this.menuNode
    const edge = this.menuEdge
    switch (value) {
      case 'flow:add-node':
        if (this.editable) this.requestNode(this.centred(this.menuPoint ?? { x: 0, y: 0 }))
        return
      case 'flow:rename':
        // After the menu has closed and handed focus back, or the editor would lose it at once and commit.
        if (node) setTimeout(() => void this.editLabel(node.id))
        return
      case 'flow:edit-label':
        if (edge) setTimeout(() => void this.openEdgeEditor(edgeKey(edge)))
        return
      case 'flow:delete':
        if (!this.editable) return
        if (node) this.deleteNode(node.id)
        else if (edge) this.deleteEdge(edge)
        return
      case 'flow:row-up':
      case 'flow:row-down':
        if (node && this.menuRow) this.moveRow(node.id, this.menuRow, this.rowSlot(node.id, this.menuRow).index + (value === 'flow:row-up' ? -1 : 1))
        return
      case 'flow:toggle-rows':
        if (node) this.userToggleRows(node.id)
        return
      case 'flow:details':
        if (node) this.select(node.id, true)
        return
      case 'flow:zoom-in':
        return this.zoomIn()
      case 'flow:zoom-out':
        return this.zoomOut()
      case 'flow:fit':
        this.viewTouched = false
        return this.fitView()
      case 'flow:direction-lr':
        return this.setDirection('LR')
      case 'flow:direction-tb':
        return this.setDirection('TB')
      case 'flow:auto-layout':
        return this.resetLayout()
      case 'flow:lock':
        this.locked = checked
        return
    }
    this.dispatchEvent(new CustomEvent<FlowMenuSelectDetail>('flow-menu-select', { detail: { value, checked, data, node, edge } }))
  }

  /** The rows' own `menu-select` bubbles out of the menu; the flow reports it as `flow-menu-select` instead. */
  private stopMenuSelect = (event: Event) => event.stopPropagation()

  // ---------------------------------------------------------------------------------------------------------------
  // Lifecycle

  /**
   * Pins the `position` a node arrived with, or changed to. A node's first position does not override a saved one,
   * and a value seen before is not applied again, so it never undoes the user's drag. Returns the ids it pinned.
   */
  private applyNodePositions(nodes: FlowNode[]) {
    const applied = new Set<string>()
    for (const node of nodes) {
      const p = node.position
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const signature = `${p.x},${p.y}`
      const previous = this.appliedPositions.get(node.id)
      if (previous === signature) continue
      this.appliedPositions.set(node.id, signature)
      if (previous === undefined && this.pinned[node.id]) continue
      this.pinned[node.id] = { x: p.x, y: p.y }
      this.custom = true
      applied.add(node.id)
    }
    return applied
  }

  override willUpdate(changed: PropertyValues<this>) {
    if (!isServer && (!this.storageLoaded || (changed.has('storageKey') && this.hasUpdated))) this.loadStorage()
    let applied = new Set<string>()
    if (changed.has('nodes')) {
      const nodes = Array.isArray(this.nodes) ? this.nodes : []
      if (nodes !== this.nodes) this.nodes = nodes
      this.byId = new Map(nodes.map((node) => [node.id, node]))
      applied = this.applyNodePositions(nodes)
      if (this.editingId !== null && !this.byId.has(this.editingId)) this.editingId = null
      const connection = this.connection
      if (connection && (!this.byId.has(connection.source) || (connection.target !== null && !this.byId.has(connection.target)))) this.cancelConnection()
    }
    if (changed.has('edges')) {
      if (!Array.isArray(this.edges)) this.edges = []
      this.edgeLabels = new Map()
      for (const edge of this.edges) {
        // An edge between rows is read with its own label (`relation()`), not as the label of its pair of nodes.
        if (portId(edge.sourcePort) || portId(edge.targetPort)) continue
        const key = pairKey(edge.source, edge.target)
        if (!this.edgeLabels.has(key) && edge.label?.trim()) this.edgeLabels.set(key, edge.label.trim())
      }
    }
    // Which rows show depends on the edges, the limit and the open nodes as well as on the rows.
    const own = changed as Map<PropertyKey, unknown>
    if (
      changed.has('nodes') ||
      changed.has('renderNode') ||
      changed.has('direction') ||
      changed.has('edges') ||
      changed.has('rowLimit') ||
      own.has('expanded')
    ) {
      this.portsDirty = true
    }
    if (changed.has('edges')) {
      this.linkedPorts = new Map()
      for (const edge of this.edges) {
        for (const [id, port] of [
          [edge.source, portId(edge.sourcePort)],
          [edge.target, portId(edge.targetPort)],
        ] as const) {
          if (!port) continue
          let ports = this.linkedPorts.get(id)
          if (!ports) this.linkedPorts.set(id, (ports = new Set()))
          ports.add(port)
        }
      }
    }
    if (this.highlightPort && !this.byId.has(this.highlightPort.node)) this.highlightPort = null
    if (this.rowMove && (!this.editable || !this.rowOf(this.rowMove.node, this.rowMove.row))) this.rowMove = null
    if (changed.has('nodes') && this.rowMove) this.portsDirty = true
    if (this.selectedEdge !== null && !this.edgeByKey(this.selectedEdge)) this.selectedEdge = null
    if (this.editingEdge !== null && !this.edgeByKey(this.editingEdge)) this.editingEdge = null
    const ids = this.nodes.map((node) => node.id).join('\u0000')
    const key = `${ids}\u0001${this.edges.map((edge) => `${edge.source}\u0000${edge.target}`).join('\u0001')}`
    if (this.layoutDirection !== null && this.direction !== this.layoutDirection && !changed.has('storageKey')) {
      // The direction was set from outside: a custom layout drawn for the other axis no longer applies.
      this.pinned = {}
      this.custom = false
    }
    const topologyChanged = key !== this.topologyKey
    if (topologyChanged || this.direction !== this.layoutDirection || changed.has('storageKey')) {
      // In an editable flow the user is drawing: a node or edge added or removed must not move the others.
      const edit = this.editable && this.hasUpdated && this.positions.size > 0 && this.direction === this.layoutDirection && !changed.has('storageKey')
      const idsChanged = ids !== this.topologyKey.slice(0, this.topologyKey.indexOf('\u0001'))
      const wasCustom = this.custom
      if (edit) this.pinCurrentLayout(applied)
      this.topologyKey = key
      this.relayout()
      if (edit) {
        for (const [id, p] of this.positions) this.pinned[id] ??= { x: Math.round(p.x), y: Math.round(p.y) }
        this.editedLayout ||= idsChanged || !wasCustom
        // Keep the user's pan and zoom: refitting would move the canvas under the pointer.
        this.viewTouched = true
      } else this.fitted = false
    } else if (applied.size) this.relayout()
    // A new least zoom refits a view the user has not panned or zoomed.
    if (changed.has('fitMinZoom') && this.hasUpdated && !this.viewTouched) this.fitted = false
  }

  /** Pins every node at the position it is drawn at, except those whose `position` was just applied. */
  private pinCurrentLayout(applied: Set<string>) {
    const pinned: FlowLayout = {}
    for (const node of this.nodes) {
      const p = applied.has(node.id) ? this.pinned[node.id] : (this.positions.get(node.id) ?? this.pinned[node.id])
      if (p) pinned[node.id] = { x: Math.round(p.x), y: Math.round(p.y) }
    }
    this.pinned = pinned
    this.custom = true
  }

  override firstUpdated() {
    this.observe()
  }

  /** After the application answered an edit: focus the node the keyboard added, or a neighbour of the one it deleted. */
  private followNodeChanges(previous: FlowNode[] | undefined) {
    const added = this.focusAdded
    const refocus = this.refocus
    this.focusAdded = null
    this.refocus = null
    if (added) {
      const fresh = this.nodes.filter((node) => !added.has(node.id))
      if (fresh.length === 1) {
        this.select(fresh[0].id)
        this.reveal(fresh[0].id)
        void this.focusNode(fresh[0].id)
      }
    }
    if (refocus && !this.byId.has(refocus.removed)) {
      const next = refocus.next !== null && this.byId.has(refocus.next) ? refocus.next : (this.nodes[0]?.id ?? null)
      if (next !== null) void this.focusNode(next)
      else void this.updateComplete.then(() => this.stage?.focus())
    }
    if (this.selected !== null && !this.byId.has(this.selected) && previous?.some((node) => node.id === this.selected)) this.select(null)
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return
    if (changed.has('nodes')) {
      this.observe()
      this.followNodeChanges(changed.get('nodes') as FlowNode[] | undefined)
    }
    if (this.editedLayout) {
      this.editedLayout = false
      this.save()
      this.emitLayout('edit')
    }
    this.measure()
    if (!this.fitted && !this.viewTouched) this.fitView()
    const own = changed as Map<PropertyKey, unknown>
    if (own.has('cardId') || own.has('cardPort') || changed.has('nodes') || changed.has('direction')) this.syncCard()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Render

  private context(node: FlowNode): FlowRenderContext {
    return { node, status: statusOf(node), selected: node.id === this.selected, direction: this.direction }
  }

  private icon(status: FlowStatus) {
    return html`<span class="status status--${status}" aria-hidden="true"><svg viewBox="0 0 16 16">${STATUS_ICONS[status]}</svg></span>`
  }

  private labelEditor(node: FlowNode, overlay: boolean) {
    return html`<input
      class=${overlay ? 'label-editor label-editor--overlay' : 'label-editor'}
      .value=${node.label}
      aria-label=${this.msg.t('renameNode', node.label)}
      autocomplete="off"
      enterkeyhint="done"
      @keydown=${this.handleEditorKeydown}
      @blur=${this.handleEditorBlur}
    />`
  }

  private defaultNode(node: FlowNode) {
    const status = statusOf(node)
    return html`<div class="body">
        ${this.icon(status)} ${node.icon ? html`<span class="node-icon" aria-hidden="true">${node.icon}</span>` : nothing}
        <span class="text">
          ${node.id === this.editingId ? this.labelEditor(node, false) : html`<span class="label">${node.label}</span>`}
          ${node.description ? html`<span class="description">${node.description}</span>` : nothing}
        </span>
        ${node.meta ? html`<span class="meta">${node.meta}</span>` : nothing}
      </div>
      ${this.renderRows(node)}`
  }

  /** The rows of the default body; see {@link FlowNodeRow}. */
  private renderRows(node: FlowNode) {
    const { shown, hidden } = this.visibleRows(node)
    if (!shown.length) return nothing
    const move = this.rowMove?.node === node.id ? this.rowMove : null
    let rows = shown
    // A row dragged by its grip is drawn in the slot it would land in.
    const moving = move?.pointer ? shown.find((row) => row.id === move.row) : undefined
    if (move && moving) {
      rows = shown.filter((row) => row !== moving)
      rows.splice(Math.min(move.to, rows.length), 0, moving)
    }
    // A row without an icon keeps the icon's room when another row has one, so the labels line up.
    const icons = rows.some((row) => row.icon)
    const connection = this.connection
    return html`<div class="rows">
      ${rows.map((row) => {
        const target =
          connection?.target === node.id && connection.targetPort === row.id && this.canConnect(connection.source, node.id, connection.sourcePort, row.id)
        const classes = [
          'row',
          this.litRows.has(`${node.id}\u0000${row.id}`) ? 'is-highlighted' : '',
          target ? 'is-connect-target' : '',
          move?.row === row.id ? (move.pointer ? 'is-moving' : 'is-picked') : '',
        ]
        return html`<div class=${classes.filter(Boolean).join(' ')} data-flow-port=${row.id}>
          ${this.editable && shown.length > 1 ? html`<span class="row-grip" title=${this.msg.t('dragToReorder')} aria-hidden="true"></span>` : nothing}
          ${icons ? html`<span class="row-icon" aria-hidden="true">${row.icon ?? nothing}</span>` : nothing}
          <span class="row-label">${row.label}</span>
          ${row.meta ? html`<span class="row-meta">${row.meta}</span>` : nothing}
        </div>`
      })}
      ${
        this.foldsRows(node.id)
          ? html`<div class="row row-more" aria-hidden="true">${hidden.length ? this.msg.t('moreRows', hidden.length) : this.msg.t('fewerRows')}</div>`
          : nothing
      }
    </div>`
  }

  private defaultCard(node: FlowNode) {
    const status = statusOf(node)
    const rows = [...(node.meta ? [[this.msg.t('duration'), node.meta] as [string, string]] : []), ...detailRows(node.details)]
    return html`<div class="card-content status--${status}">
      <div class="card-head">
        ${this.icon(status)}
        <span class="text">
          <span class="card-title">${node.label}</span>
          ${node.description ? html`<span class="description">${node.description}</span>` : nothing}
        </span>
      </div>
      <div class="card-status">${this.msg.t(STATUS_MESSAGES[status])}</div>
      ${
        rows.length
          ? html`<dl class="card-details">
              ${rows.map(
                ([term, value]) =>
                  html`<dt>${term}</dt>
                    <dd>${value}</dd>`,
              )}
            </dl>`
          : nothing
      }
    </div>`
  }

  /** The card of a row with `details`: the row's name and `meta`, then its details. */
  private defaultRowCard(node: FlowNode, row: FlowNodeRow, qualified = true) {
    const rows = detailRows(row.details)
    return html`<div class="card-content">
      <div class="card-head">
        <span class="text">
          <span class="card-title">${qualified ? `${node.label}.${row.label}` : row.label}</span>
          ${row.meta ? html`<span class="description">${row.meta}</span>` : nothing}
        </span>
      </div>
      ${
        rows.length
          ? html`<dl class="card-details">
              ${rows.map(
                ([term, value]) =>
                  html`<dt>${term}</dt>
                    <dd>${value}</dd>`,
              )}
            </dl>`
          : nothing
      }
    </div>`
  }

  /** An arrowhead at the end of an edge, pointing into the target through the side the edge arrives by. */
  private arrow(classes: string, end: FlowPoint, angle: number) {
    return html`<span
      class=${`arrow ${classes}`}
      style=${`transform: translate(${end.x}px, ${end.y}px) rotate(${angle}deg) translate(var(--_arrow-offset), -50%)`}
    ></span>`
  }

  /** The end of an edge drawn as `marker`, at `at`, pointing into its node by `angle`. */
  private marker(marker: FlowEdgeMarker, classes: string, at: FlowPoint, angle: number) {
    if (marker === 'arrow') return this.arrow(classes, at, angle)
    const paths = MARKER_PATHS[marker]
    if (!paths) return nothing
    return html`<span
      class=${`marker ${classes}`}
      style=${`transform: translate(${at.x}px, ${at.y}px) rotate(${angle}deg) translate(var(--_arrow-offset), -50%)`}
      ><svg viewBox="-20 -6 20 12">${paths}</svg></span
    >`
  }

  /** Whether `edge` leaves or arrives at row `port` of node `node`. */
  private touchesPort(edge: FlowEdge, { node, port }: { node: string; port: string }) {
    return (edge.source === node && portId(edge.sourcePort) === port) || (edge.target === node && portId(edge.targetPort) === port)
  }

  /**
   * The hovered row, when edges meet it: those edges are then the highlighted ones (rather than every edge of its node),
   * and the rows at both of their ends light up.
   */
  private activePort() {
    const port = this.highlightPort
    if (!port || port.node !== this.highlightId) return null
    return this.edges.some((edge) => this.touchesPort(edge, port)) ? port : null
  }

  private renderEdges(port: { node: string; port: string } | null) {
    const highlight = this.highlightId ?? this.selected
    const paths: unknown[] = []
    const marks: unknown[] = []
    let editor: unknown = nothing
    const rects = this.nodeRects()
    this.edges.forEach((edge, index) => {
      const route = this.routeOf(edge, index, this.positions, rects)
      if (!route) return
      const back = this.graph.backEdges.has(index) && !this.sidedEdge(edge)
      const edgeClass = edgeState(statusOf(this.byId.get(edge.source)!), statusOf(this.byId.get(edge.target)!))
      const on = port ? this.touchesPort(edge, port) : highlight !== null && (edge.source === highlight || edge.target === highlight)
      const key = edgeKey(edge)
      const selected = key === this.selectedEdge
      const states = `${on ? ' is-highlighted' : ''}${selected ? ' is-selected' : ''}`
      paths.push(svg`<path class=${`edge edge--${edgeClass}${back ? ' edge--back' : ''}${states}`} d=${route.d}></path>`)
      // A wide transparent stroke over the edge, so a click or a right-click does not need to hit a 1.5px line.
      if (this.editable) {
        paths.push(svg`<path
          class="edge-hit"
          data-edge-key=${key}
          d=${route.d}
          @c2-context-menu-request=${(event: Event) => provideContextMenuData(event, this, { edge })}
        ></path>`)
      }
      // The arrowhead and the label take the edge's colour from a `mark--<state>` class of their own.
      const classes = `mark--${edgeClass}${states}`
      marks.push(this.marker(markerOf(edge.targetMarker, 'arrow'), classes, route.end, route.angle))
      marks.push(this.marker(markerOf(edge.sourceMarker, 'none'), classes, route.start, route.startAngle))
      const label = edge.label?.trim()
      if (key === this.editingEdge) editor = this.edgeLabelEditor(edge, route.mid)
      else if (label) {
        marks.push(
          html`<span
            class=${`edge-label ${classes}`}
            data-edge-key=${this.editable ? key : nothing}
            style=${`transform: translate(${route.mid.x}px, ${route.mid.y}px) translate(-50%, -50%)`}
            @c2-context-menu-request=${this.editable ? (event: Event) => provideContextMenuData(event, this, { edge }) : nothing}
            >${label}</span
          >`,
        )
      }
    })
    const draft = this.draftRoute()
    if (draft) {
      paths.push(svg`<path class="edge edge--draft" d=${draft.d}></path>`)
      marks.push(this.arrow('mark--draft', draft.end, draft.angle))
    }
    const dim = highlight !== null && this.byId.has(highlight)
    return html`<svg class="edges${dim ? ' has-highlight' : ''}" aria-hidden="true">${paths}</svg>
      <div class="edge-marks${dim ? ' has-highlight' : ''}" aria-hidden="true">${marks}</div>
      ${editor}`
  }

  private edgeLabelEditor(edge: FlowEdge, mid: FlowPoint) {
    return html`<input
      class="label-editor label-editor--edge"
      style=${`transform: translate(${mid.x}px, ${mid.y}px) translate(-50%, -50%)`}
      .value=${edge.label ?? ''}
      aria-label=${this.msg.t('edgeLabelField', this.endLabel(edge.source, portId(edge.sourcePort)), this.endLabel(edge.target, portId(edge.targetPort)))}
      autocomplete="off"
      enterkeyhint="done"
      @keydown=${this.handleEditorKeydown}
      @blur=${this.handleEditorBlur}
    />`
  }

  /**
   * Where edge `edge` meets its nodes, with the nodes at `positions`; null when an end is missing. An end on a row
   * (a measured port) uses the row's `left` or `right` side: the one the edge names, else the one facing the other
   * end. Any other end uses its own side, else the default of the direction.
   */
  private endsOf(edge: FlowEdge, positions: Map<string, FlowPoint> = this.positions, rects?: Map<string, Rect>): EdgeEnds | null {
    const a = this.rectOf(edge.source, positions)
    const b = this.rectOf(edge.target, positions)
    if (!a || !b) return null
    const sourcePort = portId(edge.sourcePort)
    const targetPort = portId(edge.targetPort)
    const sp = sourcePort ? this.ports.get(edge.source)?.get(sourcePort) : undefined
    const tp = targetPort ? this.ports.get(edge.target)?.get(targetPort) : undefined
    const defaults = defaultSides(this.direction)
    const facing = facingSides(a, b)
    const rowSide = (side: unknown, auto: 'left' | 'right') => (side === 'left' || side === 'right' ? side : auto)
    const source = sp ? rowSide(edge.sourceSide, facing.source) : isSide(edge.sourceSide) ? edge.sourceSide : defaults.source
    const target = tp ? rowSide(edge.targetSide, facing.target) : isSide(edge.targetSide) ? edge.targetSide : defaults.target
    const anchors: EdgeAnchors = {}
    if (sp) anchors.start = rowPoint(a, source as 'left' | 'right', sp.top, sp.height)
    if (tp) anchors.end = rowPoint(b, target as 'left' | 'right', tp.top, tp.height)
    const ported = !!(sp || tp)
    // A foreign key between two tables a rank apart would otherwise run behind the table between them. Only the route
    // needs them, so only a caller drawing it passes the node rectangles.
    if (ported && rects) anchors.obstacles = [...rects].filter(([id]) => id !== edge.source && id !== edge.target).map(([, rect]) => rect)
    return { a, b, sides: { source, target }, anchors, ported }
  }

  /** The rectangle of every node at `positions`, once per drawing, for the routes between rows to go round. */
  private nodeRects(positions: Map<string, FlowPoint> = this.positions) {
    const rects = new Map<string, Rect>()
    for (const id of positions.keys()) {
      const rect = this.rectOf(id, positions)
      if (rect) rects.set(id, rect)
    }
    return rects
  }

  /**
   * Whether edge `edge` meets a row or uses a side other than the default, so it is routed between sides rather than
   * along the axis.
   */
  private sidedEdge(edge: FlowEdge) {
    const ends = this.endsOf(edge)
    if (!ends) return false
    const defaults = defaultSides(this.direction)
    return ends.ported || ends.sides.source !== defaults.source || ends.sides.target !== defaults.target
  }

  /** The route of edge `edge` (number `index` of `edges`), with the nodes at `positions`; null when an end is missing. */
  private routeOf(edge: FlowEdge, index: number, positions: Map<string, FlowPoint> = this.positions, rects?: Map<string, Rect>): EdgeRoute | null {
    const ends = this.endsOf(edge, positions, rects ?? this.nodeRects(positions))
    if (!ends) return null
    const { a, b, sides, anchors } = ends
    return routeBetween(a, b, this.direction, this.edgeType, this.graph.backEdges.has(index), sides.source, sides.target, anchors)
  }

  /**
   * The route of the edge following the pointer, or pointing at the keyboard's candidate, while a connection is made.
   * It leaves by the connection's side; over no target, it ends on the pointer, arriving as an edge from the default
   * side does (along the axis) or, from any other side, through the side of the pointer facing back to the source.
   */
  private draftRoute() {
    const connection = this.connection
    const a = connection && this.rectOf(connection.source)
    if (!connection || !a) return null
    const target = this.canConnect(connection.source, connection.target, connection.sourcePort, connection.targetPort) ? connection.target : null
    const b = target === null ? null : this.rectOf(target)
    const defaults = defaultSides(this.direction)
    // Out of the row it was dragged from, and into the row under the pointer.
    const anchors: EdgeAnchors = {}
    const sp = connection.sourcePort ? this.ports.get(connection.source)?.get(connection.sourcePort) : undefined
    if (sp && (connection.sourceSide === 'left' || connection.sourceSide === 'right')) anchors.start = rowPoint(a, connection.sourceSide, sp.top, sp.height)
    if (anchors.start) {
      anchors.obstacles = [...this.nodeRects()].filter(([id]) => id !== connection.source && id !== target).map(([, rect]) => rect)
    }
    if (b && target !== null) {
      const side = connection.targetSide ?? defaults.target
      const tp = connection.targetPort ? this.ports.get(target)?.get(connection.targetPort) : undefined
      if (tp && (side === 'left' || side === 'right')) anchors.end = rowPoint(b, side, tp.top, tp.height)
      return routeBetween(a, b, this.direction, this.edgeType, false, connection.sourceSide, side, anchors)
    }
    const point = connection.point
    if (!point) return null
    const end = { ...point, width: 0, height: 0 }
    if (connection.sourceSide === defaults.source && !anchors.start) return routeBetween(a, end, this.direction, this.edgeType, false)
    const start = anchors.start ?? sidePoint(a, connection.sourceSide)
    const [dx, dy] = [start.x - point.x, start.y - point.y]
    const facing: FlowSide = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'top' : 'bottom'
    return routeBetween(a, end, this.direction, this.edgeType, false, connection.sourceSide, facing, anchors)
  }

  /**
   * Where edges leave (`out`) or arrive (`in`) at each node, keyed by node id, then by side, or by `port\0side` for an
   * end on a row.
   */
  private edgeEnds(): NodeEnds {
    const ends: NodeEnds = new Map()
    const mark = (id: string, key: string, way: 'in' | 'out') => {
      let sides = ends.get(id)
      if (!sides) ends.set(id, (sides = new Map()))
      const entry = sides.get(key) ?? { in: false, out: false }
      entry[way] = true
      sides.set(key, entry)
    }
    for (const edge of this.edges) {
      const at = this.endsOf(edge)
      if (!at) continue
      mark(edge.source, at.anchors.start ? `${portId(edge.sourcePort)}\u0000${at.sides.source}` : at.sides.source, 'out')
      mark(edge.target, at.anchors.end ? `${portId(edge.targetPort)}\u0000${at.sides.target}` : at.sides.target, 'in')
    }
    return ends
  }

  /**
   * "After Idea." or, when an edge has a label, "Before Book the night bus, yes; Walk home, no." An edge between rows
   * names the rows: "After customers.id through customer_id." on `orders`.
   */
  private relation(word: 'after' | 'before', self: string, ids: string[]) {
    if (!ids.length) return ''
    const incoming = word === 'after'
    const parts: string[] = []
    let labelled = false
    // Two edges to one neighbour (through two rows) list it once, with both rows.
    for (const id of new Set(ids)) {
      const [source, target] = incoming ? [id, self] : [self, id]
      const between = this.edges.filter((edge) => edge.source === source && edge.target === target)
      const ported = between.filter((edge) => portId(edge.sourcePort) || portId(edge.targetPort))
      for (const edge of ported) {
        const [other, own] = incoming ? [portId(edge.sourcePort), portId(edge.targetPort)] : [portId(edge.targetPort), portId(edge.sourcePort)]
        const end = this.endLabel(id, other)
        const label = edge.label?.trim()
        labelled ||= !!label
        const part = own ? this.msg.t('throughRow', end, this.rowLabel(self, own)) : end
        parts.push(label ? `${part}, ${label}` : part)
      }
      if (ported.length === between.length && ported.length) continue
      const label = this.edgeLabels.get(pairKey(source, target))
      labelled ||= !!label
      parts.push(label ? `${this.labelOf(id)}, ${label}` : this.labelOf(id))
    }
    return this.msg.t(word, parts, labelled)
  }

  private renderNodeElement(node: FlowNode, index: number, ends: NodeEnds) {
    const status = statusOf(node)
    const p = this.positions.get(node.id) ?? { x: 0, y: 0 }
    const before = this.graph.predecessors.get(node.id) ?? []
    const after = this.graph.successors.get(node.id) ?? []
    const { shown, hidden } = this.visibleRows(node)
    // The node is one button to assistive technology, so its rows are read with its relations.
    const rowsText = [
      shown.length
        ? this.msg.t(
            'rows',
            shown.map((row) => (row.meta ? `${row.label} ${row.meta}` : row.label)),
          )
        : '',
      hidden.length ? this.msg.t('rowsHidden', hidden.length) : '',
    ]
      .filter(Boolean)
      .join(' ')
    const relations = [this.relation('after', node.id, before), this.relation('before', node.id, after), rowsText].filter(Boolean).join(' ')
    const context = this.context(node)
    const body = this.renderNode ? this.renderNode(context) : this.defaultNode(node)
    const connection = this.connection
    const editing = node.id === this.editingId
    const shape = node.shape && node.shape !== 'rect' && SHAPES.has(node.shape) ? node.shape : null
    const classes = [
      'node',
      `status--${status}`,
      shape ? `shape--${shape}` : '',
      shape && OUTLINES[shape] ? 'is-drawn' : '',
      node.id === this.selected ? 'is-selected' : '',
      node.id === this.draggingId ? 'is-dragging' : '',
      connection?.source === node.id ? 'is-connect-source' : '',
      connection && connection.target === node.id && this.canConnect(connection.source, node.id, connection.sourcePort, connection.targetPort)
        ? 'is-connect-target'
        : '',
    ]
    const sides = ends.get(node.id)
    const ports = this.ports.get(node.id)
    // Handles and connectors on a row sit level with it; `inset` turns its offset from the border box into one from
    // the padding box the handle is placed in.
    const rowTop = (box: PortBox) => `top: ${box.top + box.height / 2 - box.inset}px`
    // A dot on every side an edge leaves or arrives by, or on the side of the row it meets; one place can take both.
    const handles = [...(sides ?? [])].flatMap(([key, end]) => {
      const [port, side] = key.includes('\u0000') ? key.split('\u0000') : [null, key]
      const box = port === null ? null : ports?.get(port)
      if (port !== null && !box) return []
      const classes = `handle handle--${side}${box ? ' handle--port' : ''}${end.in ? ' handle--in' : ''}${end.out ? ' handle--out' : ''}`
      return [html`<span class=${classes} style=${box ? rowTop(box) : nothing}></span>`]
    })
    const connectSide = connection && !connection.keyboard && connection.target === node.id ? connection.targetSide : null
    const connectPort = connectSide ? (connection?.targetPort ?? null) : null
    const activeRow = this.highlightPort?.node === node.id ? this.highlightPort.port : null
    const sourceRow = connection?.source === node.id ? (connection.sourcePort ?? null) : null
    // A node with rows is connected row to row: a pair of handles on each row, instead of one on each side.
    const connectors = !this.editable
      ? nothing
      : ports
        ? [...ports].flatMap(([port, box]) =>
            (['left', 'right'] as const).map((side) => {
              const classes = [
                `connector connector--${side} connector--port`,
                port === activeRow || port === sourceRow ? 'is-row-active' : '',
                port === connectPort && side === connectSide ? 'is-connect-side' : '',
              ]
              return html`<span
                class=${classes.filter(Boolean).join(' ')}
                style=${rowTop(box)}
                data-side=${side}
                data-port=${port}
                title=${this.msg.t('dragToConnect')}
              ></span>`
            }),
          )
        : FLOW_SIDES.map(
            (side) =>
              html`<span
                class=${`connector connector--${side}${side === connectSide ? ' is-connect-side' : ''}`}
                data-side=${side}
                title=${this.msg.t('dragToConnect')}
              ></span>`,
          )
    // A node drawn by the application has no label of ours to swap: the editor covers its whole body instead.
    const custom = !!this.renderNode || !!this.querySelector(`:scope > [slot="node:${CSS.escape(node.id)}"]`)
    return html`<div
      class=${classes.filter(Boolean).join(' ')}
      data-node-id=${node.id}
      role=${editing ? 'group' : 'button'}
      tabindex=${node.id === this.focusId ? 0 : -1}
      aria-label=${`${node.label}, ${this.msg.t(STATUS_MESSAGES[status]).toLowerCase()}${node.meta ? `, ${node.meta}` : ''}`}
      aria-describedby=${relations ? `relations-${index}` : nothing}
      style=${styleMap({
        transform: `translate(${p.x}px, ${p.y}px)`,
        '--_node-background': node.background || undefined,
        '--_node-color': node.color || undefined,
      })}
      @pointerenter=${this.handleNodeEnter}
      @pointerover=${this.handleNodeOver}
      @pointerleave=${this.handleNodeLeave}
      @c2-context-menu-request=${(event: Event) => provideContextMenuData(event, this, { node })}
    >
      ${shape && OUTLINES[shape] ? html`<svg class="shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${OUTLINES[shape]}</svg>` : nothing}
      <slot name=${`node:${node.id}`} @slotchange=${this.handleNodeSlotChange}>${body}</slot>
      ${editing && custom ? this.labelEditor(node, true) : nothing} ${handles} ${connectors}
      ${relations ? html`<span id=${`relations-${index}`} class="visually-hidden">${relations}</span>` : nothing}
    </div>`
  }

  /**
   * Slotted content of a node changed: its ports are measured again. A slot with nothing assigned also fires
   * `slotchange` when its fallback (the body we render) changes, which must not start another render.
   */
  private handleNodeSlotChange = (event: Event) => {
    const slot = event.target as HTMLSlotElement
    const assigned = slot.assignedNodes()
    const previous = this.slotted.get(slot) ?? []
    this.slotted.set(slot, assigned)
    if (assigned.length === previous.length && assigned.every((node, i) => node === previous[i])) return
    this.portsDirty = true
    this.requestUpdate()
  }

  private renderCardContent() {
    const node = this.cardId ? this.byId.get(this.cardId) : undefined
    if (!node) return nothing
    if (this.cardPort === MORE_ROWS && !this.renderCard) {
      // The folded rows, by name and type.
      const hidden = this.visibleRows(node).hidden
      const more: FlowNodeRow = {
        id: MORE_ROWS,
        label: this.msg.t('moreRows', hidden.length),
        details: hidden.map((row): [string, string] => [row.label, row.meta ?? '']),
      }
      if (hidden.length) return this.defaultRowCard(node, more, false)
    }
    const row = this.cardPort !== null ? this.rowOf(node.id, this.cardPort) : undefined
    if (row) return this.renderCard ? this.renderCard({ ...this.context(node), row }) : this.defaultRowCard(node, row)
    const body = this.renderCard ? this.renderCard(this.context(node)) : this.defaultCard(node)
    return html`<slot name=${`card:${node.id}`}>${body}</slot>`
  }

  private renderActions() {
    const placement = ACTIONS_PLACEMENTS.includes(this.actionsPlacement) ? this.actionsPlacement : 'top'
    const vertical = placement === 'left' || placement === 'right'
    return html`<div
      class=${`actions actions--${placement}`}
      part="actions"
      role="toolbar"
      aria-label=${this.msg.t('flowActions')}
      aria-orientation=${vertical ? 'vertical' : 'horizontal'}
      ?hidden=${!this.slotPresence.has('actions')}
      @keydown=${this.handleActionsKeydown}
    >
      <slot name="actions" @slotchange=${this.slotPresence.handleSlotChange}></slot>
    </div>`
  }

  /** Arrow keys (along the toolbar's orientation), Home and End move focus between the enabled action buttons. */
  private handleActionsKeydown = (event: KeyboardEvent) => {
    const vertical = this.actionsPlacement === 'left' || this.actionsPlacement === 'right'
    const [prev, next] = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight']
    if (![prev, next, 'Home', 'End'].includes(event.key)) return
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('slot[name="actions"]')
    const items = (slot?.assignedElements({ flatten: true }) ?? []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute('disabled') && !el.hidden,
    )
    if (!items.length) return
    const current = items.findIndex((el) => el === event.target || el.contains(event.target as Node))
    const last = items.length - 1
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === next
            ? current < 0 || current === last
              ? 0
              : current + 1
            : current <= 0
              ? last
              : current - 1
    event.preventDefault()
    items[index].focus()
  }

  private renderGhost(at: FlowPoint) {
    const size = this.typicalSize()
    return html`<div
      class="ghost"
      aria-hidden="true"
      style=${`transform: translate(${at.x}px, ${at.y}px); width: ${size.width}px; height: ${size.height}px`}
    ></div>`
  }

  override render() {
    const direction = this.direction === 'TB' ? 'tb' : 'lr'
    const stageClasses = [
      'stage',
      `direction--${direction}`,
      this.panning ? 'is-panning' : '',
      this.locked ? 'is-locked' : '',
      this.editable ? 'is-editable' : '',
      this.connection && !this.connection.keyboard ? 'is-connecting' : '',
    ]
    // With no node to focus, the empty canvas of an editable flow takes focus, so `N` and Enter can add the first one.
    const emptyCanvas = this.editable && !this.nodes.length
    const ends = this.edgeEnds()
    const port = this.activePort()
    this.litRows = new Set(
      port
        ? this.edges
            .filter((edge) => this.touchesPort(edge, port))
            .flatMap((edge) => [`${edge.source}\u0000${portId(edge.sourcePort) ?? ''}`, `${edge.target}\u0000${portId(edge.targetPort) ?? ''}`])
        : [],
    )
    return html`
      <c2-context-menu
        menu-label=${this.msg.t('flowMenu')}
        ?disabled=${this.noContextMenu}
        .renderContextMenu=${this.buildMenu}
        @context-menu-select=${this.handleMenuSelect}
        @menu-select=${this.stopMenuSelect}
      >
        <div
          class=${stageClasses.filter(Boolean).join(' ')}
          style=${`--_zoom: ${this.zoom}; background-position: ${this.tx}px ${this.ty}px`}
          tabindex=${emptyCanvas ? 0 : this.selectedEdge !== null ? -1 : nothing}
          role=${emptyCanvas ? 'group' : nothing}
          aria-label=${emptyCanvas ? this.msg.t('emptyFlow') : nothing}
          aria-describedby=${emptyCanvas ? 'empty-hint' : nothing}
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @wheel=${this.handleWheel}
          @scroll=${this.handleStageScroll}
          @keydown=${this.handleKeydown}
          @focusin=${this.handleFocusIn}
          @focusout=${this.handleFocusOut}
        >
          <div class="viewport" style=${`transform: translate(${this.tx}px, ${this.ty}px) scale(${this.zoom})`}>
            ${this.renderEdges(port)}
            ${repeat(
              this.nodes,
              (node) => node.id,
              (node, index) => this.renderNodeElement(node, index, ends),
            )}
            ${this.ghost ? this.renderGhost(this.ghost) : nothing}
          </div>
          ${emptyCanvas ? html`<span id="empty-hint" class="visually-hidden">${this.msg.t('emptyHint')}</span>` : nothing}
        </div>
      </c2-context-menu>
      ${this.renderActions()} ${this.editable ? html`<div class="visually-hidden" role="status">${this.announcement}</div>` : nothing}
      <div class="card" popover="manual" @pointerenter=${this.handleCardEnter} @pointerleave=${this.handleCardLeave} @keydown=${this.handleCardKeydown}>
        ${this.renderCardContent()}
      </div>
    `
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-flow': Flow
  }
}
