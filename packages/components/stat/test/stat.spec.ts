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
