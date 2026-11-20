import { LitElement, html, nothing, unsafeCSS, isServer, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { customElement } from '@c2n/core/element-helper.js'
import { property, arrayPropertyConverter, jsonPropertyConverter, SlotReplayController } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import {
  DropZoneController,
  endItemDrag,
  itemDropTargetAt,
  itemDropTargetOf,
  startItemDrag,
  startNativeItemDrag,
  writeItemPayload,
  type DropPoint,
  type DropZoneItems,
  type ItemDrag,
  type ItemDropTarget,
} from '@c2n/core/controllers/drop-zone.js'
import { trackRead } from '@c2n/core/dom-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import { treeMessages } from './messages.js'
import styles from './tree.scss?inline'
// Registers `c2-tree-item` so a consumer of the tree alone gets the row element too (as `c2-tabs` does for
// `c2-tab`). It is also what lets an MDX `client:only` island render nested rows as plain markup.
import './tree-item'
import { TreeItem } from './tree-item'
import type { ReorderHandle } from './tree-reorder'
import type {
  TreeChildrenLoader,
  TreeExpansionChangeEventDetail,
  TreeItemClickEventDetail,
  TreeItemDropEventDetail,
  TreeItemMoveOutEventDetail,
  TreeItemExpandEventDetail,
  TreeItemLoadErrorEventDetail,
  TreeItemMoveEventDetail,
  TreeItemRenderer,
  TreeNode,
  TreeSelectionChangeEventDetail,
  TreeSelectionMode,
  TreeSelectionPropagation,
} from './tree-types'

const TYPEAHEAD_WINDOW = 600
/** Caps the type-ahead scan so a keystroke cannot stall on a very large tree. */
const TYPEAHEAD_SCAN_LIMIT = 2000

/** Events fired by {@link Tree}, keyed for `addEventListener`. */
export interface TreeEventMap {
  'selection-change': CustomEvent<TreeSelectionChangeEventDetail>
  'expansion-change': CustomEvent<TreeExpansionChangeEventDetail>
  'item-click': CustomEvent<TreeItemClickEventDetail>
  'item-expand': CustomEvent<TreeItemExpandEventDetail>
  'item-load-error': CustomEvent<TreeItemLoadErrorEventDetail>
  'item-move': CustomEvent<TreeItemMoveEventDetail>
  'item-drop': CustomEvent<TreeItemDropEventDetail>
  'item-move-out': CustomEvent<TreeItemMoveOutEventDetail>
}

export interface Tree {
  addEventListener: TypedAddEventListener<Tree, TreeEventMap>
  removeEventListener: TypedRemoveEventListener<Tree, TreeEventMap>
}

/**
 * Hierarchical tree view with expansion, selection and lazy loading.
 *
 * It can be authored two ways, and both produce the same DOM and the same events. Nest the rows in markup:
 *
 * ```html
 * <c2-tree expanded-items="src">
 *   <c2-tree-item value="src" label="src">
 *     <c2-tree-item value="app.ts" label="app.ts"></c2-tree-item>
 *   </c2-tree-item>
 * </c2-tree>
 * ```
 *
 * …or hand it data, which it renders into the same `c2-tree-item` elements:
 *
 * ```ts
 * tree.items = [{ value: 'src', label: 'src', children: [{ value: 'app.ts', label: 'app.ts' }] }]
 * ```
 *
 * The tree owns all state. `value` holds the selected rows, `expanded-items` the expanded ones, and every
 * row's `expanded`, `selected`, `indeterminate`, `level` and roving `tabindex` are written from here on each
 * sync — so drive those two arrays rather than the rows.
 *
 * In the data-driven mode `renderItem` takes over a row's whole content, or `renderIcon`, `renderLabel` and
 * `renderActions` replace one part each. They are handed to Lit, so they return a Lit template or a DOM node —
 * not framework markup such as JSX.
 *
 * `children-outline` draws a vertical rule per level of depth, the way a file explorer marks which branch each
 * row belongs to. It is off by default; `--c2-tree-item__guide--color` and `--c2-tree-item__guide--width` style
 * the rules once it is on.
 *
 * `reorderable` lets the user drag rows to reorder them and to re-parent them: drag right past the row above to nest
 * under it, left to move out. A line marks where the row will land, a collapsed branch opens when a row rests on it,
 * and `max-depth` caps how deep a row and its subtree may go. The tree fires a cancelable `item-move`, then moves the
 * row itself — it rebuilds `items` in the data-driven mode and moves the element in markup. The code for it loads
 * the first time the attribute is set, so a read-only tree does not carry it.
 *
 * Only expanded rows render their children slot, which keeps a collapsed subtree out of both layout and the
 * accessibility tree — though the child elements are still created. Reach for virtualization rather than this
 * component once a tree runs to many thousands of rows.
 *
 * ### Keyboard
 *
 * Arrow Up and Down walk the visible rows. Arrow Right expands a collapsed branch, then moves to its first
 * child; Arrow Left collapses an expanded one, then moves to its parent. Home and End jump to the ends, Enter
 * and Space select, `*` expands every sibling of the focused row, and typing a few letters jumps to the
 * matching row. With `selection="multiple"`, Shift extends a range and Ctrl or Cmd toggles a single row. In a
 * `reorderable` tree, Alt with Arrow Up or Down moves the focused row among its siblings, Alt with Arrow Right nests
 * it under the row above and Alt with Arrow Left moves it out of its parent; each move is announced. Escape
 * cancels a drag.
 *
 * @tag c2-tree
 *
 * @slot - The root `c2-tree-item` rows, when authoring in markup.
 * @slot empty - Shown instead of the rows when the tree holds nothing. Defaults to the `empty` message ("No items").
 *
 * @slotcomponent c2-tree-item
 *
 * @csspart tree - The scrolling container holding the rows.
 * @csspart drop-indicator - The line marking where a dragged row will land, in a `reorderable` tree.
 *
 * @event {CustomEvent<TreeSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {CustomEvent<TreeExpansionChangeEventDetail>} expansion-change - Fired after a row is expanded or collapsed. Does not bubble.
 * @event {CustomEvent<TreeItemClickEventDetail>} item-click - Fired when a row is clicked, selected or not.
 * @event {CustomEvent<TreeItemExpandEventDetail>} item-expand - Fired when a row expands. Call `preventDefault()` to keep it closed. This is where a consumer authoring in markup appends children for a lazily loaded branch.
 * @event {CustomEvent<TreeItemLoadErrorEventDetail>} item-load-error - Fired when `loadChildren` rejects.
 * @event {CustomEvent<TreeItemMoveEventDetail>} item-move - Fired before a `reorderable` tree moves a row, by drag or keyboard. Call `preventDefault()` to keep the row where it is.
 * @event {CustomEvent<TreeItemMoveOutEventDetail>} item-move-out - Fired when another place took nodes of the `drag-kind` payload (a pointer drag carried off the tree, the drag handle's drag ending in a move, or `moveItemTo`). A data-driven tree then takes them out of `items`; in a tree authored in markup the application removes `detail.rows`, and when no listener reads them during the event they stay (a copy) and the tree warns once. Cancelable: `preventDefault()` keeps them, which makes the move a copy. Does not bubble.
 * @event {CustomEvent<TreeItemDropEventDetail>} item-drop - Fired when nodes of the `drop-kind` payload are dropped on the tree from outside it. A data-driven tree then adds them to `items`; in a tree authored in markup the application adds a `c2-tree-item` per node to `detail.parentElement`. Cancelable: `preventDefault()` adds none of them. Does not bubble: each of `c2-kanban`, `c2-reorder-list` and `c2-tree` sends its own `detail`, so a drop on one nested in another must not reach the outer one's listeners. Listen on the element itself.
 *
 * @cssproperty {color} [--c2-tree--background=#ffffff] - Background of the tree.
 * @cssproperty {padding} [--c2-tree--padding-top=4px] - Space above the first row.
 * @cssproperty {padding} [--c2-tree--padding-right=0px] - Space right of the rows.
 * @cssproperty {padding} [--c2-tree--padding-bottom=4px] - Space below the last row.
 * @cssproperty {padding} [--c2-tree--padding-left=0px] - Space left of the rows.
 * @cssproperty {border} --c2-tree--border-top - Top border.
 * @cssproperty {border} --c2-tree--border-right - Right border.
 * @cssproperty {border} --c2-tree--border-bottom - Bottom border.
 * @cssproperty {border} --c2-tree--border-left - Left border.
 * @cssproperty {border-radius} [--c2-tree--border-top-left-radius=8px] - Top-left corner radius.
 * @cssproperty {border-radius} [--c2-tree--border-top-right-radius=8px] - Top-right corner radius.
 * @cssproperty {border-radius} [--c2-tree--border-bottom-left-radius=8px] - Bottom-left corner radius.
 * @cssproperty {border-radius} [--c2-tree--border-bottom-right-radius=8px] - Bottom-right corner radius.
 * @cssproperty {pixel} --c2-tree--max-height - Height at which the tree starts scrolling.
 * @cssproperty {font-size} [--c2-tree--font-size=14px] - Base font size, inherited by the rows.
 * @cssproperty {font-family} --c2-tree--font-family - Base font family, inherited by the rows.
 * @cssproperty {opacity} [--c2-tree__disabled--opacity=0.38] - Opacity of a disabled tree.
 * @cssproperty {color} [--c2-tree__empty--color=#71717a] - Colour of the empty message.
 * @cssproperty {padding} [--c2-tree__empty--padding=18px] - Space around the empty message.
 * @cssproperty {color} [--c2-tree__drop-indicator--color=rgb(2, 101, 220)] - Colour of the line marking where a dragged row will land.
 * @cssproperty {pixel} [--c2-tree__drop-indicator--height=2px] - Thickness of that line.
 * @cssproperty {border-radius} [--c2-tree__drop-indicator--border-radius=999px] - Corner radius of that line.
 * @cssproperty {color} [--c2-tree__drop-target--outline-color=#0265dc] - Outline of the tree while nodes of its `drop-kind` are dragged over it.
 * @cssproperty {string} [--c2-tree__drop-target--outline-style=dashed] - Outline style while a drop is possible.
 * @cssproperty {length} [--c2-tree__drop-target--outline-width=2px] - Outline width while a drag is over the tree.
 * @cssproperty {length} [--c2-tree__drop-target--outline-offset=-2px] - Outline offset; negative keeps it inside the scrolling area.
 * @cssproperty {color} [--c2-tree__drop-refused--outline-color=#dc2626] - Outline of the tree while another kind of item is dragged over it, which it refuses.
 */
@customElement('c2-tree')
export class Tree extends LitElement {
  static override styles = unsafeCSS(styles)

  // Semantics live on ElementInternals, not host attributes: an attribute the element writes on itself is one the
  // server never rendered, and React reports it as a hydration mismatch. An author-set attribute still wins.
  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, treeMessages)

  /** Nodes to render. Leave empty and nest `c2-tree-item` elements instead to author the tree in markup. */
  @property({ converter: jsonPropertyConverter }) items: TreeNode[] = []

  /** Values of the selected rows. Reflected as a `;`-separated attribute. */
  @property({ converter: arrayPropertyConverter, reflect: true }) value: string[] = []

  /** Values of the expanded rows. Reflected as a `;`-separated attribute. */
  @property({ converter: arrayPropertyConverter, reflect: true, attribute: 'expanded-items' }) expandedItems: string[] = []

  /** How many rows may be selected at once. */
  @property({ type: String }) selection: TreeSelectionMode = 'single'

  /** Shows a checkbox on every row. Implies `selection="multiple"`. */
  @property({ type: Boolean, attribute: 'checkbox-selection' }) checkboxSelection = false

  /** How a checkbox tick travels between a row and its relatives. */
  @property({ type: String, attribute: 'selection-propagation' }) selectionPropagation: TreeSelectionPropagation = 'both'

  /** Draws a vertical rule per level of depth, marking which branch each row belongs to. */
  @property({ type: Boolean, reflect: true, attribute: 'children-outline' }) childrenOutline = false

  /** Freezes the whole tree. */
  @property({ type: Boolean, reflect: true }) disabled = false

  /** Expands a branch when its row is clicked — or activated with Enter or Space — not only when its toggle is. */
  @property({ type: Boolean, attribute: 'expand-on-click' }) expandOnClick = false

  /**
   * Lets the user drag rows, or move them with Alt and the arrow keys, to reorder and re-parent them. The code for
   * it loads the first time this is set.
   */
  @property({ type: Boolean, reflect: true }) reorderable = false

  /**
   * The kind of item payload the tree takes from outside (another tree, another window), as a source writes it with
   * `writeItemPayload(dataTransfer, kind, nodes)` from `@c2n/core/controllers/drop-zone.js` (MIME type
   * `application/x-c2n-<kind>+json`), each item a `TreeNode`. Empty (the default) takes none. Needs `reorderable`.
   * The middle of a row nests the nodes under it, its top or bottom edge puts them before or after it. The tree fires
   * `item-drop`, adds the nodes to `items` when it is data-driven, and announces how many were added; a node whose
   * value the tree already holds is not added. A tree in markup adds nothing itself: the application inserts the rows
   * from `item-drop`. A drop not cancelled counts as taken, and a source with a `drag-kind` then lets its items go; a
   * drop among markup rows whose `detail.items` no listener read during the event adds nothing (with a warning), so no
   * row leaves its source for a tree that never adds it: read it in the listener itself, not later in a state updater
   * or after an `await`.
   */
  @property({ type: String, attribute: 'drop-kind' }) dropKind = ''

  /**
   * The kind of item payload rows leave the tree as, each a `TreeNode` with its subtree, for a tree, list or board whose
   * `drop-kind` is the same. Empty (the default), rows stay in the tree. Set, on a `reorderable` tree: a pointer drag
   * carried off the tree drops the row on the zone under the pointer that takes this kind; each row shows a drag handle
   * (the `drag-handle` part of `c2-tree-item`) whose drag the browser carries (dropped back on the tree, it moves the row there; a drop outside c2n, in another
   * window too, is a copy); and `moveItemTo`
   * moves a row from code, the keyboard path an application wires to a command. A row another place took leaves the
   * tree after `item-move-out`: a data-driven tree takes it out of `items`, the application removes a row in markup.
   */
  @property({ type: String, attribute: 'drag-kind' }) dragKind = ''

  /** Deepest level, `0` at the root, a moved row and its subtree may reach in a `reorderable` tree. Unset: no limit. */
  @property({ type: Number, attribute: 'max-depth' }) maxDepth?: number

  /** Resolves the children of a branch the first time it is expanded. */
  @property({ attribute: false }) loadChildren?: TreeChildrenLoader

  /**
   * Replaces the whole content of every row — icon, label and trailing actions together. Takes precedence over
   * `renderIcon`, `renderLabel` and `renderActions`. The toggle and the selection checkbox are structural and
   * stay. Only used in the data-driven mode; author the slots directly when the rows are written in markup.
   */
  @property({ attribute: false }) renderItem?: TreeItemRenderer

  /** Replaces the label of every row. Only used in the data-driven mode. */
  @property({ attribute: false }) renderLabel?: TreeItemRenderer

  /** Adds an icon to every row. Only used in the data-driven mode. */
  @property({ attribute: false }) renderIcon?: TreeItemRenderer

  /** Adds trailing content to every row. Only used in the data-driven mode. */
  @property({ attribute: false }) renderActions?: TreeItemRenderer

  @query('.c2-tree') private container?: HTMLElement

  #warnedUnreadDrop = false
  #warnedUnreadMoveOut = false
  #dropZone = new DropZoneController(this, {
    itemKind: () => this.dropKind,
    disabled: () => this.disabled || !this.reorderable,
    onItems: (drop) => this.#receiveDrop(drop),
    // A row's drag handle dropped back on the tree: the row moves there, as a pointer drag would put it.
    onOwnDrop: ({ point }) => {
      const item = this.#nativeDrag?.item
      // A row the application took out of the tree during the drag is not put back by dropping it.
      if (!item || !this.#reorder || !(this.contains(item) || item.getRootNode() === this.renderRoot)) return
      const { parent, before } = this.#dropPlace(point.y)
      // Back on the row itself, or on its own top edge: nothing to do, and nothing to say.
      if (parent === item || before === item) return
      if (!this.#reorder.moveTo(item, parent, before)) this.#announce(this.msg.t('cannotMove', item.resolvedLabel))
    },
  })

  @query('slot:not([name])') private rootSlot?: HTMLSlotElement

  /** The row the roving `tabindex` currently rests on. */
  #focused?: TreeItem
  /** Anchor for Shift-extended range selection. */
  #anchor?: TreeItem
  /** Branches whose children have already been requested, so a second expand does not refetch. */
  #loaded = new Set<string>()
  #typeahead = ''
  #typeaheadAt = 0
  #syncing = false
  #syncQueued = false
  #reorderLoaded = false

  /** Every row in the tree, in document order, expanded or not. */
  get allItems(): TreeItem[] {
    const result: TreeItem[] = []
    const walk = (items: TreeItem[]) => {
      for (const item of items) {
        result.push(item)
        walk(item.childItems)
      }
    }
    walk(this.rootItems)
    return result
  }

  /**
   * The rows a user can actually see and move to — every row whose ancestors are all expanded, skipping any row
   * `hidden` takes off the page. A filtered-out row must not stay in the keyboard order, or Arrow Down walks
   * onto something nobody can see.
   */
  get visibleItems(): TreeItem[] {
    const result: TreeItem[] = []
    const walk = (items: TreeItem[]) => {
      for (const item of items) {
        if (item.hidden) continue
        result.push(item)
        if (item.expanded) walk(item.childItems)
      }
    }
    walk(this.rootItems)
    return result
  }

  /**
   * The root rows, from whichever mode produced them. Data-driven rows live in this shadow root and slotted
   * rows in the light DOM, so both sources are read; below the root the two modes are identical and
   * `TreeItem.childItems` serves both.
   */
  get rootItems(): TreeItem[] {
    if (isServer) return []
    const slotted = this.rootSlot?.assignedElements({ flatten: true }) ?? []
    const rendered = this.container ? [...this.container.children] : []
    return [...rendered, ...slotted].flatMap((element) => unwrap(element))
  }

  /** The rows that are currently selected, in tree order. */
  getSelectedNodes(): TreeNode[] {
    return this.allItems.filter((item) => this.value.includes(item.value)).map((item) => item.node)
  }

  /** Expands a row. Unknown or disabled values are ignored. */
  expand(value: string) {
    const item = this.#itemOf(value)
    if (item) void this.#setExpanded(item, true)
  }

  /** Collapses a row. Unknown values are ignored. */
  collapse(value: string) {
    const item = this.#itemOf(value)
    if (item) void this.#setExpanded(item, false)
  }

  /** Expands a collapsed row, or collapses an expanded one. */
  toggle(value: string) {
    const item = this.#itemOf(value)
    if (item) void this.#setExpanded(item, !item.expanded)
  }

  /** Expands every branch already present in the tree. Branches that load on demand are left alone. */
  expandAll() {
    this.expandedItems = this.allItems.filter((item) => item.childItems.length > 0).map((item) => item.value)
  }

  /** Collapses every branch. */
  collapseAll() {
    this.expandedItems = []
  }

  /** Selects every enabled row. Only meaningful while several rows may be selected. */
  selectAll() {
    if (!this.#multiple) return
    this.#commitSelection(this.allItems.filter((item) => !item.disabled).map((item) => item.value))
  }

  /** Clears the selection. */
  clearSelection() {
    this.#commitSelection([])
  }

  /** Moves focus to a row, expanding its ancestors if needed. */
  focusItem(value: string) {
    const item = this.#itemOf(value)
    if (!item) return
    for (const ancestor of this.#ancestorsOf(item)) {
      if (!this.expandedItems.includes(ancestor.value)) this.expandedItems = [...this.expandedItems, ancestor.value]
    }
    void this.updateComplete.then(() => this.#focus(item))
  }

  /** Drops the cached "already loaded" mark so the next expand runs `loadChildren` again. */
  reload(value?: string) {
    if (value === undefined) this.#loaded.clear()
    else this.#loaded.delete(value)
  }

  get #multiple(): boolean {
    // A checkbox column only makes sense when more than one row can be ticked.
    return this.selection === 'multiple' || this.checkboxSelection
  }

  #itemOf(value: string): TreeItem | undefined {
    return this.allItems.find((item) => item.value === value)
  }

  #ancestorsOf(item: TreeItem): TreeItem[] {
    if (isServer) return []
    const result: TreeItem[] = []
    let parent = item.parentElement
    while (parent instanceof TreeItem) {
      result.unshift(parent)
      parent = parent.parentElement
    }
    return result
  }

  override willUpdate(changed: PropertyValues<this>) {
    // A framework that writes the attribute value straight onto the property hands us a string.
    for (const key of ['value', 'expandedItems'] as const) {
      if (changed.has(key) && typeof this[key] === 'string') {
        this[key] = arrayPropertyConverter.fromAttribute(this[key] as unknown as string)
      }
    }
    // `jsonPropertyConverter` yields `undefined` for an empty or malformed attribute rather than throwing, so a
    // stray `items=""` would otherwise reach `render()` and crash the whole tree.
    if (changed.has('items') && !Array.isArray(this.items)) this.items = []
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    // A drag carried off the tree ends with it: the zone it hovered goes dark, and the page's drag is over.
    const carried = this.#carried
    this.#carried = undefined
    carried?.target?.hover(null)
    if (carried) endItemDrag(carried.drag)
    // A browser drag from a handle ends with the tree too, once it is still out of the page a task later (moved, it is
    // back by then): the drop it may still make elsewhere is a copy.
    const native = this.#nativeDrag
    if (native)
      setTimeout(() => {
        if (this.isConnected || this.#nativeDrag !== native) return
        this.#nativeDrag = undefined
        endItemDrag(native.drag)
      })
  }

  override updated(changed: PropertyValues<this>) {
    this.internals.role = 'tree'
    this.internals.ariaMultiSelectable = String(this.#multiple)
    this.internals.ariaDisabled = this.disabled ? 'true' : null
    if (changed.has('items')) this.#loaded.clear()
    this.#syncItems()
    // Reordering lives in its own chunk, fetched the first time a tree turns it on.
    if (this.reorderable && !this.#reorderLoaded) {
      this.#reorderLoaded = true
      const reorder = import('./tree-reorder')
      reorder.then(
        (module) =>
          (this.#reorder = module.attachReorder(this, {
            carryOut: (item, point) => this.#carryOut(item, point),
            dropOut: (point) => this.#dropOut(point),
          })),
        // A chunk that failed to load (a dropped connection, a stale deploy) is tried again on the next update.
        () => (this.#reorderLoaded = false),
      )
    }
  }

  /**
   * Rows announce themselves on connect, disconnect and identity changes. A declarative tree fires one per
   * row while it parses, so the resync is coalesced into a microtask — resyncing per event would be quadratic
   * on first paint.
   */
  #handleItemChange = (event: Event) => {
    event.stopPropagation()
    if (this.#syncing || this.#syncQueued) return
    this.#syncQueued = true
    queueMicrotask(() => {
      this.#syncQueued = false
      this.#syncItems()
    })
  }

  /**
   * Writes the tree's state onto every row: depth, expansion, selection, the derived indeterminate state and
   * the roving `tabindex`. Rows never derive any of this themselves, which keeps one ordered walk authoritative
   * for rendering, ARIA and keyboard movement alike.
   */
  #syncItems() {
    if (this.#syncing) return
    this.#syncing = true
    try {
      const selected = new Set(this.value)
      const expanded = new Set(this.expandedItems)
      const partial = this.checkboxSelection ? this.#derivePartial(selected) : undefined

      const walk = (items: TreeItem[], level: number) => {
        items.forEach((item, index) => {
          item.level = level
          item.setSize = items.length
          item.posInSet = index + 1
          item.expanded = expanded.has(item.value)
          item.selected = selected.has(item.value)
          item.indeterminate = partial?.has(item.value) ?? false
          item.checkboxSelection = this.checkboxSelection
          item.childrenOutline = this.childrenOutline
          item.selectable = this.selection !== 'none' || this.checkboxSelection
          item.dragHandle = this.reorderable && !!this.dragKind && !this.disabled
          walk(item.childItems, level + 1)
        })
      }
      walk(this.rootItems, 0)

      const visible = this.visibleItems
      const focusable = visible.filter((item) => !item.disabled)
      if (!this.#focused || !focusable.includes(this.#focused)) {
        this.#focused = focusable.find((item) => selected.has(item.value)) ?? focusable[0]
      }
      for (const item of this.allItems) item.tabIndex = item === this.#focused && !this.disabled ? 0 : -1
    } finally {
      this.#syncing = false
    }
  }

  /**
   * Values of the branches only *some* of whose descendants are selected.
   *
   * Derived on every sync rather than stored, which also repairs the native input clearing its own
   * indeterminate flag when clicked. Disabled rows are left out of the tally entirely, so a branch whose only
   * unselected descendants are disabled reads as fully selected instead of being stuck half-ticked.
   */
  #derivePartial(selected: Set<string>): Set<string> {
    const partial = new Set<string>()
    const walk = (item: TreeItem): { total: number; selected: number } => {
      const children = item.childItems
      if (children.length === 0) {
        const counts = item.disabled ? { total: 0, selected: 0 } : { total: 1, selected: selected.has(item.value) ? 1 : 0 }
        return counts
      }
      let total = 0
      let hit = 0
      for (const child of children) {
        const counts = walk(child)
        total += counts.total
        hit += counts.selected
      }
      if (hit > 0 && hit < total) partial.add(item.value)
      return { total, selected: hit }
    }
    for (const root of this.rootItems) walk(root)
    return partial
  }

  /** Every descendant of a row, expanded or not. */
  #descendantsOf(item: TreeItem): TreeItem[] {
    const result: TreeItem[] = []
    const walk = (items: TreeItem[]) => {
      for (const child of items) {
        result.push(child)
        walk(child.childItems)
      }
    }
    walk(item.childItems)
    return result
  }

  async #setExpanded(item: TreeItem, expanded: boolean): Promise<void> {
    if (item.disabled || !item.isBranch) return
    if (expanded === this.expandedItems.includes(item.value)) return

    if (expanded) {
      const event = new CustomEvent<TreeItemExpandEventDetail>('item-expand', {
        detail: { node: item.node, loading: item.hasChildren && !this.#loaded.has(item.value) },
        bubbles: true,
        composed: true,
        cancelable: true,
      })
      this.dispatchEvent(event)
      if (event.defaultPrevented) return
      await this.#loadIfNeeded(item)
    }

    this.expandedItems = expanded ? [...this.expandedItems, item.value] : this.expandedItems.filter((value) => value !== item.value)
    this.dispatchEvent(
      new CustomEvent<TreeExpansionChangeEventDetail>('expansion-change', {
        detail: { expandedItems: this.expandedItems, node: item.node, expanded },
        bubbles: false,
        composed: true,
      }),
    )
  }

  /** Runs `loadChildren` once per branch, showing a spinner on the row while it is in flight. */
  async #loadIfNeeded(item: TreeItem): Promise<void> {
    if (!this.loadChildren || !item.hasChildren || this.#loaded.has(item.value)) return
    if (item.childItems.length > 0) return

    this.#loaded.add(item.value)
    item.loading = true
    try {
      const children = await this.loadChildren({ node: item.node, level: item.level, expanded: true, selected: item.selected })
      if (children?.length) this.items = replaceChildren(this.items, item.value, children)
    } catch (error) {
      // Let the branch be retried: a failed load should not leave the row permanently empty and silent.
      this.#loaded.delete(item.value)
      this.dispatchEvent(
        new CustomEvent<TreeItemLoadErrorEventDetail>('item-load-error', {
          detail: { node: item.node, error },
          bubbles: true,
          composed: true,
        }),
      )
    } finally {
      item.loading = false
    }
  }

  #commitSelection(values: string[]) {
    this.value = values
    this.#syncItems()
    this.dispatchEvent(
      new CustomEvent<TreeSelectionChangeEventDetail>('selection-change', {
        detail: { value: this.value, nodes: this.getSelectedNodes() },
        bubbles: false,
        composed: true,
      }),
    )
  }

  /** Applies a click or key press to the selection, honouring the range and toggle modifiers. */
  #applySelection(item: TreeItem, options: { toggle?: boolean; range?: boolean } = {}) {
    if (this.selection === 'none' && !this.checkboxSelection) return
    if (item.disabled) return

    if (!this.#multiple) {
      this.#anchor = item
      this.#commitSelection(this.value.includes(item.value) ? [] : [item.value])
      return
    }

    if (options.range && this.#anchor) {
      const visible = this.visibleItems
      const from = visible.indexOf(this.#anchor)
      const to = visible.indexOf(item)
      if (from !== -1 && to !== -1) {
        const [start, end] = from < to ? [from, to] : [to, from]
        const range = visible.slice(start, end + 1).filter((row) => !row.disabled)
        this.#commitSelection([...new Set([...this.value, ...range.map((row) => row.value)])])
        return
      }
    }

    this.#anchor = item
    if (options.toggle) {
      const next = this.value.includes(item.value) ? this.value.filter((value) => value !== item.value) : [...this.value, item.value]
      this.#commitSelection(next)
      return
    }
    this.#commitSelection([item.value])
  }

  /**
   * Ticks or clears a checkbox and carries the change to the row's relatives.
   *
   * A disabled row is never added or removed by a relative: it would otherwise end up in `value` with no way
   * for the user to click it back out.
   */
  #applyCheck(item: TreeItem, checked: boolean) {
    if (item.disabled) return
    const next = new Set(this.value)
    const propagateDown = this.selectionPropagation === 'descendants' || this.selectionPropagation === 'both'
    const propagateUp = this.selectionPropagation === 'parents' || this.selectionPropagation === 'both'

    const affected = [item, ...(propagateDown ? this.#descendantsOf(item) : [])]
    for (const row of affected) {
      if (row.disabled) continue
      if (checked) next.add(row.value)
      else next.delete(row.value)
    }

    if (propagateUp) {
      // Walk outwards so a grandparent sees its parent's freshly settled state.
      for (const ancestor of this.#ancestorsOf(item).reverse()) {
        const descendants = this.#descendantsOf(ancestor).filter((row) => !row.disabled)
        const all = descendants.length > 0 && descendants.every((row) => next.has(row.value))
        if (all) next.add(ancestor.value)
        else next.delete(ancestor.value)
      }
    }

    this.#commitSelection(this.allItems.filter((row) => next.has(row.value)).map((row) => row.value))
  }

  #focus(item?: TreeItem) {
    if (!item) return
    this.#focused = item
    for (const row of this.allItems) row.tabIndex = row === item ? 0 : -1
    item.focus()
  }

  #itemFromEvent(event: Event): TreeItem | undefined {
    // The listener sits in this shadow root while a slotted row lives in an ancestor tree, so nothing is
    // retargeted and `target` is the row itself; a click inside a row's own shadow root retargets to its host.
    const target = event.target
    return target instanceof Element ? ((target.closest('c2-tree-item') as TreeItem | null) ?? undefined) : undefined
  }

  #handleClick = (event: MouseEvent) => {
    if (this.disabled) return
    // The drag handle is a control of its own, like the toggle: a click on it neither selects nor expands the row.
    if (event.composedPath().some((node) => this.#isRowGrip(node))) return
    const item = this.#itemFromEvent(event)
    if (!item) return

    this.dispatchEvent(new CustomEvent<TreeItemClickEventDetail>('item-click', { detail: { node: item.node }, bubbles: true, composed: true }))
    if (item.disabled) return

    this.#focus(item)
    if (this.expandOnClick && item.isBranch) void this.#setExpanded(item, !item.expanded)
    if (this.checkboxSelection) return
    this.#applySelection(item, { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey })
  }

  #handleToggle = (event: Event) => {
    event.stopPropagation()
    if (this.disabled) return
    const item = this.#itemFromEvent(event)
    if (item) void this.#setExpanded(item, !item.expanded)
  }

  #handleCheck = (event: Event) => {
    event.stopPropagation()
    if (this.disabled) return
    const item = this.#itemFromEvent(event)
    if (item) this.#applyCheck(item, (event as CustomEvent<boolean>).detail)
  }

  #handleKeydown = (event: KeyboardEvent) => {
    if (this.disabled) return
    const item = this.#itemFromEvent(event) ?? this.#focused
    if (!item) return

    const visible = this.visibleItems.filter((row) => !row.disabled)
    const index = visible.indexOf(item)

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault()
        const next = visible[Math.min(index + 1, visible.length - 1)]
        this.#focus(next)
        if (next && event.shiftKey && this.#multiple) this.#applySelection(next, { range: true })
        return
      }
      case 'ArrowUp': {
        event.preventDefault()
        const previous = visible[Math.max(index - 1, 0)]
        this.#focus(previous)
        if (previous && event.shiftKey && this.#multiple) this.#applySelection(previous, { range: true })
        return
      }
      case 'ArrowRight':
        event.preventDefault()
        if (item.isBranch && !item.expanded) void this.#setExpanded(item, true)
        else this.#focus(item.childItems.find((child) => !child.disabled))
        return
      case 'ArrowLeft': {
        event.preventDefault()
        if (item.expanded) void this.#setExpanded(item, false)
        else this.#focus(this.#ancestorsOf(item).pop())
        return
      }
      case 'Home':
        event.preventDefault()
        this.#focus(visible[0])
        return
      case 'End':
        event.preventDefault()
        this.#focus(visible[visible.length - 1])
        return
      case 'Enter':
        event.preventDefault()
        // Enter and Space are the keyboard's click, so they run the same order `#handleClick` does — including
        // `expand-on-click`, without which a branch row that toggles under the pointer is dead to the keyboard.
        if (this.expandOnClick && item.isBranch) void this.#setExpanded(item, !item.expanded)
        // A linked row navigates instead of selecting, matching what clicking it does.
        if (item.href && !item.disabled) item.renderRoot.querySelector('a')?.click()
        else this.#applySelection(item)
        return
      case ' ':
        event.preventDefault()
        if (this.expandOnClick && item.isBranch) void this.#setExpanded(item, !item.expanded)
        if (this.checkboxSelection) this.#applyCheck(item, !item.selected)
        else this.#applySelection(item, { toggle: this.#multiple })
        return
      case '*': {
        event.preventDefault()
        const siblings = this.#ancestorsOf(item).pop()?.childItems ?? this.rootItems
        const branches = siblings.filter((row) => row.isBranch && !row.disabled).map((row) => row.value)
        this.expandedItems = [...new Set([...this.expandedItems, ...branches])]
        return
      }
      case 'a':
      case 'A':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault()
          this.selectAll()
          return
        }
        break
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) this.#typeaheadTo(event.key, visible, index)
  }

  #typeaheadTo(key: string, visible: TreeItem[], index: number) {
    const now = Date.now()
    this.#typeahead = now - this.#typeaheadAt > TYPEAHEAD_WINDOW ? key : this.#typeahead + key
    this.#typeaheadAt = now

    const needle = this.#typeahead.toLowerCase()
    const scan = Math.min(visible.length, TYPEAHEAD_SCAN_LIMIT)
    for (let step = 1; step <= scan; step += 1) {
      const candidate = visible[(index + step) % visible.length]
      if (candidate?.resolvedLabel.toLowerCase().startsWith(needle)) {
        this.#focus(candidate)
        return
      }
    }
  }

  /** Renders one node and, when it is expanded, its children as its own light children — the shape a
   * declaratively authored tree already has, so one walk serves both modes below the root. */
  #renderNode(node: TreeNode, level: number): unknown {
    const context = { node, level, expanded: this.expandedItems.includes(node.value), selected: this.value.includes(node.value) }
    return html`<c2-tree-item
      .value=${node.value}
      .label=${node.label ?? ''}
      .data=${node.data}
      ?disabled=${node.disabled ?? false}
      ?has-children=${node.hasChildren ?? false}
    >
      ${
        this.renderItem
          ? html`<span slot="label">${this.renderItem(context)}</span>`
          : html`${this.renderIcon ? html`<span slot="icon">${this.renderIcon(context)}</span>` : nothing}${
              this.renderLabel ? html`<span slot="label">${this.renderLabel(context)}</span>` : nothing
            }${this.renderActions ? html`<span slot="actions">${this.renderActions(context)}</span>` : nothing}`
      }
      ${repeat(
        node.children ?? [],
        (child) => child.value,
        (child) => this.#renderNode(child, level + 1),
      )}
    </c2-tree-item>`
  }

  // ---- rows leaving the tree ----

  /** The reorder module, once loaded: tells whether a drag or a keyboard move is in progress. */
  #reorder?: ReorderHandle
  /** The row carried off the tree by a pointer drag, and the zone under the pointer that would take it. */
  #carried?: { item: TreeItem; drag: ItemDrag; target: ItemDropTarget | null }
  /** The row the browser carries from its drag handle, while it lasts. */
  #nativeDrag?: { item: TreeItem; drag: ItemDrag }

  /** A row as the node it leaves as: with its subtree, read from `items` or from the rows in markup. */
  #nodeWithSubtree(item: TreeItem): TreeNode {
    if (item.getRootNode() === this.renderRoot) {
      const find = (nodes: TreeNode[]): TreeNode | undefined => {
        for (const node of nodes) {
          if (node.value === item.value) return node
          const inner = node.children && find(node.children)
          if (inner) return inner
        }
        return undefined
      }
      const found = find(this.items)
      if (found) return found
    }
    const children = item.childItems.map((child) => this.#nodeWithSubtree(child))
    const { value, disabled, data, hasChildren } = item.node
    return {
      value,
      // The text the row shows, slotted label included.
      label: item.resolvedLabel,
      ...(disabled ? { disabled } : {}),
      ...(data === undefined ? {} : { data }),
      ...(children.length ? { children } : {}),
      // A branch whose children were never loaded stays one: the place it lands loads them.
      ...(hasChildren && !children.length ? { hasChildren } : {}),
    }
  }

  /** The drag that carries a row off the tree, or `null` when the tree lets none leave. */
  #dragOutOf(item: TreeItem): ItemDrag | null {
    if (!this.dragKind || !this.reorderable || this.disabled || item.disabled) return null
    return { kind: this.dragKind, items: [this.#nodeWithSubtree(item)], source: this }
  }

  /**
   * Off the tree with a `drag-kind`: finds the zone under the pointer that takes the row and shows the drag over it.
   * Returns whether the drag is off the tree. A zone under the pointer wins over the tree's own box, which also covers
   * rows a scrolling ancestor hides. Called by the reorder module on each move of a pointer drag.
   */
  #carryOut(item: TreeItem, point: DropPoint): boolean {
    const clear = (): false => {
      if (this.#carried?.target) {
        this.#carried.target.hover(null)
        this.#carried.target = null
      }
      return false
    }
    // A tree taken out of the page mid-drag carries nothing any more.
    if (!this.dragKind || !this.isConnected) return clear()
    if (!this.#carried || this.#carried.item !== item) {
      // A drag of another row left behind: its zone goes dark and its drag ends.
      if (this.#carried) {
        this.#carried.target?.hover(null)
        endItemDrag(this.#carried.drag)
        this.#carried = undefined
      }
      const drag = this.#dragOutOf(item)
      // The row can no longer leave: off the tree, the release moves it nowhere.
      if (!drag) return !this.#onTree(point, EDGE_MARGIN)
      startItemDrag(drag)
      this.#carried = { item, drag, target: null }
    }
    const current = this.#carried
    const target = itemDropTargetAt(point, current.drag)
    // Just past the tree's edge, still its own: the drag scrolls it there, as it does without a `drag-kind`.
    if (!target && this.#onTree(point, EDGE_MARGIN)) return clear()
    if (target !== current.target) current.target?.hover(null)
    current.target = target
    target?.hover(point)
    return true
  }

  /**
   * Ends a pointer drag: when it was carried off the tree onto a zone that takes it, the row moves there. Returns
   * whether the drag was off the tree, where it is not a move within it.
   */
  #dropOut(point: DropPoint | null): boolean {
    const carried = this.#carried
    this.#carried = undefined
    // A row that could not leave (the tree made read-only mid-drag) and is released off the tree moves nowhere.
    if (!carried) return !!point && !!this.dragKind && !this.#onTree(point, EDGE_MARGIN)
    carried.target?.hover(null)
    endItemDrag(carried.drag)
    if (!point) return false
    if (carried.target) {
      if (carried.target.take(carried.drag, point) > 0) this.#moveOut(carried.drag, [carried.item], carried.target.host)
      else this.#announce(this.msg.t('cancelled', carried.item.resolvedLabel))
      return true
    }
    if (this.#onTree(point, EDGE_MARGIN)) return false
    this.#announce(this.msg.t('cancelled', carried.item.resolvedLabel))
    return true
  }

  /** Whether a point is on the tree, or within `margin` of it. */
  #onTree(point: DropPoint, margin = 0): boolean {
    const box = this.getBoundingClientRect()
    return point.x >= box.left - margin && point.x <= box.right + margin && point.y >= box.top - margin && point.y <= box.bottom + margin
  }

  /**
   * Moves a row to another tree, list or board whose `drop-kind` is the tree's `drag-kind`, without a pointer: the
   * keyboard path to another instance, which an application wires to a command. The node lands at the target's
   * natural place (the end of its root). Returns whether it moved: not when the tree has no `drag-kind`, is not
   * `reorderable`, holds no row of that value, the target takes no such node, a listener cancelled the move, or a drag or
   * keyboard move is in progress.
   */
  moveItemTo(target: Element, value: string): boolean {
    if (this.#reorder?.busy()) return false
    const item = this.allItems.find((candidate) => candidate.value === value)
    const drag = item ? this.#dragOutOf(item) : null
    const zone = drag ? itemDropTargetOf(target, drag) : null
    if (!item || !drag || !zone) return false
    // No page drag to start: the zone takes the items straight away, and a drag in flight elsewhere is left alone.
    if (zone.take(drag) === 0) return false
    return this.#moveOut(drag, [item], target)
  }

  /** Takes rows another place took out of the tree, unless `item-move-out` is cancelled. */
  #moveOut(drag: ItemDrag, leaving: TreeItem[], target: Element): boolean {
    // A row the application already moved into the target (the element itself) is no longer the tree's to give up.
    const rows = leaving.filter((row) => this.contains(row) || row.getRootNode() === this.renderRoot)
    if (!rows.length) {
      this.#announce(this.msg.t('movedOut', leaving[0].resolvedLabel))
      return true
    }
    const items = drag.items as TreeNode[]
    const detail: TreeItemMoveOutEventDetail = { kind: drag.kind, items, rows, target }
    // Read either way: a listener removes the rows themselves, or the application's records by the items they carry.
    const readRows = trackRead(detail, 'rows')
    const readItems = trackRead(detail, 'items')
    const read = () => readRows() || readItems()
    // Read before the event: an application removes rows authored in markup from its listener.
    const focused = rows.some((row) => row.matches(':focus-within'))
    const visible = this.visibleItems
    if (!this.dispatchEvent(new CustomEvent<TreeItemMoveOutEventDetail>('item-move-out', { detail, cancelable: true }))) return false
    // Rows written in markup that no listener read stay (the tree removes only its own data rows): the move is a copy,
    // said so rather than announced.
    if (rows.some((row) => row.getRootNode() !== this.renderRoot) && !read()) {
      if (!this.#warnedUnreadMoveOut)
        console.warn(
          'c2-tree: rows written in markup and taken by another place stayed, because no `item-move-out` listener read `detail.rows` to remove them.',
        )
      this.#warnedUnreadMoveOut = true
      return false
    }
    // Focus inside a row that leaves (the command that moved it) goes to the next row that stays, else the one before.
    if (focused) {
      const leaving = (row: TreeItem) => rows.some((moved) => moved === row || moved.contains(row))
      const at = visible.findIndex(leaving)
      const neighbour =
        visible.slice(at).find((row) => !leaving(row)) ??
        visible
          .slice(0, at)
          .reverse()
          .find((row) => !leaving(row))
      const value = neighbour?.value
      const refocus = () => {
        const row = value === undefined ? undefined : this.allItems.find((candidate) => candidate.value === value)
        if (row) this.#focus(row)
        // No row left: the empty state takes focus, rather than the page.
        else this.renderRoot.querySelector<HTMLElement>('.empty')?.focus()
      }
      // A framework removes the rows on its next render: a frame later, the tree has redrawn.
      void this.updateComplete.then(() => requestAnimationFrame(() => void this.updateComplete.then(refocus)))
    }
    const inData = rows.filter((row) => row.getRootNode() === this.renderRoot)
    if (inData.length) this.items = removeNodes(this.items, new Set(inData.map((row) => row.value)))
    this.#forget(items)
    this.#announce(this.msg.t('movedOut', rows[0].resolvedLabel))
    return true
  }

  /**
   * Whether a node is the drag handle of one of this tree's rows, drawn in the row's shadow root: not an app's element
   * with that part, nor a row of a tree nested in a row.
   */
  #isRowGrip(node: EventTarget): boolean {
    if (!(node instanceof Element) || !node.part.contains('drag-handle')) return false
    const row = (node.getRootNode() as ShadowRoot).host
    return row instanceof TreeItem && this.allItems.includes(row)
  }

  /** Drops nodes that left the tree, with their subtrees, from the selection and the expanded rows. */
  #forget(nodes: TreeNode[]) {
    const gone = new Set<string>()
    const walk = (list: TreeNode[]) => {
      for (const node of list) {
        gone.add(node.value)
        if (node.children) walk(node.children)
      }
    }
    walk(nodes)
    if (this.expandedItems.some((value) => gone.has(value))) this.expandedItems = this.expandedItems.filter((value) => !gone.has(value))
    if (this.value.some((value) => gone.has(value))) this.#commitSelection(this.value.filter((value) => !gone.has(value)))
  }

  /** Reads text out through the live region the reorder module adds (a tree with a `drag-kind` is `reorderable`). */
  #announce(text: string) {
    let live = this.renderRoot.querySelector('.live')
    if (!live) {
      // Before the reorder module has added its region (a move from code in the same task): this one, which it reuses.
      live = document.createElement('div')
      live.className = 'live'
      live.setAttribute('aria-live', 'polite')
      this.renderRoot.append(live)
    }
    // Cleared first so the same sentence twice in a row is still read out.
    live.textContent = ''
    requestAnimationFrame(() => (live.textContent = text))
  }

  /** A row's drag handle: the browser carries the node, as JSON under the `drag-kind` and a line of text. */
  #handleHandleDragStart = (event: DragEvent) => {
    const path = event.composedPath()
    const fromHandle = path.some((node) => this.#isRowGrip(node))
    if (!fromHandle || !event.dataTransfer) return
    // A pointer or keyboard move already under way keeps the row: the browser's drag would carry it a second time.
    if (this.#reorder?.busy()) {
      event.preventDefault()
      return
    }
    const item = path.find((node): node is TreeItem => node instanceof TreeItem)
    const drag = item ? this.#dragOutOf(item) : null
    if (!drag || !item) {
      event.preventDefault()
      return
    }
    try {
      writeItemPayload(event.dataTransfer, drag.kind, drag.items)
    } catch {
      // A node that cannot be written as JSON (a cycle, a BigInt) does not leave by the browser's drag.
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'copyMove'
    const row = item.renderRoot.querySelector('.row')
    if (row) {
      const box = row.getBoundingClientRect()
      event.dataTransfer.setDragImage(row, event.clientX - box.left, event.clientY - box.top)
    }
    const carried = { item, drag }
    this.#nativeDrag = carried
    // A `dragend` that never reached the tree (its row left the page): the drag is finished all the same.
    startNativeItemDrag(event, drag, () => {
      if (this.#nativeDrag === carried) this.#handleHandleDragEnd()
    })
  }

  #handleHandleDragEnd = () => {
    const carried = this.#nativeDrag
    if (!carried) return
    this.#nativeDrag = undefined
    endItemDrag(carried.drag)
    // Only a c2n zone that took the row moves it, and it says so in `drag.target`; anywhere else (a text field, another
    // window) took a copy: `dropEffect` cannot tell the two apart, and WebKit reports `none` here either way.
    // A tree made read-only during the drag keeps its rows: the move becomes a copy.
    if (carried.drag.target && this.reorderable && !this.disabled) this.#moveOut(carried.drag, [carried.item], carried.drag.target)
  }

  /** Where nodes dropped at a point land: into the row's middle, before its top edge, after its bottom edge. */
  #dropPlace(y: number): { parent: TreeItem | null; before: TreeItem | null } {
    const parentOf = (row: TreeItem): TreeItem | null => {
      const parent = row.parentElement?.closest('c2-tree-item, c2-tree')
      return parent instanceof TreeItem ? parent : null
    }
    const nextOf = (row: TreeItem): TreeItem | null => {
      const parent = parentOf(row)
      const siblings = parent ? parent.childItems : this.rootItems
      return siblings[siblings.indexOf(row) + 1] ?? null
    }
    const rows = this.visibleItems
    const boxOf = (row: TreeItem) => (row.renderRoot.querySelector('.row') ?? row).getBoundingClientRect()
    // A point between two rows (a row gap, the tree's padding) counts as the nearer row's edge, so the drop stays at
    // that depth instead of falling to the end of the root.
    let nearest: { row: TreeItem; distance: number } | undefined
    for (const row of rows) {
      const box = boxOf(row)
      const distance = y < box.top ? box.top - y : y >= box.bottom ? y - box.bottom + 1 : 0
      if (!nearest || distance < nearest.distance) nearest = { row, distance }
    }
    const last = rows[rows.length - 1]
    // Below the last row is the end of the root; anywhere above it belongs to the nearest row.
    if (nearest && last && y < boxOf(last).bottom) {
      const { row } = nearest
      const box = boxOf(row)
      const at = Math.min(Math.max((y - box.top) / (box.height || 1), 0), 1)
      // A branch whose children have not loaded yet cannot take more: they would be lost when it loads.
      const nestable = !row.disabled && !row.loading && !(row.hasChildren && row.childItems.length === 0)
      if (at < 0.25) return { parent: parentOf(row), before: row }
      // The bottom edge of an open branch sits right above its first child: the nodes go there, at the top of it.
      if (at > 0.75 && nestable && row.expanded && row.childItems.length > 0) return { parent: row, before: row.childItems[0] }
      if (at > 0.75 || !nestable) return { parent: parentOf(row), before: nextOf(row) }
      return { parent: row, before: null }
    }
    return { parent: null, before: null }
  }

  /** Adds the nodes of an item payload dropped on the tree at the place under the pointer; returns how many it took. */
  #receiveDrop({ kind, items: dropped, point }: DropZoneItems): number {
    // Without a point (a keyboard move from another tree) the nodes go to the end of the root.
    const { parent, before } = point ? this.#dropPlace(point.y) : { parent: null, before: null }
    const siblings = parent ? parent.childItems : this.rootItems
    const index = before ? Math.max(0, siblings.indexOf(before)) : siblings.length
    const values = new Set<string>()
    const walk = (rows: TreeItem[]) => {
      for (const row of rows) {
        values.add(row.value)
        walk(row.childItems)
      }
    }
    walk(this.rootItems)
    const items: TreeNode[] = []
    const refused: unknown[] = []
    // Every value in a dropped node, its children included: one the tree already holds would make two rows answer to it.
    const valuesOf = (node: unknown, into: string[]): boolean => {
      const value = node && typeof node === 'object' ? (node as TreeNode).value : undefined
      if (typeof value !== 'string' || !value) return false
      // The payload may come from another window: a node of the wrong shape is refused, not read.
      const { label, children } = node as { label?: unknown; children?: unknown }
      if ((label !== undefined && typeof label !== 'string') || (children !== undefined && !Array.isArray(children))) return false
      into.push(value)
      return ((children as unknown[] | undefined) ?? []).every((child) => valuesOf(child, into))
    }
    // `max-depth` holds for drops as for the tree's own moves: the level they land at plus their subtree's height.
    const level = parent ? parent.level + 1 : 0
    const heightOf = (node: TreeNode): number => Math.max(0, ...(node.children ?? []).map((child) => heightOf(child) + 1))
    const tooDeep = (node: unknown) => this.maxDepth != null && level + heightOf(node as TreeNode) > this.maxDepth
    for (const entry of dropped) {
      const own: string[] = []
      let readable: boolean
      try {
        readable = valuesOf(entry, own) && !tooDeep(entry)
      } catch {
        // Nested past what the stack can walk: not a tree anyone drew.
        readable = false
      }
      if (!readable || own.some((value) => values.has(value)) || new Set(own).size !== own.length) {
        refused.push(entry)
        continue
      }
      for (const value of own) values.add(value)
      items.push(entry as TreeNode)
    }
    if (!items.length) return 0
    const reference = parent ?? before ?? this.rootItems[this.rootItems.length - 1]
    const inData = reference ? reference.getRootNode() === this.renderRoot : !this.#hasAuthoredRows()
    const parentElement = parent ?? this
    // A row from data sits in this shadow root; one from markup may be wrapped (an island, a layout `div`): `before` is
    // the wrapper that is a child of `parentElement`, so `parentElement.insertBefore(row, before)` works.
    const outer = (row: TreeItem): Element => {
      if (inData) return row
      let node: Element = row
      while (node.parentElement && node.parentElement !== parentElement) node = node.parentElement
      return node.parentElement === parentElement ? node : row
    }
    const detail: TreeItemDropEventDetail = {
      kind,
      items,
      refused,
      parent: parent?.node ?? null,
      index,
      parentElement,
      before: before ? outer(before) : null,
    }
    const read = trackRead(detail, 'items')
    if (!this.dispatchEvent(new CustomEvent<TreeItemDropEventDetail>('item-drop', { detail, cancelable: true }))) return 0
    // Among rows written in markup the tree adds none itself: a drop whose items nobody read added nothing, and a source
    // with a `drag-kind` must not let them go.
    if (!inData && !read()) {
      if (!this.#warnedUnreadDrop)
        console.warn('c2-tree: a drop among rows written in markup added nothing, because no `item-drop` listener read `detail.items` to add them.')
      this.#warnedUnreadDrop = true
      return 0
    }
    if (inData) this.items = insertNodes(this.items, parent?.value ?? null, index, items)
    // The new rows show under their parent.
    if (parent && !parent.expanded) void this.updateComplete.then(() => this.expand(parent.value))
    return items.length
  }

  // The hydrating render matched the server's, which drew no empty state; the client draws it once that has completed.
  readonly #hydration = new SlotReplayController(this, () => this.requestUpdate())

  /** Whether the author wrote rows in markup: a default-slot child, not slotted content (`empty`) or a style or script. */
  #hasAuthoredRows(): boolean {
    // A server render has no light DOM to look at (the SSR shim gives the host no `children`).
    return Array.from(this.children ?? []).some((child) => !child.hasAttribute('slot') && !['style', 'script', 'template'].includes(child.localName))
  }

  override render() {
    // A server render cannot see the light DOM, so it draws no empty state: hydration would keep it under authored rows.
    const empty = !isServer && !this.#hydration.hydrating && this.items.length === 0 && !this.#hasAuthoredRows()
    return html`
      <div
        class=${this.#dropZone.over ? (this.#dropZone.acceptable ? 'c2-tree drop-target' : 'c2-tree drop-refused') : 'c2-tree'}
        part="tree"
        @dragenter=${this.#dropZone.handleDragEnter}
        @dragover=${this.#dropZone.handleDragOver}
        @dragleave=${this.#dropZone.handleDragLeave}
        @drop=${this.#dropZone.handleDrop}
        @dragstart=${this.#handleHandleDragStart}
        @dragend=${this.#handleHandleDragEnd}
        @click=${this.#handleClick}
        @keydown=${this.#handleKeydown}
        @c2-tree-item-toggle=${this.#handleToggle}
        @c2-tree-item-check=${this.#handleCheck}
        @c2-tree-item-change=${this.#handleItemChange}
      >
        ${repeat(
          this.items,
          (node) => node.value,
          (node) => this.#renderNode(node, 0),
        )}
        <slot @slotchange=${this.#handleItemChange}></slot>
        ${empty ? html`<div class="empty" tabindex="-1"><slot name="empty">${this.msg.t('empty')}</slot></div>` : nothing}
      </div>
      <div class="drop-status" role="status" aria-live="polite" aria-atomic="true">${this.#dropZone.announcement}</div>
    `
  }
}

/**
 * Unwraps the single wrapper element an Astro island puts around a row in the docs site, so the walk sees the
 * row either way. Returns nothing for anything that is not a row.
 */
function unwrap(element: Element): TreeItem[] {
  if (element instanceof TreeItem) return [element]
  const child = element.firstElementChild
  return child instanceof TreeItem ? [child] : []
}

/** Distance past the tree's edge, in pixels, that still counts as the tree for its own drag. */
const EDGE_MARGIN = 40

/** `items` without the nodes whose value is in `values`, at any depth; untouched branches are kept. */
function removeNodes(items: TreeNode[], values: Set<string>): TreeNode[] {
  let changed = false
  const next: TreeNode[] = []
  for (const node of items) {
    if (values.has(node.value)) {
      changed = true
      continue
    }
    const children = node.children ? removeNodes(node.children, values) : undefined
    if (children !== node.children) {
      changed = true
      next.push(children!.length === 0 && node.hasChildren ? { ...node, children, hasChildren: false } : { ...node, children })
    } else next.push(node)
  }
  return changed ? next : items
}

/** `items` with `nodes` inserted under `parent` (`null` for the root) at `index`; untouched branches are kept. */
function insertNodes(items: TreeNode[], parent: string | null, index: number, nodes: TreeNode[]): TreeNode[] {
  if (parent === null) return [...items.slice(0, index), ...nodes, ...items.slice(index)]
  const find = (list: TreeNode[]): TreeNode | undefined => {
    for (const node of list) {
      if (node.value === parent) return node
      const found = node.children && find(node.children)
      if (found) return found
    }
    return undefined
  }
  const children = find(items)?.children ?? []
  return replaceChildren(items, parent, [...children.slice(0, index), ...nodes, ...children.slice(index)])
}

/** Rebuilds only the path down to `value`, leaving every untouched branch identical. */
function replaceChildren(items: TreeNode[], value: string, children: TreeNode[]): TreeNode[] {
  return items.map((node) => {
    if (node.value === value) return { ...node, children }
    if (!node.children) return node
    const next = replaceChildren(node.children, value, children)
    return next.every((child, index) => child === node.children![index]) ? node : { ...node, children: next }
  })
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-tree': Tree
  }
}
