import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type MaskInputElement = HTMLElement & { value: string; formattedValue: string; complete: boolean; validity: ValidityState; checkValidity(): boolean }

const events = async (page: Page, selector = 'c2-mask-input') => JSON.parse((await page.locator(selector).first().getAttribute('data-events')) ?? '[]')
const value = (page: Page) =>
  page
    .locator('c2-mask-input')
    .first()
    .evaluate((el) => (el as MaskInputElement).value)

test('typing inserts the literals and drops what a position does not accept', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="99/99" aria-label="Expiry"></c2-mask-input>')
  const input = page.getByRole('textbox', { name: 'Expiry' })
  await input.click()
  await page.keyboard.type('1a2')
  await expect(input).toHaveValue('12')
  await page.keyboard.type('x34')
  await expect(input).toHaveValue('12/34')
  await page.keyboard.type('5')
  await expect(input).toHaveValue('12/34')
  expect(await value(page)).toBe('1234')
})

test('leading literals, upper-case tokens and an escaped mask character', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="\\9-AA 999" aria-label="Plate"></c2-mask-input>')
  const input = page.getByRole('textbox', { name: 'Plate' })
  await input.click()
  await page.keyboard.type('ab123')
  await expect(input).toHaveValue('9-AB 123')
  expect(await value(page)).toBe('AB123')
})

test('backspace across a literal deletes the character before it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="999-999" aria-label="Code" value="123456"></c2-mask-input>')
  const input = page.getByRole('textbox', { name: 'Code' })
  await expect(input).toHaveValue('123-456')
  await input.click()
  await page.keyboard.press('End')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
  // The caret sits after the dash: backspace removes the 3, and the rest moves up.
  await page.keyboard.press('Backspace')
  await expect(input).toHaveValue('124-56')
  expect(await input.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(2)
  await page.keyboard.press('End')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(input).toHaveValue('124')
})

test('typing in the middle shifts the following characters', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="99 99 99" aria-label="Sort code" value="1234"></c2-mask-input>')
  const input = page.getByRole('textbox', { name: 'Sort code' })
  await input.click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.type('9')
  await expect(input).toHaveValue('19 23 4')
  // The caret follows the typed character, past the space the field inserted.
  expect(await input.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(3)
})

test('a pasted formatted or unformatted value is fitted to the mask', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="+1 (999) 999-9999" aria-label="Phone"></c2-mask-input>')
  const input = page.getByRole('textbox', { name: 'Phone' })
  await input.click()
  await page.keyboard.insertText('5551234567')
  await expect(input).toHaveValue('+1 (555) 123-4567')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.insertText('+1 (212) 555-0100')
  await expect(input).toHaveValue('+1 (212) 555-0100')
  expect(await value(page)).toBe('2125550100')
})

test('include-literals keeps the formatted text in value and the form', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-mask-input mask="99/99" name="exp" include-literals value="1226" aria-label="Expiry"></c2-mask-input></form>')
  expect(await value(page)).toBe('12/26')
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('exp'))).toBe('12/26')
})

test('the rest of the mask shows behind the text', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="99/99" placeholder="MM/YY" slot-char="•"></c2-mask-input>')
  const input = page.getByRole('textbox', { name: 'MM/YY' })
  const slots = page.locator('c2-mask-input .slots')
  await expect(input).toHaveAttribute('placeholder', 'MM/YY')
  await input.click()
  await expect(slots).toHaveText('••/••')
  await expect(input).not.toHaveAttribute('placeholder')
  await page.keyboard.type('1')
  await expect(slots).toHaveText('1•/••')
  await expect(page.locator('c2-mask-input .typed')).toHaveText('1')
})

test('complete fires once the required part is filled; the optional part may stay empty', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="AA99 XXXX?XXXX" aria-label="Reference"></c2-mask-input>')
  const host = page.locator('c2-mask-input')
  await watch(host, 'complete')
  const input = page.getByRole('textbox', { name: 'Reference' })
  await input.click()
  await page.keyboard.type('fr76ab1')
  expect(await host.evaluate((el) => (el as MaskInputElement).complete)).toBe(false)
  expect(await host.evaluate((el) => (el as MaskInputElement).checkValidity())).toBe(false)
  await page.keyboard.type('c')
  await expect(input).toHaveValue('FR76 AB1C')
  expect(await host.evaluate((el) => el.matches(':state(complete)'))).toBe(true)
  expect(await host.evaluate((el) => (el as MaskInputElement).checkValidity())).toBe(true)
  await page.keyboard.type('d')
  expect(await events(page)).toEqual([{ value: 'FR76AB1C', formattedValue: 'FR76 AB1C' }])
  await expect(input).toHaveValue('FR76 AB1CD')
})

test('an incomplete value is invalid, and required checks for a value', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-mask-input mask="99999" name="zip" required aria-label="ZIP"></c2-mask-input></form>')
  const host = page.locator('c2-mask-input')
  const validity = () => host.evaluate((el) => ({ valid: (el as MaskInputElement).validity.valid, missing: (el as MaskInputElement).validity.valueMissing }))
  expect(await validity()).toEqual({ valid: false, missing: true })
  await page.getByRole('textbox', { name: 'ZIP' }).click()
  await page.keyboard.type('941')
  expect(await validity()).toEqual({ valid: false, missing: false })
  expect(await host.evaluate((el) => (el as HTMLElement & { validationMessage: string }).validationMessage)).toBe('Enter a value in the format _____.')
  await page.keyboard.type('03')
  expect(await validity()).toEqual({ valid: true, missing: false })
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('zip'))).toBe('94103')
})

test('input follows each edit and change fires once per committed value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="999" aria-label="Code"></c2-mask-input>')
  const seen = await page.locator('c2-mask-input').evaluateHandle((el) => {
    const log: string[] = []
    el.addEventListener('input', () => log.push(`input:${(el as MaskInputElement).value}`))
    el.addEventListener('change', () => log.push(`change:${(el as MaskInputElement).value}`))
    return log
  })
  await page.getByRole('textbox', { name: 'Code' }).click()
  await page.keyboard.type('12')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  // Enter commits the value; leaving the field with nothing new to commit fires nothing more.
  expect(await seen.jsonValue()).toEqual(['input:1', 'input:12', 'change:12'])
  await page.getByRole('textbox', { name: 'Code' }).click()
  await page.keyboard.type('3')
  await page.keyboard.press('Tab')
  expect(await seen.jsonValue()).toEqual(['input:1', 'input:12', 'change:12', 'input:123', 'change:123'])
})

test('a digits-only mask asks for the numeric keyboard', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="9999" aria-label="PIN"></c2-mask-input><c2-mask-input mask="A9A 9A9" aria-label="Postcode"></c2-mask-input>')
  await expect(page.getByRole('textbox', { name: 'PIN' })).toHaveAttribute('inputmode', 'numeric')
  await expect(page.getByRole('textbox', { name: 'Postcode' })).toHaveAttribute('inputmode', 'text')
})

test('tokens add mask characters of your own', async ({ page, renderScenario }) => {
  await renderScenario('<c2-mask-input mask="HH:HH:HH" aria-label="Colour"></c2-mask-input>')
  await page.locator('c2-mask-input').evaluate(async (el) => {
    const field = el as HTMLElement & { tokens: unknown; updateComplete: Promise<boolean> }
    field.tokens = { H: { pattern: /^[0-9a-f]$/i, transform: (char: string) => char.toUpperCase() } }
    await field.updateComplete
  })
  const input = page.getByRole('textbox', { name: 'Colour' })
  await input.click()
  await page.keyboard.type('a0zf3c')
  await expect(input).toHaveValue('A0:F3:C')
})

test('disabled and read-only fields cannot be edited', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-mask-input mask="999" disabled aria-label="Off"></c2-mask-input><c2-mask-input mask="999" readonly value="123" aria-label="Fixed"></c2-mask-input>',
  )
  await expect(page.getByRole('textbox', { name: 'Off' })).toBeDisabled()
  const fixed = page.getByRole('textbox', { name: 'Fixed' })
  await expect(fixed).toHaveAttribute('readonly', '')
  await fixed.click()
  await page.keyboard.type('4')
  await expect(fixed).toHaveValue('123')
})

test('has no accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-mask-input mask="99999" placeholder="ZIP code" help="Five digits."></c2-mask-input><c2-mask-input mask="AA99 9999 9999 9999 9999 99" aria-label="IBAN" value="DE89370400440532013000"></c2-mask-input><c2-mask-input mask="99/99" aria-label="Expiry" error error-text="The card has expired." value="0120"></c2-mask-input>',
  )
  await accessible(page)
})
