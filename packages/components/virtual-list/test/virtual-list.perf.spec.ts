import { test, expect } from '../../../../tests/component-fixture'
import type {} from './scenario-api'

// Cost, not wall clock: these assert that the work the list does is bounded by the viewport rather than by the
// dataset, which is the whole point of windowing and is the same on every machine. Wall-clock numbers live in the
// table's opt-in benchmark instead.

const SMALL = 1_000
/** Past the ~8.2 M px height browsers cap a scroller at, so the offset-scaling path is exercised. */
const HUGE = 250_000

const list = `<c2-virtual-list aria-label="People" item-key="id" label-field="name"></c2-virtual-list>`

test('the DOM does not grow with the dataset', async ({ page, renderScenario }) => {
  await renderScenario(list)

  await page.evaluate((count) => window.virtualListScenario.fill(count), SMALL)
  const small = await page.evaluate(() => window.virtualListScenario.stats())

  await page.evaluate((count) => window.virtualListScenario.fill(count), HUGE)
  const huge = await page.evaluate(() => window.virtualListScenario.stats())

  expect(huge.renderedItems).toBe(small.renderedItems)
  expect(huge.shadowElements).toBe(small.shadowElements)
})

test('the window stays bounded while scrolling, and the scrollbar spans the whole list', async ({ page, renderScenario }) => {
  await renderScenario(list)
  await page.evaluate((count) => window.virtualListScenario.fill(count), HUGE)
  const start = await page.evaluate(() => window.virtualListScenario.stats())

  for (const top of [5_000, 120_000, 1_500_000, 4_000_000]) {
    await page.evaluate((offset) => window.virtualListScenario.scrollTo(offset), top)
    const stats = await page.evaluate(() => window.virtualListScenario.stats())
    expect(stats.renderedItems).toBe(start.renderedItems)
    expect(stats.scrollHeight).toBe(start.scrollHeight)
    expect(stats.firstIndex).toBeGreaterThanOrEqual(0)
    expect(stats.lastIndex).toBeLessThan(HUGE)
  }
})

test('scrollToIndex lands on the item even past the browser height cap', async ({ page, renderScenario }) => {
  await renderScenario(list)
  await page.evaluate((count) => window.virtualListScenario.fill(count), HUGE)

  for (const index of [0, 1_000, 120_000, HUGE - 1]) {
    await page
      .locator('c2-virtual-list')
      .evaluate((element, target) => (element as HTMLElement & { scrollToIndex(i: number): void }).scrollToIndex(target), index)
    await page.evaluate(() => window.virtualListScenario.settle())
    const stats = await page.evaluate(() => window.virtualListScenario.stats())
    expect(stats.firstIndex).toBeLessThanOrEqual(index)
    expect(stats.lastIndex).toBeGreaterThanOrEqual(index)
  }
})

test('scrolling and searching reuse the row elements instead of rebuilding them', async ({ page, renderScenario }) => {
  await renderScenario(list)
  await page.evaluate((count) => window.virtualListScenario.fill(count), HUGE)

  const mark = () =>
    page.locator('c2-virtual-list').evaluate((element) => {
      const rows = [...element.shadowRoot!.querySelectorAll('.item')]
      rows.forEach((row) => ((row as HTMLElement).dataset.marked = 'yes'))
      return rows.length
    })
  const stillMarked = () => page.locator('c2-virtual-list').evaluate((element) => element.shadowRoot!.querySelectorAll('.item[data-marked="yes"]').length)

  const marked = await mark()
  await page.evaluate(() => window.virtualListScenario.scrollTo(90_000))
  expect(await stillMarked()).toBe(marked)

  await page.locator('c2-virtual-list').evaluate(async (element) => {
    const host = element as HTMLElement & { search: string; updateComplete: Promise<boolean> }
    host.search = 'Ada'
    await host.updateComplete
  })
  expect(await stillMarked()).toBe(await page.locator('c2-virtual-list').evaluate((e) => e.shadowRoot!.querySelectorAll('.item').length))
})

test('a data source is asked for a bounded number of blocks however far the list is scrolled', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-virtual-list aria-label="People" item-key="id" label-field="name" block-size="100"></c2-virtual-list>`)
  await page.evaluate((count) => window.virtualListScenario.useDataSource(count), HUGE)

  for (const top of [0, 200_000, 900_000, 3_000_000]) {
    await page.evaluate((offset) => window.virtualListScenario.scrollTo(offset), top)
  }
  // One or two blocks per stop, not one per row and never the whole quarter-million.
  expect(await page.evaluate(() => window.virtualListScenario.requestCount())).toBeLessThan(12)
})
