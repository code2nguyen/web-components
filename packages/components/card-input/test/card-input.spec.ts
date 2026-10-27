import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { CardInput } from '../src/card-input'

const card = (page: Page) => page.locator('c2-card-input')
const number = (page: Page) => page.getByRole('textbox', { name: 'Card number' })
const expiry = (page: Page) => page.getByRole('textbox', { name: 'Expiry date (MM / YY)' })
const cvc = (page: Page) => page.getByRole('textbox', { name: 'Security code' })

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00'))
})

test('formats the number as its brand prints it, shows the brand, and moves on to the expiry and the code', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card-input></c2-card-input>`)
  await expect(card(page)).toHaveHostAria('role', 'group')
  await expect(card(page)).toHaveHostAria('aria-label', 'Card details')
  await watch(card(page), 'card-change')
  await number(page).pressSequentially('4242424242424242')
  await expect(number(page)).toHaveValue('4242 4242 4242 4242')
  await expect(card(page).locator('[part="badge"]')).toHaveText('Visa')
  await expect(expiry(page)).toBeFocused()
  await page.keyboard.type('1228')
  await expect(expiry(page)).toHaveValue('12 / 28')
  await expect(cvc(page)).toBeFocused()
  await page.keyboard.type('123')
  const changes = await card(page).getAttribute('data-events')
  // The number is never in an event.
  expect(changes).not.toContain('42424242')
  expect(JSON.parse(changes!).at(-1)).toEqual({ brand: 'visa', complete: true, error: '', last4: '4242' })
  expect(await card(page).evaluate((element: CardInput) => element.getCardDetails())).toEqual({
    number: '4242424242424242',
    expMonth: 12,
    expYear: 2028,
    cvc: '123',
    brand: 'visa',
  })
  expect(await card(page).evaluate((element: CardInput) => element.getAttributeNames())).not.toContain('value')
  await accessible(page)
})

test('an Amex number is spaced 4-6-5 with a 4-digit code; a pasted number keeps only its digits', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card-input></c2-card-input>`)
  await number(page).fill('3782-822463 10005')
  await expect(number(page)).toHaveValue('3782 822463 10005')
  await expect(card(page).locator('[part="badge"]')).toHaveText('Amex')
  await expect(cvc(page)).toHaveAttribute('maxlength', '4')
  await expect(cvc(page)).toHaveAttribute('placeholder', '1234')
})

test('problems show when a part is left: an invalid number, a past expiry, a brand not accepted', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card-input brands="visa;amex"></c2-card-input>`)
  await number(page).pressSequentially('4242424242424241')
  await expect(card(page).locator('[part="error"]')).toHaveCount(0)
  await expiry(page).focus()
  await expect(card(page).locator('[part="error"]')).toHaveText('Your card number is invalid.')
  await expect(number(page)).toHaveAttribute('aria-invalid', 'true')
  await expect(number(page)).toHaveAccessibleDescription('Your card number is invalid.')
  await number(page).fill('4242424242424242')
  await expiry(page).fill('0120')
  await cvc(page).focus()
  await expect(card(page).locator('[part="error"]')).toHaveText("Your card's expiry date is in the past.")
  await number(page).fill('5555555555554444')
  await expect(card(page).locator('[part="error"]')).toHaveText('Mastercard cards are not accepted.')
  expect(await card(page).evaluate((element: CardInput) => element.checkValidity())).toBe(false)
})

test('backspace over a space takes the digit before it; at the start of a part it goes back to the one before', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card-input></c2-card-input>`)
  await number(page).pressSequentially('42424')
  await expect(number(page)).toHaveValue('4242 4')
  await page.keyboard.press('Backspace')
  await expect(number(page)).toHaveValue('4242')
  await number(page).evaluate((input: HTMLInputElement) => input.setSelectionRange(5, 5))
  await expiry(page).pressSequentially('4')
  await expect(expiry(page)).toHaveValue('04')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(number(page)).toBeFocused()
})

test('under a name the form receives the card; required asks for one; a reset empties it', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-card-input name="card" required></c2-card-input><button type="reset">Reset</button></form>`)
  const form = page.locator('form')
  expect(await form.evaluate((element: HTMLFormElement) => element.checkValidity())).toBe(false)
  expect(await card(page).evaluate((element: CardInput) => element.validity.valueMissing)).toBe(true)
  await number(page).fill('4242424242424242')
  await expiry(page).fill('1228')
  await cvc(page).fill('123')
  expect(await form.evaluate((element: HTMLFormElement) => [...new FormData(element).entries()])).toEqual([
    ['card[number]', '4242424242424242'],
    ['card[expiry]', '2028-12'],
    ['card[cvc]', '123'],
  ])
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(number(page)).toHaveValue('')
  expect(await form.evaluate((element: HTMLFormElement) => [...new FormData(element).entries()])).toEqual([])
})

test('text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-card-input></c2-card-input></div>`)
  await expect(card(page)).toHaveHostAria('aria-label', 'Coordonnées de la carte')
  await page.getByRole('textbox', { name: 'Numéro de carte' }).pressSequentially('4242')
  await page.getByRole('textbox', { name: "Date d'expiration (MM / AA)" }).focus()
  await expect(card(page).locator('[part="error"]')).toHaveText('Le numéro de carte est incomplet.')
})

test('a four-digit year is read as such; a code is cut to the new brand; Delete steps over a space', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card-input></c2-card-input>`)
  await expiry(page).fill('12/2028')
  await expect(expiry(page)).toHaveValue('12 / 28')
  await number(page).fill('378282246310005')
  await cvc(page).fill('1234')
  await number(page).fill('4242424242424242')
  await expect(cvc(page)).toHaveValue('123')
  await number(page).evaluate((input: HTMLInputElement) => input.setSelectionRange(4, 4))
  await number(page).press('Delete')
  await expect(number(page)).toHaveValue('4242 2424 2424 242')
})

test('with brands limited, a number of a network the field does not know is refused', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-card-input brands="visa"></c2-card-input>`)
  // Passes the Luhn check, matches no brand.
  await number(page).fill('9000000000000001')
  await expiry(page).focus()
  await expect(card(page).locator('[part="error"]')).toHaveText('This card type is not accepted.')
})
