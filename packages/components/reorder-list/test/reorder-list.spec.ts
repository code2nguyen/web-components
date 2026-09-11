import { test, expect } from '../../../../tests/component-fixture'

const rows = '<div id="first" style="height:60px">First</div><div id="second" style="height:60px">Second</div><div id="third" style="height:60px">Third</div>'
test('assigns slots and updates the visual order when items are inserted', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list>${rows}</c2-reorder-list>`)
  await expect(page.locator('#first')).toHaveAttribute('slot', '0')
  await expect(page.locator('#third')).toHaveAttribute('slot', '2')
  await page.locator('c2-reorder-list').evaluate((el) => el.insertAdjacentHTML('beforeend', '<div id="fourth">Fourth</div>'))
  await expect(page.locator('#fourth')).toHaveAttribute('slot', '3')
  await expect(page.getByText('Fourth', { exact: true })).toBeVisible()
})
for (const editable of [false, true]) {
  test(`dragging ${editable ? 'reorders editable' : 'preserves readonly'} items`, async ({ page, renderScenario }) => {
    await renderScenario(`<c2-reorder-list ${editable ? 'editable' : ''}>${rows}</c2-reorder-list>`)
    const first = await page.locator('#first').boundingBox()
    const third = await page.locator('#third').boundingBox()
    if (!first || !third) throw new Error('Missing rows')
    await page.mouse.move(first.x + 20, first.y + 20)
    await page.mouse.down()
    await page.mouse.move(first.x + 35, first.y + 25, { steps: 3 })
    if (editable) await expect(page.locator('#first')).toHaveAttribute('slot', 'dragging-item')
    await page.mouse.move(third.x + 30, third.y + 30, { steps: 10 })
    await page.mouse.up()
    await expect(page.locator('#first')).toHaveAttribute('slot', editable ? '2' : '0')
  })
}
