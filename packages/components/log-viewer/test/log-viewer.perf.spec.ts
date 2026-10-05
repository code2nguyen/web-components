import type { LogViewer } from '../src/log-viewer'
import { test, expect } from './fixture'

test('10k variable-height entries keep bounded DOM and first/last content reachable', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  expect(await viewer.locator('[part="entry"]').count()).toBeLessThan(60)
  await expect(viewer.locator('[data-index="9999"]')).toContainText('entry 9999')
  await viewer.evaluate((element) => {
    element.shadowRoot!.querySelector('[part="viewport"]')!.scrollTop = 0
  })
  await expect(viewer.locator('[data-index="0"]')).toContainText('entry 0')
  const result = await viewer.evaluate(async (element) => {
    const log = element as LogViewer
    const start = performance.now()
    log.appendEntries(Array.from({ length: 100 }, (_, i) => ({ message: `batch ${i}` })))
    await (element as LogViewer).updateComplete
    return { elapsed: performance.now() - start, count: (element as LogViewer).entryCount }
  })
  expect(result.count).toBe(10100)
  expect(result.elapsed).toBeLessThan(2000)
  expect(await viewer.locator('[part="entry"]').count()).toBeLessThan(60)
  await viewer.evaluate((element) => (element as LogViewer).scrollToEnd())
  await expect(viewer.locator('[data-index="10099"]')).toContainText('batch 99')
})

test('continuous live appends remain responsive with bounded rendering', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    ;(element as LogViewer).wrap = true
  })
  const duration = await viewer.evaluate(async (element) => {
    const log = element as LogViewer
    const started = performance.now()
    for (let i = 0; i < 100; i++) {
      log.appendEntries({ level: 'info', message: `stream ${i}` })
      await log.updateComplete
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    return performance.now() - started
  })
  expect(duration).toBeLessThan(2500)
  expect(await viewer.locator('[part="entry"]').count()).toBeLessThan(60)
  await expect(viewer.locator('[data-index="10099"]')).toContainText('stream 99')
})

test('appends arriving in many tasks render at most once per 16ms', async ({ page, scenario }) => {
  await scenario('many')
  const result = await page.locator('c2-log-viewer').evaluate(async (element) => {
    const log = element as LogViewer
    const renders: number[] = []
    // Stamped where an update starts, so a slow render followed by a fast one does not read as a short gap.
    const hooks = log as unknown as { willUpdate: (changes: Map<PropertyKey, unknown>) => void }
    const willUpdate = hooks.willUpdate.bind(log)
    hooks.willUpdate = (changes) => {
      renders.push(performance.now())
      willUpdate(changes)
    }
    const started = performance.now()
    for (let i = 0; i < 200; i++) {
      log.appendEntries({ level: 'info', message: `task ${i}` })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await log.updateComplete
    const gaps = renders.slice(1).map((time, i) => time - renders[i])
    // A render closer than the 16ms window to the previous one is an append that was not coalesced.
    const windows = (performance.now() - started) / 16
    return { count: log.entryCount, renders: renders.length, windows, close: gaps.filter((gap) => gap < 14).length }
  })
  expect(result.count).toBe(10200)
  // The bound is the throttle's own guarantee rather than a count, so a slow runner cannot make it pass vacuously by
  // appending less often than once per window; the margin allows a resize or font reflow render, which is not throttled.
  expect(result.close).toBeLessThanOrEqual(2)
  // And it still renders during the stream: about once per window, so a quarter of them catches over-coalescing.
  expect(result.renders).toBeGreaterThanOrEqual(Math.floor(result.windows / 4))
})

test('a widening attribute column does not re-lay out unwrapped entries', async ({ page, scenario }) => {
  await scenario('default')
  const result = await page.locator('c2-log-viewer').evaluate(async (element) => {
    const log = element as LogViewer
    log.clear()
    log.appendEntries(
      Array.from({ length: 50000 }, (_, n) => ({ level: 'INFO', source: 'api', message: `GET /orders/${n} status=200 ` + 'x'.repeat(n % 120) })),
    )
    await log.updateComplete
    let started = performance.now()
    log.setFilter(null)
    await log.updateComplete
    const rebuild = performance.now() - started
    // Past the append throttle window, so neither measurement includes a scheduling wait.
    await new Promise((resolve) => setTimeout(resolve, 50))
    started = performance.now()
    log.appendEntries({ level: 'INFO', source: 'a-much-longer-source-name', message: 'wider' })
    await log.updateComplete
    return { rebuild, widening: performance.now() - started }
  })
  expect(result.widening).toBeLessThan(result.rebuild / 4)
})

test('a live stream stays on the latest entry, including when the application replaces its snapshot', async ({ page, scenario }) => {
  await scenario('default')
  const result = await page.locator('c2-log-viewer').evaluate(async (element) => {
    const log = element as LogViewer
    const viewport = log.shadowRoot!.querySelector<HTMLElement>('[part="viewport"]')!
    const atEnd = () => viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2
    const entry = (n: number) => ({
      timestamp: `14:00:${String(n % 60).padStart(2, '0')}`,
      level: n % 9 ? 'INFO' : 'ERROR',
      message: `request ${n}` + '\nretry'.repeat(n % 3),
    })
    log.clear()
    const all = Array.from({ length: 3000 }, (_, n) => entry(n))
    log.appendEntries(all)
    await log.updateComplete
    let appendedAway = 0
    let replacedAway = 0
    for (let n = 3000; n < 3020; n++) {
      all.push(entry(n))
      log.appendEntries(all[n])
      await log.updateComplete
      if (!atEnd()) appendedAway++
    }
    for (let n = 3020; n < 3040; n++) {
      all.push(entry(n))
      log.clear()
      log.appendEntries(all)
      await log.updateComplete
      if (!atEnd()) replacedAway++
    }
    return { appendedAway, replacedAway, count: log.entryCount }
  })
  expect(result).toEqual({ appendedAway: 0, replacedAway: 0, count: 3040 })
})
