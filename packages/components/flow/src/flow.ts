import { LitElement, html, nothing, svg, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { provideContextMenuData } from '@c2n/core/context-menu-helper.js'
import { SlotPresenceController } from '@c2n/core/dom-helper.js'
import { ariaKeyShortcuts, isApplePlatform, matchesStroke, parseShortcut } from '@c2n/core/shortcut-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { ContextMenuContext, ContextMenuSelectEventDetail } from '@c2n/context-menu'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { avoidOverlap, buildGraph, layoutGraph, mergeLayout, type Graph, type LayoutOptions } from './flow-layout.js'
import { edgeRoute } from './flow-geometry.js'
import { MENU_ICONS, STATUS_ICONS, STATUS_LABELS } from './flow-icons.js'
import type {
  FlowActionsPlacement,
  FlowContextMenuRenderer,
  FlowDirection,
  FlowEdge,
  FlowEdgeEditDetail,
  FlowEdgeEventDetail,
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
  FlowPoint,
  FlowRenderContext,
  FlowRenderer,
  FlowSelectionChangeDetail,
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
  'edge-add': CustomEvent<FlowEdgeEventDetail>
  'edge-delete': CustomEvent<FlowEdgeEventDetail>
  'edge-edit': CustomEvent<FlowEdgeEditDetail>
}

export interface Flow {
  addEventListener: TypedAddEventListener<Flow, FlowEventMap>
  removeEventListener: TypedRemoveEventListener<Flow, FlowEventMap>
}

interface StoredLayout {
  v: 1
  direction?: FlowDirection
  positions?: FlowLayout | null
}

const STORAGE_VERSION = 1
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const ZOOM_STEP = 1.2
const FIT_PADDING = 24
const DRAG_THRESHOLD = 4
const NUDGE = 8
const NUDGE_LARGE = 24
const TWEEN_DURATION = 320
const ESTIMATED_SIZE: FlowSize = { width: 200, height: 56 }
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

const statusOf = (node: FlowNode): FlowStatus => (node.status && node.status in STATUS_LABELS ? node.status : 'pending')

const edgeKey = (source: string, target: string) => `${source}\u0000${target}`

/** A key press without Ctrl, ⌘ or Alt: the single-letter editing shortcuts must not shadow browser or app chords. */
const plainKey = (event: KeyboardEvent, key: string) => !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === key

/** A connection being drawn from `source`: by the pointer (`point` follows it) or by the keyboard (`target` is chosen). */
interface Connection {
  source: string
  /** Pointer position in canvas pixels; `null` while the keyboard chooses. */
  point: FlowPoint | null
  /** The node under the pointer, or the keyboard's candidate. */
  target: string | null
  keyboard: boolean
}

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
 * **Custom nodes.** `renderNode` returns the body of each node (a Lit template, a DOM node or a string), or a
 * framework renders it into the `node:<id>` slot. Handles, dragging, edges and the card still come from the flow.
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
 * - *Connect*: drag the handle on a node's outgoing side. Released on another node it fires `edge-add` (never a
 *   self-loop or a duplicate); released on empty canvas it fires `node-add` with `source`, for a connected new node.
 *   From the keyboard, `C` on the focused node starts a connection, the arrow keys or Tab choose the target, Enter
 *   connects and Escape cancels.
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
 * @event {CustomEvent<FlowNodeAddDetail>} node-add - `editable` only: the user asked for a node at `detail.position` (canvas pixels, the node's top-left corner), connected from `detail.source` when it came from a connection dropped on empty canvas. Append it to `nodes`. Does not bubble.
 * @event {CustomEvent<FlowNodeEditDetail>} node-edit - `editable` only: the user renamed node `detail.id` to `detail.label` with the inline editor. Does not bubble.
 * @event {CustomEvent<FlowNodeDeleteDetail>} node-delete - `editable` only: the user asked to delete node `detail.id`. Does not bubble.
 * @event {CustomEvent<FlowEdgeEventDetail>} edge-add - `editable` only: the user connected `detail.source` to `detail.target`. Never a self-loop or an existing edge. Does not bubble.
 * @event {CustomEvent<FlowEdgeEventDetail>} edge-delete - `editable` only: the user asked to delete the edge from `detail.source` to `detail.target`. Does not bubble.
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
 * @cssproperty {pixel} [--c2-flow__handle--size=7px] - Diameter of the dots on a node's incoming and outgoing sides.
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
 * @cssproperty {pixel} [--c2-flow__connector--size=12px] - Diameter of the connection handle an `editable` flow shows on a hovered, focused or selected node.
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
  @state() private highlightId: string | null = null
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

  @query('.stage') private stage?: HTMLElement
  @query('.card') private card?: HTMLElement

  private readonly internals = isServer ? undefined : this.attachInternals()

  private graph: Graph = buildGraph([], [])
  private layers: string[][] = []
  private rank = new Map<string, number>()
  private positions = new Map<string, FlowPoint>()
  private sizes = new Map<string, FlowSize>()
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

  private drag: { id: string; startX: number; startY: number; origin: FlowPoint; moved: boolean; pointerId: number } | null = null
  /** A press on empty canvas, or on an edge of an editable flow (`edge`), until it moves far enough to pan. */
  private pan: { startX: number; startY: number; tx: number; ty: number; moved: boolean; pointerId: number; edge: string | null } | null = null
  private tween = 0
  private menuNode: FlowNode | null = null
  private menuEdge: FlowEdge | null = null
  private menuPoint: FlowPoint | null = null
  /** A press on a node's connection handle, until it moves far enough to become a connection. */
  private connectDrag: { source: string; startX: number; startY: number; moved: boolean; pointerId: number } | null = null
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
    this.nodeObserver = new ResizeObserver(() => this.measure())
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

  /** Scales and centres the view so every node is visible, never above 100%. */
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
   * Opens the inline label editor on the edge from `source` to `target`, as a double-click would; for example on the
   * branch an application has just added to a decision. Does nothing unless the flow is `editable` and the edge exists.
   */
  async editEdgeLabel(source: string, target: string): Promise<void> {
    const key = edgeKey(source, target)
    if (!this.editable || !this.edgeByKey(key) || !this.positions.has(source) || !this.positions.has(target)) return
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

  /** Measures every node; a size that changed re-runs the layout, so custom bodies and late fonts are accounted for. */
  private measure() {
    const root = this.renderRoot as ShadowRoot | undefined
    if (!root) return
    let changed = false
    for (const element of root.querySelectorAll<HTMLElement>('.node')) {
      const id = element.dataset.nodeId!
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      if (!size.width && !size.height) continue
      const previous = this.sizes.get(id)
      if (!previous || previous.width !== size.width || previous.height !== size.height) {
        this.sizes.set(id, size)
        changed = true
      }
    }
    if (!changed) return
    this.relayout()
    if (!this.viewTouched) this.fitView()
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
    const zoom = Math.max(MIN_ZOOM, Math.min(1, (width - FIT_PADDING * 2) / (x1 - x0), (height - FIT_PADDING * 2) / (y1 - y0)))
    return { zoom, tx: (width - (x1 - x0) * zoom) / 2 - x0 * zoom, ty: (height - (y1 - y0) * zoom) / 2 - y0 * zoom }
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
    if (this.editable && id && this.fromPart(event, 'connector')) {
      this.connectDrag = { source: id, startX: event.clientX, startY: event.clientY, moved: false, pointerId: event.pointerId }
    } else if (id) {
      // A locked flow still tracks the press on a node, so it can tell a click from a pan.
      this.drag = { id, startX: event.clientX, startY: event.clientY, origin: { ...this.positions.get(id)! }, moved: false, pointerId: event.pointerId }
    } else {
      const edge = this.editable ? this.edgeKeyFromEvent(event) : null
      this.pan = { startX: event.clientX, startY: event.clientY, tx: this.tx, ty: this.ty, moved: false, pointerId: event.pointerId, edge }
    }
    this.stage.setPointerCapture(event.pointerId)
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (this.connectDrag && event.pointerId === this.connectDrag.pointerId) {
      const { source, startX, startY } = this.connectDrag
      if (!this.connectDrag.moved && Math.hypot(event.clientX - startX, event.clientY - startY) < DRAG_THRESHOLD) return
      if (!this.connectDrag.moved) {
        this.connectDrag.moved = true
        this.hideCard(true)
      }
      const point = this.toCanvas(event.clientX, event.clientY)
      this.connection = { source, point, target: this.nodeAt(point), keyboard: false }
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
    if (this.connectDrag && event.pointerId === this.connectDrag.pointerId) {
      const { source, moved } = this.connectDrag
      const connection = this.connection
      this.connectDrag = null
      this.connection = null
      if (!moved) {
        if (released) this.select(source, true)
      } else if (released && connection?.point) this.finishConnection(source, connection.target, connection.point)
    }
    if (this.drag && event.pointerId === this.drag.pointerId) {
      const { id, moved } = this.drag
      this.drag = null
      this.draggingId = null
      if (moved) this.commitCustomLayout()
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
          const selected = this.edgeByKey(edge)
          if (selected && this.isDoubleTap(`edge:${edge}`, event)) void this.editEdgeLabel(selected.source, selected.target)
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

  private hasEdge(source: string, target: string) {
    return this.edges.some((edge) => edge.source === source && edge.target === target)
  }

  /** Whether connecting `source` to `target` would make a new edge: no self-loop, no duplicate. */
  private canConnect(source: string, target: string | null): target is string {
    return target !== null && target !== source && this.byId.has(target) && !this.hasEdge(source, target)
  }

  private edgeByKey(key: string | null): FlowEdge | null {
    return key === null ? null : (this.edges.find((edge) => edgeKey(edge.source, edge.target) === key) ?? null)
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

  /** Top-left corner for a node dropped at `point` at the end of a connection: its incoming side on the point. */
  private incomingAt(point: FlowPoint): FlowPoint {
    const size = this.typicalSize()
    return this.direction === 'LR' ? { x: point.x, y: point.y - size.height / 2 } : { x: point.x - size.width / 2, y: point.y }
  }

  /** A spot near `start` that no node covers, for the nodes the keyboard asks for. */
  private freeSpot(start: FlowPoint): FlowPoint {
    const id = '\u0000new'
    const size = this.typicalSize()
    return avoidOverlap(id, start, [...this.positions.keys()], this.positions, (key) => (key === id ? size : this.sizeOf(key)), this.layoutOptions())
  }

  private requestNode(position: FlowPoint, source?: string, fromKeyboard = false) {
    if (fromKeyboard) this.focusAdded = new Set(this.byId.keys())
    const detail: FlowNodeAddDetail = { position: { x: Math.round(position.x), y: Math.round(position.y) } }
    if (source !== undefined) detail.source = source
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

  /** Ends a connection: an edge to `target`, or a new connected node at `point` when there is no target. */
  private finishConnection(source: string, target: string | null, point: FlowPoint | null) {
    if (target === null) {
      if (point) this.requestNode(this.incomingAt(point), source)
      return
    }
    if (!this.canConnect(source, target)) return
    this.dispatchEvent(new CustomEvent<FlowEdgeEventDetail>('edge-add', { detail: { source, target } }))
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
      this.announce(`${this.labelOf(source)} is already connected to every other node.`)
      return
    }
    this.hideCard(true)
    const main = this.direction === 'LR' ? 'x' : 'y'
    const from = this.positions.get(source)![main]
    const target = targets.find((id) => this.positions.get(id)![main] > from) ?? targets[0]
    this.connection = { source, point: null, target, keyboard: true }
    this.announce(`Connect ${this.labelOf(source)} to ${this.labelOf(target)}. Arrow keys or Tab choose another node, Enter connects, Escape cancels.`)
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
      this.announce(`${this.labelOf(targets[next])}, ${next + 1} of ${targets.length}`)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      this.connection = null
      if (this.canConnect(connection.source, connection.target)) {
        this.finishConnection(connection.source, connection.target, null)
        this.announce(`Connected ${this.labelOf(connection.source)} to ${this.labelOf(connection.target)}.`)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.cancelConnection()
      this.announce('Connection cancelled.')
    }
  }

  private selectEdge(key: string, position = '') {
    const edge = this.edgeByKey(key)
    if (!edge) return
    this.select(null)
    this.selectedEdge = key
    this.hideCard(true)
    const label = edge.label?.trim() ? `, labelled ${edge.label.trim()}` : ''
    this.announce(`Edge from ${this.labelOf(edge.source)} to ${this.labelOf(edge.target)}${label}${position} selected. Delete removes it, F2 edits its label.`)
  }

  /** `E` on a node: selects its edges one after the other. */
  private stepEdges(id: string) {
    const keys = [...new Set(this.edges.filter((edge) => edge.source === id || edge.target === id).map((edge) => edgeKey(edge.source, edge.target)))]
    if (!keys.length) {
      this.announce(`${this.labelOf(id)} has no edges.`)
      return
    }
    const index = (keys.indexOf(this.selectedEdge ?? '') + 1) % keys.length
    this.selectEdge(keys[index], keys.length > 1 ? `, ${index + 1} of ${keys.length},` : '')
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
    this.dispatchEvent(new CustomEvent<FlowEdgeEventDetail>('edge-delete', { detail: { source: edge.source, target: edge.target } }))
  }

  private commitEdgeEdit(refocus: boolean) {
    const key = this.editingEdge
    if (key === null) return
    const label = this.renderRoot.querySelector<HTMLInputElement>('.label-editor--edge')?.value.trim() ?? ''
    this.editingEdge = null
    const edge = this.edgeByKey(key)
    if (edge && label !== (edge.label ?? '').trim()) {
      this.dispatchEvent(new CustomEvent<FlowEdgeEditDetail>('edge-edit', { detail: { source: edge.source, target: edge.target, label } }))
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
    const selectedEdge = this.edgeByKey(this.selectedEdge)
    if (selectedEdge && (event.key === 'F2' || (event.key === 'Enter' && !event.shiftKey))) {
      event.preventDefault()
      void this.editEdgeLabel(selectedEdge.source, selectedEdge.target)
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
    this.lastFocusedId = id
    this.focusId = id
    this.highlightId = id
    this.scheduleCard(id)
  }

  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    // A keyboard connection lasts while focus stays in the flow.
    if (this.connection?.keyboard && !(next && this.renderRoot.contains(next))) this.cancelConnection()
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
    if (event.pointerType !== 'touch') this.scheduleCard(id)
  }

  private handleNodeLeave = (event: PointerEvent) => {
    this.highlightId = null
    if (event.pointerType !== 'touch') this.scheduleCardClose()
  }

  private scheduleCard(id: string) {
    clearTimeout(this.closeTimer)
    this.closeTimer = undefined
    if (this.noCard || this.draggingId || this.editingId !== null || this.editingEdge !== null || this.connection) return
    if (this.cardId === id) return
    clearTimeout(this.openTimer)
    // Moving from one node's card to the next node's opens it at once, like a menu bar.
    const delay = this.cardId ? 0 : this.openDelay
    this.openTimer = setTimeout(() => {
      this.openTimer = undefined
      this.cardId = id
    }, delay)
  }

  private scheduleCardClose() {
    clearTimeout(this.openTimer)
    this.openTimer = undefined
    if (!this.cardId || this.closeTimer) return
    this.closeTimer = setTimeout(() => {
      this.closeTimer = undefined
      this.cardId = null
    }, this.closeDelay)
  }

  private hideCard(now = false) {
    clearTimeout(this.openTimer)
    this.openTimer = undefined
    if (now) {
      clearTimeout(this.closeTimer)
      this.closeTimer = undefined
      this.cardId = null
    } else this.scheduleCardClose()
  }

  private clearCardTimers() {
    clearTimeout(this.openTimer)
    clearTimeout(this.closeTimer)
    this.openTimer = this.closeTimer = undefined
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
    const anchor = this.cardId ? this.renderRoot.querySelector<HTMLElement>(`.node[data-node-id="${CSS.escape(this.cardId)}"]`) : null
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
    const placement = this.direction === 'LR' ? 'bottom' : 'right'
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
    const defaultItems = node || edge ? (this.editable ? this.editMenuItems(node) : nothing) : this.defaultMenuItems()
    const custom = this.renderContextMenu?.({ node, edge, defaultItems, x: context.x, y: context.y })
    const rows = custom === undefined ? (defaultItems === nothing ? null : defaultItems) : custom
    if (rows !== null && rows !== undefined && rows !== nothing && rows !== false) {
      this.menuNode = node
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
              >${this.menuIcon(MENU_ICONS.rename)}Rename<c2-kbd slot="shortcut">F2</c2-kbd></c2-menu-item
            >`
          : nothing
      }
      ${
        node
          ? nothing
          : html`<c2-menu-item value="flow:edit-label" aria-keyshortcuts="F2"
              >${this.menuIcon(MENU_ICONS.rename)}Edit label<c2-kbd slot="shortcut">F2</c2-kbd></c2-menu-item
            >`
      }
      <c2-menu-item value="flow:delete" aria-keyshortcuts="Delete">${this.menuIcon(MENU_ICONS.remove)}Delete<c2-kbd slot="shortcut">Del</c2-kbd></c2-menu-item>
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
                >${this.menuIcon(MENU_ICONS.add)}Add node<c2-kbd slot="shortcut">N</c2-kbd></c2-menu-item
              >
              <hr />`
          : nothing
      }
      <c2-menu-item value="flow:zoom-in" keep-open aria-keyshortcuts=${ariaKeyShortcuts(ZOOM_IN_KEYS)}
        >${this.menuIcon(MENU_ICONS.zoomIn)}Zoom in<c2-kbd slot="shortcut">${mod}+</c2-kbd></c2-menu-item
      >
      <c2-menu-item value="flow:zoom-out" keep-open aria-keyshortcuts=${ariaKeyShortcuts(ZOOM_OUT_KEYS)}
        >${this.menuIcon(MENU_ICONS.zoomOut)}Zoom out<c2-kbd slot="shortcut">${mod}−</c2-kbd></c2-menu-item
      >
      <c2-menu-item value="flow:fit" aria-keyshortcuts=${ariaKeyShortcuts(FIT_KEYS)}
        >${this.menuIcon(MENU_ICONS.fit)}Fit view<c2-kbd slot="shortcut">${mod}0</c2-kbd></c2-menu-item
      >
      <hr />
      <h6>Layout</h6>
      <c2-menu-item type="radio" name="flow-direction" value="flow:direction-lr" .checked=${lr}>Left to right</c2-menu-item>
      <c2-menu-item type="radio" name="flow-direction" value="flow:direction-tb" .checked=${!lr}>Top to bottom</c2-menu-item>
      <c2-menu-item value="flow:auto-layout" ?disabled=${!this.custom}>${this.menuIcon(MENU_ICONS.layout)}Auto layout</c2-menu-item>
      <c2-menu-item type="checkbox" value="flow:lock" .checked=${this.locked}>Lock layout</c2-menu-item>
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
        if (edge) setTimeout(() => void this.editEdgeLabel(edge.source, edge.target))
        return
      case 'flow:delete':
        if (!this.editable) return
        if (node) this.deleteNode(node.id)
        else if (edge) this.deleteEdge(edge)
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
        const key = edgeKey(edge.source, edge.target)
        if (!this.edgeLabels.has(key) && edge.label?.trim()) this.edgeLabels.set(key, edge.label.trim())
      }
    }
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
    if ((changed as Map<PropertyKey, unknown>).has('cardId') || changed.has('nodes') || changed.has('direction')) this.syncCard()
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
      aria-label=${`Rename ${node.label}`}
      autocomplete="off"
      enterkeyhint="done"
      @keydown=${this.handleEditorKeydown}
      @blur=${this.handleEditorBlur}
    />`
  }

  private defaultNode(node: FlowNode) {
    const status = statusOf(node)
    return html`<div class="body">
      ${this.icon(status)}
      <span class="text">
        ${node.id === this.editingId ? this.labelEditor(node, false) : html`<span class="label">${node.label}</span>`}
        ${node.description ? html`<span class="description">${node.description}</span>` : nothing}
      </span>
      ${node.meta ? html`<span class="meta">${node.meta}</span>` : nothing}
    </div>`
  }

  private defaultCard(node: FlowNode) {
    const status = statusOf(node)
    const rows = [...(node.meta ? [['Duration', node.meta] as [string, string]] : []), ...detailRows(node.details)]
    return html`<div class="card-content status--${status}">
      <div class="card-head">
        ${this.icon(status)}
        <span class="text">
          <span class="card-title">${node.label}</span>
          ${node.description ? html`<span class="description">${node.description}</span>` : nothing}
        </span>
      </div>
      <div class="card-status">${STATUS_LABELS[status]}</div>
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

  /** An arrowhead at the end of an edge, pointing along the main axis into the target. */
  private arrow(classes: string, end: FlowPoint) {
    const angle = this.direction === 'TB' ? 90 : 0
    return html`<span
      class=${`arrow ${classes}`}
      style=${`transform: translate(${end.x}px, ${end.y}px) rotate(${angle}deg) translate(var(--_arrow-offset), -50%)`}
    ></span>`
  }

  private renderEdges() {
    const highlight = this.highlightId ?? this.selected
    const paths: unknown[] = []
    const marks: unknown[] = []
    let editor: unknown = nothing
    this.edges.forEach((edge, index) => {
      const a = this.positions.get(edge.source)
      const b = this.positions.get(edge.target)
      if (!a || !b) return
      const sa = this.sizeOf(edge.source)
      const sb = this.sizeOf(edge.target)
      const back = this.graph.backEdges.has(index)
      const route = edgeRoute({ ...a, ...sa }, { ...b, ...sb }, this.direction, this.edgeType, back)
      const edgeClass = edgeState(statusOf(this.byId.get(edge.source)!), statusOf(this.byId.get(edge.target)!))
      const on = highlight !== null && (edge.source === highlight || edge.target === highlight)
      const key = edgeKey(edge.source, edge.target)
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
      marks.push(this.arrow(classes, route.end))
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
      marks.push(this.arrow('mark--draft', draft.end))
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
      aria-label=${`Label of the edge from ${this.labelOf(edge.source)} to ${this.labelOf(edge.target)}`}
      autocomplete="off"
      enterkeyhint="done"
      @keydown=${this.handleEditorKeydown}
      @blur=${this.handleEditorBlur}
    />`
  }

  /** The route of the edge following the pointer, or pointing at the keyboard's candidate, while a connection is made. */
  private draftRoute() {
    const connection = this.connection
    const a = connection && this.positions.get(connection.source)
    if (!connection || !a) return null
    const target = this.canConnect(connection.source, connection.target) ? connection.target : null
    const b = target === null ? null : this.positions.get(target)
    const end = b ? { ...b, ...this.sizeOf(target!) } : connection.point ? { ...connection.point, width: 0, height: 0 } : null
    if (!end) return null
    return edgeRoute({ ...a, ...this.sizeOf(connection.source) }, end, this.direction, this.edgeType, false)
  }

  /** "After Idea." or, when an edge has a label, "Before Book the night bus, yes; Walk home, no." */
  private relation(word: string, ids: string[], keyOf: (id: string) => string) {
    if (!ids.length) return ''
    const labels = ids.map((id) => this.edgeLabels.get(keyOf(id)))
    const parts = ids.map((id, i) => (labels[i] ? `${this.labelOf(id)}, ${labels[i]}` : this.labelOf(id)))
    return `${word} ${parts.join(labels.some(Boolean) ? '; ' : ', ')}.`
  }

  private renderNodeElement(node: FlowNode, index: number) {
    const status = statusOf(node)
    const p = this.positions.get(node.id) ?? { x: 0, y: 0 }
    const before = this.graph.predecessors.get(node.id) ?? []
    const after = this.graph.successors.get(node.id) ?? []
    const relations = [this.relation('After', before, (id) => edgeKey(id, node.id)), this.relation('Before', after, (id) => edgeKey(node.id, id))]
      .filter(Boolean)
      .join(' ')
    const context = this.context(node)
    const body = this.renderNode ? this.renderNode(context) : this.defaultNode(node)
    const connection = this.connection
    const editing = node.id === this.editingId
    const classes = [
      'node',
      `status--${status}`,
      node.id === this.selected ? 'is-selected' : '',
      node.id === this.draggingId ? 'is-dragging' : '',
      connection?.source === node.id ? 'is-connect-source' : '',
      connection && connection.target === node.id && this.canConnect(connection.source, node.id) ? 'is-connect-target' : '',
    ]
    const hasIn = this.edges.some((edge) => edge.target === node.id)
    const hasOut = this.edges.some((edge) => edge.source === node.id)
    // A node drawn by the application has no label of ours to swap: the editor covers its whole body instead.
    const custom = !!this.renderNode || !!this.querySelector(`:scope > [slot="node:${CSS.escape(node.id)}"]`)
    return html`<div
      class=${classes.filter(Boolean).join(' ')}
      data-node-id=${node.id}
      role=${editing ? 'group' : 'button'}
      tabindex=${node.id === this.focusId ? 0 : -1}
      aria-label=${`${node.label}, ${STATUS_LABELS[status].toLowerCase()}${node.meta ? `, ${node.meta}` : ''}`}
      aria-describedby=${relations ? `relations-${index}` : nothing}
      style=${`transform: translate(${p.x}px, ${p.y}px)`}
      @pointerenter=${this.handleNodeEnter}
      @pointerleave=${this.handleNodeLeave}
      @c2-context-menu-request=${(event: Event) => provideContextMenuData(event, this, { node })}
    >
      <slot name=${`node:${node.id}`}>${body}</slot>
      ${editing && custom ? this.labelEditor(node, true) : nothing} ${hasIn ? html`<span class="handle handle--in"></span>` : nothing}
      ${this.editable ? html`<span class="connector" title="Drag to connect"></span>` : hasOut ? html`<span class="handle handle--out"></span>` : nothing}
      ${relations ? html`<span id=${`relations-${index}`} class="visually-hidden">${relations}</span>` : nothing}
    </div>`
  }

  private renderCardContent() {
    const node = this.cardId ? this.byId.get(this.cardId) : undefined
    if (!node) return nothing
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
      aria-label="Flow actions"
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
    return html`
      <c2-context-menu
        menu-label="Flow"
        ?disabled=${this.noContextMenu}
        .renderContextMenu=${this.buildMenu}
        @context-menu-select=${this.handleMenuSelect}
        @menu-select=${this.stopMenuSelect}
      >
        <div
          class=${stageClasses.filter(Boolean).join(' ')}
          style=${`--_zoom: ${this.zoom}; background-position: ${this.tx}px ${this.ty}px`}
          tabindex=${emptyCanvas ? 0 : nothing}
          role=${emptyCanvas ? 'group' : nothing}
          aria-label=${emptyCanvas ? 'Empty flow' : nothing}
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
            ${this.renderEdges()}
            ${repeat(
              this.nodes,
              (node) => node.id,
              (node, index) => this.renderNodeElement(node, index),
            )}
            ${this.ghost ? this.renderGhost(this.ghost) : nothing}
          </div>
          ${emptyCanvas ? html`<span id="empty-hint" class="visually-hidden">Press N or Enter to add a node.</span>` : nothing}
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
