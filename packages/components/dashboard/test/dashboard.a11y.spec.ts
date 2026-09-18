import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'grid', 'fixed']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the handles are named, oriented separators in the tab order', async ({ page, scenario, tab }) => {
  await scenario('grid')
  const column = page.locator('#two').getByRole('separator', { name: 'Resize column' })
  const row = page.locator('#two').getByRole('separator', { name: 'Resize row' })
  await expect(column).toHaveAttribute('aria-orientation', 'vertical')
  await expect(row).toHaveAttribute('aria-orientation', 'horizontal')
  // A focusable separator is a window splitter, so it reports where it sits: two equal columns put it at half.
  await expect(column).toHaveAttribute('aria-valuenow', '50')
  await column.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(column).not.toHaveAttribute('aria-valuenow', '50')

  // The expand controls come before the handles of the same card, and both are reachable by keyboard.
  await page.locator('#one').getByRole('separator').focus()
  await tab()
  await expect(page.locator('#two').getByRole('button', { name: 'Expand to the full width' })).toBeFocused()
})

test('an expand control reports its state', async ({ page, scenario }) => {
  await scenario('grid')
  const control = page.locator('#one').getByRole('button', { name: 'Expand the card' })
  await expect(control).toHaveAttribute('aria-pressed', 'false')
  await control.click()
  await expect(page.locator('#one').getByRole('button', { name: 'Collapse the card' })).toHaveAttribute('aria-pressed', 'true')
})
