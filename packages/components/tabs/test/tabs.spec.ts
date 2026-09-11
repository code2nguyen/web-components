import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const markup =
  '<c2-tabs><c2-tab for="one">First</c2-tab><c2-tab for="two" disabled>Locked</c2-tab><c2-tab for="three">Third</c2-tab><div id="one">First content</div><div id="two">Locked content</div><div id="three">Third content</div></c2-tabs>'
test('selects the first panel and changes panels by keyboard, skipping disabled tabs', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const first = page.getByRole('tab', { name: 'First' })
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await first.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Third' })).toBeFocused()
  await expect(page.getByRole('tabpanel')).toHaveText('Third content')
  await expect(page.getByText('First content', { exact: true })).not.toBeVisible()
  await page.keyboard.press('Home')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await accessible(page)
})
test('consumer cancellation prevents a tab switch', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.locator('c2-tabs').evaluate((el) => el.addEventListener('tab-change', (event) => event.preventDefault()))
  await page.getByRole('tab', { name: 'Third' }).click()
  await expect(page.getByRole('tabpanel')).toHaveText('First content')
})
test('click emits one change and clearing selection restores the first panel', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const host = page.locator('c2-tabs')
  await watch(host, 'change')
  await page.getByRole('tab', { name: 'Third' }).click()
  await expect(host).toHaveAttribute('data-events', '[{"value":"three"}]')
  await props(host, { selectedTab: '' })
  await expect(page.getByRole('tabpanel')).toHaveText('First content')
})
