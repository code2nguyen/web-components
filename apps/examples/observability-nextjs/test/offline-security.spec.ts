import { expect, test } from '@playwright/test'

test('application data remains local and forms accept no arbitrary endpoints or secrets', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url())
  })
  await page.goto('./alerts/rules/new/')
  await expect(page.getByText(/synthetic/i).first()).toBeVisible()
  expect(await page.locator('input[type=password], input[name*=token], input[name*=endpoint], input[name*=email]').count()).toBe(0)
  expect(external).toEqual([])
})
