import { html } from 'lit'
import type { ContextMenu, ContextMenuContext } from '@c2n/components/context-menu'
import type { Table } from '@c2n/components/table'
import type { TableCellEventDetail } from '@c2n/components/table'

/**
 * Makes the context-menu examples live. `[data-context-menu-demo="table"]` builds a menu per right-clicked cell with
 * `renderContextMenu` and acts on the choice; `[data-context-menu-demo="canvas"]` reports which command of its static
 * menu ran. Each writes what happened into the `output` next to it.
 */

const seeded = new WeakSet<Element>()

function renderCellMenu({ data, source }: ContextMenuContext) {
  // Anything but a body cell (the header, the empty space under the rows) gets no menu.
  if (source?.localName !== 'c2-table') return null
  const cell = data as TableCellEventDetail
  const header = cell.column.header ?? cell.column.field
  return html`
    <h6>${cell.row.symbol as string} · ${header}</h6>
    <c2-menu-item value="copy">Copy “${String(cell.value)}”</c2-menu-item>
    <c2-menu-item value="filter">Show only ${header} = ${String(cell.value)}</c2-menu-item>
    <hr />
    <c2-menu-item value="remove" destructive>Remove ${cell.row.symbol as string}</c2-menu-item>
  `
}

function seedExamples(): void {
  document.querySelectorAll<ContextMenu>('c2-context-menu[data-context-menu-demo]').forEach((menu) => {
    if (seeded.has(menu)) return
    seeded.add(menu)
    const output = menu.parentElement?.querySelector('output')
    const say = (text: string) => {
      if (output) output.textContent = text
    }

    if (menu.dataset.contextMenuDemo === 'canvas') {
      menu.addEventListener('context-menu-select', ({ detail }) => say(`${detail.value} at ${Math.round(detail.context.x)}, ${Math.round(detail.context.y)}`))
      return
    }

    const table = menu.querySelector<Table>('c2-table')
    if (!table) return
    const allRows = table.rows
    menu.addEventListener('context-menu-select', ({ detail }) => {
      const cell = detail.context.data as TableCellEventDetail
      const field = cell.column.field
      if (detail.value === 'copy') {
        void navigator.clipboard?.writeText(String(cell.value)).catch(() => {})
        say(`Copied ${String(cell.value)}`)
      } else if (detail.value === 'filter') {
        table.rows = allRows.filter((row) => row[field] === cell.value)
        say(`Showing ${field} = ${String(cell.value)} · right-click and pick “Show all” to reset`)
      } else if (detail.value === 'remove') {
        table.rows = table.rows.filter((row) => row !== cell.row)
        say(`Removed ${cell.row.symbol as string}`)
      } else if (detail.value === 'reset') {
        table.rows = allRows
        say('Showing every row')
      }
    })
    // Once filtered, every cell's menu offers the way back.
    menu.renderContextMenu = (context) => {
      const rows = renderCellMenu(context)
      if (!rows || table.rows.length === allRows.length) return rows
      return html`${rows}<c2-menu-item value="reset">Show all rows</c2-menu-item>`
    }
  })
}

void customElements.whenDefined('c2-context-menu').then(() => {
  seedExamples()
  new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('astro:page-load', seedExamples)
})
