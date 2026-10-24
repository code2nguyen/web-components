import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, props } from '../../../../tests/component-fixture'

// The bar states its landmark through ElementInternals, which getByRole cannot see, so it is found by tag; the items'
// links and buttons are native and found by role.
const events = async (page: Page, selector = 'c2-bottom-nav') => JSON.parse((await page.locator(selector).getAttribute('data-events')) ?? '[]')
const icon = '<svg slot="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="8" /></svg>'

const links = `<button>Before</button>
<c2-bottom-nav value="home">
  <c2-bottom-nav-item value="home" href="#home">${icon}Home</c2-bottom-nav-item>
  <c2-bottom-nav-item value="cards" href="#cards">${icon}Cards</c2-bottom-nav-item>
  <c2-bottom-nav-item value="inbox" href="#inbox" count="3">${icon}Inbox</c2-bottom-nav-item>
  <c2-bottom-nav-item value="me" href="#me" dot>${icon}Profile</c2-bottom-nav-item>
</c2-bottom-nav>
<button>After</button>`

const buttons = `<c2-bottom-nav>
  <c2-bottom-nav-item value="today">${icon}Today</c2-bottom-nav-item>
  <c2-bottom-nav-item value="invites" current>${icon}Invites</c2-bottom-nav-item>
  <c2-bottom-nav-item value="more">${icon}More</c2-bottom-nav-item>
</c2-bottom-nav>`

test('is a named navigation landmark of links and writes nothing on its hosts', async ({ page, renderScenario }) => {
  await renderScenario(links)
  const nav = page.locator('c2-bottom-nav')
  await expect(nav).toHaveHostAria('role', 'navigation')
  await expect(nav).toHaveHostAria('aria-label', 'Main')
  expect(await nav.evaluate((element) => element.getAttributeNames())).toEqual(['value'])
  expect(await page.locator('c2-bottom-nav-item').evaluateAll((items) => items.map((item) => item.getAttributeNames().sort().join(' ')))).toEqual([
    'href value',
    'href value',
    'count href value',
    'dot href value',
  ])
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Cards' })).not.toHaveAttribute('aria-current')
  await expect(page.locator('c2-bottom-nav-item').first()).toHaveState('current')
  await accessible(page)
})

test('an author aria-label names the landmark', async ({ page, renderScenario }) => {
  await renderScenario(links.replace('<c2-bottom-nav value="home">', '<c2-bottom-nav value="home" aria-label="Sections">'))
  await expect(page.locator('c2-bottom-nav')).toHaveHostAria('aria-label', 'Sections')
})

test('every item is a tab stop in order', async ({ page, renderScenario, tab }) => {
  await renderScenario(links)
  await page.getByRole('button', { name: 'Before' }).focus()
  for (const name of ['Home', 'Cards', /^Inbox/, /^Profile/]) {
    await tab()
    await expect(page.getByRole('link', { name })).toBeFocused()
  }
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('activating an item moves the current page, follows the link and fires item-select then change', async ({ page, renderScenario }) => {
  await renderScenario(links)
  const nav = page.locator('c2-bottom-nav')
  await nav.evaluate((element) => {
    const log: unknown[] = []
    element.addEventListener('item-select', (event) => log.push(['item-select', (event as CustomEvent).detail.value, (event as CustomEvent).detail.previous]))
    element.addEventListener('change', () => log.push(['change', (element as HTMLElement & { value: string }).value]))
    element.setAttribute('data-events', '[]')
    element.addEventListener('change', () => element.setAttribute('data-events', JSON.stringify(log)))
  })
  await page.getByRole('link', { name: 'Cards' }).click()
  expect(await events(page)).toEqual([
    ['item-select', 'cards', 'home'],
    ['change', 'cards'],
  ])
  await expect(page.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#cards')
  expect(await nav.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('cards')
})

test('a cancelled item-select keeps the current page and stops the link', async ({ page, renderScenario }) => {
  await renderScenario(links)
  const nav = page.locator('c2-bottom-nav')
  await nav.evaluate((element) => element.addEventListener('item-select', (event) => event.preventDefault()))
  await watch(nav, 'change')
  await page.getByRole('link', { name: 'Cards' }).click()
  expect(await events(page)).toEqual([])
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  expect(await page.evaluate(() => location.hash)).toBe('')
})

test('activating the current item fires reselect and no change', async ({ page, renderScenario }) => {
  await renderScenario(links)
  const nav = page.locator('c2-bottom-nav')
  await nav.evaluate((element) => {
    element.addEventListener('reselect', (event) => element.setAttribute('data-reselected', (event as CustomEvent).detail.value))
    element.addEventListener('change', () => element.setAttribute('data-changed', ''))
  })
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(nav).toHaveAttribute('data-reselected', 'home')
  await expect(nav).not.toHaveAttribute('data-changed')
})

for (const key of ['Enter', 'Space']) {
  test(`button items activate with ${key}`, async ({ page, renderScenario }) => {
    await renderScenario(buttons)
    await page.getByRole('button', { name: 'Today' }).focus()
    await page.keyboard.press(key)
    await expect(page.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('button', { name: 'Invites' })).not.toHaveAttribute('aria-current')
  })
}

test('an item marked current gives the bar its value, and setting value moves it', async ({ page, renderScenario }) => {
  await renderScenario(buttons)
  const nav = page.locator('c2-bottom-nav')
  await expect.poll(() => nav.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('invites')
  await props(nav, { value: 'more' })
  await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Invites' })).not.toHaveAttribute('aria-current')
})

test('badges are part of the name', async ({ page, renderScenario }) => {
  await renderScenario(links)
  await expect(page.getByRole('link', { name: /^Inbox/ })).toHaveAccessibleName(/^Inbox\s*,\s*3 new$/)
  await expect(page.getByRole('link', { name: /^Profile/ })).toHaveAccessibleName(/^Profile\s*,\s*new activity$/)
  const inbox = page.locator('c2-bottom-nav-item[value="inbox"]')
  await props(inbox, { count: 250 })
  await expect(page.getByRole('link', { name: /^Inbox/ })).toHaveAccessibleName(/^Inbox\s*,\s*99\+ new$/)
  await expect(inbox.locator('c2-badge')).toBeVisible()
  await props(inbox, { count: 0 })
  await expect(page.getByRole('link', { name: /^Inbox/ })).toHaveAccessibleName('Inbox')
  await expect(inbox.locator('c2-badge')).toHaveCount(0)
})

test('text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${links}</div>`)
  await expect(page.locator('c2-bottom-nav')).toHaveHostAria('aria-label', 'Principale')
  await expect(page.getByRole('link', { name: /^Inbox/ })).toHaveAccessibleName(/^Inbox\s*,\s*3 nouveaux$/)
})

const labelShown = (page: Page) =>
  page
    .locator('c2-bottom-nav-item')
    .evaluateAll((items) => items.map((item) => (item.shadowRoot!.querySelector('[part="label"]') as HTMLElement).offsetWidth > 1))

test('label-visibility hides labels but keeps them as names', async ({ page, renderScenario }) => {
  await renderScenario(links)
  const nav = page.locator('c2-bottom-nav')
  expect(await labelShown(page)).toEqual([true, true, true, true])
  await props(nav, { labelVisibility: 'unlabeled' })
  expect(await labelShown(page)).toEqual([false, false, false, false])
  await expect(page.getByRole('link', { name: 'Cards' })).toBeVisible()
  await props(nav, { labelVisibility: 'selected' })
  expect(await labelShown(page)).toEqual([true, false, false, false])
  // auto: four items show only the current label, three show all of them.
  await props(nav, { labelVisibility: 'auto' })
  expect(await labelShown(page)).toEqual([true, false, false, false])
  await page.locator('c2-bottom-nav-item[value="me"]').evaluate((item) => item.remove())
  await expect.poll(() => labelShown(page)).toEqual([true, true, true])
})

test('hide-on-scroll slides the bar away going down and back going up or on focus', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div id="feed"><div class="tall"></div>${links.replace('<c2-bottom-nav value="home">', '<c2-bottom-nav value="home" hide-on-scroll scroll-target="feed">')}</div>`,
  )
  const nav = page.locator('c2-bottom-nav')
  const feed = page.locator('#feed')
  await feed.hover()
  await page.mouse.wheel(0, 400)
  await expect(nav).toHaveState('scrolled-away')
  expect(await nav.evaluate((element) => (element as HTMLElement & { scrolledAway: boolean }).scrolledAway)).toBe(true)
  await page.mouse.wheel(0, -100)
  await expect(nav).not.toHaveState('scrolled-away')
  await page.mouse.wheel(0, 300)
  await expect(nav).toHaveState('scrolled-away')
  await page.getByRole('link', { name: 'Cards' }).focus()
  await expect(nav).not.toHaveState('scrolled-away')
})

test('without hide-on-scroll the bar stays', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div id="feed"><div class="tall"></div>${links.replace('<c2-bottom-nav value="home">', '<c2-bottom-nav value="home" scroll-target="feed">')}</div>`,
  )
  await page.locator('#feed').hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => page.locator('#feed').evaluate((element) => element.scrollTop)).toBeGreaterThan(100)
  await expect(page.locator('c2-bottom-nav')).not.toHaveState('scrolled-away')
})

test('finds items inside wrapper elements, such as the islands Astro wraps them in', async ({ page, renderScenario }) => {
  const wrapped = links.replace(
    /<c2-bottom-nav-item([\s\S]*?)<\/c2-bottom-nav-item>/g,
    '<span style="display: contents"><c2-bottom-nav-item$1</c2-bottom-nav-item></span>',
  )
  await renderScenario(wrapped.replace('<c2-bottom-nav value="home">', '<c2-bottom-nav value="home" label-visibility="selected">'))
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  expect(await labelShown(page)).toEqual([true, false, false, false])
  await page.getByRole('link', { name: 'Cards' }).click()
  await expect(page.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
  // Items still share the bar's width equally.
  const widths = await page.locator('c2-bottom-nav-item').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().width)))
  expect(new Set(widths).size).toBe(1)
})

test('value can be cleared for a page that is none of the items', async ({ page, renderScenario }) => {
  await renderScenario(links)
  await props(page.locator('c2-bottom-nav'), { value: '' })
  await expect(page.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  expect(await page.locator('c2-bottom-nav').evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('')
})

test('an item given the current attribute later becomes the current item', async ({ page, renderScenario }) => {
  await renderScenario(links)
  await page.locator('c2-bottom-nav-item[value="cards"]').evaluate((item) => item.setAttribute('current', ''))
  await expect(page.getByRole('link', { name: 'Cards' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  expect(await page.locator('c2-bottom-nav').evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('cards')
})

test('an item added inside a wrapper is synced', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-bottom-nav value="new" label-visibility="auto"><span id="wrapper" style="display: contents">
  <c2-bottom-nav-item value="a">A</c2-bottom-nav-item><c2-bottom-nav-item value="b">B</c2-bottom-nav-item><c2-bottom-nav-item value="c">C</c2-bottom-nav-item>
</span></c2-bottom-nav>`)
  expect(await labelShown(page)).toEqual([true, true, true])
  await page.locator('#wrapper').evaluate((wrapper) => wrapper.insertAdjacentHTML('beforeend', '<c2-bottom-nav-item value="new">New</c2-bottom-nav-item>'))
  await expect(page.getByRole('button', { name: 'New' })).toHaveAttribute('aria-current', 'page')
  await expect.poll(() => labelShown(page)).toEqual([false, false, false, true])
})

test('a link that opens in another tab does not become current', async ({ page, renderScenario }) => {
  await renderScenario(links.replace('href="#cards"', 'href="#cards" target="_blank"'))
  const nav = page.locator('c2-bottom-nav')
  await watch(nav, 'change')
  const popup = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Cards' }).click()
  await (await popup).close()
  expect(await events(page)).toEqual([])
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
})

test('without value, href or label an item is identified by its label text alone', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-bottom-nav><c2-bottom-nav-item><span slot="icon">★</span>Saved</c2-bottom-nav-item></c2-bottom-nav>`)
  expect(await page.locator('c2-bottom-nav-item').evaluate((item) => (item as HTMLElement & { effectiveValue: string }).effectiveValue)).toBe('Saved')
})
