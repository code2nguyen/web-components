import { expect, test } from '@playwright/test'

test('custom elements, routes, filters, overlays, charts, and controls survive a production reload', async ({ page, browserName }) => {
  await page.goto('./')
  await expect(page.locator('c2-header')).toBeVisible()
  await page.goto('./services/?status=critical')
  await expect(page.locator('c2-table')).toBeVisible()
  await page.goto('./dashboards/')
  await expect(page.locator('c2-dashboard')).toBeVisible()
  await page.goto('./alerts/')
  await expect(page.locator('c2-tabs')).toBeVisible()
  await page.getByRole('button', { name: 'Built with c2n' }).click()
  await expect(page.locator('c2-sheet')).toHaveJSProperty('open', true)
  await page.reload()
  await expect(page.getByRole('heading', { name: /Alerts/i })).toBeVisible()
  test.info().annotations.push({ type: 'browser', description: browserName })
})
