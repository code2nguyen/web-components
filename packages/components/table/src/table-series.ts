import type { TableColumnConfig, TableRow } from './table-types.js'
import { getFieldValue } from '@c2n/core/data-helper.js'

/**
 * Columns a table variant derives from its data: one per key of an object held in a field of every row, such as the
 * readings of a flowsheet keyed by their time. Shared by the variants that need it (`c2-flowsheet`), never by
 * `c2-table` itself, so a plain table does not carry it.
 */

/** One column of a series: `seriesKey` is its key in the object, `seriesField` the field of the rows holding it. */
export interface SeriesColumn extends TableColumnConfig {
  seriesField: string
  seriesKey: string
}

/** Orders keys that are not times: `Visit 2` before `Visit 10`. */
const NATURAL = new Intl.Collator(undefined, { numeric: true })

/** A key that is a date or a time: `2026-11-14`, `2026-11-14T08:00`. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:$|T)/

/** A key as a date. A date alone is midnight where the page is, not in UTC, so its header shows that day. */
export function seriesDate(key: string): Date {
  const [year, month, day] = key.slice(0, 10).split('-').map(Number)
  return key.length === 10 ? new Date(year, month - 1, day) : new Date(key)
}

/** What the template column hands each column of the series. */
export const SERIES_SETTINGS = [
  'width',
  'minWidth',
  'align',
  'format',
  'formatOptions',
  'currency',
  'locale',
  'sortable',
  'resizable',
  'cellClass',
  'renderCell',
  'summary',
  'summaryAlign',
  'summaryLabel',
  'summaryTarget',
  'renderSummary',
  'rollup',
  'cellSlot',
  'comparator',
  'filterable',
  'compare',
  'varianceThreshold',
  'referenceRange',
  'criticalRange',
  'editor',
  'options',
  'required',
  'validate',
  'renderEditor',
  'parseValue',
] as const satisfies readonly (keyof TableColumnConfig)[]

/**
 * Every key of the objects in `field` across `rows`, plus `extra`: ISO dates and times in time order, anything else in
 * natural order, reversed for `desc`.
 */
export function seriesKeys(rows: TableRow[], field: string, extra: string[] = [], order: 'asc' | 'desc' = 'asc'): string[] {
  const keys = new Set(extra)
  for (const row of rows) {
    const values = getFieldValue(row, field)
    if (values && typeof values === 'object' && !Array.isArray(values)) for (const key of Object.keys(values)) keys.add(key)
  }
  const time = (key: string) => (ISO_DATE.test(key) ? seriesDate(key).getTime() : Number.NaN)
  const ordered = [...keys].sort((a, b) => {
    const [first, second] = [time(a), time(b)]
    return Number.isNaN(first) || Number.isNaN(second) ? NATURAL.compare(a, b) : first - second
  })
  return order === 'desc' ? ordered.reverse() : ordered
}

/** The columns of a series: the template's settings, an id under `prefix`, and the field path of each key. */
export function seriesColumns(
  template: TableColumnConfig,
  field: string,
  keys: string[],
  prefix: string,
  header: (key: string, index: number) => Pick<TableColumnConfig, 'header' | 'renderHeader'>,
): SeriesColumn[] {
  const settings = Object.fromEntries(SERIES_SETTINGS.map((name) => [name, template[name]])) as Partial<TableColumnConfig>
  return keys.map((key, index) => {
    // A key with a dot cannot be a field path: its column shows the values but does not sort, edit or total.
    const plain = !key.includes('.')
    return {
      ...settings,
      ...(plain ? {} : { sortable: false, editor: undefined, renderEditor: undefined, summary: undefined }),
      ...header(key, index),
      id: `${prefix}:${key}`,
      field: plain ? `${field}.${key}` : '',
      seriesField: field,
      seriesKey: key,
    }
  })
}

/** The value of a series cell whose key is not a field path. */
export function seriesValue(row: TableRow, column: TableColumnConfig): unknown {
  const { seriesField, seriesKey } = column as Partial<SeriesColumn>
  if (seriesField === undefined || seriesKey === undefined) return undefined
  return (getFieldValue(row, seriesField) as Record<string, unknown> | undefined)?.[seriesKey]
}
