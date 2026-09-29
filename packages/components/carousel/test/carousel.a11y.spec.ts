import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'loop', 'autoplay', 'multi', 'labelled', 'rtl', 'single']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    await expect(page.getByRole('region', { name: 'Featured' })).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
