import { LitElement, html, nothing, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit'
import { state } from 'lit/decorators.js'
import { property, arrayPropertyConverter, jsonPropertyConverter } from '@c2n/core/lit-helper.js'
import { customElement } from '@c2n/core/element-helper.js'
import { LocalizeController } from '@c2n/core/localize.js'
import type { TypedAddEventListener, TypedRemoveEventListener } from '@c2n/core/event-helper.js'
import '@c2n/menu'
import '@c2n/menu/menu-item.js'
import { compareLabels, pivot, pivotLeaves, type PivotAggregate, type PivotConfig, type PivotNode, type PivotResult, type PivotValue } from './pivot.js'
import { pivotTableMessages } from './messages.js'
import styles from './pivot-table.scss?inline'

export * from './pivot.js'

export interface PivotCellClickEventDetail {
  rowPath: string[]
  columnPath: string[]
  /** The value's field and its aggregate in this cell. */
  field: string
  value: number | null
  /** The rows of `data` behind the cell. */
  records: unknown[]
}

/** Events fired by {@link PivotTable}, keyed for `addEventListener`. */
export interface PivotTableEventMap {
  'pivot-change': CustomEvent<PivotConfig>
  'cell-click': CustomEvent<PivotCellClickEventDetail>
}

export interface PivotTable {
  addEventListener: TypedAddEventListener<PivotTable, PivotTableEventMap>
  removeEventListener: TypedRemoveEventListener<PivotTable, PivotTableEventMap>
}

type Zone = 'fields' | 'rows' | 'columns' | 'values'

/** One data column of the grid: a column path (empty for the total) and a value. */
interface Column {
  path: string[]
  value: number
  total: boolean
}

/** One body row of the grid. */
interface Row {
  kind: 'leaf' | 'group' | 'collapsed' | 'subtotal' | 'grand'
  node: PivotNode | null
  depth: number
  /** Whether the row shows values. */
  values: boolean
}

const AGGREGATES: PivotAggregate[] = ['sum', 'count', 'avg', 'min', 'max', 'distinct']
const KEY = '\u001f'

/**
 * A pivot table: it groups flat rows by the fields set on `rows` and `columns` and aggregates `values` in every cell,
 * with subtotals and totals, as a spreadsheet's pivot does.
 *
 * Each `values` entry is `{ field, aggregate, label, format }`: the aggregate is `sum` (the default), `count`, `avg`,
 * `min`, `max` or `distinct`, and `format` takes `Intl.NumberFormat` options. Several values split each column. Row
 * groups expand and collapse (`expand-depth` sets how deep they start open), with a subtotal under each open group
 * (`subtotals`) and a grand total row and column (`totals`). Clicking a column header sorts the rows by it. `heatmap`
 * tints each cell by its value.
 *
 * With `configurable`, a field list beside the grid lets the reader drag fields between rows, columns and values (or
 * move them from each field's menu) and change a value's aggregate; `pivot-change` gives the new layout.
 * `cell-click` gives the records behind a cell, for drill-down, and `toCSV()` exports what is shown. `pivot()` is the
 * same computation as a plain function.
 *
 * The grid is a `treegrid`: the arrow keys move between cells, Left and Right close and open a group, and Enter on a
 * value cell fires `cell-click`.
 *
 * @tag c2-pivot-table
 *
 * @event {CustomEvent<PivotConfig>} pivot-change - The reader changed the layout from the field list.
 * @event {CustomEvent<PivotCellClickEventDetail>} cell-click - A value cell was clicked, or Enter was pressed on it.
 *
 * @csspart field-list - The field list beside the grid.
 * @csspart chip - A field in the field list.
 * @csspart scroll - The box the grid scrolls in.
 * @csspart table - The grid.
 * @csspart header - A column header.
 * @csspart row-header - A row header.
 * @csspart cell - A value cell.
 *
 * @cssproperty {length} [--c2-pivot-table--max-height=none] - The grid scrolls past this height, its headers sticky.
 * @cssproperty {font-size} [--c2-pivot-table--font-size=13px]
 * @cssproperty {color} [--c2-pivot-table--color=#18181b]
 * @cssproperty {color} [--c2-pivot-table--background-color=#ffffff]
 * @cssproperty {color} [--c2-pivot-table__border--color=#e4e4e7]
 * @cssproperty {border-radius} [--c2-pivot-table--border-radius=8px]
 * @cssproperty {padding} [--c2-pivot-table__cell--padding=6px 12px]
 * @cssproperty {color} [--c2-pivot-table__header--background-color=#fafafa]
 * @cssproperty {color} [--c2-pivot-table__header--color=#18181b]
 * @cssproperty {color} [--c2-pivot-table__subtotal--background-color=#fafafa]
 * @cssproperty {color} [--c2-pivot-table__total--background-color=#f4f4f5]
 * @cssproperty {font-weight} [--c2-pivot-table__total--font-weight=600]
 * @cssproperty {color} [--c2-pivot-table__muted--color=#71717a] - Empty cells and the corner header.
 * @cssproperty {color} [--c2-pivot-table__focus--outline-color=rgb(2, 101, 220)]
 * @cssproperty {color} [--c2-pivot-table__heat--color=rgb(2, 101, 220)] - The darkest heatmap tint.
 * @cssproperty {color} [--c2-pivot-table__heat--on-color=#ffffff] - Text on the darker heatmap tints.
 * @cssproperty {length} [--c2-pivot-table__indent--width=20px] - The indent of each row level.
 * @cssproperty {pixel} [--c2-pivot-table__field-list--width=220px]
 * @cssproperty {color} [--c2-pivot-table__chip--background-color=#ffffff]
 * @cssproperty {border} [--c2-pivot-table__chip--border=1px solid #e4e4e7]
 * @cssproperty {color} [--c2-pivot-table__zone__over--background-color=rgba(2, 101, 220, 0.06)]
 */
@customElement('c2-pivot-table')
export class PivotTable extends LitElement {
  static override styles = unsafeCSS(styles)

  /** The rows to summarise. */
  @property({ converter: jsonPropertyConverter }) data: unknown[] = []

  /** The fields grouped down the side, outermost first. */
  @property({ converter: arrayPropertyConverter }) rows: string[] = []

  /** The fields grouped across the top, outermost first. */
  @property({ converter: arrayPropertyConverter }) columns: string[] = []

  /** The measures: `{ field, aggregate, label, format }`. */
  @property({ converter: jsonPropertyConverter }) values: PivotValue[] = []

  /** Labels for fields, by field name, used in headers and the field list. */
  @property({ converter: jsonPropertyConverter, attribute: 'field-labels' }) fieldLabels: Record<string, string> = {}

  /** How many row levels start open. */
  @property({ type: Number, attribute: 'expand-depth' }) expandDepth = 1

  /** Where an open group's subtotal goes: `bottom`, `top` or `none`. */
  @property() subtotals: 'bottom' | 'top' | 'none' = 'bottom'

  /** Which grand totals to show: `both`, `rows`, `columns` or `none`. */
  @property() totals: 'both' | 'rows' | 'columns' | 'none' = 'both'

  /** Tints each cell by its value within its measure. */
  @property({ type: Boolean }) heatmap = false

  /** Shows the field list, so the reader can change the layout. */
  @property({ type: Boolean }) configurable = false

  /** The grid's accessible name. */
  @property() label = ''

  /** The locale for numbers; the nearest `lang` when empty. */
  @property() locale = ''

  @state() private toggled = new Map<string, boolean>()
  @state() private sort: { column: string; dir: 'desc' | 'asc' } | null = null
  @state() private cursor = { row: 0, column: 0 }
  @state() private dragging: { field: string; from: Zone } | null = null
  @state() private over: Zone | null = null
  @state() private announcement = ''

  private readonly internals = this.attachInternals()
  private readonly msg = new LocalizeController(this, pivotTableMessages, () => this.locale)
  private result: PivotResult | null = null
  private bodyRows: Row[] = []
  private dataColumns: Column[] = []
  private heat: { min: number; max: number }[] = []

  /** The layout as configured now. */
  get config(): PivotConfig {
    return { rows: [...this.rows], columns: [...this.columns], values: this.values.map((value) => ({ ...value })) }
  }

  /** Opens every row group. */
  expandAll(): void {
    this.expandDepth = Number.POSITIVE_INFINITY
    this.toggled = new Map()
  }

  /** Closes every row group. */
  collapseAll(): void {
    this.expandDepth = 0
    this.toggled = new Map()
  }

  /** The grid as shown, as CSV: one header line per column level, then a line per row. */
  toCSV(): string {
    const quote = (text: string) => (/[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
    const lines: string[][] = []
    const columnDepth = this.columns.length
    for (let level = 0; level < Math.max(1, columnDepth); level += 1) {
      lines.push(['', ...this.dataColumns.map((column) => (column.total ? (level === 0 ? this.msg.t('total') : '') : (column.path[level] ?? '')))])
    }
    if (this.values.length > 1 || !columnDepth) lines.push(['', ...this.dataColumns.map((column) => this.valueLabel(this.values[column.value]))])
    for (const row of this.bodyRows) {
      const label = '  '.repeat(Math.max(0, row.depth - 1)) + this.rowLabel(row)
      lines.push([label, ...this.dataColumns.map((column) => (row.values ? this.formatted(row, column) : ''))])
    }
    return lines.map((line) => line.map(quote).join(',')).join('\n')
  }

  constructor() {
    super()
    this.internals.role = 'region'
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    this.internals.ariaLabel = this.label || this.msg.t('table')
    if (!Array.isArray(this.data)) this.data = []
    if (!Array.isArray(this.values)) this.values = []
    if (changed.has('data') || changed.has('rows') || changed.has('columns') || changed.has('values')) {
      this.result = pivot(this.data, { rows: this.rows, columns: this.columns, values: this.values })
    }
    if (changed.has('rows') || changed.has('columns')) this.sort = null
    this.layout()
  }

  // ------------------------------------------------------------------------------------------------------------ model

  private fieldLabel(field: string): string {
    return this.fieldLabels?.[field] ?? field
  }

  private valueLabel(value: PivotValue | undefined): string {
    if (!value) return ''
    return value.label ?? this.msg.t('valueOf', this.msg.t(value.aggregate ?? 'sum'), this.fieldLabel(value.field))
  }

  private keyOf(path: readonly string[]): string {
    return `${path.length}:${path.join(KEY)}`
  }

  private expanded(node: PivotNode): boolean {
    return this.toggled.get(this.keyOf(node.path)) ?? node.path.length <= this.expandDepth
  }

  private columnKey(column: Column): string {
    return `${column.total ? '*' : column.path.join(KEY)}|${column.value}`
  }

  /** The value a row shows in a column. */
  private cellValue(row: Row, column: Column): number | null {
    if (!this.result || !row.values) return null
    return this.result.cell(row.node?.path ?? [], column.path, column.value)
  }

  private formatted(row: Row, column: Column): string {
    const value = this.cellValue(row, column)
    if (value === null) return ''
    const options = this.values[column.value]?.format ?? { maximumFractionDigits: 2 }
    try {
      return new Intl.NumberFormat(this.msg.locale, options).format(value)
    } catch {
      return String(value)
    }
  }

  /** Children in the order shown: by the sorted column's values, else by label. */
  private ordered(node: PivotNode): PivotNode[] {
    const children = [...node.children]
    const sort = this.sort
    const column = sort ? this.dataColumns.find((candidate) => this.columnKey(candidate) === sort.column) : undefined
    if (!sort || !column || !this.result) return children
    const value = (child: PivotNode) => this.result!.cell(child.path, column.path, column.value)
    return children.sort((a, b) => {
      const left = value(a)
      const right = value(b)
      if (left === null && right === null) return compareLabels(a.label, b.label)
      if (left === null) return 1
      if (right === null) return -1
      return sort.dir === 'desc' ? right - left : left - right
    })
  }

  private layout(): void {
    const result = this.result
    const valueCount = this.values.length
    const showColumnTotal = (this.totals === 'both' || this.totals === 'columns') && this.columns.length > 0
    const showRowTotal = this.totals === 'both' || this.totals === 'rows'
    this.dataColumns = []
    this.bodyRows = []
    if (!result || !valueCount) return
    const leaves = this.columns.length ? pivotLeaves(result.columns) : [result.columns]
    for (const leaf of leaves) for (let value = 0; value < valueCount; value += 1) this.dataColumns.push({ path: leaf.path, value, total: false })
    if (showColumnTotal) for (let value = 0; value < valueCount; value += 1) this.dataColumns.push({ path: [], value, total: true })

    const depth = this.rows.length
    const walk = (node: PivotNode) => {
      for (const child of this.ordered(node)) {
        const level = child.path.length
        if (level < depth && child.children.length) {
          if (!this.expanded(child)) {
            this.bodyRows.push({ kind: 'collapsed', node: child, depth: level, values: true })
            continue
          }
          this.bodyRows.push({ kind: 'group', node: child, depth: level, values: this.subtotals === 'top' })
          walk(child)
          if (this.subtotals === 'bottom') this.bodyRows.push({ kind: 'subtotal', node: child, depth: level + 1, values: true })
        } else {
          this.bodyRows.push({ kind: 'leaf', node: child, depth: level, values: true })
        }
      }
    }
    if (depth) walk(result.rows)
    else this.bodyRows.push({ kind: 'leaf', node: result.rows, depth: 1, values: true })
    if (showRowTotal && depth) this.bodyRows.push({ kind: 'grand', node: result.rows, depth: 1, values: true })

    // The heatmap scale: per measure, over the leaf cells shown.
    this.heat = this.values.map(() => ({ min: Infinity, max: -Infinity }))
    for (const row of this.bodyRows) {
      if (row.kind !== 'leaf') continue
      for (const column of this.dataColumns) {
        if (column.total) continue
        const value = this.cellValue(row, column)
        if (value === null) continue
        const range = this.heat[column.value]
        range.min = Math.min(range.min, value)
        range.max = Math.max(range.max, value)
      }
    }
    this.cursor = {
      row: Math.min(this.cursor.row, Math.max(0, this.bodyRows.length - 1)),
      column: Math.min(this.cursor.column, this.dataColumns.length),
    }
  }

  // -------------------------------------------------------------------------------------------------------- actions

  private toggle(node: PivotNode, open = !this.expanded(node)): void {
    if (open === this.expanded(node)) return
    const next = new Map(this.toggled)
    next.set(this.keyOf(node.path), open)
    this.toggled = next
  }

  private sortBy(column: Column): void {
    const key = this.columnKey(column)
    if (this.sort?.column !== key) this.sort = { column: key, dir: 'desc' }
    else if (this.sort.dir === 'desc') this.sort = { column: key, dir: 'asc' }
    else this.sort = null
  }

  private clickCell(row: Row, column: Column): void {
    if (!row.values || !this.result) return
    const rowPath = row.node?.path ?? []
    const indices = this.result.records(rowPath, column.path)
    const value = this.values[column.value]
    this.dispatchEvent(
      new CustomEvent<PivotCellClickEventDetail>('cell-click', {
        detail: {
          rowPath: [...rowPath],
          columnPath: [...column.path],
          field: value?.field ?? '',
          value: this.cellValue(row, column),
          records: indices.map((index) => this.data[index]),
        },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private onKeydown(event: KeyboardEvent): void {
    const { row, column } = this.cursor
    const last = { row: this.bodyRows.length - 1, column: this.dataColumns.length }
    let next = { row, column }
    const current = this.bodyRows[row]
    switch (event.key) {
      case 'ArrowDown':
        next.row = Math.min(last.row, row + 1)
        break
      case 'ArrowUp':
        next.row = Math.max(0, row - 1)
        break
      case 'ArrowRight':
        if (column === 0 && current?.node && current.kind === 'collapsed') {
          this.toggle(current.node, true)
          break
        }
        next.column = Math.min(last.column, column + 1)
        break
      case 'ArrowLeft':
        if (column === 0 && current?.node && current.kind === 'group') {
          this.toggle(current.node, false)
          break
        }
        next.column = Math.max(0, column - 1)
        break
      case 'Home':
        next = event.ctrlKey ? { row: 0, column: 0 } : { row, column: 0 }
        break
      case 'End':
        next = event.ctrlKey ? last : { row, column: last.column }
        break
      case 'Enter':
      case ' ':
        if (column === 0 && current?.node && (current.kind === 'group' || current.kind === 'collapsed')) this.toggle(current.node)
        else if (column > 0 && current) this.clickCell(current, this.dataColumns[column - 1])
        break
      default:
        return
    }
    event.preventDefault()
    this.cursor = next
    this.updateComplete.then(() => this.renderRoot.querySelector<HTMLElement>(`[data-cell="${this.cursor.row}:${this.cursor.column}"]`)?.focus())
  }

  // ------------------------------------------------------------------------------------------------------ field list

  private zoneOf(field: string): Zone {
    if (this.rows.includes(field)) return 'rows'
    if (this.columns.includes(field)) return 'columns'
    if (this.values.some((value) => value.field === field)) return 'values'
    return 'fields'
  }

  /** Every field of the data, in the order first seen. */
  private allFields(): string[] {
    const fields = new Set<string>([...this.rows, ...this.columns, ...this.values.map((value) => value.field)])
    for (const record of this.data.slice(0, 200)) {
      if (record && typeof record === 'object') for (const key of Object.keys(record)) fields.add(key)
    }
    return [...fields]
  }

  /** Moves a field to a zone, as a drop or a menu command does, and says so. */
  move(field: string, to: Zone, index?: number): void {
    const rows = this.rows.filter((name) => name !== field)
    const columns = this.columns.filter((name) => name !== field)
    let values = this.values
    if (to !== 'values') values = values.filter((value) => value.field !== field)
    const place = (list: string[]) => {
      const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, index))
      list.splice(at, 0, field)
      return list
    }
    if (to === 'rows') this.rows = place(rows)
    else this.rows = rows
    if (to === 'columns') this.columns = place(columns)
    else this.columns = columns
    if (to === 'values' && !values.some((value) => value.field === field)) {
      const numeric = this.data.some((record) => typeof (record as Record<string, unknown>)?.[field] === 'number')
      values = [...values, { field, aggregate: numeric ? 'sum' : 'count' }]
    }
    this.values = values
    this.changed()
  }

  private setAggregate(field: string, aggregate: PivotAggregate): void {
    this.values = this.values.map((value) => (value.field === field ? { ...value, aggregate, label: undefined } : value))
    this.changed()
  }

  private changed(): void {
    const list = (fields: string[]) => (fields.length ? fields.map((field) => this.fieldLabel(field)).join(', ') : this.msg.t('none'))
    this.announcement = this.msg.t(
      'layout',
      list(this.rows),
      list(this.columns),
      this.values.length ? this.values.map((value) => this.valueLabel(value)).join(', ') : this.msg.t('none'),
    )
    this.dispatchEvent(new CustomEvent<PivotConfig>('pivot-change', { detail: this.config, bubbles: true, composed: true }))
  }

  private onDrop(event: DragEvent, zone: Zone): void {
    event.preventDefault()
    const dragging = this.dragging
    this.over = null
    this.dragging = null
    if (!dragging) return
    if (zone === 'fields') {
      if (dragging.from !== 'fields') this.move(dragging.field, 'fields')
      return
    }
    // Dropped on a chip: take its place; on the zone itself: go last.
    const target = (event.composedPath() as HTMLElement[]).find((node) => node instanceof HTMLElement && node.dataset?.field)
    const list = zone === 'rows' ? this.rows : zone === 'columns' ? this.columns : this.values.map((value) => value.field)
    const index = target ? list.indexOf(target.dataset.field!) : undefined
    this.move(dragging.field, zone, index !== undefined && index >= 0 ? index : undefined)
  }

  private renderChip(field: string, zone: Zone) {
    const value = zone === 'values' ? this.values.find((entry) => entry.field === field) : undefined
    const commands: [string, string][] = [
      ['rows', this.msg.t('moveToRows')],
      ['columns', this.msg.t('moveToColumns')],
      ['values', this.msg.t('moveToValues')],
    ]
    return html`<span
      class="chip"
      part="chip"
      draggable="true"
      data-field=${field}
      @dragstart=${(event: DragEvent) => {
        this.dragging = { field, from: zone }
        event.dataTransfer?.setData('text/plain', field)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      }}
      @dragend=${() => {
        this.dragging = null
        this.over = null
      }}
    >
      <span class="chip-label">${this.fieldLabel(field)}</span>
      ${value ? html`<span class="chip-aggregate">${this.msg.t(value.aggregate ?? 'sum')}</span>` : nothing}
      <c2-menu
        @menu-select=${(event: CustomEvent<{ value: string }>) => {
          const choice = event.detail.value
          if (AGGREGATES.includes(choice as PivotAggregate)) this.setAggregate(field, choice as PivotAggregate)
          else if (choice === 'remove') this.move(field, 'fields')
          else this.move(field, choice as Zone)
        }}
      >
        <button slot="trigger" class="chip-menu" type="button" aria-label=${this.msg.t('fieldOptions', this.fieldLabel(field))}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
        </button>
        ${commands.filter(([target]) => target !== zone).map(([target, text]) => html`<c2-menu-item value=${target}>${text}</c2-menu-item>`)}
        ${
          value
            ? html`<hr />
                ${AGGREGATES.map((aggregate) => html`<c2-menu-item value=${aggregate} type="radio" ?checked=${(value.aggregate ?? 'sum') === aggregate}>${this.msg.t(aggregate)}</c2-menu-item>`)}`
            : nothing
        }
        ${
          zone !== 'fields'
            ? html`<hr />
                <c2-menu-item value="remove">${this.msg.t('remove')}</c2-menu-item>`
            : nothing
        }
      </c2-menu>
    </span>`
  }

  private renderZone(zone: Zone, fields: string[]) {
    return html`<div
      class="zone ${this.over === zone ? 'over' : ''}"
      @dragover=${(event: DragEvent) => {
        if (!this.dragging) return
        event.preventDefault()
        if (this.over !== zone) this.over = zone
      }}
      @dragleave=${(event: DragEvent) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) this.over = null
      }}
      @drop=${(event: DragEvent) => this.onDrop(event, zone)}
    >
      <span class="zone-label" id="zone-${zone}">${this.msg.t(zone)}</span>
      <div class="chips" role="list" aria-labelledby="zone-${zone}">
        ${fields.map((field) => html`<span role="listitem">${this.renderChip(field, zone)}</span>`)}
      </div>
    </div>`
  }

  private renderFieldList() {
    const fields = this.allFields()
    return html`<div class="field-list" part="field-list" role="group" aria-label=${this.msg.t('fieldList')}>
      ${this.renderZone(
        'fields',
        fields.filter((field) => this.zoneOf(field) === 'fields'),
      )}
      ${this.renderZone('rows', this.rows)} ${this.renderZone('columns', this.columns)}
      ${this.renderZone(
        'values',
        this.values.map((value) => value.field),
      )}
    </div>`
  }

  // ----------------------------------------------------------------------------------------------------------- grid

  private rowLabel(row: Row): string {
    if (row.kind === 'grand') return this.msg.t('grandTotal')
    if (!row.node || !row.node.path.length) return this.msg.t('total')
    if (row.kind === 'subtotal') return this.msg.t('groupTotal', row.node.label)
    return row.node.label
  }

  private renderHead() {
    const result = this.result!
    const valueCount = this.values.length
    const columnDepth = this.columns.length
    const valueRow = valueCount > 1 || !columnDepth
    const headRows = columnDepth + (valueRow ? 1 : 0)
    const showColumnTotal = this.dataColumns.some((column) => column.total)
    const corner = this.rows.map((field) => this.fieldLabel(field)).join(' / ')
    const lines: TemplateResult[] = []
    const sortable = (column: Column, text: string, span = 1) => {
      const key = this.columnKey(column)
      const sorted = this.sort?.column === key ? this.sort.dir : null
      return html`<th
        part="header"
        role="columnheader"
        class="sortable ${column.total ? 'total' : ''}"
        colspan=${span}
        aria-sort=${sorted === 'desc' ? 'descending' : sorted === 'asc' ? 'ascending' : 'none'}
      >
        <button type="button" class="sort" @click=${() => this.sortBy(column)} aria-label=${this.msg.t('sortBy', text)}>
          ${text}${sorted ? html`<span class="arrow" aria-hidden="true">${sorted === 'desc' ? '↓' : '↑'}</span>` : nothing}
        </button>
      </th>`
    }
    for (let level = 0; level < Math.max(columnDepth, valueRow ? 0 : 1); level += 1) {
      const nodes: PivotNode[] = []
      const collect = (node: PivotNode) => {
        if (node.path.length === level + 1) nodes.push(node)
        else node.children.forEach(collect)
      }
      collect(result.columns)
      const lastLevel = level === columnDepth - 1 && !valueRow
      lines.push(
        html`<tr role="row">
          ${level === 0 ? html`<th class="corner" part="header" role="columnheader" rowspan=${headRows}>${corner}</th>` : nothing}
          ${nodes.map((node) =>
          lastLevel
            ? sortable({ path: node.path, value: 0, total: false }, node.label)
            : html`<th part="header" role="columnheader" class="group" colspan=${pivotLeaves(node).length * valueCount || valueCount}>${node.label}</th>`,
        )}
          ${
          level === 0 && showColumnTotal
            ? valueRow
              ? html`<th part="header" role="columnheader" class="group total" colspan=${valueCount} rowspan=${columnDepth}>${this.msg.t('total')}</th>`
              : sortable({ path: [], value: 0, total: true }, this.msg.t('total'))
            : nothing
        }
        </tr>`,
      )
    }
    if (valueRow) {
      lines.push(
        html`<tr role="row">
          ${!columnDepth ? html`<th class="corner" part="header" role="columnheader">${corner}</th>` : nothing}
          ${this.dataColumns.map((column) => sortable(column, this.valueLabel(this.values[column.value])))}
        </tr>`,
      )
    }
    return html`<thead>
      ${lines}
    </thead>`
  }

  private renderCell(row: Row, rowIndex: number, column: Column, columnIndex: number) {
    const value = row.values ? this.cellValue(row, column) : null
    const text = row.values ? this.formatted(row, column) : ''
    let heat = ''
    let hot = false
    if (this.heatmap && row.kind === 'leaf' && !column.total && value !== null) {
      const range = this.heat[column.value]
      const share = range && range.max > range.min ? (value - range.min) / (range.max - range.min) : 1
      heat = `--_heat: ${(share * 100).toFixed(1)}%`
      hot = share > 0.55
    }
    return html`<td
      part="cell"
      role="gridcell"
      class="${column.total ? 'total' : ''} ${heat ? 'heat' : ''} ${hot ? 'hot' : ''} ${row.values && value === null ? 'empty' : ''}"
      style=${heat}
      data-cell="${rowIndex}:${columnIndex + 1}"
      tabindex=${this.cursor.row === rowIndex && this.cursor.column === columnIndex + 1 ? 0 : -1}
      @click=${() => {
        this.cursor = { row: rowIndex, column: columnIndex + 1 }
        this.clickCell(row, column)
      }}
    >
      ${row.values ? (value === null ? '—' : text) : nothing}
    </td>`
  }

  private renderRow(row: Row, index: number) {
    const group = row.kind === 'group' || row.kind === 'collapsed'
    const open = row.kind === 'group'
    const siblings =
      row.node && row.kind !== 'subtotal' && row.kind !== 'grand'
        ? this.bodyRows.filter(
            (other) =>
              other.depth === row.depth &&
              other.kind !== 'subtotal' &&
              other.kind !== 'grand' &&
              other.node?.path.slice(0, -1).join(KEY) === row.node!.path.slice(0, -1).join(KEY),
          )
        : []
    const position = siblings.indexOf(row) + 1
    return html`<tr
      role="row"
      class="${row.kind}"
      aria-level=${row.depth}
      aria-expanded=${group ? String(open) : nothing}
      aria-setsize=${siblings.length || nothing}
      aria-posinset=${position || nothing}
    >
      <th
        part="row-header"
        role="rowheader"
        style="--_depth: ${row.depth - 1}"
        data-cell="${index}:0"
        tabindex=${this.cursor.row === index && this.cursor.column === 0 ? 0 : -1}
        @click=${() => {
          this.cursor = { row: index, column: 0 }
          if (group && row.node) this.toggle(row.node)
        }}
      >
        ${group ? html`<span class="toggle" aria-hidden="true">${open ? '▾' : '▸'}</span>` : html`<span class="toggle"></span>`}${this.rowLabel(row)}
      </th>
      ${this.dataColumns.map((column, columnIndex) => this.renderCell(row, index, column, columnIndex))}
    </tr>`
  }

  override render() {
    const ready = this.result && this.values.length && this.data.length
    return html`<div class="layout">
      ${this.configurable ? this.renderFieldList() : nothing}
      <div class="scroll" part="scroll">
        ${
          ready
            ? html`<table part="table" role="treegrid" aria-label=${this.label || this.msg.t('table')} @keydown=${this.onKeydown}>
                ${this.renderHead()}
                <tbody>
                  ${this.bodyRows.map((row, index) => this.renderRow(row, index))}
                </tbody>
              </table>`
            : html`<div class="empty-state">${this.msg.t('empty')}</div>`
        }
      </div>
      <div class="live" role="status">${this.announcement}</div>
    </div>`
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'c2-pivot-table': PivotTable
  }
}
