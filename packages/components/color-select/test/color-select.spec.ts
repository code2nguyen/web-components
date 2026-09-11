import { test, expect } from '../../../../tests/component-fixture'

test('opening the picker shows the current color and commits HEX edits', async ({ page, renderScenario }) => {
  await renderScenario('<c2-color-select color="#ff0000"></c2-color-select>')
  await page.locator('button.presentation').click()
  const hex = page.locator('c2-text-field.text-input input')
  await expect(hex).toHaveValue('#ff0000')
  await hex.fill('#00ff00')
  await hex.press('Tab')
  await expect(page.locator('c2-color-select')).toHaveAttribute('color', 'rgb(0, 255, 0)')
  await page.keyboard.press('Escape')
  await expect(hex).not.toBeVisible()
})
test('invalid color edits preserve the last valid color', async ({ page, renderScenario }) => {
  await renderScenario('<c2-color-select color="#ff0000"></c2-color-select>')
  await page.locator('button.presentation').click()
  await page.locator('c2-text-field.text-input input').fill('not-a-color')
  await page.locator('c2-text-field.text-input input').press('Tab')
  await expect(page.locator('c2-color-select')).toHaveJSProperty('color', '#ff0000')
})
