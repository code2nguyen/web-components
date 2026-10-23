import type { LogViewer, LogViewerEntryEventDetail } from '../src/log-viewer'
import { test, expect } from './fixture'

const active = (page: import('@playwright/test').Page) => page.locator('c2-log-viewer').evaluate((element) => (element as LogViewer).activeIndex)

test('the first arrow key picks the first entry in view rather than jumping to the top', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  const viewport = viewer.locator('[part="viewport"]')
  await viewport.evaluate((element) => (element.scrollTop = 4000))
  await expect.poll(() => viewer.locator('[part~="entry"]').first().getAttribute('data-index')).not.toBe('0')
  const firstInView = await viewer.evaluate((element) => {
    const viewport = element.shadowRoot!.querySelector<HTMLElement>('[part="viewport"]')!
    const rows = [...element.shadowRoot!.querySelectorAll<HTMLElement>('[part~="entry"]')]
    return Number(rows.find((row) => row.offsetTop >= viewport.scrollTop)!.dataset.index)
  })
  await viewport.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => active(page)).toBe(firstInView)
  await expect(viewer.locator(`[data-index="${firstInView}"]`)).toHaveAttribute('part', 'entry active')
  expect(await viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(3900)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => active(page)).toBe(firstInView + 1)
  await expect(viewer.locator(`[data-index="${firstInView}"]`)).toHaveAttribute('part', 'entry')
})

for (const tabular of [true, false]) {
  test(`arrow keys keep the active entry in view and Enter activates it (${tabular ? 'tabular' : 'plain'})`, async ({ page, scenario }) => {
    await scenario('many')
    const viewer = page.locator('c2-log-viewer')
    await viewer.evaluate((element, mode) => ((element as LogViewer).tabular = mode), tabular)
    await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
    await page.evaluate(() => {
      const events: LogViewerEntryEventDetail[] = []
      ;(window as unknown as { activations: LogViewerEntryEventDetail[] }).activations = events
      document.addEventListener('entry-activate', (event) => events.push((event as CustomEvent<LogViewerEntryEventDetail>).detail))
    })
    const viewport = viewer.locator('[part="viewport"]')
    await viewport.focus()
    await page.keyboard.press('Enter')
    for (let step = 0; step < 40; step++) await page.keyboard.press('ArrowDown')
    await expect.poll(() => active(page)).toBe(39)
    const visible = await viewer.evaluate((element) => {
      const viewport = element.shadowRoot!.querySelector<HTMLElement>('[part="viewport"]')!
      const row = element.shadowRoot!.querySelector<HTMLElement>('#entry-39')!.getBoundingClientRect()
      const box = viewport.getBoundingClientRect()
      return row.top >= box.top - 1 && row.bottom <= box.bottom + 1
    })
    expect(visible).toBe(true)
    await page.keyboard.press('Enter')
    const activations = await page.evaluate(() => (window as unknown as { activations: LogViewerEntryEventDetail[] }).activations)
    // Enter with no active entry did nothing; the second Enter reports the active one.
    expect(activations).toEqual([{ index: 39, entry: { message: 'entry 39' + '\ncontinuation'.repeat(3), level: 'info' } }])
    await expect(viewer.locator(tabular ? '[part~="entry"][part~="active"]' : '[part~="text"][part~="active"]')).toHaveCount(1)
  })
}

test('a tall entry is read line by line before the next one becomes active', async ({ page, scenario }) => {
  await scenario('tall')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  const viewport = viewer.locator('[part="viewport"]')
  await viewport.focus()
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => active(page)).toBe(0)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  expect(await active(page)).toBe(0)
  // Page Down pages through the rest of it, then moves on.
  let presses = 0
  while ((await active(page)) === 0 && presses++ < 12) await page.keyboard.press('PageDown')
  expect(presses).toBeGreaterThan(2)
  expect(await active(page)).toBe(1)
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => active(page)).toBe(0)
  // Reached from below, the tall entry shows its end, and Arrow Up keeps reading upwards.
  const bottomAligned = await viewer.evaluate((element) => {
    const viewport = element.shadowRoot!.querySelector<HTMLElement>('[part="viewport"]')!
    const row = element.shadowRoot!.querySelector<HTMLElement>('#entry-0')!
    return Math.abs(row.offsetTop + row.offsetHeight - (viewport.scrollTop + viewport.clientHeight))
  })
  expect(bottomAligned).toBeLessThan(2)
})

test('a click makes an entry active; a filter keeps it while displayed and clears it otherwise', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.locator('[data-index="1"] [data-attribute="message"]').click()
  await expect.poll(() => active(page)).toBe(1)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => active(page)).toBe(2)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { source: 'api' } }))
  expect(await active(page)).toBe(2)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { source: 'worker' } }))
  await expect.poll(() => active(page)).toBe(-1)
  await expect(viewer.locator('[part="viewport"]')).not.toHaveAttribute('aria-activedescendant')
})

test('activeIndex moves to a displayed entry and scrolls it into view; anything else clears it', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  // The scenario follows the tail; these tests read from the top.
  await viewer.evaluate((element) => (element as LogViewer).scrollToStart())
  await viewer.evaluate((element) => ((element as LogViewer).activeIndex = 5000))
  await expect(viewer.locator('[part="viewport"]')).toHaveAttribute('aria-activedescendant', 'entry-5000')
  await expect(viewer.locator('#entry-5000')).toBeInViewport()
  await viewer.evaluate((element) => ((element as LogViewer).activeIndex = 20000))
  expect(await active(page)).toBe(-1)
  // An entry appended in the same task is not laid out yet; it becomes active once it is.
  await viewer.evaluate((element) => {
    const viewer = element as LogViewer
    viewer.appendEntries({ message: 'just appended' })
    viewer.activeIndex = 10000
  })
  await expect(viewer.locator('[part="viewport"]')).toHaveAttribute('aria-activedescendant', 'entry-10000')
  expect(await active(page)).toBe(10000)
  // A hidden entry is cleared once the update finds it is not displayed.
  await viewer.evaluate(async (element) => {
    const viewer = element as LogViewer
    viewer.setFilter({ attributes: { level: 'error' } })
    viewer.activeIndex = 1
    await viewer.updateComplete
  })
  expect(await active(page)).toBe(-1)
})
