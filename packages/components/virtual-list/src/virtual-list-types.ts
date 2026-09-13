import type { SortEntry } from '@c2n/core/data-helper.js'

export type { SortDirection, SortEntry } from '@c2n/core/data-helper.js'

export type VirtualListSelectionMode = 'none' | 'single' | 'multiple'
export type VirtualListVirtualMode = 'auto' | 'always' | 'never'

export interface VirtualListItemContext {
  /** The item being rendered. `undefined` while its `dataSource` block is still loading. */
  item: unknown
  /** Index of the item in the list as it is shown — after search and sort. */
  index: number
  /** The query the list is filtered by right now, so a renderer can highlight it itself. */
  search: string
}

/** Returns anything Lit can render: a `TemplateResult`, a string, a number, a node. */
export type VirtualListItemRenderer = (context: VirtualListItemContext) => unknown

/** Decides whether an item survives the current query. Replaces the built-in field matching entirely. */
export type VirtualListMatcher = (item: unknown, query: string) => boolean

export interface VirtualListItemsRequest {
  /** Index of the first item requested. */
  start: number
  /** Number of items requested. */
  count: number
  /** The query the server should filter by. Empty when the list is not being searched. */
  search: string
  /** The sort the server should apply. */
  sort?: SortEntry
}

export interface VirtualListItemsResult {
  items: unknown[]
  /** Total number of items on the server *for this query*. Required on the first response so the scrollbar can be sized. */
  total?: number
}

/**
 * Lazy item source: the list asks for one block of items at a time as they scroll into view, instead of holding the
 * whole dataset in `items`. Searching and sorting are delegated to the source.
 */
export interface VirtualListDataSource {
  getItems(request: VirtualListItemsRequest): Promise<VirtualListItemsResult>
}

export interface VirtualListSelectionChangeEventDetail {
  /** Keys of the selected items (`item-key` field, or the item index when no `item-key` is set). */
  value: string[]
  /** The selected items themselves; only the loaded ones when a `dataSource` is used. */
  items: unknown[]
}

export interface VirtualListItemEventDetail {
  item: unknown
  index: number
  key: string
}

export interface VirtualListSearchChangeEventDetail {
  search: string
  /** How many items match, or `-1` while a `dataSource` has not reported a total yet. */
  matchCount: number
}
