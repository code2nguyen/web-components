import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { isServer } from 'lit-html/is-server.js'
import { query, state } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { provideContextMenuData } from '@c2n/core/context-menu-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import type { ContextMenuContext, ContextMenuSelectEventDetail } from '@c2n/context-menu'
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { buildGraph, layoutGraph, mergeLayout, type Graph, type LayoutOptions } from './flow-layout.js'
import { edgePath } from './flow-geometry.js'
import { MENU_ICONS, STATUS_ICONS, STATUS_LABELS } from './flow-icons.js'
import type {
  FlowContextMenuRenderer,
  FlowDirection,
  FlowEdge,
  FlowEdgeType,
  FlowLayout,
  FlowLayoutChangeDetail,
  FlowLayoutChangeReason,
  FlowMenuSelectDetail,
  FlowNode,
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

/**
 * A pipeline or dependency graph drawn as nodes and smooth edges on a pannable, zoomable canvas, in the spirit of
 * React Flow but read-only in its topology: the graph comes from the `nodes` and `edges` properties, each node carries
 * a {@link FlowStatus}, and edges take their style from the statuses at both ends (an edge into a running step
 * animates, one out of a failed step turns red, one touching a skipped step is dotted).
 *
 * **Layout.** Nodes are placed by a built-in layered layout: one column (`direction="LR"`) or row (`"TB"`) per
 * dependency depth, siblings ordered to reduce crossings. Cycles are allowed; the edges that close them are routed
 * round the outside of the nodes. Dragging a node (or Alt+arrow on a focused one) switches the flow to a custom
 * layout, saved in `localStorage` under `storage-key` and restored on the next visit. When the graph has changed
 * since, the saved layout is merged: kept nodes stay where they were, new nodes are placed relative to their
 * already-placed neighbours, removed ones are dropped. **Auto layout** in the context menu, or `resetLayout()`,
 * goes back to the computed layout.
 *
 * **Context menu.** Right-click, long-press, or Shift+F10 / the context-menu key opens a `c2-context-menu` with the
 * view controls: zoom in, zoom out, fit view, layout direction, auto layout and lock layout, plus **Show details** on
 * a node. `renderContextMenu` replaces or extends those rows; rows it adds fire `flow-menu-select`.
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
 * Shift), `+` / `-` zoom and `0` fits the view. Ctrl/⌘ + wheel zooms; a plain wheel keeps scrolling the page.
 *
 * @tag c2-flow
 *
 * @slot node:{id} - Body of the node whose `id` is `{id}`, e.g. `slot="node:build"`. Replaces `renderNode` and the default body for that node.
 * @slot card:{id} - Content of the hover card of node `{id}`. Replaces `renderCard` and the default card for that node.
 *
 * @event {CustomEvent<FlowNodeEventDetail>} node-click - A node was clicked, activated with Enter or Space, or chosen with **Show details** in the context menu. Does not bubble.
 * @event {CustomEvent<FlowSelectionChangeDetail>} selection-change - The selected node changed through the user. `detail.selected` is its id, or `null`. Does not bubble.
 * @event {CustomEvent<FlowLayoutChangeDetail>} layout-change - The user moved a node, switched direction or went back to auto layout, or `setLayout()` was called. Does not bubble.
 * @event {CustomEvent<FlowMenuSelectDetail>} flow-menu-select - A context-menu row added by `renderContextMenu` was activated, with the node it was opened on. Does not bubble.
 *
 * @internalcomponent c2-context-menu
 * @internalcomponent c2-kbd
 *
 * @cssproperty {pixel} [--c2-flow--height=480px] - Height of the canvas.
 * @cssproperty {color} [--c2-flow--background-color=#fafafa] - Canvas background.
 * @cssproperty {border} [--c2-flow--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-flow--border-radius=8px]
 * @cssproperty {font-family} --c2-flow--font-family
 * @cssproperty {color} [--c2-flow__dot--color=#d4d4d8] - Colour of the canvas dot grid.
 * @cssproperty {pixel} [--c2-flow__dot--size=1px] - Radius of one grid dot.
 * @cssproperty {pixel} [--c2-flow__dot--gap=16px] - Spacing of the dot grid at 100% zoom.
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
  @state() private draggingId: string | null = null
  @state() private panning = false
  @state() private custom = false

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
  private topologyKey = ''
  private layoutDirection: FlowDirection | null = null
  private storageLoaded = false
  /** The user panned or zoomed, so a resize no longer refits the view. */
  private viewTouched = false
  private fitted = false

  private drag: { id: string; startX: number; startY: number; origin: FlowPoint; moved: boolean; pointerId: number } | null = null
  private pan: { startX: number; startY: number; tx: number; ty: number; moved: boolean; pointerId: number } | null = null
  private tween = 0
  private menuNode: FlowNode | null = null
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

  // ---------------------------------------------------------------------------------------------------------------
  // Layout

  private readPixels(name: string, fallback: number) {
    if (isServer) return fallback
    const value = Number.parseFloat(getComputedStyle(this).getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }

  private layoutOptions(): LayoutOptions {
    const tb = this.direction === 'TB'
    const rankGap = this.readPixels('--_rank-gap', 72)
    const nodeGap = this.readPixels('--_node-gap', 20)
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

  private handlePointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !this.stage) return
    const id = this.nodeIdFromEvent(event)
    // A locked flow still tracks the press on a node, so it can tell a click from a pan.
    if (id) {
      this.drag = { id, startX: event.clientX, startY: event.clientY, origin: { ...this.positions.get(id)! }, moved: false, pointerId: event.pointerId }
    } else {
      this.pan = { startX: event.clientX, startY: event.clientY, tx: this.tx, ty: this.ty, moved: false, pointerId: event.pointerId }
    }
    this.stage.setPointerCapture(event.pointerId)
  }

  private handlePointerMove = (event: PointerEvent) => {
    if (this.drag && event.pointerId === this.drag.pointerId) {
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
    if (this.drag && event.pointerId === this.drag.pointerId) {
      const { id, moved } = this.drag
      this.drag = null
      this.draggingId = null
      if (moved) this.commitCustomLayout()
      else if (event.type === 'pointerup') this.select(id, true)
    }
    if (this.pan && event.pointerId === this.pan.pointerId) {
      const moved = this.pan.moved
      this.pan = null
      this.panning = false
      if (!moved && event.type === 'pointerup') this.select(null)
    }
  }

  private commitCustomLayout() {
    this.pinned = this.getLayout()
    this.custom = true
    this.save()
    this.emitLayout('drag')
  }

  private handleWheel = (event: WheelEvent) => {
    // A plain wheel scrolls the page; Ctrl/⌘ (and a trackpad pinch, which reports ctrlKey) zooms.
    if (!(event.ctrlKey || event.metaKey) || !this.stage) return
    event.preventDefault()
    const rect = this.stage.getBoundingClientRect()
    this.zoomAround(Math.exp(-event.deltaY * 0.0022), event.clientX - rect.left, event.clientY - rect.top)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Keyboard

  private handleKeydown = (event: KeyboardEvent) => {
    const id = this.nodeIdFromEvent(event)
    if (event.key === 'Escape') {
      if (this.cardId) {
        this.hideCard(true)
        event.stopPropagation()
      } else if (this.selected) this.select(null)
      return
    }
    if (!event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key === '+' || event.key === '=') return this.keyZoom(event, ZOOM_STEP)
      if (event.key === '-' || event.key === '_') return this.keyZoom(event, 1 / ZOOM_STEP)
      if (event.key === '0') {
        event.preventDefault()
        this.viewTouched = false
        this.fitView()
        return
      }
    }
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
    if (next) this.focusNode(next)
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
    this.focusId = id
    this.highlightId = id
    this.scheduleCard(id)
  }

  private handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    if (next && (this.card?.contains(next) || this.contains(next))) return
    this.highlightId = null
    this.scheduleCardClose()
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
    if (this.noCard || this.draggingId) return
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
    const gap = this.readPixels('--_card-offset', 8)
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
    const node = (context.data as { node?: FlowNode } | undefined)?.node ?? null
    this.menuNode = node
    this.hideCard(true)
    const defaultItems = this.defaultMenuItems(node)
    const rows = this.renderContextMenu?.({ node, defaultItems, x: context.x, y: context.y })
    return rows === undefined ? defaultItems : rows
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

  private defaultMenuItems(node: FlowNode | null) {
    const lr = this.direction === 'LR'
    return html`
      ${
        node
          ? html`<h6>${node.label}</h6>
              <c2-menu-item value="flow:details">${this.menuIcon(MENU_ICONS.details)}Show details</c2-menu-item>
              <hr />`
          : nothing
      }
      <c2-menu-item value="flow:zoom-in" keep-open>${this.menuIcon(MENU_ICONS.zoomIn)}Zoom in<c2-kbd slot="shortcut">+</c2-kbd></c2-menu-item>
      <c2-menu-item value="flow:zoom-out" keep-open>${this.menuIcon(MENU_ICONS.zoomOut)}Zoom out<c2-kbd slot="shortcut">−</c2-kbd></c2-menu-item>
      <c2-menu-item value="flow:fit">${this.menuIcon(MENU_ICONS.fit)}Fit view<c2-kbd slot="shortcut">0</c2-kbd></c2-menu-item>
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
    switch (value) {
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
    this.dispatchEvent(new CustomEvent<FlowMenuSelectDetail>('flow-menu-select', { detail: { value, checked, data, node } }))
  }

  /** The rows' own `menu-select` bubbles out of the menu; the flow reports it as `flow-menu-select` instead. */
  private stopMenuSelect = (event: Event) => event.stopPropagation()

  // ---------------------------------------------------------------------------------------------------------------
  // Lifecycle

  override willUpdate(changed: PropertyValues<this>) {
    if (!isServer && (!this.storageLoaded || (changed.has('storageKey') && this.hasUpdated))) this.loadStorage()
    if (changed.has('nodes')) {
      const nodes = Array.isArray(this.nodes) ? this.nodes : []
      if (nodes !== this.nodes) this.nodes = nodes
      this.byId = new Map(nodes.map((node) => [node.id, node]))
    }
    if (changed.has('edges') && !Array.isArray(this.edges)) this.edges = []
    const key = `${this.nodes.map((node) => node.id).join('\u0000')}\u0001${this.edges.map((edge) => `${edge.source}\u0000${edge.target}`).join('\u0001')}`
    if (this.layoutDirection !== null && this.direction !== this.layoutDirection && !changed.has('storageKey')) {
      // The direction was set from outside: a custom layout drawn for the other axis no longer applies.
      this.pinned = {}
      this.custom = false
    }
    if (key !== this.topologyKey || this.direction !== this.layoutDirection || changed.has('storageKey')) {
      this.topologyKey = key
      this.relayout()
      this.fitted = false
    }
  }

  override firstUpdated() {
    this.observe()
  }

  override updated(changed: PropertyValues<this>) {
    if (isServer) return
    if (changed.has('nodes')) this.observe()
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

  private defaultNode(node: FlowNode) {
    const status = statusOf(node)
    return html`<div class="body">
      ${this.icon(status)}
      <span class="text">
        <span class="label">${node.label}</span>
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

  private renderEdges() {
    const highlight = this.highlightId ?? this.selected
    const paths = this.edges.map((edge, index) => {
      const a = this.positions.get(edge.source)
      const b = this.positions.get(edge.target)
      if (!a || !b) return nothing
      const sa = this.sizeOf(edge.source)
      const sb = this.sizeOf(edge.target)
      const back = this.graph.backEdges.has(index)
      const d = edgePath({ ...a, ...sa }, { ...b, ...sb }, this.direction, this.edgeType, back)
      const edgeClass = edgeState(statusOf(this.byId.get(edge.source)!), statusOf(this.byId.get(edge.target)!))
      const on = highlight !== null && (edge.source === highlight || edge.target === highlight)
      return svg`<path class="edge edge--${edgeClass}${back ? ' edge--back' : ''}${on ? ' is-highlighted' : ''}" d=${d}></path>`
    })
    const dim = highlight !== null && this.byId.has(highlight)
    return html`<svg class="edges${dim ? ' has-highlight' : ''}" aria-hidden="true">${paths}</svg>`
  }

  private renderNodeElement(node: FlowNode, index: number) {
    const status = statusOf(node)
    const p = this.positions.get(node.id) ?? { x: 0, y: 0 }
    const before = this.graph.predecessors.get(node.id) ?? []
    const after = this.graph.successors.get(node.id) ?? []
    const labelOf = (id: string) => this.byId.get(id)?.label ?? id
    const relations = [before.length ? `After ${before.map(labelOf).join(', ')}.` : '', after.length ? `Before ${after.map(labelOf).join(', ')}.` : '']
      .filter(Boolean)
      .join(' ')
    const context = this.context(node)
    const body = this.renderNode ? this.renderNode(context) : this.defaultNode(node)
    const classes = ['node', `status--${status}`, node.id === this.selected ? 'is-selected' : '', node.id === this.draggingId ? 'is-dragging' : '']
    const hasIn = this.edges.some((edge) => edge.target === node.id)
    const hasOut = this.edges.some((edge) => edge.source === node.id)
    return html`<div
      class=${classes.filter(Boolean).join(' ')}
      data-node-id=${node.id}
      role="button"
      tabindex=${node.id === this.focusId ? 0 : -1}
      aria-label=${`${node.label}, ${STATUS_LABELS[status].toLowerCase()}${node.meta ? `, ${node.meta}` : ''}`}
      aria-describedby=${relations ? `relations-${index}` : nothing}
      style=${`transform: translate(${p.x}px, ${p.y}px)`}
      @pointerenter=${this.handleNodeEnter}
      @pointerleave=${this.handleNodeLeave}
      @c2-context-menu-request=${(event: Event) => provideContextMenuData(event, this, { node })}
    >
      <slot name=${`node:${node.id}`}>${body}</slot>
      ${hasIn ? html`<span class="handle handle--in"></span>` : nothing} ${hasOut ? html`<span class="handle handle--out"></span>` : nothing}
      ${relations ? html`<span id=${`relations-${index}`} class="visually-hidden">${relations}</span>` : nothing}
    </div>`
  }

  private renderCardContent() {
    const node = this.cardId ? this.byId.get(this.cardId) : undefined
    if (!node) return nothing
    const body = this.renderCard ? this.renderCard(this.context(node)) : this.defaultCard(node)
    return html`<slot name=${`card:${node.id}`}>${body}</slot>`
  }

  override render() {
    const direction = this.direction === 'TB' ? 'tb' : 'lr'
    const stageClasses = ['stage', `direction--${direction}`, this.panning ? 'is-panning' : '', this.locked ? 'is-locked' : '']
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
          @pointerdown=${this.handlePointerDown}
          @pointermove=${this.handlePointerMove}
          @pointerup=${this.handlePointerUp}
          @pointercancel=${this.handlePointerUp}
          @wheel=${this.handleWheel}
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
          </div>
        </div>
      </c2-context-menu>
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
