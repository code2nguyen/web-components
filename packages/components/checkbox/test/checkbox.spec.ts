import { test, expect, props, watch, accessible, pointerClick, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('pointer and Space toggle once and publish the checked value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept terms"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const input = page.getByRole('checkbox', { name: 'Accept terms' })
  await watch(host, 'change')
  await input.check()
  await expect(host).toHaveJSProperty('checked', true)
  await input.press('Space')
  await expect(input).not.toBeChecked()
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await accessible(page)
})
test('mixed state clears on activation and property updates stay synchronized', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Select all" indeterminate></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const input = page.getByRole('checkbox')
  await expect(input).toHaveAttribute('aria-checked', 'mixed')
  await input.click()
  await expect(host).toHaveJSProperty('indeterminate', false)
  await props(host, { checked: false })
  await expect(input).not.toBeChecked()
  await props(host, { checked: true })
  await expect(input).toBeChecked()
})
test('disabled blocks clicks and host focus reaches the enabled input', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept" disabled></c2-checkbox>')
  const input = page.getByRole('checkbox')
  await pointerClick(input)
  await expect(input).not.toBeChecked()
  await props(page.locator('c2-checkbox'), { disabled: false })
  await page.locator('c2-checkbox').evaluate((el) => (el as HTMLElement).focus())
  await expect(input).toBeFocused()
})

test('submits only while checked and resets to its authored state', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-checkbox name="terms" value="accepted" checked required aria-label="Terms"></c2-checkbox></form>')
  const host = page.locator('c2-checkbox')
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('terms'))).toBe('accepted')
  await page.getByRole('checkbox').uncheck()
  await expect.poll(() => host.evaluate((el) => (el as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('checked', true)
})

test('a programmatic checked change still lands after the user has clicked the box', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const input = page.getByRole('checkbox')

  // The click sets the inner input's dirty-checkedness flag, after which the `checked` content attribute no
  // longer moves it. Staying in sync then rests entirely on the imperative `formElement.checked` write in
  // `willUpdate`, which every consumer that drives selection from script depends on.
  await pointerClick(input)
  await expect(input).toBeChecked()

  await props(host, { checked: false })
  await expect(input).not.toBeChecked()

  await props(host, { checked: true })
  await expect(input).toBeChecked()
})

test('a boolean attribute written as "false" turns the flag off', async ({ page, renderScenario }) => {
  // Frameworks that stringify a non-boolean attribute name (Svelte 5, and any server renderer) emit
  // `checked="false"`. Lit's presence-based default would read that as true and enable what was disabled.
  await renderScenario('<c2-checkbox aria-label="Accept terms" checked="false" disabled="false"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  await expect(host).toHaveJSProperty('checked', false)
  await expect(host).toHaveJSProperty('disabled', false)
  await page.getByRole('checkbox', { name: 'Accept terms' }).check()
  await expect(host).toHaveJSProperty('checked', true)
})

test('a bare boolean attribute and an empty one still read as true', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="One" checked></c2-checkbox><c2-checkbox aria-label="Two" checked=""></c2-checkbox>')
  await expect(page.locator('c2-checkbox').first()).toHaveJSProperty('checked', true)
  await expect(page.locator('c2-checkbox').last()).toHaveJSProperty('checked', true)
})

test('label text toggles the box and names it, and a bare box keeps its touch-target size', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox>Email me<span slot="description">Weekly digest</span></c2-checkbox><c2-checkbox aria-label="Bare"></c2-checkbox>')
  const labelled = page.getByRole('checkbox', { name: 'Email me' })
  await page.getByText('Email me').click()
  await expect(labelled).toBeChecked()
  await page.getByText('Weekly digest').click()
  await expect(labelled).not.toBeChecked()
  const bare = await page.locator('c2-checkbox').last().boundingBox()
  expect(bare?.width).toBe(32)
  await accessible(page)
})

test('label presence follows slotted content', async ({ page, renderScenario }) => {
  const label = page.locator('c2-checkbox').locator('[part="label"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-checkbox><span data-slot-presence-probe>Accept</span></c2-checkbox>',
    host: 'c2-checkbox',
    assertPresent: async (present) => (present ? expect(label).toBeVisible() : expect(label).toBeHidden()),
  })
})

const options =
  '<c2-checkbox-group name="channels"><span slot="label">Notify me by</span><c2-checkbox value="email">Email</c2-checkbox><c2-checkbox value="sms" disabled>SMS</c2-checkbox><c2-checkbox value="push">Push</c2-checkbox></c2-checkbox-group>'

test('group collects checked options in document order and emits one input and change per toggle', async ({ page, renderScenario }) => {
  await renderScenario(options)
  const group = page.locator('c2-checkbox-group')
  await watch(group, 'change')
  await group.evaluate((element) => {
    element.setAttribute('data-inputs', '0')
    element.addEventListener('input', () => element.setAttribute('data-inputs', String(Number(element.getAttribute('data-inputs')) + 1)))
  })
  await page.getByRole('checkbox', { name: 'Push' }).check()
  await page.getByRole('checkbox', { name: 'Email' }).check()
  await expect(group).toHaveJSProperty('value', ['email', 'push'])
  await page.getByRole('checkbox', { name: 'Push' }).uncheck()
  await expect(group).toHaveAttribute('data-events', '[{"value":["push"]},{"value":["email","push"]},{"value":["email"]}]')
  await expect(group).toHaveAttribute('data-inputs', '3')
  await expect(page.getByRole('group', { name: 'Notify me by' })).toBeVisible()
  await accessible(page)
})

test('options toggle independently by keyboard, each a tab stop', async ({ page, renderScenario, tab }) => {
  await renderScenario(options)
  await tab()
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeFocused()
  await page.keyboard.press('Space')
  await tab()
  await expect(page.getByRole('checkbox', { name: 'Push' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.locator('c2-checkbox-group')).toHaveJSProperty('value', ['email', 'push'])
})

test('value from markup or script checks the matching options; pre-checked options are adopted', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-checkbox-group id="a" aria-label="A" value="push;email"><c2-checkbox value="email">Email</c2-checkbox><c2-checkbox value="push">Push</c2-checkbox></c2-checkbox-group>' +
      '<c2-checkbox-group id="b" aria-label="B"><c2-checkbox value="x" checked>X</c2-checkbox><c2-checkbox value="y">Y</c2-checkbox></c2-checkbox-group>',
  )
  const a = page.locator('#a')
  await expect(a.getByRole('checkbox', { name: 'Email' })).toBeChecked()
  await expect(a.getByRole('checkbox', { name: 'Push' })).toBeChecked()
  await props(a, { value: ['push'] })
  await expect(a.getByRole('checkbox', { name: 'Email' })).not.toBeChecked()
  await props(a, { value: 'email' })
  await expect(a.getByRole('checkbox', { name: 'Email' })).toBeChecked()
  await expect(a.getByRole('checkbox', { name: 'Push' })).not.toBeChecked()
  await expect(page.locator('#b')).toHaveJSProperty('value', ['x'])
})

test('group disabling keeps individually disabled options disabled', async ({ page, renderScenario }) => {
  await renderScenario(options)
  const group = page.locator('c2-checkbox-group')
  await props(group, { disabled: true })
  for (const checkbox of await page.getByRole('checkbox').all()) await expect(checkbox).toBeDisabled()
  await props(group, { disabled: false })
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeEnabled()
  await expect(page.getByRole('checkbox', { name: 'SMS' })).toBeDisabled()
})

test('group submits every checked value under its name, validates required and resets', async ({ page, renderScenario }) => {
  await renderScenario(
    '<form><c2-checkbox-group name="channels" value="email" required aria-label="Channels"><c2-checkbox value="email">Email</c2-checkbox><c2-checkbox value="push">Push</c2-checkbox></c2-checkbox-group></form>',
  )
  const group = page.locator('c2-checkbox-group')
  const form = page.locator('form')
  const submitted = () => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('channels'))
  await expect.poll(submitted).toEqual(['email'])
  await page.getByRole('checkbox', { name: 'Push' }).check()
  await expect.poll(submitted).toEqual(['email', 'push'])
  await page.getByRole('checkbox', { name: 'Email' }).uncheck()
  await page.getByRole('checkbox', { name: 'Push' }).uncheck()
  await expect.poll(submitted).toEqual([])
  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeChecked()
  await expect.poll(submitted).toEqual(['email'])
})

test('a disabled fieldset disables the group options', async ({ page, renderScenario }) => {
  await renderScenario(
    '<fieldset disabled><c2-checkbox-group aria-label="Channels"><c2-checkbox value="email">Email</c2-checkbox></c2-checkbox-group></fieldset>',
  )
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeDisabled()
  await page.locator('fieldset').evaluate((element) => ((element as HTMLFieldSetElement).disabled = false))
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeEnabled()
})
