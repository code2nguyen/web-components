import { expect, test, type Page } from '@playwright/test'

// Rows and menu items state their role through ElementInternals, which getByRole cannot see, so they are found by
// tag and text; the buttons inside the components' shadow roots are real buttons.
const table = (page: Page) => page.locator('c2-table')
const header = (page: Page, name: string) => table(page).getByRole('columnheader', { name })
const check = (page: Page, line: number) =>
  table(page)
    .getByRole('checkbox')
    .nth(line + 1)

test('the revenue total is formatted by c2-format-number', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('header c2-format-number')).toHaveText(/^\$[\d,]+\.\d{2}$/)
})

test('the Display popover hides columns and drops refunded orders', async ({ page }) => {
  await page.goto('./')
  await expect(header(page, 'Customer')).toBeVisible()
  const refunded = table(page).getByText('refunded', { exact: true })
  await expect(refunded.first()).toBeVisible()

  await page.getByRole('button', { name: 'Display' }).click()
  const panel = page.getByRole('dialog', { name: 'Display options' })
  await panel.getByRole('button', { name: 'Customer' }).click()
  await panel.getByRole('switch', { name: 'Refunded orders' }).click()

  await expect(header(page, 'Customer')).toHaveCount(0)
  await expect(refunded).toHaveCount(0)
})

test('the split button advances the checked orders, and its menu refunds them', async ({ page }) => {
  await page.goto('./')
  const bar = page.locator('c2-action-bar')

  await check(page, 0).click()
  await check(page, 1).click()
  await expect(bar).toHaveJSProperty('count', 2)

  await bar.getByRole('button', { name: /More .* options/ }).click()
  await page.locator('c2-menu-item[value="refunded"]').click()

  await expect(page.locator('c2-toast').filter({ hasText: '2 orders refunded' })).toBeVisible()
  await expect(bar).toHaveJSProperty('count', 0)
})

test('the main half of the split button runs the common action', async ({ page }) => {
  await page.goto('./')

  await check(page, 0).click()
  await page.locator('c2-action-bar').getByRole('button', { name: 'Advance status', exact: true }).click()

  await expect(page.locator('c2-toast').filter({ hasText: '1 order advanced' })).toBeVisible()
})

test('a menu status never moves an order backwards or undoes a refund', async ({ page }) => {
  await page.goto('./')
  // Sorted by id, ORD-4822 (shipped) and ORD-4825 (refunded) sit at lines 1 and 4.
  await header(page, 'Order').click()
  await check(page, 1).click() // ORD-4822, shipped
  await check(page, 4).click() // ORD-4825, refunded

  await page
    .locator('c2-action-bar')
    .getByRole('button', { name: /More .* options/ })
    .click()
  await page.locator('c2-menu-item[value="paid"]').click()

  await expect(page.locator('c2-toast').filter({ hasText: '0 orders marked paid' })).toContainText('2 left as they were')
  await expect(table(page).getByText('shipped', { exact: true }).first()).toBeVisible()
})

test('the Refunded tab shows refunded orders even while Display hides them', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'Display' }).click()
  await page.getByRole('dialog', { name: 'Display options' }).getByRole('switch', { name: 'Refunded orders' }).click()
  await page.keyboard.press('Escape')
  await expect(table(page).getByText('refunded', { exact: true })).toHaveCount(0)

  await page.locator('c2-tab', { hasText: 'Refunded' }).click()
  await expect(table(page).getByText('refunded', { exact: true }).first()).toBeVisible()
})
