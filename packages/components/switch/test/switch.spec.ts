import { test, expect, props, watch, accessible, pointerClick, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('description presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const description = page.locator('c2-switch').locator('[part="description"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-switch label="Updates"><span slot="description" data-slot-presence-probe>Weekly</span></c2-switch>',
    host: 'c2-switch',
    slot: 'description',
    assertPresent: async (present) => (present ? expect(description).toBeVisible() : expect(description).toBeHidden()),
  })
})

test('thumb size follows the track height unless explicitly overridden', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-switch label="Notifications" style="--c2-switch__track--height: 32px"></c2-switch><c2-switch label="Compact" style="--c2-switch__track--height: 32px; --c2-switch__thumb--size: 12px"></c2-switch>',
  )
  const switches = page.locator('c2-switch')

  await expect(switches.nth(0).locator('[part="track"]')).toHaveCSS('height', '32px')
  await expect(switches.nth(0).locator('[part="thumb"]')).toHaveCSS('width', '28px')
  await expect(switches.nth(0).locator('[part="thumb"]')).toHaveCSS('height', '28px')
  await expect(switches.nth(1).locator('[part="thumb"]')).toHaveCSS('width', '12px')
  await expect(switches.nth(1).locator('[part="thumb"]')).toHaveCSS('height', '12px')
})

test('label activation and Space update checked and emit one change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-switch label="Notifications"><span slot="description">Receive updates</span></c2-switch>')
  const host = page.locator('c2-switch')
  const input = page.getByRole('switch')
  await watch(host, 'change')
  await page.getByText('Notifications', { exact: true }).click()
  await expect(input).toBeChecked()
  await input.press('Space')
  await expect(host).toHaveJSProperty('checked', false)
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await accessible(page)
})
test('disabled prevents toggling and external checked updates restore native state', async ({ page, renderScenario }) => {
  await renderScenario('<c2-switch label="Notifications" disabled></c2-switch>')
  const host = page.locator('c2-switch')
  await pointerClick(page.getByRole('switch'))
  await expect(host).toHaveJSProperty('checked', false)
  await props(host, { disabled: false, checked: true })
  await expect(page.getByRole('switch')).toBeChecked()
  await props(host, { checked: false })
  await expect(page.getByRole('switch')).not.toBeChecked()
})
test('participates in forms, validates required and resets checked state', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-switch name="alerts" value="enabled" checked required label="Alerts"></c2-switch></form>')
  const host = page.locator('c2-switch')
  const input = page.getByRole('switch')
  const form = page.locator('form')
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).get('alerts'))).toBe('enabled')
  await input.uncheck()
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).has('alerts'))).toBe(false)
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(input).toBeChecked()
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})
test('fieldset disabled state prevents submission and interaction', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset disabled><c2-switch name="alerts" checked label="Alerts"></c2-switch></fieldset></form>')
  await expect(page.getByRole('switch')).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((element) => new FormData(element as HTMLFormElement).has('alerts'))).toBe(false)
})
for (const direction of ['ltr', 'rtl']) {
  test(`dragging the thumb chooses the release side in ${direction}`, async ({ page, renderScenario }) => {
    await renderScenario(`<c2-switch dir="${direction}" label="Notifications"></c2-switch>`)
    const input = page.getByRole('switch')
    const box = await input.boundingBox()
    if (!box) throw new Error('Missing switch bounds')
    await watch(page.locator('c2-switch'), 'change')
    const start = direction === 'ltr' ? box.x + 5 : box.x + box.width - 5
    const end = direction === 'ltr' ? box.x + box.width - 2 : box.x + 2
    await page.mouse.move(start, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(end, box.y + box.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(input).toBeChecked()
    await expect(page.locator('c2-switch')).toHaveAttribute('data-events', '[null]')
  })
}
