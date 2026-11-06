import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query, state as reactive } from 'lit/decorators.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { SlotPresenceController, deepActiveElement } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { floatingPanelMessages } from './messages.js'
import styles from './floating-panel.scss?inline'

export type FloatingPanelState = 'normal' | 'minimized' | 'maximized'
export type FloatingPanelBoundary = 'viewport' | 'parent'
export type FloatingPanelMinimize = 'dock' | 'collapse'

/** A panel's place and size in boundary pixels: from the top-left corner of the window, or of the positioned parent. */
export interface FloatingPanelRect {
  x: number
  y: number
  width: number
  height: number
}

/** What moved or resized the panel. */
export type FloatingPanelRectChangeReason = 'drag' | 'resize' | 'keyboard' | 'boundary' | 'method'

export interface FloatingPanelStateChangeDetail {
  state: FloatingPanelState
  previous: FloatingPanelState
}

export interface FloatingPanelRectChangeDetail {
  /** The new place, or `null` when the panel went back to its CSS place. */
  rect: FloatingPanelRect | null
  reason: FloatingPanelRectChangeReason
}

/** Events fired by {@link FloatingPanel}, keyed for `addEventListener`. */
export interface FloatingPanelEventMap {
  open: Event
  'before-close': Event
  close: Event
  'state-change': CustomEvent<FloatingPanelStateChangeDetail>
  'rect-change': CustomEvent<FloatingPanelRectChangeDetail>
}

export interface FloatingPanel {
  addEventListener: TypedAddEventListener<FloatingPanel, FloatingPanelEventMap>
  removeEventListener: TypedRemoveEventListener<FloatingPanel, FloatingPanelEventMap>
}

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const EDGES: readonly Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const STATES: readonly FloatingPanelState[] = ['normal', 'minimized', 'maximized']

interface Bounds {
  width: number
  height: number
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
}

interface Gesture {
  edge: Edge | 'move'
  pointerId: number
  startX: number
  startY: number
  start: FloatingPanelRect
  bounds: Bounds
  /** Height on screen at the start: a collapsed panel is only its title bar, though its rect keeps the full height. */
  visible: number
  moved: boolean
}

/** Narrowest a docked panel gets before the dock line wraps. */
const DOCK_MIN_WIDTH = 120
const STEP = 10
const BIG_STEP = 50
/** Pixels a press on the title bar travels before it becomes a drag, so a double-click never moves the panel. */
const DRAG_THRESHOLD = 3
/** Moves and resizes are announced once the keys or the pointer stop for this long. */
const ANNOUNCE_DELAY = 500

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable=""], [contenteditable="true"]'

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** The rect when it is a usable `{ x, y, width, height }`, else `undefined`. */
function validRect(value: unknown): FloatingPanelRect | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { x, y, width, height } = value as Record<string, unknown>
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return undefined
  return { x, y, width, height }
}

/** `value` within `[low, high]`; when the range is empty (a boundary smaller than the minimum), `high` wins. */
function clampNumber(value: number, low: number, high: number) {
  return Math.max(Math.min(value, high), Math.min(low, high))
}

function roundRect(rect: FloatingPanelRect): FloatingPanelRect {
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
}

function sameRect(a: FloatingPanelRect | undefined, b: FloatingPanelRect | undefined) {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height)
}

/** Fits a rect inside its boundary: the size first (within the minimum and maximum), then the place. */
function fitRect(rect: FloatingPanelRect, bounds: Bounds, visibleHeight?: number): FloatingPanelRect {
  const width = clampNumber(rect.width, bounds.minWidth, Math.min(bounds.maxWidth, bounds.width))
  const height = clampNumber(rect.height, bounds.minHeight, Math.min(bounds.maxHeight, bounds.height))
  const x = clampNumber(rect.x, 0, bounds.width - width)
  const y = clampNumber(rect.y, 0, bounds.height - (visibleHeight ?? height))
  return roundRect({ x, y, width, height })
}

/** The rect after dragging `edge` by `dx`, `dy`: the opposite edges stay where they are. */
function resizeRect(start: FloatingPanelRect, edge: Edge, dx: number, dy: number, bounds: Bounds): FloatingPanelRect {
  let x = start.x
  let y = start.y
  let width = start.width
  let height = start.height
  if (edge.includes('e')) width = clampNumber(start.width + dx, bounds.minWidth, Math.min(bounds.maxWidth, bounds.width - start.x))
  if (edge.includes('w')) {
    const right = start.x + start.width
    width = clampNumber(start.width - dx, bounds.minWidth, Math.min(bounds.maxWidth, right))
    x = right - width
  }
  if (edge.includes('s')) height = clampNumber(start.height + dy, bounds.minHeight, Math.min(bounds.maxHeight, bounds.height - start.y))
  if (edge.includes('n')) {
    const bottom = start.y + start.height
    height = clampNumber(start.height - dy, bounds.minHeight, Math.min(bounds.maxHeight, bottom))
    y = bottom - height
  }
  return roundRect({ x, y, width, height })
}

/**
 * Which sides an `inset` shorthand anchors to: a docked line grows away from them. Right and bottom unless the value
 * leaves that side `auto` and sets the opposite one.
 */
function insetAnchor(value: string): { fromLeft: boolean; fromTop: boolean } {
  const parts = value
    .trim()
    .split(/\s+(?![^(]*\))/)
    .filter(Boolean)
  if (!parts.length) return { fromLeft: false, fromTop: false }
  const [top, right = top, bottom = top, left = right] = parts
  return { fromLeft: right === 'auto' && left !== 'auto', fromTop: bottom === 'auto' && top !== 'auto' }
}

/** A CSS length as pixels: `px` as is, `%` of `total`, `min()` of those, anything else (`none`, `auto`, `calc()`) is `fallback`. */
function pixels(value: string, total: number, fallback: number): number {
  const min = /^min\((.*)\)$/.exec(value.trim())
  if (min) return Math.min(...min[1].split(',').map((part) => pixels(part.trim(), total, fallback)))
  if (value.endsWith('px')) return parseFloat(value)
  if (value.endsWith('%')) return (parseFloat(value) * total) / 100
  return fallback
}

/** The parent in the flat tree: the slot an element is assigned to, else its parent, else its shadow root's host. */
function flatParent(node: Element): Element | null {
  if (node.assignedSlot) return node.assignedSlot
  if (node.parentElement) return node.parentElement
  const root = node.parentNode
  return root instanceof ShadowRoot ? root.host : null
}

/**
 * A window inside the page that the user drags, resizes, minimises and maximises: a support chat, an inspector beside
 * a canvas, a tool palette, a call's mini window. It is not modal; the page around it stays usable.
 *
 * CSS sets where the panel first appears and how big it is (`--c2-floating-panel--inset`, `--width`, `--height`, the
 * bottom-right corner by default). Once the user moves or resizes it, `rect` holds the result, and `storage-key`
 * keeps it, with the state, in `localStorage`. `boundary="viewport"` (the default) keeps the panel inside the window
 * with `position: fixed`; `boundary="parent"` keeps it inside its nearest positioned ancestor, for a panel inside an
 * editor area. The panel always stays inside its boundary, also when the boundary or the window is resized.
 *
 * Drag the title bar to move the panel (a double-click maximises and restores it), and an edge or a corner to resize
 * it. With the keyboard, the title bar is a handle: the Arrow keys move the panel by 10px (Shift: 50px) and Home puts
 * it back at its CSS place; the grip in the bottom-right corner resizes it the same way. Escape restores a maximised
 * panel and never closes it. Minimising docks the panel to the bottom edge of its boundary as a title bar (several
 * line up from the right), or with `minimize="collapse"` folds it to its title bar where it is. A press or focus
 * anywhere in a panel brings it in front of the other panels in the same boundary.
 *
 * The host is `display: contents` and the component writes nothing on it: the panel is a non-modal `role="dialog"`
 * section in the shadow root named by its title (or `label`), and the host's own state shows as custom states.
 *
 * @tag c2-floating-panel
 *
 * @slot - The body, which scrolls.
 * @slot title - The title, shown in the title bar; it names the panel. Falls back to `label`.
 * @slot icon - An icon before the title.
 * @slot actions - Extra title-bar buttons, before the window buttons.
 * @slot footer - A row under the body, such as a message input.
 *
 * @csspart panel - The panel: the `role="dialog"` section.
 * @csspart header - The title bar.
 * @csspart handle - The draggable, focusable part of the title bar around the icon and the title.
 * @csspart icon - The box around the `icon` slot.
 * @csspart title - The box around the `title` slot.
 * @csspart actions - The box around the `actions` slot.
 * @csspart button - Each window button.
 * @csspart minimize-button - The Minimise button, which reads Restore while the panel is minimised.
 * @csspart maximize-button - The Maximise button, which reads Restore while the panel is maximised.
 * @csspart close-button - The Close button.
 * @csspart body - The scrolling body region around the default slot, which projects the panel's content inside it.
 * @csspart footer - The box around the `footer` slot.
 * @csspart grip - The resize grip in the bottom-right corner.
 *
 * @event {Event} open - The panel opened (`open` became true after the first render). Does not bubble.
 * @event {Event} before-close - Cancelable: the user, or `close()`, is about to close the panel. Call `preventDefault()` to keep it open, for "Discard the draft?". Does not bubble.
 * @event {Event} close - The panel closed. Does not bubble.
 * @event {CustomEvent<FloatingPanelStateChangeDetail>} state-change - The user or a method minimised, maximised or restored the panel; `detail` is `{ state, previous }`. Not fired when script sets `state`. Does not bubble.
 * @event {CustomEvent<FloatingPanelRectChangeDetail>} rect-change - The panel's place or size changed: at the end of a drag or a resize, on a key press, when the boundary pushed it back inside (`reason: "boundary"`) or from a method. `detail.rect` is `null` when it went back to its CSS place. Does not bubble.
 *
 * @cssproperty {inset} [--c2-floating-panel--inset=auto 24px 24px auto] - Where the panel first appears in its boundary, as an `inset` shorthand: the bottom-right corner by default.
 * @cssproperty {pixel} [--c2-floating-panel--width=360px] - First width, before the user resizes the panel.
 * @cssproperty {pixel} [--c2-floating-panel--height=auto] - First height, before the user resizes the panel.
 * @cssproperty {pixel} [--c2-floating-panel--min-width=240px] - Smallest width a resize reaches.
 * @cssproperty {pixel} [--c2-floating-panel--min-height=160px] - Smallest height a resize reaches.
 * @cssproperty {pixel} [--c2-floating-panel--max-width=100%] - Largest width, a share of the boundary.
 * @cssproperty {pixel} [--c2-floating-panel--max-height=100%] - Largest height, a share of the boundary.
 * @cssproperty {number} [--c2-floating-panel--z-index=100] - Stacking order of the panel at the back; each panel in front of it in the same boundary adds 1.
 * @cssproperty {duration} [--c2-floating-panel--transition-duration=180ms] - Minimise, maximise and restore animate over this. No animation under reduced motion.
 * @cssproperty {color} [--c2-floating-panel--background=#ffffff]
 * @cssproperty {color} [--c2-floating-panel--color=#18181b] - Text colour of the body.
 * @cssproperty {border} [--c2-floating-panel--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-floating-panel--border-radius=8px]
 * @cssproperty {box-shadow} [--c2-floating-panel--box-shadow=0 24px 60px rgba(0, 0, 0, 0.25)] - Shadow of the panel in front.
 * @cssproperty {box-shadow} [--c2-floating-panel__inactive--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)] - Shadow of a panel behind another one.
 * @cssproperty {pixel} [--c2-floating-panel__header--height=40px]
 * @cssproperty {padding} [--c2-floating-panel__header--padding=0 6px 0 12px]
 * @cssproperty {color} [--c2-floating-panel__header--background=#fafafa]
 * @cssproperty {border} [--c2-floating-panel__header--border-bottom=1px solid #e4e4e7]
 * @cssproperty {pixel} [--c2-floating-panel__title--font-size=14px]
 * @cssproperty {font-weight} [--c2-floating-panel__title--font-weight=600]
 * @cssproperty {color} [--c2-floating-panel__title--color=#18181b]
 * @cssproperty {color} [--c2-floating-panel__title__inactive--color=#71717a] - Title of a panel behind another one.
 * @cssproperty {color} [--c2-floating-panel__icon--color=#71717a]
 * @cssproperty {pixel} [--c2-floating-panel__icon--size=16px]
 * @cssproperty {pixel} [--c2-floating-panel__button--size=28px] - Width and height of each window button.
 * @cssproperty {pixel} [--c2-floating-panel__button--icon-size=16px]
 * @cssproperty {border-radius} [--c2-floating-panel__button--border-radius=6px]
 * @cssproperty {color} [--c2-floating-panel__button--color=#71717a]
 * @cssproperty {color} [--c2-floating-panel__button__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-floating-panel__button__hover--color=#18181b]
 * @cssproperty {color} [--c2-floating-panel__close-button__hover--background=#f4f4f5]
 * @cssproperty {color} [--c2-floating-panel__close-button__hover--color=#dc2626]
 * @cssproperty {padding} [--c2-floating-panel__body--padding=16px]
 * @cssproperty {pixel} [--c2-floating-panel__body--font-size=14px]
 * @cssproperty {padding} [--c2-floating-panel__footer--padding=12px 16px]
 * @cssproperty {border} [--c2-floating-panel__footer--border-top=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-floating-panel__grip--color=#a1a1aa]
 * @cssproperty {opacity} [--c2-floating-panel__grip--opacity=0] - Resting opacity of the corner grip; it shows on hover, focus and on devices without hover.
 * @cssproperty {opacity} [--c2-floating-panel__grip__hover--opacity=1]
 * @cssproperty {pixel} [--c2-floating-panel__handle--size=8px] - Thickness of the invisible resize handles on the edges and corners.
 * @cssproperty {inset} [--c2-floating-panel__docked--inset=auto 16px 0 auto] - Where the first docked panel sits. The next ones line up away from the side it anchors to (to its left for a right inset, to its right for a left one), sharing the width when the line runs out of room and wrapping to further lines (upward, or downward for a top inset), always inside the boundary.
 * @cssproperty {pixel} [--c2-floating-panel__docked--width=240px]
 * @cssproperty {pixel} [--c2-floating-panel__docked--gap=8px] - Space between docked panels.
 * @cssproperty {pixel} [--c2-floating-panel__maximized--inset=8px] - Space a maximised panel leaves around it in its boundary.
 * @cssproperty {outline} [--c2-floating-panel__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the handle, the grip and the window buttons.
 */
@customElement('c2-floating-panel')
export class FloatingPanel extends LitElement {
  static override styles = unsafeCSS(styles)

  /** Panels in front order (last is in front), per boundary: `document` for the window, else the positioned parent. */
  private static readonly stacks = new Map<object, FloatingPanel[]>()
  /** Docked panels per boundary, in the order they docked: the first sits at the right. */
  private static readonly docks = new Map<object, FloatingPanel[]>()

  private static sync(key: object | undefined) {
    if (!key) return
    const stack = FloatingPanel.stacks.get(key) ?? []
    stack.forEach((panel, index) => {
      panel.stackIndex = index
      panel.front = index === stack.length - 1
      panel.syncStates()
    })
    const dock = FloatingPanel.docks.get(key) ?? []
    dock.forEach((panel, index) => (panel.dockIndex = index))
    if (dock.length) void Promise.all(dock.map((panel) => panel.updateComplete)).then(() => FloatingPanel.layoutDock(key))
  }

  /**
   * Lines the docked panels of a boundary up from the first one's place to its left. When the line runs out of room
   * they share the width, down to `DOCK_MIN_WIDTH`, and past that wrap to further lines upward, so none leaves the
   * boundary. Until this runs (a server render), CSS lines them up at full width.
   */
  private static layoutDock(key: object) {
    const dock = (FloatingPanel.docks.get(key) ?? []).filter((panel) => panel.docked && panel.panel)
    const first = dock[0]
    if (!first) return
    const style = getComputedStyle(first.panel!)
    const { width: boundary } = first.boundarySize()
    const { fromLeft, fromTop } = insetAnchor(style.getPropertyValue('--c2-floating-panel__docked--inset'))
    // The used offset on the anchored side (positioned elements resolve `left`/`right` to pixels).
    const edge = pixels(fromLeft ? style.left : style.right, boundary, 0)
    const gap = pixels(style.getPropertyValue('--c2-floating-panel__docked--gap').trim(), boundary, 8)
    const wanted = pixels(style.getPropertyValue('--c2-floating-panel__docked--width').trim(), boundary, 240)
    const height = first.panel!.offsetHeight
    // The line keeps the same margin on its far end as the docked inset leaves on its near end.
    const room = Math.max(0, boundary - 2 * edge)
    const count = dock.length
    let perLine = count
    let barWidth = Math.min(wanted, (room - (count - 1) * gap) / count)
    if (barWidth < DOCK_MIN_WIDTH) {
      barWidth = Math.min(DOCK_MIN_WIDTH, room)
      perLine = Math.max(1, Math.floor((room + gap) / (barWidth + gap)))
      barWidth = Math.min(wanted, (room - (perLine - 1) * gap) / perLine)
    }
    barWidth = Math.max(0, Math.floor(barWidth))
    dock.forEach((panel, index) => {
      const column = (index % perLine) * (barWidth + gap)
      const line = Math.floor(index / perLine) * (height + gap)
      const place = { x: fromLeft ? column : -column, y: fromTop ? line : -line, width: barWidth }
      const current = panel.dockPlace
      if (!current || current.x !== place.x || current.y !== place.y || current.width !== place.width) panel.dockPlace = place
    })
  }

  private static remove(map: Map<object, FloatingPanel[]>, key: object, panel: FloatingPanel) {
    const list = map.get(key)
    if (!list) return
    const index = list.indexOf(panel)
    if (index !== -1) list.splice(index, 1)
    if (list.length === 0) map.delete(key)
  }

  /** The buttons' names and announcements in the nearest `lang` (English, or a language the app adds). */
  private readonly msg = new LocalizeController(this, floatingPanelMessages)
  private readonly internals = isServer ? undefined : this.attachInternals()
  private readonly slots = new SlotPresenceController(this, ['title', 'icon', 'actions', 'footer'])

  /** Shows the panel. `show()` also moves focus into it; setting `open` does not. */
  @property({ type: Boolean }) open = false

  /** `normal`, `minimized` or `maximized`. Setting it fires no `state-change`; `minimize()`, `maximize()` and `restore()` do. */
  @property() state: FloatingPanelState = 'normal'

  /** `viewport` keeps the panel inside the window (`position: fixed`); `parent` inside its nearest positioned ancestor (`position: absolute`). */
  @property() boundary: FloatingPanelBoundary = 'viewport'

  /**
   * The panel's place and size, `{ x, y, width, height }` in boundary pixels, or `null` while it sits at its CSS place.
   * Set by the user's moves and resizes. A JSON attribute, to restore a saved place.
   */
  @property({ converter: jsonPropertyConverter }) rect: FloatingPanelRect | null = null

  /** When set, `rect` and `state` are kept in `localStorage` under this key and restored when the panel loads. */
  @property({ attribute: 'storage-key' }) storageKey = ''

  /** `dock` moves a minimised panel to the bottom edge of its boundary; `collapse` folds it to its title bar where it is. */
  @property({ attribute: 'minimize' }) minimizeMode: FloatingPanelMinimize = 'dock'

  /** The panel's accessible name, and the visible title when the `title` slot is empty. Use it when the title is not text. */
  @property() label = ''

  /** The title bar does not move the panel. */
  @property({ type: Boolean, attribute: 'no-drag' }) noDrag = false

  /** The edges and the grip do not resize the panel. */
  @property({ type: Boolean, attribute: 'no-resize' }) noResize = false

  /** No Minimise button. */
  @property({ type: Boolean, attribute: 'no-minimize' }) noMinimize = false

  /** No Maximise button, and a double-click on the title bar does nothing. */
  @property({ type: Boolean, attribute: 'no-maximize' }) noMaximize = false

  /** No Close button. */
  @property({ type: Boolean, attribute: 'no-close' }) noClose = false

  @query('.panel') private panel?: HTMLElement
  @query('.handle') private handle?: HTMLElement
  @query('[part~="minimize-button"]') private minimizeButton?: HTMLElement

  /** The title's text, for the handle's and the grip's names. Read on the client only, after the first render. */
  @reactive() private titleText = ''
  @reactive() private stackIndex = 0
  @reactive() private dockIndex = 0
  /** A docked panel's offset from the first one's place and its width, once the dock line is measured. */
  @reactive() private dockPlace: { x: number; y: number; width: number } | undefined = undefined
  /** In front of the other panels of its boundary. True until the stack says otherwise, as the server renders it. */
  @reactive() private front = true
  @reactive() private interacting = false
  @reactive() private announcement = ''

  /** Where a collapsed panel at its CSS place folds, so it folds where it is rather than where `inset` anchors it. */
  @reactive() private collapseAnchor: FloatingPanelRect | undefined = undefined

  /** The place inside the boundary nearest to the CSS place, while the CSS place sticks out of a boundary too small for it. */
  @reactive() private cssFit: { x: number; y: number } | undefined = undefined

  private gesture: Gesture | undefined
  private groupKey: object | undefined
  private stopObserving: (() => void) | undefined
  private needsGroupSync = false
  private restoreState: FloatingPanelState = 'normal'
  private returnFocus: Element | null = null
  private announceTimer: ReturnType<typeof setTimeout> | undefined
  private titleObserver: MutationObserver | undefined
  /** Rendered from a declarative shadow root: the light DOM is read only after hydration. */
  private readonly hydrating = !isServer && this.shadowRoot !== null

  override connectedCallback() {
    super.connectedCallback()
    if (isServer) return
    this.titleObserver ??= new MutationObserver(() => this.readTitle())
    this.titleObserver.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['slot'] })
    if (this.hasUpdated) {
      this.needsGroupSync = true
      this.requestUpdate()
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    this.titleObserver?.disconnect()
    this.leaveGroups()
    this.stopObserving?.()
    this.stopObserving = undefined
    clearTimeout(this.announceTimer)
  }

  // ── Public methods ───────────────────────────────────────────────────────────

  /** Opens the panel, brings it to the front and moves focus into it: its first focusable element, else the title bar. */
  show() {
    if (!this.open) this.returnFocus = deepActiveElement()
    this.open = true
    void this.updateComplete.then(() => {
      this.bringToFront()
      this.focusInitial()
    })
  }

  /** Closes the panel unless a `before-close` listener cancels it. Focus returns to where it was before `show()`. */
  close() {
    if (!this.open) return
    const event = new Event('before-close', { cancelable: true })
    this.dispatchEvent(event)
    if (event.defaultPrevented) return
    const hadFocus = this.containsFocus()
    this.open = false
    const target = this.returnFocus
    this.returnFocus = null
    if (hadFocus && target?.isConnected) (target as HTMLElement).focus?.()
  }

  /** Minimises the panel: docked to the bottom edge, or collapsed to its title bar with `minimize="collapse"`. */
  minimize() {
    this.changeState('minimized')
  }

  /** Makes the panel fill its boundary, less `--c2-floating-panel__maximized--inset`. */
  maximize() {
    this.changeState('maximized')
  }

  /** Returns a minimised or maximised panel to its place: a panel minimised while maximised goes back to maximised. */
  restore() {
    this.changeState(this.state === 'minimized' ? this.restoreState : 'normal')
  }

  /** Puts the panel in front of every other panel in the same boundary. */
  bringToFront() {
    const key = this.groupKey
    const stack = key && FloatingPanel.stacks.get(key)
    if (!stack || stack[stack.length - 1] === this) return
    stack.splice(stack.indexOf(this), 1)
    stack.push(this)
    FloatingPanel.sync(key)
  }

  /** Moves the panel's top-left corner to `x`, `y` in boundary pixels, kept inside the boundary. */
  moveTo(x: number, y: number) {
    const base = this.open ? this.baseRect() : validRect(this.rect)
    if (!base) return
    this.commitRect(this.fit({ ...base, x, y }), 'method')
  }

  /** Resizes the panel to `width` by `height`, within its minimum, its maximum and the boundary. */
  resizeTo(width: number, height: number) {
    const base = this.open ? this.baseRect() : validRect(this.rect)
    if (!base) return
    this.commitRect(this.fit({ ...base, width, height }), 'method')
  }

  /** Puts the panel back at its CSS place and size (`rect` becomes `null`). */
  resetRect() {
    this.reset('method')
  }

  // ── Geometry ─────────────────────────────────────────────────────────────────

  /** The element whose padding box the panel lives in for `boundary="parent"`: the nearest positioned ancestor. */
  private boundaryElement(): Element {
    for (let node = flatParent(this); node; node = flatParent(node)) {
      if (node === document.documentElement) break
      const style = getComputedStyle(node)
      if (style.position !== 'static' || style.transform !== 'none' || /layout|paint|strict|content/.test(style.contain)) return node
    }
    return document.documentElement
  }

  private boundarySize() {
    const element = this.boundary === 'parent' ? this.boundaryElement() : document.documentElement
    return { width: element.clientWidth, height: element.clientHeight }
  }

  private bounds(): Bounds {
    const { width, height } = this.boundarySize()
    const style = this.panel ? getComputedStyle(this.panel) : undefined
    const minWidth = Math.min(pixels(style?.minWidth ?? '', width, 0), width)
    const minHeight = Math.min(pixels(style?.minHeight ?? '', height, 0), height)
    return {
      width,
      height,
      minWidth,
      minHeight,
      maxWidth: Math.max(minWidth, Math.min(width, pixels(style?.maxWidth ?? '', width, Infinity))),
      maxHeight: Math.max(minHeight, Math.min(height, pixels(style?.maxHeight ?? '', height, Infinity))),
    }
  }

  /** The panel's place on screen in boundary pixels. */
  private measure(): FloatingPanelRect {
    const panel = this.panel
    if (!panel) return { x: 0, y: 0, width: 0, height: 0 }
    const box = panel.getBoundingClientRect()
    // `position: fixed` places from the viewport; `absolute` from the containing block's padding box, which is what
    // `offsetLeft` and `offsetTop` measure from (scrolling included).
    const x = this.boundary === 'parent' ? panel.offsetLeft : box.left
    const y = this.boundary === 'parent' ? panel.offsetTop : box.top
    return roundRect({ x, y, width: box.width, height: box.height })
  }

  private get collapsed() {
    return this.state === 'minimized' && this.minimizeMode === 'collapse'
  }

  private get docked() {
    return this.state === 'minimized' && this.minimizeMode !== 'collapse'
  }

  private get canDrag() {
    return !this.noDrag && !this.docked && this.state !== 'maximized'
  }

  private get canResize() {
    return !this.noResize && this.state === 'normal'
  }

  /** The rect the user's next move starts from: the stored one, the collapsed anchor, or what is on screen. */
  private baseRect(): FloatingPanelRect {
    return validRect(this.rect) ?? (this.collapsed ? this.collapseAnchor : undefined) ?? this.measure()
  }

  private fit(rect: FloatingPanelRect) {
    if (!this.open || !this.panel) return roundRect(rect)
    return fitRect(rect, this.bounds(), this.collapsed ? this.panel.getBoundingClientRect().height : undefined)
  }

  private commitRect(next: FloatingPanelRect, reason: FloatingPanelRectChangeReason) {
    if (sameRect(validRect(this.rect), next)) return
    this.rect = next
    this.emitRect(reason)
  }

  private reset(reason: FloatingPanelRectChangeReason) {
    if (this.rect === null && !this.collapseAnchor) return
    const had = this.rect !== null
    this.rect = null
    this.collapseAnchor = undefined
    if (had) this.emitRect(reason)
  }

  private emitRect(reason: FloatingPanelRectChangeReason) {
    const rect = validRect(this.rect) ?? null
    this.persist()
    this.dispatchEvent(new CustomEvent<FloatingPanelRectChangeDetail>('rect-change', { detail: { rect: rect && { ...rect }, reason } }))
  }

  /**
   * Keeps the panel inside its boundary after the boundary, the window, the panel or `rect` changed. A placed panel is
   * fitted and reports it (`reason: "boundary"`). A panel at its CSS place keeps `rect` null: CSS caps its size at the
   * boundary, and when its CSS place still sticks out it is drawn at the nearest place inside (`cssFit`).
   */
  private keepInside = () => {
    if (this.open && this.docked && this.groupKey) FloatingPanel.layoutDock(this.groupKey)
    if (!this.open || this.state === 'maximized' || this.docked || this.gesture || !this.panel) return
    const rect = validRect(this.rect)
    if (rect) {
      this.commitRect(this.fit(rect), 'boundary')
      return
    }
    if (this.state !== 'normal') return
    const place = this.cssPlace()
    const bounds = this.bounds()
    const x = Math.round(clampNumber(place.x, 0, bounds.width - place.width))
    const y = Math.round(clampNumber(place.y, 0, bounds.height - place.height))
    const fit = x === place.x && y === place.y ? undefined : { x, y }
    if (fit?.x !== this.cssFit?.x || fit?.y !== this.cssFit?.y) this.cssFit = fit
  }

  /** Where CSS alone puts the panel: measured with the inline place of `cssFit` taken off for the moment. */
  private cssPlace(): FloatingPanelRect {
    const style = this.panel!.style
    const saved = style.cssText
    for (const name of ['left', 'top', 'right', 'bottom']) style.removeProperty(name)
    const place = this.measure()
    style.cssText = saved
    return place
  }

  // ── State ────────────────────────────────────────────────────────────────────

  private changeState(next: FloatingPanelState) {
    const previous = this.state
    if (next === previous || !STATES.includes(next)) return
    const bodyHadFocus = next === 'minimized' && this.bodyHasFocus()
    if (next === 'minimized') {
      this.restoreState = previous === 'maximized' ? 'maximized' : 'normal'
      // A collapse at the CSS place folds where the panel is, not where `inset` anchors it.
      if (this.minimizeMode === 'collapse' && previous === 'normal' && !validRect(this.rect) && this.panel) this.collapseAnchor = this.measure()
    } else {
      this.collapseAnchor = undefined
    }
    const before = this.panel?.getBoundingClientRect()
    this.state = next
    this.persist()
    this.dispatchEvent(new CustomEvent<FloatingPanelStateChangeDetail>('state-change', { detail: { state: next, previous } }))
    const name = this.panelName
    this.announce(next === 'minimized' ? this.msg.t('minimized', name) : next === 'maximized' ? this.msg.t('maximized', name) : this.msg.t('restored', name))
    void this.updateComplete.then(() => {
      if (before) this.animateFrom(before)
      if (bodyHadFocus) this.minimizeButton?.focus()
    })
  }

  /** Animates the panel from where it was to where it is now: a scale and a slide, skipped under reduced motion. */
  private animateFrom(before: DOMRect) {
    const panel = this.panel
    if (!panel || !panel.animate) return
    const duration = parseFloat(getComputedStyle(panel).transitionDuration) * 1000
    const after = panel.getBoundingClientRect()
    if (!duration || !after.width || !after.height || !before.width || !before.height) return
    const dx = before.left - after.left
    const dy = before.top - after.top
    const sx = before.width / after.width
    const sy = before.height / after.height
    panel.animate(
      [
        { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: '0 0', transform: 'none' },
      ],
      {
        duration,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      },
    )
  }

  private get panelName() {
    return this.label || this.titleText || this.msg.t('untitled')
  }

  private readTitle = () => {
    const text = [...this.children]
      .filter((child) => child.getAttribute('slot') === 'title')
      .map((child) => (child.textContent ?? '').trim())
      .filter(Boolean)
      .join(' ')
    if (text !== this.titleText) this.titleText = text
  }

  private announce(text: string, delay = 0) {
    clearTimeout(this.announceTimer)
    const say = () => {
      // Clear first, so the same words twice in a row are read twice.
      this.announcement = ''
      void this.updateComplete.then(() => (this.announcement = text))
    }
    if (delay) this.announceTimer = setTimeout(say, delay)
    else say()
  }

  private format(value: number) {
    return new Intl.NumberFormat(this.msg.locale).format(Math.round(value))
  }

  private announceRect(kind: 'moved' | 'resized') {
    const rect = validRect(this.rect)
    if (!rect) return
    if (kind === 'moved') this.announce(this.msg.t('moved', this.format(rect.x), this.format(rect.y)), ANNOUNCE_DELAY)
    else this.announce(this.msg.t('resized', this.format(rect.width), this.format(rect.height)), ANNOUNCE_DELAY)
  }

  private persist() {
    if (!this.storageKey || isServer) return
    try {
      localStorage.setItem(
        this.storageKey,
        JSON.stringify({
          rect: validRect(this.rect) ?? null,
          state: this.state,
          // What Restore returns a minimised panel to, so a panel minimised from maximised still goes back there.
          ...(this.state === 'minimized' ? { restore: this.restoreState } : {}),
        }),
      )
    } catch {
      // Storage blocked (private mode, quota): the place lasts for this page only.
    }
  }

  private restoreSaved() {
    if (!this.storageKey || isServer) return
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) ?? 'null') as { rect?: unknown; state?: unknown; restore?: unknown } | null
      if (!saved || typeof saved !== 'object') return
      const rect = validRect(saved.rect)
      if (rect) this.rect = rect
      else if (saved.rect === null) this.rect = null
      if (STATES.includes(saved.state as FloatingPanelState)) this.state = saved.state as FloatingPanelState
      if (saved.restore === 'maximized' || saved.restore === 'normal') this.restoreState = saved.restore
    } catch {
      // Storage blocked or a value written by something else: keep the author's place.
    }
  }

  // ── Stacking and the boundary ────────────────────────────────────────────────

  private syncStates() {
    const states = this.internals?.states
    if (!states) return
    const set = (name: string, on: boolean) => (on ? states.add(name) : states.delete(name))
    set('active', this.open && this.groupKey !== undefined && this.front)
    set('minimized', this.state === 'minimized')
    set('maximized', this.state === 'maximized')
    set('dragging', this.interacting)
  }

  private leaveGroups() {
    const key = this.groupKey
    if (!key) return
    FloatingPanel.remove(FloatingPanel.stacks, key, this)
    FloatingPanel.remove(FloatingPanel.docks, key, this)
    this.groupKey = undefined
    this.front = true
    FloatingPanel.sync(key)
  }

  /** Joins or leaves its boundary's stack and dock, and watches the boundary's size while open. */
  private syncGroups() {
    const key = this.open && this.isConnected ? (this.boundary === 'parent' ? this.boundaryElement() : document) : undefined
    if (key !== this.groupKey) {
      this.leaveGroups()
      this.stopObserving?.()
      this.stopObserving = undefined
      if (key) {
        this.groupKey = key
        const stack = FloatingPanel.stacks.get(key) ?? []
        stack.push(this)
        FloatingPanel.stacks.set(key, stack)
        this.observe(key)
      }
    }
    if (key) {
      const dock = FloatingPanel.docks.get(key) ?? []
      const docked = dock.includes(this)
      if (this.docked && !docked) dock.push(this)
      if (!this.docked && docked) dock.splice(dock.indexOf(this), 1)
      if (dock.length) FloatingPanel.docks.set(key, dock)
      else FloatingPanel.docks.delete(key)
    }
    FloatingPanel.sync(key)
  }

  private observe(key: object) {
    const stops: (() => void)[] = []
    if (key === document) {
      window.addEventListener('resize', this.keepInside)
      stops.push(() => window.removeEventListener('resize', this.keepInside))
    }
    if (typeof ResizeObserver !== 'undefined') {
      // Observing reports the sizes once straight away, which also fits a panel too large for its boundary on its
      // first measurement. The panel itself is watched too: content that grows a panel at its CSS place can push it out.
      const observer = new ResizeObserver(() => this.keepInside())
      if (key !== document) observer.observe(key as Element)
      if (this.panel) observer.observe(this.panel)
      stops.push(() => observer.disconnect())
    } else {
      this.keepInside()
    }
    this.stopObserving = () => stops.forEach((stop) => stop())
  }

  // ── Focus ────────────────────────────────────────────────────────────────────

  private containsFocus() {
    return this.matches(':focus-within')
  }

  /** Whether focus is in the body or the footer, which a minimised panel hides. */
  private bodyHasFocus() {
    const active = document.activeElement
    if (!active || !this.contains(active)) return false
    let child: Element | null = active
    while (child && child.parentElement !== this) child = child.parentElement
    const slot = child?.getAttribute('slot') ?? ''
    return slot === '' || slot === 'footer'
  }

  private focusInitial() {
    const slot = this.renderRoot.querySelector<HTMLSlotElement>('.body slot')
    for (const element of slot?.assignedElements({ flatten: true }) ?? []) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT)
      for (let node: Node | null = element; node; node = walker.nextNode()) {
        const candidate = node as HTMLElement
        if (candidate.matches(FOCUSABLE) || candidate.shadowRoot?.delegatesFocus) {
          candidate.focus()
          if (this.containsFocus()) return
        }
      }
    }
    ;(this.handle?.tabIndex === 0 ? this.handle : this.renderRoot.querySelector<HTMLElement>('.button'))?.focus()
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  protected override willUpdate(changed: PropertyValues<this>) {
    // A client-created panel reads its title before the first render; a server-rendered one after it, so the first
    // client render matches the server's.
    if (!this.hasUpdated && !this.hydrating && !isServer) this.readTitle()
    if (changed.has('state') && this.state !== 'minimized') this.collapseAnchor = undefined
  }

  protected override firstUpdated() {
    if (this.hydrating) this.readTitle()
    // The saved place applies in the second render, so the first one matches what a server rendered.
    this.restoreSaved()
  }

  protected override updated(changed: PropertyValues<this>) {
    if (isServer) return
    if (this.needsGroupSync || changed.has('open') || changed.has('boundary') || changed.has('state') || changed.has('minimizeMode')) {
      this.needsGroupSync = false
      this.syncGroups()
    }
    if (changed.has('rect') || changed.has('state')) this.keepInside()
    // The first render's `open` is the author's, not a change.
    if (changed.has('open') && changed.get('open') !== undefined) {
      if (this.open) this.dispatchEvent(new Event('open'))
      else this.dispatchEvent(new Event('close'))
    }
    this.syncStates()
  }

  // ── Pointer and keyboard ─────────────────────────────────────────────────────

  private handlePanelPointerDown = {
    handleEvent: () => this.bringToFront(),
    capture: true,
  }

  private handleFocusIn() {
    this.bringToFront()
  }

  private handlePanelKeyDown(event: KeyboardEvent) {
    // Escape belongs to the content (a menu, a field): only a maximised panel uses it, and only if nothing else did.
    if (event.key !== 'Escape' || event.defaultPrevented || this.state !== 'maximized') return
    event.preventDefault()
    this.restore()
  }

  private handlePointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.currentTarget as HTMLElement
    const edge = (target.dataset.edge ?? 'move') as Edge | 'move'
    if (edge === 'move' ? !this.canDrag : !this.canResize) return
    // A resize press must not select text or scroll on touch; a press on the title bar still focuses its handle.
    if (edge !== 'move') event.preventDefault()
    const start = this.baseRect()
    this.gesture = {
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      start,
      bounds: this.bounds(),
      visible: this.panel?.getBoundingClientRect().height ?? start.height,
      moved: false,
    }
    target.setPointerCapture?.(event.pointerId)
  }

  private handlePointerMove(event: PointerEvent) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    if (!gesture.moved) {
      if (gesture.edge === 'move' && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      gesture.moved = true
      this.interacting = true
    }
    const { start, bounds } = gesture
    this.rect =
      gesture.edge === 'move'
        ? fitRect({ ...start, x: start.x + dx, y: start.y + dy }, bounds, this.collapsed ? gesture.visible : undefined)
        : resizeRect(start, gesture.edge, dx, dy, bounds)
  }

  private handlePointerUp(event: PointerEvent) {
    const gesture = this.gesture
    if (!gesture || event.pointerId !== gesture.pointerId) return
    this.gesture = undefined
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    if (!gesture.moved) return
    this.interacting = false
    if (sameRect(validRect(this.rect), gesture.start)) return
    const move = gesture.edge === 'move'
    this.emitRect(move ? 'drag' : 'resize')
    this.announceRect(move ? 'moved' : 'resized')
  }

  private handleDoubleClick() {
    if (this.state === 'minimized') this.restore()
    else if (!this.noMaximize) {
      if (this.state === 'maximized') this.restore()
      else this.maximize()
    }
  }

  private arrowDelta(event: KeyboardEvent): [number, number] | undefined {
    const step = event.shiftKey ? BIG_STEP : STEP
    switch (event.key) {
      case 'ArrowLeft':
        return [-step, 0]
      case 'ArrowRight':
        return [step, 0]
      case 'ArrowUp':
        return [0, -step]
      case 'ArrowDown':
        return [0, step]
    }
    return undefined
  }

  private handleHandleKeyDown(event: KeyboardEvent) {
    if (!this.canDrag || event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Home') {
      event.preventDefault()
      this.reset('keyboard')
      return
    }
    const delta = this.arrowDelta(event)
    if (!delta) return
    event.preventDefault()
    const start = this.baseRect()
    this.commitRect(this.fit({ ...start, x: start.x + delta[0], y: start.y + delta[1] }), 'keyboard')
    this.announceRect('moved')
  }

  private handleGripKeyDown(event: KeyboardEvent) {
    if (!this.canResize || event.altKey || event.ctrlKey || event.metaKey) return
    const delta = this.arrowDelta(event)
    if (!delta) return
    event.preventDefault()
    this.commitRect(resizeRect(this.baseRect(), 'se', delta[0], delta[1], this.bounds()), 'keyboard')
    this.announceRect('resized')
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  private placeStyle(): Record<string, string | undefined> {
    const style: Record<string, string | undefined> = { '--_stack': String(this.stackIndex) }
    if (this.docked) {
      style['--_dock'] = String(this.dockIndex)
      const place = this.dockPlace
      if (place) Object.assign(style, { '--_dock-x': `${place.x}px`, '--_dock-y': `${place.y}px`, width: `${place.width}px` })
    }
    if (this.state === 'maximized' || this.docked) return style
    const rect = validRect(this.rect) ?? (this.collapsed ? this.collapseAnchor : undefined)
    if (!rect) {
      const fit = this.state === 'normal' ? this.cssFit : undefined
      return fit ? { ...style, left: `${fit.x}px`, top: `${fit.y}px`, right: 'auto', bottom: 'auto' } : style
    }
    return {
      ...style,
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${rect.width}px`,
      height: this.collapsed ? undefined : `${rect.height}px`,
    }
  }

  override render() {
    const minimized = this.state === 'minimized'
    const maximized = this.state === 'maximized'
    const docked = this.docked
    const name = this.panelName
    const titled = !this.label && this.slots.has('title')
    const canDrag = this.canDrag
    const pointer = {
      pointerdown: this.handlePointerDown,
      pointermove: this.handlePointerMove,
      pointerup: this.handlePointerUp,
    }
    const showMinimize = !this.noMinimize || minimized
    // A panel maximised by script or storage keeps its Restore button even with `no-maximize`.
    const showMaximize = (!this.noMaximize && !minimized) || maximized
    return html`
      <section
        part="panel"
        class=${classMap({
          panel: true,
          parent: this.boundary === 'parent',
          maximized,
          docked,
          collapsed: this.collapsed,
          inactive: !this.front,
          moving: this.interacting,
        })}
        role="dialog"
        aria-modal="false"
        aria-labelledby=${titled ? 'title' : nothing}
        aria-label=${titled ? nothing : name}
        style=${styleMap(this.placeStyle())}
        ?hidden=${!this.open}
        @pointerdown=${this.handlePanelPointerDown}
        @focusin=${this.handleFocusIn}
        @keydown=${this.handlePanelKeyDown}
      >
        <div class="frame">
          <header part="header" class="header">
            <div
              part="handle"
              class=${classMap({ handle: true, draggable: canDrag })}
              role=${canDrag ? 'button' : nothing}
              tabindex=${canDrag ? '0' : nothing}
              aria-label=${canDrag ? this.msg.t('move', name) : nothing}
              aria-describedby=${canDrag ? 'move-hint' : nothing}
              @pointerdown=${pointer.pointerdown}
              @pointermove=${pointer.pointermove}
              @pointerup=${pointer.pointerup}
              @pointercancel=${pointer.pointerup}
              @lostpointercapture=${pointer.pointerup}
              @keydown=${this.handleHandleKeyDown}
              @dblclick=${this.handleDoubleClick}
            >
              <span part="icon" class="icon" ?hidden=${!this.slots.has('icon')}><slot name="icon" @slotchange=${this.slots.handleSlotChange}></slot></span>
              <span part="title" class="title" id="title"><slot name="title" @slotchange=${this.slots.handleSlotChange}>${this.label}</slot></span>
            </div>
            <div part="actions" class="actions" ?hidden=${docked || !this.slots.has('actions')}>
              <slot name="actions" @slotchange=${this.slots.handleSlotChange}></slot>
            </div>
            <div class="buttons">
              ${
                showMinimize
                  ? html`<button
                      part="button minimize-button"
                      class="button"
                      type="button"
                      aria-label=${minimized ? this.msg.t('restore') : this.msg.t('minimize')}
                      @click=${() => (minimized ? this.restore() : this.minimize())}
                    >
                      ${minimized ? restoreIcon : minimizeIcon}
                    </button>`
                  : nothing
              }
              ${
                showMaximize
                  ? html`<button
                      part="button maximize-button"
                      class="button"
                      type="button"
                      aria-label=${maximized ? this.msg.t('restore') : this.msg.t('maximize')}
                      @click=${() => (maximized ? this.restore() : this.maximize())}
                    >
                      ${maximized ? restoreIcon : maximizeIcon}
                    </button>`
                  : nothing
              }
              ${
                this.noClose
                  ? nothing
                  : html`<button part="button close-button" class="button close" type="button" aria-label=${this.msg.t('close')} @click=${() => this.close()}>
                      ${closeIcon}
                    </button>`
              }
            </div>
          </header>
          <div part="body" class="body" ?hidden=${minimized} ?inert=${minimized}><slot></slot></div>
          <footer part="footer" class="footer" ?hidden=${minimized || !this.slots.has('footer')} ?inert=${minimized}>
            <slot name="footer" @slotchange=${this.slots.handleSlotChange}></slot>
          </footer>
        </div>
        ${
          this.canResize
            ? html`${EDGES.map(
                  (edge) =>
                    html`<div
                      class="edge edge-${edge}"
                      data-edge=${edge}
                      @pointerdown=${pointer.pointerdown}
                      @pointermove=${pointer.pointermove}
                      @pointerup=${pointer.pointerup}
                      @pointercancel=${pointer.pointerup}
                      @lostpointercapture=${pointer.pointerup}
                    ></div>`,
                )}
                <div
                  part="grip"
                  class="grip"
                  data-edge="se"
                  role="button"
                  tabindex="0"
                  aria-label=${this.msg.t('resize', name)}
                  aria-describedby="resize-hint"
                  @pointerdown=${pointer.pointerdown}
                  @pointermove=${pointer.pointermove}
                  @pointerup=${pointer.pointerup}
                  @pointercancel=${pointer.pointerup}
                  @lostpointercapture=${pointer.pointerup}
                  @keydown=${this.handleGripKeyDown}
                >
                  ${gripIcon}
                </div>`
            : nothing
        }
        <span id="move-hint" hidden>${this.msg.t('moveHint')}</span>
        <span id="resize-hint" hidden>${this.msg.t('resizeHint')}</span>
        <div class="live" role="status" aria-live="polite" aria-atomic="true">${this.announcement}</div>
      </section>
    `
  }
}

const minimizeIcon = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 12.5h9" /></svg>`
const maximizeIcon = html`<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="3.5" width="9" height="9" rx="1" /></svg>`
const restoreIcon = html`<svg viewBox="0 0 16 16" aria-hidden="true">
  <rect x="3" y="5.5" width="7.5" height="7.5" rx="1" />
  <path d="M5.5 5.5V4a1 1 0 0 1 1-1H12a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-1.5" />
</svg>`
const closeIcon = html`<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>`
const gripIcon = html`<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M11 5 5 11M11 8.5 8.5 11" /></svg>`

declare global {
  interface HTMLElementTagNameMap {
    'c2-floating-panel': FloatingPanel
  }
}
