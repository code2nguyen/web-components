import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

test('editing emits input/change, exposes a name, and reset restores the default', async ({ page, renderScenario }) => {
  await renderScenario('<c2-text-field aria-label="Message" value="Original" help="Describe the issue"></c2-text-field><button>Commit</button>')
  const host = page.locator('c2-text-field')
  const input = page.getByRole('textbox', { name: 'Message' })
  await watch(host, 'change')
  await input.fill('Edited')
  await page.getByRole('button', { name: 'Commit' }).click()
  await expect(host).toHaveJSProperty('value', 'Edited')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await host.evaluate((el) => (el as HTMLElement & { reset(): void }).reset())
  await expect(input).toHaveValue('Original')
  await accessible(page)
})
test('readonly and disabled enforce native restrictions', async ({ page, renderScenario }) => {
  await renderScenario('<c2-text-field aria-label="Message" value="Keep" readonly></c2-text-field>')
  const host = page.locator('c2-text-field')
  const input = page.getByRole('textbox')
  await expect(input).not.toBeEditable()
  await input.press('x')
  await expect(input).toHaveValue('Keep')
  await props(host, { readOnly: false, disabled: true })
  await expect(input).toBeDisabled()
  await props(host, { disabled: false, value: 'New' })
  await expect(input).toHaveValue('New')
})
test('maximum length limits real typing and error feedback is visible', async ({ page, renderScenario }) => {
  await renderScenario('<c2-text-field aria-label="Message" maxlength="5" error error-text="Please revise"></c2-text-field>')
  const input = page.getByRole('textbox')
  await input.pressSequentially('1234567')
  await expect(input).toHaveValue('12345')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Please revise', { exact: true })).toBeVisible()
  await expect(page.getByText('5 / 5', { exact: true })).toBeVisible()
})

test('clear emits the value change and returns focus to the input', async ({ page, renderScenario }) => {
  await renderScenario('<c2-text-field aria-label="Search" value="query" clearable></c2-text-field>')
  const host = page.locator('c2-text-field')
  await watch(host, 'clear')
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByRole('textbox')).toHaveValue('')
  await expect(page.getByRole('textbox')).toBeFocused()
  await expect(host).toHaveAttribute('data-events', '[null]')
})

test('an adornment in the icon slots keeps its natural width', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-text-field id="field" style="width: 240px" value="1200">
      <span slot="prefix-icon">US$</span>
      <svg slot="suffix-icon" viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path></svg>
    </c2-text-field>
  `)
  const adornment = await page.locator('#field span').evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { width: Math.round(rect.width), clipped: element.scrollWidth > Math.ceil(rect.width) }
  })
  // `US$` is wider than an icon; squaring it to `--c2-text-field__icon--size` would cut it off.
  expect(adornment.width).toBeGreaterThan(16)
  expect(adornment.clipped).toBe(false)
  await expect(page.locator('#field svg')).toHaveCSS('width', '16px')
})

test('participates in FormData, native validation, reset and disabled fieldsets', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-text-field name="message" value="Original" required></c2-text-field></fieldset></form>')
  const host = page.locator('c2-text-field')
  await expect(host).toHaveJSProperty('willValidate', true)
  await host.evaluate((el) => ((el as HTMLElement & { value: string }).value = 'Edited'))
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('message'))).toBe('Edited')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('value', 'Original')
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(page.getByRole('textbox')).toBeDisabled()
})
