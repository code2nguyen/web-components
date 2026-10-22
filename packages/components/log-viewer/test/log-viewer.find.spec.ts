import type { Page } from '@playwright/test'
import type { LogViewer } from '../src/log-viewer'
import { test, expect } from './fixture'
import { accessible } from '../../../../tests/component-fixture'

const state = (page: Page) =>
  page.locator('c2-log-viewer').evaluate((element) => {
    const viewer = element as LogViewer
    return { count: viewer.findMatchCount, index: viewer.findMatchIndex, active: viewer.activeIndex }
  })

test('Ctrl/Command+F opens the find bar and finds entries outside the virtual window', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.locator('[part="viewport"]').focus()
  await page.keyboard.press('ControlOrMeta+F')
  const field = viewer.locator('c2-search-field.find-field')
  await expect(field).toBeFocused()
  await expect(viewer.getByRole('search', { name: 'Find in log' })).toBeVisible()
  await page.keyboard.type('entry 99')
  // entry 99, entry 990–999 and entry 9900–9999: only a handful are rendered at any time.
  await expect.poll(() => state(page)).toEqual({ count: 111, index: 0, active: 99 })
  await expect(viewer.locator('.find-count')).toHaveText('1 of 111')
  await expect(viewer.locator('#entry-99')).toBeInViewport()
  // The number is its own log token, so the mark is cut in two.
  await expect(viewer.locator('#entry-99 [part~="find-match"][part~="current"]')).toHaveText(['entry ', '99'])
  await expect(viewer.getByRole('status')).toHaveText('Match 1 of 111')
  await accessible(page)
})

test('Enter, Shift+Enter, F3 and the buttons step through the matches and wrap', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.evaluate((element) => (element as LogViewer).find('entry 99'))
  await viewer.locator('c2-search-field.find-field').click()
  await page.keyboard.press('Enter')
  await expect.poll(() => state(page)).toEqual({ count: 111, index: 1, active: 990 })
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.press('Shift+Enter')
  await expect.poll(() => state(page)).toEqual({ count: 111, index: 110, active: 9999 })
  await expect(viewer.getByRole('status')).toHaveText('Match 111 of 111, wrapped')
  await expect(viewer.locator('#entry-9999')).toBeInViewport()
  await page.keyboard.press('F3')
  await expect.poll(() => state(page)).toEqual({ count: 111, index: 0, active: 99 })
  await viewer.locator('c2-icon-button.find-next').click()
  await expect.poll(() => state(page)).toEqual({ count: 111, index: 1, active: 990 })
  await viewer.locator('c2-icon-button.find-previous').click()
  await expect.poll(() => state(page)).toEqual({ count: 111, index: 0, active: 99 })
  expect(await viewer.evaluate((element) => [(element as LogViewer).findNext(), (element as LogViewer).findPrevious()])).toEqual([true, true])
})

test('find marks attribute cells and match case narrows them', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.evaluate((element) => (element as LogViewer).find('ERROR'))
  await expect.poll(() => state(page).then((value) => value.count)).toBe(5000)
  await expect(viewer.locator('#entry-0 [data-attribute="level"] [part~="find-match"]')).toHaveText('error')
  await viewer.locator('c2-search-field.find-field').click()
  await page.keyboard.press('Alt+KeyC')
  await expect(viewer.locator('c2-icon-button.find-case')).toHaveJSProperty('selected', true)
  await expect.poll(() => state(page)).toEqual({ count: 0, index: -1, active: 0 })
  await expect(viewer.locator('.find-count')).toHaveText('No results')
  await expect(viewer.getByRole('status')).toHaveText('No results')
  await expect(viewer.locator('[part~="find-match"]')).toHaveCount(0)
  await viewer.locator('c2-icon-button.find-case').click()
  await expect.poll(() => state(page).then((value) => value.count)).toBe(5000)
})

test('marks split log tokens without changing the text or its colours outside the match', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => ((element as LogViewer).tabular = false))
  await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'GET "/orders/10428" failed ERROR' }))
  await viewer.evaluate((element) => (element as LogViewer).find('orders/10428" failed err'))
  const text = viewer.locator('[data-index="4"]')
  await expect(text).toHaveText('GET "/orders/10428" failed ERROR')
  await expect(text.locator('[part~="find-match"]')).toHaveText(['orders/10428"', ' failed ', 'ERR'])
  await expect(text.locator('[part~="current"] [part="token"]').first()).toHaveCSS('color', 'rgb(28, 19, 0)')
  await expect(text.locator('[part="token"][data-token="error"]')).toHaveText(['ERR', 'OR'])
})

test('Escape closes the bar, removes the marks and returns focus to the match; Ctrl/Command+F reopens on the last query', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.locator('[part="viewport"]').focus()
  await page.keyboard.press('ControlOrMeta+F')
  await expect(viewer.locator('c2-search-field.find-field')).toBeFocused()
  await page.keyboard.type('entry 999')
  await page.keyboard.press('Enter')
  await expect.poll(() => state(page)).toEqual({ count: 11, index: 1, active: 9990 })
  await page.keyboard.press('Escape')
  await expect(viewer.locator('[part="find-bar"]')).toHaveCount(0)
  await expect(viewer.locator('[part="viewport"]')).toBeFocused()
  await expect(viewer.locator('[part~="find-match"]')).toHaveCount(0)
  expect(await state(page)).toEqual({ count: 0, index: -1, active: 9990 })
  await page.keyboard.press('Enter')
  await page.keyboard.press('ControlOrMeta+F')
  await expect(viewer.locator('c2-search-field.find-field')).toHaveJSProperty('value', 'entry 999')
  // The query is selected: typing replaces it.
  await page.keyboard.type('entry 1234')
  await expect.poll(() => state(page)).toEqual({ count: 1, index: 0, active: 1234 })
})

test('F3 reopens a closed find bar and the next match from the active entry', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.evaluate((element) => (element as LogViewer).find('entry 999'))
  await viewer.evaluate((element) => (element as LogViewer).closeFind())
  await viewer.locator('[part="viewport"]').focus()
  await page.keyboard.press('F3')
  await expect(viewer.locator('[part="find-bar"]')).toBeVisible()
  await expect.poll(() => state(page)).toEqual({ count: 11, index: 0, active: 999 })
  await expect(viewer.locator('[part="viewport"]')).toBeFocused()
})

test('the selection is the query, appends extend the count and the current match stays put', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  const message = viewer.locator('[data-index="1"] [data-attribute="message"] [part="text"]')
  // Double-click the first word.
  await message.dblclick({ position: { x: 12, y: 6 } })
  await page.keyboard.press('ControlOrMeta+F')
  await expect(viewer.locator('c2-search-field.find-field')).toHaveJSProperty('value', 'Retry')
  await expect.poll(() => state(page)).toEqual({ count: 1, index: 0, active: 1 })
  await viewer.evaluate((element) => (element as LogViewer).appendEntries([{ message: 'Retry again' }, { message: 'retry later' }]))
  await expect.poll(() => state(page)).toEqual({ count: 3, index: 0, active: 1 })
  await expect(viewer.locator('.find-count')).toHaveText('1 of 3')
})

test('a filter re-runs find over the displayed entries only', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => (element as LogViewer).find('ready'))
  await expect.poll(() => state(page)).toEqual({ count: 2, index: 0, active: 0 })
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { source: 'api' } }))
  await expect.poll(() => state(page)).toEqual({ count: 1, index: 0, active: 3 })
})

test('find-shortcut="false" leaves Ctrl/Command+F to the page; inside the bar it always does', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await page.evaluate(() => {
    const seen: boolean[] = []
    ;(window as unknown as { prevented: boolean[] }).prevented = seen
    window.addEventListener('keydown', (event) => event.key.toLowerCase() === 'f' && seen.push(event.defaultPrevented))
  })
  const prevented = () => page.evaluate(() => (window as unknown as { prevented: boolean[] }).prevented)
  await viewer.locator('[part="viewport"]').focus()
  await page.keyboard.press('ControlOrMeta+F')
  await expect(viewer.locator('c2-search-field.find-field')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+F')
  expect(await prevented()).toEqual([true, false])
  await page.keyboard.press('Escape')
  await viewer.evaluate((element) => element.setAttribute('find-shortcut', 'false'))
  await viewer.locator('[part="viewport"]').focus()
  await page.keyboard.press('ControlOrMeta+F')
  expect(await prevented()).toEqual([true, false, false])
  await expect(viewer.locator('[part="find-bar"]')).toHaveCount(0)
})

test('the ruler ticks every matching region and the current match', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.evaluate((element) => (element as LogViewer).find('entry 5000'))
  await expect(viewer.locator('[part="ruler"] [part="current"]')).toHaveCount(1)
  const top = await viewer.locator('[part="ruler"] [part="current"]').evaluate((tick) => parseFloat((tick as HTMLElement).style.top))
  expect(top).toBeGreaterThan(45)
  expect(top).toBeLessThan(55)
  await viewer.evaluate((element) => (element as LogViewer).find('entry'))
  // 10,000 matching entries draw at most one tick per three pixels.
  expect(await viewer.locator('[part="ruler"] span').count()).toBeLessThanOrEqual(480 / 3 + 1)
})
