import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('count caps at max and zero visibility follows show-zero', async ({ page, renderScenario }) => {
  await renderScenario('<c2-badge count="125" max="99"></c2-badge>')
  const host = page.locator('c2-badge')
  await expect(host.locator('[part="badge"]')).toHaveText('99+')
  await props(host, { count: 0 })
  await expect(host.locator('[part="badge"]')).toHaveCount(0)
  await props(host, { showZero: true })
  await expect(host.locator('[part="badge"]')).toHaveText('0')
  await accessible(page)
})
test('dot mode keeps the anchor visible without count text', async ({ page, renderScenario }) => {
  await renderScenario('<c2-badge dot count="0"><button slot="anchor">Inbox</button></c2-badge>')
  await expect(page.getByRole('button', { name: 'Inbox' })).toBeVisible()
  await expect(page.locator('[part="badge"]')).toBeVisible()
  await expect(page.locator('[part="badge"]')).toHaveText('')
})
