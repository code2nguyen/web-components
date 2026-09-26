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
