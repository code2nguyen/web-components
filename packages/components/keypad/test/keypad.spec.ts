import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const keypad = (page: Page) => page.locator('c2-keypad').first()
const display = (page: Page) => keypad(page).locator('[part="display"]')
const key = (page: Page, name: string) => keypad(page).getByRole('button', { name, exact: true })
const value = (page: Page) => keypad(page).evaluate((element) => element.value)
const events = async (page: Page, selector = 'c2-keypad') => JSON.parse((await page.locator(selector).first().getAttribute('data-events')) ?? '[]') as unknown[]

async function tap(page: Page, ...keys: string[]) {
  for (const name of keys) await key(page, name).click()
}

test('the keys type an amount, grouped for the language, with no leading zero and a capped fraction', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad></c2-keypad>')
  await expect(keypad(page).getByRole('group')).toHaveAccessibleName('Amount')
  await expect(display(page)).toHaveText('0')
  await expect(display(page)).toHaveClass(/display--empty/)
  await watch(keypad(page), 'change')
  await tap(page, '0', '1', '2', '5', '0')
  await expect(display(page)).toHaveText('1,250')
  await tap(page, 'Decimal point')
  await expect(display(page)).toHaveText('1,250.')
  await tap(page, '5', '0', '9')
  expect(await value(page)).toBe('1250.50')
  await expect(display(page)).toHaveText('1,250.50')
  await tap(page, 'Delete', 'Delete', 'Delete')
  await expect(display(page)).toHaveText('1,250')
  // One event per key that changed the value; the 9 past two decimals changed nothing.
  expect(await events(page)).toHaveLength(11)
  await accessible(page)
})

test('a currency formats the amount, a decimal point starts at zero, and decimals="0" removes the decimal key', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad currency="USD"></c2-keypad><c2-keypad decimals="0" id="whole"></c2-keypad>')
  await tap(page, 'Decimal point', '5')
  await expect(display(page)).toHaveText('$0.5')
  await tap(page, '0')
  await expect(display(page)).toHaveText('$0.50')
  await expect(page.locator('#whole').getByRole('button', { name: 'Decimal point' })).toHaveCount(0)
  await expect(page.locator('#whole').getByRole('button')).toHaveCount(11)
})

test('a hardware keyboard types while a key has focus', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad></c2-keypad>')
  await key(page, '1').focus()
  await page.keyboard.type('42,5')
  expect(await value(page)).toBe('42.5')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  expect(await value(page)).toBe('42')
  // Enter presses the focused key, as on any button.
  await page.keyboard.press('Enter')
  expect(await value(page)).toBe('421')
})

test('a PIN shows a dot per digit, says how many are typed, fires complete once full and takes no more', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad display="pin" length="6"></c2-keypad>')
  await expect(keypad(page).getByRole('group')).toHaveAccessibleName('PIN')
  await expect(keypad(page).locator('[part="dot"]')).toHaveCount(6)
  await expect(keypad(page).getByRole('button', { name: 'Decimal point' })).toHaveCount(0)
  await watch(keypad(page), 'complete')
  await tap(page, '1', '2', '3')
  await expect(keypad(page).locator('.dot--filled')).toHaveCount(3)
  await expect(keypad(page).getByRole('status')).toHaveText('3 of 6 digits entered')
  expect(await keypad(page).evaluate((element) => element.validationMessage)).toBe('Enter all 6 digits.')
  await tap(page, '4', '5', '6', '7')
  expect(await value(page)).toBe('123456')
  expect(await events(page)).toEqual([{ value: '123456' }])
  expect(await keypad(page).evaluate((element) => element.checkValidity())).toBe(true)
  await accessible(page)
})

test('the start slot fills the bottom left key on a passcode screen', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad display="pin"><button slot="start" type="button">Face ID</button></c2-keypad>')
  const faceId = page.getByRole('button', { name: 'Face ID' })
  await expect(faceId).toBeVisible()
  const [face, zero] = await Promise.all([faceId.boundingBox(), key(page, '0').boundingBox()])
  // Same row as 0, to its left.
  expect(Math.abs(face!.y + face!.height / 2 - (zero!.y + zero!.height / 2))).toBeLessThan(2)
  expect(face!.x).toBeLessThan(zero!.x)
})

test('with for, it types into another field, which fires its own input and change', async ({ page, renderScenario }) => {
  await renderScenario('<input id="code" aria-label="Code" /><c2-keypad display="none" for="code"></c2-keypad>')
  await expect(keypad(page).getByRole('group')).toHaveAccessibleName('Keypad')
  await expect(display(page)).toHaveCount(0)
  // Both events, counted apart: each must reach the field once per key.
  await page.locator('#code').evaluate((input) => {
    const seen = { input: 0, change: 0 }
    input.addEventListener('input', () => (seen.input += 1))
    input.addEventListener('change', () => (seen.change += 1))
    ;(input as HTMLElement & { seen?: typeof seen }).seen = seen
  })
  await tap(page, '7', '3')
  await expect(page.locator('#code')).toHaveValue('73')
  expect(await page.locator('#code').evaluate((input) => (input as HTMLElement & { seen?: unknown }).seen)).toEqual({ input: 2, change: 2 })
  // Edited on its own, the field is where the next key continues from.
  await page.locator('#code').fill('9')
  await tap(page, '1')
  await expect(page.locator('#code')).toHaveValue('91')
})

test('it is a form control: submits under its name, required asks for a value, resets, and a disabled one takes no keys', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-keypad name="amount" value="12" required></c2-keypad></form>')
  const data = () => page.locator('form').evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))
  expect(await data()).toEqual({ amount: '12' })
  await tap(page, 'Delete', 'Delete')
  expect(await data()).toEqual({})
  expect(await keypad(page).evaluate((element) => element.validationMessage)).toBe('Enter a value.')
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  expect(await value(page)).toBe('12')
  // A value set from code is kept to what the keys could type; a comma in it is a thousands separator.
  await props(keypad(page), { value: '0012.3456x' })
  expect(await value(page)).toBe('12.34')
  await props(keypad(page), { value: '1,250.50' })
  expect(await value(page)).toBe('1250.50')

  await keypad(page).evaluate((element) => element.setAttribute('disabled', ''))
  await expect(key(page, '5')).toBeDisabled()
  expect(await data()).toEqual({})
})

test('long amounts show every digit typed', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad max-length="20" value="12345678901234567"></c2-keypad>')
  await expect(display(page)).toHaveText('12,345,678,901,234,567')
})

test('takes its separators and its text from the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div lang="de"><c2-keypad currency="EUR" value="1250.5"></c2-keypad></div><div lang="fr"><c2-keypad display="pin" id="fr"></c2-keypad></div>',
  )
  // The digits typed after the comma, and no more.
  await expect(display(page)).toHaveText('1.250,5\u00a0€')
  await expect(key(page, 'Decimal point')).toHaveText(',')
  const french = page.locator('#fr')
  await expect(french.getByRole('group')).toHaveAccessibleName('Code')
  await french.getByRole('button', { name: '1', exact: true }).click()
  await expect(french.getByRole('status')).toHaveText('1 chiffre sur 4')
})

test('a disabled keypad turns off its biometric key too', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad display="pin" disabled><button slot="start" type="button" onclick="this.dataset.pressed = 1">Face ID</button></c2-keypad>')
  const faceId = page.getByRole('button', { name: 'Face ID' })
  await faceId.click({ force: true })
  await expect(faceId).not.toHaveAttribute('data-pressed')
  await keypad(page).evaluate((element) => element.removeAttribute('disabled'))
  await faceId.click()
  await expect(faceId).toHaveAttribute('data-pressed', '1')
})

test('a long amount shrinks to fit the keypad rather than losing digits', async ({ page, renderScenario }) => {
  await renderScenario('<c2-keypad max-length="16" currency="USD" value="123456789012.34"></c2-keypad>')
  const [display, size] = await keypad(page)
    .locator('[part="display"]')
    .evaluate((element) => [element.scrollWidth <= element.clientWidth, parseFloat(getComputedStyle(element).fontSize)])
  expect(display).toBe(true)
  expect(size).toBeLessThan(40)
})
