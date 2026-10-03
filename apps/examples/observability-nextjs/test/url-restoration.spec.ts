import { expect, test, type Page } from '@playwright/test'
import { failOnConsoleErrors } from './console-guard'

// c2-table renders an unnamed role=grid in its shadow root and does not hand the host's aria-label to it (reported as a
// component gap), so the grid is found inside the table the app labelled.
const resultsGrid = (page: Page, label: string) => page.locator(`c2-table[aria-label="${label}"]`).getByRole('grid')
// The grid element itself is not focusable: Tab lands on its one roving tab stop, a cell (the first header at rest).
const gridTabStop = (page: Page, label: string) => resultsGrid(page, label).locator('[tabindex="0"]')

test.beforeEach(({ page }) => failOnConsoleErrors(page))

test('copied and reloaded trace URLs restore valid filters, sorting, page, and size', async ({ page, context }) => {
  const query = 'status=ok&sort=duration&dir=asc&page=2&pageSize=25'
  await page.goto(`./traces/?${query}`)
  await expect(page.getByText(/Page 2 of/)).toBeVisible()
  const copied = page.url()
  await page.reload()
  await expect(page).toHaveURL(copied)
  await expect(page.getByText(/Page 2 of/)).toBeVisible()

  const fresh = await context.newPage()
  await fresh.goto(copied)
  await expect(fresh.getByText(/Page 2 of/)).toBeVisible()
  await fresh.close()
})

test('URL scope wins over browser preferences and malformed neighbors recover independently', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'c2n-observability:v1:scope',
      JSON.stringify({ schemaVersion: 1, updatedAt: '2026-09-21T12:00:00.000Z', data: { environmentId: 'production', pageSize: 25 } }),
    ),
  )
  await page.goto('./logs/?env=staging&severity=error&page=oops&pageSize=50')
  await expect(page.getByText(/logs\. Page 1 of/)).toBeVisible()
  await expect(page.locator('c2-pagination')).toHaveJSProperty('pageSize', 50)
  await expect(page.locator('c2-select[aria-label="Environment"]')).toHaveAttribute('value', /staging/)
})

test('back and forward restore the same log result context and selected record', async ({ page }) => {
  await page.goto('./logs/?severity=error&pageSize=100&page=1')
  await gridTabStop(page, 'Log search results').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/[?&]log=/)
  const selected = page.url()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page).not.toHaveURL(selected)
  await page.goBack()
  await expect(page).toHaveURL(selected)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('primary navigation and the brand preserve exact global scope', async ({ page }) => {
  const from = '2026-08-17T12:00:00.000Z'
  const to = '2026-08-17T13:00:00.000Z'
  await page.goto(`./services/?env=staging&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  await page.getByRole('link', { name: 'Traces' }).click()
  await expect(page).toHaveURL(new RegExp(`traces/?\\?env=staging&from=${encodeURIComponent(from)}`))
  await page.getByRole('link', { name: 'Signal Forge overview' }).click()
  await expect(page).toHaveURL(new RegExp(`observability-nextjs/?\\?env=staging&from=${encodeURIComponent(from)}`))
})

test('trace operation survives detail navigation and explicit return', async ({ page }) => {
  await page.goto(`./traces/?operation=${encodeURIComponent('POST /v1/checkout')}&pageSize=50`)
  // The hidden .table-fallback links are the no-JavaScript path; with JavaScript a table row opens the trace.
  await page.locator('c2-table').getByRole('row').filter({ hasText: 'POST /v1/checkout' }).first().click()
  await expect(page).toHaveURL(/\/traces\/trace-/)
  await page.getByRole('link', { name: 'Return to trace results' }).click()
  await expect(page).toHaveURL(/operation=POST(?:\+|%20)%2Fv1%2Fcheckout/)
  await expect(page.locator('c2-select[aria-label="Filter traces by operation"]')).toHaveJSProperty('value', ['POST /v1/checkout'])
})
