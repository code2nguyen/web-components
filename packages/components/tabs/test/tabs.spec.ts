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

// Every test above renders parsed markup, which is the one path that never checks whether a custom element
// constructor added attributes. `document.createElement` does check, and it is how React, Angular and every
// other framework renderer builds an element — so a constructor that called `setAttribute` threw
// `NotSupportedError` and took the whole tab strip with it, invisibly to the suite.
test('tabs built with createElement, the way a framework renderer builds them, behave like parsed ones', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tabs></c2-tabs>')
  await page.locator('c2-tabs').evaluate(async (tabs) => {
    for (const [id, label] of [
      ['one', 'First'],
      ['two', 'Second'],
    ]) {
      const tab = document.createElement('c2-tab')
      tab.setAttribute('for', id)
      tab.textContent = label
      const panel = document.createElement('div')
      panel.id = id
      panel.textContent = `${label} content`
      tabs.append(tab, panel)
      await customElements.whenDefined('c2-tab')
      await (tab as Element & { updateComplete?: Promise<boolean> }).updateComplete
    }
    await (tabs as Element & { updateComplete?: Promise<boolean> }).updateComplete
  })

  // The slot is what puts a tab in the tab strip; the constructor used to set it.
  await expect(page.locator('c2-tab[for="one"]')).toHaveAttribute('slot', 'tab')
  await expect(page.locator('c2-tab[for="two"]')).toHaveAttribute('slot', 'tab')

  const first = page.getByRole('tab', { name: 'First' })
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: 'Second' }).click()
  await expect(page.getByRole('tabpanel')).toHaveText('Second content')
})
