import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'disabled', 'running', 'toggle', 'selected', 'icons', 'custom-running', 'icon-only']) {
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

test('forwards the host aria-label to the inner button and keeps it in sync', async ({ page, scenario }) => {
  await scenario('icon-only')
  const host = page.locator('c2-button')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await host.evaluate((element) => element.setAttribute('aria-label', 'Save draft'))
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeVisible()
  await host.evaluate((element) => ((element as HTMLElement).ariaLabel = 'Publish'))
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible()
  // The property does not reflect: the host keeps only what the author wrote.
  await expect(host).toHaveAttribute('aria-label', 'Save draft')
  await host.evaluate((element) => element.removeAttribute('aria-label'))
  await expect(page.locator('c2-button button')).not.toHaveAttribute('aria-label')
})

test('an aria-label overrides the visible text as the accessible name', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-button').evaluate((element) => element.setAttribute('aria-label', 'Save the report'))
  await expect(page.getByRole('button', { name: 'Save the report', exact: true })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
