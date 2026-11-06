import { test, expect } from '@playwright/test'
test('clip', async ({ page }) => {
  await page.goto(`/packages/components/chart/test/boxplot-scenarios.html?scenario=empty`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
  await page.setViewportSize({ width: 1400, height: 500 })
  await page.evaluate(() => {
    const data = [
      { c: 'An extremely long category name for checkout', v: [1200000, 2500000, 3100000, 4200000, 9800000, 12345678] },
      { c: 'search', v: [960000, 1300000, 1500000, 1680000] },
      { c: 'Another quite long label here', v: [440000, 610000, 655000] },
    ]
    document.body.innerHTML = ['vertical', 'horizontal'].map((o) => `<c2-boxplot-chart style="display:inline-flex;width:600px;height:360px;margin:8px" orientation="${o}" label-field="c" value-suffix=" requests"><c2-chart-series field="v"></c2-chart-series></c2-boxplot-chart>`).join('')
    document.querySelectorAll('c2-boxplot-chart').forEach((el) => ((el as unknown as { data: unknown }).data = data))
  })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/boxplot-clip.png' })
})
