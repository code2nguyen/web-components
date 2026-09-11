import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('initials use the first and last name and allow an explicit override', async ({ page, renderScenario }) => {
  await renderScenario('<c2-avatar name="Ada Byron Lovelace" initial-count="2"></c2-avatar>')
  const host = page.locator('c2-avatar')
  await expect(page.getByRole('img', { name: 'Ada Byron Lovelace' })).toHaveText('AL')
  await props(host, { initials: 'AB' })
  await expect(page.getByRole('img')).toHaveText('AB')
  await accessible(page)
})
test('broken images fall back to initials and a new source recovers', async ({ page, renderScenario }) => {
  await page.route('**/missing-avatar.png', (route) => route.fulfill({ status: 404, body: '' }))
  await renderScenario('<c2-avatar name="Ada Lovelace" initial-count="2" src="/missing-avatar.png"></c2-avatar>')
  await expect(page.locator('c2-avatar img')).toHaveCount(0)
  await expect(page.getByRole('img')).toHaveText('AL')
  await props(page.locator('c2-avatar'), {
    src: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="blue"/></svg>',
  })
  await expect(page.locator('c2-avatar img')).toBeVisible()
  await expect.poll(() => page.locator('c2-avatar img').evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(10)
})
