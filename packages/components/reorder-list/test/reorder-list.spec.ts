import { test, expect } from '../../../../tests/component-fixture'

const rows = '<div id="first" style="height:60px">First</div><div id="second" style="height:60px">Second</div><div id="third" style="height:60px">Third</div>'
test('initial slot mapping does not schedule a second Lit update', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('c2-reorder-list scheduled an update')) warnings.push(message.text())
  })
  await renderScenario(`<c2-reorder-list>${rows}</c2-reorder-list>`)
  await expect(page.locator('#third')).toHaveAttribute('slot', '2')
  expect(warnings).toEqual([])
})
test('assigns slots and updates the visual order when items are inserted', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list>${rows}</c2-reorder-list>`)
  await expect(page.locator('#first')).toHaveAttribute('slot', '0')
  await expect(page.locator('#third')).toHaveAttribute('slot', '2')
  await page.locator('c2-reorder-list').evaluate((el) => el.insertAdjacentHTML('beforeend', '<div id="fourth">Fourth</div>'))
  await expect(page.locator('#fourth')).toHaveAttribute('slot', '3')
  await expect(page.getByText('Fourth', { exact: true })).toBeVisible()
})

test('public parts style dynamic item placement while assigned items remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list>${rows}</c2-reorder-list>`)
  await page.addStyleTag({ content: 'c2-reorder-list::part(item){background:rgb(1,2,3)}#first{color:rgb(4,5,6)}' })
  const host = page.locator('c2-reorder-list')
  await expect(host.locator('[part="item"]').first()).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(page.locator('#first')).toHaveCSS('color', 'rgb(4, 5, 6)')
  await expect(page.locator('#first')).toHaveAttribute('slot', '0')
})

test('placeholder and dragging-item parts style the conditional drag regions', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reorder-list editable>${rows}</c2-reorder-list>`)
  await page.addStyleTag({
    content: 'c2-reorder-list::part(placeholder){background:rgb(7,8,9)}c2-reorder-list::part(dragging-item){background:rgb(10,11,12)}',
  })
  const first = await page.locator('#first').boundingBox()
  if (!first) throw new Error('Missing first row')
  await page.mouse.move(first.x + 20, first.y + 20)
  await page.mouse.down()
  await page.mouse.move(first.x + 40, first.y + 30, { steps: 4 })
  const host = page.locator('c2-reorder-list')
  await expect(host.locator('[part="placeholder"]')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  await expect(host.locator('[part="dragging-item"]')).toHaveCSS('background-color', 'rgb(10, 11, 12)')
  await page.mouse.up()
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
