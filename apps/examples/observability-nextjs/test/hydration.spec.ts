import { expect, test, type Page } from '@playwright/test'

// The workspace navigation, not any link whose name contains the word ("View all services" on the overview).
const navigationLink = (page: Page, name: string) => page.getByRole('navigation', { name: 'Observability workspace' }).getByRole('link', { name, exact: true })

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
  await navigationLink(page, 'Traces').click()
  await expect(page).toHaveURL(/\/traces\/?(?:\?|$)/)
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Trace explorer' })).toBeVisible()
})

test('repeated registration is idempotent under development-style remounts', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('./')
  await navigationLink(page, 'Services').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible()
  await navigationLink(page, 'Overview').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Service health' })).toBeVisible()
  await navigationLink(page, 'Services').click()
  await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible()
  expect(errors.filter((message) => /already.*defined|registry/i.test(message))).toEqual([])
})

test('no-JavaScript document retains headings, links, and synthetic disclosure', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto(baseURL ?? './')
  await expect(page.getByRole('heading', { name: 'Service health' })).toBeVisible()
  await expect(page.getByText(/Synthetic telemetry/)).toBeVisible()
  await expect(navigationLink(page, 'Services')).toBeVisible()
  await context.close()
})

test('custom-element and fallback links include the deployment base path', async ({ page }) => {
  await page.goto('./services/?q=no-such-service')
  // React assigns `href` to a defined c2-link-button as a property, so the host attribute exists only when the server markup
  // wins the race with the upgrade. The link the component renders always carries the resolved href.
  await expect(page.locator('c2-link-button').getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
    'href',
    /^\/web-components\/demo\/observability-nextjs\//,
  )
  await page.goto('./services/')
  const fallbackHrefs = await page.locator('.table-fallback a').evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  expect(fallbackHrefs.length).toBeGreaterThan(0)
  expect(fallbackHrefs.every((href) => href?.startsWith('/web-components/demo/observability-nextjs/services/'))).toBe(true)
})
