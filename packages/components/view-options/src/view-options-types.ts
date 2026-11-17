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
export interface ViewFieldConfig {
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
export interface ViewToggleConfig {
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

/**
 * A named view the app keeps: its value, and whether it is shared with others or locked against changes. The
 * component lists them and fires events; it saves nothing, so the app updates `views` after each event.
 */
export interface ViewSavedView {
  id: string
  name: string
  value: Partial<ViewOptionsValue>
  /** Listed under Shared rather than among the user's own views. */
  shared?: boolean
  /** Cannot be saved over, renamed or deleted (a team view, a built-in one). "Save as" still copies it. */
  locked?: boolean
}

/** Detail of `view-select`: the view picked and the value it gave, already in `value`. */
export interface ViewSelectEventDetail {
  id: string
  view: ViewSavedView
  value: ViewOptionsValue
}

/** Detail of `view-save`: `id` is the view saved over, or `null` for "Save as", which the app gives an id of its own. */
export interface ViewSaveEventDetail {
  id: string | null
  name: string
  value: ViewOptionsValue
}

/** Detail of `view-rename`. */
export interface ViewRenameEventDetail {
  id: string
  name: string
}

/** Detail of `view-delete`. */
export interface ViewDeleteEventDetail {
  id: string
}
