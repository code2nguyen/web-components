import { expect, test } from '@playwright/test'

test('unknown identities and malformed neighbors recover independently', async ({ page }) => {
  await page.goto('./services/unknown/')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
  await page.goto('./logs/?trace=unknown&q=timeout&pageSize=37&severity=warn,bogus')
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible()
  await expect(page).toHaveURL(/q=timeout/)
})

test('stale storage and replay cleanup do not block recovery', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('c2n-observability:v1:alerts', '{broken'))
  await page.goto('./alerts/')
  await expect(page.getByRole('heading', { name: /Alerts/i })).toBeVisible()
  await page.getByRole('button', { name: /^Play$/ }).click()
  await page.getByRole('button', { name: /^Pause$/ }).click()
  await expect(page.getByText(/Paused · tick/)).toBeVisible()
})
