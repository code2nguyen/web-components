import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const ROWS = Array.from({ length: 12 }, (_, index) => ({ id: `r${index + 1}`, name: `Row ${index + 1}` }))

const paged = (extra = '') =>
  `<c2-table style="height:320px;width:420px" row-key="id" aria-label="Rows" selection="multiple" checkbox-selection paginated page-size="5" rows='${JSON.stringify(ROWS)}' ${extra}>
  <c2-table-column field="name" header="Name" width="200px"></c2-table-column>
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const header = (page: Page) => table(page).locator('[part~="selection-header-cell"] c2-checkbox')
const caret = (page: Page) => table(page).locator('[part="bulk-select-button"]')
const menu = (page: Page) => table(page).locator('[part="bulk-menu"]')

async function watch(page: Page) {
  await table(page).evaluate((element) => {
    const events: unknown[] = []
    element.addEventListener('selection-change', (event) => {
      const { value, scope } = (event as CustomEvent<{ value: string[]; scope: string }>).detail
      events.push({ count: value.length, scope })
      element.setAttribute('data-events', JSON.stringify(events))
    })
  })
}
const events = async (page: Page) => JSON.parse((await table(page).getAttribute('data-events')) ?? '[]')

test('the header checkbox adds the page on show and keeps the other pages, and getSelectedRows returns rows from all pages', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(paged('page="2"'))
  await watch(page)
  await header(page).click()
  await expect(table(page)).toHaveJSProperty('value', ['r6', 'r7', 'r8', 'r9', 'r10'])
  await expect(table(page)).toHaveJSProperty('selectionScope', 'page')
  await table(page).evaluate((element: HTMLElement & { page: number }) => (element.page = 1))
  // Nothing on page 1 is selected: neither checked nor mixed.
  await expect(header(page)).not.toHaveAttribute('checked')
  await expect(header(page)).not.toHaveAttribute('indeterminate')
  await header(page).click()
  const rows = await table(page).evaluate((element: HTMLElement & { getSelectedRows(): Array<{ id: string }> }) =>
    element.getSelectedRows().map((row) => row.id),
  )
  expect(rows).toHaveLength(10)
  // Unchecking takes page 1 out and leaves page 2 selected.
  await header(page).click()
  await expect(table(page)).toHaveJSProperty('value', ['r6', 'r7', 'r8', 'r9', 'r10'])
  expect(await events(page)).toEqual([
    { count: 5, scope: 'page' },
    { count: 10, scope: 'rows' },
    { count: 5, scope: 'rows' },
  ])
  await expect(caret(page)).toHaveCount(0)
})

test('bulk-select opens a menu of this page, all N and none, loaded on first use, with the counts and a scope', async ({ page, renderScenario }) => {
  await renderScenario(paged('bulk-select'))
  await watch(page)
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('table-bulk')))
  expect(loaded).toBe(false)
  await expect(caret(page)).toHaveAttribute('aria-expanded', 'false')
  await caret(page).click()
  await expect(menu(page)).toHaveAttribute('open', '')
  await expect(menu(page).locator('c2-menu-item')).toHaveText([/Select this page \(5\)/, /Select all 12/, /Clear selection/])
  await menu(page).locator('c2-menu-item[value="all"]').click()
  await expect(table(page)).toHaveJSProperty('selectionScope', 'all')
  await expect(header(page)).toHaveAttribute('checked', '')
  await caret(page).click()
  await menu(page).locator('c2-menu-item[value="none"]').click()
  await expect(table(page)).toHaveJSProperty('value', [])
  expect(await events(page)).toEqual([
    { count: 12, scope: 'all' },
    { count: 0, scope: 'rows' },
  ])
  await accessible(page)
})

test('a row toggled by hand makes the scope rows again, and the caret menu speaks French', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${paged('bulk-select')}</div>`)
  await expect(header(page)).toHaveAttribute('aria-label', 'Tout sélectionner')
  await caret(page).click()
  await expect(menu(page).locator('c2-menu-item').first()).toHaveText(/Sélectionner cette page \(5\)/)
  await menu(page).locator('c2-menu-item[value="page"]').click()
  await table(page).locator('.row--body').first().locator('c2-checkbox').click()
  await expect(table(page)).toHaveJSProperty('selectionScope', 'rows')
  await expect(table(page)).toHaveJSProperty('value', ['r2', 'r3', 'r4', 'r5'])
})

test('with a data source, select all marks the rows that arrive later as selected', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:320px;width:420px" row-key="id" aria-label="Remote" selection="multiple" checkbox-selection paginated page-size="5" bulk-select>
  <c2-table-column field="name" header="Name" width="200px"></c2-table-column>
</c2-table>`)
  await table(page).evaluate((element: HTMLElement & { dataSource: unknown }) => {
    const rows = Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, name: `Source ${index}` }))
    element.dataSource = {
      getRows: ({ start, count }: { start: number; count: number }) => Promise.resolve({ rows: rows.slice(start, start + count), total: rows.length }),
    }
  })
  await expect(table(page).locator('.row--body')).toHaveCount(5)
  await caret(page).click()
  await expect(menu(page).locator('c2-menu-item[value="all"]')).toHaveText(/Select all 30/)
  await menu(page).locator('c2-menu-item[value="all"]').click()
  await table(page).evaluate((element: HTMLElement & { page: number }) => (element.page = 3))
  const first = table(page).locator('.row--body').first()
  await expect(first).toContainText('Source 10')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await expect(first.locator('c2-checkbox')).toHaveAttribute('checked', '')
  // Unticking one row turns "all" into the loaded rows less that one.
  await first.locator('c2-checkbox').click()
  await expect(table(page)).toHaveJSProperty('selectionScope', 'rows')
  const value = await table(page).evaluate((element: HTMLElement & { value: string[] }) => element.value)
  expect(value).toHaveLength(9)
  expect(value).not.toContain('s10')
})

test('the caret closes its own menu, Alt+ArrowDown opens it, and a value set by the app makes the scope rows', async ({ page, renderScenario }) => {
  await renderScenario(paged('bulk-select'))
  await caret(page).click()
  await expect(menu(page)).toHaveAttribute('open', '')
  await caret(page).click()
  await expect(menu(page)).not.toHaveAttribute('open', '')
  await table(page).locator('[part~="selection-header-cell"]').focus()
  await page.keyboard.press('Alt+ArrowDown')
  await expect(menu(page)).toHaveAttribute('open', '')
  await page.keyboard.press('Escape')
  await expect(table(page).locator('[part~="selection-header-cell"]')).toBeFocused()

  await table(page).evaluate((element: HTMLElement & { selectAll(): void }) => element.selectAll())
  await expect(table(page)).toHaveJSProperty('selectionScope', 'all')
  await table(page).evaluate((element: HTMLElement & { value: string[] }) => (element.value = ['r1']))
  await expect(table(page)).toHaveJSProperty('selectionScope', 'rows')
  await expect(header(page)).toHaveAttribute('indeterminate', '')
})
