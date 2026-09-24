import { expect, test } from '@playwright/test'

const alertKey = 'c2n-observability:v1:alerts'

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource.*404 \(Not Found\)/i.test(message.text())) {
      throw new Error(`Browser console error: ${message.text()}`)
    }
  })
})

test('malformed and unknown-version alert storage recover to baseline', async ({ page }) => {
  await page.goto('./alerts/')
  await page.evaluate((key) => localStorage.setItem(key, '{malformed'), alertKey)
  await page.reload()
  await expect(page.getByText(/guardrail for/i).first()).toBeVisible()

  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify({ schemaVersion: 99, updatedAt: new Date().toISOString(), data: { rulesById: {} } })),
    alertKey,
  )
  await page.reload()
  await expect(page.getByText(/guardrail for/i).first()).toBeVisible()
})

test('stale destination recovery keeps a valid persisted neighbor', async ({ page }) => {
  await page.goto('./alerts/')
  await page.evaluate((key) => {
    const base = {
      signal: 'latency',
      serviceIds: ['production-edge-gateway'],
      operator: 'above',
      threshold: 500,
      evaluationWindowMinutes: 5,
      severity: 'warning',
      owner: 'Synthetic team',
      enabled: true,
      origin: 'local',
    }
    localStorage.setItem(
      key,
      JSON.stringify({
        schemaVersion: 1,
        updatedAt: '2026-09-21T10:00:00.000Z',
        data: {
          rulesById: {
            'local-rule-01': { ...base, id: 'local-rule-01', name: 'Valid persisted neighbor', destinationIds: ['primary-on-call'] },
            'local-rule-02': { ...base, id: 'local-rule-02', name: 'Stale destination', destinationIds: ['removed-destination'] },
          },
        },
      }),
    )
  }, alertKey)
  await page.reload()
  await expect(page.getByText('Valid persisted neighbor', { exact: true })).toBeVisible()
  await expect(page.getByText('Stale destination', { exact: true })).toHaveCount(0)
})

test('unavailable storage and quota failure keep a usable session draft', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'c2n-observability:v1:alerts') throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('./alerts/rules/new/')
  await page.getByRole('textbox', { name: 'Rule name' }).fill('Session-only quota rule')
  await page.getByRole('textbox', { name: 'Owner' }).fill('Demo owner')
  await page.getByRole('checkbox', { name: /Monitor edge-gateway/i }).check()
  await page.getByRole('checkbox', { name: /Primary on-call.*synthetic/i }).check()
  await page.getByRole('button', { name: 'Save alert rule' }).click()
  await expect(page.getByText(/available for this session/i)).toBeVisible()
})

test('unknown rule and incident identifiers have helpful recovery', async ({ page }) => {
  await page.goto('./alerts/rules/not-a-rule/')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
  await page.goto('./incidents/not-an-incident/')
  await expect(page.getByRole('heading', { name: /not found/i })).toBeVisible()
})
