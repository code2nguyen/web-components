import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'show-label', 'two-modes', 'disabled', 'custom']) {
  test(`${state} has accessible semantics and no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const name = state === 'two-modes' ? 'Theme: Light' : state === 'custom' ? 'Theme: Follow system' : 'Theme: System'
    const subject = page.getByRole('button', { name, exact: true })
    await expect(subject).toHaveAccessibleName(name)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the open menu is a radio menu with the current mode checked', async ({ page, scenario }) => {
  await scenario()
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).toHaveAttribute('aria-haspopup', 'menu')
  await subject.hover()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitemradio')).toHaveText(['System', 'Light', 'Dark'])
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
  // The overlay host is what fades in (the `menu` role is on the surface inside it); scanning mid-transition
  // measures contrast against a half-transparent row.
  await expect(page.locator('c2-overlay')).toHaveCSS('opacity', '1')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('a custom aria-label replaces the generated trigger name', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-theme-select').evaluate((element) => element.setAttribute('aria-label', 'Colour scheme'))
  await expect(page.getByRole('button', { name: 'Colour scheme', exact: true })).toBeVisible()
})
