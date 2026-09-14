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
test('radio group submits one value, validates required and resets', async ({ page, renderScenario }) => {
  await renderScenario(
    '<form><c2-radio-group name="plan" value="pro" required aria-label="Plan"><c2-radio value="basic">Basic</c2-radio><c2-radio value="pro">Pro</c2-radio></c2-radio-group></form>',
  )
  const group = page.locator('c2-radio-group')
  const form = page.locator('form')
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('plan'))).toEqual(['pro'])
  await page.getByRole('radio', { name: 'Basic' }).check()
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('plan'))).toEqual(['basic'])
  await props(group, { value: '' })
  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked()
  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})
test('standalone radios submit only the checked value and restore markup state', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-radio name="size" value="small" required>Small</c2-radio><c2-radio name="size" value="large" checked>Large</c2-radio></form>')
  const form = page.locator('form')
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('size'))).toEqual(['large'])
  await page.getByRole('radio', { name: 'Small' }).check()
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('size'))).toEqual(['small'])
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(page.getByRole('radio', { name: 'Large' })).toBeChecked()
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('size'))).toEqual(['large'])
})
test('standalone radio groups with the same name remain independent across forms', async ({ page, renderScenario }) => {
  await renderScenario(
    '<form id="first"><c2-radio name="plan" value="basic" checked>First basic</c2-radio><c2-radio name="plan" value="pro">First pro</c2-radio></form><form id="second"><c2-radio name="plan" value="basic" checked>Second basic</c2-radio><c2-radio name="plan" value="pro">Second pro</c2-radio></form>',
  )
  await page.getByRole('radio', { name: 'First pro' }).check()
  await expect(page.getByRole('radio', { name: 'Second basic' })).toBeChecked()
  await expect.poll(() => page.locator('#first').evaluate((element) => new FormData(element as HTMLFormElement).get('plan'))).toBe('pro')
  await expect.poll(() => page.locator('#second').evaluate((element) => new FormData(element as HTMLFormElement).get('plan'))).toBe('basic')
})
test('fieldset disabled state disables a group and removes its value from FormData', async ({ page, renderScenario }) => {
  await renderScenario(
    '<form><fieldset disabled><c2-radio-group name="plan" value="pro" aria-label="Plan"><c2-radio value="basic">Basic</c2-radio><c2-radio value="pro">Pro</c2-radio></c2-radio-group></fieldset></form>',
  )
  for (const radio of await page.getByRole('radio').all()) await expect(radio).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((element) => new FormData(element as HTMLFormElement).has('plan'))).toBe(false)
})
