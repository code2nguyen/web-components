import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'split', 'slots']) {
  test(`${state} has accessible semantics and no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('markers are decoration, not content', async ({ page, scenario }) => {
  await scenario('slots')
  const item = page.getByRole('listitem').first()
  await expect(item).toHaveAccessibleName('')
  await expect(item.locator('.rail')).toHaveAttribute('aria-hidden', 'true')
})
