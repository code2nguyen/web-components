import { LitElement, html, nothing, svg, unsafeCSS, type PropertyValues } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { classMap } from 'lit/directives/class-map.js'
import { styleMap } from 'lit/directives/style-map.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { isApplePlatform } from '@c2n/core/shortcut-helper.js'
import { easeOutCubic, prefersReducedMotion } from '@c2n/core/pan-zoom.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/pan-zoom'
import type { PanZoom } from '@c2n/pan-zoom'
import { mindMapMessages } from './messages'
import { boundsOf, layoutMindMap, resolveSides, type LayoutTopic, type TopicBox, type TopicSize } from './layout'
import { childrenOf, countDescendants, insertNodes, moveNode, newId, normalize, parseOutline, pathTo, removeNode, toOutline, updateNode } from './tree'
import type {
  MindMapAction,
  MindMapBeforeChangeEventDetail,
  MindMapChangeEventDetail,
  MindMapLayout,
  MindMapNode,
  MindMapNodeEventDetail,
  MindMapSide,
} from './mind-map-types'
import styles from './mind-map.scss?inline'

export type * from './mind-map-types'
export { toOutline, fromOutline, parseOutline } from './tree'
export { layoutMindMap, resolveSides, boundsOf } from './layout'
export type { LayoutTopic, TopicBox, TopicSize, LayoutOptions } from './layout'

/** Events fired by {@link MindMap}, keyed for `addEventListener`. */
export interface MindMapEventMap {
  'before-change': CustomEvent<MindMapBeforeChangeEventDetail>
  change: CustomEvent<MindMapChangeEventDetail>
  'selection-change': CustomEvent<MindMapNodeEventDetail>
  'node-click': CustomEvent<MindMapNodeEventDetail>
}

export interface MindMap {
  addEventListener: TypedAddEventListener<MindMap, MindMapEventMap>
  removeEventListener: TypedRemoveEventListener<MindMap, MindMapEventMap>
}

/** Where a topic sits in the map, worked out once per change of the document. */
interface Entry {
  node: MindMapNode
  parent: MindMapNode | null
  /** 0 for the central topic. */
  level: number
  /** Position among its parent's children, in data order. */
  index: number
  /** 1-based position among its siblings in drawing order (right side, then left side, for first-level topics). */
  posInSet: number
  setSize: number
  side: MindMapSide | 'center'
  /** 0-based index of its first-level ancestor among the central topic's children; -1 for the central topic. */
  branch: number
  /** The branch colour set on its first-level ancestor, if any. */
  color: string | null
  /** Drawn: no folded ancestor. */
  visible: boolean
  /** Topics below it, at any depth. */
  descendants: number
}

interface Snapshot {
  doc: MindMapNode
  selected: string
}

interface Editing {
  id: string
  draft: string
  /** Where the caret goes when the editor opens: `all` selects the text, `end` puts the caret after it. */
  caret: 'all' | 'end'
}

type DropMode = 'into' | 'before' | 'after'

interface Drag {
  id: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
  /** The pointer, relative to the centre of the central topic. */
  point: { x: number; y: number }
  target: { id: string; mode: DropMode } | null
}

const HISTORY_LIMIT = 100
/** Room round the drawn topics for the fold dots, the add button and the drag ghost. */
const BOARD_PADDING = 48
/** Pointer travel before a press on a topic becomes a drag. */
const DRAG_THRESHOLD = 4
const BRANCH_COLOURS = 8
/**
 * A colour from data is written into a style property and used as an SVG paint: only colour syntax is accepted (hex, a
 * name, or a colour function such as `rgb()`, `oklch()`, `color-mix()` or `var()`), never `url()`, which would make
 * the map fetch a third-party paint server. The browser then checks it with `CSS.supports`.
 */
const COLOUR_SYNTAX = /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|var)\([-a-z0-9#%.,\s/()]*\))$/i

function safeColour(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const colour = value.trim()
  if (!colour || colour.length > 200 || /url\s*\(|image|[;{}<>\\'"]/i.test(colour) || !COLOUR_SYNTAX.test(colour)) return null
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('color', colour)) return null
  return colour
}

const plusIcon = svg`<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8h8M8 4v8" /></svg>`

/**
 * An idea tree laid out around a central topic, with keyboard editing as in XMind and Miro. The map draws itself
 * from a JSON tree (`data`, one root node `{ id, label, children?, collapsed?, side?, color?, icon? }`); with
 * `editable` the user adds, edits, moves, folds and deletes topics, and every edit fires a cancelable
 * `before-change` and then `change` with the new `data`, which is where an app saves it. The map keeps its own copy,
 * so typing and undo never wait for the app.
 *
 * The central topic is a filled card, first-level topics are boxes tinted with their branch colour, and deeper
 * topics are text on a line, joined by curves that thin at each level. `layout="both"` (the default) balances the
 * branches on either side of the centre, and `left` or `right` draws a one-sided logic chart. Topics are measured in
 * the page, so long labels wrap at `--c2-mind-map__topic--max-width` and the layout follows; after an edit they glide
 * to their new place (not under reduced motion).
 *
 * The canvas is a `c2-pan-zoom`: a drag on empty canvas or the wheel pans, Ctrl/⌘ + wheel zooms, `controls` adds the
 * zoom toolbar and `minimap` an overview. The focused topic is always brought into view.
 *
 * ### Keyboard
 *
 * The map is one tab stop and an ARIA tree. The arrows follow the drawing: on the right side → goes to the first
 * subtopic (unfolding a folded topic) and ← to the parent, mirrored on the left; ↑ and ↓ go to the previous and next
 * sibling, then to the nearest topic on the same level. Home goes to the central topic, Space folds, Ctrl/⌘ + `+`,
 * `-` and `0` zoom and fit. While `editable`: Tab or Insert adds a subtopic, Enter a sibling after (Shift+Enter
 * before), F2 or typing edits the label, Delete or Backspace removes the topic, Alt + the arrows move it (↑ ↓
 * reorder, toward the centre promotes, away from it nests it in the previous sibling), Ctrl/⌘+Z undoes and
 * Ctrl/⌘+Shift+Z redoes, and copy and paste use an indented list. **Because Tab adds a subtopic, it does not leave
 * an editable map: Escape moves focus to the canvas, and from there Tab leaves.** Insert is the alternative to Tab.
 * In the editor, Enter commits, Shift+Enter adds a line break, Tab commits and adds a subtopic and Escape cancels.
 *
 * A drag on a topic of an editable map moves it: onto another topic makes it that topic's last subtopic, onto the
 * upper or lower edge of one puts it before or after it. Escape cancels the drag; `no-drag` turns it off.
 *
 * The server cannot measure text, so it renders the topics as an indented outline; the browser lays the map out on
 * its second render.
 *
 * @tag c2-mind-map
 *
 * @internalcomponent c2-pan-zoom
 *
 * @csspart canvas - The `c2-pan-zoom` the map is drawn in.
 * @csspart board - The drawing inside the canvas.
 * @csspart topic - Every topic.
 * @csspart root - The central topic, in addition to `topic`.
 * @csspart main-topic - Each first-level topic, in addition to `topic`.
 * @csspart subtopic - Each deeper topic, in addition to `topic`.
 * @csspart selected - The selected topic, in addition to `topic`.
 * @csspart icon - The icon before a label.
 * @csspart label - The text of a topic.
 * @csspart editor - The inline editor.
 * @csspart toggle - The fold dot, which shows the hidden count while folded.
 * @csspart add - The round "+" on the selected topic.
 * @csspart connector - Each connecting curve.
 * @csspart ghost - The label that follows the pointer while a topic is dragged.
 *
 * @event {CustomEvent<MindMapBeforeChangeEventDetail>} before-change - Fired before an edit, with `{ action }`. Cancelable: `preventDefault()` vetoes the edit.
 * @event {CustomEvent<MindMapChangeEventDetail>} change - Fired after an edit, with `{ data, action }`: `data` is the new map, to save. `action` is `{ type, node, parent, index }`; `type` is `add`, `edit`, `delete`, `move`, `collapse`, `expand`, `color`, `paste`, `undo` or `redo`.
 * @event {CustomEvent<MindMapNodeEventDetail>} selection-change - Fired when the user selects another topic, with `{ node }`. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {CustomEvent<MindMapNodeEventDetail>} node-click - Fired when a topic is clicked, or activated with Enter in a read-only map, with `{ node }`. Fired in read-only maps too, to open a topic's details.
 *
 * @cssproperty {length} [--c2-mind-map--width=100%] - Width of the canvas; it is kept even as a flex item, which would otherwise shrink it to nothing.
 * @cssproperty {pixel} [--c2-mind-map--height=480px] - Height of the canvas.
 * @cssproperty {background} [--c2-mind-map--background=#fafafa] - The canvas.
 * @cssproperty {border} [--c2-mind-map--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-mind-map--border-radius=8px]
 * @cssproperty {display} [--c2-mind-map__grid--display=block] - `none` hides the dot grid.
 * @cssproperty {color} [--c2-mind-map__grid--color=#e4e4e7]
 * @cssproperty {pixel} [--c2-mind-map__grid--gap=20px]
 * @cssproperty {font-family} [--c2-mind-map--font-family=inherit]
 * @cssproperty {duration} [--c2-mind-map--transition-duration=200ms] - How long topics take to glide to their new place after an edit. Topics jump under reduced motion.
 * @cssproperty {color} [--c2-mind-map__branch-1--color=#0265dc] - The branch colours, taken in turn by the first-level topics.
 * @cssproperty {color} [--c2-mind-map__branch-2--color=#ea580c]
 * @cssproperty {color} [--c2-mind-map__branch-3--color=#0f766e]
 * @cssproperty {color} [--c2-mind-map__branch-4--color=#db2777]
 * @cssproperty {color} [--c2-mind-map__branch-5--color=#a16207]
 * @cssproperty {color} [--c2-mind-map__branch-6--color=#7c3aed]
 * @cssproperty {color} [--c2-mind-map__branch-7--color=#0891b2]
 * @cssproperty {color} [--c2-mind-map__branch-8--color=#52525b]
 * @cssproperty {background} [--c2-mind-map__root--background=#18181b] - The central topic's fill.
 * @cssproperty {color} [--c2-mind-map__root--color=#fafafa]
 * @cssproperty {pixel} [--c2-mind-map__root--font-size=16px]
 * @cssproperty {font-weight} [--c2-mind-map__root--font-weight=600]
 * @cssproperty {padding} [--c2-mind-map__root--padding=10px 18px]
 * @cssproperty {border-radius} [--c2-mind-map__root--border-radius=8px]
 * @cssproperty {percentage} [--c2-mind-map__topic--tint=14%] - Share of the branch colour in a first-level topic's background.
 * @cssproperty {background} [--c2-mind-map__topic--background=#ffffff] - The surface the branch colour is mixed into.
 * @cssproperty {color} [--c2-mind-map__topic--color=#18181b] - Text of a first-level topic.
 * @cssproperty {pixel} [--c2-mind-map__topic--font-size=14px]
 * @cssproperty {font-weight} [--c2-mind-map__topic--font-weight=500]
 * @cssproperty {line-height} [--c2-mind-map__topic--line-height=20px] - Line height of every topic but the central one.
 * @cssproperty {padding} [--c2-mind-map__topic--padding=6px 12px]
 * @cssproperty {pixel} [--c2-mind-map__topic--border-width=1px] - Width of a first-level topic's border, drawn in its branch colour.
 * @cssproperty {border-radius} [--c2-mind-map__topic--border-radius=6px]
 * @cssproperty {pixel} [--c2-mind-map__topic--max-width=220px] - Longer labels wrap.
 * @cssproperty {color} [--c2-mind-map__subtopic--color=#18181b] - Text of the deeper topics, drawn on a line.
 * @cssproperty {pixel} [--c2-mind-map__subtopic--font-size=14px]
 * @cssproperty {font-weight} [--c2-mind-map__subtopic--font-weight=400]
 * @cssproperty {padding} [--c2-mind-map__subtopic--padding=4px 2px]
 * @cssproperty {pixel} [--c2-mind-map__connector--width=2.5px] - Width of the first-level connectors.
 * @cssproperty {pixel} [--c2-mind-map__connector--taper=0.5px] - How much thinner each deeper level is.
 * @cssproperty {pixel} [--c2-mind-map__connector--min-width=1px]
 * @cssproperty {pixel} [--c2-mind-map__level--gap=56px] - Horizontal room between a topic and its subtopics.
 * @cssproperty {pixel} [--c2-mind-map__sibling--gap=12px] - Vertical room between neighbouring subtrees.
 * @cssproperty {outline} [--c2-mind-map__topic__selected--outline=2px solid #0265dc]
 * @cssproperty {outline} [--c2-mind-map__topic__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Keyboard focus ring, drawn round the selection outline.
 * @cssproperty {opacity} [--c2-mind-map__topic__dragging--opacity=0.4] - The topic being dragged, at its old place.
 * @cssproperty {background} [--c2-mind-map__drop-target--background=#edf1fe] - The topic a dragged topic would land in.
 * @cssproperty {color} [--c2-mind-map__drop-line--color=#0265dc] - The dashed line and outline that show where a dragged topic lands.
 * @cssproperty {background} [--c2-mind-map__ghost--background=#ffffff] - The label following the pointer during a drag.
 * @cssproperty {color} [--c2-mind-map__ghost--color=#18181b]
 * @cssproperty {box-shadow} [--c2-mind-map__ghost--box-shadow=0 8px 24px rgba(24, 24, 27, 0.08)]
 * @cssproperty {pixel} [--c2-mind-map__toggle--size=18px] - The fold dot.
 * @cssproperty {background} [--c2-mind-map__toggle--background=#ffffff]
 * @cssproperty {color} [--c2-mind-map__toggle--color=#18181b]
 * @cssproperty {pixel} [--c2-mind-map__toggle--font-size=12px]
 * @cssproperty {pixel} [--c2-mind-map__add--size=20px] - The round "+" on the selected topic.
 * @cssproperty {background} [--c2-mind-map__add--background=#0265dc]
 * @cssproperty {color} [--c2-mind-map__add--color=#ffffff]
 * @cssproperty {background} [--c2-mind-map__editor--background=#ffffff]
 * @cssproperty {color} [--c2-mind-map__editor--color=#18181b]
 * @cssproperty {color} [--c2-mind-map__editor--caret-color=#0265dc]
 * @cssproperty {outline} [--c2-mind-map__board__focus--outline=2px solid rgba(2, 101, 220, 0.4)] - Focus ring of the canvas, which holds focus after Escape.
 */
@customElement('c2-mind-map')
export class MindMap extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()

  private readonly msg = new LocalizeController(this, mindMapMessages)

  /**
   * The map: one root node `{ id, label, children?, collapsed?, side?, color?, icon? }`. Unknown fields are kept. The
   * map edits its own copy and fires `change` with the new object; setting `data` again replaces the map and clears
   * the undo history.
   */
  @property({ converter: jsonPropertyConverter }) data: MindMapNode | null = null

  /** Accessible name of the map. Default: "Mind map". */
  @property() label = ''

  /** `both` puts branches on either side of the central topic; `left` and `right` put them all on one side. */
  @property() layout: MindMapLayout = 'both'

  /** Lets the user add, edit, move and delete topics. Navigation, folding and `node-click` work either way. */
  @property({ type: Boolean }) editable = false

  /** Turns off drag to reparent in an editable map, so a drag on a topic pans like a drag on the canvas. */
  @property({ type: Boolean, attribute: 'no-drag' }) noDrag = false

  /** Draws the zoom toolbar: zoom out, the zoom percent, zoom in and fit. */
  @property({ type: Boolean }) controls = false

  /** Draws an overview of the map in the corner while it overflows the canvas. */
  @property({ type: Boolean }) minimap = false

  /** The data `data` held when the map last adopted it, or the map's own last edit. */
  #own: MindMapNode | null | undefined = undefined
  #doc: MindMapNode | null = null
  #entries = new Map<string, Entry>()
  /** The drawn topics, in drawing order. */
  #visible: Entry[] = []
  #selected = ''
  #editing: Editing | null = null
  /** Escape moved focus to the canvas: no topic is a tab stop, so Tab leaves the map. */
  #escaped = false
  #past: Snapshot[] = []
  #future: Snapshot[] = []
  #announcement = ''

  /** False on the server and in the first client render, which draw the indented outline. */
  #laidOut = false
  /** Whether the render being finished drew the map rather than the outline. */
  #renderedLaidOut = false
  #layoutDirty = true
  #sizes = new Map<string, TopicSize>()
  /** Where every drawn topic goes, relative to the centre of the central topic. */
  #boxes = new Map<string, TopicBox>()
  /** Where every drawn topic is now: the same as `#boxes`, except while topics glide to a new layout. */
  #drawn = new Map<string, TopicBox>()
  #origin = { x: 0, y: 0 }
  #boardSize = { width: 0, height: 0 }
  #hasLayout = false
  #motionFrame = 0
  /** A topic to bring into view once the next layout is done. */
  #revealId = ''
  /** A topic to focus once the next render is done; with `#focusEditor`, its editor. */
  #focusId = ''
  #focusEditor = false
  #refit = false
  #drag: Drag | null = null
  #suppressClick = false
  #resizeObserver?: ResizeObserver
  #observed = new WeakSet<Element>()

  /** The inner `c2-pan-zoom`, for `zoomTo()`, `centerOn()` or `view-change`. Null before the first render. */
  get panZoom(): PanZoom | null {
    return this.renderRoot?.querySelector?.('c2-pan-zoom') ?? null
  }

  /** The selected topic. */
  get selectedNode(): MindMapNode | null {
    this.#sync()
    return this.#entries.get(this.#selected)?.node ?? null
  }

  /** The topic with the given id, wherever it sits. */
  getNode(id: string): MindMapNode | null {
    this.#sync()
    return this.#entries.get(id)?.node ?? null
  }

  override connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('copy', this.#handleCopy)
    document.addEventListener('paste', this.#handlePaste)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    document.removeEventListener('copy', this.#handleCopy)
    document.removeEventListener('paste', this.#handlePaste)
    cancelAnimationFrame(this.#motionFrame)
    this.#motionFrame = 0
    this.#drawn = new Map(this.#boxes)
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = undefined
    this.#observed = new WeakSet()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Public methods

  /** Adds a subtopic to `id` (the selected topic by default) and opens it in the editor. Returns the new id. */
  addChild(id = this.#selected): string | null {
    this.#sync()
    const entry = this.#entries.get(id)
    if (!entry || !this.#doc) return null
    const node: MindMapNode = { id: newId(), label: this.msg.t('newTopic') }
    let doc = entry.level === 0 ? this.#pinSides(this.#doc) : this.#doc
    doc = updateNode(doc, id, (parent) => ({ ...parent, collapsed: false, children: [...childrenOf(parent), node] }))
    if (!entry.node.collapsed) doc = updateNode(doc, id, (parent) => withoutFalseCollapsed(parent, entry.node))
    const parent = pathTo(doc, id)!.pop()!
    const action: MindMapAction = { type: 'add', node, parent, index: childrenOf(parent).length - 1 }
    if (!this.#apply(doc, action, this.msg.t('added', labelOf(entry.node)))) return null
    this.#openEditor(node.id, node.label, 'all')
    return node.id
  }

  /**
   * Adds a sibling after `id` (the selected topic by default), or before it with `before`, and opens it in the
   * editor. On the central topic it adds a subtopic. Returns the new id.
   */
  addSibling(id = this.#selected, before = false): string | null {
    this.#sync()
    const entry = this.#entries.get(id)
    if (!entry || !this.#doc) return null
    if (!entry.parent) return this.addChild(id)
    const node: MindMapNode = { id: newId(), label: this.msg.t('newTopic') }
    let doc = this.#doc
    if (entry.level === 1) {
      doc = this.#pinSides(doc)
      if (this.layout === 'both') node.side = entry.side as MindMapSide
    }
    const index = entry.index + (before ? 0 : 1)
    doc = insertNodes(doc, entry.parent.id, index, [node])
    const parent = pathTo(doc, entry.parent.id)!.pop()!
    if (!this.#apply(doc, { type: 'add', node, parent, index }, this.msg.t('addedSibling', labelOf(entry.node)))) return null
    this.#openEditor(node.id, node.label, 'all')
    return node.id
  }

  /** Opens the inline editor on `id` (the selected topic by default). */
  edit(id = this.#selected) {
    this.#sync()
    if (!this.#entries.has(id)) return
    this.#revealHidden(id)
    const entry = this.#entries.get(id)!
    this.#select(id, true)
    this.#openEditor(id, entry.node.label, 'all')
  }

  /**
   * Removes `id` (the selected topic by default) and its subtopics. The central topic cannot be removed. (Named
   * `removeTopic` because `remove()` takes the element itself out of the page.)
   */
  removeTopic(id = this.#selected): boolean {
    this.#sync()
    const entry = this.#entries.get(id)
    if (!entry?.parent || !this.#doc) return false
    const siblings = this.#siblingsOnSide(entry)
    const previous = siblings[siblings.indexOf(entry) - 1]
    const next = previous?.node.id ?? entry.parent.id
    const doc = removeNode(entry.level === 1 ? this.#pinSides(this.#doc) : this.#doc, id)
    const parent = pathTo(doc, entry.parent.id)!.pop()!
    const mod = isApplePlatform() ? '⌘' : this.msg.t('ctrlKey')
    const announcement = this.msg.t('deleted', labelOf(entry.node), entry.descendants, mod)
    if (!this.#apply(doc, { type: 'delete', node: entry.node, parent, index: entry.index }, announcement, next)) return false
    return true
  }

  /** Selects `id` and brings it into view, without `selection-change`. Focus moves to it when the map holds focus. */
  select(id: string) {
    this.#sync()
    if (!this.#entries.has(id)) return
    this.#revealHidden(id)
    this.#select(id, true)
    if (this.#hasFocus()) this.#focusId = id
    this.#revealId = id
    this.requestUpdate()
  }

  /** Folds `id` (the selected topic by default), unfolds it with `folded = false`, or toggles it. */
  fold(id = this.#selected, folded?: boolean): boolean {
    this.#sync()
    const entry = this.#entries.get(id)
    if (!entry?.parent || !childrenOf(entry.node).length || !this.#doc) return false
    const collapse = folded ?? !entry.node.collapsed
    if (collapse === !!entry.node.collapsed) return false
    const doc = updateNode(this.#doc, id, (node) => ({ ...node, collapsed: collapse }))
    const node = pathTo(doc, id)!.pop()!
    const parent = pathTo(doc, entry.parent.id)!.pop()!
    const announcement = this.msg.t(collapse ? 'folded' : 'unfolded', entry.descendants)
    // Folding hides the selection when it sits below: the folded topic takes it.
    const hidesSelection = collapse && !!pathTo(entry.node, this.#selected) && this.#selected !== id
    return this.#apply(doc, { type: collapse ? 'collapse' : 'expand', node, parent, index: entry.index }, announcement, hidesSelection ? id : undefined)
  }

  /**
   * Sets the colour of the branch `id` belongs to (the selected topic by default): a colour is read on first-level
   * topics only, so a deeper topic colours its first-level ancestor's whole branch. `null` goes back to the branch
   * colours in turn. The central topic has no branch: it returns false.
   */
  setColor(id = this.#selected, color: string | null = null): boolean {
    this.#sync()
    let entry = this.#entries.get(id)
    while (entry && entry.level > 1) entry = entry.parent ? this.#entries.get(entry.parent.id) : undefined
    if (!entry || entry.level !== 1 || !this.#doc) return false
    id = entry.node.id
    const doc = updateNode(this.#doc, id, (node) => {
      const next = { ...node }
      if (color) next.color = color
      else delete next.color
      return next
    })
    const node = pathTo(doc, id)!.pop()!
    const parent = entry.parent ? pathTo(doc, entry.parent.id)!.pop()! : null
    return this.#apply(doc, { type: 'color', node, parent, index: entry.index }, this.msg.t('recoloured', labelOf(node)))
  }

  /** Undoes the last edit. Up to 100 edits are kept. */
  undo(): boolean {
    return this.#travel('undo')
  }

  /** Redoes the last undone edit. */
  redo(): boolean {
    return this.#travel('redo')
  }

  /** Fits the whole map in the canvas. */
  fit() {
    this.panZoom?.fit()
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Document

  /** Adopts `data` when the app set it, rather than the map's own edit. */
  #sync() {
    if (this.data === this.#own) return
    this.#own = this.data
    this.#doc = normalize(typeof this.data === 'string' ? safeJson(this.data) : this.data)
    this.#past = []
    this.#future = []
    this.#editing = null
    this.#index()
    // New data can remove the selected topic or fold one of its ancestors: the nearest drawn ancestor takes over.
    this.#selected = this.#nearestVisible(this.#selected)
    this.#layoutDirty = true
    if (this.#hasLayout) this.#refit = true
  }

  /** `id` when it is drawn, else its nearest drawn ancestor in the current map, else the central topic. */
  #nearestVisible(id: string): string {
    const path = this.#doc && id ? pathTo(this.#doc, id) : null
    for (const node of (path ?? []).reverse()) if (this.#entries.get(node.id)?.visible) return node.id
    return this.#doc?.id ?? ''
  }

  #index() {
    const entries = (this.#entries = new Map())
    const visible: Entry[] = []
    const doc = this.#doc
    if (doc) {
      // Topic counts below every node, in one post-order pass.
      const counts = new Map<MindMapNode, number>()
      const count = (node: MindMapNode): number => {
        let total = 0
        for (const child of childrenOf(node)) total += 1 + count(child)
        counts.set(node, total)
        return total
      }
      count(doc)
      const firsts = childrenOf(doc)
      const sides = resolveSides(
        firsts.map((child) => ({ side: child.side, weight: 1 + (counts.get(child) ?? 0) })),
        this.layout,
      )
      const walk = (
        node: MindMapNode,
        parent: MindMapNode | null,
        level: number,
        index: number,
        posInSet: number,
        setSize: number,
        side: Entry['side'],
        branch: number,
        color: string | null,
        shown: boolean,
      ) => {
        const entry: Entry = { node, parent, level, index, posInSet, setSize, side, branch, color, visible: shown, descendants: counts.get(node) ?? 0 }
        entries.set(node.id, entry)
        if (shown) visible.push(entry)
        const children = childrenOf(node)
        const open = shown && (level === 0 || !node.collapsed)
        if (level === 0) {
          // Right side first, then left, each top to bottom: the order the arrows and the outline read.
          let position = 0
          for (const want of ['right', 'left'] as const) {
            children.forEach((child, i) => {
              if (sides[i] !== want) return
              const own = safeColour(child.color)
              walk(child, node, 1, i, ++position, children.length, want, i, own, open)
            })
          }
        } else children.forEach((child, i) => walk(child, node, level + 1, i, i + 1, children.length, side, branch, color, open))
      }
      walk(doc, null, 0, 0, 1, 1, 'center', -1, null, true)
    }
    this.#visible = visible
  }

  /** Gives every first-level topic an explicit side, so an edit among them does not rebalance the others. */
  #pinSides(doc: MindMapNode): MindMapNode {
    if (this.layout !== 'both') return doc
    const children = childrenOf(doc)
    if (children.every((child) => child.side === 'left' || child.side === 'right')) return doc
    return { ...doc, children: children.map((child) => ({ ...child, side: (this.#entries.get(child.id)?.side as MindMapSide) ?? 'right' })) }
  }

  /**
   * Applies an edit: `before-change` (cancelable), the undo step, the new document, `change` and the announcement.
   * `select` is the topic selected afterwards (the action's node by default).
   */
  #apply(doc: MindMapNode, action: MindMapAction, announcement: string, select = action.node.id): boolean {
    const before = new CustomEvent<MindMapBeforeChangeEventDetail>('before-change', { detail: { action }, cancelable: true, bubbles: true, composed: true })
    if (!this.dispatchEvent(before)) return false
    if (this.#doc) {
      this.#past.push({ doc: this.#doc, selected: this.#selected })
      if (this.#past.length > HISTORY_LIMIT) this.#past.shift()
    }
    this.#future = []
    this.#commitDoc(doc)
    const focused = this.#hasFocus()
    this.#select(this.#entries.has(select) ? select : doc.id, true)
    if (focused) this.#focusId = this.#selected
    this.#revealId = this.#selected
    this.dispatchEvent(new CustomEvent<MindMapChangeEventDetail>('change', { detail: { data: doc, action }, bubbles: true, composed: true }))
    this.#announce(announcement)
    return true
  }

  #commitDoc(doc: MindMapNode) {
    this.#doc = doc
    this.#own = doc
    this.data = doc
    this.#index()
    this.#layoutDirty = true
    this.requestUpdate()
  }

  #travel(direction: 'undo' | 'redo'): boolean {
    this.#sync()
    const from = direction === 'undo' ? this.#past : this.#future
    const to = direction === 'undo' ? this.#future : this.#past
    const snapshot = from[from.length - 1]
    if (!snapshot || !this.#doc) {
      this.#announce(this.msg.t(direction === 'undo' ? 'nothingToUndo' : 'nothingToRedo'))
      return false
    }
    const action: MindMapAction = { type: direction, node: snapshot.doc, parent: null, index: 0 }
    const before = new CustomEvent<MindMapBeforeChangeEventDetail>('before-change', { detail: { action }, cancelable: true, bubbles: true, composed: true })
    if (!this.dispatchEvent(before)) return false
    from.pop()
    to.push({ doc: this.#doc, selected: this.#selected })
    this.#editing = null
    this.#commitDoc(snapshot.doc)
    const focused = this.#hasFocus()
    const selected = this.#nearestVisible(snapshot.selected)
    this.#select(selected, true)
    if (focused) this.#focusId = selected
    this.#revealId = selected
    this.dispatchEvent(new CustomEvent<MindMapChangeEventDetail>('change', { detail: { data: snapshot.doc, action }, bubbles: true, composed: true }))
    this.#announce(this.msg.t(direction === 'undo' ? 'undone' : 'redone'))
    return true
  }

  #select(id: string, quiet: boolean) {
    if (this.#selected === id) return
    this.#selected = id
    this.requestUpdate()
    const node = this.#entries.get(id)?.node
    if (!quiet && node) this.dispatchEvent(new CustomEvent<MindMapNodeEventDetail>('selection-change', { detail: { node }, bubbles: false }))
  }

  /**
   * Unfolds the folded ancestors of `id`, so it is drawn. Folding is part of the document, so this is one `expand`
   * change (one undo step) about the outermost folded ancestor; the selection moves to `id`, not to that ancestor.
   */
  #revealHidden(id: string) {
    const path = this.#doc ? pathTo(this.#doc, id) : null
    if (!path || !this.#doc) return
    const folded = path.slice(1, -1).filter((ancestor) => ancestor.collapsed)
    if (!folded.length) return
    let doc = this.#doc
    for (const ancestor of folded) doc = updateNode(doc, ancestor.id, (node) => ({ ...node, collapsed: false }))
    const outer = this.#entries.get(folded[0].id)!
    const node = pathTo(doc, outer.node.id)!.pop()!
    const parent = outer.parent ? pathTo(doc, outer.parent.id)!.pop()! : null
    this.#apply(doc, { type: 'expand', node, parent, index: outer.index }, this.msg.t('unfolded', outer.descendants), id)
  }

  #announce(text: string) {
    // The same words twice in a row are still read: a trailing no-break space makes them a change.
    this.#announcement = this.#announcement === text ? `${text}\u00a0` : text
    this.requestUpdate()
  }

  #hasFocus(): boolean {
    return !!this.shadowRoot?.activeElement
  }

  #openEditor(id: string, text: string, caret: Editing['caret']) {
    this.#editing = { id, draft: text, caret }
    this.#focusId = id
    this.#focusEditor = true
    this.#revealId = id
    this.requestUpdate()
  }

  /** Closes the editor; `commit` saves the draft as the label when it changed and is not blank. */
  #closeEditor(commit: boolean, focus = true) {
    const editing = this.#editing
    if (!editing) return
    this.#editing = null
    if (focus) this.#focusId = editing.id
    this.requestUpdate()
    const entry = this.#entries.get(editing.id)
    const label = editing.draft.replace(/\s+$/, '').replace(/^\s+/, '')
    if (!commit || !entry || !this.#doc || !label || label === entry.node.label) return
    const doc = updateNode(this.#doc, editing.id, (node) => ({ ...node, label }))
    const node = pathTo(doc, editing.id)!.pop()!
    const parent = entry.parent ? pathTo(doc, entry.parent.id)!.pop()! : null
    this.#apply(doc, { type: 'edit', node, parent, index: entry.index }, this.msg.t('edited', label))
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Moves

  /** The drawn siblings of a topic on its side of the map, top to bottom. */
  #siblingsOnSide(entry: Entry): Entry[] {
    if (!entry.parent) return [entry]
    return this.#visible.filter((other) => other.parent === entry.parent && other.side === entry.side)
  }

  #move(entry: Entry, parentId: string, index: number, side?: MindMapSide): boolean {
    if (!entry.parent || !this.#doc) return false
    const touchesRoot = entry.level === 1 || parentId === this.#doc.id
    let doc = touchesRoot ? this.#pinSides(this.#doc) : this.#doc
    doc = moveNode(doc, entry.node.id, parentId, index)
    if (doc === this.#doc) return false
    doc = updateNode(doc, parentId, (parent) => (parent.collapsed ? { ...parent, collapsed: false } : parent))
    if (parentId === doc.id && this.layout === 'both')
      doc = updateNode(doc, entry.node.id, (node) => ({ ...node, side: side ?? (entry.side === 'center' ? 'right' : entry.side) }))
    const parent = pathTo(doc, parentId)!.pop()!
    const node = childrenOf(parent).find((child) => child.id === entry.node.id)!
    const newIndex = childrenOf(parent).indexOf(node)
    // Dropped where it already was (same parent, place and side): nothing to change, and no undo step.
    if (parentId === entry.parent.id && newIndex === entry.index && (parentId !== doc.id || (node.side ?? entry.side) === entry.side)) return false
    const action: MindMapAction = { type: 'move', node, parent, index: newIndex, from: { parent: entry.parent, index: entry.index } }
    const announcement =
      parentId === entry.parent.id
        ? this.msg.t('movedTo', labelOf(node), this.#positionOnSide(doc, node, parent), this.#siblingCountOnSide(doc, node, parent))
        : this.msg.t('movedInto', labelOf(node), labelOf(parent))
    return this.#apply(doc, action, announcement)
  }

  /** The siblings of `node` on its side of the map in `doc`, with the sides resolved as the layout will draw them. */
  #sameSide(doc: MindMapNode, node: MindMapNode, parent: MindMapNode): MindMapNode[] {
    const children = childrenOf(parent)
    if (parent.id !== doc.id) return children
    const sides = resolveSides(
      children.map((child) => ({ side: child.side, weight: 1 + countDescendants(child) })),
      this.layout,
    )
    const own = sides[children.indexOf(node)]
    return children.filter((_, i) => sides[i] === own)
  }

  #positionOnSide(doc: MindMapNode, node: MindMapNode, parent: MindMapNode): number {
    return this.#sameSide(doc, node, parent).indexOf(node) + 1
  }

  #siblingCountOnSide(doc: MindMapNode, node: MindMapNode, parent: MindMapNode): number {
    return this.#sameSide(doc, node, parent).length
  }

  /** Alt+↑ / Alt+↓: swaps places with the previous or next sibling on the same side. */
  #reorder(entry: Entry, step: -1 | 1) {
    const siblings = this.#siblingsOnSide(entry)
    const neighbour = siblings[siblings.indexOf(entry) + step]
    if (!neighbour || !entry.parent) return
    this.#move(entry, entry.parent.id, step < 0 ? neighbour.index : neighbour.index + 1, entry.side === 'center' ? undefined : entry.side)
  }

  /** Alt + the arrow toward the centre: the topic becomes the sibling after its parent. */
  #promote(entry: Entry) {
    const parent = entry.parent ? this.#entries.get(entry.parent.id) : undefined
    if (!parent?.parent) return
    this.#move(entry, parent.parent.id, parent.index + 1, parent.side === 'center' ? undefined : parent.side)
  }

  /** Alt + the arrow away from the centre: the topic becomes the last subtopic of its previous sibling. */
  #demote(entry: Entry) {
    const siblings = this.#siblingsOnSide(entry)
    const previous = siblings[siblings.indexOf(entry) - 1]
    if (!previous) return
    this.#move(entry, previous.node.id, childrenOf(previous.node).length)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Lifecycle and layout

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.#sync()
    if (changed.has('layout') && changed.get('layout') !== undefined) {
      this.#index()
      this.#layoutDirty = true
    }
  }

  protected override updated(): void {
    const empty = !this.#doc
    this.internals.role = empty ? null : 'tree'
    this.internals.ariaLabel = empty ? null : this.label || this.msg.t('label')
    this.internals.ariaRoleDescription = empty ? null : this.msg.t('roleDescription')
    const description = empty ? null : this.editable ? this.msg.t('keyHelp') : this.msg.t('keyHelpReadOnly')
    ;(this.internals as ElementInternals & { ariaDescription?: string | null }).ariaDescription = description

    if (!this.#laidOut) {
      // The first render drew the outline the server sends, so hydration matches; the map is measured and laid out
      // from the second render on.
      this.#laidOut = true
      this.requestUpdate()
    } else if (this.#renderedLaidOut && this.#doc && !this.#motionFrame) {
      // Not while topics glide: the frames move topics without resizing them, and the last frame measures.
      this.#measure()
    }

    if (this.#focusId) {
      const id = this.#focusId
      const topic = this.#topicEl(id)
      if (topic) {
        this.#focusId = ''
        if (this.#focusEditor && this.#editing?.id === id) {
          this.#focusEditor = false
          const editor = topic.querySelector<HTMLTextAreaElement>('textarea')
          editor?.focus({ preventScroll: true })
          if (editor && this.#editing.caret === 'all') editor.select()
          else editor?.setSelectionRange(editor.value.length, editor.value.length)
        } else topic.focus({ preventScroll: true })
      }
    }
  }

  /** Measures the drawn topics and lays the map out again when a size or the structure changed. */
  #measure() {
    let changed = this.#layoutDirty
    // Forget the sizes of topics that are gone, so the cache does not grow with every deleted topic.
    for (const id of this.#sizes.keys()) if (!this.#entries.has(id)) this.#sizes.delete(id)
    this.#resizeObserver ??= typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => this.requestUpdate())
    for (const entry of this.#visible) {
      const element = this.#topicEl(entry.node.id)
      if (!element) continue
      if (this.#resizeObserver && !this.#observed.has(element)) {
        this.#observed.add(element)
        this.#resizeObserver.observe(element)
      }
      const size = { width: element.offsetWidth, height: element.offsetHeight }
      const old = this.#sizes.get(entry.node.id)
      if (!old || old.width !== size.width || old.height !== size.height) {
        this.#sizes.set(entry.node.id, size)
        changed = true
      }
    }
    if (changed) this.#relayout()
  }

  #relayout() {
    const doc = this.#doc
    if (!doc) return
    this.#layoutDirty = false
    const probe = this.renderRoot.querySelector<HTMLElement>('.probe')
    const style = probe ? getComputedStyle(probe) : null
    const number = (value: string | undefined, fallback: number) => (value && Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback)
    const levelGap = number(style?.width, 56)
    const siblingGap = number(style?.height, 12)
    const tree = (node: MindMapNode, level: number): LayoutTopic => {
      const entry = this.#entries.get(node.id)!
      const open = level === 0 || !node.collapsed
      return {
        id: node.id,
        side: level === 1 ? (entry.side as MindMapSide) : undefined,
        weight: 1 + entry.descendants,
        children: open ? childrenOf(node).map((child) => tree(child, level + 1)) : [],
      }
    }
    const root = tree(doc, 0)
    // Sides are already resolved by the index; hand them over so the layout and the arrows agree.
    const boxes = layoutMindMap(root, (id) => this.#sizes.get(id) ?? { width: 0, height: 0 }, { layout: this.layout, levelGap, siblingGap })
    const bounds = boundsOf(boxes.values())
    const origin = { x: BOARD_PADDING - bounds.x, y: BOARD_PADDING - bounds.y }
    const panZoom = this.panZoom
    if (this.#hasLayout && panZoom && !this.#refit && (origin.x !== this.#origin.x || origin.y !== this.#origin.y)) {
      // The board grew on the left or the top: move the view by as much, so the map stays where it was on screen.
      const zoom = panZoom.zoom
      panZoom.panBy((origin.x - this.#origin.x) * zoom, (origin.y - this.#origin.y) * zoom, { animate: false })
    }
    this.#origin = origin
    this.#boardSize = { width: Math.ceil(bounds.width + BOARD_PADDING * 2), height: Math.ceil(bounds.height + BOARD_PADDING * 2) }
    const from = this.#drawn
    const animate = this.#hasLayout && !this.#refit
    this.#boxes = boxes
    this.#hasLayout = true
    this.#startMotion(animate ? from : new Map())
    if (this.#refit) {
      this.#refit = false
      panZoom?.fit(undefined, { animate: false })
    } else if (this.#revealId) {
      const box = boxes.get(this.#revealId)
      if (box && panZoom) panZoom.reveal({ x: box.x + origin.x, y: box.y + origin.y, width: box.width, height: box.height })
    }
    this.#revealId = ''
    this.requestUpdate()
  }

  #startMotion(from: Map<string, TopicBox>) {
    cancelAnimationFrame(this.#motionFrame)
    this.#motionFrame = 0
    const target = this.#boxes
    const probe = this.renderRoot.querySelector<HTMLElement>('.probe')
    const value = probe ? getComputedStyle(probe).transitionDuration.split(',')[0].trim() : '0s'
    const amount = parseFloat(value)
    const duration = Number.isFinite(amount) ? (value.endsWith('ms') ? amount : amount * 1000) : 0
    const moved = [...target].some(([id, box]) => {
      const old = from.get(id)
      return !old || old.x !== box.x || old.y !== box.y
    })
    if (!from.size || duration <= 0 || prefersReducedMotion() || !moved) {
      this.#drawn = new Map(target)
      return
    }
    const start = performance.now()
    const startOf = (id: string, box: TopicBox): TopicBox => {
      const old = from.get(id)
      if (old) return old
      // A new topic grows out of the nearest ancestor that was already drawn.
      let parent = box.parent
      while (parent && !from.has(parent)) parent = target.get(parent)?.parent ?? null
      const anchor = parent ? from.get(parent)! : box
      return { ...box, x: anchor.x + (box.side === 'left' ? anchor.width - box.width : 0), y: anchor.y + (anchor.height - box.height) / 2 }
    }
    const step = () => {
      const t = Math.min(1, (performance.now() - start) / duration)
      const k = easeOutCubic(t)
      const drawn = new Map<string, TopicBox>()
      for (const [id, box] of target) {
        const old = startOf(id, box)
        drawn.set(id, { ...box, x: old.x + (box.x - old.x) * k, y: old.y + (box.y - old.y) * k })
      }
      this.#drawn = drawn
      this.requestUpdate()
      this.#motionFrame = t < 1 ? requestAnimationFrame(step) : 0
    }
    step()
  }

  #topicEl(id: string): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>(`.topic[data-id="${CSS.escape(id)}"]`)
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Rendering

  override render() {
    this.#sync()
    const doc = this.#doc
    const laidOut = this.#laidOut && !!doc && this.#hasLayout
    const measuring = this.#laidOut && !laidOut
    this.#renderedLaidOut = this.#laidOut
    const tabStop = this.#escaped ? '' : this.#entries.get(this.#selected)?.visible ? this.#selected : (doc?.id ?? '')
    const boardStyle = laidOut ? { width: `${this.#boardSize.width}px`, height: `${this.#boardSize.height}px` } : {}
    const layerStyle = laidOut ? { transform: `translate(${this.#origin.x}px, ${this.#origin.y}px)` } : {}
    return html`
      <c2-pan-zoom
        class="canvas"
        part="canvas"
        gestures="pan"
        bounds="none"
        no-keyboard
        no-double-click-zoom
        ?controls=${this.controls}
        ?minimap=${this.minimap}
      >
        <div
          class=${classMap({ board: true, outline: !this.#laidOut, measuring, dragging: !!this.#drag?.active })}
          part="board"
          style=${styleMap(boardStyle)}
          tabindex=${this.#escaped ? -1 : nothing}
          role=${this.#escaped ? 'group' : nothing}
          aria-label=${this.#escaped ? this.msg.t('canvas') : nothing}
          @keydown=${this.#handleKeydown}
          @click=${this.#handleClick}
          @dblclick=${this.#handleDoubleClick}
          @pointerdown=${this.#handlePointerDown}
          @pointermove=${this.#handlePointerMove}
          @pointerup=${this.#handlePointerUp}
          @pointercancel=${this.#handlePointerCancel}
          @lostpointercapture=${this.#handlePointerCancel}
          @focusin=${this.#handleFocusIn}
          @focusout=${this.#handleFocusOut}
        >
          <div class="layer" style=${styleMap(layerStyle)}>
            ${laidOut ? this.#renderConnectors() : nothing}
            ${repeat(
              this.#visible,
              (entry) => entry.node.id,
              (entry) => this.#renderTopic(entry, tabStop, laidOut),
            )}
            ${laidOut ? this.#renderDrag() : nothing}
          </div>
        </div>
        <svg
          slot="minimap"
          class="minimap"
          aria-hidden="true"
          viewBox=${`0 0 ${Math.max(1, this.#boardSize.width)} ${Math.max(1, this.#boardSize.height)}`}
          preserveAspectRatio="none"
        >
          ${this.minimap && laidOut ? this.#renderMinimap() : nothing}
        </svg>
      </c2-pan-zoom>
      <div class="visually-hidden live" role="status" aria-live="polite">${this.#announcement}</div>
      <span class="probe" aria-hidden="true"></span>
    `
  }

  #branchClass(entry: Entry): string {
    return entry.branch < 0 ? 'branch-root' : `branch-${(entry.branch % BRANCH_COLOURS) + 1}`
  }

  #renderTopic(entry: Entry, tabStop: string, laidOut: boolean) {
    const { node, level } = entry
    const id = node.id
    const selected = id === this.#selected
    const children = childrenOf(node)
    const branch = children.length > 0
    const collapsed = branch && level > 0 && !!node.collapsed
    const editing = this.#editing?.id === id ? this.#editing : null
    const drag = this.#drag?.active ? this.#drag : null
    const box = this.#drawn.get(id)
    const style: Record<string, string> = {}
    if (entry.color) style['--_color'] = entry.color
    if (laidOut) {
      const at = box ?? this.#drawn.get(entry.parent?.id ?? '') ?? { x: 0, y: 0 }
      style.transform = `translate(${at.x}px, ${at.y}px)`
    } else style['--_level'] = String(level)
    const kind = level === 0 ? 'root' : level === 1 ? 'main-topic' : 'subtopic'
    const label = labelOf(node)
    const draggable = this.editable && !this.noDrag && level > 0 && !editing
    const classes = {
      topic: true,
      [kind]: true,
      [`side-${entry.side}`]: true,
      'outer-left': level === 0 && this.layout === 'left',
      [this.#branchClass(entry)]: true,
      selected,
      collapsed,
      'has-children': branch,
      editing: !!editing,
      pending: laidOut && !box,
      'drag-source': drag?.id === id,
      'drop-into': drag?.target?.id === id && drag.target.mode === 'into',
    }
    return html`<div
      class=${classMap(classes)}
      part=${selected ? `topic ${kind} selected` : `topic ${kind}`}
      role="treeitem"
      data-id=${id}
      data-pan-zoom=${draggable ? 'ignore' : nothing}
      tabindex=${id === tabStop ? 0 : -1}
      aria-label=${label}
      aria-roledescription=${this.msg.t('topicRoleDescription')}
      aria-level=${level + 1}
      aria-setsize=${entry.setSize}
      aria-posinset=${entry.posInSet}
      aria-expanded=${branch ? String(!collapsed) : nothing}
      aria-selected=${String(selected)}
      style=${styleMap(style)}
    >
      <span class="body">
        ${node.icon ? html`<span class="icon" part="icon" aria-hidden="true">${String(node.icon)}</span>` : nothing}
        <span class="text-box">
          <span class="text" part="label">${editing ? `${editing.draft}\u200b` : label}</span>
          ${
            editing
              ? html`<textarea
                  class="editor"
                  part="editor"
                  rows="1"
                  aria-label=${this.msg.t('editTopic')}
                  .value=${editing.draft}
                  @input=${this.#handleEditorInput}
                  @keydown=${this.#handleEditorKeydown}
                  @blur=${this.#handleEditorBlur}
                ></textarea>`
              : nothing
          }
        </span>
      </span>
      ${
        branch && level > 0
          ? html`<span class="toggle" part="toggle" aria-hidden="true" title=${collapsed ? this.msg.t('unfold', entry.descendants) : this.msg.t('fold')}
              >${collapsed ? entry.descendants : nothing}</span
            >`
          : nothing
      }
      ${this.editable && selected && !editing && laidOut ? html`<span class="add" part="add" aria-hidden="true" title=${this.msg.t('addSubtopic')}>${plusIcon}</span>` : nothing}
    </div>`
  }

  /** The point where a topic's connectors to its subtopics start, on its outer side. */
  #outerAnchor(box: TopicBox, side: MindMapSide): { x: number; y: number } {
    const x = side === 'left' ? box.x : box.x + box.width
    return { x, y: box.level >= 2 ? box.y + box.height : box.y + box.height / 2 }
  }

  #renderConnectors() {
    const paths = []
    for (const entry of this.#visible) {
      if (!entry.parent) continue
      const box = this.#drawn.get(entry.node.id)
      const parentBox = this.#drawn.get(entry.parent.id)
      if (!box || !parentBox) continue
      const side = entry.side as MindMapSide
      const start = this.#outerAnchor(parentBox, side)
      const inner = side === 'left' ? box.x + box.width : box.x
      const outer = side === 'left' ? box.x : box.x + box.width
      const endY = entry.level >= 2 ? box.y + box.height : box.y + box.height / 2
      const middle = (start.x + inner) / 2
      let d = `M ${start.x} ${start.y} C ${middle} ${start.y}, ${middle} ${endY}, ${inner} ${endY}`
      // A deeper topic sits on a line in its branch colour.
      if (entry.level >= 2) d += ` H ${outer}`
      const style = entry.color ? `--_color: ${entry.color}; --_depth: ${entry.level - 1}` : `--_depth: ${entry.level - 1}`
      paths.push(
        svg`<path class=${`connector ${this.#branchClass(entry)}${this.#drag?.active && this.#drag.id === entry.node.id ? ' drag-source' : ''}`} part="connector" d=${d} style=${style} />`,
      )
    }
    return html`<svg class="connectors" aria-hidden="true">${paths}</svg>`
  }

  #renderDrag() {
    const drag = this.#drag
    if (!drag?.active) return nothing
    const entry = this.#entries.get(drag.id)
    if (!entry) return nothing
    const point = drag.point
    let line: unknown = nothing
    const target = drag.target ? this.#entries.get(drag.target.id) : undefined
    const box = target ? this.#boxes.get(target.node.id) : undefined
    if (target && box && drag.target) {
      if (drag.target.mode === 'into') {
        const side: MindMapSide = target.side === 'center' ? (point.x < 0 ? 'left' : 'right') : target.side
        const start = this.#outerAnchor(box, side)
        const middle = (start.x + point.x) / 2
        line = svg`<path class="drop-line" d=${`M ${start.x} ${start.y} C ${middle} ${start.y}, ${middle} ${point.y}, ${point.x} ${point.y}`} />`
      } else {
        const y = drag.target.mode === 'before' ? box.y - 4 : box.y + box.height + 4
        line = svg`<path class="drop-line" d=${`M ${box.x} ${y} H ${box.x + box.width}`} />`
      }
    }
    return html`<svg class="connectors drop" aria-hidden="true">${line}</svg>
      <div class="ghost" part="ghost" aria-hidden="true" style=${styleMap({ transform: `translate(${point.x + 12}px, ${point.y - 12}px)` })}>
        ${labelOf(entry.node)}
      </div>`
  }

  #renderMinimap() {
    const rects = []
    for (const entry of this.#visible) {
      const box = this.#boxes.get(entry.node.id)
      if (!box) continue
      const style = entry.color ? `--_color: ${entry.color}` : ''
      rects.push(
        svg`<rect class=${`mini ${this.#branchClass(entry)}`} style=${style} x=${box.x + this.#origin.x} y=${box.y + this.#origin.y} width=${box.width} height=${box.height} rx="4" />`,
      )
    }
    return rects
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Events

  #entryOf(event: Event): Entry | undefined {
    const topic = (event.composedPath()[0] as Element | undefined)?.closest?.<HTMLElement>('.topic')
    return topic?.dataset.id ? this.#entries.get(topic.dataset.id) : undefined
  }

  #handleFocusIn = (event: FocusEvent) => {
    const target = event.composedPath()[0] as HTMLElement
    const entry = this.#entryOf(event)
    if (!entry || target.localName === 'textarea') return
    if (this.#escaped) {
      this.#escaped = false
      this.requestUpdate()
    }
    this.#select(entry.node.id, false)
  }

  #handleFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null
    // Focus leaving the map gives the selected topic its tab stop back, so Tab comes back to it.
    if (this.#escaped && (!next || !this.shadowRoot?.contains(next))) {
      this.#escaped = false
      this.requestUpdate()
    }
  }

  #handleClick = (event: MouseEvent) => {
    if (this.#suppressClick) {
      this.#suppressClick = false
      return
    }
    const path = event.composedPath()[0] as Element
    const entry = this.#entryOf(event)
    if (!entry) return
    if (path.closest('.toggle')) {
      this.fold(entry.node.id)
      return
    }
    if (path.closest('.add')) {
      this.addChild(entry.node.id)
      return
    }
    if (path.closest('textarea')) return
    this.#select(entry.node.id, false)
    const topic = this.#topicEl(entry.node.id)
    if (topic && this.shadowRoot?.activeElement !== topic) topic.focus({ preventScroll: true })
    this.dispatchEvent(new CustomEvent<MindMapNodeEventDetail>('node-click', { detail: { node: entry.node }, bubbles: true, composed: true }))
  }

  #handleDoubleClick = (event: MouseEvent) => {
    const path = event.composedPath()[0] as Element
    const entry = this.#entryOf(event)
    if (!this.editable || !entry || path.closest('.toggle, .add, textarea')) return
    this.#openEditor(entry.node.id, entry.node.label, 'all')
  }

  #handleKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    const target = event.composedPath()[0] as HTMLElement
    if (target.localName === 'textarea') return
    if (target.classList.contains('board')) {
      // The canvas after Escape: Tab leaves as usual, any other key goes back to the selected topic.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Home'].includes(event.key)) {
        event.preventDefault()
        this.#escaped = false
        this.#focusId = this.#selected
        this.requestUpdate()
      }
      return
    }
    const entry = this.#entryOf(event)
    if (!entry || !target.classList.contains('topic')) return
    if (this.#drag) {
      if (event.key === 'Escape') {
        event.preventDefault()
        this.#cancelDrag(true)
      }
      return
    }
    const apple = isApplePlatform()
    const mod = apple ? event.metaKey : event.ctrlKey
    const key = event.key
    if (mod && !event.altKey) {
      const lower = key.toLowerCase()
      if (key === '+' || key === '=') this.panZoom?.zoomIn()
      else if (key === '-' || key === '_') this.panZoom?.zoomOut()
      else if (key === '0') this.panZoom?.fit()
      else if (this.editable && lower === 'z') {
        if (event.shiftKey) this.redo()
        else this.undo()
      } else if (this.editable && lower === 'y' && !apple) this.redo()
      else return
      event.preventDefault()
      return
    }
    if (event.altKey) {
      if (!this.editable || event.ctrlKey || event.metaKey || entry.level === 0) return
      const towardRoot = entry.side === 'left' ? 'ArrowRight' : 'ArrowLeft'
      const away = entry.side === 'left' ? 'ArrowLeft' : 'ArrowRight'
      if (key === 'ArrowUp') this.#reorder(entry, -1)
      else if (key === 'ArrowDown') this.#reorder(entry, 1)
      else if (key === towardRoot) this.#promote(entry)
      else if (key === away) this.#demote(entry)
      else return
      event.preventDefault()
      return
    }
    if (event.ctrlKey || event.metaKey) return
    let next: Entry | undefined
    switch (key) {
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowDown':
        next = this.#navigate(entry, key)
        break
      case 'Home':
        next = this.#entries.get(this.#doc?.id ?? '')
        break
      case ' ':
        this.fold(entry.node.id)
        break
      case 'Enter':
        if (this.editable) this.addSibling(entry.node.id, event.shiftKey)
        else this.dispatchEvent(new CustomEvent<MindMapNodeEventDetail>('node-click', { detail: { node: entry.node }, bubbles: true, composed: true }))
        break
      case 'Tab':
        if (!this.editable || event.shiftKey) return
        this.addChild(entry.node.id)
        break
      case 'Insert':
        if (!this.editable) return
        this.addChild(entry.node.id)
        break
      case 'F2':
        if (!this.editable) return
        this.#openEditor(entry.node.id, entry.node.label, 'end')
        break
      case 'Delete':
      case 'Backspace':
        if (!this.editable) return
        this.removeTopic(entry.node.id)
        break
      case 'Escape':
        if (!this.editable) return
        this.#escaped = true
        this.requestUpdate()
        this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>('.board')?.focus({ preventScroll: true }))
        break
      default:
        // Typing starts editing with that character, as in a spreadsheet.
        if (!this.editable || key.length !== 1 || !key.trim()) return
        this.#openEditor(entry.node.id, key, 'end')
    }
    event.preventDefault()
    if (next) {
      this.#select(next.node.id, false)
      this.#focusId = next.node.id
      this.requestUpdate()
    }
  }

  /** The topic an arrow key leads to: the arrows follow the drawing. */
  #navigate(entry: Entry, key: string): Entry | undefined {
    const visibleChildren = (of: Entry) => this.#visible.filter((other) => other.parent === of.node)
    if (entry.level === 0) {
      if (key !== 'ArrowLeft' && key !== 'ArrowRight') return undefined
      const side = key === 'ArrowLeft' ? 'left' : 'right'
      return visibleChildren(entry).find((child) => child.side === side)
    }
    const outward = entry.side === 'left' ? 'ArrowLeft' : 'ArrowRight'
    const inward = entry.side === 'left' ? 'ArrowRight' : 'ArrowLeft'
    if (key === outward) {
      if (!childrenOf(entry.node).length) return undefined
      if (entry.node.collapsed) {
        this.fold(entry.node.id, false)
        return undefined
      }
      return visibleChildren(entry)[0]
    }
    if (key === inward) return entry.parent ? this.#entries.get(entry.parent.id) : undefined
    const step = key === 'ArrowUp' ? -1 : 1
    const siblings = this.#siblingsOnSide(entry)
    const sibling = siblings[siblings.indexOf(entry) + step]
    if (sibling) return sibling
    // Past the last sibling: the nearest topic on the same level and side, above or below.
    const box = this.#boxes.get(entry.node.id)
    if (!box) return undefined
    const centre = box.y + box.height / 2
    let best: Entry | undefined
    let distance = Infinity
    for (const other of this.#visible) {
      if (other === entry || other.level !== entry.level || other.side !== entry.side) continue
      const otherBox = this.#boxes.get(other.node.id)
      if (!otherBox) continue
      const delta = (otherBox.y + otherBox.height / 2 - centre) * step
      if (delta > 0 && delta < distance) {
        distance = delta
        best = other
      }
    }
    return best
  }

  #handleEditorInput = (event: InputEvent) => {
    if (!this.#editing) return
    this.#editing = { ...this.#editing, draft: (event.target as HTMLTextAreaElement).value }
    this.requestUpdate()
  }

  #handleEditorKeydown = (event: KeyboardEvent) => {
    event.stopPropagation()
    if (event.isComposing || !this.#editing) return
    const id = this.#editing.id
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      this.#closeEditor(true)
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault()
      this.#closeEditor(true)
      if (this.#entries.has(id)) this.addChild(id)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.#closeEditor(false)
    }
  }

  #handleEditorBlur = () => {
    // Leaving the field commits, without pulling focus back.
    if (this.#editing && !this.#focusEditor) this.#closeEditor(true, false)
  }

  #handlePointerDown = (event: PointerEvent) => {
    if (!this.editable || this.noDrag || event.button !== 0 || !event.isPrimary) return
    const path = event.composedPath()[0] as Element
    if (path.closest('.toggle, .add, textarea')) return
    const entry = this.#entryOf(event)
    if (!entry || entry.level === 0 || this.#editing?.id === entry.node.id) return
    const topic = this.#topicEl(entry.node.id)
    topic?.setPointerCapture?.(event.pointerId)
    this.#drag = {
      id: entry.node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      point: { x: 0, y: 0 },
      target: null,
    }
  }

  #handlePointerMove = (event: PointerEvent) => {
    const drag = this.#drag
    if (!drag || event.pointerId !== drag.pointerId) return
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return
      drag.active = true
      if (this.#editing) this.#closeEditor(true, false)
    }
    const panZoom = this.panZoom
    const point = panZoom ? panZoom.toContentPoint(event.clientX, event.clientY) : { x: 0, y: 0 }
    drag.point = { x: point.x - this.#origin.x, y: point.y - this.#origin.y }
    drag.target = this.#dropTarget(drag)
    this.requestUpdate()
  }

  /** The topic under the pointer and where the dragged topic would land: into it, or before or after it. */
  #dropTarget(drag: Drag): Drag['target'] {
    const source = this.#entries.get(drag.id)
    if (!source) return null
    for (const entry of this.#visible) {
      const box = this.#boxes.get(entry.node.id)
      if (!box || pathTo(source.node, entry.node.id)) continue
      const { x, y } = drag.point
      if (x < box.x - 4 || x > box.x + box.width + 4 || y < box.y - 4 || y > box.y + box.height + 4) continue
      if (entry.level === 0) return { id: entry.node.id, mode: 'into' }
      const share = (y - box.y) / box.height
      return { id: entry.node.id, mode: share < 0.25 ? 'before' : share > 0.75 ? 'after' : 'into' }
    }
    return null
  }

  #handlePointerUp = (event: PointerEvent) => {
    const drag = this.#drag
    if (!drag || event.pointerId !== drag.pointerId) return
    this.#drag = null
    if (!drag.active) return
    this.#suppressClick = true
    setTimeout(() => (this.#suppressClick = false), 0)
    this.requestUpdate()
    const entry = this.#entries.get(drag.id)
    const target = drag.target ? this.#entries.get(drag.target.id) : undefined
    if (!entry || !target || !drag.target) return
    if (drag.target.mode === 'into')
      this.#move(entry, target.node.id, childrenOf(target.node).length, target.level === 0 ? (drag.point.x < 0 ? 'left' : 'right') : undefined)
    else if (target.parent) {
      const side = target.side === 'center' ? undefined : target.side
      this.#move(entry, target.parent.id, target.index + (drag.target.mode === 'after' ? 1 : 0), side)
    }
  }

  #handlePointerCancel = (event: PointerEvent) => {
    if (this.#drag && event.pointerId === this.#drag.pointerId && event.type === 'pointercancel') this.#cancelDrag(false)
    else if (this.#drag && event.type === 'lostpointercapture' && !this.#drag.active) this.#drag = null
  }

  #cancelDrag(announce: boolean) {
    const drag = this.#drag
    if (!drag) return
    this.#drag = null
    const topic = this.#topicEl(drag.id)
    if (topic?.hasPointerCapture?.(drag.pointerId)) topic.releasePointerCapture(drag.pointerId)
    if (drag.active) {
      this.#suppressClick = true
      setTimeout(() => (this.#suppressClick = false), 0)
      if (announce) this.#announce(this.msg.t('cancelled'))
    }
    this.requestUpdate()
  }

  /** The focused topic, when focus is on one of this map's topics and not in its editor. */
  #focusedEntry(): Entry | undefined {
    const active = this.shadowRoot?.activeElement as HTMLElement | null
    if (!active?.classList.contains('topic') || this.#editing) return undefined
    return active.dataset.id ? this.#entries.get(active.dataset.id) : undefined
  }

  #handleCopy = (event: ClipboardEvent) => {
    const entry = this.#focusedEntry()
    if (!entry || !event.clipboardData) return
    event.clipboardData.setData('text/plain', toOutline(entry.node))
    event.preventDefault()
    this.#announce(this.msg.t('copied', 1 + entry.descendants))
  }

  #handlePaste = (event: ClipboardEvent) => {
    const entry = this.#focusedEntry()
    if (!entry || !this.editable || !this.#doc || !event.clipboardData) return
    const nodes = parseOutline(event.clipboardData.getData('text/plain'))
    if (!nodes.length) return
    event.preventDefault()
    let doc = entry.level === 0 ? this.#pinSides(this.#doc) : this.#doc
    const index = childrenOf(entry.node).length
    doc = insertNodes(doc, entry.node.id, index, nodes)
    doc = updateNode(doc, entry.node.id, (node) => (node.collapsed ? { ...node, collapsed: false } : node))
    const parent = pathTo(doc, entry.node.id)!.pop()!
    const count = nodes.reduce((sum, node) => sum + 1 + countDescendants(node), 0)
    this.#apply(doc, { type: 'paste', node: nodes[0], parent, index, nodes }, this.msg.t('pasted', count, labelOf(entry.node)))
  }
}

/** A node's label for messages: its text on one line, else its id. */
function labelOf(node: MindMapNode): string {
  return String(node.label ?? '').replace(/\s*\n\s*/g, ' ') || node.id
}

/** Drops a `collapsed: false` that `addChild` wrote on a parent that had no `collapsed` field. */
function withoutFalseCollapsed(node: MindMapNode, original: MindMapNode): MindMapNode {
  if ('collapsed' in original || node.collapsed !== false) return node
  const copy = { ...node }
  delete copy.collapsed
  return copy
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-mind-map': MindMap
  }
}
