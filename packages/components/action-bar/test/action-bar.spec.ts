import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, props } from '../../../../tests/component-fixture'

const bar = (page: Page) => page.locator('c2-action-bar')
// The surface inside the shadow root: the host is a zero-height strip, so visibility is read off the bar itself.
const surface = (page: Page) => bar(page).locator('.bar')
const clearButton = (page: Page) => page.getByRole('button', { name: 'Clear selection' })

const actions = '<c2-button id="archive">Archive</c2-button><c2-button id="delete">Delete</c2-button>'
// An app that owns the selection: clearing it sets the count back to 0.
// `clear` has no `onclear` handler attribute, so the listener is added from script, as an app would.
const ownSelection = (page: Page) =>
  bar(page).evaluate((element) => element.addEventListener('clear', () => ((element as HTMLElement & { count: number }).count = 0)))
const owned = (count: number) =>
  `<button id="before">Before</button><c2-action-bar count="${count}">${actions}</c2-action-bar><button id="after">After</button>`

test('stays hidden and out of the Tab order while nothing is selected', async ({ page, renderScenario, tab }) => {
  await renderScenario(owned(0))
  await expect(surface(page)).toBeHidden()
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#after')).toBeFocused()
})

test('shows the count, the actions and a clear button once something is selected', async ({ page, renderScenario, tab }) => {
  await renderScenario(owned(0))
  await props(bar(page), { count: 3 })
  await expect(surface(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('3 selected')
  await expect(bar(page)).toHaveHostAria('role', 'group')
  await expect(bar(page)).toHaveHostAria('aria-label', 'Selection actions')

  // The actions, then the clear button, in document order.
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#archive')).toBeFocused()
  await tab()
  await expect(page.locator('#delete')).toBeFocused()
  await tab()
  await expect(clearButton(page)).toBeFocused()
  await accessible(page)
})

test('the clear button and Escape fire clear, and the app hides the bar by emptying its selection', async ({ page, renderScenario }) => {
  await renderScenario(owned(2))
  await ownSelection(page)
  await watch(bar(page), 'clear')
  await clearButton(page).click()
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
  await expect(surface(page)).toBeHidden()

  await props(bar(page), { count: 1 })
  await expect(surface(page)).toBeVisible()
  await page.locator('#archive').focus()
  await page.keyboard.press('Escape')
  await expect(bar(page)).toHaveAttribute('data-events', '[null,null]')
  await expect(surface(page)).toBeHidden()
})

test('the count line keeps the last count while the bar hides, rather than reading "0 selected"', async ({ page, renderScenario }) => {
  await renderScenario(owned(4))
  await props(bar(page), { count: 0 })
  await expect(bar(page).locator('.bar > span.label')).toHaveText('4 selected')
  // And the live region says nothing rather than "0 selected".
  await expect(page.getByRole('status')).toHaveText('')
})

test('Escape in a select inside the bar closes the select and keeps the selection', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-action-bar count="2"><c2-select placeholder="Move to" aria-label="Move to"><c2-list-item value="a">Archive</c2-list-item><c2-list-item value="b">Backlog</c2-list-item></c2-select></c2-action-bar>`,
  )
  await watch(bar(page), 'clear')
  await page.getByRole('button', { name: 'Move to' }).press('ArrowDown')
  await expect(page.locator('c2-select')).toHaveJSProperty('open', true)
  await page.keyboard.press('Escape')
  await expect(page.locator('c2-select')).toHaveJSProperty('open', false)
  await expect(bar(page)).toHaveAttribute('data-events', '[]')
  await expect(surface(page)).toBeVisible()
})

test('the label slot replaces the count text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-action-bar count="3"><span slot="label">3 orders selected</span>${actions}</c2-action-bar>`)
  // The status span's own text is the slot's fallback; what renders is the slotted label.
  await expect(page.getByText('3 orders selected')).toBeVisible()
  await expect(bar(page).locator('.bar > span.label').getByText('3 selected', { exact: true })).toBeHidden()
  // The announcement keeps the built-in wording.
  await expect(page.getByRole('status')).toHaveText('3 selected')
})

test('sticks to the bottom of its scroll container, over the content', async ({ page, renderScenario }) => {
  await renderScenario(`<div class="scroller"><div class="rows"></div><c2-action-bar count="1">${actions}</c2-action-bar></div>`)
  const scroller = await page.locator('.scroller').boundingBox()
  const box = await surface(page).boundingBox()
  expect(scroller && box).toBeTruthy()
  // 16px above the container's bottom edge although the bar comes after 900px of rows.
  expect(Math.round(scroller!.y + scroller!.height - (box!.y + box!.height))).toBe(17)
  expect(await bar(page).evaluate((element) => element.getBoundingClientRect().height)).toBe(0)
})

test('the built-in text follows the nearest lang, with plurals', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-action-bar count="1">${actions}</c2-action-bar></div>`)
  await expect(page.getByRole('status')).toHaveText('1 sélectionné')
  await props(bar(page), { count: 5 })
  await expect(page.getByRole('status')).toHaveText('5 sélectionnés')
  await expect(page.getByRole('button', { name: 'Effacer la sélection' })).toBeVisible()
  await expect(bar(page)).toHaveHostAria('aria-label', 'Actions sur la sélection')
})

test('the count is announced from a live region that is not hidden with the bar', async ({ page, renderScenario }) => {
  await renderScenario(owned(0))
  const status = page.getByRole('status')
  await expect(status).toHaveText('')
  // Present in the accessibility tree before the first selection, so its first text is announced.
  expect(await status.evaluate((element) => getComputedStyle(element).visibility)).toBe('visible')
  await props(bar(page), { count: 2 })
  await expect(status).toHaveText('2 selected')
})

test('with position: fixed the bar centres in the viewport', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-action-bar count="1" style="--c2-action-bar--position: fixed">${actions}</c2-action-bar>`)
  const viewport = page.viewportSize()!
  const box = (await surface(page).boundingBox())!
  expect(box.width).toBeGreaterThan(150)
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.round(viewport.height - (box.y + box.height))).toBe(16)
})

test('on a narrow screen the actions stay on one line and scroll, clear of the count and the clear button', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await renderScenario(
    `<div style="position: relative; height: 200px"><c2-action-bar count="12" style="--c2-action-bar--position: absolute"><span slot="label">12 orders selected</span><c2-button>Mark paid</c2-button><c2-button>Export CSV</c2-button><c2-button>Refund</c2-button></c2-action-bar></div>`,
  )
  const buttons = page.locator('c2-button')
  const tops = await buttons.evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  const actions = bar(page).locator('.actions')
  expect(await actions.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  // The clear button sits past the end of the actions box, not over an action.
  const actionsBox = (await actions.boundingBox())!
  const clearBox = (await clearButton(page).boundingBox())!
  expect(clearBox.x).toBeGreaterThanOrEqual(actionsBox.x + actionsBox.width - 4)
  expect(clearBox.x + clearBox.width).toBeLessThanOrEqual(360)
})
