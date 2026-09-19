import { LitElement, html, nothing, unsafeCSS, type PropertyValues } from 'lit'
import { query } from 'lit/decorators.js'
import { repeat } from 'lit/directives/repeat.js'
import { customElement } from '@c2n/core/element-helper.js'
import { isServer } from 'lit-html/is-server.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './tree.scss?inline'
// Registers `c2-tree-item` so a consumer of the tree alone gets the row element too (as `c2-tabs` does for
// `c2-tab`). It is also what lets an MDX `client:only` island render nested rows as plain markup.
import './tree-item'
import { TreeItem } from './tree-item'
import type {
  TreeChildrenLoader,
  TreeExpansionChangeEventDetail,
  TreeItemClickEventDetail,
  TreeItemExpandEventDetail,
  TreeItemLoadErrorEventDetail,
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
 * Only expanded rows render their children slot, which keeps a collapsed subtree out of both layout and the
 * accessibility tree — though the child elements are still created. Reach for virtualization rather than this
 * component once a tree runs to many thousands of rows.
 *
 * ### Keyboard
 *
 * Arrow Up and Down walk the visible rows. Arrow Right expands a collapsed branch, then moves to its first
 * child; Arrow Left collapses an expanded one, then moves to its parent. Home and End jump to the ends, Enter
 * and Space select, `*` expands every sibling of the focused row, and typing a few letters jumps to the
 * matching row. With `selection="multiple"`, Shift extends a range and Ctrl or Cmd toggles a single row.
 *
 * @tag c2-tree
 *
 * @slot - The root `c2-tree-item` rows, when authoring in markup.
 * @slot empty - Shown instead of the rows when the tree holds nothing.
 *
 * @slotcomponent c2-tree-item
 *
 * @csspart tree - The scrolling container holding the rows.
 *
 * @event {CustomEvent<TreeSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself.
 * @event {CustomEvent<TreeExpansionChangeEventDetail>} expansion-change - Fired after a row is expanded or collapsed. Does not bubble.
 * @event {CustomEvent<TreeItemClickEventDetail>} item-click - Fired when a row is clicked, selected or not.
 * @event {CustomEvent<TreeItemExpandEventDetail>} item-expand - Fired when a row expands. Call `preventDefault()` to keep it closed. This is where a consumer authoring in markup appends children for a lazily loaded branch.
 * @event {CustomEvent<TreeItemLoadErrorEventDetail>} item-load-error - Fired when `loadChildren` rejects.
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
 */
@customElement('c2-tree')
export class Tree extends LitElement {
  static override styles = unsafeCSS(styles)

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

  override connectedCallback() {
    super.connectedCallback()
    this.setAttribute('role', 'tree')
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

  override updated(changed: PropertyValues<this>) {
    this.setAttribute('aria-multiselectable', String(this.#multiple))
    if (this.disabled) this.setAttribute('aria-disabled', 'true')
    else this.removeAttribute('aria-disabled')
    if (changed.has('items')) this.#loaded.clear()
    this.#syncItems()
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

  override render() {
    const empty = this.items.length === 0 && this.childElementCount === 0
    return html`
      <div
        class="c2-tree"
        part="tree"
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
        ${empty ? html`<div class="empty"><slot name="empty">No items</slot></div>` : nothing}
      </div>
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
