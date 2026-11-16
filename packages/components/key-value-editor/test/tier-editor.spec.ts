import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'
import { quoteTiers } from '../src/tiers'

const PRICING = `[{"upTo":1000,"value":0.05},{"upTo":5000,"value":0.04},{"upTo":null,"value":0.03}]`

const editor = (attributes = '', children = '') => `<c2-tier-editor label="Usage pricing" ${attributes}>${children}</c2-tier-editor>`

type TierHost = HTMLElement & { tiers: unknown; entries: unknown; checkValidity(): boolean; renderPreview?: unknown }

const tiers = (page: Page) => page.locator('c2-tier-editor').evaluate((element) => (element as TierHost).tiers)
const fromCells = (page: Page) => page.locator('c2-tier-editor .row .from').allTextContents()
const preview = (page: Page) => page.locator('c2-tier-editor [part="preview"]')

/** Pastes text into the focused field through a real `paste` event carrying it, as the clipboard would. */
async function paste(page: Page, text: string) {
  await page.evaluate((data) => {
    let target = document.activeElement
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement
    const transfer = new DataTransfer()
    transfer.setData('text/plain', data)
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    if (target?.dispatchEvent(event) && target instanceof HTMLInputElement) {
      target.setRangeText(data.replace(/\r?\n/g, ''), target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end')
      target.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertFromPaste' }))
    }
  }, text)
}

test('each tier starts where the one before ends, and the last one is open', async ({ page, renderScenario }) => {
  await renderScenario(editor(`start="1" step="1" tiers='${PRICING}'`))
  expect(await fromCells(page)).toEqual(['1', '1,001', '5,001'])
  await expect(page.getByRole('textbox', { name: 'Up to, tier 2, from 1,001' })).toHaveValue('5000')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 3, from 5,001' })).toHaveAttribute('placeholder', 'No limit')
  await expect(page.getByRole('textbox', { name: 'Rate, tier 1' })).toHaveValue('0.05')
  expect(await tiers(page)).toEqual([
    { from: 1, upTo: 1000, value: 0.05 },
    { from: 1001, upTo: 5000, value: 0.04 },
    { from: 5001, upTo: null, value: 0.03 },
  ])
  // A continuous scale starts each tier at the bound before it.
  await renderScenario(editor(`tiers='${PRICING}'`))
  expect(await fromCells(page)).toEqual(['0', '1,000', '5,000'])
  await accessible(page)
})

test('editing a bound moves the start of the next tier', async ({ page, renderScenario }) => {
  await renderScenario(editor(`tiers='${PRICING}'`))
  await page.getByRole('textbox', { name: 'Up to, tier 1, from 0' }).fill('2000')
  expect(await fromCells(page)).toEqual(['0', '2,000', '5,000'])
  expect(await page.locator('c2-tier-editor').evaluate((element) => (element as TierHost).entries)).toEqual([
    { key: '2000', value: '0.05' },
    { key: '5000', value: '0.04' },
    { key: '', value: '0.03' },
  ])
})

test('graduated pricing previews each tier’s share and highlights the tiers it reaches', async ({ page, renderScenario }) => {
  await renderScenario(editor(`start="1" step="1" quantity="1200" tiers='${PRICING}'`))
  await expect(preview(page)).toHaveText(/At 1,200\s*1,000 × 0\.05 \+ 200 × 0\.04\s*= 58/)
  const rows = page.locator('c2-tier-editor .row')
  await expect(rows.nth(0)).toHaveClass(/\bused\b/)
  await expect(rows.nth(1)).toHaveClass(/\bmatch\b/)
  await expect(rows.nth(2)).not.toHaveClass(/\b(used|match)\b/)
  // The preview follows an edit.
  await page.getByRole('textbox', { name: 'Rate, tier 2' }).fill('0.03')
  await expect(preview(page)).toHaveText(/= 56/)
})

test('volume pricing applies the rate of the tier the whole quantity falls in', async ({ page, renderScenario }) => {
  await renderScenario(editor(`pricing="volume" start="1" step="1" quantity="1200" total-format='{"style":"currency","currency":"USD"}' tiers='${PRICING}'`))
  await expect(preview(page)).toHaveText(/At 1,200\s*1,200 × 0\.04\s*= \$48\.00/)
  const rows = page.locator('c2-tier-editor .row')
  await expect(rows.nth(0)).not.toHaveClass(/\bused\b/)
  await expect(rows.nth(1)).toHaveClass(/\bmatch\b/)
})

test('percentages count as factors, and a grade shows as the value of its tier', async ({ page, renderScenario }) => {
  await renderScenario(editor(`quantity="150000" tiers='[{"upTo":100000,"value":"5%"},{"upTo":null,"value":"8%"}]'`))
  await expect(preview(page)).toHaveText(/100,000 × 5% \+ 50,000 × 8%\s*= 9,000/)
  await renderScenario(
    editor(`pricing="volume" quantity="72" tiers='[{"upTo":59,"value":"F"},{"upTo":69,"value":"D"},{"upTo":79,"value":"C"},{"upTo":null,"value":"B"}]'`),
  )
  await expect(preview(page)).toHaveText(/At 72\s*tier 3: C/)
})

test('a quantity above a closed last tier is covered by no tier', async ({ page, renderScenario }) => {
  await renderScenario(editor(`quantity="9000" tiers='[{"upTo":1000,"value":1},{"upTo":5000,"value":2}]'`))
  await expect(preview(page)).toHaveText('No tier covers 9,000.')
})

test('renderPreview replaces the preview line', async ({ page, renderScenario }) => {
  await renderScenario(editor(`quantity="1200" tiers='${PRICING}'`))
  await page.locator('c2-tier-editor').evaluate((element) => {
    ;(element as TierHost).renderPreview = ({ quote, formatTotal }: { quote: { total: number }; formatTotal: (value: number) => string }) =>
      `Estimated: ${formatTotal(quote.total)}`
  })
  await expect(preview(page)).toHaveText('Estimated: 58')
})

test('bounds out of order, not numbers or open before the last tier are refused', async ({ page, renderScenario }) => {
  await renderScenario(
    editor(`quantity="10" tiers='[{"upTo":1000,"value":1},{"upTo":800,"value":2},{"upTo":null,"value":3},{"upTo":"abc","value":4},{"upTo":null,"value":5}]'`),
  )
  const host = page.locator('c2-tier-editor')
  await expect(host).toHaveState('invalid')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' })).toHaveAccessibleDescription('Must be above 1,000.')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 3, from 1,000' })).toHaveAccessibleDescription('Only the last tier can have no limit.')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 4, from 1,000' })).toHaveAccessibleDescription('Enter a number.')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 5, from 1,000' })).not.toHaveAttribute('aria-invalid', 'true')
  expect(await host.evaluate((element) => (element as TierHost).checkValidity())).toBe(false)
  // No preview over refused tiers.
  await expect(preview(page)).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' }).fill('2000')
  await page.getByRole('textbox', { name: 'Up to, tier 3, from 2,000' }).fill('3000')
  await page.getByRole('textbox', { name: 'Up to, tier 4, from 3,000' }).fill('4000')
  await expect(host).not.toHaveState('invalid')
  expect(await host.evaluate((element) => (element as TierHost).checkValidity())).toBe(true)
  await expect(preview(page)).toHaveCount(1)
})

test('typing builds the tiers from the keyboard, and Add tier goes above the open last tier', async ({ page, renderScenario }) => {
  await renderScenario(editor())
  const host = page.locator('c2-tier-editor')
  await expect(host).toHaveState('empty')
  // The one blank row is the open tier.
  await page.getByRole('textbox', { name: 'Rate, tier 1' }).click()
  await page.keyboard.type('0.03')
  await expect(host).not.toHaveState('empty')
  await page.getByRole('button', { name: 'Add tier' }).click()
  await expect(page.getByRole('textbox', { name: 'Up to, tier 1, from 0' })).toBeFocused()
  // A tier just added is not refused before it is typed into.
  await expect(host).not.toHaveState('invalid')
  await page.keyboard.type('1000')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Rate, tier 1' })).toBeFocused()
  await page.keyboard.type('0.05')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' })).toBeFocused()
  expect(await tiers(page)).toEqual([
    { from: 0, upTo: 1000, value: 0.05 },
    { from: 1000, upTo: null, value: 0.03 },
  ])
  // Enter on the last rate adds a tier above the open one.
  await page.getByRole('textbox', { name: 'Rate, tier 2' }).press('Enter')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Rate, tier 3' })).toHaveValue('0.03')
  // Backspace in that empty tier removes it again.
  await page.keyboard.press('Backspace')
  await expect(page.getByRole('textbox', { name: 'Rate, tier 3' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Rate, tier 1' })).toBeFocused()
})

test('the remove button drops a tier and the next one takes over its start', async ({ page, renderScenario }) => {
  await renderScenario(editor(`tiers='${PRICING}'`))
  await page.getByRole('button', { name: 'Remove tier 2' }).click()
  expect(await fromCells(page)).toEqual(['0', '1,000'])
  await expect(page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' })).toBeFocused()
})

test('spreadsheet lines paste as tiers', async ({ page, renderScenario }) => {
  await renderScenario(editor())
  await page.getByRole('textbox', { name: 'Up to, tier 1, from 0' }).click()
  await paste(page, '1\t1000\t0.05\n1001\t5000\t0.04\n5001\t\t0.03\n')
  expect(await tiers(page)).toEqual([
    { from: 0, upTo: 1000, value: 0.05 },
    { from: 1000, upTo: 5000, value: 0.04 },
    { from: 5000, upTo: null, value: 0.03 },
  ])
  await expect(page.getByRole('textbox', { name: 'Rate, tier 3' })).toBeFocused()
  // Text without tabs stays text.
  await page.getByRole('textbox', { name: 'Up to, tier 3, from 5,000' }).click()
  await paste(page, '9000')
  await expect(page.getByRole('textbox', { name: 'Up to, tier 3, from 5,000' })).toHaveValue('9000')
})

test('submits the tiers as JSON, resets with its form and restores required', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${editor(`name="pricing" required tiers='[{"upTo":1000,"value":0.05},{"upTo":null,"value":0.03}]'`)}</form>`)
  const form = page.locator('form')
  const submitted = () => form.evaluate((element) => new FormData(element as HTMLFormElement).get('pricing'))
  expect(JSON.parse(String(await submitted()))).toEqual([
    { upTo: 1000, value: 0.05 },
    { upTo: null, value: 0.03 },
  ])
  await page.getByRole('textbox', { name: 'Rate, tier 2' }).fill('2.5%')
  expect(JSON.parse(String(await submitted()))).toEqual([
    { upTo: 1000, value: 0.05 },
    { upTo: null, value: '2.5%' },
  ])
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(page.getByRole('textbox', { name: 'Rate, tier 2' })).toHaveValue('0.03')
  const host = page.locator('c2-tier-editor')
  await page.getByRole('button', { name: 'Remove tier 2' }).click()
  await page.getByRole('button', { name: 'Remove tier 1' }).click()
  expect(await host.evaluate((element) => (element as TierHost).checkValidity())).toBe(false)
  expect(await host.evaluate((element) => (element as unknown as { validationMessage: string }).validationMessage)).toBe('Please add at least one tier.')
})

test('view mode lists each tier as its range and rate', async ({ page, renderScenario }) => {
  await renderScenario(editor(`mode="view" tiers='[{"upTo":1000,"value":"5%"},{"upTo":5000,"value":"7%"},{"upTo":null,"value":"9%"}]'`))
  const terms = page.locator('c2-tier-editor dt')
  await expect(terms).toHaveCount(3)
  await expect(terms.nth(0)).toHaveText(/0\s*to 1,000/)
  await expect(terms.nth(2)).toHaveText(/5,000\s*to No limit/)
  await expect(page.locator('c2-tier-editor dd').nth(1)).toHaveText('7%')
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await accessible(page)
  await renderScenario(editor('mode="view"'))
  await expect(page.locator('c2-tier-editor .empty')).toHaveText('No tiers')
})

test('lock-keys fixes the bounds so only the rates change', async ({ page, renderScenario }) => {
  await renderScenario(editor(`lock-keys tiers='${PRICING}'`))
  await expect(page.locator('c2-tier-editor .key.locked')).toHaveText(['1000', '5000', 'No limit'])
  await expect(page.getByRole('button', { name: /Remove tier|Add tier/ })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Rate, tier 3' }).fill('0.02')
  expect(await tiers(page)).toEqual([
    { from: 0, upTo: 1000, value: 0.05 },
    { from: 1000, upTo: 5000, value: 0.04 },
    { from: 5000, upTo: null, value: 0.02 },
  ])
  await accessible(page)
})

test('the text follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${editor(`quantity="1200" tiers='${PRICING}'`)}</div>`)
  await expect(page.locator('c2-tier-editor .header')).toHaveText(/De\s*Jusqu'à\s*Taux/)
  await expect(page.getByRole('textbox', { name: "Jusqu'à, palier 2, à partir de 1\u202f000" })).toHaveValue('5000')
  await expect(preview(page)).toHaveText(/Pour 1\u202f200/)
  await expect(page.getByRole('button', { name: 'Ajouter un palier' })).toBeVisible()
})

test('key-label and value-label rename the columns and the fields', async ({ page, renderScenario }) => {
  await renderScenario(editor(`key-label="Revenue up to" value-label="Commission" add-label="Add band" tiers='${PRICING}'`))
  await expect(page.locator('c2-tier-editor .header')).toHaveText(/From\s*Revenue up to\s*Commission/)
  await expect(page.getByRole('textbox', { name: 'Commission, tier 1' })).toHaveValue('0.05')
  await expect(page.getByRole('button', { name: 'Add band' })).toBeVisible()
})

test('disabled turns off every control', async ({ page, renderScenario }) => {
  await renderScenario(editor(`disabled tiers='${PRICING}'`))
  for (const field of await page.getByRole('textbox').all()) await expect(field).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add tier' })).toBeDisabled()
  await expect(page.locator('c2-tier-editor')).toHaveState('disabled')
})

test('bounds written the way the language writes numbers are read as numbers', async ({ page, renderScenario }) => {
  await renderScenario(editor(`tiers='${PRICING}'`))
  await page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' }).fill('7,500')
  await expect(page.locator('c2-tier-editor')).not.toHaveState('invalid')
  expect(((await tiers(page)) as { upTo: number | null }[]).map((tier) => tier.upTo)).toEqual([1000, 7500, null])
  await renderScenario(`<div lang="fr">${editor(`tiers='${PRICING}'`)}</div>`)
  await page.getByRole('textbox', { name: 'Taux, palier 1' }).fill('0,06')
  expect(((await tiers(page)) as { value: unknown }[])[0].value).toBe(0.06)
})

test('with a step, a bound must reach its tier’s first value', async ({ page, renderScenario }) => {
  await renderScenario(editor(`start="1" step="1" tiers='[{"upTo":1000,"value":1},{"upTo":1000.5,"value":2},{"upTo":null,"value":3}]'`))
  await expect(page.getByRole('textbox', { name: 'Up to, tier 2, from 1,001' })).toHaveAccessibleDescription('Must be at least 1,001.')
})

test('a refused bound is submitted as typed, never as an open tier', async ({ page, renderScenario }) => {
  await renderScenario(`<form novalidate>${editor(`name="pricing" tiers='[{"upTo":"1k","value":0.05},{"upTo":null,"value":0.03}]'`)}</form>`)
  const value = await page.locator('form').evaluate((element) => new FormData(element as HTMLFormElement).get('pricing'))
  expect(JSON.parse(String(value))).toEqual([
    { upTo: '1k', value: 0.05 },
    { upTo: null, value: 0.03 },
  ])
})

test('lines pasted into the open last tier go above it', async ({ page, renderScenario }) => {
  await renderScenario(editor(`tiers='[{"upTo":1000,"value":0.05},{"upTo":null,"value":0.03}]'`))
  await page.getByRole('textbox', { name: 'Up to, tier 2, from 1,000' }).click()
  await paste(page, '5000\t0.04\n10000\t0.035')
  expect(((await tiers(page)) as { upTo: number | null }[]).map((tier) => tier.upTo)).toEqual([1000, 5000, 10000, null])
  await expect(page.locator('c2-tier-editor')).not.toHaveState('invalid')
})

test('quoteTiers prices graduated and volume tiers', () => {
  const list = [
    { upTo: 1000, value: 0.05 },
    { upTo: 5000, value: 0.04 },
    { upTo: null, value: 0.03 },
  ]
  expect(quoteTiers(list, 6000, { start: 1, step: 1 })).toMatchObject({
    tier: 2,
    terms: [
      { tier: 0, units: 1000 },
      { tier: 1, units: 4000 },
      { tier: 2, units: 1000 },
    ],
  })
  expect(quoteTiers(list, 6000, { start: 1, step: 1 }).total).toBeCloseTo(240)
  expect(quoteTiers(list, 6000, { pricing: 'volume' }).total).toBeCloseTo(180)
  expect(quoteTiers(list, 1000, { pricing: 'volume' }).tier).toBe(0)
  expect(quoteTiers(list, 0).total).toBe(0)
  expect(quoteTiers(list.slice(0, 2), 9000)).toMatchObject({ tier: -1, total: null })
  expect(quoteTiers([{ upTo: null, value: 'A' }], 5).total).toBeNull()
  expect(quoteTiers([{ upTo: null, value: '10%' }], 50).total).toBeCloseTo(5)
  // Below the first tier's first value no tier applies.
  expect(quoteTiers(list, 50, { start: 100, pricing: 'volume' })).toMatchObject({ tier: -1, total: null })
})
