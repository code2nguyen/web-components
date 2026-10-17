import { html } from 'lit'
import type { ContextMenu, ContextMenuContext } from '@c2n/components/context-menu'
import type { Spreadsheet, SpreadsheetContextMenuData } from '@c2n/components/spreadsheet'

/**
 * Makes the spreadsheet's right-click example live: `[data-spreadsheet-demo="context-menu"]` is a `c2-context-menu`
 * around a `c2-spreadsheet`, and builds its rows from the area that was right-clicked, then calls the sheet's
 * insert and delete methods.
 */

const seeded = new WeakSet<Element>()

const plural = (count: number, one: string, many: string) => (count === 1 ? one : `${count} ${many}`)

export function renderSheetMenu({ data, source }: ContextMenuContext) {
  if (source?.localName !== 'c2-spreadsheet') return null
  const { area, start, end } = data as SpreadsheetContextMenuData
  const rows = end.row - start.row + 1
  const columns = end.column - start.column + 1
  const rowItems = html`
    <c2-menu-item value="row-above">Insert ${plural(rows, 'row', 'rows')} above</c2-menu-item>
    <c2-menu-item value="row-below">Insert ${plural(rows, 'row', 'rows')} below</c2-menu-item>
  `
  const columnItems = html`
    <c2-menu-item value="column-left">Insert ${plural(columns, 'column', 'columns')} left</c2-menu-item>
    <c2-menu-item value="column-right">Insert ${plural(columns, 'column', 'columns')} right</c2-menu-item>
  `
  const deleteRows = html`<c2-menu-item value="delete-rows" destructive>Delete ${plural(rows, 'row', 'rows')}</c2-menu-item>`
  const deleteColumns = html`<c2-menu-item value="delete-columns" destructive>Delete ${plural(columns, 'column', 'columns')}</c2-menu-item>`
  if (area === 'row')
    return html`${rowItems}
      <hr />
      ${deleteRows}`
  if (area === 'column')
    return html`${columnItems}
      <hr />
      ${deleteColumns}`
  return html`${rowItems}${columnItems}
    <hr />
    ${deleteRows}${deleteColumns}`
}

export function runSheetCommand(sheet: Spreadsheet, value: string, { start, end }: SpreadsheetContextMenuData): void {
  const rows = end.row - start.row + 1
  const columns = end.column - start.column + 1
  if (value === 'row-above') sheet.insertRows(start.row, rows)
  else if (value === 'row-below') sheet.insertRows(end.row + 1, rows)
  else if (value === 'column-left') sheet.insertColumns(start.column, columns)
  else if (value === 'column-right') sheet.insertColumns(end.column + 1, columns)
  else if (value === 'delete-rows') sheet.deleteRows(start.row, rows)
  else if (value === 'delete-columns') sheet.deleteColumns(start.column, columns)
}

function seedExamples(): void {
  document.querySelectorAll<ContextMenu>('c2-context-menu[data-spreadsheet-demo="context-menu"]').forEach((menu) => {
    if (seeded.has(menu)) return
    seeded.add(menu)
    menu.renderContextMenu = renderSheetMenu
    menu.addEventListener('context-menu-select', ({ detail }) => {
      const sheet = detail.context.source as Spreadsheet | null
      if (sheet?.localName === 'c2-spreadsheet') runSheetCommand(sheet, String(detail.value), detail.context.data as SpreadsheetContextMenuData)
    })
  })
}

void customElements.whenDefined('c2-context-menu').then(() => {
  seedExamples()
  new MutationObserver(seedExamples).observe(document.documentElement, { childList: true, subtree: true })
  document.addEventListener('astro:page-load', seedExamples)
})
