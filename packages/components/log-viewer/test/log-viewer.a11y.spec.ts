import type { LogViewer } from '../src/log-viewer'
import { test, expect } from './fixture'
import { accessible } from '../../../../tests/component-fixture'

test('named viewport supports keyboard scrolling in both modes', async ({ page, scenario }) => {
  await scenario('many')
  const viewer = page.locator('c2-log-viewer')
  const region = viewer.getByRole('region', { name: 'Worker logs' })
  await region.focus()
  await expect(region).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('Control+Home')
  await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBe(0)
  await page.keyboard.press('PageDown')
  await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await accessible(page)
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }, 'highlight'))
  await accessible(page)
  await viewer.evaluate((element) => {
    ;(element as LogViewer).tabular = false
  })
  await accessible(page)
})
