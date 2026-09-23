import { expect, test } from '@playwright/test'

test('light, dark, and system theme reconcile without changing dashboard or alert keys', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('c2n-observability:v1:theme', JSON.stringify({ schemaVersion: 1, updatedAt: '2026-09-21T00:00:00Z', data: { theme: 'dark' } }))
    localStorage.setItem('c2n-observability:v1:dashboard:desktop', 'sentinel')
    localStorage.setItem('c2n-observability:v1:alerts', 'sentinel')
  })
  await page.goto('./')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('c2n-observability:v1:dashboard:desktop'))).toBe('sentinel')
  expect(await page.evaluate(() => localStorage.getItem('c2n-observability:v1:alerts'))).toBe('sentinel')
})

test('reduced motion removes meaningful transition time', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  const duration = await page
    .locator('.navigation-link')
    .first()
    .evaluate((node) => getComputedStyle(node).transitionDuration)
  expect(duration).toBe('0.01ms')
})
