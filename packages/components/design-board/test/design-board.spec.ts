import { test, expect, props } from '../../../../tests/component-fixture'

// WIP: cover existing slot/layout behavior, not unimplemented drag handlers.
test('projects board items with their declared grid placement', async ({ page, renderScenario }) => {
  await renderScenario('<c2-design-board><c2-design-board-item column-start="2" column-end="4"><p>Card</p></c2-design-board-item></c2-design-board>')
  await expect(page.getByText('Card', { exact: true })).toBeVisible()
  await expect(page.locator('c2-design-board-item')).toHaveCSS('grid-column-start', '2')
})
test('changing grid coordinates updates the item layout', async ({ page, renderScenario }) => {
  await renderScenario('<c2-design-board><c2-design-board-item column-start="1"><p>Card</p></c2-design-board-item></c2-design-board>')
  await props(page.locator('c2-design-board-item'), { columnStart: 3 })
  await expect(page.locator('c2-design-board-item')).toHaveCSS('grid-column-start', '3')
})
