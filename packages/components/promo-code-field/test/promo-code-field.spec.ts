import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Field = HTMLElement & { validate?: (code: string) => Promise<unknown>; codes: unknown[] }

const field = (page: Page) => page.locator('c2-promo-code-field')
const events = async (page: Page) => JSON.parse((await field(page).getAttribute('data-events')) ?? '[]')
const input = (page: Page, name = 'Promo code') => page.getByRole('textbox', { name })

test('Enter applies an upper-cased code; at the limit the field gives way to its token', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-promo-code-field></c2-promo-code-field>`)
  await expect(field(page)).toHaveHostAria('aria-label', 'Promo code')
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled()
  await watch(field(page), 'apply')
  await input(page).pressSequentially(' spring20 ')
  await page.keyboard.press('Enter')
  await expect.poll(() => events(page)).toEqual([{ code: 'SPRING20' }])
  await expect(field(page).getByRole('list', { name: 'Applied codes' }).getByRole('listitem')).toHaveText(['SPRING20'])
  await expect(input(page)).toHaveCount(0)
  await expect(field(page).locator('.announce')).toHaveText('SPRING20 applied')
  await expect(field(page)).toHaveJSProperty('codes', [{ code: 'SPRING20' }])
  await accessible(page)
})

test('validate: the field waits, shows a refusal under itself, then keeps the accepted code with its saving', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-promo-code-field max="2"></c2-promo-code-field>`)
  await field(page).evaluate((element: Field) => {
    element.validate = (code) =>
      new Promise((resolve) => {
        ;(window as unknown as { answer: (value: unknown) => void }).answer = resolve
        if (code === 'NOPE') resolve({ error: 'This code expired on 1 March.' })
      })
  })
  await watch(field(page), 'reject')
  await input(page).fill('nope')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(field(page).getByText('This code expired on 1 March.')).toBeVisible()
  await expect.poll(() => events(page)).toEqual([{ code: 'NOPE', error: 'This code expired on 1 March.' }])
  await expect(field(page).locator('c2-text-field')).toHaveAttribute('error', '')
  await input(page).fill('spring20')
  await expect(field(page).getByText('This code expired on 1 March.')).toHaveCount(0)
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(field(page).locator('c2-text-field')).toHaveJSProperty('readOnly', true)
  await expect(field(page).locator('c2-button.apply')).toHaveAttribute('running', '')
  await page.evaluate(() => (window as unknown as { answer: (value: unknown) => void }).answer({ code: 'SPRING20', label: '−$12.00' }))
  await expect(field(page).getByRole('listitem')).toHaveText(['SPRING20−$12.00'])
  await expect(field(page).locator('.announce')).toHaveText('SPRING20 applied: −$12.00')
  // One more may apply, but not the same one, and that is refused without asking the server.
  await input(page).fill('Spring20')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(field(page).getByText('SPRING20 is already applied')).toBeVisible()
  await accessible(page)
})

test('removing a token fires remove, without the chip’s own event leaking out, and brings the field back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-promo-code-field codes='[{"code":"SPRING20","label":"−20%"}]'></c2-promo-code-field>`)
  await page
    .locator('main')
    .evaluate((main) => main.addEventListener('remove', (event) => main.setAttribute('data-bubbled', JSON.stringify((event as CustomEvent).detail))))
  await watch(field(page), 'remove')
  await expect(input(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'Remove SPRING20' }).click()
  await expect.poll(() => events(page)).toEqual([{ code: 'SPRING20' }])
  await expect(page.locator('main')).not.toHaveAttribute('data-bubbled')
  await expect(input(page)).toBeFocused()
  await expect(field(page).locator('.announce')).toHaveText('SPRING20 removed')
})

test('collapsed opens from its link into a focused field; case-sensitive keeps the case; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-promo-code-field collapsed case-sensitive></c2-promo-code-field><div lang="fr"><c2-promo-code-field id="fr"></c2-promo-code-field></div>`,
  )
  await expect(input(page)).toHaveCount(0)
  await field(page).first().getByText('Add a promo code').click()
  await expect(input(page)).toBeFocused()
  await page.keyboard.type('Friend-abc')
  await page.keyboard.press('Enter')
  await expect(field(page).first().getByRole('listitem')).toHaveText(['Friend-abc'])
  await expect(page.locator('#fr').getByRole('button', { name: 'Appliquer' })).toBeVisible()
  await expect(input(page, 'Code promo')).toBeVisible()
  await props(page.locator('#fr'), { disabled: true })
  await expect(page.locator('#fr').getByRole('button', { name: 'Appliquer' })).toBeDisabled()
  await accessible(page)
})
