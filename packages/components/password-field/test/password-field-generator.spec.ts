import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Field = HTMLElement & {
  value: string
  generate(options?: Record<string, unknown>): Promise<string>
  showGenerator(): Promise<void>
  generatorOptions?: Record<string, unknown>
}

const suggestion = (page: Page) => page.locator('.generator-text')
const events = async (page: Page) => JSON.parse((await page.locator('c2-password-field').getAttribute('data-events')) ?? '[]')

test('without generator there is no generate button and nothing is loaded', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field></c2-password-field>')
  await expect(page.getByRole('button', { name: 'Show password' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Generate password' })).toHaveCount(0)
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => /generator-panel|password-generator/.test(entry.name)))
  expect(loaded).toBe(false)
})

test('the generate button opens the generator, and Use password fills the field', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-password-field name="pw" generator autocomplete="new-password"></c2-password-field></form>')
  const host = page.locator('c2-password-field')
  await host.evaluate((el) => {
    const seen: string[] = []
    for (const type of ['input', 'change'])
      el.addEventListener(type, () => {
        seen.push(type)
        el.setAttribute('data-events', JSON.stringify(seen))
      })
  })
  const generate = page.getByRole('button', { name: 'Generate password' })
  await expect(generate).toHaveAttribute('aria-expanded', 'false')
  await generate.click()

  const dialog = page.getByRole('dialog', { name: 'Generate password' })
  await expect(dialog).toBeVisible()
  await expect(generate).toHaveAttribute('aria-expanded', 'true')
  await expect(suggestion(page)).toHaveText(/^.{16}$/)
  const text = (await suggestion(page).textContent()) ?? ''
  // Every class is on by default, and each appears at least once.
  expect(text).toMatch(/[a-z]/)
  expect(text).toMatch(/[A-Z]/)
  expect(text).toMatch(/[0-9]/)
  expect(text).toMatch(/[^A-Za-z0-9]/)
  await expect(dialog.getByRole('meter', { name: 'Strength of the suggestion' })).toHaveAttribute('aria-valuetext', 'Strong')
  await expect(dialog).toContainText('about 99 bits')

  const use = dialog.getByRole('button', { name: 'Use password' })
  await expect(use).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  const input = page.getByLabel('Password', { exact: true })
  await expect(input).toHaveValue(text)
  await expect(input).toBeFocused()
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('pw'))).toBe(text)
  expect(await events(page)).toEqual(['input', 'change'])
})

test('each opening and Generate another draw a new suggestion', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator></c2-password-field>')
  await page.getByRole('button', { name: 'Generate password' }).click()
  await expect(suggestion(page)).not.toHaveText('')
  const first = await suggestion(page).textContent()
  await page.getByRole('button', { name: 'Generate another' }).click()
  await expect(suggestion(page)).not.toHaveText(first ?? '')
  const second = await suggestion(page).textContent()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Generate password' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(suggestion(page)).not.toHaveText(second ?? '')
  // A press on the generate button while open closes it, rather than closing and opening again.
  await page.getByRole('button', { name: 'Generate password' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('a press outside closes the generator and leaves focus where it landed', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator></c2-password-field><input aria-label="Other" />')
  await page.getByRole('button', { name: 'Generate password' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('textbox', { name: 'Other' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Other' })).toBeFocused()
})

test('the length slider and the character classes shape the suggestion', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator></c2-password-field>')
  await page.getByRole('button', { name: 'Generate password' }).click()
  const dialog = page.getByRole('dialog', { name: 'Generate password' })
  const slider = dialog.getByRole('slider', { name: 'Length' })
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(suggestion(page)).toHaveText(/^.{18}$/)

  await dialog.getByRole('checkbox', { name: 'Symbols (!@#)' }).click()
  await dialog.getByRole('checkbox', { name: 'Numbers (0–9)' }).click()
  await dialog.getByRole('checkbox', { name: 'Uppercase (A–Z)' }).click()
  await expect(suggestion(page)).toHaveText(/^[a-z]{18}$/)
  // The last class left cannot be switched off.
  await expect(dialog.getByRole('checkbox', { name: 'Lowercase (a–z)' })).toBeDisabled()
})

test('a passphrase joins random words with the chosen separator', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator></c2-password-field>')
  await page.getByRole('button', { name: 'Generate password' }).click()
  const dialog = page.getByRole('dialog', { name: 'Generate password' })
  await dialog.getByRole('button', { name: 'Passphrase' }).click()
  await expect(suggestion(page)).toHaveText(/^[a-z]+(-[a-z]+){4}$/)
  await expect(dialog).toContainText('about 52 bits')

  const words = dialog.getByRole('slider', { name: 'Words' })
  await words.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(suggestion(page)).toHaveText(/^[a-z]+(-[a-z]+){3}$/)
  await dialog.getByRole('button', { name: '.', exact: true }).click()
  await dialog.getByRole('checkbox', { name: 'Capitalize words' }).click()
  await dialog.getByRole('checkbox', { name: 'Include a number' }).click()
  await expect(suggestion(page)).toHaveText(/^[A-Z][a-z]*\d?(\.[A-Z][a-z]*\d?){3}$/)
  await expect(suggestion(page)).toHaveText(/\d/)
})

test('suggestions meet minlength, maxlength and the requirements', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator requirements="length;uppercase;number;symbol" minlength="20" maxlength="24"></c2-password-field>')
  const host = page.locator('c2-password-field')
  const values = await host.evaluate(async (el) => Promise.all(Array.from({ length: 20 }, () => (el as Field).generate({ length: 8 }))))
  for (const value of values) {
    expect(value).toHaveLength(20)
    expect(value).toMatch(/[A-Z]/)
    expect(value).toMatch(/[0-9]/)
    expect(value).toMatch(/[^A-Za-z0-9]/)
  }
  expect(await host.evaluate((el) => (el as Field).value)).toBe('')

  await page.getByRole('button', { name: 'Generate password' }).click()
  const dialog = page.getByRole('dialog', { name: 'Generate password' })
  // The classes a requirement asks for stay on.
  await expect(dialog.getByRole('checkbox', { name: 'Uppercase (A–Z)' })).toBeDisabled()
  await expect(dialog.getByRole('checkbox', { name: 'Uppercase (A–Z)' })).toBeChecked()
  await expect(dialog.getByRole('checkbox', { name: 'Lowercase (a–z)' })).toBeEnabled()
  await expect(dialog.getByRole('slider', { name: 'Length' })).toHaveAttribute('max', '24')
  await dialog.getByRole('button', { name: 'Use password' }).click()
  expect(await host.evaluate((el) => (el as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
  expect(await host.evaluate((el) => el.matches(':state(requirements-met)'))).toBe(true)
})

test('generator-options sets where the generator starts, and an own word list replaces the built-in one', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-password-field generator generator-options='{"kind":"passphrase","words":3,"separator":"+"}'></c2-password-field>`)
  const host = page.locator('c2-password-field')
  expect(await host.evaluate((el) => (el as Field).generate({ wordList: ['alpha', 'beta'] }))).toMatch(/^(alpha|beta)(\+(alpha|beta)){2}$/)
  await page.getByRole('button', { name: 'Generate password' }).click()
  await expect(suggestion(page)).toHaveText(/^[a-z]+(\+[a-z]+){2}$/)
  // A separator of the app's own is offered beside the built-in ones, pressed.
  await expect(page.getByRole('button', { name: '+', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test('every draw comes from crypto.getRandomValues, never Math.random', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator></c2-password-field>')
  const counts = await page.locator('c2-password-field').evaluate(async (el) => {
    const calls = { crypto: 0, math: 0 }
    const getRandomValues = crypto.getRandomValues.bind(crypto)
    const random = Math.random
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T) => {
      calls.crypto++
      return getRandomValues(array as never) as T
    }) as typeof crypto.getRandomValues
    Math.random = () => {
      calls.math++
      return random()
    }
    try {
      await (el as Field).generate()
      await (el as Field).generate({ kind: 'passphrase' })
    } finally {
      crypto.getRandomValues = getRandomValues
      Math.random = random
    }
    return calls
  })
  expect(counts.crypto).toBeGreaterThanOrEqual(21)
  expect(counts.math).toBe(0)
})

test('a disabled field disables the generate button', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator disabled></c2-password-field>')
  await expect(page.getByRole('button', { name: 'Generate password' })).toBeDisabled()
})

test('disabling the field closes an open generator', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator></c2-password-field>')
  await page.getByRole('button', { name: 'Generate password' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.locator('c2-password-field').evaluate((el) => el.setAttribute('disabled', ''))
  await expect(page.getByRole('dialog')).toBeHidden()
})

test('the generator speaks the language of the page', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-password-field generator aria-label="Nouveau mot de passe"></c2-password-field></div>')
  await page.getByRole('button', { name: 'Générer un mot de passe' }).click()
  const dialog = page.getByRole('dialog', { name: 'Générer un mot de passe' })
  await expect(dialog.getByRole('button', { name: 'Utiliser ce mot de passe' })).toBeVisible()
  await expect(dialog.getByRole('slider', { name: 'Longueur' })).toBeVisible()
  await expect(dialog).toContainText('environ 99 bits')
})

test('the open generator has no accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field generator aria-label="New password" meter></c2-password-field>')
  await page.getByRole('button', { name: 'Generate password' }).click()
  await expect(suggestion(page)).not.toHaveText('')
  await accessible(page)
  await page.getByRole('button', { name: 'Passphrase' }).click()
  await expect(page.getByRole('slider', { name: 'Words' })).toBeVisible()
  await accessible(page)
})
