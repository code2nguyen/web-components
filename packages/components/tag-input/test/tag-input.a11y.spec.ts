import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'prefilled', 'disabled', 'readonly']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('invalid tags have no axe violations', async ({ page, scenario }) => {
  await scenario('email')
  await page.getByRole('textbox', { name: 'Recipients' }).pressSequentially('ann@example.com,nope,')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
