import { test, expect, props, watch, accessible, hostAria } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const markup =
  '<c2-tabs><c2-tab for="one">First</c2-tab><c2-tab for="two" disabled>Locked</c2-tab><c2-tab for="three">Third</c2-tab><div id="one">First content</div><div id="two">Locked content</div><div id="three">Third content</div></c2-tabs>'

// The tabpanel is the panel's wrapper in the shadow root: Playwright reads neither its slotted text (`toHaveText` uses
// `textContent`) nor a label set through `ariaLabelledByElements`, so read both from the browser.
// A hidden panel is `hidden="until-found"`, which skips its content (`content-visibility: hidden`). Playwright's WebKit
// visibility check reads only the computed style and the box, so ask the browser.
const shown = (locator: Locator) => expect.poll(() => locator.evaluate((element) => element.checkVisibility()))

const tabpanel = (page: Page, panel = page.getByRole('tabpanel')) =>
  expect.poll(() =>
    panel.evaluate((panel) => {
      const label = (panel as HTMLElement & { ariaLabelledByElements: Element[] | null }).ariaLabelledByElements?.[0] ?? null
      const text = (panel.querySelector('slot') as HTMLSlotElement).assignedElements().map((element) => element.textContent)
      return `${label?.textContent ?? document.getElementById(panel.getAttribute('aria-labelledby') ?? '')?.textContent}: ${text.join('')}`
    }),
  )

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
  await tabpanel(page).toBe('Third: Third content')
  await shown(page.getByText('First content', { exact: true })).toBe(false)
  await page.keyboard.press('Home')
  await expect(first).toHaveHostAria('aria-selected', 'true')
  await accessible(page)
})
test('consumer cancellation prevents a tab switch', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.locator('c2-tabs').evaluate((el) => el.addEventListener('tab-change', (event) => event.preventDefault()))
  await page.locator('c2-tab', { hasText: 'Third' }).click()
  await tabpanel(page).toBe('First: First content')
})
test('click emits one change and clearing selection restores the first panel', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const host = page.locator('c2-tabs')
  await watch(host, 'selection-change')
  await page.locator('c2-tab', { hasText: 'Third' }).click()
  await expect(host).toHaveAttribute('data-events', '[{"value":"three"}]')
  await props(host, { selectedTab: '' })
  await tabpanel(page).toBe('First: First content')
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
  await tabpanel(page).toBe('Second: Second content')
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
  await shown(page.getByText('Third content', { exact: true })).toBe(false)
  expect(await first.evaluate((el) => el.matches(':state(selected)'))).toBe(true)
  await expect(first).toHaveCSS('color', 'rgb(2, 101, 220)')
  expect(await unauthored()).toEqual([])

  await third.click()
  await expect(page.getByText('Third content', { exact: true })).toBeVisible()
  await shown(page.getByText('First content', { exact: true })).toBe(false)
  expect(await third.evaluate((el) => el.matches(':state(selected)'))).toBe(true)
  expect(await first.evaluate((el) => el.matches(':state(selected)'))).toBe(false)
  await expect(third).toHaveCSS('color', 'rgb(2, 101, 220)')
  // The tabpanel role and its label sit on the panel's wrapper in the shadow root, so no panel gained attributes.
  expect(await unauthored()).toEqual([])
  const wrapper = page.locator('c2-tabs .c2-tabs-panel[data-panel="three"]')
  await expect(wrapper).toHaveAttribute('role', 'tabpanel')
  await tabpanel(page, wrapper).toBe('Third: Third content')
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
  await shown(page.getByText('First content', { exact: true })).toBe(false)
})

// Find-in-page and text-fragment links reveal a `hidden="until-found"` element and fire `beforematch` on it first.
test('every enabled panel is findable while hidden, and a find selects its tab like a click', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const host = page.locator('c2-tabs')
  await page.locator('c2-tabs').evaluate((tabs) => {
    tabs.dataset.events = '[]'
    tabs.addEventListener('selection-change', (event) => {
      tabs.dataset.events = JSON.stringify([...JSON.parse(tabs.dataset.events!), (event as CustomEvent).detail])
    })
  })
  const wrapper = (id: string) => host.locator(`.c2-tabs-panel[data-panel="${id}"]`)
  await expect(wrapper('one')).not.toHaveAttribute('hidden')
  await expect(wrapper('three')).toHaveAttribute('hidden', 'until-found')
  // A disabled tab cannot be selected, so its panel is not findable.
  await expect(wrapper('two')).toHaveAttribute('hidden', '')
  await shown(page.getByText('Third content', { exact: true })).toBe(false)
  await expect(page.getByRole('tabpanel')).toHaveCount(1)

  await wrapper('three').evaluate((element) => element.dispatchEvent(new Event('beforematch', { bubbles: true })))
  await expect(page.locator('c2-tab[for="three"]')).toHaveHostAria('aria-selected', 'true')
  await expect(host).toHaveAttribute('data-events', '[{"value":"three"}]')
  await tabpanel(page).toBe('Third: Third content')
  await expect(wrapper('one')).toHaveAttribute('hidden', 'until-found')
})

// c2-tab reports no change to the strip, so a tab disabled after the last render leaves its panel `until-found`.
// A find that matches it then must not reveal it: the strip hides it again and keeps the selection.
test('a find in the panel of a tab disabled since the last render hides it again and keeps the selection', async ({ page, renderScenario }) => {
  await renderScenario(markup.replace('<c2-tab for="two" disabled>', '<c2-tab for="two">'))
  const host = page.locator('c2-tabs')
  const wrapper = host.locator('.c2-tabs-panel[data-panel="two"]')
  await expect(wrapper).toHaveAttribute('hidden', 'until-found')

  await page.locator('c2-tab[for="two"]').evaluate((tab) => ((tab as HTMLElement & { disabled: boolean }).disabled = true))
  // The browser reveals a matched panel right after `beforematch`: mimic it by removing `hidden` in the same task.
  await wrapper.evaluate((element) => {
    element.dispatchEvent(new Event('beforematch', { bubbles: true }))
    element.removeAttribute('hidden')
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

  await expect(wrapper).toHaveAttribute('hidden', '')
  await shown(page.getByText('Locked content', { exact: true })).toBe(false)
  await expect(page.locator('c2-tab[for="one"]')).toHaveHostAria('aria-selected', 'true')
  await expect(page.locator('c2-tab[for="two"]')).toHaveHostAria('aria-selected', 'false')
  await expect(host).toHaveJSProperty('selectedTab', 'one')
})
