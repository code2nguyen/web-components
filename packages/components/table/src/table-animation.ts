import { getFieldValue } from '@c2n/core/data-helper.js'
import type { Table } from './table.js'
import type { TableRow } from './table-types.js'

/**
 * The realtime half of `c2-table` (`animate-updates`): interpolates the numbers of rows replaced by a new snapshot,
 * expands added rows in and collapses removed ones out. Loaded as soon as `animate-updates` is set, so it is there by
 * the first snapshot; a snapshot that comes before it waits for it rather than jumping to the new values. The table
 * keeps only the reads of the state below while it renders.
 */

export type RowUpdateState = 'added' | 'removed' | 'increased' | 'decreased' | 'modified'

/** What the table hands the module: its private keys and sort, behind functions. */
export interface RowsAnimationHost {
  table: Table
  keyAt(index: number, row: TableRow): string
  sortRows(rows: TableRow[]): TableRow[]
  /** Whether rows carry a key of their own (`row-key`, `getRowKey`) rather than their position. */
  hasIdentity(): boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Builds the transient value shown during a row update. Target shape and non-numeric values win immediately; finite
 * numbers are the only values with a meaningful generic interpolation, including numbers nested in arrays/objects.
 */
function interpolateValue(from: unknown, to: unknown, progress: number): unknown {
  if (typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to)) return from + (to - from) * progress
  if (Array.isArray(from) && Array.isArray(to)) return to.map((value, index) => interpolateValue(from[index], value, progress))
  if (isRecord(from) && isRecord(to)) return Object.fromEntries(Object.entries(to).map(([key, value]) => [key, interpolateValue(from[key], value, progress)]))
  return to
}

function hasNumericChange(from: unknown, to: unknown): boolean {
  if (typeof from === 'number' && typeof to === 'number') return Number.isFinite(from) && Number.isFinite(to) && from !== to
  if (Array.isArray(from) && Array.isArray(to)) return to.some((value, index) => hasNumericChange(from[index], value))
  if (isRecord(from) && isRecord(to)) return Object.entries(to).some(([key, value]) => hasNumericChange(from[key], value))
  return false
}

function firstNumericDelta(from: unknown, to: unknown): number | undefined {
  if (typeof from === 'number' && typeof to === 'number' && Number.isFinite(from) && Number.isFinite(to) && from !== to) return to - from
  if (Array.isArray(from) && Array.isArray(to)) {
    for (let index = 0; index < to.length; index++) {
      const delta = firstNumericDelta(from[index], to[index])
      if (delta !== undefined) return delta
    }
  }
  if (isRecord(from) && isRecord(to)) {
    for (const [key, value] of Object.entries(to)) {
      const delta = firstNumericDelta(from[key], value)
      if (delta !== undefined) return delta
    }
  }
  return undefined
}

export class RowsAnimation {
  /** The rows as they were drawn before the snapshot, by key. */
  from = new Map<string, TableRow>()
  /** Eased progress of the running update, 1 when none runs. */
  progress = 1
  /** The new rows with the removed ones kept in place while they collapse; unset when no row is removed. */
  transitionRows?: TableRow[]
  states = new Map<string, RowUpdateState>()
  #frame?: number

  constructor(private readonly host: RowsAnimationHost) {}

  /** The row at `index` as it is drawn now: between its old and its new numbers while an update runs. */
  rowAt(index: number, row: TableRow): TableRow {
    if (this.from.size === 0 || this.progress >= 1) return row
    const from = this.from.get(this.host.keyAt(index, row))
    return from ? (interpolateValue(from, row, this.progress) as TableRow) : row
  }

  /** Starts the update from the rows `previous` held, as they were drawn, to the table's `rows`. */
  prepare(previous: unknown) {
    const { table, keyAt, sortRows } = this.host
    const displayedPrevious = Array.isArray(previous) ? previous.map((row, index) => (isRecord(row) ? this.rowAt(index, row) : row)) : previous
    this.cancel()
    if (
      !table.hasUpdated ||
      !table.animateUpdates ||
      // A tree is not animated: its rows are matched by their place in the flattened tree, which `rows` does not hold.
      table.childrenField ||
      table.updateDuration <= 0 ||
      !Array.isArray(displayedPrevious) ||
      !Array.isArray(table.rows) ||
      typeof requestAnimationFrame === 'undefined' ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    ) {
      return
    }

    const rows = table.rows
    const previousByKey = new Map<string, TableRow>()
    displayedPrevious.forEach((row, index) => {
      if (isRecord(row)) previousByKey.set(keyAt(index, row), row)
    })
    const nextKeys = new Set(rows.map((row, index) => keyAt(index, row)))
    const previousKeys = new Set(previousByKey.keys())
    const hasAdded = rows.some((row, index) => !previousKeys.has(keyAt(index, row)))
    const hasRemoved = displayedPrevious.some((row, index) => isRecord(row) && !nextKeys.has(keyAt(index, row)))
    const hasModified = rows.some((row, index) => hasNumericChange(previousByKey.get(keyAt(index, row)), row))
    if (!hasAdded && !hasRemoved && !hasModified) return

    this.from = previousByKey
    this.progress = 0
    rows.forEach((row, index) => {
      const key = keyAt(index, row)
      const from = previousByKey.get(key)
      if (!from) {
        this.states.set(key, 'added')
        return
      }
      if (!hasNumericChange(from, row)) return
      const watchedFrom = table.updateHighlightField ? getFieldValue(from, table.updateHighlightField) : from
      const watchedTo = table.updateHighlightField ? getFieldValue(row, table.updateHighlightField) : row
      const delta = firstNumericDelta(watchedFrom, watchedTo)
      this.states.set(key, delta === undefined ? 'modified' : delta > 0 ? 'increased' : 'decreased')
    })

    // A stable key lets a removed row remain in its former visual position long enough to collapse. Without one,
    // identity is positional, so structural updates stay immediate while numeric modification can still interpolate.
    if (this.host.hasIdentity() && !table.paginated && !table.childrenField) {
      const previousRows = sortRows(displayedPrevious.filter(isRecord))
      const transitionRows = [...sortRows(rows)]
      previousRows.forEach((row, index) => {
        const key = keyAt(index, row)
        if (nextKeys.has(key)) return
        transitionRows.splice(Math.min(index, transitionRows.length), 0, row)
        this.states.set(key, 'removed')
      })
      this.transitionRows = transitionRows
    }

    let started: number | undefined
    const draw = (now: number) => {
      started ??= now
      const progress = Math.min(1, (now - started) / table.updateDuration)
      this.progress = 1 - Math.pow(1 - progress, 3)
      table.requestUpdate()
      if (progress < 1) this.#frame = requestAnimationFrame(draw)
      else {
        this.#frame = undefined
        this.from.clear()
        this.transitionRows = undefined
        this.states.clear()
        table.requestUpdate()
      }
    }
    this.#frame = requestAnimationFrame(draw)
  }

  cancel() {
    if (this.#frame !== undefined) cancelAnimationFrame(this.#frame)
    this.#frame = undefined
    this.from.clear()
    this.progress = 1
    this.transitionRows = undefined
    this.states.clear()
  }
}
