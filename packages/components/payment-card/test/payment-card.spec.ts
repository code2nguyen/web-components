import { test, expect, accessible, clipboard, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Card = HTMLElement & { details: unknown; revealed: boolean; hide(): void; revealFailed(): void }

const card = (page: Page) => page.locator('c2-payment-card')
const events = async (page: Page) => JSON.parse((await card(page).getAttribute('data-events')) ?? '[]')
const DETAILS = { number: '4242 4242 4242 4242', expiry: '08/29', cvc: '314' }

test('masked: the last four digits only; showing asks the app, then shows each field with a copy button', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-payment-card label="Marketing · Virtual" holder="Ada Lovelace" last4="4242"></c2-payment-card>`)
  await expect(card(page)).toHaveHostAria('role', 'group')
  await expect(card(page)).toHaveHostAria('aria-label', 'Marketing · Virtual')
  await expect(card(page).getByText('Card ending in 4242')).toBeAttached()
  await expect(card(page).locator('.digits')).toHaveText('•••• •••• •••• 4242')
  await accessible(page)
  await watch(card(page), 'reveal-request')
  await page.getByRole('button', { name: 'Show details' }).click()
  await expect.poll(() => events(page)).toEqual([null])
  await expect(card(page).getByRole('img', { name: 'Loading card details' })).toBeVisible()
  await props(card(page), { details: DETAILS })
  await expect(card(page).locator('.digits')).toHaveText('4242 4242 4242 4242')
  await expect(card(page).getByText('Card number 4242424242424242')).toBeAttached()
  await expect(card(page).locator('.announce')).toHaveText('Card details shown')
  for (const name of ['Copy card number', 'Copy expiry date', 'Copy security code']) await expect(page.getByRole('button', { name })).toBeVisible()
  await accessible(page)
})

test('a copy fires field-copy with the field; hiding drops the details and says so', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-payment-card last4="4242"></c2-payment-card>`)
  await clipboard(page)
  await props(card(page), { details: DETAILS })
  await watch(card(page), 'field-copy')
  await page.getByRole('button', { name: 'Copy card number' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '4242424242424242')
  await expect.poll(() => events(page)).toEqual([{ field: 'number' }])
  await page.getByRole('button', { name: 'Hide details' }).click()
  await expect(card(page).locator('.digits')).toHaveText('•••• •••• •••• 4242')
  await expect(card(page)).toHaveJSProperty('details', null)
  await expect(card(page).locator('.announce')).toHaveText('Card details hidden')
})

test('masks itself after hide-after seconds; a failed reveal returns to the masked face', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-payment-card last4="0005" hide-after="1"></c2-payment-card>`)
  await page.getByRole('button', { name: 'Show details' }).click()
  await card(page).evaluate((element: Card) => element.revealFailed())
  await expect(page.getByRole('button', { name: 'Show details' })).toBeEnabled()
  await expect(card(page).locator('.digits')).toHaveText('•••• •••• •••• 0005')
  // A 15-digit number is grouped 4-6-5, as American Express prints it.
  await props(card(page), { details: { number: '378282246310005', expiry: '01/30' } })
  await expect(card(page).locator('.digits')).toHaveText('3782 822463 10005')
  await expect(page.getByRole('button', { name: 'Copy security code' })).toHaveCount(0)
  await expect(card(page).locator('.digits')).toHaveText('•••• •••• •••• 0005', { timeout: 3000 })
})

test('frozen: badged, cannot be shown, and freezing a shown card masks it; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-payment-card last4="4242"></c2-payment-card><div lang="fr"><c2-payment-card id="fr" last4="1111" frozen></c2-payment-card></div>`)
  await props(card(page).first(), { details: DETAILS })
  await props(card(page).first(), { frozen: true })
  await expect(card(page).first()).toHaveJSProperty('details', null)
  await expect(card(page).first().getByText('Frozen')).toBeVisible()
  await expect(card(page).first().getByRole('button', { name: 'Show details' })).toBeDisabled()
  await expect(page.locator('#fr').getByText('Gelée')).toBeVisible()
  await expect(page.locator('#fr').getByRole('button', { name: 'Afficher les détails' })).toBeDisabled()
  await expect(page.locator('#fr').getByText('Carte se terminant par 1111')).toBeAttached()
  await accessible(page)
})

test('details that arrive after the reveal was cancelled or on a frozen card stay hidden; copy values are no attributes', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-payment-card last4="4242"></c2-payment-card>`)
  await page.getByRole('button', { name: 'Show details' }).click()
  await card(page).evaluate((element: Card) => element.hide())
  await props(card(page), { details: DETAILS })
  await expect(card(page)).toHaveJSProperty('details', null)
  await expect(card(page).locator('.digits')).toHaveText('•••• •••• •••• 4242')
  await page.getByRole('button', { name: 'Show details' }).click()
  await props(card(page), { frozen: true })
  await props(card(page), { details: DETAILS })
  await expect(card(page)).toHaveJSProperty('details', null)
  await props(card(page), { frozen: false })
  await page.getByRole('button', { name: 'Show details' }).click()
  await props(card(page), { details: DETAILS })
  await expect(card(page).locator('.digits')).toHaveText('4242 4242 4242 4242')
  // The number and the code reach the copy buttons as properties, never as markup.
  await expect(card(page).locator('c2-copy-button[value]')).toHaveCount(0)
})
