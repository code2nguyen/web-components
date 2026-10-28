import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const converter = (page: Page) => page.locator('c2-fx-converter')
const events = async (page: Page) => JSON.parse((await converter(page).getAttribute('data-events')) ?? '[]')
const EUR_USD = `from="EUR" to="USD" currencies="EUR;USD;GBP" rate="1.0842" fee="413" locale="en-US"`

test('typing what is sent computes what the recipient gets, after the fee', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fx-converter ${EUR_USD}></c2-fx-converter>`)
  await watch(converter(page), 'input')
  const send = page.getByRole('textbox', { name: 'You send' })
  await send.pressSequentially('1000')
  await expect(page.getByRole('textbox', { name: 'Recipient gets' })).toHaveValue('1,079.72')
  await expect(converter(page).locator('.line')).toHaveText([/− 4\.13 EUR\s*Fee/, /= 995\.87 EUR\s*Amount converted/, /× 1\.0842\s*Exchange rate/])
  await expect(converter(page)).toHaveJSProperty('toAmount', '107972')
  const last = (await events(page)).at(-1)
  expect(last).toEqual({ from: 'EUR', to: 'USD', fromAmount: '100000', toAmount: '107972', fixed: 'from', rate: 1.0842 })
  // The computed amount is read out once typing pauses.
  await expect(converter(page).locator('[aria-live]')).toHaveText('Recipient gets 1,079.72 USD')
  await expect(converter(page)).toHaveHostAria('role', 'group')
  await accessible(page)
})

test('typing what the recipient gets keeps that amount and rounds what is sent up', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fx-converter ${EUR_USD} amount="50000"></c2-fx-converter>`)
  await expect(page.getByRole('textbox', { name: 'Recipient gets' })).toHaveValue('537.62')
  const receive = page.getByRole('textbox', { name: 'Recipient gets' })
  await receive.fill('')
  await receive.pressSequentially('1000')
  // 1,000 USD ÷ 1.0842 = 922.3390… EUR, rounded up to 922.34, plus the 4.13 fee.
  await expect(page.getByRole('textbox', { name: 'You send' })).toHaveValue('926.47')
  await expect(page.getByRole('textbox', { name: 'Recipient gets exactly' })).toHaveValue('1,000')
  await expect(converter(page)).toHaveJSProperty('fixed', 'to')
  await expect(converter(page).locator('[aria-live]')).toHaveText('You send 926.47 EUR')
})

test('swap exchanges the currencies, keeps the typed amount, and marks the inverted rate as indicative', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fx-converter ${EUR_USD} amount="100000"></c2-fx-converter>`)
  await watch(converter(page), 'swap')
  await page.locator('main').evaluate((main) => main.addEventListener('swap', () => main.setAttribute('data-bubbled', '')))
  await page.getByRole('button', { name: 'Swap currencies' }).click()
  await expect.poll(() => events(page)).toEqual([{ from: 'USD', to: 'EUR' }])
  await expect(page.locator('main')).not.toHaveAttribute('data-bubbled')
  await expect(page.getByRole('textbox', { name: 'You send' })).toHaveValue('1,000.00')
  await expect(page.getByRole('combobox').first()).toHaveValue('USD')
  // The fee was in euros: it is gone until the app sends a new quote.
  await expect(converter(page).locator('.line')).toHaveText([/1 USD = 0\.922339 EUR\s*Indicative rate/])
  await expect(page.getByRole('textbox', { name: 'Recipient gets' })).toHaveValue('922.34')
  await props(converter(page), { rate: 0.9221 })
  await expect(converter(page).locator('.line')).toHaveText([/1 USD = 0\.9221 EUR\s*Exchange rate/])
  await expect(page.getByRole('textbox', { name: 'Recipient gets' })).toHaveValue('922.10')
})

test('a guaranteed rate counts down, then expires: the result dims and a button asks for a new rate', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fx-converter ${EUR_USD} amount="100000"></c2-fx-converter>`)
  await watch(converter(page), 'rate-expire')
  await converter(page).evaluate((element: HTMLElement & { rateExpires: string }) => {
    element.addEventListener('rate-refresh', () => element.setAttribute('data-refreshed', ''))
    element.rateExpires = String(Date.now() + 2000)
  })
  await expect(converter(page).locator('.line--rate')).toHaveText(/Guaranteed for 2s/)
  await expect(converter(page).locator('.line--rate')).toHaveText(/Rate expired/, { timeout: 4000 })
  await expect.poll(() => events(page)).toEqual([null])
  await expect(converter(page).locator('[aria-live]')).toHaveText('Rate expired')
  await expect(converter(page).locator('.field--to')).toHaveClass(/field--stale/)
  await expect(page.getByRole('button', { name: 'Swap currencies' })).toHaveCount(0)
  await page.getByRole('button', { name: 'New rate' }).click()
  await expect(converter(page)).toHaveAttribute('data-refreshed', '')
  await props(converter(page), { rate: 1.09, rateExpires: String(Date.now() + 30000) })
  // The ring is aria-hidden; its own text is not part of the line's meaning.
  await expect(converter(page).locator('.line--rate .line__value')).toHaveText('× 1.09')
  await expect(converter(page).locator('.line--rate .lock')).toContainText('Guaranteed for 30s')
  await expect(page.getByRole('textbox', { name: 'Recipient gets' })).toHaveValue('1,085.50')
  await expect(page.getByRole('button', { name: 'Swap currencies' })).toBeVisible()
  await accessible(page)
})

test('picking a currency recomputes in its minor unit; max shows an error; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fx-converter from="USD" to="EUR" currencies="USD;EUR;JPY" rate="150.5" amount="1000" max="500" locale="en-US"></c2-fx-converter>
    <div lang="fr"><c2-fx-converter id="fr" from="EUR" to="USD" rate="1.1" amount="1000"></c2-fx-converter></div>`)
  await watch(converter(page).first(), 'currency-change')
  await converter(page).first().getByRole('combobox').nth(1).selectOption('JPY')
  await expect.poll(async () => JSON.parse((await converter(page).first().getAttribute('data-events')) ?? '[]')).toEqual([{ side: 'to', currency: 'JPY' }])
  // Yen have no minor unit: 10 USD × 150.5 is ¥1,505.
  await expect(page.getByRole('textbox', { name: 'Recipient gets' }).first()).toHaveValue('1,505')
  await expect(converter(page).first()).toHaveJSProperty('toAmount', '1505')
  await expect(converter(page).first()).toHaveJSProperty('fromAmount', '1000')
  await expect(converter(page).first().getByText('You can send up to 5.00 USD')).toBeVisible()
  await expect(page.locator('#fr').getByRole('textbox', { name: 'Vous envoyez' })).toBeVisible()
  await expect(page.locator('#fr').getByRole('button', { name: 'Inverser les devises' })).toBeVisible()
  await expect(page.locator('#fr .line--rate')).toHaveText(/1 EUR = 1,1 USD\s*Taux de change/)
})
