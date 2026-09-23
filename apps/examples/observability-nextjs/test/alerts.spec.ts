import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Browser console error: ${message.text()}`)
  })
})

test('incident detail exposes ownership, annotations, services, duration, and lifecycle', async ({ page }) => {
  await page.goto('./alerts/?view=incidents')
  await page
    .getByRole('button', { name: /Open incident/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { name: 'Chronological state history' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Annotations' })).toBeVisible()
  await expect(page.getByText(/Affected services/i)).toBeVisible()
  await expect(page.getByText(/Synthetic investigation note/i)).toBeVisible()
})

test('validates, previews, saves, reloads, edits, and cancels a synthetic alert rule', async ({ page }) => {
  await page.goto('./alerts/rules/new/')
  await page.getByRole('button', { name: 'Save alert rule' }).click()
  await expect(page.getByRole('heading', { name: 'Fix these fields' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Rule name' })).toBeFocused()

  await page.getByRole('textbox', { name: 'Rule name' }).fill('Checkout latency from Next.js')
  await page.getByRole('textbox', { name: 'Owner' }).fill('Commerce Core')
  await page.getByRole('checkbox', { name: /Monitor checkout-api/i }).check()
  await page.getByRole('checkbox', { name: /Primary on-call.*synthetic/i }).check()
  await page.getByRole('button', { name: 'Preview historical data' }).click()
  await expect(page.getByRole('heading', { name: 'Historical threshold preview' })).toBeVisible()
  await expect(page.getByText(/not production alert evaluation/i)).toBeVisible()

  await page.getByRole('button', { name: 'Save alert rule' }).click()
  await expect(page).toHaveURL(/\/alerts\/$/)
  await expect(page.getByText('Checkout latency from Next.js', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('Checkout latency from Next.js', { exact: true })).toBeVisible()

  await page.goto('./services/production-checkout-api/')
  await expect(page.getByRole('heading', { name: 'Current alert rules' })).toBeVisible()
  await expect(page.getByText('Checkout latency from Next.js', { exact: true })).toBeVisible()
  await page.goto('./alerts/')

  await page.getByRole('button', { name: 'Edit' }).last().click()
  await expect(page).toHaveURL(/\/alerts\/rules\/new\/?\?edit=local-rule-01/)
  await page.getByRole('textbox', { name: 'Rule name' }).fill('Unsaved renamed rule')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByText('Checkout latency from Next.js', { exact: true })).toBeVisible()
  await expect(page.getByText('Unsaved renamed rule')).toHaveCount(0)
})

test('simulated delivery and confirmed reset never ask for a real destination', async ({ page }) => {
  await page.goto('./alerts/')
  await expect(page.getByText(/Delivery is simulated locally/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Simulate selected delivery' }).click()
  await expect(page.getByText(/No address, endpoint, or credential was used/i)).toBeVisible()

  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await expect(page.getByText('Reset demo alert data?')).toBeVisible()
  await page.getByRole('button', { name: 'Reset alerts' }).click()
  await expect(page.getByText(/Theme and dashboard layout were preserved/i)).toBeVisible()
})

test('alert and incident actions restore the scoped filtered list', async ({ page }) => {
  await page.goto('./alerts/?env=production&range=24h&severity=critical')
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(/alerts\/\?env=production&range=24h&severity=critical/)

  await page.goto('./alerts/?env=production&range=24h&view=incidents')
  await page
    .getByRole('button', { name: /Open incident/ })
    .first()
    .click()
  await page.getByRole('link', { name: 'Return to incidents' }).click()
  await expect(page).toHaveURL(/alerts\/\?env=production&range=24h&view=incidents/)
})
