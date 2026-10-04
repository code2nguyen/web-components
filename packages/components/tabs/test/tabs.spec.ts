import { test, expect, props, watch, accessible, hostAria } from '../../../../tests/component-fixture'

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
  const first = page.locator('c2-tab', { hasText: 'First' })
  await expect(first).toHaveHostAria('aria-selected', 'true')
  await first.press('ArrowRight')
  await expect(page.locator('c2-tab', { hasText: 'Third' })).toBeFocused()
  await expect(page.getByRole('tabpanel')).toHaveText('Third content')
  await expect(page.getByText('First content', { exact: true })).not.toBeVisible()
  await page.keyboard.press('Home')
  await expect(first).toHaveHostAria('aria-selected', 'true')
  await accessible(page)
})
test('consumer cancellation prevents a tab switch', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.locator('c2-tabs').evaluate((el) => el.addEventListener('tab-change', (event) => event.preventDefault()))
  await page.locator('c2-tab', { hasText: 'Third' }).click()
  await expect(page.getByRole('tabpanel')).toHaveText('First content')
})
test('click emits one change and clearing selection restores the first panel', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const host = page.locator('c2-tabs')
  await watch(host, 'selection-change')
  await page.locator('c2-tab', { hasText: 'Third' }).click()
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

  // The strip assigns its tabs to the header slot itself; nothing writes `slot` on them.
  await expect(page.locator('c2-tab[for="one"]')).not.toHaveAttribute('slot')
  await expect(page.locator('c2-tab[for="two"]')).toBeVisible()

  const first = page.locator('c2-tab', { hasText: 'First' })
  await expect(first).toHaveHostAria('aria-selected', 'true')
  await page.locator('c2-tab', { hasText: 'Second' }).click()
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

  await page.locator('c2-tab', { hasText: 'Third' }).click()

  await expect(host).toHaveAttribute('data-events', '[{"value":"three"}]')
  await expect(wrapper).toHaveAttribute('data-events', '[]')
})

// React hydrates server markup against what the element looks like after it upgrades: every attribute the element
// writes on itself is one the server never rendered, and React reports it as a mismatch. So the tabs state their
// role, selection, disabled state and panel through ElementInternals, and the hosts carry only what the author wrote.
test('states its semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const hosts = page.locator('c2-tabs, c2-tab')
  const hostSemantics = () =>
    hosts.evaluateAll((elements) =>
      elements.flatMap((element) =>
        element
          .getAttributeNames()
          .filter((name) => name === 'role' || name.startsWith('aria-'))
          .map((name) => `${element.localName}[${name}]`),
      ),
    )
  const first = page.locator('c2-tab[for="one"]')
  const locked = page.locator('c2-tab[for="two"]')
  const third = page.locator('c2-tab[for="three"]')

  await expect(first).toHaveHostAria('aria-selected', 'true')
  expect(await hostSemantics()).toEqual([])
  for (const tab of [first, locked, third]) await expect(tab).toHaveHostAria('role', 'tab')
  await expect(locked).toHaveHostAria('aria-disabled', 'true')
  await expect(first).toHaveHostAria('aria-disabled', null)
  await expect(third).toHaveHostAria('aria-selected', 'false')
  expect(await first.evaluate((tab) => (tab as unknown as { internals: ElementInternals }).internals.ariaControlsElements?.map((panel) => panel.id))).toEqual([
    'one',
  ])

  await third.click()
  await expect(third).toHaveHostAria('aria-selected', 'true')
  await expect(first).toHaveHostAria('aria-selected', 'false')
  expect(await hostSemantics()).toEqual([])
  expect(await hostAria(third, 'role')).toBe('tab')
})

// A tab is selected and the panels are slotted while the page upgrades, before React (or any framework) hydrates.
// Writing `slot` on the children or reflecting `selected` would make the hydrated markup differ from the server's,
// so the strip assigns its slots by hand and the selected tab is a custom state.
test('upgrading and switching tabs write no slot or selected attribute on the children', async ({ page, renderScenario }) => {
  await renderScenario(
    markup
      .replace('<div id="one">', '<div id="one" role="tabpanel" aria-labelledby="tab-one">')
      .replace('<c2-tab for="one">', '<c2-tab for="one" id="tab-one">'),
  )
  const unauthored = () =>
    page.locator('c2-tabs').evaluate((tabs) =>
      [...tabs.children].flatMap((el) =>
        el
          .getAttributeNames()
          .filter((name) => !['for', 'disabled', 'id', 'tabindex'].includes(name) && !(el.id === 'one' && ['role', 'aria-labelledby'].includes(name)))
          .map((name) => `${el.localName}#${el.id || el.getAttribute('for')}[${name}]`),
      ),
    )
  const first = page.locator('c2-tab[for="one"]')
  const third = page.locator('c2-tab[for="three"]')

  await expect(first).toHaveHostAria('aria-selected', 'true')
  await expect(page.getByText('First content', { exact: true })).toBeVisible()
  await expect(page.getByText('Third content', { exact: true })).toBeHidden()
  expect(await first.evaluate((el) => el.matches(':state(selected)'))).toBe(true)
  await expect(first).toHaveCSS('color', 'rgb(2, 101, 220)')
  expect(await unauthored()).toEqual([])

  await third.click()
  await expect(page.getByText('Third content', { exact: true })).toBeVisible()
  await expect(page.getByText('First content', { exact: true })).toBeHidden()
  expect(await third.evaluate((el) => el.matches(':state(selected)'))).toBe(true)
  expect(await first.evaluate((el) => el.matches(':state(selected)'))).toBe(false)
  await expect(third).toHaveCSS('color', 'rgb(2, 101, 220)')
  // The panel the strip had to label itself is the only one that gained attributes.
  expect(await unauthored()).toEqual(['div#three[role]', 'div#three[aria-labelledby]'])
})

test('tabs and panels added later are assigned to the strip', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.locator('c2-tabs').evaluate((tabs) => {
    const tab = document.createElement('c2-tab')
    tab.setAttribute('for', 'four')
    tab.textContent = 'Fourth'
    const panel = document.createElement('div')
    panel.id = 'four'
    panel.textContent = 'Fourth content'
    tabs.append(tab, panel)
  })
  await page.locator('c2-tab', { hasText: 'Fourth' }).click()
  await expect(page.getByText('Fourth content', { exact: true })).toBeVisible()
  await expect(page.locator('c2-tab[for="four"]')).not.toHaveAttribute('slot')
})

// Declarative shadow DOM (server rendering) always yields a named-mode shadow root, where `assign()` does nothing:
// the strip then falls back to writing `slot`, as it always did.
test('a server-rendered shadow root falls back to slot attributes', async ({ page, renderScenario }) => {
  await renderScenario('<div id="host"></div>')
  await page
    .locator('#host')
    .evaluate((host) =>
      host.setHTMLUnsafe(
        '<c2-tabs><template shadowrootmode="open"></template><c2-tab for="one">First</c2-tab><c2-tab for="two">Second</c2-tab><div id="one">First content</div><div id="two">Second content</div></c2-tabs>',
      ),
    )
  await expect(page.locator('c2-tab[for="one"]')).toHaveAttribute('slot', 'tab')
  await expect(page.getByText('First content', { exact: true })).toBeVisible()
  await page.locator('c2-tab', { hasText: 'Second' }).click()
  await expect(page.getByText('Second content', { exact: true })).toBeVisible()
  await expect(page.getByText('First content', { exact: true })).toBeHidden()
})
