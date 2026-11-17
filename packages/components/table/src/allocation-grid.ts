import { html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { arrayPropertyConverter, property } from '@c2n/core/lit-helper.js'
import { getFieldValue } from '@c2n/core/data-helper.js'
import styles from './allocation-grid.scss?inline'
import { GroupTable } from './group-table.js'
import { columnKey, toNumber } from './table-shared.js'
import { ISO_DATE, SERIES_SETTINGS, seriesColumns, seriesDate, seriesKeys, seriesValue, type SeriesColumn } from './table-series.js'
import type { ColumnFormat, TableColumnConfig, TableRow } from './table-types.js'

/** Where an allocation stands against its row's capacity. */
export type AllocationLoad = 'under' | 'at' | 'over'

/** The field of the row total column: a field so it sorts, filters and totals like any column. */
const TOTAL_FIELD = '__c2-allocation-total'

/**
 * An allocation grid: a person (or a team, a machine, a room) per row and a column per period, each cell an amount of
 * that row's capacity, coloured under, at or over it, as resource planning and staffing views read.
 *
 * Rows hold their allocations as an object keyed by period in the field `allocations-field` names (`allocations` by
 * default: `{ "2026-11-09": 32, "2026-11-16": 44 }`) and their capacity per period in `capacity-field` (`capacity`),
 * else the grid's `capacity`. The `c2-table-column` whose `field` is the allocations field is the template of the
 * period columns: each period found in the rows, and each listed in `periods`, becomes a column with its width,
 * format, editor and `summary`, in order. With `editor="number"` on the template and `editable`, a cell is typed into
 * like any other, and `summary="sum"` totals each period in the summary row.
 *
 * Every cell with a number is compared with its row's capacity: under, at (within `tolerance`, a share of the
 * capacity) or over it. The cell takes the `cell-allocation` part and one of `cell-under`, `cell-at`, `cell-over`, and
 * a screen reader hears the load after the value. `row-totals` adds a total column after the periods, compared with
 * the capacity of all of them. Everything `c2-group-table` does applies: `group-by="team"` gives each team a row of
 * its period subtotals.
 *
 * @tag c2-allocation-grid
 *
 * @csspart cell-allocation - A cell compared with its row's capacity; with `cell-under`, `cell-at` or `cell-over`.
 * @csspart load - The load of a cell, read by a screen reader and hidden from view.
 *
 * @cssproperty {color} [--c2-allocation-grid__under--background=transparent] - A cell under its row's capacity.
 * @cssproperty {color} [--c2-allocation-grid__under--color=#71717a]
 * @cssproperty {color} [--c2-allocation-grid__at--background=rgba(21, 128, 61, 0.12)] - A cell at its row's capacity.
 * @cssproperty {color} [--c2-allocation-grid__at--color=#166534]
 * @cssproperty {color} [--c2-allocation-grid__over--background=rgba(185, 28, 28, 0.12)] - A cell over its row's capacity.
 * @cssproperty {color} [--c2-allocation-grid__over--color=#b91c1c]
 * @cssproperty {font-weight} [--c2-allocation-grid__over--font-weight=600]
 */
@customElement('c2-allocation-grid')
export class AllocationGrid extends GroupTable {
  static override styles = [GroupTable.styles, unsafeCSS(styles)]

  /** The field of each row holding its allocations by period, and of the `c2-table-column` that is the periods' template. */
  @property({ type: String, attribute: 'allocations-field' }) allocationsField = 'allocations'

  /** Periods shown even with nothing allocated in them, `;`-separated in the attribute: the weeks of the plan. */
  @property({ converter: arrayPropertyConverter }) periods?: string[]

  /** How the headers write the periods: `date` (the default, `Nov 9`), `datetime` or `text`. */
  @property({ type: String, attribute: 'period-format' }) periodFormat: ColumnFormat = 'date'

  /** The field of each row holding its capacity per period. */
  @property({ type: String, attribute: 'capacity-field' }) capacityField = 'capacity'

  /** The capacity per period of a row without one of its own, such as `40` hours or `100` percent. */
  @property({ type: Number }) capacity?: number

  /** How far from the capacity a cell still counts as at it, as a share of the capacity: `0.1` is within 10%. */
  @property({ type: Number }) tolerance = 0

  /** Adds a column after the periods with each row's total, compared with its capacity over all the periods. */
  @property({ type: Boolean, attribute: 'row-totals' }) rowTotals = false

  #series = new WeakMap<TableColumnConfig, { inputs: unknown[]; columns: TableColumnConfig[] }>()
  #warned = false

  /** Where `value` stands against `capacity`: undefined when either is not a number. */
  loadOf(value: unknown, capacity: unknown): AllocationLoad | undefined {
    const amount = toNumber(value)
    const limit = toNumber(capacity)
    if (!Number.isFinite(amount) || !Number.isFinite(limit)) return undefined
    const margin = Math.abs(limit) * Math.max(0, this.tolerance || 0)
    return amount > limit + margin ? 'over' : amount < limit - margin ? 'under' : 'at'
  }

  protected override expandColumns(declared: TableColumnConfig[]): TableColumnConfig[] {
    const field = this.allocationsField
    return declared.flatMap((column) => (column.field === field && !column.hidden ? this.#periodColumns(column) : [column]))
  }

  protected override readCell(row: TableRow, column: TableColumnConfig): unknown {
    if (column.field === TOTAL_FIELD) return this.#total(row, (column as TotalColumn).periods)
    if (!('seriesKey' in column) || column.field) return super.readCell(row, column)
    return seriesValue(row, column)
  }

  protected override cellDecoration(row: TableRow, rowIndex: number, column: TableColumnConfig, value: unknown) {
    const own = super.cellDecoration(row, rowIndex, column, value)
    const total = column.field === TOTAL_FIELD
    if (!total && (column as Partial<SeriesColumn>).seriesField !== this.allocationsField) return own
    const capacity = this.#capacity(row)
    const load = this.loadOf(value, total ? toNumber(capacity) * (column as TotalColumn).periods.length : capacity)
    if (!load) return own
    const name = load === 'over' ? 'allocationOver' : load === 'under' ? 'allocationUnder' : 'allocationAt'
    return {
      parts: [own?.parts, `cell-allocation cell-${load}`].filter(Boolean).join(' '),
      mark: html`<span class="load" part="load">${this.msg.t(name)}</span>`,
    }
  }

  protected override needsSort(changed: PropertyValues): boolean {
    return super.needsSort(changed) || changed.has('allocationsField')
  }

  #capacity(row: TableRow): unknown {
    const own = getFieldValue(row, this.capacityField)
    return own === undefined || own === null || own === '' ? this.capacity : own
  }

  #total(row: TableRow, periods: SeriesColumn[]): number | undefined {
    let sum = 0
    let any = false
    for (const column of periods) {
      const amount = toNumber(this.readCell(row, column))
      if (!Number.isFinite(amount)) continue
      sum += amount
      any = true
    }
    return any ? sum : undefined
  }

  /** The columns the template stands for: one per period, then the total; kept while the rows and the template are the same. */
  #periodColumns(template: TableColumnConfig): TableColumnConfig[] {
    if (this.dataSource && !this.#warned) {
      this.#warned = true
      console.warn('c2-allocation-grid: with a `dataSource` the periods come from `periods` only: the rows arrive a window at a time.')
    }
    const field = this.allocationsField
    const inputs = [
      this.dataSource ? undefined : this.rows,
      field,
      columnKey(template),
      this.periods,
      this.periodFormat,
      this.rowTotals,
      ...SERIES_SETTINGS.map((name) => template[name]),
    ]
    const cached = this.#series.get(template)
    if (cached?.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached.columns
    const keys = seriesKeys(this.dataSource ? [] : this.sourceRows(), field, this.periods)
    const locale = template.locale
    const periods = seriesColumns(template, field, keys, columnKey(template), (key) => {
      const iso = ISO_DATE.test(key)
      const header =
        iso && this.periodFormat === 'date'
          ? this.formatValue({ field: '', format: 'date', locale, formatOptions: { month: 'short', day: 'numeric' } }, seriesDate(key))
          : this.formatValue({ field: '', format: iso ? this.periodFormat : 'text', locale }, iso ? seriesDate(key) : key)
      return { header, renderHeader: undefined }
    })
    const columns: TableColumnConfig[] = [...periods]
    if (this.rowTotals) {
      const total: TotalColumn = {
        // Not under the template's id: a period keyed `total` would share it.
        id: TOTAL_FIELD,
        field: TOTAL_FIELD,
        header: this.msg.t('rowTotal'),
        // Drawn at each render, so the header follows a change of language the column cache does not see.
        renderHeader: () => this.msg.t('rowTotal'),
        width: template.width,
        minWidth: template.minWidth,
        align: template.align ?? 'end',
        format: template.format,
        formatOptions: template.formatOptions,
        currency: template.currency,
        locale,
        sortable: template.sortable,
        resizable: template.resizable,
        filterable: template.filterable,
        cellClass: template.cellClass,
        summary: typeof template.summary === 'string' ? template.summary : undefined,
        periods,
      }
      columns.push(total)
    }
    this.#series.set(template, { inputs, columns })
    return columns
  }
}

interface TotalColumn extends TableColumnConfig {
  periods: SeriesColumn[]
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-allocation-grid': AllocationGrid
  }
}
