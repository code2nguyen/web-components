import { expect, test } from '@playwright/test'

test('dense collections and charts keep bounded DOM and update without remounting', async ({ page }) => {
  await page.goto('./traces/?pageSize=100')
  const table = page.locator('c2-table')
  const tableState = await table.evaluate((node) => {
    const element = node as HTMLElement & { pageSize: number; rowCount: number; totalRows: number }
    return { pageSize: element.pageSize, rowCount: element.rowCount, totalRows: element.totalRows }
  })
  expect(tableState.pageSize).toBe(100)
  expect(tableState.rowCount).toBeLessThanOrEqual(100)
  expect(tableState.totalRows).toBeGreaterThanOrEqual(tableState.rowCount)
  expect(await table.getByRole('row').count()).toBeLessThanOrEqual(101)

  await page.goto('./dashboards/')
  await page.clock.install()
  const chart = page.locator('c2-line-chart, c2-area-chart, c2-bar-chart').first()
  const shell = page.locator('c2-side-nav')
  await chart.evaluate((node) => {
    ;(node as HTMLElement).dataset.performanceMarker = 'stable-chart-host'
  })
  await shell.evaluate((node) => {
    ;(node as HTMLElement).dataset.performanceMarker = 'stable-shell-host'
  })
  const dataBefore = await chart.evaluate((node) => JSON.stringify((node as HTMLElement & { data: unknown }).data))

  await page.getByRole('button', { name: /^Play$/ }).click()
  await page.clock.runFor(15_000)
  await expect(page.getByText('Playing · tick 1')).toBeVisible()
  const dataAfter = await chart.evaluate((node) => JSON.stringify((node as HTMLElement & { data: unknown }).data))
  expect(dataAfter).not.toBe(dataBefore)
  await page.getByRole('button', { name: /^Pause$/ }).click()
  await expect(page.getByText('Paused · tick 1')).toBeVisible()
  await expect(chart).toHaveAttribute('data-performance-marker', 'stable-chart-host')
  await expect(shell).toHaveAttribute('data-performance-marker', 'stable-shell-host')
})
