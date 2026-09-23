import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error') throw new Error(`Browser console error: ${message.text()}`)
  })
})

test('dashboard renders a coherent scoped baseline and deterministic panel states', async ({ page }) => {
  await page.goto('./dashboards/')
  await expect(page.getByRole('heading', { name: 'Operational dashboard' })).toBeVisible()
  await expect(page.locator('[data-panel-id]')).toHaveCount(7)
  await expect(page.getByText(/Replay snapshot: paused at tick 0/i)).toBeVisible()
  await expect(page.getByText(/^Text summary:/).first()).toBeVisible()

  await page.locator('c2-select[aria-label="Environment"]').click()
  await page.locator('c2-list-item[value="staging"]').click()
  await expect(page.getByText('Operations · staging')).toBeVisible()
  await expect(page.locator('[data-update-key^="staging:"]')).toHaveCount(7)

  await page.locator('c2-select[aria-label="Relative time range"]').click()
  await page.locator('c2-list-item[value="30m"]').click()
  await expect(page.getByText(/30 minutes · desktop layout/)).toBeVisible()

  await page.getByRole('button', { name: 'Play' }).click()
  await expect(page.getByText(/Replay snapshot: playing at tick 1/)).toBeVisible({ timeout: 7_000 })
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByText(/Replay snapshot: paused at tick 1/)).toBeVisible()
  await page.getByRole('button', { name: 'Refresh replay from baseline' }).click()
  await expect(page.getByText(/Replay snapshot: paused at tick 0/)).toBeVisible()

  await page.getByRole('button', { name: 'Show loading dashboard state' }).click()
  await expect(page.getByText('Loading scoped panel data').first()).toBeVisible()
  await page.getByRole('button', { name: 'Show empty dashboard state' }).click()
  await expect(page.getByText('No scoped values')).toHaveCount(7)
  await page.getByRole('button', { name: 'Show error dashboard state' }).click()
  await expect(page.getByText('Panel data unavailable')).toHaveCount(7)
  await page.getByRole('button', { name: 'Show normal dashboard state' }).click()
  await expect(page.getByText(/^Text summary:/).first()).toBeVisible()
})

test('keyboard move and named size choices announce, persist, and reset independently', async ({ page }) => {
  await page.goto('./dashboards/')
  const panels = page.locator('[data-panel-id]')
  const initialFirst = await panels.first().getAttribute('data-panel-id')

  const moveAfter = page.getByRole('button', { name: `Move ${initialFirst === 'traffic' ? 'Request traffic' : ''} after` })
  await moveAfter.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText(/moved to position 2 of 7/i)
  await expect(panels.nth(1)).toHaveAttribute('data-panel-id', initialFirst!)

  await page.getByRole('button', { name: 'Set Request traffic size to Medium' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toContainText(/Request traffic resized to Medium/i)
  await page.reload()
  await expect(panels.nth(1)).toHaveAttribute('data-panel-id', initialFirst!)
  await expect(page.locator('[data-panel-id="traffic"]')).toHaveAttribute('data-panel-size', 'medium')

  await page.getByRole('button', { name: 'Reset dashboard layout' }).click()
  await expect(page.getByRole('status')).toContainText('Dashboard layout reset')
  await expect(panels.first()).toHaveAttribute('data-panel-id', 'traffic')
  await expect(page.locator('[data-panel-id="traffic"]')).toHaveAttribute('data-panel-size', 'small')
})

test('invalid saved layout recovers without affecting the page and tablet keeps reading order', async ({ page }) => {
  await page.goto('./dashboards/')
  await page.evaluate(() => {
    localStorage.setItem(
      'c2n-observability:v1:dashboard:desktop',
      JSON.stringify({ schemaVersion: 1, updatedAt: '2026-09-21T10:00:00.000Z', data: { breakpoint: 'desktop', orderedPanelIds: ['unknown'], sizes: {} } }),
    )
  })
  await page.reload()
  await expect(page.locator('[data-panel-id]').first()).toHaveAttribute('data-panel-id', 'traffic')

  await page.setViewportSize({ width: 768, height: 1024 })
  await page.reload()
  const visualOrder = await page
    .locator('[data-panel-id]')
    .evaluateAll((nodes) => nodes.map((node) => ({ id: node.getAttribute('data-panel-id'), top: node.getBoundingClientRect().top })))
  expect(visualOrder.map(({ top }) => top)).toEqual([...visualOrder.map(({ top }) => top)].sort((left, right) => left - right))
  await expect(page.getByRole('button', { name: 'Move Request traffic before' })).toBeDisabled()
})
