import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const choices =
  '<c2-radio-group aria-label="Plan"><c2-radio value="a">Basic</c2-radio><c2-radio value="b" disabled>Unavailable</c2-radio><c2-radio value="c">Pro</c2-radio></c2-radio-group>'
test('group selection is exclusive and changes are emitted once', async ({ page, renderScenario }) => {
  await renderScenario(choices)
  const group = page.locator('c2-radio-group')
  await watch(group, 'change')
  await page.getByRole('radio', { name: 'Basic' }).check()
  await page.getByRole('radio', { name: 'Pro' }).check()
  await expect(page.getByRole('radio', { name: 'Basic' })).not.toBeChecked()
  await expect(group).toHaveJSProperty('value', 'c')
  await expect(group).toHaveAttribute('data-events', '[{"value":"a"},{"value":"c"}]')
  await accessible(page)
})
test('arrow navigation skips disabled choices and wraps', async ({ page, renderScenario }) => {
  await renderScenario(choices)
  const first = page.getByRole('radio', { name: 'Basic' })
  const last = page.getByRole('radio', { name: 'Pro' })
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(last).toBeFocused()
  await expect(last).toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(first).toBeChecked()
})
test('group disabling preserves individually disabled options', async ({ page, renderScenario }) => {
  await renderScenario(choices)
  await props(page.locator('c2-radio-group'), { disabled: true })
  for (const radio of await page.getByRole('radio').all()) await expect(radio).toBeDisabled()
  await props(page.locator('c2-radio-group'), { disabled: false, value: 'c' })
  await expect(page.getByRole('radio', { name: 'Unavailable' })).toBeDisabled()
  await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked()
})
test('standalone radios with a shared name remain exclusive', async ({ page, renderScenario }) => {
  await renderScenario('<c2-radio name="plan" value="a">Basic</c2-radio><c2-radio name="plan" value="b">Pro</c2-radio>')
  await page.getByRole('radio', { name: 'Basic' }).check()
  await page.getByRole('radio', { name: 'Pro' }).check()
  await expect(page.getByRole('radio', { name: 'Basic' })).not.toBeChecked()
})
