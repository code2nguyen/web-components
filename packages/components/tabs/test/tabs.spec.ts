import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const markup =
  '<c2-tabs><c2-tab for="one">First</c2-tab><c2-tab for="two" disabled>Locked</c2-tab><c2-tab for="three">Third</c2-tab><div id="one">First content</div><div id="two">Locked content</div><div id="three">Third content</div></c2-tabs>'

test('consumer-owned tab labels and panels remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-tabs><c2-tab class="slot-probe" slot="tab" for="panel">Tab</c2-tab><div class="slot-probe" slot="tab-content" id="panel">Panel</div></c2-tabs>',
  )
  await page.locator('.slot-probe').evaluateAll((nodes) => nodes.forEach((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)')))
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color)))
    .toEqual(Array(2).fill('rgb(1, 2, 3)'))
})
test('forwards its accessible name to the internal tab list and keeps it synchronized', async ({ page, renderScenario }) => {
  await renderScenario(markup.replace('<c2-tabs>', '<c2-tabs aria-label="Account settings">'))
  const host = page.locator('c2-tabs')
  await expect(page.getByRole('tablist', { name: 'Account settings' })).toBeVisible()

  await host.evaluate((element) => element.setAttribute('aria-label', 'Billing settings'))
  await expect(page.getByRole('tablist', { name: 'Billing settings' })).toBeVisible()

  await host.evaluate((element) => element.removeAttribute('aria-label'))
  await expect(host.locator('[role="tablist"]')).not.toHaveAttribute('aria-label')
})
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
  await watch(host, 'selection-change')
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

// `c2-list`, `c2-select`, `c2-table`, `c2-tabs` and `c2-virtual-list` all fire `selection-change`. If it bubbled,
// a selection made inside a tab panel would arrive at the tab strip's own listener and look like a tab switch,
// which is exactly the trap the event used to have while it was called `change`.
test('selection-change does not reach an ancestor', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="wrapper">${markup}</div>`)
  const wrapper = page.locator('#wrapper')
  await watch(wrapper, 'selection-change')
  const host = page.locator('c2-tabs')
  await watch(host, 'selection-change')

  await page.getByRole('tab', { name: 'Third' }).click()

  await expect(host).toHaveAttribute('data-events', '[{"value":"three"}]')
  await expect(wrapper).toHaveAttribute('data-events', '[]')
})
