import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const markup = (attributes = '') => `
  <button id="launch">Take the tour</button>
  <div style="display: flex; gap: 24px; margin-top: 160px">
    <button id="search">Search</button>
    <button id="filters">Filters</button>
  </div>
  <c2-tour ${attributes}>
    <c2-tour-step heading="Welcome">A quick look around.</c2-tour-step>
    <c2-tour-step target="#search" heading="Search">Find anything here.</c2-tour-step>
    <c2-tour-step target="#filters" heading="Filters" placement="right">Narrow the results.</c2-tour-step>
  </c2-tour>`

const host = (page: Page) => page.locator('c2-tour')
const panel = (page: Page) => page.locator('c2-tour .panel')
const spotlight = (page: Page) => page.locator('c2-tour .spotlight')
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** Records the tour's events, in order, with their detail. */
async function record(page: Page) {
  await host(page).evaluate((element) => {
    const log: string[] = []
    ;(window as unknown as { tourLog: string[] }).tourLog = log
    for (const name of ['step-change', 'finish', 'skip', 'show', 'hide'])
      element.addEventListener(name, (event) => log.push(event instanceof CustomEvent ? `${name}:${JSON.stringify(event.detail)}` : name))
  })
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { tourLog: string[] }).tourLog)

/** Opens the tour the way an app does: a button whose click calls `start()`. */
async function launch(page: Page, index = 0) {
  await page.locator('#launch').evaluate((element, start) => {
    element.addEventListener('click', () => document.querySelector('c2-tour')!.start(start))
  }, index)
  await page.locator('#launch').click()
}

test('is hidden until started, then shows the first step with focus on Next', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await expect(panel(page)).toBeHidden()
  await launch(page)
  const welcome = dialog(page, 'Welcome')
  await expect(welcome).toBeVisible()
  await expect(welcome).toHaveAccessibleDescription('A quick look around.')
  await expect(button(page, 'Next')).toBeFocused()
  await expect(button(page, 'Back')).toBeHidden()
  await expect(page.locator('c2-tour .progress')).toHaveText('1 of 3')
  await expect(host(page)).toHaveAttribute('open', '')
  expect(await events(page)).toEqual(['show'])
})

test('a step without a target shows centred over the dimmed page', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await expect(panel(page)).toHaveAttribute('data-placement', 'center')
  const box = (await panel(page).boundingBox())!
  const viewport = page.viewportSize()!
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2)
})

test('Next moves through the steps, spotlighting each target and placing the panel beside it', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page)
  await button(page, 'Next').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await expect(page.locator('c2-tour .progress')).toHaveText('2 of 3')
  await expect(panel(page)).toHaveAttribute('data-placement', 'bottom')
  // The spotlight wraps the target with its padding, once it has finished moving.
  const target = (await page.locator('#search').boundingBox())!
  await expect
    .poll(async () => {
      const box = (await spotlight(page).boundingBox())!
      return [Math.round(box.x - target.x), Math.round(box.y - target.y), Math.round(box.width - target.width)]
    })
    .toEqual([-8, -8, 16])
  const panelBox = (await panel(page).boundingBox())!
  expect(panelBox.y).toBeGreaterThan(target.y + target.height)

  await button(page, 'Next').click()
  await expect(dialog(page, 'Filters')).toBeVisible()
  await expect(panel(page)).toHaveAttribute('data-placement', 'right')
  await expect(button(page, 'Done')).toBeFocused()
  expect(await events(page)).toEqual(['show', 'step-change:{"index":1,"previous":0}', 'step-change:{"index":2,"previous":1}'])
})

test('Back returns to the previous step and keeps focus in the panel on the first', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page, 1)
  await expect(dialog(page, 'Search')).toBeVisible()
  await button(page, 'Back').click()
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await expect(button(page, 'Back')).toBeHidden()
  await expect(button(page, 'Next')).toBeFocused()
})

test('Done on the last step fires finish, closes and returns focus', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page, 2)
  await button(page, 'Done').click()
  await expect(panel(page)).toBeHidden()
  await expect(spotlight(page)).toBeHidden()
  await expect(page.locator('#launch')).toBeFocused()
  await expect(host(page)).not.toHaveAttribute('open')
  expect(await events(page)).toEqual(['show', 'finish', 'hide'])
})

test('Escape and the close button skip the tour on the current step', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page)
  await page.keyboard.press('ArrowRight')
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(page.locator('#launch')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await button(page, 'Close tour').click()
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'step-change:{"index":1,"previous":0}', 'skip:{"index":1}', 'hide', 'show', 'skip:{"index":0}', 'hide'])
})

test('the arrow keys move between steps', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(dialog(page, 'Filters')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(dialog(page, 'Search')).toBeVisible()
})

test('the page stays interactive around the spotlight', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await watch(page.locator('#filters'), 'click')
  await launch(page, 1)
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.locator('#filters').click()
  await expect(page.locator('#filters')).toHaveAttribute('data-events', '[null]')
  await expect(dialog(page, 'Search')).toBeVisible()
})

test('setting open and current from code fires show and hide only', async ({ page, renderScenario }) => {
  await renderScenario(markup('current="1"'))
  await record(page)
  await host(page).evaluate((element) => element.setAttribute('open', ''))
  await expect(dialog(page, 'Search')).toBeVisible()
  await host(page).evaluate((element) => element.setAttribute('current', '2'))
  await expect(dialog(page, 'Filters')).toBeVisible()
  await host(page).evaluate((element) => element.removeAttribute('open'))
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'hide'])
})

test('a step whose target is missing shows centred', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tour open><c2-tour-step target="#nowhere" heading="Gone">Not on this page.</c2-tour-step></c2-tour>`)
  await expect(dialog(page, 'Gone')).toBeVisible()
  await expect(panel(page)).toHaveAttribute('data-placement', 'center')
  await expect(page.locator('c2-tour .progress')).toHaveText('')
  await expect(button(page, 'Done')).toBeVisible()
})

test('the panel follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${markup()}</div>`)
  await launch(page)
  await expect(button(page, 'Suivant')).toBeVisible()
  await expect(button(page, 'Fermer la visite')).toBeVisible()
  await expect(page.locator('c2-tour .progress')).toHaveText('1 sur 3')
})

test('is accessible on a centred and on an anchored step', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await accessible(page)
  await button(page, 'Next').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await accessible(page)
})

test('a button in the trigger slot starts the tour from its first step', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tour current="1">
      <button slot="trigger">Show me around</button>
      <c2-tour-step heading="First">One.</c2-tour-step>
      <c2-tour-step heading="Second">Two.</c2-tour-step>
    </c2-tour>`)
  await expect(button(page, 'Show me around')).toBeVisible()
  await expect(page.locator('c2-tour-step').first()).toBeHidden()
  await button(page, 'Show me around').click()
  await expect(dialog(page, 'First')).toBeVisible()
  await button(page, 'Next').click()
  await expect(dialog(page, 'Second')).toBeVisible()
})
