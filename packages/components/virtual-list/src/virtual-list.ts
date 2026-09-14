import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { property, query, state } from 'lit/decorators.js'
import { customElement } from '@c2n/core/element-helper.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import styles from './virtual-list.scss?inline'
import { arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { defaultCompare, getFieldValue, sortEntryConverter, type SortEntry } from '@c2n/core/data-helper.js'
import { VirtualScrollController } from '@c2n/core/controllers/virtual-scroll.js'
import type {
  VirtualListDataSource,
  VirtualListItemContext,
  VirtualListItemEventDetail,
  VirtualListItemRenderer,
  VirtualListMatcher,
  VirtualListSearchChangeEventDetail,
  VirtualListSelectionChangeEventDetail,
  VirtualListSelectionMode,
  VirtualListVirtualMode,
} from './virtual-list-types.js'

import '@c2n/list-item'
import '@c2n/spinner'
import '@c2n/text-field'
import type { TextField } from '@c2n/text-field'

/** How long a typed run is treated as one typeahead query, matching `c2-list`. */
const TYPEAHEAD_WINDOW = 600

/** Fields tried in order when no `label-field` is given, so a list of plain objects renders without configuration. */
const IMPLICIT_LABEL_FIELDS = ['label', 'name', 'title', 'value']

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Events fired by {@link VirtualList}, keyed for `addEventListener`. */
export interface VirtualListEventMap {
  'selection-change': CustomEvent<VirtualListSelectionChangeEventDetail>
  'item-click': CustomEvent<VirtualListItemEventDetail>
  'search-change': CustomEvent<VirtualListSearchChangeEventDetail>
}

export interface VirtualList {
  addEventListener: TypedAddEventListener<VirtualList, VirtualListEventMap>
  removeEventListener: TypedRemoveEventListener<VirtualList, VirtualListEventMap>
}

/**
 * A long list that only renders what you can see. It windows `items` to the visible range plus an overscan margin with
 * the same `VirtualScrollController` the data grid uses, so 50 000 rows cost the same DOM as 20, and it renders every
 * visible row as a real `c2-list-item` — the same markup, slots, selection styling and theme as `c2-list`.
 *
 * ```html
 * <c2-virtual-list
 *   style="height: 320px"
 *   searchable
 *   highlight
 *   selection="single"
 *   item-key="id"
 *   label-field="name"
 *   description-field="team"
 * ></c2-virtual-list>
 * <script type="module">
 *   document.querySelector('c2-virtual-list').items = people
 * </script>
 * ```
 *
 * **Give the host a height** (or `--c2-virtual-list--max-height`) — the list scrolls inside it.
 *
 * **Uniform item height.** Windowing needs every row to be the same height. The height comes from
 * `--c2-virtual-list__item--height` and is re-measured from the first rendered row, so a theme change is picked up;
 * `item-height` is only the estimate used for the first paint. A list with two-line rows must raise the variable.
 *
 * A run of adjacent selected rows squares the corners between them, so it reads as one block rather than a stack of
 * separate pills — the same `joined-before` / `joined-after` contract `c2-list` uses.
 *
 * **Search.** `searchable` adds a search field above the list; `search` is also a plain property, so an external input
 * can drive it instead. Matching runs over `search-fields` (falling back to `label-field` and `description-field`, then
 * to every string value of the item), and `matcher` replaces that logic outright. `highlight` wraps the matched text in
 * `<mark>`. With a `dataSource` the query is sent to the server instead and the local matcher is never used.
 *
 * Set `aria-label` on the host to name the list; it is mirrored onto the inner `role="listbox"`, which falls back to
 * `Items`.
 *
 * @tag c2-virtual-list
 *
 * @slot search - Replaces the built-in search field. Set `search` yourself from its events.
 * @slot toolbar - Extra controls beside the search field, for a filter chip or a count. Hidden when empty.
 * @slot footer - Bar below the list, for a total or a pager. Hidden when empty.
 * @slot empty - Replaces the built-in "no items" message.
 * @slot no-results - Replaces the built-in "no matches" message shown while a search is active.
 * @slot loading - Replaces the built-in spinner shown while the first items load.
 * @slot error - Replaces the built-in message shown when `error` is set.
 *
 * @internalcomponent c2-list-item
 * @internalcomponent c2-text-field
 * @internalcomponent c2-spinner
 *
 * @event {CustomEvent<VirtualListSelectionChangeEventDetail>} selection-change - Fired after the user changes the selection. `detail.value` is the array of selected keys, `detail.items` the matching items. Does not bubble: several components fire `selection-change`, so a listener belongs on the element itself rather than on an ancestor.
 * @event {CustomEvent<VirtualListItemEventDetail>} item-click - Fired when a row is clicked, before the selection is applied.
 * @event {CustomEvent<VirtualListSearchChangeEventDetail>} search-change - Fired after the query settles, with the number of items that match.
 *
 * @cssproperty {color} [--c2-virtual-list--background=#ffffff]
 * @cssproperty {color} [--c2-virtual-list--color=#18181b]
 * @cssproperty {font-size} [--c2-virtual-list--font-size=14px]
 * @cssproperty {pixel} [--c2-virtual-list--max-height=none] - Caps the height when the host is not sized itself; the list scrolls.
 *
 * @cssproperty {border} --c2-virtual-list--border-top
 * @cssproperty {border} --c2-virtual-list--border-right
 * @cssproperty {border} --c2-virtual-list--border-bottom
 * @cssproperty {border} --c2-virtual-list--border-left
 *
 * @cssproperty {border-radius} [--c2-virtual-list--border-top-left-radius=8px]
 * @cssproperty {border-radius} [--c2-virtual-list--border-top-right-radius=8px]
 * @cssproperty {border-radius} [--c2-virtual-list--border-bottom-left-radius=8px]
 * @cssproperty {border-radius} [--c2-virtual-list--border-bottom-right-radius=8px]
 *
 * @cssproperty {box-shadow} --c2-virtual-list--box-shadow
 *
 * @cssproperty {color} [--c2-virtual-list__search--background=transparent]
 * @cssproperty {padding} [--c2-virtual-list__search--padding=8px]
 * @cssproperty {pixel} [--c2-virtual-list__search--gap=8px]
 * @cssproperty {border} [--c2-virtual-list__search--border-bottom=1px solid #e4e4e7]
 *
 * @cssproperty {color} [--c2-virtual-list__search-field--background=#ffffff] - Themes the built-in `c2-text-field`.
 * @cssproperty {border} [--c2-virtual-list__search-field--border=1px solid #e4e4e7]
 * @cssproperty {border-radius} [--c2-virtual-list__search-field--border-radius=6px]
 * @cssproperty {pixel} [--c2-virtual-list__search-field--min-height=32px]
 *
 * @cssproperty {pixel} [--c2-virtual-list__viewport--padding=4px]
 *
 * @cssproperty {pixel} [--c2-virtual-list__item--height=36px] - Row height; windowing needs it uniform.
 *
 *
 * @cssproperty {color} [--c2-virtual-list__highlight--background=#fef08a]
 * @cssproperty {color} [--c2-virtual-list__highlight--color=inherit]
 * @cssproperty {font-weight} [--c2-virtual-list__highlight--font-weight=600]
 * @cssproperty {border-radius} [--c2-virtual-list__highlight--border-radius=4px]
 *
 * @cssproperty {color} [--c2-virtual-list__skeleton--background=#f4f4f5] - Placeholder shown in rows whose `dataSource` block is still loading.
 * @cssproperty {border-radius} [--c2-virtual-list__skeleton--border-radius=4px]
 *
 * @cssproperty {color} [--c2-virtual-list__state--color=#71717a] - Colour of the empty, no-results and loading messages.
 * @cssproperty {padding} [--c2-virtual-list__state--padding=32px 12px]
 * @cssproperty {font-size} [--c2-virtual-list__state--font-size=14px]
 * @cssproperty {color} [--c2-virtual-list__state__error--color=rgb(211, 21, 16)]
 *
 * @cssproperty {color} [--c2-virtual-list__footer--background=transparent]
 * @cssproperty {padding} [--c2-virtual-list__footer--padding=8px 12px]
 * @cssproperty {border} [--c2-virtual-list__footer--border-top=1px solid #e4e4e7]
 */
@customElement('c2-virtual-list')
export class VirtualList extends LitElement {
  static override styles = unsafeCSS(styles)

  @query('.viewport') private viewport!: HTMLElement | null
  @query('.search-field') private searchFieldElement!: TextField | null

  /** The items to display. An array in the property, JSON in the attribute. */
  @property({ converter: jsonPropertyConverter }) items: unknown[] = []

  /** Field used as the identity of an item, for selection and typeahead. Falls back to the item index. */
  @property({ type: String, attribute: 'item-key' }) itemKey = ''

  /** Field read for a row's primary text. Defaults to `label`, `name`, `title` or `value`, then the item itself. */
  @property({ type: String, attribute: 'label-field' }) labelField = ''

  /** Field read for a row's second, muted line. */
  @property({ type: String, attribute: 'description-field' }) descriptionField = ''

  /** Field whose truthy value makes a row unselectable. */
  @property({ type: String, attribute: 'disabled-field' }) disabledField = ''

  /** Renders a row's content, replacing the label/description pair. */
  @property({ attribute: false }) renderItem?: VirtualListItemRenderer

  /** Replaces the built-in field matching while searching. */
  @property({ attribute: false }) matcher?: VirtualListMatcher

  /** Client-side sort comparator for the `sort` field's values. */
  @property({ attribute: false }) comparator?: (a: unknown, b: unknown) => number

  /** Lazy item source used instead of `items`; the list requests one block at a time as rows scroll into view. */
  @property({ attribute: false }) dataSource?: VirtualListDataSource

  /** Shows the built-in search field above the list. */
  @property({ type: Boolean }) searchable = false

  /** The query the list is filtered by. Set by the built-in field, or from outside. */
  @property({ type: String, reflect: true }) search = ''

  /** Fields the query is matched against: an array in the property, `;`-separated in the attribute. */
  @property({ converter: arrayPropertyConverter, attribute: 'search-fields' }) searchFields: string[] = []

  /** Queries shorter than this are ignored, so the list is not filtered on the first keystroke. */
  @property({ type: Number, attribute: 'min-search-length' }) minSearchLength = 1

  /** Milliseconds the built-in field waits after the last keystroke before the query is applied. */
  @property({ type: Number, attribute: 'search-debounce' }) searchDebounce = 200

  /** Placeholder of the built-in search field. */
  @property({ type: String, attribute: 'search-placeholder' }) searchPlaceholder = 'Search'

  /** Wraps the matched part of a row's text in `<mark part="highlight">`. */
  @property({ type: Boolean }) highlight = false

  /** The sort: `SortEntry` in the property, `field:asc` in the `sort` attribute. */
  @property({ converter: sortEntryConverter, attribute: 'sort', reflect: true }) sort?: SortEntry

  /** `single` selects one row at a time, `multiple` supports ⌘/ctrl-click and shift-click ranges. */
  @property({ type: String }) selection: VirtualListSelectionMode = 'none'

  /** Keys of the selected items: an array in the property, `;`-separated in the attribute. */
  @property({ converter: arrayPropertyConverter, reflect: true }) value: string[] = []

  /** `auto` windows past `virtual-threshold` items; `always` and `never` force it. */
  @property({ type: String }) virtual: VirtualListVirtualMode = 'auto'

  /** Item height in pixels used before the first row has been measured. */
  @property({ type: Number, attribute: 'item-height' }) itemHeight = 36

  /** Rows rendered above and below the viewport while windowing. */
  @property({ type: Number }) overscan = 6

  /** Item count past which `virtual="auto"` starts windowing. */
  @property({ type: Number, attribute: 'virtual-threshold' }) virtualThreshold = 100

  /** Number of items the list asks a `dataSource` for at a time. */
  @property({ type: Number, attribute: 'block-size' }) blockSize = 100

  /** Shows the loading state; implied while a `dataSource` resolves its first block. */
  @property({ type: Boolean, reflect: true }) loading = false

  /** Shows the error state with this message. */
  @property({ type: String }) error = ''

  /** Message shown when there are no items at all. */
  @property({ type: String, attribute: 'empty-message' }) emptyMessage = 'No items'

  /** Message shown when a search is active and nothing matches. */
  @property({ type: String, attribute: 'no-results-message' }) noResultsMessage = 'No matches'

  @state() private hasToolbar = false
  @state() private hasFooter = false
  @state() private remoteTotal = -1
  @state() private focusedIndex = 0

  /** The items on show: `items` after search and sort. Empty while a `dataSource` is in charge. */
  #visibleItems: unknown[] = []
  #blocks = new Map<number, unknown[]>()
  #pendingBlocks = new Set<number>()
  #measuredItemHeight = 0
  /** `value` as a set, rebuilt only when the array identity changes, so a big selection costs one lookup per row. */
  #selectedKeysOf: string[] | undefined
  #selectedKeysSet = new Set<string>()
  #selectionAnchor = -1
  #requestToken = 0
  #pendingFocus = false
  #pendingScrollTop = false
  #searchTimer?: ReturnType<typeof setTimeout>
  #typeahead = ''
  #typeaheadTimer?: ReturnType<typeof setTimeout>

  #virtualizer = new VirtualScrollController(this, {
    scrollElement: () => this.viewport,
    itemCount: () => this.itemCount,
    itemHeight: () => this.#itemHeightPx,
    overscan: () => this.overscan,
    enabled: () => this.isVirtualized,
  })

  /** Number of items on show right now: the filtered `items`, or the `dataSource` total for the current query. */
  get itemCount(): number {
    return this.dataSource ? Math.max(0, this.remoteTotal) : this.#visibleItems.length
  }

  /** Whether the rows are currently windowed. */
  get isVirtualized(): boolean {
    if (this.virtual === 'never') return false
    if (this.virtual === 'always') return true
    return this.itemCount > this.virtualThreshold
  }

  /** Whether a query is currently narrowing the list. */
  get searching(): boolean {
    return this.search.trim().length >= this.minSearchLength
  }

  get #itemHeightPx(): number {
    return this.#measuredItemHeight || this.itemHeight
  }

  get #selectedKeys(): Set<string> {
    if (this.#selectedKeysOf !== this.value) {
      this.#selectedKeysOf = this.value
      this.#selectedKeysSet = new Set(this.value)
    }
    return this.#selectedKeysSet
  }

  get #isBootstrapping(): boolean {
    return Boolean(this.dataSource) && this.remoteTotal < 0 && !this.error
  }

  /** The items currently selected. Only the loaded ones when a `dataSource` is used. */
  getSelectedItems(): unknown[] {
    const keys = this.#selectedKeys
    const selected: unknown[] = []
    for (let index = 0; index < this.itemCount; index++) {
      const item = this.#itemAt(index)
      if (item !== undefined && keys.has(this.#keyAt(index, item))) selected.push(item)
    }
    return selected
  }

  /** Selects every loaded item. Only meaningful with `selection="multiple"`. */
  selectAll() {
    if (this.selection !== 'multiple') return
    const keys: string[] = []
    for (let index = 0; index < this.itemCount; index++) {
      const item = this.#itemAt(index)
      if (item !== undefined) keys.push(this.#keyAt(index, item))
    }
    this.#commitSelection(keys)
  }

  clearSelection() {
    this.#commitSelection([])
  }

  /** Scrolls the item at `index` into view, aligning it to the closest edge. */
  scrollToIndex(index: number) {
    this.#virtualizer.scrollToIndex(index)
  }

  /** Moves the roving focus to `index`, scrolling it into view first. */
  focusItem(index: number) {
    this.#moveFocus(index)
  }

  /**
   * Re-reads the data. With a `dataSource` that drops every cached block and asks for the visible one again;
   * otherwise it re-runs the search and the sort — which is what an `items` array mutated in place needs, since
   * Lit only sees a new array.
   */
  refresh() {
    if (this.dataSource) {
      this.#resetRemote()
      return
    }
    this.#rebuildVisibleItems()
    this.requestUpdate()
  }

  override disconnectedCallback() {
    super.disconnectedCallback()
    clearTimeout(this.#searchTimer)
    clearTimeout(this.#typeaheadTimer)
  }

  protected override willUpdate(changed: PropertyValues<this>) {
    // A string slips in through `@astrojs/lit`, which assigns island props directly and so skips the converter.
    if (typeof this.value === 'string') this.value = arrayPropertyConverter.fromAttribute(this.value)
    if (typeof this.searchFields === 'string') this.searchFields = arrayPropertyConverter.fromAttribute(this.searchFields)

    const queryChanged = changed.has('search') || changed.has('minSearchLength')
    const sortChanged = changed.has('sort') || changed.has('comparator')

    if (this.dataSource) {
      // The server owns filtering and ordering, so a new query or sort makes every cached block wrong.
      if (queryChanged || sortChanged || changed.has('dataSource')) this.#resetRemote()
    } else if (
      queryChanged ||
      sortChanged ||
      changed.has('items') ||
      changed.has('searchFields') ||
      changed.has('matcher') ||
      changed.has('labelField') ||
      changed.has('descriptionField')
    ) {
      this.#rebuildVisibleItems()
      if (queryChanged || sortChanged) this.#pendingScrollTop = true
    }

    if (queryChanged && changed.get('search') !== undefined) {
      this.dispatchEvent(
        new CustomEvent<VirtualListSearchChangeEventDetail>('search-change', {
          bubbles: true,
          composed: true,
          detail: { search: this.search, matchCount: this.dataSource ? this.remoteTotal : this.#visibleItems.length },
        }),
      )
    }
  }

  protected override updated(changed: PropertyValues) {
    super.updated(changed)
    if (this.#pendingScrollTop) {
      this.#pendingScrollTop = false
      if (this.viewport) this.viewport.scrollTop = 0
    }
    this.#measureItemHeight()
    if (this.#pendingFocus) {
      const row = this.renderRoot.querySelector<HTMLElement>('.item[tabindex="0"]')
      // The row may not exist yet: `scrollToIndex` only moves `scrollTop`, and the window follows on the scroll event.
      if (row) {
        this.#pendingFocus = false
        row.focus()
      }
    } else {
      this.#syncFocusToWindow()
    }
    if (this.dataSource) this.#ensureBlocks()
  }

  override render() {
    const range = this.#virtualizer.range
    const count = this.itemCount
    const hasSearchBar = this.searchable || this.hasToolbar

    return html`
      <div class="search" part="search" ?hidden=${!hasSearchBar}>
        ${this.searchable ? html`<slot name="search">${this.#renderSearchField()}</slot>` : nothing}
        <slot name="toolbar" @slotchange=${(event: Event) => (this.hasToolbar = this.#slotHasContent(event))}></slot>
      </div>
      <div class="viewport" part="viewport">
        <div
          class="items"
          part="items"
          role="listbox"
          aria-multiselectable=${this.selection === 'multiple' ? 'true' : nothing}
          aria-busy=${this.loading || this.#isBootstrapping ? 'true' : 'false'}
          aria-label=${this.ariaLabel ?? 'Items'}
          @click=${this.#handleClick}
          @keydown=${this.#handleKeyDown}
        >
          ${range.paddingTop > 0 ? html`<div class="spacer" role="presentation" style="height:${range.paddingTop}px"></div>` : nothing}
          ${this.#renderRows(range.start, Math.min(range.end, count))}
          ${range.paddingBottom > 0 ? html`<div class="spacer" role="presentation" style="height:${range.paddingBottom}px"></div>` : nothing}
        </div>
        ${this.#renderState(count)}
      </div>
      <div class="footer" part="footer" ?hidden=${!this.hasFooter}>
        <slot name="footer" @slotchange=${(event: Event) => (this.hasFooter = this.#slotHasContent(event))}></slot>
      </div>
    `
  }

  #renderSearchField() {
    return html`
      <c2-text-field
        class="search-field"
        type="search"
        clearable
        .value=${this.search}
        placeholder=${this.searchPlaceholder}
        aria-label=${this.searchPlaceholder}
        @input=${this.#handleSearchInput}
        @clear=${this.#handleSearchClear}
        @keydown=${this.#handleSearchKeyDown}
      ></c2-text-field>
    `
  }

  #renderState(count: number) {
    if (this.error) {
      return html`<div class="state state--error" part="state"><slot name="error">${this.error}</slot></div>`
    }
    if (count > 0) return nothing
    if (this.loading || this.#isBootstrapping) {
      return html`<div class="state" part="state">
        <slot name="loading"><c2-spinner></c2-spinner></slot>
      </div>`
    }
    if (this.searching) {
      return html`<div class="state" part="state"><slot name="no-results">${this.noResultsMessage}</slot></div>`
    }
    return html`<div class="state" part="state"><slot name="empty">${this.emptyMessage}</slot></div>`
  }

  #renderRows(start: number, end: number): unknown {
    const rows: TemplateResult[] = []
    for (let index = start; index < end; index++) rows.push(this.#renderRow(index))
    return rows
  }

  #renderRow(index: number): TemplateResult {
    const item = this.#itemAt(index)
    // A `dataSource` block that has not arrived yet still owes a row, or the list would jump as it loads.
    if (item === undefined) {
      return html`
        <c2-list-item class="item" part="item" .applyContext=${true} .disabled=${true} aria-busy="true" data-index=${index}>
          <span class="skeleton" part="skeleton"></span>
        </c2-list-item>
      `
    }

    const key = this.#keyAt(index, item)
    const selected = this.selection !== 'none' && this.#selectedKeys.has(key)
    // Neighbours are read from the data, not the DOM: at the edge of the window the next row is not rendered yet, but
    // it is still the one the run continues into.
    const joinedBefore = selected && this.#isSelectedAt(index - 1)
    const joinedAfter = selected && this.#isSelectedAt(index + 1)

    return html`
      <c2-list-item
        class="item"
        part=${`item${selected ? ' item-selected' : ''}`}
        data-index=${index}
        ?joined-before=${joinedBefore}
        ?joined-after=${joinedAfter}
        .applyContext=${true}
        .value=${key}
        .data=${item}
        .disabled=${this.#isDisabled(item)}
        .selected=${selected}
        tabindex=${index === this.focusedIndex ? 0 : -1}
        aria-posinset=${index + 1}
        aria-setsize=${this.itemCount}
        >${this.#renderContent(item, index)}</c2-list-item
      >
    `
  }

  #renderContent(item: unknown, index: number): unknown {
    if (this.renderItem) {
      const context: VirtualListItemContext = { item, index, search: this.search }
      return this.renderItem(context)
    }
    const description = this.descriptionField ? this.#textOf(getFieldValue(item, this.descriptionField)) : ''
    return html`${this.#decorate(this.#labelOf(item))}${description ? html`<span slot="description">${this.#decorate(description)}</span>` : nothing}`
  }

  /** Wraps every occurrence of the query in `<mark>`, so a match is visible without the reader hunting for it. */
  #decorate(text: string): unknown {
    if (!this.highlight || !this.searching || !text) return text
    const query = this.search.trim()
    const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'ig'))
    if (parts.length === 1) return text
    return parts.map((part, index) => (index % 2 === 1 ? html`<mark part="highlight">${part}</mark>` : part))
  }

  // --- data pipeline -------------------------------------------------------------------------------------------

  /** Search, then sort — the order a reader expects: they filter first and only then ask how it is ordered. */
  #rebuildVisibleItems() {
    const source = Array.isArray(this.items) ? this.items : []
    const next = this.searching ? source.filter((item) => this.#matches(item)) : source.slice()
    this.#visibleItems = this.#applySort(next)
  }

  #matches(item: unknown): boolean {
    const query = this.search.trim().toLowerCase()
    if (this.matcher) return this.matcher(item, query)
    for (const value of this.#searchableValues(item)) {
      if (value.toLowerCase().includes(query)) return true
    }
    return false
  }

  /** The strings a query is tested against: the declared fields, else the labelled ones, else everything scalar. */
  #searchableValues(item: unknown): string[] {
    const fields = this.searchFields.length ? this.searchFields : [this.labelField, this.descriptionField].filter(Boolean)
    if (fields.length) return fields.map((field) => this.#textOf(getFieldValue(item, field)))
    if (item === null || typeof item !== 'object') return [this.#textOf(item)]
    return Object.values(item as Record<string, unknown>)
      .filter((value) => typeof value === 'string' || typeof value === 'number')
      .map((value) => String(value))
  }

  #applySort(items: unknown[]): unknown[] {
    const sort = this.sort
    if (!sort?.field) return items
    const compare = this.comparator ?? defaultCompare
    const direction = sort.direction === 'desc' ? -1 : 1
    return items.sort((a, b) => direction * compare(getFieldValue(a, sort.field), getFieldValue(b, sort.field)))
  }

  #itemAt(index: number): unknown {
    if (!this.dataSource) return this.#visibleItems[index]
    const block = this.#blocks.get(Math.floor(index / this.blockSize))
    return block?.[index % this.blockSize]
  }

  #keyAt(index: number, item: unknown): string {
    if (!this.itemKey) return String(index)
    const key = getFieldValue(item, this.itemKey)
    return key === undefined || key === null ? String(index) : String(key)
  }

  /** Whether the row at `index` is selected — false for one a `dataSource` has not delivered, which cannot be. */
  #isSelectedAt(index: number): boolean {
    if (index < 0 || index >= this.itemCount) return false
    const item = this.#itemAt(index)
    return item !== undefined && this.#selectedKeys.has(this.#keyAt(index, item))
  }

  #isDisabled(item: unknown): boolean {
    return this.disabledField ? Boolean(getFieldValue(item, this.disabledField)) : false
  }

  #textOf(value: unknown): string {
    return value === undefined || value === null ? '' : String(value)
  }

  /** A row's primary text: the declared field, the first conventional one, or the item itself for a list of strings. */
  #labelOf(item: unknown): string {
    if (this.labelField) return this.#textOf(getFieldValue(item, this.labelField))
    if (item === null || typeof item !== 'object') return this.#textOf(item)
    const record = item as Record<string, unknown>
    for (const field of IMPLICIT_LABEL_FIELDS) {
      if (record[field] !== undefined) return this.#textOf(record[field])
    }
    return ''
  }

  // --- remote blocks -------------------------------------------------------------------------------------------

  #resetRemote() {
    this.#blocks.clear()
    this.#pendingBlocks.clear()
    this.#requestToken++
    this.remoteTotal = -1
    this.#pendingScrollTop = true
  }

  /** Asks the source for whatever block the visible window needs and has not got. */
  #ensureBlocks() {
    const source = this.dataSource
    if (!source || this.error) return
    const range = this.#virtualizer.range
    const first = this.remoteTotal < 0 ? 0 : Math.floor(range.start / this.blockSize)
    const last = this.remoteTotal < 0 ? 0 : Math.floor(Math.max(range.start, range.end - 1) / this.blockSize)

    for (let block = first; block <= last; block++) {
      if (this.#blocks.has(block) || this.#pendingBlocks.has(block)) continue
      this.#pendingBlocks.add(block)
      const token = this.#requestToken
      void source
        .getItems({ start: block * this.blockSize, count: this.blockSize, search: this.searching ? this.search.trim() : '', sort: this.sort })
        .then((result) => {
          // A query or sort changed while this was in flight: its rows belong to a list that no longer exists.
          if (token !== this.#requestToken) return
          this.#blocks.set(block, result.items ?? [])
          if (result.total !== undefined) this.remoteTotal = result.total
          else if (this.remoteTotal < 0) this.remoteTotal = (result.items ?? []).length
          this.requestUpdate()
        })
        .catch((reason: unknown) => {
          if (token !== this.#requestToken) return
          this.error = reason instanceof Error ? reason.message : String(reason)
        })
        .finally(() => {
          this.#pendingBlocks.delete(block)
        })
    }
  }

  // --- search --------------------------------------------------------------------------------------------------

  #handleSearchInput = (event: Event) => {
    this.#scheduleSearch((event.target as TextField).value)
  }

  #handleSearchClear = () => {
    clearTimeout(this.#searchTimer)
    this.search = ''
  }

  #handleSearchKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'Enter') return
    if (this.itemCount === 0) return
    event.preventDefault()
    this.#moveFocus(this.focusedIndex)
  }

  #scheduleSearch(next: string) {
    clearTimeout(this.#searchTimer)
    // Debounced so a long list is not re-filtered — or a server not re-queried — on every keystroke.
    this.#searchTimer = setTimeout(
      () => {
        this.search = next
      },
      Math.max(0, this.searchDebounce),
    )
  }

  /** Sends a character typed on the list to the search field, so typing anywhere in the component starts a search. */
  #typeIntoSearchField(character: string) {
    const field = this.searchFieldElement
    if (!field) return
    field.value = `${field.value}${character}`
    field.focus()
    this.#scheduleSearch(field.value)
  }

  /** The `c2-list` behaviour for a list with no search field: jump to the next row whose label starts with the run. */
  #typeaheadTo(character: string) {
    clearTimeout(this.#typeaheadTimer)
    this.#typeahead += character.toLowerCase()
    this.#typeaheadTimer = setTimeout(() => (this.#typeahead = ''), TYPEAHEAD_WINDOW)

    const count = this.itemCount
    // Bounded: a typeahead is a convenience, and scanning a million labels for one would stall the keystroke.
    const scan = Math.min(count, 2000)
    for (let step = 1; step <= scan; step++) {
      const index = (this.focusedIndex + step) % count
      const item = this.#itemAt(index)
      if (item === undefined) continue
      if (this.#labelOf(item).toLowerCase().startsWith(this.#typeahead)) {
        this.#moveFocus(index)
        return
      }
    }
  }

  // --- selection -----------------------------------------------------------------------------------------------

  #handleClick = (event: MouseEvent) => {
    const row = (event.target as Element | null)?.closest?.('c2-list-item')
    if (!(row instanceof HTMLElement) || !row.classList.contains('item')) return
    const index = Number(row.dataset.index)
    if (!Number.isInteger(index)) return
    const item = this.#itemAt(index)
    if (item === undefined || this.#isDisabled(item)) return

    this.focusedIndex = index
    this.#activate(index, item, event.shiftKey, event.metaKey || event.ctrlKey)
  }

  #activate(index: number, item: unknown, range: boolean, additive: boolean) {
    const key = this.#keyAt(index, item)
    this.dispatchEvent(new CustomEvent<VirtualListItemEventDetail>('item-click', { bubbles: true, composed: true, detail: { item, index, key } }))
    if (this.selection === 'none') return

    if (this.selection === 'single') {
      this.#selectionAnchor = index
      this.#commitSelection([key])
      return
    }

    if (range && this.#selectionAnchor >= 0) {
      this.#commitSelection(this.#keysBetween(this.#selectionAnchor, index))
      return
    }

    this.#selectionAnchor = index
    if (additive) this.#commitSelection(this.value.includes(key) ? this.value.filter((entry) => entry !== key) : [...this.value, key])
    else this.#commitSelection([key])
  }

  #keysBetween(from: number, to: number): string[] {
    const [start, end] = from <= to ? [from, to] : [to, from]
    const keys: string[] = []
    for (let index = start; index <= end; index++) {
      const item = this.#itemAt(index)
      if (item !== undefined) keys.push(this.#keyAt(index, item))
    }
    return keys
  }

  #commitSelection(next: string[]) {
    if (next.length === this.value.length && next.every((key, index) => key === this.value[index])) return
    this.value = next
    this.dispatchEvent(
      new CustomEvent<VirtualListSelectionChangeEventDetail>('selection-change', {
        bubbles: false,
        composed: true,
        detail: { value: [...next], items: this.getSelectedItems() },
      }),
    )
  }

  // --- keyboard ------------------------------------------------------------------------------------------------

  #handleKeyDown = (event: KeyboardEvent) => {
    const count = this.itemCount
    if (count === 0) return

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && this.selection === 'multiple') {
      event.preventDefault()
      this.selectAll()
      return
    }

    // Rows per viewport, for PageUp/PageDown; one row of overlap keeps the reader's place.
    const viewportRows = Math.max(1, Math.floor((this.viewport?.clientHeight ?? 0) / this.#itemHeightPx) - 1)
    let index = this.focusedIndex

    switch (event.key) {
      case 'ArrowDown':
        index = Math.min(count - 1, index + 1)
        break
      case 'ArrowUp':
        index = Math.max(0, index - 1)
        break
      case 'Home':
        index = 0
        break
      case 'End':
        index = count - 1
        break
      case 'PageDown':
        index = Math.min(count - 1, index + viewportRows)
        break
      case 'PageUp':
        index = Math.max(0, index - viewportRows)
        break
      case 'Enter':
      case ' ': {
        const item = this.#itemAt(index)
        if (item === undefined || this.#isDisabled(item)) return
        event.preventDefault()
        this.#activate(index, item, event.shiftKey, event.metaKey || event.ctrlKey)
        return
      }
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault()
          if (this.searchable) this.#typeIntoSearchField(event.key)
          else this.#typeaheadTo(event.key)
        }
        return
    }

    event.preventDefault()
    this.#moveFocus(index)
  }

  #moveFocus(index: number) {
    const count = this.itemCount
    if (count === 0) return
    this.focusedIndex = Math.min(Math.max(index, 0), count - 1)
    this.#pendingFocus = true
    this.#virtualizer.scrollToIndex(this.focusedIndex)
  }

  /**
   * Keeps the roving tab stop inside the rendered window. Scrolling far away would otherwise leave no row with
   * `tabindex="0"`, and the list would drop out of the tab order entirely.
   */
  #syncFocusToWindow() {
    const { start, end } = this.#virtualizer.range
    if (end <= start) return
    const clamped = Math.min(Math.max(this.focusedIndex, start), end - 1)
    if (clamped === this.focusedIndex) return
    // Only chase the DOM focus when the list actually had it; otherwise just move the tab stop.
    if (this.shadowRoot?.activeElement) this.#pendingFocus = true
    this.focusedIndex = clamped
  }

  // --- misc ----------------------------------------------------------------------------------------------------

  #measureItemHeight() {
    const row = this.renderRoot.querySelector<HTMLElement>('.item')
    if (!row) return
    const height = row.getBoundingClientRect().height
    // Deliberately unrounded: a fraction of a pixel per row compounds to thousands of pixels over a long list.
    if (height > 0 && Math.abs(height - this.#measuredItemHeight) > 0.01) {
      this.#measuredItemHeight = height
      this.requestUpdate()
    }
  }

  #slotHasContent(event: Event): boolean {
    return (event.target as HTMLSlotElement)
      .assignedNodes({ flatten: true })
      .some((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()))
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-virtual-list': VirtualList
  }
}
