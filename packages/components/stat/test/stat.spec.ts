import { test, expect } from './fixture'

// Cover the states and transitions that matter, with real pointer and keyboard input and observable results.
// See tests/README.md; `npm test` runs the suites of changed packages.
test('renders value, label, icon and trend', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-stat')
  await expect(host).toContainText('2M+')
  await expect(host).toContainText('Instruments')
  await expect(host).toContainText('+12%')
  await expect(host.locator('[part="icon"]')).toBeVisible()
  await expect(host.locator('[part="icon"]')).toHaveCSS('color', 'rgb(21, 128, 61)')
})

test('shows slotted supporting context', async ({ page, scenario }) => {
  await scenario('description')
  await expect(page.getByText('Updated today')).toBeVisible()
})

test('shows a placeholder while the value is missing', async ({ page, scenario }) => {
  await scenario('no-value')
  const value = page.locator('c2-stat [part="value"]')
  await expect(value).toHaveText('--')
  await expect(value.locator('.placeholder')).toHaveCSS('opacity', '0.4')
  await page.locator('c2-stat').evaluate((el: HTMLElementTagNameMap['c2-stat']) => (el.value = '42'))
  await expect(value).toHaveText('42')
  await page.locator('c2-stat').evaluate((el: HTMLElementTagNameMap['c2-stat']) => (el.value = undefined))
  await expect(value).toHaveText('--')
})
