import { test, expect, accessible } from '../../../../tests/component-fixture'

test('click and keyboard expand and collapse content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  const summary = page.locator('summary')
  await expect(page.getByText('Arrives tomorrow')).not.toBeVisible()
  await summary.click()
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await summary.press('Enter')
  await expect(page.getByText('Arrives tomorrow')).not.toBeVisible()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  await accessible(page)
})
test('disabled disclosure ignores pointer and keyboard activation', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Locked" disabled>Secret</c2-details>')
  await page.locator('summary').click()
  await page.locator('summary').press('Space')
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})
test('interactive header content does not toggle the panel', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Settings"><button slot="header-content">Edit</button>Panel</c2-details>')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})
