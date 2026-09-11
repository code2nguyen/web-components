import { test, expect, accessible } from '../../../../tests/component-fixture'

const items =
  '<c2-link-button href="#home">Home</c2-link-button><c2-link-button href="#products">Products</c2-link-button><c2-link-button href="#category">Category</c2-link-button><c2-link-button href="#item">Item</c2-link-button>'
test('navigation labels the current page', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-breadcrumb>${items}</c2-breadcrumb>`)
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Item', exact: true })).toHaveAttribute('aria-current', 'page')
  await accessible(page)
})
test('collapsed trail expands with a named keyboard control', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-breadcrumb style="width: 150px">${items}</c2-breadcrumb>`)
  const expand = page.getByRole('button', { name: /Show \d+ more items/ })
  await expect(expand).toBeVisible()
  await expand.press('Enter')
  await expect(page.getByRole('link', { name: 'Products' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Category' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Products' })).toBeFocused()
})
test('adding a page moves automatic current-page state to the new last item', async ({ page, renderScenario }) => {
  await renderScenario('<c2-breadcrumb><c2-link-button href="#home">Home</c2-link-button></c2-breadcrumb>')
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  await page.locator('c2-breadcrumb').evaluate((el) => el.insertAdjacentHTML('beforeend', '<c2-link-button href="#new">New</c2-link-button>'))
  await expect(page.getByRole('link', { name: 'New' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
})
