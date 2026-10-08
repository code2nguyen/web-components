/** What kind of value a field holds; it picks the operators and the value editor. */
export type FilterFieldType = 'enum' | 'person' | 'multi' | 'text' | 'number' | 'date' | 'boolean' | 'custom'

/** Built-in operator ids. A `custom` field may use any string. */
export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'in'
  | 'not_in'
  | 'has_any'
  | 'has_all'
  | 'has_none'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between'
  | 'before'
  | 'after'
  | 'last'
  | 'empty'
  | 'not_empty'
  | 'is_true'
  | 'is_false'

/** A relative date range: `{ amount: 7, unit: 'day' }` is "in the last 7 days". */
export interface FilterRelativeDate {
  amount: number
  unit: 'day' | 'week' | 'month'
}

/** Any JSON value a rule can compare against. */
export type FilterValue = string | number | boolean | null | FilterValue[] | { [key: string]: FilterValue }

/** One condition: `{ field: 'status', operator: 'in', value: ['todo', 'doing'] }`. */
export interface FilterRule {
  field: string
  operator: string
  /** Absent for operators that take no value (`empty`, `is_true`, …). */
  value?: FilterValue
}

/** A group of conditions joined by one connector. The root of every filter tree is a group. */
export interface FilterGroup {
  op: 'and' | 'or'
  rules: FilterNode[]
}

export type FilterNode = FilterRule | FilterGroup

/** One choice of an `enum`, `person` or `multi` field. Only `value` is stored in the filter tree. */
export interface FilterOption {
  value: string
  label: string
  description?: string
  /** Tag name of an icon element, e.g. `c2-feather-flag`. */
  icon?: string
  /** CSS colour drawn as a dot before the label. */
  color?: string
  /** Image URL of a person; `person` fields fall back to initials from the label. */
  avatar?: string
  /** Number of records with this value, shown at the end of the row. */
  count?: number
  /** Extra words the search matches. */
  keywords?: string
}

/** An operator shown in the operator list: a built-in id, or `{ id, label }` to add or rename one. */
export type FilterOperatorOption = string | { id: string; label: string; valueless?: boolean }

/** What a render callback receives about the condition being drawn. */
export interface FilterRenderContext {
  field: FilterField
  rule: FilterRule
  /** The options matching the rule's value, in value order. Unknown values get `{ value, label: value }`. */
  options: FilterOption[]
}

export interface FilterOptionRenderContext {
  field: FilterField
  option: FilterOption
  selected: boolean
  query: string
}

export interface FilterEditorContext {
  field: FilterField
  rule: FilterRule
  /** Stores a new value for the rule and keeps the editor open. */
  commit: (value: FilterValue | undefined) => void
  /** Closes the editor. */
  close: () => void
}

/** Describes one filterable field: its label, type, choices and how they look. */
export interface FilterField {
  id: string
  label: string
  type: FilterFieldType
  /** Tag name of an icon element shown before the field label, e.g. `c2-feather-user`. */
  icon?: string
  /** Choices of an `enum`, `person` or `multi` field. */
  options?: FilterOption[]
  /** Loads choices from a server as the user types. Superseded requests are aborted. */
  loadOptions?: (query: string, signal: AbortSignal) => Promise<FilterOption[]>
  /** Resolves stored values to options, for a tree loaded before `loadOptions` ever ran. */
  resolveOptions?: (values: string[], signal: AbortSignal) => Promise<FilterOption[]>
  /** Limits and orders the operators; `{ id, label }` entries add or rename one. Defaults to every operator of the type. */
  operators?: FilterOperatorOption[]
  /** Operator of a new condition. Defaults to the first operator. */
  defaultOperator?: string
  /** Noun for several selected values: `{ one: 'person', other: 'people' }` gives "3 people". */
  summary?: { one: string; other: string }
  /** Placeholder of the value search or text field. */
  placeholder?: string
  /** Unit after a number, e.g. `pts`. */
  unit?: string
  min?: number
  max?: number
  step?: number
  /** Replaces the content of an option row. Return a Lit template or a DOM node. */
  renderOption?: (context: FilterOptionRenderContext) => unknown
  /** Replaces the value part of the chip. */
  renderValue?: (context: FilterRenderContext) => unknown
  /** The value editor of a `custom` field (or replaces the built-in one). */
  renderEditor?: (context: FilterEditorContext) => unknown
}

/** Every piece of interface text, for translation. */
export interface FilterBuilderLabels {
  filters: string
  addFilter: string
  clear: string
  searchFields: string
  searchValues: string
  noResults: string
  fields: string
  values: string
  remove: string
  done: string
  loading: string
  and: string
  any: string
  all: string
  /** `{count}` is replaced: "3 conditions". */
  conditions: string
  /** Chip text for more than two values of a field without `summary`. `{count}` is replaced: "3 selected". */
  selected: string
  units: Record<FilterRelativeDate['unit'], { one: string; other: string }>
  operators: Record<string, string>
}

export interface FilterChangeEventDetail {
  value: FilterGroup
}
