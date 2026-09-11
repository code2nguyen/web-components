import { test, expect, props, watch } from '../../../../tests/component-fixture'

test('renders schema fields and emits edited nested data', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-form></c2-json-form><button>Commit</button>')
  const host = page.locator('c2-json-form')
  await props(host, { json: { profile: { name: { value: { type: 'string' } } } }, formData: { profile: { name: 'Ada' } } })
  const input = page.getByRole('textbox')
  await expect(input).toHaveValue('Ada')
  await watch(host, 'formDataChange')
  await input.fill('Grace')
  await page.getByRole('button', { name: 'Commit' }).click()
  await expect(host).toHaveAttribute('data-events', '[{"profile":{"name":"Grace"}}]')
})
test('external formData changes update rendered fields', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-form></c2-json-form>')
  const host = page.locator('c2-json-form')
  await props(host, { json: { name: { value: { type: 'string' } } }, formData: { name: 'Ada' } })
  await expect(page.getByRole('textbox')).toHaveValue('Ada')
  await props(host, { formData: { name: 'Grace' } })
  await expect(page.getByRole('textbox')).toHaveValue('Grace')
})
