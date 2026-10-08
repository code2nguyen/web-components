import type {
  FilterBuilderLabels,
  FilterField,
  FilterFieldType,
  FilterGroup,
  FilterNode,
  FilterOperatorOption,
  FilterOption,
  FilterRelativeDate,
  FilterRule,
  FilterValue,
} from './filter-types.js'

export const DEFAULT_LABELS: FilterBuilderLabels = {
  filters: 'Filters',
  addFilter: 'Filter',
  clear: 'Clear',
  searchFields: 'Filter by…',
  searchValues: 'Search…',
  noResults: 'No results',
  fields: 'Fields',
  values: 'Values',
  remove: 'Remove',
  done: 'Done',
  loading: 'Loading…',
  and: 'and',
  any: 'any',
  all: 'all',
  conditions: '{count} conditions',
  selected: '{count} selected',
  units: {
    day: { one: 'day', other: 'days' },
    week: { one: 'week', other: 'weeks' },
    month: { one: 'month', other: 'months' },
  },
  operators: {
    eq: 'is',
    neq: 'is not',
    in: 'is any of',
    not_in: 'is none of',
    has_any: 'includes any of',
    has_all: 'includes all of',
    has_none: 'excludes',
    contains: 'contains',
    not_contains: 'does not contain',
    starts_with: 'starts with',
    lt: '<',
    lte: '≤',
    gt: '>',
    gte: '≥',
    between: 'between',
    before: 'before',
    after: 'after',
    last: 'in the last',
    empty: 'is empty',
    not_empty: 'is not empty',
    is_true: 'is true',
    is_false: 'is false',
  },
}

const OPERATORS: Record<FilterFieldType, string[]> = {
  // `in`/`not_in` are the plural of `eq`/`neq` and follow the number of values (see `withValues`).
  enum: ['eq', 'neq', 'empty', 'not_empty'],
  person: ['eq', 'neq', 'empty', 'not_empty'],
  multi: ['has_any', 'has_all', 'has_none', 'empty', 'not_empty'],
  text: ['contains', 'not_contains', 'eq', 'starts_with', 'empty', 'not_empty'],
  number: ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'empty', 'not_empty'],
  date: ['eq', 'before', 'after', 'between', 'last', 'empty', 'not_empty'],
  boolean: ['is_true', 'is_false'],
  custom: ['eq'],
}

const VALUELESS = new Set(['empty', 'not_empty', 'is_true', 'is_false'])

/** Operators whose value is a list of option values. `eq`/`neq` hold one option value on a choice field. */
const LIST_OPERATORS = new Set(['in', 'not_in', 'has_any', 'has_all', 'has_none'])

export interface OperatorEntry {
  id: string
  label: string
  valueless: boolean
}

/** Whether a field's values are picked from a list of options. */
export function isChoiceField(field: FilterField): boolean {
  return field.type === 'enum' || field.type === 'person' || field.type === 'multi'
}

export function operatorsOf(field: FilterField, labels: FilterBuilderLabels): OperatorEntry[] {
  const list: FilterOperatorOption[] = field.operators?.length ? field.operators : OPERATORS[field.type]
  return list.map((entry) =>
    typeof entry === 'string'
      ? { id: entry, label: labels.operators[entry] ?? entry, valueless: VALUELESS.has(entry) }
      : { id: entry.id, label: entry.label, valueless: entry.valueless ?? VALUELESS.has(entry.id) },
  )
}

export function operatorLabel(field: FilterField, operator: string, labels: FilterBuilderLabels): string {
  return operatorsOf(field, labels).find((entry) => entry.id === operator)?.label ?? labels.operators[operator] ?? operator
}

export function isValueless(field: FilterField, operator: string, labels: FilterBuilderLabels): boolean {
  return operatorsOf(field, labels).find((entry) => entry.id === operator)?.valueless ?? VALUELESS.has(operator)
}

export function defaultOperator(field: FilterField, labels: FilterBuilderLabels): string {
  return field.defaultOperator ?? operatorsOf(field, labels)[0]?.id ?? 'eq'
}

export function isGroup(node: FilterNode): node is FilterGroup {
  return typeof node === 'object' && node !== null && Array.isArray((node as FilterGroup).rules)
}

/** A tree from an attribute, a saved view or a framework: always a group with an `and`/`or` connector. */
export function normalizeTree(value: unknown): FilterGroup {
  if (Array.isArray(value)) return { op: 'and', rules: value.filter(isNode) }
  if (value && typeof value === 'object' && Array.isArray((value as FilterGroup).rules)) {
    const group = value as FilterGroup
    return { op: group.op === 'or' ? 'or' : 'and', rules: group.rules.filter(isNode) }
  }
  return { op: 'and', rules: [] }
}

function isNode(node: unknown): node is FilterNode {
  if (!node || typeof node !== 'object') return false
  if (Array.isArray((node as FilterGroup).rules)) return true
  return typeof (node as FilterRule).field === 'string' && typeof (node as FilterRule).operator === 'string'
}

/** The option values a rule holds, as strings. */
export function ruleValues(rule: FilterRule): string[] {
  if (rule.value === undefined || rule.value === null) return []
  const list = Array.isArray(rule.value) ? rule.value : [rule.value]
  return list.filter((item) => item !== null && item !== undefined && typeof item !== 'object').map(String)
}

/** Whether a rule says enough to filter by: an operator that takes no value, or a value. */
export function isComplete(field: FilterField | undefined, rule: FilterRule, labels: FilterBuilderLabels): boolean {
  if (!field) return true
  if (isValueless(field, rule.operator, labels)) return true
  const { value } = rule
  if (value === undefined || value === null || value === '') return false
  if (Array.isArray(value)) {
    if (rule.operator === 'between') return value.length === 2 && value.every((item) => item !== null && item !== '')
    return value.length > 0
  }
  return true
}

/**
 * Toggles one option in a choice rule. On `enum`/`person` fields the operator follows the count, as in Linear: one
 * value is `is`/`is not`, several are `is any of`/`is none of`.
 */
export function toggleOption(field: FilterField, rule: FilterRule, value: string): FilterRule {
  const values = ruleValues(rule)
  const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
  return withValues(field, rule, next)
}

export function withValues(field: FilterField, rule: FilterRule, values: string[]): FilterRule {
  if (field.type === 'enum' || field.type === 'person') {
    const negative = rule.operator === 'neq' || rule.operator === 'not_in'
    const positive = rule.operator === 'eq' || rule.operator === 'in'
    if (negative || positive) {
      if (values.length === 1) return { field: rule.field, operator: negative ? 'neq' : 'eq', value: values[0] }
      return { field: rule.field, operator: negative ? 'not_in' : 'in', value: values }
    }
  }
  if (!LIST_OPERATORS.has(rule.operator) && values.length <= 1) return { field: rule.field, operator: rule.operator, value: values[0] }
  return { field: rule.field, operator: rule.operator, value: values }
}

/** Switches a rule's operator, keeping the value when the new operator can still use it. */
export function withOperator(field: FilterField, rule: FilterRule, operator: string, labels: FilterBuilderLabels): FilterRule {
  if (isValueless(field, operator, labels)) return { field: rule.field, operator }
  if (isValueless(field, rule.operator, labels)) return { field: rule.field, operator }
  if (isChoiceField(field)) return withValues(field, { ...rule, operator }, ruleValues(rule))
  if (operator === 'between') {
    const single = Array.isArray(rule.value) || isRelative(rule.value) ? undefined : rule.value
    return { field: rule.field, operator, value: [single ?? null, null] }
  }
  if (operator === 'last') return { field: rule.field, operator, value: isRelative(rule.value) ? rule.value : { amount: 7, unit: 'day' } }
  if (rule.operator === 'between' && Array.isArray(rule.value)) {
    const first = rule.value[0]
    return first === null || first === undefined ? { field: rule.field, operator } : { field: rule.field, operator, value: first }
  }
  if (isRelative(rule.value)) return { field: rule.field, operator }
  return { ...rule, operator }
}

export function isRelative(value: unknown): value is FilterRelativeDate {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as FilterRelativeDate).amount === 'number'
}

/** Finds the options behind a rule's values, keeping unknown values as their raw id. */
export function optionsFor(rule: FilterRule, known: (value: string) => FilterOption | undefined): FilterOption[] {
  return ruleValues(rule).map((value) => known(value) ?? { value, label: value })
}

/** Plain-text value of a rule, as read in the chip and in its accessible name. */
export function valueText(field: FilterField, rule: FilterRule, options: FilterOption[], labels: FilterBuilderLabels, locale?: string): string {
  if (isValueless(field, rule.operator, labels)) return ''
  if (isChoiceField(field)) {
    if (options.length <= 2) return options.map((option) => option.label).join(', ')
    if (field.summary) return `${options.length} ${field.summary.other}`
    return labels.selected.replace('{count}', String(options.length))
  }
  const { value } = rule
  if (field.type === 'date') {
    if (isRelative(value)) {
      const unit = labels.units[value.unit] ?? { one: value.unit, other: value.unit }
      return `${value.amount} ${value.amount === 1 ? unit.one : unit.other}`
    }
    if (Array.isArray(value)) return value.map((item) => formatDate(item, locale)).join(` ${labels.and} `)
    return formatDate(value, locale)
  }
  if (field.type === 'number') {
    const unit = field.unit ? ` ${field.unit}` : ''
    if (Array.isArray(value)) return `${value.map((item) => formatNumber(item, locale)).join(` ${labels.and} `)}${unit}`
    return `${formatNumber(value, locale)}${unit}`
  }
  if (Array.isArray(value)) return value.map(String).join(', ')
  return value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function formatDate(value: FilterValue | undefined, locale?: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value === undefined || value === null ? '…' : String(value)
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const sameYear = year === new Date().getFullYear()
  return date.toLocaleDateString(locale, sameYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatNumber(value: FilterValue | undefined, locale?: string): string {
  if (typeof value === 'number') return value.toLocaleString(locale)
  return value === undefined || value === null || value === '' ? '…' : String(value)
}

/** Case- and accent-insensitive match of every word of `query` in `text`. */
export function matches(query: string, ...texts: (string | undefined)[]): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const haystack = fold(texts.filter(Boolean).join(' '))
  return words.every((word) => haystack.includes(word))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase()
}

/** Initials of a person's name for an avatar without an image. */
export function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '?'
  const first = words[0][0] ?? ''
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : ''
  return (first + last).toUpperCase()
}
