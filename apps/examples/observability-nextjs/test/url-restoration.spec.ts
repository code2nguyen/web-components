import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Browser console error: ${message.text()}`)
  })
})

test('copied and reloaded trace URLs restore valid filters, sorting, page, and size', async ({ page, context }) => {
  const query = 'status=ok&sort=duration&dir=asc&page=2&pageSize=25'
  await page.goto(`./traces/?${query}`)
  await expect(page.getByText(/Page 2 of/)).toBeVisible()
  const copied = page.url()
  await page.reload()
  await expect(page).toHaveURL(copied)
  await expect(page.getByText(/Page 2 of/)).toBeVisible()

  const fresh = await context.newPage()
  await fresh.goto(copied)
  await expect(fresh.getByText(/Page 2 of/)).toBeVisible()
  await fresh.close()
})

test('URL scope wins over browser preferences and malformed neighbors recover independently', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'c2n-observability:v1:scope',
      JSON.stringify({ schemaVersion: 1, updatedAt: '2026-09-21T12:00:00.000Z', data: { environmentId: 'production', pageSize: 25 } }),
    ),
  )
  await page.goto('./logs/?env=staging&severity=error&page=oops&pageSize=50')
  await expect(page.getByText(/logs\. Page 1 of/)).toBeVisible()
  await expect(page.locator('c2-pagination')).toHaveJSProperty('pageSize', 50)
  await expect(page.locator('c2-select[aria-label="Environment"]')).toHaveAttribute('value', /staging/)
})

test('back and forward restore the same log result context and selected record', async ({ page }) => {
  await page.goto('./logs/?severity=error&pageSize=100&page=1')
  await page.getByRole('grid', { name: 'Log search results' }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  const selected = page.url()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page).not.toHaveURL(selected)
  await page.goBack()
  await expect(page).toHaveURL(selected)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goForward()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('primary navigation and the brand preserve exact global scope', async ({ page }) => {
  const from = '2026-08-17T12:00:00.000Z'
  const to = '2026-08-17T13:00:00.000Z'
  await page.goto(`./services/?env=staging&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
  await page.getByRole('link', { name: 'Traces' }).click()
  await expect(page).toHaveURL(new RegExp(`traces/\\?env=staging&from=${encodeURIComponent(from)}`))
  await page.getByRole('link', { name: 'Signal Forge overview' }).click()
  await expect(page).toHaveURL(new RegExp(`observability-nextjs/\\?env=staging&from=${encodeURIComponent(from)}`))
})

test('trace operation survives detail navigation and explicit return', async ({ page }) => {
  await page.goto(`./traces/?operation=${encodeURIComponent('POST /v1/checkout')}&pageSize=50`)
  await page.locator('.table-fallback a').first().click()
  await page.getByRole('link', { name: 'Return to trace results' }).click()
  await expect(page).toHaveURL(/operation=POST(?:\+|%20)%2Fv1%2Fcheckout/)
  await expect(page.locator('c2-select[aria-label="Filter traces by operation"]')).toHaveJSProperty('value', ['POST /v1/checkout'])
})
