import type { LogViewer } from '../src/log-viewer'
import { test, expect } from './fixture'
import { accessible } from '../../../../tests/component-fixture'

for (const tabular of [true, false]) {
  test(`named viewport supports keyboard scrolling (${tabular ? 'tabular' : 'plain'})`, async ({ page, scenario }) => {
    await scenario('many')
    const viewer = page.locator('c2-log-viewer')
    await viewer.evaluate((element, mode) => {
      ;(element as LogViewer).tabular = mode
    }, tabular)
    const region = viewer.getByRole('region', { name: 'Worker logs' })
    const atStart = () => expect.poll(() => region.evaluate((element) => element.scrollTop)).toBe(0)
    const atEnd = () => expect.poll(() => region.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(2)
    await region.focus()
    await expect(region).toBeFocused()
    await page.keyboard.press('Home')
    await atStart()
    await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'New entry while reading history' }))
    await atStart()
    await page.keyboard.press('PageDown')
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const pageTop = await region.evaluate((element) => element.scrollTop)
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeLessThan(pageTop)
    const lineTop = await region.evaluate((element) => element.scrollTop)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(lineTop)
    await page.keyboard.press('PageUp')
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1)
    await page.keyboard.press('Control+Home')
    await atStart()
    await page.keyboard.press('End')
    await atEnd()
    await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'New entry while following' }))
    await atEnd()
    await page.keyboard.press('Meta+Home')
    await atStart()
    await page.keyboard.press('Control+End')
    await atEnd()
    await expect(region).toBeFocused()
    await accessible(page)
    await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }, 'highlight'))
    await accessible(page)
  })
}
