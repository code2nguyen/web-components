import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { Beacon } from '../src/beacon'

const markup = (attributes = '') => `
  <div style="display: flex; gap: 48px; margin-top: 160px; align-items: center">
    <button id="search">Search</button>
    <div id="filters" style="padding: 8px">Filters</div>
  </div>
  <c2-beacon ${attributes}>
    <c2-tour-step id="tip-search" target="#search" heading="Search">Find anything here.</c2-tour-step>
    <c2-tour-step target="#filters" heading="Filters">Narrow the results.</c2-tour-step>
    <c2-tour-step target="#missing" heading="Missing">Its target is not on the page.</c2-tour-step>
  </c2-beacon>`

const host = (page: Page) => page.locator('c2-beacon')
const panel = (page: Page) => page.locator('c2-beacon .panel')
const dots = (page: Page) => page.locator('c2-beacon .beacon:popover-open')
const dot = (page: Page, heading: string) => page.getByRole('button', { name: `Show tip: ${heading}`, exact: true })
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

async function record(page: Page) {
  await host(page).evaluate((element) => {
    const log: string[] = []
    ;(window as unknown as { beaconLog: string[] }).beaconLog = log
    for (const name of ['dismiss', 'step-change', 'finish', 'skip', 'show', 'hide'])
      element.addEventListener(name, (event) => log.push(event instanceof CustomEvent ? `${name}:${JSON.stringify(event.detail)}` : name))
  })
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { beaconLog: string[] }).beaconLog)

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('demo-beacon') ?? 'null'))

test('shows a dot on the top end corner of each target, and opens nothing by itself', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await expect(dot(page, 'Search')).toBeVisible()
  await expect(dot(page, 'Filters')).toBeVisible()
  // A step whose target is missing has no dot.
  await expect(dot(page, 'Missing')).toHaveCount(0)
  await expect(panel(page)).toBeHidden()
  await expect(page.locator('body')).toBeFocused()

  const target = (await page.locator('#search').boundingBox())!
  await expect
    .poll(async () => {
      const box = (await dot(page, 'Search').boundingBox())!
      return [Math.round(box.x + box.width / 2 - (target.x + target.width)), Math.round(box.y + box.height / 2 - target.y)]
    })
    .toEqual([0, 0])
  await expect(dot(page, 'Search')).toHaveAttribute('aria-expanded', 'false')
})

test('a click on a dot opens its tip beside the target, undimmed, with focus on Got it', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await dot(page, 'Search').click()
  const tip = dialog(page, 'Search')
  await expect(tip).toBeVisible()
  await expect(tip).toHaveAccessibleDescription('Find anything here.')
  await expect(button(page, 'Got it')).toBeFocused()
  await expect(dot(page, 'Search')).toHaveAttribute('aria-expanded', 'true')
  // No tour chrome: no progress, Back, Next or Skip.
  for (const name of ['Next', 'Back', 'Skip', 'Done']) await expect(button(page, name)).toHaveCount(0)
  await expect(panel(page)).toHaveAttribute('data-placement', 'bottom')
  const shadow = await page.locator('c2-beacon .spotlight').evaluate((element) => getComputedStyle(element).boxShadow)
  expect(shadow).toContain('rgba(0, 0, 0, 0)')

  // Another dot moves the panel to its tip.
  await dot(page, 'Filters').click()
  await expect(dialog(page, 'Filters')).toBeVisible()
  await expect(dot(page, 'Search')).toHaveAttribute('aria-expanded', 'false')
  expect(await events(page)).toEqual(['show'])
})

test('Got it dismisses the tip: its dot goes and focus moves to the target', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await dot(page, 'Search').click()
  await button(page, 'Got it').click()
  await expect(panel(page)).toBeHidden()
  await expect(dot(page, 'Search')).toHaveCount(0)
  await expect(dot(page, 'Filters')).toBeVisible()
  await expect(page.locator('#search')).toBeFocused()
  expect(await events(page)).toEqual(['show', 'dismiss:{"index":0,"key":"tip-search"}', 'hide'])
  expect(await host(page).evaluate((element: Beacon) => element.dismissed)).toEqual(['tip-search'])
})

test('dismissing a tip whose target cannot take focus moves focus to the next dot', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await dot(page, 'Filters').click()
  await button(page, 'Got it').click()
  await expect(dot(page, 'Filters')).toHaveCount(0)
  await expect(dot(page, 'Search')).toBeFocused()
})

test('the close button, Escape and a click outside close the tip and keep its dot', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await dot(page, 'Search').click()
  await button(page, 'Close tour').click()
  await expect(panel(page)).toBeHidden()
  await expect(dot(page, 'Search')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(dot(page, 'Search')).toBeFocused()

  await dot(page, 'Search').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.mouse.click(400, 20)
  await expect(panel(page)).toBeHidden()

  // A click on the open tip's own dot closes it too.
  await dot(page, 'Filters').click()
  await expect(dialog(page, 'Filters')).toBeVisible()
  await dot(page, 'Filters').click()
  await expect(panel(page)).toBeHidden()

  await expect(dots(page)).toHaveCount(2)
  expect(await events(page)).toEqual(['show', 'hide', 'show', 'hide', 'show', 'hide', 'show', 'hide'])
})

test('the dots are reached with Tab and opened with the keyboard', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await page.locator('#search').focus()
  await page.keyboard.press('Tab')
  await expect(dot(page, 'Search')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dot(page, 'Filters')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(dialog(page, 'Filters')).toBeVisible()
  // The arrow keys do not move between tips.
  await page.keyboard.press('ArrowLeft')
  await expect(dialog(page, 'Filters')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(dot(page, 'Filters')).toHaveCount(0)
})

test('storage-key remembers the dismissed tips across loads, and reset() brings them back', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.removeItem('demo-beacon'))
  await renderScenario(markup('storage-key="demo-beacon"'))
  await dot(page, 'Search').click()
  await button(page, 'Got it').click()
  await dot(page, 'Filters').click()
  await button(page, 'Close tour').click()
  expect(await stored(page)).toEqual({ dismissed: ['tip-search'] })

  // A tip is remembered by its id, so a new tip before it does not bring it back.
  await renderScenario(
    markup('storage-key="demo-beacon"').replace(
      '<c2-tour-step id="tip-search"',
      '<c2-tour-step target="#filters" heading="New">New.</c2-tour-step><c2-tour-step id="tip-search"',
    ),
  )
  await expect(dot(page, 'New')).toBeVisible()
  await expect(dot(page, 'Search')).toHaveCount(0)

  await host(page).evaluate((element: Beacon) => element.reset())
  await expect(dot(page, 'Search')).toBeVisible()
  expect(await stored(page)).toBeNull()
})

test('storage that throws leaves the beacon working', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => {
    Storage.prototype.getItem = () => {
      throw new Error('blocked')
    }
    Storage.prototype.setItem = () => {
      throw new Error('blocked')
    }
  })
  await renderScenario(markup('storage-key="demo-beacon"'))
  await dot(page, 'Search').click()
  await button(page, 'Got it').click()
  await expect(dot(page, 'Search')).toHaveCount(0)
})

test('a dot hides while its target is not rendered and follows it when it moves', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await expect(dot(page, 'Search')).toBeVisible()
  await page.locator('#search').evaluate((element) => (element.style.display = 'none'))
  await expect(dot(page, 'Search')).toBeHidden()
  await page.locator('#search').evaluate((element) => {
    element.style.display = ''
    element.style.marginLeft = '200px'
  })
  await expect(dot(page, 'Search')).toBeVisible()
  const target = (await page.locator('#search').boundingBox())!
  await expect
    .poll(async () => {
      const box = (await dot(page, 'Search').boundingBox())!
      return Math.round(box.x + box.width / 2 - (target.x + target.width))
    })
    .toBe(0)
})

test('several beacons coexist, each with its own dots and memory', async ({ page, renderScenario }) => {
  await renderScenario(`${markup()}
    <button id="export" style="margin: 40px">Export</button>
    <c2-beacon id="second"><c2-tour-step target="#export" heading="Export">Download a CSV.</c2-tour-step></c2-beacon>`)
  await expect(dots(page)).toHaveCount(3)
  await dot(page, 'Export').click()
  await expect(dialog(page, 'Export')).toBeVisible()
  await button(page, 'Got it').click()
  await expect(dot(page, 'Export')).toHaveCount(0)
  await expect(dot(page, 'Search')).toBeVisible()
  await expect(dot(page, 'Filters')).toBeVisible()
})

test('the tip and the dots follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${markup()}</div>`)
  const search = page.getByRole('button', { name: 'Voir l’astuce : Search', exact: true })
  await expect(search).toBeVisible()
  await search.click()
  await expect(button(page, 'Compris')).toBeVisible()
  await expect(button(page, 'Fermer la visite')).toBeVisible()
})

test('a step without a heading gets a generic name for its dot', async ({ page, renderScenario }) => {
  await renderScenario(`<button id="lone">Lone</button><c2-beacon><c2-tour-step target="#lone">No heading.</c2-tour-step></c2-beacon>`)
  await expect(button(page, 'Show tip')).toBeVisible()
})

test('is accessible with the dots shown and with a tip open', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await expect(dot(page, 'Search')).toBeVisible()
  await accessible(page)
  await dot(page, 'Search').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await accessible(page)
})

test('a beacon that is moved in the page shows its dots again', async ({ page, renderScenario }) => {
  await renderScenario(`${markup()}<section id="elsewhere"></section>`)
  await expect(dots(page)).toHaveCount(2)
  await page.evaluate(() => document.querySelector('#elsewhere')!.append(document.querySelector('c2-beacon')!))
  await expect(dot(page, 'Search')).toBeVisible()
  await expect(dot(page, 'Filters')).toBeVisible()
})

test('a target added later gets its dot, and a replaced target moves it', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await expect(dot(page, 'Missing')).toHaveCount(0)
  await page.evaluate(() => {
    const late = Object.assign(document.createElement('button'), { id: 'missing', textContent: 'Late' })
    document.querySelector('main')!.append(late)
  })
  await expect(dot(page, 'Missing')).toBeVisible()

  // A framework re-render swaps the element for a new one in another place.
  await page.evaluate(() => {
    const replacement = Object.assign(document.createElement('button'), { id: 'search', textContent: 'Search' })
    replacement.style.marginLeft = '300px'
    document.querySelector('#search')!.remove()
    document.querySelector('main')!.append(replacement)
  })
  const target = page.locator('#search')
  await expect
    .poll(async () => {
      const box = (await dot(page, 'Search').boundingBox())!
      const goal = (await target.boundingBox())!
      return Math.round(box.x + box.width / 2 - (goal.x + goal.width))
    })
    .toBe(0)
})

test('focus goes back to the dot of the tip shown last', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await dot(page, 'Search').click()
  await dot(page, 'Filters').click()
  await expect(dialog(page, 'Filters')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dot(page, 'Filters')).toBeFocused()
})

test('a step whose heading changes renames its dot', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await page.locator('c2-tour-step#tip-search').evaluate((step) => step.setAttribute('heading', 'Find'))
  await expect(dot(page, 'Find')).toBeVisible()
})
