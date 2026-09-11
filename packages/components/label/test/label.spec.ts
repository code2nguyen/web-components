import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('click focuses a native input and supplies its accessible name', async ({ page, renderScenario }) => {
  await renderScenario('<c2-label for="name" required>Name</c2-label><input id="name" />')
  await page.locator('c2-label').click()
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
  await expect(page.locator('[part="required-indicator"]')).toHaveAttribute('aria-hidden', 'true')
  await accessible(page)
})
test('labels toggle custom checkboxes and disabled labels do nothing', async ({ page, renderScenario }) => {
  await renderScenario('<c2-label for="terms">Accept terms</c2-label><c2-checkbox id="terms" aria-label="Accept terms"></c2-checkbox>')
  await page.locator('c2-label').click()
  await expect(page.getByRole('checkbox')).toBeChecked()
  await props(page.locator('c2-label'), { disabled: true })
  await page.locator('c2-label').click()
  await expect(page.getByRole('checkbox')).toBeChecked()
})
test('repointing and disconnecting clean up only owned label references', async ({ page, renderScenario }) => {
  await renderScenario('<c2-label id="label" for="first">Name</c2-label><input id="first" /><input id="second" aria-label="Second" />')
  const label = page.locator('c2-label')
  await props(label, { for: 'second' })
  await expect(page.locator('#first')).not.toHaveAttribute('aria-labelledby')
  await expect(page.locator('#second')).toHaveAttribute('aria-labelledby', 'label')
  await label.evaluate((el) => el.remove())
  await expect(page.locator('#second')).not.toHaveAttribute('aria-labelledby')
})
