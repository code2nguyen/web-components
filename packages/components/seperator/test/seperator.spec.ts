import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('semantic separators expose orientation and a slotted label', async ({ page, renderScenario }) => {
  await renderScenario('<c2-seperator>Or continue</c2-seperator>')
  await expect(page.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  await expect(page.getByText('Or continue')).toBeVisible()
  await props(page.locator('c2-seperator'), { orientation: 'vertical' })
  await expect(page.getByRole('separator')).toHaveAttribute('aria-orientation', 'vertical')
  await accessible(page)
})
test('decorative mode removes separator semantics', async ({ page, renderScenario }) => {
  await renderScenario('<c2-seperator decorative></c2-seperator>')
  await expect(page.getByRole('separator')).toHaveCount(0)
  await expect(page.locator('c2-seperator')).not.toHaveAttribute('aria-orientation')
})
