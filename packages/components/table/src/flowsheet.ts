import { html, unsafeCSS, type PropertyValues } from 'lit'
import { customElement } from '@c2n/core/element-helper.js'
import { arrayPropertyConverter, jsonPropertyConverter, property } from '@c2n/core/lit-helper.js'
import styles from './flowsheet.scss?inline'
import { GroupTable } from './group-table.js'
import { columnKey } from './table-shared.js'
import { ISO_DATE, SERIES_SETTINGS, seriesColumns, seriesDate, seriesKeys, seriesValue, type SeriesColumn } from './table-series.js'
import type { ColumnFormat, TableColumnConfig, TableRow } from './table-types.js'

/** One reading handed to `observations`: the `row-key` of its measure, its time and its value. */
export interface FlowsheetObservation {
  measure: string
  time: string
  value: unknown
}

/**
 * A flowsheet: a measure per row and a column per reading time, as a chart of vital signs or lab results reads.
 *
 * Rows are the measures (`row-key` names them), with what describes them: a unit, a normal range, a system to group
 * by. Their readings are an object keyed by time in the field `readings-field` names (`readings` by default), or come
 * as a flat list in `observations` (`{ "measure": "hr", "time": "2026-11-14T08:00", "value": 82 }`), which the
 * flowsheet sorts into the rows. The `c2-table-column` whose `field` is that field is the template of the time
 * columns: each time found in the readings becomes a column with its width, format, alignment, editor and ranges, in
 * time order (`time-order="desc"` for the newest first). Its header is the time, with the day above the first time of
 * each day. `times` (or `addTime()`) adds a column no measure has a reading in yet, for the next round.
 *
 * Everything `c2-group-table` does applies: `group-by="system"` folds the measures into collapsible groups, a
 * `reference-range` / `critical-range` on the template flags each reading against its row's limits (`L`, `H`, `LL`,
 * `HH`), and a time column sorts, filters and edits like any column. An edit writes into the row's own readings,
 * which win over an observation at the same time.
 *
 * @tag c2-flowsheet
 *
 * @csspart time-day - The day written over the first time of each day in the headers.
 *
 * @cssproperty {pixel} [--c2-flowsheet__header--height=48px] - The header row, which holds the day over the time.
 * @cssproperty {color} [--c2-flowsheet__time-day--color=#71717a]
 * @cssproperty {font-weight} [--c2-flowsheet__time-day--font-weight=600]
 */
@customElement('c2-flowsheet')
export class Flowsheet extends GroupTable {
  static override styles = [GroupTable.styles, unsafeCSS(styles)]

  /** The field of each row holding its readings by time, and of the `c2-table-column` that is the time columns' template. */
  @property({ type: String, attribute: 'readings-field' }) readingsField = 'readings'

  /**
   * Readings as a flat list, sorted into the rows by `measure` (a row's key) and `time`. A reading of a measure no
   * row has is left out. An array in the property, JSON in the attribute.
   */
  @property({ converter: jsonPropertyConverter }) observations?: FlowsheetObservation[]

  /** Times shown even with no reading yet, `;`-separated in the attribute: the column of the next round. */
  @property({ converter: arrayPropertyConverter }) times?: string[]

  /** `asc` (the default) puts the earliest time first, `desc` the newest. */
  @property({ type: String, attribute: 'time-order' }) timeOrder: 'asc' | 'desc' = 'asc'

  /** How the headers write the times: `time` (the default, with the day over the first time of each day), `date`, `datetime` or `text`. */
  @property({ type: String, attribute: 'time-format' }) timeFormat: ColumnFormat = 'time'

  #observed?: { inputs: unknown[]; byMeasure: Map<string, Record<string, unknown>> }
  #series = new WeakMap<TableColumnConfig, { inputs: unknown[]; columns: TableColumnConfig[] }>()
  #warned = new Set<string>()

  /** Adds a column for `time` (an ISO time such as `2026-11-14T20:00`), in its place among the others. */
  addTime(time: string): Promise<boolean> {
    if (!this.times?.includes(time)) this.times = [...(this.times ?? []), time]
    return this.updateComplete
  }

  protected override expandColumns(declared: TableColumnConfig[]): TableColumnConfig[] {
    const field = this.readingsField
    return declared.flatMap((column) => (column.field === field && !column.hidden ? this.#timeColumns(column) : [column]))
  }

  /** A reading: the row's own (an edit lands there), else the observation of its measure at that time. */
  protected override readCell(row: TableRow, column: TableColumnConfig): unknown {
    if (!('seriesKey' in column)) return super.readCell(row, column)
    const own = column.field ? super.readCell(row, column) : seriesValue(row, column)
    if (own !== undefined || !this.observations?.length) return own
    const identity = this.identityOf(row)
    return identity === undefined ? undefined : this.#byMeasure().get(identity)?.[(column as SeriesColumn).seriesKey]
  }

  protected override needsSort(changed: PropertyValues): boolean {
    // Observations are found by row key, so a new key re-reads them as a new list would.
    return (
      super.needsSort(changed) ||
      changed.has('observations') ||
      changed.has('readingsField') ||
      (Boolean(this.observations?.length) && (changed.has('rowKey') || changed.has('getRowKey')))
    )
  }

  /** The observations by measure, then by time; kept while the list is the same. */
  #byMeasure(): Map<string, Record<string, unknown>> {
    const inputs = [this.observations]
    if (this.#observed && this.#observed.inputs[0] === inputs[0]) return this.#observed.byMeasure
    if (!this.rowKey && !this.getRowKey) this.#warn('key', 'c2-flowsheet: `observations` find their measure by `row-key`; set one.')
    const byMeasure = new Map<string, Record<string, unknown>>()
    for (const observation of Array.isArray(this.observations) ? this.observations : []) {
      if (!observation || observation.measure === undefined || observation.time === undefined) continue
      const measure = String(observation.measure)
      let readings = byMeasure.get(measure)
      if (!readings) byMeasure.set(measure, (readings = {}))
      readings[String(observation.time)] = observation.value
    }
    this.#observed = { inputs, byMeasure }
    return byMeasure
  }

  /** The columns the template stands for: one per time, kept while the rows and the template are the same. */
  #timeColumns(template: TableColumnConfig): TableColumnConfig[] {
    if (this.dataSource) this.#warn('source', 'c2-flowsheet: with a `dataSource` the times come from `times` only: the rows arrive a window at a time.')
    const field = this.readingsField
    const inputs = [
      this.dataSource ? undefined : this.rows,
      this.observations,
      field,
      columnKey(template),
      this.times,
      this.timeOrder,
      this.timeFormat,
      ...SERIES_SETTINGS.map((name) => template[name]),
    ]
    const cached = this.#series.get(template)
    if (cached?.inputs.length === inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached.columns
    const rows = this.dataSource ? [] : this.sourceRows()
    // The times of the measures the flowsheet has: a reading of a measure no row has is left out, with its time.
    const byMeasure = this.observations?.length ? this.#byMeasure() : undefined
    const observed = byMeasure ? rows.flatMap((row) => Object.keys(byMeasure.get(this.identityOf(row) ?? '') ?? {})) : []
    const keys = seriesKeys(rows, field, [...(this.times ?? []), ...observed], this.timeOrder)
    const locale = template.locale
    const format = (value: Date | string, kind: ColumnFormat) => this.formatValue({ field: '', format: kind, locale }, value)
    const dayOf = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    const columns = seriesColumns(template, field, keys, columnKey(template), (key, index) => {
      if (!ISO_DATE.test(key)) return { header: format(key, this.timeFormat), renderHeader: undefined }
      const when = seriesDate(key)
      // A date alone has no time to show: it is headed by the day whatever the format.
      const dateOnly = key.length === 10
      if (dateOnly || this.timeFormat !== 'time')
        return { header: format(when, dateOnly && this.timeFormat === 'time' ? 'date' : this.timeFormat), renderHeader: undefined }
      // The day over the first time of each day where the page is, so a night shift reads across midnight.
      const previous = index > 0 && ISO_DATE.test(keys[index - 1]) ? seriesDate(keys[index - 1]) : undefined
      const first = !previous || dayOf(previous) !== dayOf(when)
      const header = format(when, 'datetime')
      const day = first ? this.formatValue({ field: '', format: 'date', locale, formatOptions: { month: 'short', day: 'numeric' } }, when) : ''
      const time = format(when, 'time')
      return {
        header,
        renderHeader: () =>
          html`<span class="time-header"
            ><span class="time-day" part="time-day" aria-hidden="true">${day}</span><span aria-hidden="true">${time}</span
            ><span class="time-name">${header}</span></span
          >`,
      }
    })
    this.#series.set(template, { inputs, columns })
    return columns
  }

  #warn(key: string, message: string) {
    if (this.#warned.has(key)) return
    this.#warned.add(key)
    console.warn(message)
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-flowsheet': Flowsheet
  }
}
