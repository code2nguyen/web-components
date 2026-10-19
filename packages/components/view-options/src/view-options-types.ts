/** Direction of one ordering level. */
export type ViewSortDirection = 'asc' | 'desc'

/** One ordering level. Same shape as `SortModel` from `@c2n/table`, so `table.sortModel = value.orderBy` works as is. */
export interface ViewSort {
  field: string
  direction: ViewSortDirection
}

/** What `c2-view-options` edits. The component never sees the collection itself: the app renders it from this value. */
export interface ViewOptionsValue {
  /** Id of the chosen layout, one of `layouts`. */
  layout: string
  /** Field the collection is grouped by, or `null` for no grouping. */
  groupBy: string | null
  /** Second grouping level inside each group, or `null`. Never the same field as `groupBy`. */
  subGroupBy: string | null
  /** Ordering levels, most significant first. */
  orderBy: ViewSort[]
  /** State of each switch in the Show section, keyed by the toggle's `key`. */
  show: Record<string, boolean>
  /** Ids of the fields shown on each item, in field order. */
  properties: string[]
}

/**
 * A field the collection can be grouped by, ordered by or show on its items. Shares `id`, `label` and `icon` with
 * `FilterField` from `@c2n/filter-builder`, so one array can describe both.
 */
export interface ViewField {
  id: string
  label: string
  /** Tag name of an icon element shown before the label, e.g. `c2-feather-user`. */
  icon?: string
  /** Offered under Grouping and Sub-grouping. */
  groupable?: boolean
  /** Offered under Ordering. */
  orderable?: boolean
  /** Offered under Display properties. */
  property?: boolean
}

/** A switch in the Show section. */
export interface ViewToggle {
  key: string
  label: string
  /** State used while `value.show` has no entry for this key. */
  checked?: boolean
}

/** Detail of `view-change`. */
export interface ViewChangeEventDetail {
  value: ViewOptionsValue
  /** The part of the value the user edited, or `null` when Reset replaced the whole value. */
  changed: keyof ViewOptionsValue | null
}

/** Detail of `default-request`. */
export interface ViewDefaultRequestEventDetail {
  value: ViewOptionsValue
}
