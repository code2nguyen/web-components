import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const SETTINGS = `
  <div class="group">
    <c2-list-item id="wifi">Wi-Fi<span slot="description">Join known networks automatically</span><c2-switch slot="control" checked></c2-switch></c2-list-item>
    <c2-list-item id="sync">Sync over cellular<c2-checkbox slot="control"></c2-checkbox></c2-list-item>
    <c2-list-item id="theme">Theme<c2-select slot="control" value="system">
      <c2-list-item value="light">Light</c2-list-item>
      <c2-list-item value="system">System</c2-list-item>
      <c2-list-item value="dark">Dark</c2-list-item>
    </c2-select></c2-list-item>
    <c2-list-item id="device">Device name<c2-text-field slot="control" aria-label="Device name" value="Ada's laptop" help="Shown to nearby devices"></c2-text-field></c2-list-item>
  </div>
`

test('a settings row has no role or tab stop of its own and names its control', async ({ page, renderScenario }) => {
  await renderScenario(SETTINGS)
  const wifi = page.locator('#wifi')
  await expect(wifi).toHaveHostAria('role', null)
  await expect(wifi).toHaveHostAria('aria-pressed', null)
  await expect(wifi).not.toHaveAttribute('tabindex')
  // The control keeps its own role and takes the row's text as its name and the description as its description.
  await expect(page.getByRole('switch', { name: 'Wi-Fi' })).toBeChecked()
  await expect(page.getByRole('switch', { name: 'Wi-Fi' })).toHaveAccessibleDescription('Join known networks automatically')
  await expect(page.getByRole('checkbox', { name: 'Sync over cellular' })).not.toBeChecked()
  await expect(page.getByRole('textbox', { name: 'Device name' })).toHaveValue("Ada's laptop")
  await accessible(page)
})

test('clicking the row flips a switch or checkbox once and leaves selected alone', async ({ page, renderScenario }) => {
  await renderScenario(SETTINGS)
  const wifi = page.locator('#wifi')
  const control = wifi.locator('c2-switch')
  await watch(control, 'change')
  await watch(wifi, 'selected-change')
  await wifi.click({ position: { x: 20, y: 10 } })
  await expect(control).toHaveJSProperty('checked', false)
  // The control itself still toggles once, not twice through the row.
  await control.click()
  await expect(control).toHaveJSProperty('checked', true)
  await expect(control).toHaveAttribute('data-events', '[null,null]')
  await expect(wifi).toHaveAttribute('data-events', '[]')
  await expect(wifi).toHaveJSProperty('selected', false)

  await page.locator('#sync').click({ position: { x: 4, y: 4 } })
  await expect(page.locator('#sync c2-checkbox')).toHaveJSProperty('checked', true)
})

test('clicking a select or text row focuses the control without opening or changing it', async ({ page, renderScenario }) => {
  await renderScenario(SETTINGS)
  const select = page.locator('#theme > c2-select')
  await page.locator('#theme').click({ position: { x: 20, y: 10 } })
  await expect(select).toHaveJSProperty('open', false)
  await expect.poll(() => select.evaluate((element) => document.activeElement === element)).toBe(true)
  await page.keyboard.press('Enter')
  await expect(select).toHaveJSProperty('open', true)
  // A click on the row while the dropdown is open closes it and does not open it again.
  await page.locator('#theme').click({ position: { x: 20, y: 10 } })
  await expect(select).toHaveJSProperty('open', false)

  await page.locator('#device').click({ position: { x: 20, y: 10 } })
  await expect(page.getByRole('textbox', { name: 'Device name' })).toBeFocused()
  // A text field is not claimed by the row, so its own hint line stays.
  await expect(page.locator('#device c2-text-field .supporting-text')).toHaveText('Shown to nearby devices')
})

test('the control follows row text edited in place, and a row leaving the page lets it go', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item id="row">Wi-Fi<c2-switch slot="control"></c2-switch></c2-list-item><div id="park"></div>')
  await page.evaluate(() => (document.getElementById('row')!.firstChild as Text).replaceData(0, 5, 'WLAN'))
  await expect(page.getByRole('switch', { name: 'WLAN' })).toBeVisible()
  await page.evaluate(() => {
    const row = document.getElementById('row')!
    const control = row.querySelector('c2-switch')!
    row.remove()
    document.getElementById('park')!.append(control)
  })
  await expect(page.locator('#park c2-switch').getByRole('switch')).toHaveAccessibleName('')
})

test('a control wrapped by a framework island that carries its slot is still the control', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item id="row">Wi-Fi<x-island slot="control"><c2-switch slot="control"></c2-switch></x-island></c2-list-item>')
  await expect(page.getByRole('switch', { name: 'Wi-Fi' })).toBeVisible()
  await page.locator('#row').click({ position: { x: 20, y: 10 } })
  await expect(page.locator('#row c2-switch')).toHaveJSProperty('checked', true)
})

test('the keyboard reaches the controls only, with their own keys', async ({ page, renderScenario, tab }) => {
  await renderScenario(SETTINGS)
  const wifiSwitch = page.getByRole('switch', { name: 'Wi-Fi' })
  await tab()
  await expect(wifiSwitch).toBeFocused()
  await page.keyboard.press('Space')
  await expect(wifiSwitch).not.toBeChecked()
  await tab()
  await expect(page.getByRole('checkbox', { name: 'Sync over cellular' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox', { name: 'Sync over cellular' })).toBeChecked()
  await expect(page.locator('#wifi')).toHaveJSProperty('selected', false)
  await expect(page.locator('#sync')).toHaveJSProperty('selected', false)
})

test('own text and aria-label still name the control', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item id="a">Notifications<c2-switch slot="control" aria-label="Allow notifications"></c2-switch></c2-list-item>
    <c2-list-item id="b">Updates<c2-switch slot="control">Install automatically</c2-switch></c2-list-item>
  `)
  await expect(page.getByRole('switch', { name: 'Allow notifications' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Install automatically' })).toBeVisible()
})

test('a disabled settings row does not activate its control', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item id="row" disabled>Bluetooth<c2-switch slot="control" disabled></c2-switch></c2-list-item>')
  await page.locator('#row').click({ force: true, position: { x: 4, y: 4 } })
  await expect(page.locator('#row c2-switch')).toHaveJSProperty('checked', false)
})

test('the row goes back to an ordinary row when its control leaves, and lets the control go', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item id="row">Wi-Fi<c2-switch slot="control"></c2-switch></c2-list-item><div id="park"></div>')
  const row = page.locator('#row')
  await expect(row).toHaveHostAria('role', null)
  await page.evaluate(() => document.getElementById('park')!.append(document.querySelector('#row c2-switch')!))
  await expect(row).toHaveHostAria('role', 'button')
  await expect(row).toHaveAttribute('tabindex', '0')
  // Out of the row the switch is no longer named by it.
  await expect(page.locator('#park c2-switch').getByRole('switch')).toHaveAccessibleName('')
  await row.click()
  await expect(row).toHaveJSProperty('selected', true)
})

test('a control that upgrades after the row is still named by it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item id="row">Late control<x-late slot="control"></x-late></c2-list-item>')
  await page.evaluate(async () => {
    const { FieldContextConsumer } = await import('/packages/core/src/contexts/field.ts' as string)
    // A bare reactive host stands in for a c2-* control whose module loads after the row's.
    class Late extends HTMLElement {
      // Declared before the consumer, which registers itself through addController while it is constructed.
      controller?: { hostConnected?: () => void }
      field = new FieldContextConsumer(this, { kind: 'choice' })
      button = document.createElement('button')
      updateComplete = Promise.resolve(true)
      addController(controller: { hostConnected?: () => void }) {
        this.controller = controller
      }
      connectedCallback() {
        this.attachShadow({ mode: 'open' }).append(this.button)
        this.button.textContent = 'x'
        this.controller?.hostConnected?.()
      }
      requestUpdate() {
        this.button.setAttribute('aria-label', this.field.label)
      }
    }
    customElements.define('x-late', Late)
  })
  await expect(page.locator('x-late').getByRole('button')).toHaveAccessibleName('Late control')
})
