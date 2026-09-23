import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

for (const path of ['./', './services/', './services/production-payment-orchestrator/']) {
  test(`${path} has no detectable accessibility violations`, async ({ page }) => {
    await page.goto(path)
    await expect(page.locator('main')).toBeVisible()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
}

test('status is textual, chart information has a summary, and focus remains visible', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByText('critical', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/^Text summary:/)).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.locator(':focus')).toBeVisible()
})

test('overview and detail avoid page-level overflow at desktop and tablet', async ({ page }) => {
  for (const width of [1280, 768]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['./', './services/production-payment-orchestrator/']) {
      await page.goto(path)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(overflow).toBe(false)
    }
  }
})

test('reduced motion disables non-essential transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  const duration = await page.locator('[data-testid="overview-dashboard"]').evaluate((node) => getComputedStyle(node).transitionDuration)
  expect(duration === '0s' || duration === '').toBe(true)
})
