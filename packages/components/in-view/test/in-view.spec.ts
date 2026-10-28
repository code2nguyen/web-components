import { test, expect, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Watcher = HTMLElement & { inView: boolean }

const watcher = (page: Page) => page.locator('c2-in-view')
const events = async (page: Page) => JSON.parse((await watcher(page).getAttribute('data-events'))!)
const matchesState = (page: Page) => watcher(page).evaluate((element: Watcher) => element.matches(':state(in-view)'))

const BELOW = `<div style="height: 1500px">Spacer</div><c2-in-view><p style="margin: 0; height: 100px">Content</p></c2-in-view><div style="height: 1500px"></div>`

test('enter and leave fire as it scrolls in and out of view, and the in-view state follows', async ({ page, renderScenario }) => {
  await renderScenario(BELOW)
  await watch(watcher(page), 'enter')
  expect(await matchesState(page)).toBe(false)
  await watcher(page).scrollIntoViewIfNeeded()
  await expect.poll(() => matchesState(page)).toBe(true)
  expect(await watcher(page).evaluate((element: Watcher) => element.inView)).toBe(true)
  expect((await events(page))[0]).toMatchObject({ ratio: expect.any(Number) })
  await watch(watcher(page), 'leave')
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect.poll(() => matchesState(page)).toBe(false)
  await expect.poll(() => events(page)).toHaveLength(1)
  expect(await watcher(page).evaluate((element: HTMLElement) => element.getAttributeNames())).not.toContain('in-view')
})

test('once stops after the first entry; the reveal variables apply while it is out of view', async ({ page, renderScenario }) => {
  await renderScenario(BELOW.replace('<c2-in-view>', '<c2-in-view once style="--c2-in-view__hidden--opacity: 0; --c2-in-view--transition-duration: 0ms">'))
  await watch(watcher(page), 'leave')
  expect(await watcher(page).evaluate((element: HTMLElement) => getComputedStyle(element).opacity)).toBe('0')
  await watcher(page).scrollIntoViewIfNeeded()
  await expect.poll(() => watcher(page).evaluate((element: HTMLElement) => getComputedStyle(element).opacity)).toBe('1')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
  expect(await events(page)).toEqual([])
  expect(await matchesState(page)).toBe(true)
})

test('inside a scroll area it counts as in view only where the area shows it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area style="--c2-scroll-area--max-height: 200px">
    <div style="height: 600px">Spacer</div><c2-in-view><p style="margin: 0; height: 40px">Content</p></c2-in-view>
  </c2-scroll-area>`)
  await page.waitForTimeout(200)
  expect(await matchesState(page)).toBe(false)
  await page.locator('c2-scroll-area').evaluate((element: HTMLElement & { scrollToEdge(edge: string): void }) => element.scrollToEdge('bottom'))
  await expect.poll(() => matchesState(page)).toBe(true)
})
