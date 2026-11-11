/** How the values of a field are combined in a cell. */
export type PivotAggregate = 'sum' | 'count' | 'avg' | 'min' | 'max' | 'distinct'

/**
 * How a computed value combines two other values `a` and `b` of the same cell: `difference` is `a - b`,
 * `percent-difference` is `(a - b) / |b|` (a fraction, shown as a percentage), `ratio` is `a / b`.
 */
export type PivotCompute = 'difference' | 'percent-difference' | 'ratio'

/** One measure: a field and how it is combined, with its header label and number format. */
export interface PivotValue {
  /** The field aggregated; for a computed value, the name it goes by (no record needs to have it). */
  field: string
  aggregate?: PivotAggregate
  label?: string
  /** `Intl.NumberFormat` options for the cells, such as `{ "style": "currency", "currency": "EUR" }`. */
  format?: Intl.NumberFormatOptions
  /**
   * Makes this a computed value: the cell is worked out from two other values of the same cell (subtotals and totals
   * included), named by their `field` in `of`, rather than aggregated from the records.
   */
  compute?: PivotCompute
  /** The fields of the two values a computed value reads, `[a, b]`. */
  of?: [string, string]
}

/** What the table groups by and what it shows. */
export interface PivotConfig {
  rows: string[]
  columns: string[]
  values: PivotValue[]
  /**
   * Row groups whose numbers count with the opposite sign, by field: `{ "section": ["Expenses"] }`. The sign flips
   * before aggregation, so the group shows negative and subtracts in every subtotal and total above it.
   */
  invertSigns?: Record<string, string[]>
}

/** A group of the row or column header tree. The root has an empty path. */
export interface PivotNode {
  /** The group's own value, as text. */
  label: string
  /** The values of every field from the outermost down to this group. */
  path: string[]
  children: PivotNode[]
}

/** The computed pivot: the two header trees and every aggregate, totals and subtotals included. */
export interface PivotResult {
  rows: PivotNode
  columns: PivotNode
  values: PivotValue[]
  /** The aggregate of value `valueIndex` for a row path and a column path (either may be a prefix, or empty for a total). */
  cell(rowPath: readonly string[], columnPath: readonly string[], valueIndex: number): number | null
  /** The indices of the records in a cell, for drill-down. */
  records(rowPath: readonly string[], columnPath: readonly string[]): number[]
}

/** The label a missing value groups under. */
export const PIVOT_BLANK = '(blank)'
const SEP = '\u001f'

function fieldValue(record: unknown, field: string): unknown {
  if (record === null || typeof record !== 'object') return undefined
  let value: unknown = record
  for (const part of field.split('.')) {
    if (value === null || typeof value !== 'object') return undefined
    value = (value as Record<string, unknown>)[part]
  }
  return value
}

function groupLabel(value: unknown): string {
  return value === undefined || value === null || value === '' ? PIVOT_BLANK : String(value)
}

class Accumulator {
  sum = 0
  count = 0
  numbers = 0
  min = Infinity
  max = -Infinity
  distinct: Set<string> | null = null

  add(value: unknown, aggregate: PivotAggregate, sign: number): void {
    if (aggregate === 'count') {
      if (value !== undefined && value !== null && value !== '') this.count += 1
      return
    }
    if (aggregate === 'distinct') {
      if (value === undefined || value === null || value === '') return
      ;(this.distinct ??= new Set()).add(String(value))
      return
    }
    let number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN
    if (!Number.isFinite(number)) return
    number *= sign
    this.numbers += 1
    this.sum += number
    if (number < this.min) this.min = number
    if (number > this.max) this.max = number
  }

  result(aggregate: PivotAggregate): number | null {
    switch (aggregate) {
      case 'count':
        return this.count
      case 'distinct':
        return this.distinct?.size ?? 0
      case 'avg':
        return this.numbers ? this.sum / this.numbers : null
      case 'min':
        return this.numbers ? this.min : null
      case 'max':
        return this.numbers ? this.max : null
      default:
        return this.numbers ? this.sum : null
    }
  }
}

function buildTree(paths: string[][]): PivotNode {
  const root: PivotNode = { label: '', path: [], children: [] }
  const index = new Map<string, PivotNode>([['', root]])
  for (const path of paths) {
    let parent = root
    for (let depth = 0; depth < path.length; depth += 1) {
      const key = path.slice(0, depth + 1).join(SEP)
      let node = index.get(key)
      if (!node) {
        node = { label: path[depth], path: path.slice(0, depth + 1), children: [] }
        index.set(key, node)
        parent.children.push(node)
      }
      parent = node
    }
  }
  const sort = (node: PivotNode) => {
    node.children.sort((a, b) => compareLabels(a.label, b.label))
    node.children.forEach(sort)
  }
  sort(root)
  return root
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Labels in natural order (`Q2` before `Q10`), blanks last. */
export function compareLabels(a: string, b: string): number {
  if (a === b) return 0
  if (a === PIVOT_BLANK) return 1
  if (b === PIVOT_BLANK) return -1
  return collator.compare(a, b)
}

/**
 * Groups `data` by the `rows` and `columns` fields and aggregates each value in every cell, with every subtotal and
 * total. A pure function: the table uses it, and an app can run it on a server or in a test.
 */
export function pivot(data: readonly unknown[], config: PivotConfig): PivotResult {
  const rows = config.rows ?? []
  const columns = config.columns ?? []
  const values = (config.values ?? []).map(
    (value) => ({ ...value, aggregate: value.aggregate ?? 'sum' }) as Required<Pick<PivotValue, 'aggregate'>> & PivotValue,
  )
  const cells = new Map<string, Accumulator[]>()
  const members = new Map<string, number[]>()
  const rowPaths: string[][] = []
  const columnPaths: string[][] = []
  const seenRows = new Set<string>()
  const seenColumns = new Set<string>()
  // A computed value reads the first aggregated value of each field it names.
  const operands = values.map((value) =>
    value.compute ? (value.of ?? []).slice(0, 2).map((field) => values.findIndex((other) => !other.compute && other.field === field)) : null,
  )
  const inverted = Object.entries(config.invertSigns ?? {}).filter(([, groups]) => Array.isArray(groups) && groups.length)

  ;(Array.isArray(data) ? data : []).forEach((record, recordIndex) => {
    let sign = 1
    for (const [field, groups] of inverted) if (groups.includes(groupLabel(fieldValue(record, field)))) sign = -sign
    const rowPath = rows.map((field) => groupLabel(fieldValue(record, field)))
    const columnPath = columns.map((field) => groupLabel(fieldValue(record, field)))
    const rowKey = rowPath.join(SEP)
    const columnKey = columnPath.join(SEP)
    if (!seenRows.has(rowKey)) {
      seenRows.add(rowKey)
      rowPaths.push(rowPath)
    }
    if (!seenColumns.has(columnKey)) {
      seenColumns.add(columnKey)
      columnPaths.push(columnPath)
    }
    // Every prefix of the row path against every prefix of the column path: the subtotals and totals.
    for (let r = 0; r <= rowPath.length; r += 1) {
      const rowPrefix = rowPath.slice(0, r).join(SEP)
      for (let c = 0; c <= columnPath.length; c += 1) {
        const key = `${r}:${rowPrefix}\u001e${c}:${columnPath.slice(0, c).join(SEP)}`
        let accumulators = cells.get(key)
        if (!accumulators) {
          accumulators = values.map(() => new Accumulator())
          cells.set(key, accumulators)
          members.set(key, [])
        }
        values.forEach((value, index) => {
          if (!value.compute) accumulators![index].add(fieldValue(record, value.field), value.aggregate, sign)
        })
        members.get(key)!.push(recordIndex)
      }
    }
  })

  const keyOf = (rowPath: readonly string[], columnPath: readonly string[]) =>
    `${rowPath.length}:${rowPath.join(SEP)}\u001e${columnPath.length}:${columnPath.join(SEP)}`
  const cell = (rowPath: readonly string[], columnPath: readonly string[], valueIndex: number): number | null => {
    const accumulators = cells.get(keyOf(rowPath, columnPath))
    const value = values[valueIndex]
    if (!accumulators || !value) return null
    const pair = operands[valueIndex]
    if (!pair) return accumulators[valueIndex].result(value.aggregate)
    const [a, b] = pair.map((index) => (index >= 0 ? accumulators[index].result(values[index].aggregate) : null))
    if (a === null || b === null || b === undefined) return null
    if (value.compute === 'difference') return a - b
    if (!b) return null
    if (value.compute === 'ratio') return a / b
    return value.compute === 'percent-difference' ? (a - b) / Math.abs(b) : null
  }
  return {
    rows: buildTree(rowPaths),
    columns: buildTree(columnPaths),
    values,
    cell,
    records(rowPath, columnPath) {
      return [...(members.get(keyOf(rowPath, columnPath)) ?? [])]
    },
  }
}

/** The leaves of a header tree, in order: every full path. */
export function pivotLeaves(node: PivotNode): PivotNode[] {
  return node.children.length ? node.children.flatMap(pivotLeaves) : node.path.length ? [node] : []
}

/** How many levels a header tree has below its root. */
export function pivotDepth(node: PivotNode): number {
  return node.children.length ? 1 + Math.max(...node.children.map(pivotDepth)) : 0
}
