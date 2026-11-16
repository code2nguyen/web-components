import type { Locator, Page } from '@playwright/test'
import type { IndexBar } from '../src/index-bar'
import { test, expect, accessible, watch, pointerClick, props } from '../../../../tests/component-fixture'

const letters = ['A', 'B', 'C', 'E', 'H', 'M', 'S', 'Z']
const section = (key: string) => `<section style="min-height: 160px"><h3 id="k-${key.toLowerCase()}">${key}</h3><p>${key}da</p><p>${key}lan</p></section>`
// The rail comes first in the DOM, so it is the first Tab stop; `order` draws it after the list.
const layout = (bar: string, sections = letters.map(section).join('')) => `
  <div style="display: flex; gap: 16px; align-items: flex-start; padding: 16px 16px 16px 96px">
    ${bar}
    <div id="contacts" tabindex="0" role="region" aria-label="Contacts" style="order: 1; height: 320px; width: 280px; overflow: auto">${sections}<div style="height: 320px"></div></div>
  </div>
`
const withBar = (attributes = '') => layout(`<c2-index-bar for="contacts" selector="h3" style="order: 2"${attributes}></c2-index-bar>`)

const bar = (page: Page) => page.locator('c2-index-bar')
const key = (page: Page, name: string) => bar(page).getByRole('link', { name, exact: true })
const current = (page: Page) => bar(page).locator('a[aria-current="true"]')
const bubble = (page: Page) => bar(page).locator('[part="bubble"]')
/** The heading's top relative to the list's, within the pixel an engine that scrolls by whole pixels (WebKit) may miss by. */
const settlesAtTop = (page: Page, id: string) =>
  expect
    .poll(() =>
      page
        .locator(`#${id}`)
        .evaluate((heading) => Math.abs(heading.getBoundingClientRect().top - document.getElementById('contacts')!.getBoundingClientRect().top) <= 1),
    )
    .toBe(true)
const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('lists the keys of the sections and marks the one being read', async ({ page, renderScenario }) => {
  await renderScenario(withBar())
  const nav = page.getByRole('navigation', { name: 'Index' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link')).toHaveText(letters)
  await expect(key(page, 'M')).toHaveAttribute('href', '#k-m')
  await expect(current(page)).toHaveText('A')
  await expect(key(page, 'A')).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await expect(bubble(page)).toBeHidden()
  await accessible(page)
})

test('follows the list as it scrolls', async ({ page, renderScenario }) => {
  await renderScenario(withBar())
  await watch(bar(page), 'active-change')
  await page.locator('#k-m').evaluate((heading) => heading.scrollIntoView({ block: 'start' }))
  await expect(current(page)).toHaveText('M')
  await expect(key(page, 'A')).not.toHaveAttribute('aria-current')
  await expect.poll(() => bar(page).evaluate((el) => (el as IndexBar).activeId)).toBe('k-m')
  const events = JSON.parse((await bar(page).getAttribute('data-events')) ?? '[]') as { id: string }[]
  expect(events.at(-1)?.id).toBe('k-m')
})

test('a tap jumps to the section, focuses it and updates the URL', async ({ page, renderScenario }) => {
  await renderScenario(withBar())
  await pointerClick(key(page, 'S'))
  await settlesAtTop(page, 'k-s')
  await expect(page.locator('#k-s')).toBeFocused()
  await expect(current(page)).toHaveText('S')
  expect(new URL(page.url()).hash).toBe('#k-s')
  await expect(bubble(page)).toBeHidden()
})

test('dragging along the rail scrubs through the sections with a bubble', async ({ page, renderScenario }) => {
  await renderScenario(withBar(' keep-url'))
  const start = await centre(key(page, 'A'))
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await expect(bubble(page)).toBeVisible()
  await expect(bubble(page)).toHaveText('A')
  const m = await centre(key(page, 'M'))
  await page.mouse.move(m.x, m.y, { steps: 5 })
  await expect(bubble(page)).toHaveText('M')
  await expect(current(page)).toHaveText('M')
  await settlesAtTop(page, 'k-m')
  // The bubble sits beside the key under the pointer, towards the list.
  const bubbleBox = (await bubble(page).boundingBox())!
  expect(Math.abs(bubbleBox.y + bubbleBox.height / 2 - m.y)).toBeLessThanOrEqual(2)
  expect(bubbleBox.x + bubbleBox.width).toBeLessThan(m.x)
  const z = await centre(key(page, 'Z'))
  // Past the end of the rail (still inside the page) stays on the last key.
  await page.mouse.move(z.x + 40, z.y + 60, { steps: 5 })
  await expect(bubble(page)).toHaveText('Z')
  await page.mouse.up()
  await expect(bubble(page)).toBeHidden()
  await expect(current(page)).toHaveText('Z')
  await settlesAtTop(page, 'k-z')
  await expect(page.locator('#k-z')).toBeFocused()
  expect(new URL(page.url()).hash).toBe('')
})

test('keys shows the whole alphabet and dims the empty keys', async ({ page, renderScenario }) => {
  await renderScenario(
    layout(
      '<c2-index-bar for="contacts" selector="h3" keys="ABCDEFGHIJKLMNOPQRSTUVWXYZ#" style="order: 2"></c2-index-bar>',
      ['A', 'É', 'H', 'M'].map(section).join('') + '<section style="min-height: 160px"><h3 id="k-num">1-800 Flowers</h3></section>',
    ),
  )
  await expect(bar(page).locator('[part~="key"]')).toHaveCount(27)
  // É is filed under E, 1-800 under #; the other keys are empty, dimmed and out of the accessibility tree.
  await expect(bar(page).getByRole('link')).toHaveText(['A', 'E', 'H', 'M', '#'])
  await expect(key(page, 'E')).toHaveAttribute('href', '#k-%C3%A9')
  await expect(key(page, '#')).toHaveAttribute('href', '#k-num')
  const empty = bar(page).locator('[part~="empty"]')
  await expect(empty).toHaveCount(22)
  await expect(empty.first()).toHaveCSS('opacity', '0.38')
  await accessible(page)
  // Dragging onto an empty key moves on to the next key that has a section.
  const d = await centre(empty.filter({ hasText: 'D' }))
  await page.mouse.move(d.x, d.y)
  await page.mouse.down()
  await expect(bubble(page)).toHaveText('E')
  await expect(current(page)).toHaveText('E')
  await page.mouse.up()
})

test('the rail is one Tab stop, walked with the arrow keys', async ({ page, renderScenario, tab }) => {
  await renderScenario(withBar())
  await tab()
  await expect(key(page, 'A')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(key(page, 'B')).toBeFocused()
  await page.keyboard.press('End')
  await expect(key(page, 'Z')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(key(page, 'Z')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(key(page, 'A')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(key(page, 'A')).toBeFocused()
  await expect(bar(page).locator('a[tabindex="0"]')).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(key(page, 'C')).toBeFocused()
  // Tab leaves the rail; back into it, its Tab stop is the current key again.
  await tab()
  await expect(page.locator('#contacts')).toBeFocused()
  await tab(true)
  await expect(key(page, 'A')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('#k-c')).toBeFocused()
  await expect(current(page)).toHaveText('C')
  await expect(bar(page).locator('a[tabindex="0"]')).toHaveText('C')
})

test('items lists sections given by the author, with their own keys', async ({ page, renderScenario }) => {
  await renderScenario(layout('<c2-index-bar keys="A;B;C" style="order: 2"></c2-index-bar>'))
  await props(bar(page), {
    items: [
      { id: 'k-a', label: 'Ada', key: 'A' },
      { id: 'k-c', label: 'Carl' },
    ],
  })
  await expect(bar(page).getByRole('link')).toHaveText(['A', 'C'])
  await expect(bar(page).locator('[part~="empty"]')).toHaveText('B')
  await pointerClick(key(page, 'C'))
  await settlesAtTop(page, 'k-c')
})

test('renders nothing without sections, even with keys', async ({ page, renderScenario }) => {
  await renderScenario(
    layout('<c2-index-bar for="contacts" selector="h6" style="order: 2"></c2-index-bar><c2-index-bar for="contacts" selector="h6" keys="ABC"></c2-index-bar>'),
  )
  await expect(page.getByRole('navigation')).toHaveCount(0)
})

test('jumps to the top of a section whose sticky heading is stuck', async ({ page, renderScenario }) => {
  await renderScenario(
    layout(
      '<c2-index-bar for="contacts" selector="h3" keep-url style="order: 2"></c2-index-bar><style>#contacts h3 { position: sticky; top: 0; margin: 0; background: white; }</style>',
    ),
  )
  // Halfway into M's section: its heading is stuck at the top of the list, though the section starts above it.
  const sectionTop = () =>
    page
      .locator('#k-m')
      .evaluate((heading) => Math.round(heading.parentElement!.getBoundingClientRect().top - document.getElementById('contacts')!.getBoundingClientRect().top))
  await page.locator('#contacts').evaluate((list) => list.scrollBy(0, 870))
  await expect(current(page)).toHaveText('M')
  expect(await sectionTop()).toBeLessThan(-20)
  await pointerClick(key(page, 'M'))
  await expect.poll(sectionTop).toBe(0)
  expect(await page.locator('#k-m').evaluate((heading) => heading.getAttribute('style'))).toBe(null)
})

test('jumps back to a sticky heading that is stuck under a later one', async ({ page, renderScenario }) => {
  await renderScenario(
    layout(
      '<c2-index-bar for="contacts" selector="h3" keep-url style="order: 2"></c2-index-bar><style>#contacts h3 { position: sticky; top: 0; margin: 0; background: white; }</style>',
    ),
  )
  await page.locator('#contacts').evaluate((list) => list.scrollTo(0, 900))
  await expect(current(page)).not.toHaveText('A')
  await pointerClick(key(page, 'A'))
  await expect.poll(() => page.locator('#contacts').evaluate((list) => list.scrollTop)).toBe(0)
  await expect(current(page)).toHaveText('A')
  // The heading is left as the author wrote it.
  expect(await page.locator('#k-a').evaluate((heading) => heading.getAttribute('style'))).toBe(null)
})

test('the landmark name follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${withBar()}</div>`)
  await expect(page.getByRole('navigation', { name: 'Index alphabétique' })).toBeVisible()
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'vi'))
  await expect(page.getByRole('navigation', { name: 'Chỉ mục' })).toBeVisible()
})
