import { expect, test } from '@playwright/test'

test('production HTML is meaningful before upgrade and hydrates without warnings', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' || /hydration|already been registered/i.test(message.text())) errors.push(message.text())
  })
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'Service health' })).toBeVisible()
  await page.waitForFunction(() => customElements.get('c2-button') !== undefined && customElements.get('c2-line-chart') !== undefined)
  expect(errors).toEqual([])
})

test('property assignment and custom event subscriptions survive route transitions', async ({ page }) => {
  await page.goto('./services/')
  await page.waitForFunction(() => customElements.get('c2-table') !== undefined)
  await expect(page.locator('c2-table')).toHaveJSProperty('rowKey', 'id')
  await page.getByRole('link', { name: 'Traces' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Traces' })).toBeVisible()
})

test('repeated registration is idempotent under development-style remounts', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await page.getByRole('link', { name: 'Services' }).click()
  await page.getByRole('link', { name: 'Overview' }).click()
  await page.getByRole('link', { name: 'Services' }).click()
  expect(errors.filter((message) => /already.*defined|registry/i.test(message))).toEqual([])
})

test('no-JavaScript document retains headings, links, and synthetic disclosure', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(baseURL ?? './')
  await expect(page.getByRole('heading', { name: 'Service health' })).toBeVisible()
  await expect(page.getByText(/Synthetic telemetry/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Services' })).toBeVisible()
  await context.close()
})

test('custom-element and fallback links include the deployment base path', async ({ page }) => {
  await page.goto('./services/?q=no-such-service')
  await expect(page.locator('c2-link-button[href^="/web-components/demo/observability-nextjs/"]').first()).toBeAttached()
  await page.goto('./services/')
  const fallbackHrefs = await page.locator('.table-fallback a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  expect(fallbackHrefs.length).toBeGreaterThan(0)
  expect(fallbackHrefs.every((href) => href?.startsWith('/web-components/demo/observability-nextjs/services/'))).toBe(true)
})
