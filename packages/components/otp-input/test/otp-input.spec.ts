import { accessible, expect, props, slotPresenceMatrix, test, watch } from '../../../../tests/component-fixture'

test('supporting-text presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const region = page.locator('c2-otp-input').locator('.supporting-text')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-otp-input><span slot="supporting-text" data-slot-presence-probe>Help</span></c2-otp-input>',
    host: 'c2-otp-input',
    slot: 'supporting-text',
    assertPresent: async (present) => expect(region).toHaveCount(present ? 1 : 0),
  })
})

test('typing fills one cell per character and fires complete once full', async ({ page, renderScenario }) => {
  await renderScenario('<c2-otp-input length="4" aria-label="Login code"></c2-otp-input>')
  const host = page.locator('c2-otp-input')
  await host.evaluate((element) => {
    element.addEventListener('complete', (event) => element.setAttribute('data-complete', (event as CustomEvent<{ value: string }>).detail.value))
  })
  const input = page.getByRole('textbox', { name: 'Login code' })
  await input.click()
  await expect(host.locator('.cell').nth(0)).toHaveClass(/active/)
  await page.keyboard.type('12')
  await expect(host).toHaveJSProperty('value', '12')
  await expect(host.locator('.cell').nth(1)).toHaveText('2')
  await expect(host.locator('.cell').nth(2)).toHaveClass(/active/)
  await expect(host).not.toHaveAttribute('data-complete')
  await page.keyboard.type('34')
  await expect(host).toHaveAttribute('data-complete', '1234')
  await expect(host.locator('.cell').nth(3)).toHaveClass(/active/)
})

test('numeric mode drops other characters and extra input is cut to length', async ({ page, renderScenario }) => {
  await renderScenario('<c2-otp-input length="4"></c2-otp-input>')
  const host = page.locator('c2-otp-input')
  await watch(host, 'input')
  await page.getByRole('textbox').click()
  await page.keyboard.type('a1b-2')
  await expect(host).toHaveJSProperty('value', '12')
  await expect(host.locator('input')).toHaveValue('12')
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await page.keyboard.type('3456')
  await expect(host).toHaveJSProperty('value', '1234')
})

test('pasting distributes a code, alphanumeric mode keeps letters', async ({ page, renderScenario, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only')
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await renderScenario('<c2-otp-input mode="alphanumeric" length="6" group="3"></c2-otp-input>')
  const host = page.locator('c2-otp-input')
  await page.evaluate(() => navigator.clipboard.writeText(' ab-C12 3 '))
  await page.getByRole('textbox').click()
  await page.keyboard.press('ControlOrMeta+V')
  await expect(host).toHaveJSProperty('value', 'abC123')
  await expect(host.locator('.separator')).toHaveCount(1)
})

test('Backspace removes the last character and caret stays at the end', async ({ page, renderScenario }) => {
  await renderScenario('<c2-otp-input value="123"></c2-otp-input>')
  const host = page.locator('c2-otp-input')
  const input = page.getByRole('textbox')
  await input.click()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Backspace')
  await expect(host).toHaveJSProperty('value', '12')
  await page.keyboard.type('9')
  await expect(host).toHaveJSProperty('value', '129')
})

test('masked shows dots and placeholder fills empty cells', async ({ page, renderScenario }) => {
  await renderScenario('<c2-otp-input length="3" value="42" masked placeholder="○"></c2-otp-input>')
  const cells = page.locator('c2-otp-input .cell')
  await expect(cells).toHaveText(['•', '•', '○'])
})

test('submits, validates length and resets like a native field', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-otp-input name="code" length="4" required></c2-otp-input></form>')
  const host = page.locator('c2-otp-input')
  const valid = () => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())
  await expect.poll(valid).toBe(false)
  await page.getByRole('textbox').click()
  await page.keyboard.type('12')
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { validity: ValidityState }).validity.tooShort)).toBe(true)
  await page.keyboard.type('34')
  await expect.poll(valid).toBe(true)
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('code'))).toBe('1234')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('value', '')
})

test('disabled fieldsets exclude the value and read-only blocks editing', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-otp-input name="code" value="1234" length="4" readonly></c2-otp-input></fieldset></form>')
  const host = page.locator('c2-otp-input')
  await page.getByRole('textbox').click()
  await page.keyboard.type('5')
  await expect(host).toHaveJSProperty('value', '1234')
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(page.getByRole('textbox')).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('code'))).toBe(false)
})

test('error state and helper text are announced and accessible', async ({ page, renderScenario }) => {
  await renderScenario('<c2-otp-input help="We sent a code to your phone."></c2-otp-input>')
  const host = page.locator('c2-otp-input')
  const input = page.getByRole('textbox', { name: 'Verification code' })
  await expect(input).toHaveAccessibleDescription('We sent a code to your phone.')
  await accessible(page)
  await props(host, { error: true, errorText: 'That code has expired.' })
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(host.locator('.supporting-text')).toHaveText('That code has expired.')
  await accessible(page)
})

test('in a column narrower than its cells, the cells shrink instead of overflowing', async ({ page, renderScenario }) => {
  await renderScenario('<div style="width: 200px"><c2-otp-input aria-label="Code"></c2-otp-input></div>')
  const host = page.locator('c2-otp-input')
  const cells = host.locator('.cell')
  await expect(cells).toHaveCount(6)
  const column = (await page.locator('div[style]').first().boundingBox())!
  const last = (await cells.last().boundingBox())!
  expect(last.x + last.width).toBeLessThanOrEqual(column.x + column.width + 0.5)
  // The same inside a centring flex container, where an item keeps its content's width as its minimum.
  await renderScenario('<div style="display: flex; justify-content: center; width: 200px"><c2-otp-input aria-label="Code"></c2-otp-input></div>')
  const flexColumn = (await page.locator('div[style]').first().boundingBox())!
  const flexLast = (await page.locator('c2-otp-input .cell').last().boundingBox())!
  expect(flexLast.x + flexLast.width).toBeLessThanOrEqual(flexColumn.x + flexColumn.width + 0.5)
  // With room to spare, a cell keeps its own width.
  await renderScenario('<div style="width: 400px"><c2-otp-input aria-label="Code"></c2-otp-input></div>')
  expect((await page.locator('c2-otp-input .cell').first().boundingBox())!.width).toBeCloseTo(40, 0)
})
