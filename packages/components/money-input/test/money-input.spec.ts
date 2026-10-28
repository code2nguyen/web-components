import { accessible, expect, props, test, watch } from '../../../../tests/component-fixture'

const formValue = (page: import('@playwright/test').Page, name: string) =>
  page.locator('form').evaluate((form, field) => new FormData(form as HTMLFormElement).get(field), name)

test('groups digits while typing and stores the amount in minor units', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US"></c2-money-input>')
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Amount' })
  await expect(host.locator('.symbol')).toHaveText('$')
  await expect(input).toHaveAttribute('placeholder', '0.00')
  await input.pressSequentially('1234567.891')
  await expect(input).toHaveValue('1,234,567.89')
  await expect(host).toHaveJSProperty('value', '123456789')
  await expect(host).toHaveJSProperty('amount', 1234567.89)
})

test('pads the fraction and fires change once when the field loses focus', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US"></c2-money-input><c2-money-input aria-label="Other"></c2-money-input>')
  const host = page.locator('c2-money-input').first()
  await watch(host, 'change')
  const input = page.getByRole('textbox', { name: 'Amount' })
  await input.pressSequentially('12.5')
  await expect(host).toHaveAttribute('data-events', '[]')
  await page.keyboard.press('Tab')
  await expect(input).toHaveValue('12.50')
  await expect(host).toHaveJSProperty('value', '1250')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await input.focus()
  await page.keyboard.press('Tab')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await props(host, { value: '900' })
  await input.focus()
  await page.keyboard.press('Tab')
  await expect(host).toHaveAttribute('data-events', '[null]')
})

test('keeps the caret in place when a grouping separator appears', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US" value="12300"></c2-money-input>')
  const input = page.getByRole('textbox', { name: 'Amount' })
  await expect(input).toHaveValue('123.00')
  await input.focus()
  await input.press('Home')
  await input.press('ArrowRight')
  await page.keyboard.type('9')
  await expect(input).toHaveValue('1,923.00')
  await page.keyboard.type('5')
  await expect(input).toHaveValue('19,523.00')
  await expect.poll(() => input.evaluate((element) => (element as HTMLInputElement).selectionStart)).toBe(4)
})

test('follows the locale for separators and the symbol position', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Betrag" locale="de-DE" currency="EUR" value="123456"></c2-money-input>')
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Betrag' })
  await expect(input).toHaveValue('1.234,56')
  await expect(host.locator('input + .symbol')).toHaveText('€')
  await input.fill('')
  await input.pressSequentially('7.500,5')
  await expect(host).toHaveJSProperty('value', '750050')
})

test('reads pasted amounts written with either convention', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US"></c2-money-input>')
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Amount' })
  await input.focus()
  await page.keyboard.insertText('$1.234,56')
  await expect(input).toHaveValue('1,234.56')
  await expect(host).toHaveJSProperty('value', '123456')
})

test('stops at the currency minor-unit digits', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US" currency="JPY"></c2-money-input>')
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Amount' })
  await expect(input).toHaveAttribute('inputmode', 'numeric')
  await input.pressSequentially('1050.75')
  await expect(input).toHaveValue('105,075')
  await expect(host).toHaveJSProperty('value', '105075')
  await expect(host).toHaveJSProperty('fractionDigits', 0)
})

test('accepts a minus sign only when min is negative', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-money-input aria-label="Price" locale="en-US"></c2-money-input>
    <c2-money-input aria-label="Adjustment" locale="en-US" min="-100000"></c2-money-input>
  `)
  const price = page.getByRole('textbox', { name: 'Price' })
  await price.pressSequentially('-5')
  await expect(price).toHaveValue('5')
  const adjustment = page.getByRole('textbox', { name: 'Adjustment' })
  await adjustment.pressSequentially('5-')
  await expect(adjustment).toHaveValue('-5')
  await expect(page.locator('c2-money-input').last()).toHaveJSProperty('value', '-500')
})

test('picks a currency and keeps the amount in major units', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US" value="1050" currencies="USD;EUR;JPY"></c2-money-input>')
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Amount' })
  const picker = page.getByRole('combobox', { name: 'Currency' })
  await watch(host, 'currency-change')
  await picker.selectOption('EUR')
  await expect(host).toHaveJSProperty('currency', 'EUR')
  await expect(host).toHaveJSProperty('value', '1050')
  await expect(host.locator('.symbol')).toHaveText('€')
  await expect(host).toHaveAttribute('data-events', '[{"currency":"EUR"}]')
  await picker.selectOption('JPY')
  await expect(input).toHaveValue('10')
  await expect(host).toHaveJSProperty('value', '10')
})

test('currency-label names the picker; a pick that keeps the value fires no input', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-money-input aria-label="From" currency-label="From currency" currencies="USD;EUR"></c2-money-input>
    <c2-money-input aria-label="To" currency-label="To currency" currency="EUR" currencies="USD;EUR"></c2-money-input>`)
  await expect(page.getByRole('combobox', { name: 'From currency' })).toHaveValue('USD')
  await expect(page.getByRole('combobox', { name: 'To currency' })).toHaveValue('EUR')
  // A pick that keeps the value (two-digit to two-digit) is not an edit: no input event leaves the field.
  const from = page.locator('c2-money-input').first()
  await watch(from, 'input')
  await page.getByRole('combobox', { name: 'From currency' }).selectOption('EUR')
  await expect(from).toHaveJSProperty('currency', 'EUR')
  await expect(from).toHaveAttribute('data-events', '[]')
})

test('submits, validates and resets with its form', async ({ page, renderScenario }) => {
  await renderScenario(`
    <form>
      <c2-money-input name="amount" currency-name="currency" aria-label="Amount" locale="en-US" value="500" min="100" max="100000" required currencies="USD;EUR"></c2-money-input>
    </form>
  `)
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Amount' })
  await expect.poll(() => formValue(page, 'amount')).toBe('500')
  await expect.poll(() => formValue(page, 'currency')).toBe('USD')
  const validity = () =>
    host.evaluate((element) =>
      (element as HTMLElement & { validity: ValidityState }).validity.valid
        ? 'valid'
        : (element as HTMLElement & { validationMessage: string }).validationMessage,
    )
  await expect.poll(validity).toBe('valid')
  await input.fill('')
  await expect.poll(validity).toBe('Enter an amount.')
  await input.pressSequentially('0.5')
  await expect.poll(validity).toBe('Enter $1.00 or more.')
  await input.fill('')
  await input.pressSequentially('2000')
  await expect.poll(validity).toBe('Enter $1,000.00 or less.')
  await page.getByRole('combobox', { name: 'Currency' }).selectOption('EUR')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(input).toHaveValue('5.00')
  await expect(host).toHaveJSProperty('currency', 'USD')
})

test('disabled fieldsets exclude the value', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-money-input name="amount" value="300" aria-label="Amount"></c2-money-input></fieldset></form>')
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(page.getByRole('textbox')).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('amount'))).toBe(false)
})

test('shows help and error text accessibly', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Budget" locale="en-US" value="250000" help="Monthly limit" currencies="USD;EUR"></c2-money-input>')
  const host = page.locator('c2-money-input')
  const input = page.getByRole('textbox', { name: 'Budget' })
  await expect(input).toHaveAccessibleDescription('US Dollar Monthly limit')
  await props(host, { error: true, errorText: 'Over the team budget.' })
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(host.locator('.supporting-text')).toHaveText('Over the team budget.')
  await accessible(page)
})

test('formats a value set from script', async ({ page, renderScenario }) => {
  await renderScenario('<c2-money-input aria-label="Amount" locale="en-US"></c2-money-input>')
  const host = page.locator('c2-money-input')
  await props(host, { amount: 19.99 })
  await expect(host).toHaveJSProperty('value', '1999')
  await expect(page.getByRole('textbox')).toHaveValue('19.99')
  await props(host, { value: 'not a number' })
  await expect(page.getByRole('textbox')).toHaveValue('')
})
