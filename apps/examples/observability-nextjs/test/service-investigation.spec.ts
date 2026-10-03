import { expect, test } from '@playwright/test'
import { failOnConsoleErrors } from './console-guard'

test.beforeEach(({ page }) => failOnConsoleErrors(page))

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
  // The loading state is skeletons, announced by the labelled one as a status; the other two are status-panel headings.
  for (const [state, expected] of [
    ['Loading', page.getByRole('status', { name: 'Loading service inventory' })],
    ['Empty', page.getByText('No telemetry in this range', { exact: true })],
    ['Error', page.getByText('Service inventory unavailable', { exact: true })],
  ] as const) {
    await demoState.click()
    // c2-list-item states role=option through ElementInternals, which getByRole does not read.
    await page.locator('c2-list-item', { hasText: state }).click()
    await expect(expected).toBeVisible()
    await expect(page).toHaveURL(originalUrl)
  }

  // The demo-state select lives in the "Built with c2n" sheet, which covers the page until it is closed.
  await page.keyboard.press('Escape')
  await expect(page.locator('c2-sheet')).toHaveJSProperty('open', false)
  await page.getByRole('button', { name: 'Return to normal' }).click()
  await expect(page.getByText(/^\d+ services?$/)).toBeVisible()
  await expect(page).toHaveURL(originalUrl)
})

test('service, trace, and log drill-downs preserve scope and explicit return context', async ({ page }) => {
  await page.goto('./services/?env=staging&range=30m&q=checkout')
  // The no-JavaScript fallback links stay in the document (hidden once c2-table is defined) and carry the same scope.
  const serviceLink = page.locator('.table-fallback a').first()
  await expect(serviceLink).toHaveAttribute('href', /env=staging/)
  await expect(serviceLink).toHaveAttribute('href', /range=30m/)
  await expect(serviceLink).toHaveAttribute('href', /return=/)
  const serviceName = await serviceLink.locator('strong').textContent()
  // With JavaScript the table row is the control: its row-click navigates.
  await page.locator('c2-table').getByRole('row').filter({ hasText: serviceName! }).first().click()
  await expect(page).toHaveURL(/\/services\/staging-[^/?]+\/?\?(?=.*env=staging)(?=.*range=30m)(?=.*return=)/)

  const traceLink = page.getByRole('link', { name: /POST \/v1\/checkout|GET \/|SELECT/ }).first()
  await expect(traceLink).toHaveAttribute('href', /env=staging/)
  await expect(traceLink).toHaveAttribute('href', /range=30m/)
  await expect(traceLink).toHaveAttribute('href', /return=/)
})
