import { html, unsafeCSS, type PropertyValues } from 'lit'
import { property, arrayPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import { PivotTable, type PivotTableEventMap, type PivotZone } from './pivot-table.js'
import { PIVOT_BLANK, pivotFieldValue, type PivotConfig } from './pivot.js'
import { agingTableMessages } from './aging-table-messages.js'
import styles from './aging-table.scss?inline'

/** The field each record's bucket goes under: the one column field of an aging table, as `cell-click` names it. */
export const AGING_BUCKET_FIELD = 'agingBucket'

const DAY = 86_400_000

/** Events fired by {@link AgingTable}, keyed for `addEventListener`: the pivot table's. */
export type AgingTableEventMap = PivotTableEventMap

export interface AgingTable {
  addEventListener: TypedAddEventListener<AgingTable, AgingTableEventMap>
  removeEventListener: TypedRemoveEventListener<AgingTable, AgingTableEventMap>
}

/** A date as a whole number of days since 1970-01-01: `YYYY-MM-DD` as written, any other date by its local calendar day. */
export function agingDay(value: unknown): number | null {
  if (typeof value === 'string') {
    const text = value.trim()
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
    if (match) {
      const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
      const date = new Date(Date.UTC(year, month, day))
      // A day that does not exist (2026-02-30) is no date rather than one rolled into the next month.
      return date.getUTCMonth() === month && date.getUTCDate() === day ? date.getTime() / DAY : null
    }
    return text ? agingDay(new Date(text)) : null
  }
  if (typeof value === 'number') return Number.isFinite(value) ? agingDay(new Date(value)) : null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / DAY
  return null
}

/**
 * The bucket keys for the given upper bounds, in order: `0` (not yet due), then `1-30`, `31-60`, … and `91+` for
 * `[30, 60, 90]`. Each key is what a cell's column path holds.
 */
export function agingBuckets(bounds: readonly number[]): string[] {
  const keys = ['0']
  let from = 1
  for (const bound of bounds) {
    keys.push(`${from}-${bound}`)
    from = bound + 1
  }
  keys.push(`${from}+`)
  return keys
}

/** The bucket key of a number of days past due: `0` when not yet due. */
export function agingBucket(days: number, bounds: readonly number[]): string {
  if (days <= 0) return '0'
  let from = 1
  for (const bound of bounds) {
    if (days <= bound) return `${from}-${bound}`
    from = bound + 1
  }
  return `${from}+`
}

/**
 * An accounts receivable or payable aging table: one row per customer or vendor, a column per bucket of days past due
 * against an as-of date (Current, 1–30, 31–60, 61–90, Over 90), with row and column totals. It is
 * [`c2-pivot-table`](/web-components/components/pivot-table) with its columns fixed to those buckets: grouping,
 * subtotals, sorting, `heatmap`, `cell-click` for drill-down and `toCSV()` work as there.
 *
 * Each record of `data` is an open item (an invoice or a bill) with a date to age from (`date-field`, `dueDate` by
 * default, a `YYYY-MM-DD` text, a timestamp or a `Date`) and an amount. The days past due are the whole days from that
 * date to `as-of` (today when empty); zero or fewer is Current. `buckets` sets the bounds (`30;60;90`); a record with
 * no date shows under "No date". Every bucket shows even when nothing falls in it.
 *
 * `rows` groups the items (`customer` by default; `region;customer` nests them) and `values` sums their amount
 * (`[{ "field": "amount" }]` by default; give it a `format` for a currency). The columns are always the buckets:
 * `columns` is ignored, and `configurable` changes the rows and values only. `cell-click` names the bucket in
 * `columnPath` by its key (`0`, `1-30`, …, `91+`).
 *
 * Amounts past due carry the `overdue` class and the last bucket `oldest`, coloured by the `__overdue` and `__oldest`
 * variables. The `as-of` line above the grid can be replaced through its slot, for example by a date field that sets
 * `as-of`.
 *
 * @tag c2-aging-table
 *
 * @slot as-of - Replaces the "As of" line above the grid, e.g. with a `c2-date-input` that lets the reader pick the day.
 *
 * @csspart as-of - The region above the grid that wraps the as-of slot: it holds the built-in "As of" text as the slot fallback, or the content assigned to the slot.
 *
 * @cssproperty {color} [--c2-aging-table__as-of--color=#71717a]
 * @cssproperty {font-size} [--c2-aging-table__as-of--font-size=12px]
 * @cssproperty {margin} [--c2-aging-table__as-of--margin=0 0 8px]
 * @cssproperty {color} [--c2-aging-table__overdue--color=inherit] - An amount past due.
 * @cssproperty {color} [--c2-aging-table__oldest--color=#b91c1c] - An amount in the last bucket.
 * @cssproperty {font-weight} [--c2-aging-table__oldest--font-weight=inherit]
 */
@customElement('c2-aging-table')
export class AgingTable extends PivotTable {
  static override styles = [PivotTable.styles, unsafeCSS(styles)]

  /**
   * The day the items are aged to, as `YYYY-MM-DD`. When empty, the day the data is bucketed (today, in local time);
   * set it on a server-rendered page, whose server may not share the reader's day.
   */
  @property({ attribute: 'as-of' }) asOf = ''

  /** The field holding the date each item ages from: its due date, or its invoice date to age from issue. */
  @property({ attribute: 'date-field' }) dateField = 'dueDate'

  /** The last day of each bucket past due, in days: `30;60;90` gives 1–30, 31–60, 61–90 and Over 90. */
  @property({ converter: arrayPropertyConverter }) buckets: number[] = [30, 60, 90]

  private readonly agingMsg = new LocalizeController(this, agingTableMessages, () => this.locale)
  /** The day the items were last bucketed to, so the line above the grid names the day the buckets use. */
  private agedTo = 0
  private dayFormat: { locale: string; format: Intl.NumberFormat } | null = null

  constructor() {
    super()
    this.rows = ['customer']
    this.values = [{ field: 'amount' }]
    this.columns = [AGING_BUCKET_FIELD]
  }

  /** The bounds in use: whole days above zero, ascending, without repeats. */
  get bounds(): number[] {
    const list = (Array.isArray(this.buckets) ? this.buckets : []).map(Number).filter((day) => Number.isInteger(day) && day > 0)
    return [...new Set(list)].sort((a, b) => a - b)
  }

  /** The as-of day (days since 1970-01-01): `as-of`, or today. */
  get asOfDay(): number {
    return agingDay(this.asOf) ?? agingDay(new Date())!
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // The columns are the buckets, whatever the field list or an attribute asked for.
    if (this.columns?.length !== 1 || this.columns[0] !== AGING_BUCKET_FIELD) this.columns = [AGING_BUCKET_FIELD]
    if (Array.isArray(this.rows) && this.rows.includes(AGING_BUCKET_FIELD)) this.rows = this.rows.filter((field) => field !== AGING_BUCKET_FIELD)
    if (Array.isArray(this.values) && this.values.some((value) => value?.field === AGING_BUCKET_FIELD)) {
      this.values = this.values.filter((value) => value?.field !== AGING_BUCKET_FIELD)
    }
    super.willUpdate(changed)
  }

  protected override repivot(changed: PropertyValues<this>): boolean {
    return super.repivot(changed) || changed.has('asOf') || changed.has('dateField') || changed.has('buckets')
  }

  /** Each record copied with its bucket under {@link AGING_BUCKET_FIELD}, in the order of `data`. */
  protected override pivotData(): readonly unknown[] {
    const asOf = (this.agedTo = this.asOfDay)
    const bounds = this.bounds
    return (Array.isArray(this.data) ? this.data : []).map((record) => {
      const day = agingDay(pivotFieldValue(record, this.dateField))
      const bucket = day === null ? undefined : agingBucket(asOf - day, bounds)
      return record !== null && typeof record === 'object' ? { ...record, [AGING_BUCKET_FIELD]: bucket } : { [AGING_BUCKET_FIELD]: bucket }
    })
  }

  protected override pivotConfig(): PivotConfig {
    return { ...super.pivotConfig(), members: { [AGING_BUCKET_FIELD]: agingBuckets(this.bounds) } }
  }

  protected override accessibleName(): string {
    return this.label || this.agingMsg.t('table')
  }

  protected override fieldLabel(field: string): string {
    return field === AGING_BUCKET_FIELD && !this.fieldLabels?.[field] ? this.agingMsg.t('age') : super.fieldLabel(field)
  }

  protected override memberLabel(field: string, member: string): string {
    if (field !== AGING_BUCKET_FIELD) return super.memberLabel(field, member)
    if (member === '0') return this.agingMsg.t('current')
    if (member === PIVOT_BLANK) return this.agingMsg.t('noDate')
    const locale = this.agingMsg.locale
    if (this.dayFormat?.locale !== locale) this.dayFormat = { locale, format: new Intl.NumberFormat(locale) }
    const number = this.dayFormat.format
    const range = /^(\d+)-(\d+)$/.exec(member)
    if (range) return this.agingMsg.t('range', number.format(Number(range[1])), number.format(Number(range[2])))
    const over = /^(\d+)\+$/.exec(member)
    return over ? this.agingMsg.t('over', number.format(Number(over[1]) - 1)) : member
  }

  protected override canMove(field: string, to: PivotZone): boolean {
    return field !== AGING_BUCKET_FIELD && to !== 'columns'
  }

  protected override cellClass(columnPath: readonly string[]): string {
    const bucket = columnPath[0]
    if (!bucket || bucket === '0' || bucket === PIVOT_BLANK) return ''
    return bucket.endsWith('+') ? 'overdue oldest' : 'overdue'
  }

  private asOfText(): string {
    try {
      return new Intl.DateTimeFormat(this.agingMsg.locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(this.agedTo * DAY)
    } catch {
      return new Date(this.agedTo * DAY).toISOString().slice(0, 10)
    }
  }

  override render() {
    return html`<div class="as-of" part="as-of"><slot name="as-of">${this.agingMsg.t('asOf', this.asOfText())}</slot></div>
      ${super.render()}`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-aging-table': AgingTable
  }
}
