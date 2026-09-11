import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

test('label activation and Space update checked and emit one change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-switch label="Notifications"><span slot="description">Receive updates</span></c2-switch>')
  const host = page.locator('c2-switch')
  const input = page.getByRole('switch')
  await watch(host, 'change')
  await page.getByText('Notifications', { exact: true }).click()
  await expect(input).toBeChecked()
  await input.press('Space')
  await expect(host).toHaveJSProperty('checked', false)
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await accessible(page)
})
test('disabled prevents toggling and external checked updates restore native state', async ({ page, renderScenario }) => {
  await renderScenario('<c2-switch label="Notifications" disabled></c2-switch>')
  const host = page.locator('c2-switch')
  await pointerClick(page.getByRole('switch'))
  await expect(host).toHaveJSProperty('checked', false)
  await props(host, { disabled: false, checked: true })
  await expect(page.getByRole('switch')).toBeChecked()
  await props(host, { checked: false })
  await expect(page.getByRole('switch')).not.toBeChecked()
})
for (const direction of ['ltr', 'rtl']) {
  test(`dragging the thumb chooses the release side in ${direction}`, async ({ page, renderScenario }) => {
    await renderScenario(`<c2-switch dir="${direction}" label="Notifications"></c2-switch>`)
    const input = page.getByRole('switch')
    const box = await input.boundingBox()
    if (!box) throw new Error('Missing switch bounds')
    await watch(page.locator('c2-switch'), 'change')
    const start = direction === 'ltr' ? box.x + 5 : box.x + box.width - 5
    const end = direction === 'ltr' ? box.x + box.width - 2 : box.x + 2
    await page.mouse.move(start, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(end, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(input).toBeChecked()
    await expect(page.locator('c2-switch')).toHaveAttribute('data-events', '[null]')
  })
}
