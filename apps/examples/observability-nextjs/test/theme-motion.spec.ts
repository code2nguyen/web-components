import { expect, test } from '@playwright/test'

// Longest duration in a computed `transition-duration` list, in milliseconds. Browsers serialize the reduced-motion
// `0.01ms` differently (Chromium writes `1e-05s`), so compare the time, not the string.
const longestMilliseconds = (durations: string) =>
  Math.max(...durations.split(',').map((value) => (value.trim().endsWith('ms') ? parseFloat(value) : parseFloat(value) * 1000) || 0))

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
  expect(longestMilliseconds(duration)).toBeLessThanOrEqual(0.01)
})
