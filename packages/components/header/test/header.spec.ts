import { test, expect } from './fixture'

// Cover the states and transitions that matter, with real pointer and keyboard input and observable results.
// See tests/README.md; `npm test` runs the suites of changed packages.
test('renders a named navigation landmark and every shell slot', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('navigation', { name: 'Product' })).toBeVisible()
  await expect(page.getByText('Northstar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
})

test('supports sticky and blurred surface treatments', async ({ page, scenario }) => {
  await scenario('glass')
  await expect(page.locator('c2-header')).toHaveCSS('position', 'sticky')
  await expect(page.locator('[part="header"]')).toHaveCSS('backdrop-filter', 'blur(16px)')
  await expect(page.locator('[part="content"]')).toHaveCSS('max-width', '640px')
})
