import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'disabled', 'running', 'toggle', 'selected', 'icons', 'custom-running']) {
  test(`${state} has accessible semantics and no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const button = page.getByRole('button', { name: 'Save', exact: true })
    if (state === 'custom-running') await button.click()
    await expect(button).toHaveAccessibleName('Save')
    if (state === 'running' || state === 'custom-running') await expect(button).toHaveAttribute('aria-busy', 'true')
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
