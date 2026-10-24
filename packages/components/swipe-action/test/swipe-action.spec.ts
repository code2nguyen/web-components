import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

/** Drags the row's content horizontally by `dx` with a real mouse, in steps so the component sees a gesture. */
async function drag(page: Page, dx: number, { steps = 12, dy = 0 } = {}) {
  const box = (await page.locator('c2-swipe-action').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps })
  await page.mouse.up()
}

/** The content box's horizontal offset relative to the row, once it has settled. */
async function contentOffset(page: Page) {
  return page.locator('c2-swipe-action').evaluate(async (host) => {
    const content = host.shadowRoot!.querySelector<HTMLElement>('.content')!
    await Promise.all(content.getAnimations().map((animation) => animation.finished))
    return Math.round(content.getBoundingClientRect().left - host.getBoundingClientRect().left)
  })
}

const log = (page: Page) => page.locator('#log')
const subject = (page: Page) => page.locator('c2-swipe-action')

test('renders closed with the actions covered', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByText('Quarterly report')).toBeVisible()
  expect(await contentOffset(page)).toBe(0)
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('swiping toward the start edge reveals the end actions', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  await expect(log(page)).toHaveText('open:end')
  expect(await contentOffset(page)).toBe(-152)
})

test('swiping toward the end edge reveals the start actions', async ({ page, scenario }) => {
  await scenario()
  await drag(page, 90)
  await expect(subject(page)).toHaveJSProperty('open', 'start')
  expect(await contentOffset(page)).toBe(80)
})

test('in right-to-left, swiping right reveals the end actions on the left', async ({ page, scenario }) => {
  await scenario('rtl')
  await drag(page, 140)
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  expect(await contentOffset(page)).toBe(152)
})

test('a short slow drag springs back closed', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -30, { steps: 30 })
  await expect(subject(page)).toHaveJSProperty('open', '')
  expect(await contentOffset(page)).toBe(0)
  await expect(log(page)).toHaveText('')
})

test('a side without actions does not open', async ({ page, scenario }) => {
  await scenario('end-only')
  await drag(page, 120)
  await expect(subject(page)).toHaveJSProperty('open', '')
  expect(await contentOffset(page)).toBe(0)
})

test('a vertical drag is left to the page', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -40, { dy: 120 })
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a drag does not click the content, and a tap on the open row closes it', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  await subject(page).click({ position: { x: 100, y: 20 } })
  await expect(subject(page)).toHaveJSProperty('open', '')
  await expect(log(page)).toHaveText('open:end,open:none')
  await page.getByText('Quarterly report').click()
  await expect(log(page)).toHaveText('open:end,open:none,click:content')
})

test('activating an action runs it and closes the row', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(log(page)).toHaveText('open:end,click:delete,open:none')
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a press outside and Escape close the row', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -140)
  await page.getByRole('button', { name: 'Outside' }).click()
  await expect(subject(page)).toHaveJSProperty('open', '')
  await drag(page, 90)
  await expect(subject(page)).toHaveJSProperty('open', 'start')
  await page.getByRole('button', { name: 'Archive' }).focus()
  await page.keyboard.press('Escape')
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('tabbing onto an action reveals its side, and tabbing away closes it', async ({ page, scenario, tab }) => {
  await scenario()
  await page.locator('body').click({ position: { x: 1, y: 1 } })
  await tab()
  await expect(page.getByRole('button', { name: 'Archive' })).toBeFocused()
  await expect(subject(page)).toHaveJSProperty('open', 'start')
  await tab()
  await expect(page.getByRole('button', { name: 'Flag' })).toBeFocused()
  await expect(subject(page)).toHaveJSProperty('open', 'end')
  expect(await contentOffset(page)).toBe(-152)
  await tab()
  await tab()
  await expect(page.getByRole('button', { name: 'Outside' })).toBeFocused()
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a full swipe clicks the outermost action', async ({ page, scenario }) => {
  await scenario('full-swipe')
  await drag(page, -320)
  await expect(log(page)).toHaveText('full:end,click:delete')
  await expect(subject(page)).toHaveJSProperty('open', '')
})

test('a full swipe clicks an action inside a display: contents wrapper, such as a framework island', async ({ page, scenario }) => {
  await scenario('wrapped')
  await drag(page, -320)
  await expect(log(page)).toHaveText('full:end,click:delete')
})

test('without full-swipe a long drag only opens the side', async ({ page, scenario }) => {
  await scenario()
  await drag(page, -320)
  await expect(log(page)).toHaveText('open:end')
  expect(await contentOffset(page)).toBe(-152)
})

test('disabled does not move', async ({ page, scenario }) => {
  await scenario('disabled')
  await drag(page, -140)
  await expect(subject(page)).toHaveJSProperty('open', '')
  expect(await contentOffset(page)).toBe(0)
})

test('setting open from code reveals that side without an event', async ({ page, scenario }) => {
  await scenario()
  await subject(page).evaluate((host) => host.show('start'))
  expect(await contentOffset(page)).toBe(80)
  await expect(log(page)).toHaveText('')
})

for (const state of ['closed', 'open']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario()
    if (state === 'open') await drag(page, -140)
    const results = await new AxeBuilder({ page }).include('c2-swipe-action').analyze()
    expect(results.violations).toEqual([])
  })
}
