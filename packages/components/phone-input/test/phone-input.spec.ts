import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const events = async (page: Page) => JSON.parse((await page.locator('c2-phone-input').getAttribute('data-events')) ?? '[]')
const number = (page: Page) => page.getByRole('textbox', { name: 'Phone number' })
const countryButton = (page: Page) => page.getByRole('button', { name: /^Country:/ })

test('groups the national number as it is typed and reports it in E.164', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="FR"></c2-phone-input>')
  const host = page.locator('c2-phone-input')
  await expect(number(page)).toHaveAttribute('placeholder', '6 12 34 56 78')
  await expect(countryButton(page)).toHaveAccessibleName('Country: France (+33)')
  await number(page).click()
  await page.keyboard.type('0612345678')
  await expect(number(page)).toHaveValue('06 12 34 56 78')
  // The trunk prefix 0 is dropped from the international number.
  await expect(host).toHaveJSProperty('value', '+33612345678')
  await expect(host).toHaveJSProperty('nationalNumber', '612345678')
  await expect(host).toHaveJSProperty('valid', true)
})

test('a US number reads as (415) 555-0132 and letters are dropped', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="US"></c2-phone-input>')
  await number(page).click()
  await page.keyboard.type('415a5550132')
  await expect(number(page)).toHaveValue('(415) 555-0132')
  await expect(page.locator('c2-phone-input')).toHaveJSProperty('value', '+14155550132')
})

test('backspace over a separator deletes the digit before it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="US" value="+14155550132"></c2-phone-input>')
  await expect(number(page)).toHaveValue('(415) 555-0132')
  await number(page).click()
  // Caret right after "555-": the dash goes with the 5 before it.
  await number(page).evaluate((input: HTMLInputElement) => input.setSelectionRange(10, 10))
  await page.keyboard.press('Backspace')
  await expect(number(page)).toHaveValue('(415) 550-132')
  await page.keyboard.type('9')
  await expect(number(page)).toHaveValue('(415) 559-0132')
})

test('typing a + number picks the country from its calling code', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="US"></c2-phone-input>')
  const host = page.locator('c2-phone-input')
  await watch(host, 'country-change')
  await number(page).click()
  await page.keyboard.type('+4')
  await expect(number(page)).toHaveValue('+4')
  await expect(host).toHaveJSProperty('value', '')
  await page.keyboard.type('47400123456')
  await expect(countryButton(page)).toHaveAccessibleName('Country: United Kingdom (+44)')
  await expect(number(page)).toHaveValue('7400 123456')
  await expect(host).toHaveJSProperty('value', '+447400123456')
  expect(await events(page)).toEqual([{ country: 'GB', dialCode: '44' }])
})

test('a pasted +1 number with a Caribbean area code picks that country', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="FR"></c2-phone-input>')
  await number(page).click()
  await page.keyboard.insertText('+1 (242) 359-1234')
  await expect(countryButton(page)).toHaveAccessibleName('Country: Bahamas (+1)')
  await expect(page.locator('c2-phone-input')).toHaveJSProperty('value', '+12423591234')
})

test('value and country can be set in any order: a + value decides the country', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input value="+33612345678" country="DE"></c2-phone-input>')
  const host = page.locator('c2-phone-input')
  await expect(host).toHaveJSProperty('country', 'FR')
  await expect(number(page)).toHaveValue('6 12 34 56 78')
  // A value without + is a national number of the current country.
  await props(host, { country: 'GB', value: '07400 123456' })
  await expect(host).toHaveJSProperty('value', '+447400123456')
})

test('the picker searches by name and calling code and keeps the number', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="US" value="+12015550123"></c2-phone-input>')
  const host = page.locator('c2-phone-input')
  await watch(host, 'country-change')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  await countryButton(page).click()
  await expect(host).toHaveState('open')
  const search = page.getByRole('combobox', { name: 'Search countries' })
  await expect(search).toBeFocused()
  await expect(page.getByRole('option', { name: /United States/ })).toHaveAttribute('aria-selected', 'true')

  await page.keyboard.type('+49')
  await expect(page.getByRole('option')).toHaveText([/Germany/])
  await page.keyboard.press('Control+a')
  await page.keyboard.type('swit')
  await expect(page.getByRole('option')).toHaveText([/Switzerland\s*\+41/])
  await page.keyboard.press('Enter')

  await expect(host).not.toHaveState('open')
  await expect(number(page)).toBeFocused()
  await expect(host).toHaveJSProperty('value', '+412015550123')
  expect(await events(page)).toEqual([{ country: 'CH', dialCode: '41' }])
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;change;')
})

test('the picker opens from the keyboard and Escape returns to the button', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="FR" preferred-countries="DE;GB" countries="FR;DE;GB;IT"></c2-phone-input>')
  await countryButton(page).focus()
  await page.keyboard.press('ArrowDown')
  // Preferred countries first, then the allowed ones by name; the selected one is active.
  await expect(page.getByRole('option')).toHaveText([/Germany/, /United Kingdom/, /France/, /Italy/])
  await expect(page.getByRole('combobox', { name: 'Search countries' })).toHaveAttribute('aria-activedescendant', 'country-2')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('combobox', { name: 'Search countries' })).toHaveAttribute('aria-activedescendant', 'country-3')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(countryButton(page)).toBeFocused()
  await expect(countryButton(page)).toHaveAccessibleName('Country: France (+33)')

  await page.keyboard.press('Enter')
  await page.getByRole('option', { name: /Italy/ }).click()
  await expect(countryButton(page)).toHaveAccessibleName('Country: Italy (+39)')
})

test('clicking outside closes the picker', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input></c2-phone-input><p>Outside</p>')
  await countryButton(page).click()
  await expect(page.getByRole('option').first()).toBeVisible()
  await page.getByText('Outside').click()
  await expect(page.getByRole('option')).toHaveCount(0)
})

test('submits the E.164 value with its form, validates and resets', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-phone-input name="phone" country="FR" required></c2-phone-input><input aria-label="Other"></form>')
  const host = page.locator('c2-phone-input')
  const read = () => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('phone'))
  expect(await host.evaluate((element) => (element as HTMLElement & { validity: ValidityState }).validity.valueMissing)).toBe(true)
  expect(await read()).toBeNull()

  await number(page).click()
  await page.keyboard.type('061234')
  await page.getByRole('textbox', { name: 'Other' }).click()
  // Too short for France: invalid once the field lost focus.
  await expect(host).toHaveState('invalid')
  await expect(number(page)).toHaveAttribute('aria-invalid', 'true')
  expect(await host.evaluate((element) => (element as HTMLElement & { validity: ValidityState }).validity.patternMismatch)).toBe(true)

  await number(page).click()
  await page.keyboard.type('5678')
  await expect(host).not.toHaveState('invalid')
  expect(await host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
  expect(await read()).toBe('+33612345678')

  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(number(page)).toHaveValue('')
  expect(await read()).toBeNull()
})

test('disabled and readonly', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-phone-input name="p" value="+33612345678" disabled></c2-phone-input></form>')
  await expect(number(page)).toBeDisabled()
  await expect(countryButton(page)).toBeDisabled()
  await expect(page.locator('c2-phone-input')).toHaveState('disabled')
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('p'))).toBe(false)

  await props(page.locator('c2-phone-input'), { disabled: false, readonly: true })
  await expect(number(page)).toHaveAttribute('readonly', '')
  await expect(countryButton(page)).toBeDisabled()
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('p'))).toBe('+33612345678')
})

test('countries restricts the picker and the default country', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input countries="DE, AT, CH"></c2-phone-input>')
  // en-US would pick the US, which is not allowed: the first allowed country is used.
  await expect(countryButton(page)).toHaveAccessibleName('Country: Germany (+49)')
  await countryButton(page).click()
  await expect(page.getByRole('option')).toHaveText([/Austria/, /Germany/, /Switzerland/])
})

test('is accessible closed and open', async ({ page, renderScenario }) => {
  await renderScenario('<label for="p">Mobile</label><c2-phone-input id="p" country="FR" value="+33612345678"></c2-phone-input>')
  await accessible(page)
  await countryButton(page).click()
  await accessible(page)
})

test('search puts countries whose name starts with the query first', async ({ page, renderScenario }) => {
  await renderScenario('<c2-phone-input country="US"></c2-phone-input>')
  await countryButton(page).click()
  await page.keyboard.type('ger')
  await expect(page.getByRole('option')).toHaveText([/Germany/, /Algeria/, /Niger\b/, /Nigeria/])
})
