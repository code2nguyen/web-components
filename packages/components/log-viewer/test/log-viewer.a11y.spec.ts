import type { LogViewer } from '../src/log-viewer'
import { test, expect } from './fixture'
import { accessible } from '../../../../tests/component-fixture'

for (const tabular of [true, false]) {
  test(`named grid keeps an active entry and the edge keys (${tabular ? 'tabular' : 'plain'})`, async ({ page, scenario }) => {
    await scenario('many')
    const viewer = page.locator('c2-log-viewer')
    await viewer.evaluate((element, mode) => {
      ;(element as LogViewer).tabular = mode
    }, tabular)
    const grid = viewer.getByRole('grid', { name: 'Worker logs' })
    const active = () => viewer.evaluate((element) => (element as LogViewer).activeIndex)
    const atStart = () => expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBe(0)
    const atEnd = () => expect.poll(() => grid.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(2)
    await expect(grid).toHaveAttribute('aria-rowcount', '10000')
    await grid.focus()
    await expect(grid).toBeFocused()
    await expect(grid).not.toHaveAttribute('aria-activedescendant')
    await page.keyboard.press('Home')
    await atStart()
    expect(await active()).toBe(0)
    await expect(grid).toHaveAttribute('aria-activedescendant', 'entry-0')
    await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'New entry while reading history' }))
    await atStart()
    await page.keyboard.press('ArrowDown')
    await expect.poll(active).toBe(1)
    await expect(grid).toHaveAttribute('aria-activedescendant', 'entry-1')
    await expect(viewer.locator('#entry-1')).toHaveAttribute('aria-rowindex', '2')
    await page.keyboard.press('PageDown')
    await expect.poll(active).toBeGreaterThan(2)
    await expect.poll(() => grid.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    await page.keyboard.press('PageUp')
    await expect.poll(active).toBeLessThanOrEqual(1)
    await page.keyboard.press('ArrowUp')
    await expect.poll(active).toBe(0)
    await atStart()
    await page.keyboard.press('End')
    await atEnd()
    expect(await active()).toBe(10000)
    await viewer.evaluate((element) => (element as LogViewer).appendEntries({ message: 'New entry while following' }))
    await atEnd()
    // Following the tail does not drag the active entry along.
    expect(await active()).toBe(10000)
    await page.keyboard.press('Meta+Home')
    await atStart()
    await page.keyboard.press('Control+End')
    await atEnd()
    await expect(grid).toBeFocused()
    await accessible(page)
    await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }, 'highlight'))
    await accessible(page)
  })
}

test('an empty viewer is a named region described by its empty state', async ({ page, scenario }) => {
  await scenario('default')
  const region = page.locator('c2-log-viewer').getByRole('region', { name: 'Worker logs' })
  await expect(region).toHaveAccessibleDescription('No log entries')
  await accessible(page)
})
