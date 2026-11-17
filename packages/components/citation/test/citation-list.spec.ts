import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { CitationList } from '../src/citation-list'
import type { Citation } from '../src/citation'
import type { Page } from '@playwright/test'

const list = (page: Page, selector = 'c2-citation-list') => page.locator(selector)
const summary = (page: Page, selector?: string) => list(page, selector).locator('[part="summary"]')
const count = (page: Page, selector?: string) => list(page, selector).locator('[part="count"]')
const cards = (page: Page, selector?: string) => list(page, selector).locator('[part="source"]')
const highlighted = (page: Page) =>
  page.locator('c2-citation').evaluateAll((markers) => markers.filter((marker) => (marker as Citation).highlighted).map((marker) => marker.id))

const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"

const ANSWER = `<article>
  <p>Lit renders on the server<c2-citation id="m1" index="1" href="https://www.lit.dev/docs/ssr/" source-title="Server-side rendering – Lit" snippet="Lit's SSR renders components to static HTML." favicon="${ICON}"></c2-citation>
  and the browser attaches declarative shadow roots<c2-citation id="m2" index="2" href="https://developer.chrome.com/dsd" source-title="Declarative Shadow DOM" site="Chrome for Developers"></c2-citation>
  before hydration<c2-citation id="m3" index="1" href="https://www.lit.dev/docs/ssr/"></c2-citation>.</p>
  <c2-citation-list></c2-citation-list>
</article>`

test('collects the markers of its answer, one card per source in the order of their numbers', async ({ page, renderScenario }) => {
  await renderScenario(ANSWER)
  await expect(count(page)).toHaveText('Used 2 sources')
  await expect(list(page).locator('[part="icon"]')).toHaveCount(2)
  await expect(list(page).locator('[part="icon"]').nth(1)).toHaveText('C')
  await expect(cards(page).first()).toBeHidden()
  await summary(page).click()
  await expect(cards(page)).toHaveCount(2)
  const first = list(page).getByRole('link', { name: 'Source 1: Server-side rendering – Lit' })
  await expect(first).toBeVisible()
  await expect(first).toHaveAttribute('href', 'https://www.lit.dev/docs/ssr/')
  await expect(first).toHaveAttribute('target', '_blank')
  await expect(first).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(first).toHaveAccessibleDescription("Lit's SSR renders components to static HTML.")
  await expect(list(page).locator('[part="number"]')).toHaveText(['1', '2'])
  await expect(list(page).locator('[part="site"]')).toHaveText(['lit.dev', 'Chrome for Developers'])
  await expect(list(page)).toHaveJSProperty('open', true)
  await accessible(page)
})

test('the keyboard opens the list, and focusing a card highlights the markers that cite it', async ({ page, renderScenario }) => {
  await renderScenario(`<p><a href="#before">Before</a></p>${ANSWER}`)
  await page.getByRole('link', { name: 'Before' }).focus()
  // The markers are links too: Tab walks past them to the toggle.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(summary(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cards(page).first()).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(list(page).getByRole('link', { name: /^Source 1:/ })).toBeFocused()
  await expect.poll(() => highlighted(page)).toEqual(['m1', 'm3'])
  await expect(page.locator('#m1').locator('[part="marker"]')).toHaveClass(/highlighted/)
  await page.keyboard.press('Tab')
  await expect.poll(() => highlighted(page)).toEqual(['m2'])
  await page.keyboard.press('Tab')
  await expect.poll(() => highlighted(page)).toEqual([])
})

test('pointing at a card highlights its markers until the pointer leaves', async ({ page, renderScenario }) => {
  await renderScenario(ANSWER)
  await summary(page).click()
  await cards(page).nth(1).hover()
  await expect.poll(() => highlighted(page)).toEqual(['m2'])
  await page.mouse.move(5, 5)
  await expect.poll(() => highlighted(page)).toEqual([])
})

test('follows the answer as markers are added and changed, as while it streams', async ({ page, renderScenario }) => {
  await renderScenario(ANSWER)
  await expect(count(page)).toHaveText('Used 2 sources')
  await page.locator('article > p').evaluate((paragraph) => {
    const marker = document.createElement('c2-citation')
    marker.setAttribute('index', '3')
    marker.setAttribute('href', 'https://example.com/third')
    paragraph.append(marker)
  })
  await expect(count(page)).toHaveText('Used 3 sources')
  await page.locator('#m2').evaluate((marker) => marker.setAttribute('site', 'web.dev'))
  await summary(page).click()
  await expect(list(page).locator('[part="site"]')).toHaveText(['lit.dev', 'web.dev', 'example.com'])
  await page.locator('#m2').evaluate((marker) => marker.remove())
  await expect(count(page)).toHaveText('Used 2 sources')
})

test('with no sources it draws nothing', async ({ page, renderScenario }) => {
  await renderScenario(`<div><p>No citations here.</p><c2-citation-list></c2-citation-list></div>`)
  await expect(list(page).locator('details')).toHaveCount(0)
  await expect.poll(async () => (await list(page).boundingBox())?.height ?? 0).toBe(0)
})

test('for names the answer elsewhere on the page, and sources win over the markers', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-citation-list id="later" for="answer"></c2-citation-list>
    <c2-citation-list id="given" for="answer" sources='[{"index":7,"href":"https://example.org/a","title":"Given source","snippet":"From the server."}]'></c2-citation-list>
    <div id="answer"><p>Text<c2-citation id="m9" index="9" href="https://example.net/x" source-title="Ninth"></c2-citation></p></div>`)
  await expect(count(page, '#later')).toHaveText('Used 1 source')
  await expect(count(page, '#given')).toHaveText('Used 1 source')
  await summary(page, '#given').click()
  await expect(list(page, '#given').locator('[part="title"]')).toHaveText('Given source')
  await expect(list(page, '#given').locator('[part="number"]')).toHaveText('7')
  // An answer named by `for` that appears only later is found then.
  await list(page, '#later').evaluate((element: CitationList) => (element.for = 'missing'))
  await expect(list(page, '#later').locator('details')).toHaveCount(0)
  await page.locator('#answer').evaluate((answer) => {
    const late = document.createElement('div')
    late.id = 'missing'
    late.innerHTML =
      '<c2-citation index="1" href="https://example.com/late"></c2-citation><c2-citation index="2" href="https://example.com/later"></c2-citation>'
    answer.after(late)
  })
  await expect(count(page, '#later')).toHaveText('Used 2 sources')
})

test('a source whose address is not http(s) is not a link, and its icon is not loaded', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div><c2-citation index="1" href="javascript:alert(1)" source-title="Untrusted" site="model output" favicon="javascript:alert(2)"></c2-citation><c2-citation-list open></c2-citation-list></div>`,
  )
  await expect(cards(page)).toHaveCount(1)
  await expect(list(page).getByRole('link')).toHaveCount(0)
  await expect(list(page).locator('img')).toHaveCount(0)
  await expect(list(page).locator('[part="icon"]')).toHaveText('M')
  await expect(list(page).locator('[part="title"]')).toHaveText('Untrusted')
})

test('the slots replace the summary text and add a footer, and renderSource draws the cards', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="plain">${ANSWER}</div>`)
  await expect(list(page).locator('[part="footer"]')).toBeHidden()
  await list(page).evaluate((element: CitationList) => {
    element.innerHTML = '<span slot="summary">2 pages read</span><button slot="footer">Copy all</button>'
    element.renderSource = ({ source, number }) => `#${number} ${source.title ?? ''}`
    element.open = true
  })
  await expect(page.getByRole('button', { name: 'Copy all' })).toBeVisible()
  await expect(cards(page).first()).toHaveText('#1 Server-side rendering – Lit')
  // The card keeps its link and its name; only the content is the renderer's.
  await expect(list(page).getByRole('link', { name: 'Source 1: Server-side rendering – Lit' })).toHaveAttribute('href', 'https://www.lit.dev/docs/ssr/')
  const shown = await summary(page)
    .locator('slot')
    .evaluate((slot) =>
      (slot as HTMLSlotElement)
        .assignedNodes()
        .map((node) => node.textContent)
        .join(''),
    )
  expect(shown).toBe('2 pages read')
})

test('the open property and the toggle event follow each other', async ({ page, renderScenario }) => {
  await renderScenario(ANSWER)
  await list(page).evaluate((element: CitationList) => {
    ;(window as unknown as { toggles: string[] }).toggles = []
    element.addEventListener('toggle', (event) => (window as unknown as { toggles: string[] }).toggles.push(event.newState))
  })
  await list(page).evaluate((element: CitationList) => (element.open = true))
  await expect(cards(page).first()).toBeVisible()
  await summary(page).click()
  await expect(cards(page).first()).toBeHidden()
  await expect(list(page)).toHaveJSProperty('open', false)
  await expect.poll(() => page.evaluate(() => (window as unknown as { toggles: string[] }).toggles)).toEqual(['open', 'closed'])
})

test('the summary is counted in the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${ANSWER}</div>`)
  await expect(count(page)).toHaveText('2 sources utilisées')
  await summary(page).click()
  await expect(list(page).getByRole('link', { name: 'Source 2 : Declarative Shadow DOM' })).toBeVisible()
})
