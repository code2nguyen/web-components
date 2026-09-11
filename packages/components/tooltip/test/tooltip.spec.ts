import { test, expect } from '../../../../tests/component-fixture'

const markup = '<button id="target">Help</button><c2-tooltip for="target" delay="0">More information</c2-tooltip>'
test('hover reveals a description and leaving hides it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.getByRole('button', { name: 'Help' }).hover()
  await expect(page.getByRole('tooltip')).toHaveText('More information')
  await expect(page.getByRole('button', { name: 'Help' })).toHaveAccessibleDescription('More information')
  await page.mouse.move(1, 1)
  await expect(page.getByRole('tooltip')).not.toBeVisible()
})
test('keyboard focus reveals the tooltip and Escape dismisses it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.getByRole('button', { name: 'Help' }).focus()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tooltip')).not.toBeVisible()
})
test('removing the tooltip restores existing descriptions', async ({ page, renderScenario }) => {
  await renderScenario(
    '<span id="existing">Existing help</span><button id="target" aria-describedby="existing">Help</button><c2-tooltip for="target">More</c2-tooltip>',
  )
  await page.locator('c2-tooltip').evaluate((el) => el.remove())
  await expect(page.getByRole('button')).toHaveAttribute('aria-describedby', 'existing')
})
