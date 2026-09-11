import { test, expect, MAX_WINDOW_ROWS, SMALL, HUGE } from './fixture'

// Cost, not wall-clock: these assertions are about how much work the table does, so they hold on any machine.
// The wall-clock numbers live in table.bench.spec.ts.
test.describe('scales with the viewport, not the dataset', () => {
  test('renders the same amount of DOM for a thousand rows and a quarter of a million', async ({ page, bench }) => {
    await bench()
    const small = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      return window.tableBench.stats()
    }, SMALL)
    const huge = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      return window.tableBench.stats()
    }, HUGE)

    expect(small.rowElements).toBeLessThanOrEqual(MAX_WINDOW_ROWS)
    expect(huge.rowElements).toBeLessThanOrEqual(MAX_WINDOW_ROWS)
    // 250x the data must not cost a single extra element anywhere in the shadow root.
    expect(huge.rowElements).toBe(small.rowElements)
    expect(huge.shadowElements).toBe(small.shadowElements)
    // The scrollbar still has to represent the whole list.
    expect(huge.scrollHeight).toBeGreaterThan(small.scrollHeight * 100)
  })

  test('keeps the window bounded while scrolling through a quarter of a million rows', async ({ page, bench }) => {
    await bench()
    const seen = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      const samples = []
      for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
        await window.tableBench.scrollToRatio(ratio)
        samples.push(window.tableBench.stats())
      }
      return samples
    }, HUGE)

    for (const sample of seen) expect(sample.rowElements).toBeLessThanOrEqual(MAX_WINDOW_ROWS)
    // The window has to actually travel: the last sample is near the end of the list, not still at the top.
    expect(seen[0].firstIndex).toBe(0)
    expect(seen.at(-1)!.lastIndex).toBe(HUGE - 1)
    for (let i = 1; i < seen.length; i++) expect(seen[i].firstIndex).toBeGreaterThan(seen[i - 1].firstIndex)
  })

  test('scrolls to an index past the browser height cap and renders that row', async ({ page, bench }) => {
    await bench()
    const stats = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      await window.tableBench.scrollToIndex(count - 1)
      return window.tableBench.stats()
    }, HUGE)

    expect(stats.lastIndex).toBe(HUGE - 1)
    expect(stats.rowElements).toBeLessThanOrEqual(MAX_WINDOW_ROWS)
  })
})

test.describe('realtime updates reuse the rendered rows', () => {
  test('patching one row keeps every row element and touches one cell', async ({ page, bench }) => {
    await bench()
    const result = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      const marked = window.tableBench.markRows()
      const before = window.tableBench.stats()
      await window.tableBench.patch(3)
      return { marked, reused: window.tableBench.reusedRows(), before, after: window.tableBench.stats() }
    }, HUGE)

    expect(result.marked).toBeGreaterThan(0)
    // Lit patches the existing rows in place; a regression that rebuilds the body would drop this to 0.
    expect(result.reused).toBe(result.marked)
    expect(result.after.rowElements).toBe(result.before.rowElements)
    expect(result.after.shadowElements).toBe(result.before.shadowElements)
  })

  test('a hundred streamed updates leave the DOM the size it started', async ({ page, bench }) => {
    await bench()
    const result = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      const before = window.tableBench.stats()
      const marked = window.tableBench.markRows()
      await window.tableBench.stream(100)
      return { marked, reused: window.tableBench.reusedRows(), before, after: window.tableBench.stats() }
    }, HUGE)

    expect(result.reused).toBe(result.marked)
    expect(result.after.rowElements).toBe(result.before.rowElements)
    expect(result.after.shadowElements).toBe(result.before.shadowElements)
  })

  test('appending rows grows the scrollbar without growing the DOM', async ({ page, bench }) => {
    await bench()
    const result = await page.evaluate(async (count) => {
      await window.tableBench.mount(count)
      const before = window.tableBench.stats()
      await window.tableBench.append(50_000)
      return { before, after: window.tableBench.stats() }
    }, SMALL)

    expect(result.after.rowElements).toBe(result.before.rowElements)
    expect(result.after.shadowElements).toBe(result.before.shadowElements)
    expect(result.after.scrollHeight).toBeGreaterThan(result.before.scrollHeight * 10)
  })
})
