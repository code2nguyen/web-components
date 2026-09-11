import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

test('standalone rows toggle with click and Space and announce their state', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item value="a">Favorite</c2-list-item>')
  const item = page.getByRole('button', { name: 'Favorite' })
  await watch(item, 'selected-change')
  await item.click()
  await expect(item).toHaveAttribute('aria-pressed', 'true')
  await item.press('Space')
  await expect(item).toHaveAttribute('aria-pressed', 'false')
  await expect(item).toHaveAttribute('data-events', '[{"selected":true,"value":"a"},{"selected":false,"value":"a"}]')
  await accessible(page)
})
test('disabled rows do not select or dispatch consumer clicks', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item disabled>Unavailable</c2-list-item>')
  const item = page.locator('c2-list-item')
  await watch(item, 'click')
  await pointerClick(item)
  await expect(item).toHaveJSProperty('selected', false)
  await expect(item).toHaveAttribute('data-events', '[]')
})
test('link rows support keyboard navigation and safe external targets', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item href="#docs" target="_blank">Docs</c2-list-item>')
  await expect(page.locator('c2-list-item a')).toHaveAttribute('rel', 'noopener noreferrer')
  await props(page.locator('c2-list-item'), { target: undefined })
  await page.locator('c2-list-item').press('Enter')
  await expect(page).toHaveURL(/#docs$/)
})
