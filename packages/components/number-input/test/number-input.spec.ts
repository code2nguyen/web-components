import { accessible, expect, props, slotPresenceMatrix, test, watch } from '../../../../tests/component-fixture'

test('supporting-text presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const region = page.locator('c2-number-input').locator('.supporting-text')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-number-input><span slot="supporting-text" data-slot-presence-probe>Help</span></c2-number-input>',
    host: 'c2-number-input',
    slot: 'supporting-text',
    assertPresent: async (present) => expect(region).toHaveCount(present ? 1 : 0),
  })
})

test('consumer-owned controls and supporting slots remain directly styleable', async ({ page, renderScenario }) => {
  const slots = ['decrement-icon', 'increment-icon', 'prefix', 'suffix', 'supporting-text']
  await renderScenario(`<c2-number-input>${slots.map((slot) => `<span class="slot-probe" slot="${slot}">${slot}</span>`).join('')}</c2-number-input>`)
  await page.addStyleTag({ content: '.slot-probe{color:rgb(1,2,3)}' })
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color)))
    .toEqual(Array(5).fill('rgb(1, 2, 3)'))
})

test('steps with pointer controls and publishes input and change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-number-input value="2" min="0" max="4" step="0.5" aria-label="Quantity"></c2-number-input>')
  const host = page.locator('c2-number-input')
  await watch(host, 'input')
  await page.getByRole('button', { name: 'Increase value' }).click()
  await expect(host).toHaveJSProperty('value', '2.5')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await page.getByRole('button', { name: 'Decrease value' }).click()
  await expect(host.locator('input')).toHaveValue('2')
})

test('keeps native spinbutton keyboard behavior and clamps controls at bounds', async ({ page, renderScenario }) => {
  await renderScenario('<c2-number-input value="1" min="0" max="2" aria-label="Guests"></c2-number-input>')
  const host = page.locator('c2-number-input')
  const input = page.getByRole('spinbutton', { name: 'Guests' })
  await input.press('ArrowUp')
  await expect(host).toHaveJSProperty('value', '2')
  await expect(page.getByRole('button', { name: 'Increase value' })).toBeDisabled()
  await input.press('ArrowDown')
  await expect(host).toHaveJSProperty('value', '1')
})

test('submits, resets and validates like a native number input', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-number-input name="seats" value="2" min="1" max="5" required aria-label="Seats"></c2-number-input></form>')
  const host = page.locator('c2-number-input')
  const input = page.getByRole('spinbutton')
  await input.fill('4')
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('seats'))).toBe('4')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(input).toHaveValue('2')
  await host.evaluate((element) => (element as HTMLElement & { setCustomValidity(message: string): void }).setCustomValidity('Use an even number'))
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
})

test('supports adornments, helper text, errors and hidden steppers', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-number-input value="19.5" aria-label="Price" help="Before tax" hide-steppers>
      <span slot="prefix">$</span><span slot="suffix">USD</span>
    </c2-number-input>
  `)
  const host = page.locator('c2-number-input')
  await expect(host.locator('[slot="prefix"]')).toHaveText('$')
  await expect(host.locator('[slot="suffix"]')).toHaveText('USD')
  await expect(page.getByRole('button', { name: 'Increase value' })).toHaveCount(0)
  await props(host, { error: true, errorText: 'Enter a valid price.' })
  await expect(page.getByRole('spinbutton')).toHaveAttribute('aria-invalid', 'true')
  await expect(host.locator('.supporting-text')).toHaveText('Enter a valid price.')
  await accessible(page)
})

test('disabled fieldsets exclude the value and step any disables controls', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-number-input name="rate" value="3" step="any" aria-label="Rate"></c2-number-input></fieldset></form>')
  await expect(page.getByRole('button', { name: 'Increase value' })).toBeDisabled()
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(page.getByRole('spinbutton')).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('rate'))).toBe(false)
})
