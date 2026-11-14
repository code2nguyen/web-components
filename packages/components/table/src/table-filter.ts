import { html, nothing } from 'lit'
import { live } from 'lit/directives/live.js'
import '@c2n/facet-list'
import '@c2n/overlay'
import '@c2n/button'
import type { Table } from './table.js'
import { columnKey, filterText } from './table-shared.js'
import type { SortDirection, TableColumnConfig, TableFilterChangeEventDetail, TableFilters, TableRow } from './table-types.js'

/**
 * The column filter of `c2-table` (`filterable`), loaded the first time a header's filter opens, with the components
 * it is made of: a `c2-facet-list` of the column's values with their counts, in a `c2-overlay`. One popover serves
 * every column. The table keeps the filtering itself, so `filters` set from markup apply before this module loads.
 */

/** What the table hands the module. */
export interface TableFilterHost {
  table: Table
  /** The rows every filter but column `id`'s lets through: the rows whose values the column's list counts. */
  rowsFor(id: string): TableRow[]
  cellValue(row: TableRow, column: TableColumnConfig): unknown
  formatValue(column: TableColumnConfig, value: unknown): string
  /** Whether the column may be sorted: the filter offers its two sorts only then. */
  sortable(column: TableColumnConfig): boolean
  sort(column: TableColumnConfig, direction: SortDirection): void
  message(key: 'filterBlank' | 'sortAscending' | 'sortDescending' | 'clearFilter', ...args: string[]): string
}

interface FacetValue {
  value: string
  label: string
  count: number
}

export class TableFilter {
  /** The id of the column whose filter is open. */
  openColumn?: string
  #column?: TableColumnConfig
  #anchor?: HTMLElement
  #values: FacetValue[] = []
  /** Set while a click opens a filter: the light dismiss of the one open before it must not close the new one. */
  #opening = false

  constructor(private readonly host: TableFilterHost) {}

  /** Opens the filter of `column` under `anchor`, its header's button: the values and counts are taken now. */
  open(column: TableColumnConfig, anchor: HTMLElement) {
    const id = columnKey(column)
    const counts = new Map<string, { label: string; count: number }>()
    for (const row of this.host.rowsFor(id)) {
      const value = this.host.cellValue(row, column)
      const text = filterText(value)
      const entry = counts.get(text)
      if (entry) entry.count++
      else counts.set(text, { label: text === '' ? this.host.message('filterBlank') : this.host.formatValue(column, value), count: 1 })
    }
    this.#values = [...counts].map(([value, { label, count }]) => ({ value, label, count }))
    // A data source's rows are not here: its values are the ones the column declares, with no count.
    for (const option of counts.size ? [] : (column.options ?? [])) {
      const value = typeof option === 'object' ? option.value : option
      const label = typeof option === 'object' ? option.label : undefined
      this.#values.push({ value: filterText(value), label: label ?? this.host.formatValue(column, value), count: 0 })
    }
    this.#column = column
    this.#anchor = anchor
    this.openColumn = id
    this.#opening = true
    setTimeout(() => (this.#opening = false))
    const table = this.host.table
    table.requestUpdate()
    // The panel is a dialog: the focus moves into it, on the search field of the values.
    void table.updateComplete.then(() => {
      const facets = table.shadowRoot?.querySelector<HTMLElement>('.filter-panel c2-facet-list')
      void (facets as (HTMLElement & { updateComplete?: Promise<unknown> }) | null)?.updateComplete?.then(() => {
        const field = facets?.shadowRoot?.querySelector<HTMLElement>('input, [tabindex]:not([tabindex="-1"]), button')
        ;(field ?? facets)?.focus({ preventScroll: true })
      })
    })
  }

  /** The popover, drawn at the end of the table's shadow root; nothing until a filter first opens. */
  render(): unknown {
    const column = this.#column
    if (!column) return nothing
    const id = columnKey(column)
    const filter = this.host.table.filters?.[id] ?? {}
    return html`<c2-overlay
      class="filter-popover"
      part="filter"
      placement="bottom-start"
      free-width
      .anchor=${this.#anchor}
      .open=${live(this.openColumn === id)}
      @toggle=${(event: Event) => {
        if ((event as ToggleEvent).newState !== 'closed' || this.openColumn !== id) return
        // The light dismiss of the filter open before this one: show this one again.
        if (this.#opening) this.host.table.requestUpdate()
        else this.#close()
      }}
    >
      <div class="filter-panel" role="dialog" aria-label=${column.header ?? column.field}>
        ${
          this.host.sortable(column)
            ? html`<div class="filter-actions">
                <c2-button class="filter-action" @click=${() => this.#sort(column, 'asc')}>${this.host.message('sortAscending')}</c2-button>
                <c2-button class="filter-action" @click=${() => this.#sort(column, 'desc')}>${this.host.message('sortDescending')}</c2-button>
              </div>`
            : nothing
        }
        <c2-facet-list
          label=${column.header ?? column.field}
          searchable
          sort="label"
          .values=${this.#values}
          .include=${filter.include ?? []}
          .exclude=${filter.exclude ?? []}
          @filter-change=${(event: CustomEvent<{ include: string[]; exclude: string[] }>) => this.#apply(id, event.detail.include, event.detail.exclude)}
        ></c2-facet-list>
        <div class="filter-actions">
          <c2-button class="filter-action" ?disabled=${!filter.include?.length && !filter.exclude?.length} @click=${() => this.#apply(id, [], [])}
            >${this.host.message('clearFilter')}</c2-button
          >
        </div>
      </div>
    </c2-overlay>`
  }

  #sort(column: TableColumnConfig, direction: SortDirection) {
    this.host.sort(column, direction)
    this.#close()
  }

  /** Writes the column's filter into `filters` (dropping it when it keeps everything) and reports it. */
  #apply(id: string, include: string[], exclude: string[]) {
    const table = this.host.table
    const filters: TableFilters = { ...table.filters }
    if (include.length || exclude.length) filters[id] = { include: [...include], exclude: [...exclude] }
    else delete filters[id]
    table.filters = filters
    table.dispatchEvent(new CustomEvent<TableFilterChangeEventDetail>('filter-change', { detail: { filters, column: id }, bubbles: true, composed: true }))
  }

  /**
   * Closes the popover. The focus goes back to the column's header when it was in the panel (Escape, a sort) or lost
   * with it, never away from what a click outside the panel landed on.
   */
  #close() {
    const anchor = this.#anchor
    const root = this.host.table.shadowRoot
    const focused = root?.activeElement
    const inPanel = Boolean(focused?.closest('.filter-popover'))
    this.openColumn = undefined
    this.host.table.requestUpdate()
    const active = document.activeElement
    if (inPanel || active === null || active === document.body) anchor?.closest<HTMLElement>('.cell--header')?.focus()
  }
}
