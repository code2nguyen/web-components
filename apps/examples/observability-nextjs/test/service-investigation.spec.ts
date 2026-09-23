import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Browser console error: ${message.text()}`)
  })
})

test('pointer journey follows the degraded service into a trace and correlated logs', async ({ page }) => {
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Service health' })).toBeVisible()
  await page.getByText('payment-orchestrator', { exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'payment-orchestrator' })).toBeVisible()
  await page
    .getByRole('link', { name: /POST \/v1\/checkout|GET \/|SELECT/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: /POST|GET|SELECT/ })).toBeVisible()
  const traceUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(traceUrl)
  await page.getByRole('link', { name: 'View correlated logs' }).click()
  await expect(page).toHaveURL(/\/logs\/?\?trace=trace-/)
})

test('keyboard user can enter a service and unknown ids recover', async ({ page }) => {
  await page.goto('./services/')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.goto('./services/not-a-service/')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
  await page.goto('./traces/not-a-trace/')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
})

test('service inventory demo states are page-scoped and recover without changing context', async ({ page }) => {
  await page.goto('./services/?env=staging&range=30m&q=checkout')
  const originalUrl = page.url()
  await page.getByRole('button', { name: 'Built with c2n' }).click()

  const demoState = page.locator('c2-select[aria-label="Demo state"]')
  for (const [state, expected] of [
    ['Loading', 'Loading service inventory'],
    ['Empty', 'No telemetry in this range'],
    ['Error', 'Service inventory unavailable'],
  ] as const) {
    await demoState.click()
    await page.getByRole('option', { name: state }).click()
    await expect(page.getByText(expected, { exact: true })).toBeVisible()
    await expect(page).toHaveURL(originalUrl)
  }

  await page.getByRole('button', { name: 'Return to normal' }).click()
  await expect(page.getByText(/services$/)).toBeVisible()
  await expect(page).toHaveURL(originalUrl)
})

test('service, trace, and log drill-downs preserve scope and explicit return context', async ({ page }) => {
  await page.goto('./services/?env=staging&range=30m&q=checkout')
  const serviceLink = page.locator('.table-fallback a').first()
  await expect(serviceLink).toHaveAttribute('href', /env=staging/)
  await expect(serviceLink).toHaveAttribute('href', /range=30m/)
  await expect(serviceLink).toHaveAttribute('href', /return=/)
  await serviceLink.click()

  const traceLink = page.getByRole('link', { name: /POST \/v1\/checkout|GET \/|SELECT/ }).first()
  await expect(traceLink).toHaveAttribute('href', /env=staging/)
  await expect(traceLink).toHaveAttribute('href', /range=30m/)
  await expect(traceLink).toHaveAttribute('href', /return=/)
})
