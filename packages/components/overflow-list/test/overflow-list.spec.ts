import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { OverflowList } from '../src/overflow-list'

// Children are 80px wide and 8px apart, the trigger 36px: n children and the trigger take 88n + 36px.
const items = (count: number, attributes: (index: number) => string = () => '') =>
  Array.from({ length: count }, (_, i) => `<button class="item" type="button" ${attributes(i + 1)}>Item ${i + 1}</button>`).join('')

const list = (width: number, attributes = '', children = items(8)) =>
  `<button>Before</button><div class="frame" style="width: ${width}px"><c2-overflow-list ${attributes}>${children}</c2-overflow-list></div><button>After</button>`

const host = (page: Page) => page.locator('c2-overflow-list')
const trigger = (page: Page) => page.locator('c2-overflow-list').locator('.more')
const rows = (page: Page) => page.locator('c2-overflow-list c2-menu-item')
const events = async (page: Page) => JSON.parse((await host(page).getAttribute('data-events')) ?? '[]')
const visibleItems = (page: Page) =>
  host(page).evaluate((element) =>
    [...element.children].filter((child) => child.checkVisibility({ visibilityProperty: true })).map((child) => child.textContent?.trim()),
  )
const resize = (page: Page, width: number) => page.locator('.frame').evaluate((frame, value) => ((frame as HTMLElement).style.width = `${value}px`), width)

test('shows every child when they fit, with no trigger and nothing written on the host', async ({ page, renderScenario }) => {
  await renderScenario(list(720))
  await expect.poll(() => visibleItems(page)).toHaveLength(8)
  await expect(trigger(page)).toBeHidden()
  await expect(host(page)).not.toHaveState('overflowing')
  expect(await host(page).evaluate((element) => element.getAttributeNames())).toEqual([])
  expect(await host(page).evaluate((element) => [...element.children].map((child) => child.getAttribute('slot')))).toEqual(Array(8).fill(null))
})

test('folds what does not fit from the end and brings it back when there is room', async ({ page, renderScenario }) => {
  await renderScenario(list(720))
  await watch(host(page), 'overflow-change')
  await resize(page, 400)
  await expect.poll(() => visibleItems(page)).toEqual(['Item 1', 'Item 2', 'Item 3', 'Item 4'])
  await expect(page.getByRole('button', { name: '4 more items' })).toBeVisible()
  await expect(host(page)).toHaveState('overflowing')
  expect(await host(page).evaluate((element: OverflowList) => element.hiddenItems.map((item) => item.textContent))).toEqual([
    'Item 5',
    'Item 6',
    'Item 7',
    'Item 8',
  ])
  // Seven children fit without the trigger at 696px; the last one comes back only when the trigger can go.
  await resize(page, 650)
  await expect(page.getByRole('button', { name: '2 more items' })).toBeVisible()
  await resize(page, 700)
  await expect.poll(() => visibleItems(page)).toHaveLength(8)
  await expect(trigger(page)).toBeHidden()
  expect(await events(page)).toEqual([
    { visibleCount: 4, hiddenCount: 4 },
    { visibleCount: 6, hiddenCount: 2 },
    { visibleCount: 8, hiddenCount: 0 },
  ])
})

test('the menu lists the folded children in order and activating a row clicks the child', async ({ page, renderScenario }) => {
  await renderScenario(
    list(
      400,
      '',
      items(8, (i) => (i === 7 ? 'disabled' : '')),
    ),
  )
  await page.locator('main').evaluate((main) => {
    main.dataset.clicks = '[]'
    main.addEventListener('click', (event) => {
      const target = event.target as Element
      if (target.closest('c2-overflow-list') === null) return
      const name = target.localName === 'c2-overflow-list' ? 'list' : target.textContent?.trim()
      main.dataset.clicks = JSON.stringify([...JSON.parse(main.dataset.clicks!), name])
    })
  })
  await trigger(page).click()
  await expect(rows(page)).toHaveText(['Item 5', 'Item 6', 'Item 7', 'Item 8'])
  await expect(rows(page).nth(2)).toHaveJSProperty('disabled', true)
  await expect(rows(page).first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(rows(page).first()).toBeHidden()
  await expect(trigger(page)).toBeFocused()
  // The child gets the click itself; the click on the generated row stays inside the list.
  await expect.poll(() => page.locator('main').evaluate((main) => JSON.parse(main.dataset.clicks!))).toEqual(['list', 'Item 6'])
})

test('a folded c2-button and a toggle icon button work from the menu', async ({ page, renderScenario }) => {
  await renderScenario(
    list(
      140,
      '',
      `<button class="item">Item 1</button><c2-button class="save">Save</c2-button>
      <c2-icon-button toggle aria-label="Star"><svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 15 9h7l-6 4 2 8-6-5-6 5 2-8-6-4h7Z"></path></svg></c2-icon-button>`,
    ),
  )
  await page.locator('c2-button.save').evaluate((button) => button.addEventListener('click', () => button.setAttribute('data-clicked', '')))
  // The app owns a toggle's state, as it does for one in the row.
  await page.locator('c2-icon-button').evaluate((button) => button.addEventListener('click', () => button.toggleAttribute('selected')))
  await trigger(page).click()
  await expect(rows(page)).toHaveText(['Save', 'Star'])
  await expect(rows(page).nth(1).locator('svg.star')).toHaveCount(1)
  await expect(rows(page).nth(1)).toHaveJSProperty('type', 'checkbox')
  await expect(rows(page).nth(1)).toHaveJSProperty('checked', false)
  await rows(page).nth(1).click()
  await expect(page.locator('c2-icon-button')).toHaveAttribute('selected', '')
  await trigger(page).click()
  await expect(rows(page).nth(1)).toHaveJSProperty('checked', true)
  await rows(page).first().click()
  await expect(page.locator('c2-button.save')).toHaveAttribute('data-clicked', '')
})

test('collapse-from="start" folds the first children and puts the trigger first', async ({ page, renderScenario }) => {
  await renderScenario(list(400, 'collapse-from="start"'))
  await expect.poll(() => visibleItems(page)).toEqual(['Item 5', 'Item 6', 'Item 7', 'Item 8'])
  const [triggerBox, firstBox] = await Promise.all([trigger(page).boundingBox(), page.getByRole('button', { name: 'Item 5' }).boundingBox()])
  expect(triggerBox!.x).toBeLessThan(firstBox!.x)
  await trigger(page).click()
  await expect(rows(page)).toHaveText(['Item 1', 'Item 2', 'Item 3', 'Item 4'])
})

test('pinned children never fold and higher priorities fold last', async ({ page, renderScenario }) => {
  const attributes = (i: number) => (i === 8 ? 'data-overflow="pinned"' : i === 2 ? 'data-overflow-priority="-1"' : i === 7 ? 'data-overflow-priority="1"' : '')
  await renderScenario(list(400, '', items(8, attributes)))
  await expect.poll(() => visibleItems(page)).toEqual(['Item 1', 'Item 3', 'Item 7', 'Item 8'])
  await trigger(page).click()
  await expect(rows(page)).toHaveText(['Item 2', 'Item 4', 'Item 5', 'Item 6'])
})

test('min-visible keeps children that overflow and max-visible caps them', async ({ page, renderScenario }) => {
  await renderScenario(list(150, 'min-visible="2"'))
  await expect.poll(() => visibleItems(page)).toEqual(['Item 1', 'Item 2'])
  await renderScenario(list(720, 'max-visible="3"'))
  await expect.poll(() => visibleItems(page)).toEqual(['Item 1', 'Item 2', 'Item 3'])
  await expect(page.getByRole('button', { name: '5 more items' })).toBeVisible()
})

test('a focused child that folds hands focus to the trigger', async ({ page, renderScenario }) => {
  await renderScenario(list(720))
  await page.getByRole('button', { name: 'Item 7' }).focus()
  await resize(page, 400)
  await expect(page.getByRole('button', { name: '4 more items' })).toBeFocused()
})

test('folded children leave the Tab order', async ({ page, renderScenario, tab }) => {
  await renderScenario(list(224, '', items(3)))
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Item 1' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'Item 2' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: '1 more item' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('separators divide groups and are dropped at the edges', async ({ page, renderScenario }) => {
  const children = `<button class="item">Item 1</button><button class="item">Item 2</button><hr />
    <button class="item">Item 3</button><button class="item">Item 4</button><hr />
    <button class="item">Item 5</button><button class="item">Item 6</button>`
  await renderScenario(list(220, '', children))
  await expect.poll(() => visibleItems(page)).toEqual(['Item 1', 'Item 2'])
  // The separator after Item 2 has no shown child after it.
  expect(await host(page).evaluate((element) => element.querySelectorAll('hr')[0].checkVisibility({ visibilityProperty: true }))).toBe(false)
  await trigger(page).click()
  await expect(rows(page)).toHaveText(['Item 3', 'Item 4', 'Item 5', 'Item 6'])
  await expect(host(page).locator('c2-menu > hr')).toHaveCount(1)
})

test('menu rows keep the trigger and their own events', async ({ page, renderScenario }) => {
  await renderScenario(list(720, '', `${items(2)}<c2-menu-item slot="menu" value="copy">Copy link</c2-menu-item>`))
  await watch(host(page), 'menu-select')
  await expect(page.getByRole('button', { name: 'More items' })).toBeVisible()
  await trigger(page).click()
  await page.getByText('Copy link').click()
  expect(await events(page)).toEqual([{ value: 'copy', checked: false }])
  // A generated row's event stays inside the list.
  await resize(page, 150)
  await trigger(page).click()
  await rows(page).filter({ hasText: 'Item 2' }).click()
  expect(await events(page)).toHaveLength(1)
})

test('a folded current item marks the trigger', async ({ page, renderScenario }) => {
  await renderScenario(
    list(
      400,
      '',
      items(8, (i) => (i === 7 ? 'aria-current="page"' : '')),
    ),
  )
  await expect(page.getByRole('button', { name: '4 more items, including current item' })).toBeVisible()
  await expect(host(page)).toHaveState('current-hidden')
  await accessible(page)
})

test('the trigger follows aria-current as it moves between shown and folded children', async ({ page, renderScenario }) => {
  await renderScenario(
    list(
      400,
      '',
      items(8, (i) => (i === 2 ? 'aria-current="page"' : '')),
    ),
  )
  await expect(page.getByRole('button', { name: '4 more items' })).toBeVisible()
  await host(page).evaluate((element) => {
    element.children[1].removeAttribute('aria-current')
    element.children[5].setAttribute('aria-current', 'page')
  })
  await expect(page.getByRole('button', { name: '4 more items, including current item' })).toBeVisible()
  await expect(host(page)).toHaveState('current-hidden')
})

test('the trigger name follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${list(400)}</div>`)
  await expect(page.getByRole('button', { name: '4 éléments de plus' })).toBeVisible()
  await page.locator('div[lang]').evaluate((element) => element.setAttribute('lang', 'en'))
  await expect(page.getByRole('button', { name: '4 more items' })).toBeVisible()
})

test('slotted more content replaces the icon and keeps the counted name', async ({ page, renderScenario }) => {
  await renderScenario(list(400, '', `${items(8)}<span slot="more">More</span>`))
  await expect(page.locator('span[slot="more"]')).toBeVisible()
  await expect(trigger(page).locator('svg')).toBeHidden()
  await expect(page.getByRole('button', { name: /more items/ })).toBeVisible()
  await trigger(page).click()
  await accessible(page)
})
