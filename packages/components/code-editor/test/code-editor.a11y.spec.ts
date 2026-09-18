import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'line-numbers', 'readonly', 'disabled', 'error', 'help', 'fallback']) {
  test(`${state} has accessible semantics and no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    // Whichever engine is in use the editable element is a named textbox, so a screen reader announces what it is.
    await expect(page.getByRole('textbox', { name: 'Source', exact: true })).toBeVisible()
    let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    // WCAG 1.4.3 puts no contrast requirement on an inactive component, and the library dims every disabled control
    // to `$disabled-content-opacity`. The state is still announced — `aria-disabled` is asserted below.
    if (state === 'disabled') builder = builder.disableRules(['color-contrast'])
    const results = await builder.analyze()
    expect(results.violations).toEqual([])
  })
}

test('readonly and disabled are announced, not just drawn', async ({ page, scenario }) => {
  await scenario('readonly')
  await expect(page.getByRole('textbox', { name: 'Source' })).toHaveAttribute('aria-readonly', 'true')

  await scenario('disabled')
  await expect(page.getByRole('textbox', { name: 'Source' })).toHaveAttribute('aria-disabled', 'true')
})
