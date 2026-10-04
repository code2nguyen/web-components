import { expect, test, type Page } from '@playwright/test'
import { failOnConsoleErrors } from './console-guard'

// c2-table renders an unnamed role=grid in its shadow root and does not hand the host's aria-label to it (reported as a
// component gap), so the grid is found inside the table the app labelled.
const resultsGrid = (page: Page, label: string) => page.locator(`c2-table[aria-label="${label}"]`).getByRole('grid')
// The grid element itself is not focusable: Tab lands on its one roving tab stop, a cell (the first header at rest).
const gridTabStop = (page: Page, label: string) => resultsGrid(page, label).locator('[tabindex="0"]')

test.beforeEach(({ page }) => failOnConsoleErrors(page))

test('searches traces, opens detail, correlates logs, and restores return context', async ({ page }) => {
  await page.goto('./traces/?status=error&pageSize=50')
  await expect(page.getByRole('heading', { name: 'Trace explorer' })).toBeVisible()
  await expect(page.getByText(/traces\. Page 1 of/)).toBeVisible()
  await page.getByText('trace-00008', { exact: true }).click()
  await expect(page).toHaveURL(/\/traces\/trace-00008\?/)
  await expect(page.getByRole('heading', { name: /GET|POST|SELECT/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Complete span details' })).toBeVisible()
  await page.getByRole('link', { name: 'View correlated logs' }).click()
  await expect(page).toHaveURL(/\/logs\?trace=trace-00008/)
  await expect(page.getByText(/logs\. Page 1 of/)).toBeVisible()
})

test('supports keyboard table entry, pagination, selected log detail, and correlation', async ({ page }) => {
  await page.goto('./logs/?severity=error&pageSize=25')
  const grid = resultsGrid(page, 'Log search results')
  await expect(grid).toBeVisible()
  await gridTabStop(page, 'Log search results').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Full message' })).toBeVisible()
  const traceLink = page.getByRole('link', { name: /Open trace/ })
  if (await traceLink.count()) {
    await traceLink.click()
    await expect(page).toHaveURL(/\/traces\/trace-/)
    await page.getByRole('link', { name: 'Return to trace results' }).click()
    await expect(page).toHaveURL(/\/logs\?/)
  }
})

test('recovers from empty and simulated failure states', async ({ page }) => {
  await page.goto('./traces/?q=definitely-no-synthetic-trace')
  await expect(page.getByRole('heading', { name: 'No matching traces' })).toBeVisible()
  await page.getByRole('link', { name: 'Clear trace criteria' }).click()
  await expect(resultsGrid(page, 'Trace search results')).toBeVisible()

  await page.getByRole('button', { name: /Built with c2n/i }).click()
  // The demo state is a c2-select in the "Built with c2n" sheet; its options are c2-list-items (role=option through
  // ElementInternals, which getByRole does not read).
  await page.locator('c2-sheet c2-select[aria-label="Demo state"]').click()
  await page.locator('c2-sheet c2-list-item[value="error"]').click()
  await expect(page.getByRole('heading', { name: 'Trace search unavailable' })).toBeVisible()
  const failedUrl = page.url()
  await page.keyboard.press('Escape')
  await expect(page.locator('c2-sheet')).toHaveJSProperty('open', false)
  await page.getByRole('button', { name: 'Return to normal' }).click()
  await expect(page).toHaveURL(failedUrl)
  await expect(resultsGrid(page, 'Trace search results')).toBeVisible()
})
