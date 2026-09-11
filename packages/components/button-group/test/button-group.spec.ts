import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const items = '<c2-button value="a">Left</c2-button><c2-button value="b">Right</c2-button><c2-button value="c" disabled>Locked</c2-button>'
test('single selection updates pressed state and emits one change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group selection="single" aria-label="Alignment">${items}</c2-button-group>`)
  const host = page.locator('c2-button-group')
  await watch(host, 'change')
  await page.getByRole('button', { name: 'Left', exact: true }).click()
  await page.getByRole('button', { name: 'Right', exact: true }).click()
  await expect(host).toHaveJSProperty('value', 'b')
  await expect(page.getByRole('button', { name: 'Left', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(host).toHaveAttribute('data-events', '[{"value":"a"},{"value":"b"}]')
  await accessible(page)
})
test('multiple selection toggles independently', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group selection="multiple">${items}</c2-button-group>`)
  await page.getByRole('button', { name: 'Left', exact: true }).click()
  await page.getByRole('button', { name: 'Right', exact: true }).click()
  await expect(page.locator('c2-button-group')).toHaveJSProperty('value', 'a,b')
  await page.getByRole('button', { name: 'Left', exact: true }).click()
  await expect(page.locator('c2-button-group')).toHaveJSProperty('value', 'b')
})
test('reenabling the group preserves author-disabled children', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group disabled>${items}</c2-button-group>`)
  for (const button of await page.getByRole('button').all()) await expect(button).toBeDisabled()
  await props(page.locator('c2-button-group'), { disabled: false })
  await expect(page.getByRole('button', { name: 'Left', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Locked' })).toBeDisabled()
})
