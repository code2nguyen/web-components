import { expect, test } from '@playwright/test'

test('replay performs one coherent data update without remounting chart hosts', async ({ page }) => {
  await page.goto('./dashboards/')
  await expect(page.locator('c2-line-chart[data-chart-ready]')).toBeVisible()
  await page.locator('c2-line-chart').evaluate((chart) => {
    ;(chart as HTMLElement & { dashboardIdentity?: symbol }).dashboardIdentity = Symbol('chart-host')
    ;(window as Window & { dashboardUpdateCounts?: number[] }).dashboardUpdateCounts = []
    const counts = (window as unknown as Window & { dashboardUpdateCounts: number[] }).dashboardUpdateCounts
    for (const panel of document.querySelectorAll<HTMLElement>('[data-panel-id]')) {
      let changes = 0
      new MutationObserver((records) => {
        changes += records.filter(({ attributeName }) => attributeName === 'data-update-key').length
        counts.push(changes)
      }).observe(panel, { attributes: true, attributeFilter: ['data-update-key'] })
    }
  })

  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByText(/Playing · tick 1/)).toBeVisible({ timeout: 7_000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  const sameHost = await page.locator('c2-line-chart').evaluate((chart) => Boolean((chart as HTMLElement & { dashboardIdentity?: symbol }).dashboardIdentity))
  expect(sameHost).toBe(true)
  const maximumUpdates = await page.evaluate(() => Math.max(0, ...((window as Window & { dashboardUpdateCounts?: number[] }).dashboardUpdateCounts ?? [])))
  expect(maximumUpdates).toBeLessThanOrEqual(1)
})

test('panel DOM stays bounded and desktop/tablet pages do not overflow', async ({ page }) => {
  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./dashboards/')
    const evidence = await page.evaluate(() => ({
      panelCount: document.querySelectorAll('[data-panel-id]').length,
      descendants: document.querySelectorAll('[data-panel-id] *').length,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      alternatives: document.querySelectorAll('[data-chart-alternative]').length,
    }))
    expect(evidence.panelCount).toBe(7)
    expect(evidence.descendants).toBeLessThan(800)
    expect(evidence.overflow).toBe(false)
    expect(evidence.alternatives).toBeGreaterThanOrEqual(4)
  }
})
