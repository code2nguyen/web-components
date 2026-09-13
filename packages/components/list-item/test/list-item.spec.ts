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

test('the icon slots size a bare svg but leave other content its natural width', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item id="row">
      Home
      <svg slot="prefix-icon" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>
      <kbd slot="suffix-icon">⌘H</kbd>
    </c2-list-item>
  `)
  const box = (selector: string) =>
    page.locator(selector).evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: Math.round(rect.width), clipped: element.scrollWidth > Math.ceil(rect.width) }
    })

  // The svg has no size of its own, so the row gives it one.
  expect(await box('#row svg')).toEqual({ width: 16, clipped: false })
  // A shortcut hint is documented content for this slot: squaring it to 16px would cut it off.
  const hint = await box('#row kbd')
  expect(hint.width).toBeGreaterThan(16)
  expect(hint.clipped).toBe(false)
})

test('--c2-list-item__icon--size still drives the svg and the icon elements', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-list-item id="row" style="--c2-list-item__icon--size: 24px">Home<svg slot="prefix-icon" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg></c2-list-item>`,
  )
  await expect(page.locator('#row svg')).toHaveCSS('width', '24px')
  await expect(page.locator('#row svg')).toHaveCSS('height', '24px')
})
