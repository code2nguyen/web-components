import { test, accessible } from '../../../../tests/component-fixture'
test('dbg', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quick-time-menu now="2026-11-09T13:12:00Z" time-zone="Europe/Paris"></c2-quick-time-menu>`)
  await page.locator('c2-quick-time-menu .trigger').click()
  await page.locator('c2-quick-time-menu [role="menuitem"]').click()
  const panel = page.locator('c2-quick-time-menu').getByRole('group', { name: 'Pick a date and time' })
  console.log('groups', await panel.count())
  console.log('sets', await panel.getByRole('button', { name: 'Set' }).count(), await page.locator('c2-quick-time-menu').getByRole('button', { name: 'Set' }).count())
  console.log('html', await page.locator('c2-quick-time-menu c2-button.set').evaluate((b) => b.outerHTML + ' | ' + b.shadowRoot!.innerHTML.slice(0, 300)))
})
