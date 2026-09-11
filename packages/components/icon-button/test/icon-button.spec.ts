import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

test('tooltip supplies a name and keyboard activation reaches the consumer', async ({ page, renderScenario }) => {
  await renderScenario('<c2-icon-button tooltip="Settings"><span aria-hidden="true">⚙</span></c2-icon-button>')
  const host = page.locator('c2-icon-button')
  await watch(host, 'click')
  await page.getByRole('button', { name: 'Settings', exact: true }).press('Enter')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await accessible(page)
})
test('explicit name wins and selected state is announced', async ({ page, renderScenario }) => {
  await renderScenario('<c2-icon-button aria-label="Bookmark" tooltip="Save" toggle>★</c2-icon-button>')
  const button = page.getByRole('button', { name: 'Bookmark' })
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await props(page.locator('c2-icon-button'), { selected: true, disabled: true })
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(button).toBeDisabled()
})
