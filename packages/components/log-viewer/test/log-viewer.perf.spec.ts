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

test('appends arriving in many tasks render at most once per frame', async ({ page, scenario }) => {
  await scenario('many')
  const result = await page.locator('c2-log-viewer').evaluate(async (element) => {
    const log = element as LogViewer
    let updates = 0
    let frames = 0
    const updated = (log as unknown as { updated: () => void }).updated.bind(log)
    ;(log as unknown as { updated: () => void }).updated = () => {
      updates++
      updated()
    }
    let counting = true
    const tick = () => {
      frames++
      if (counting) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    for (let i = 0; i < 200; i++) {
      log.appendEntries({ level: 'info', message: `task ${i}` })
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await log.updateComplete
    counting = false
    return { updates, frames, count: log.entryCount }
  })
  expect(result.count).toBe(10200)
  // About one render per frame; the margin covers the counter's start/stop frames and an occasional resize reflow under load.
  expect(result.updates).toBeLessThan(result.frames * 1.5 + 3)
  expect(result.updates).toBeLessThan(200)
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
    started = performance.now()
    log.appendEntries({ level: 'INFO', source: 'a-much-longer-source-name', message: 'wider' })
    await log.updateComplete
    return { rebuild, widening: performance.now() - started }
  })
  expect(result.widening).toBeLessThan(result.rebuild / 4)
})
