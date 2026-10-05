import { test, expect, accessible } from '../../../../tests/component-fixture'

const items =
  '<c2-link-button href="#home">Home</c2-link-button><c2-link-button href="#products">Products</c2-link-button><c2-link-button href="#category">Category</c2-link-button><c2-link-button href="#item">Item</c2-link-button>'
test('initial separator discovery does not schedule a second Lit update', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('c2-breadcrumb scheduled an update')) warnings.push(message.text())
  })
  await renderScenario(`<c2-breadcrumb><span slot="separator">/</span>${items}</c2-breadcrumb>`)
  await expect(page.getByRole('navigation')).toBeVisible()
  expect(warnings).toEqual([])
})
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
// React reported the `slot` the trail used to write on each item as a hydration mismatch.
test('places items and the separator without writing slot on the items', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-breadcrumb><span slot="separator">/</span>${items}</c2-breadcrumb>`)
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.locator('c2-breadcrumb [part="separator"]').first()).toHaveText('/')
  await expect(page.locator('c2-breadcrumb > c2-link-button[slot]')).toHaveCount(0)
  // Replacing an item keeps the count, so only the assignment changes.
  await page.locator('c2-breadcrumb').evaluate((el) => {
    const next = document.createElement('c2-link-button')
    next.setAttribute('href', '#shop')
    next.textContent = 'Shop'
    el.querySelector('[href="#products"]')!.replaceWith(next)
  })
  await expect(page.getByRole('link', { name: 'Shop' })).toBeVisible()
  await expect(page.locator('c2-breadcrumb > c2-link-button[slot]')).toHaveCount(0)
})
// Declarative shadow DOM (server rendering) always yields a named-mode shadow root, where `assign()` does nothing:
// the trail then falls back to writing `slot` on its items.
test('a server-rendered shadow root falls back to slot attributes', async ({ page, renderScenario }) => {
  await renderScenario('<div id="mount"></div>')
  await page
    .locator('#mount')
    .evaluate((mount, markup) => mount.setHTMLUnsafe(`<c2-breadcrumb><template shadowrootmode="open"></template>${markup}</c2-breadcrumb>`), items)
  await expect(page.locator('c2-link-button[href="#home"]')).toHaveAttribute('slot', 'item-0')
  await expect(page.getByRole('link', { name: 'Item', exact: true })).toBeVisible()
})
test('a child that gains slot="separator" later becomes the separator', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-breadcrumb><span id="sep">/</span>${items}</c2-breadcrumb>`)
  await expect(page.locator('c2-breadcrumb [part="separator"]')).toHaveCount(4)
  await page.locator('#sep').evaluate((sep) => sep.setAttribute('slot', 'separator'))
  await expect(page.locator('c2-breadcrumb [part="separator"]')).toHaveCount(3)
  await expect(page.locator('c2-breadcrumb [part="separator"]').first()).toHaveText('/')
})
