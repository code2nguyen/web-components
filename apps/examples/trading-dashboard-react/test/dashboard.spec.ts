import { expect, test, type Page } from '@playwright/test'

// Table rows state their role through ElementInternals, which getByRole cannot see, so rows are found by text; the
// checkboxes and buttons inside the components' shadow roots are real controls.
const table = (page: Page) => page.locator('c2-table')
const check = (page: Page, line: number) =>
  table(page)
    .getByRole('checkbox')
    .nth(line + 1)
const ticket = (page: Page) => page.locator('c2-modal')

test('the totals are formatted by c2-format-number inside c2-stat', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('c2-stat', { hasText: 'Market value' }).locator('c2-format-number')).toHaveText(/^\$[\d,]+$/)
  await expect(page.locator('c2-stat', { hasText: 'Selected' })).toContainText('—')
})

test('the order ticket rejects selling more than is held, then fills the order', async ({ page }) => {
  await page.goto('./')
  // Stop the ticks so the row under test does not move.
  await page.locator('c2-switch').click()

  await check(page, 0).click()
  const bar = page.locator('c2-action-bar')
  await expect(bar).toHaveJSProperty('count', 1)
  await bar.getByRole('button', { name: 'Trade…' }).click()

  await expect(ticket(page)).toHaveJSProperty('open', true)
  await ticket(page).locator('c2-button', { hasText: 'Sell' }).click()
  await ticket(page).locator('c2-number-input input').fill('99999')
  await ticket(page).locator('c2-button', { hasText: 'Place order' }).click()
  await expect(ticket(page).getByText('You hold 1,400 shares of ACME.', { exact: true })).toBeVisible()

  await ticket(page).locator('c2-number-input input').fill('400')
  await ticket(page).locator('c2-button', { hasText: 'Place order' }).click()

  await expect(page.locator('c2-toast').filter({ hasText: 'Sold 400 ACME' })).toBeVisible()
  await expect(ticket(page)).toHaveCount(0)
  await expect(bar).toHaveJSProperty('count', 0)
  await expect(table(page).getByText('1,000', { exact: true })).toBeVisible()
})

test('the action bar clears the selection', async ({ page }) => {
  await page.goto('./')
  await check(page, 0).click()
  await check(page, 1).click()
  const bar = page.locator('c2-action-bar')
  await expect(bar).toHaveJSProperty('count', 2)

  await bar.getByRole('button', { name: /clear/i }).click()
  await expect(bar).toHaveJSProperty('count', 0)
  await expect(page.locator('c2-stat', { hasText: 'Selected' })).toContainText('—')
})

test('a checked row the filter hides leaves the action bar', async ({ page }) => {
  await page.goto('./')
  await check(page, 0).click()
  const bar = page.locator('c2-action-bar')
  await expect(bar).toHaveJSProperty('count', 1)

  await page.locator('c2-text-field input').fill('BLTZ')
  await expect(bar).toHaveJSProperty('count', 0)
})

test('selling a whole position closes it', async ({ page }) => {
  await page.goto('./')
  await page.locator('c2-switch').click()
  await check(page, 0).click()
  await page.locator('c2-action-bar').getByRole('button', { name: 'Trade…' }).click()

  await ticket(page).locator('c2-button', { hasText: 'Sell' }).click()
  await ticket(page).locator('c2-number-input input').fill('1400')
  await ticket(page).locator('c2-button', { hasText: 'Place order' }).click()

  await expect(page.locator('c2-toast').filter({ hasText: 'Sold 1,400 ACME' })).toBeVisible()
  await expect(table(page).getByText('ACME', { exact: true })).toHaveCount(0)
})
