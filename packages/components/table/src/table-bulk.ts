import { html, nothing } from 'lit'
import '@c2n/menu'
import type { Table } from './table.js'

/**
 * The bulk selection menu of `c2-table` (`bulk-select`), loaded the first time its caret opens, with `c2-menu`: select
 * the page on show, select every row, or clear the selection. The table keeps the selection itself.
 */

/** What the table hands the module. */
export interface TableBulkHost {
  table: Table
  /** The rows on the page on show (undefined when the table is not paged) and every row. */
  counts(): { page?: number; all: number }
  /** A count in the table's language. */
  formatCount(count: number): string
  message(key: 'selectPageRows' | 'selectAllCount' | 'clearSelection' | 'selectionOptions', ...args: unknown[]): string
}

export class TableBulk {
  /** Whether the menu is open. */
  isOpen = false
  #anchor?: HTMLElement
  #counts: { page?: number; all: number } = { all: 0 }

  constructor(private readonly host: TableBulkHost) {}

  /** Opens the menu under `anchor`, the caret, with the counts taken now. */
  open(anchor: HTMLElement) {
    this.#anchor = anchor
    this.#counts = this.host.counts()
    this.isOpen = true
    this.host.table.requestUpdate()
  }

  render(): unknown {
    if (!this.#anchor) return nothing
    const format = (count: number) => this.host.formatCount(count)
    const { page, all } = this.#counts
    return html`<c2-menu
      class="bulk-menu"
      part="bulk-menu"
      aria-label=${this.host.message('selectionOptions')}
      placement="bottom-start"
      .anchor=${this.#anchor}
      ?open=${this.isOpen}
      @toggle=${(event: ToggleEvent) => {
        if (event.newState === 'closed') this.#close()
      }}
      @menu-select=${(event: CustomEvent<{ value: string }>) => this.#select(event.detail.value)}
    >
      ${page === undefined ? nothing : html`<c2-menu-item value="page">${this.host.message('selectPageRows', format(page))}</c2-menu-item>`}
      <c2-menu-item value="all">${this.host.message('selectAllCount', format(all))}</c2-menu-item>
      <c2-menu-item value="none">${this.host.message('clearSelection')}</c2-menu-item>
    </c2-menu>`
  }

  #select(value: string) {
    const table = this.host.table
    if (value === 'page') table.selectPage()
    else if (value === 'all') table.selectAll()
    else table.clearSelection()
    this.#close()
  }

  /**
   * Closes the menu. The focus goes back to the header cell when it was in the menu (a choice, Escape) or lost with
   * it, never away from what a click outside the menu landed on.
   */
  #close() {
    if (!this.isOpen) return
    // In the menu, or back on the caret where the menu returns it: the grid's focus belongs on the header cell.
    const focused = this.host.table.shadowRoot?.activeElement
    const inMenu = Boolean(focused?.closest('.bulk-menu')) || focused === this.#anchor
    this.isOpen = false
    this.host.table.requestUpdate()
    const active = document.activeElement
    if (inMenu || active === null || active === document.body) this.#anchor?.closest<HTMLElement>('.cell--header')?.focus()
  }
}
