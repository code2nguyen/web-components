import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Browser console error: ${message.text()}`)
  })
})

test('searches traces, opens detail, correlates logs, and restores return context', async ({ page }) => {
  await page.goto('./traces/?status=error&pageSize=50')
  await expect(page.getByRole('heading', { name: 'Trace explorer' })).toBeVisible()
  await expect(page.getByText(/traces\. Page 1 of/)).toBeVisible()
  await page.getByText('trace-00008', { exact: true }).click()
  await expect(page).toHaveURL(/\/traces\/trace-00008\?/)
  await expect(page.getByRole('heading', { name: /GET|POST|SELECT/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Complete span details' })).toBeVisible()
  await page.getByRole('link', { name: 'View correlated logs' }).click()
  await expect(page).toHaveURL(/\/logs\?trace=trace-00008/)
  await expect(page.getByText(/logs\. Page 1 of/)).toBeVisible()
})

test('supports keyboard table entry, pagination, selected log detail, and correlation', async ({ page }) => {
  await page.goto('./logs/?severity=error&pageSize=25')
  const grid = page.getByRole('grid', { name: 'Log search results' })
  await expect(grid).toBeVisible()
  await grid.focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Full message' })).toBeVisible()
  const traceLink = page.getByRole('link', { name: /Open trace/ })
  if (await traceLink.count()) {
    await traceLink.click()
    await expect(page).toHaveURL(/\/traces\/trace-/)
    await page.getByRole('link', { name: 'Return to trace results' }).click()
    await expect(page).toHaveURL(/\/logs\?/)
  }
})

test('recovers from empty and simulated failure states', async ({ page }) => {
  await page.goto('./traces/?q=definitely-no-synthetic-trace')
  await expect(page.getByRole('heading', { name: 'No matching traces' })).toBeVisible()
  await page.getByRole('link', { name: 'Clear trace criteria' }).click()
  await expect(page.getByRole('grid', { name: 'Trace search results' })).toBeVisible()

  await page.getByRole('button', { name: /Built with c2n/i }).click()
  await page.getByText('Error', { exact: true }).last().click()
  await expect(page.getByRole('heading', { name: 'Trace search unavailable' })).toBeVisible()
  const failedUrl = page.url()
  await page.getByRole('button', { name: 'Return to normal' }).click()
  await expect(page).toHaveURL(failedUrl)
  await expect(page.getByRole('grid', { name: 'Trace search results' })).toBeVisible()
})
