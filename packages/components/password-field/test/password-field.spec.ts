import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const events = async (page: Page) => JSON.parse((await page.locator('c2-password-field').getAttribute('data-events')) ?? '[]')

test('the toggle shows and hides the password and keeps focus in the field', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field placeholder="Password"></c2-password-field>')
  const host = page.locator('c2-password-field')
  await watch(host, 'reveal-change')
  const input = page.getByLabel('Password', { exact: true })
  await input.click()
  await page.keyboard.type('hunter2')
  await expect(input).toHaveAttribute('type', 'password')

  const toggle = page.getByRole('button', { name: 'Show password' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(input).toHaveAttribute('type', 'text')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('hunter2')

  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(input).toHaveAttribute('type', 'password')
  expect(await events(page)).toEqual([{ revealed: true }, { revealed: false }])
})

test('hide-toggle removes the button and disabled disables it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field hide-toggle></c2-password-field><c2-password-field disabled aria-label="Old"></c2-password-field>')
  await expect(page.getByRole('button', { name: 'Show password' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Show password' })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: 'Old' })).toBeDisabled()
})

test('the requirements checklist ticks each rule as it is met', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field requirements="length;uppercase;number;symbol" minlength="10"></c2-password-field>')
  const list = page.getByRole('list', { name: 'Password requirements' })
  await expect(list.getByRole('listitem')).toHaveText([
    'At least 10 characters, not met',
    'One uppercase letter, not met',
    'One number, not met',
    'One symbol, not met',
  ])

  await page.getByLabel('Password', { exact: true }).click()
  await page.keyboard.type('Abc1')
  await expect(list.getByRole('listitem')).toHaveText([
    'At least 10 characters, not met',
    'One uppercase letter, met',
    'One number, met',
    'One symbol, not met',
  ])
  expect(await page.locator('c2-password-field').evaluate((el) => (el as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)

  await page.keyboard.type('defgh!jk')
  await expect(list.getByRole('listitem')).toHaveText(['At least 10 characters, met', 'One uppercase letter, met', 'One number, met', 'One symbol, met'])
  expect(await page.locator('c2-password-field').evaluate((el) => el.matches(':state(requirements-met)'))).toBe(true)
  expect(await page.locator('c2-password-field').evaluate((el) => (el as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})

test('requirements of your own come from script', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field></c2-password-field>')
  await page.locator('c2-password-field').evaluate(async (el) => {
    const field = el as HTMLElement & { requirements: unknown[]; updateComplete: Promise<boolean> }
    field.requirements = [
      { id: 'number', label: 'Eine Ziffer' },
      { label: 'No spaces', test: (value: string) => !!value && !/\s/.test(value) },
      { label: 'Starts with a letter', pattern: '^\\p{L}' },
    ]
    await field.updateComplete
  })
  await page.getByLabel('Password', { exact: true }).click()
  await page.keyboard.type('a 1')
  await expect(page.getByRole('listitem')).toHaveText(['Eine Ziffer, met', 'No spaces, not met', 'Starts with a letter, met'])
})

test('the meter rates the password and fires strength-change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field meter autocomplete="new-password"></c2-password-field>')
  const host = page.locator('c2-password-field')
  await watch(host, 'strength-change')
  const meter = page.getByRole('meter', { name: 'Password strength' })
  await expect(meter).toHaveAttribute('aria-valuenow', '0')

  await page.getByLabel('Password', { exact: true }).click()
  await page.keyboard.type('password')
  await expect(meter).toHaveAttribute('aria-valuenow', '0')
  await expect(meter).toHaveAttribute('aria-valuetext', 'Too weak')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Tr0ub4dor&3x!')
  await expect(meter).toHaveAttribute('aria-valuenow', '4')
  await expect(meter).toHaveAttribute('aria-valuetext', 'Strong')
  expect(await host.evaluate((el) => el.matches(':state(strength-4)'))).toBe(true)
  const fired = await events(page)
  expect(fired.at(-1)).toEqual({ score: 4, label: 'Strong' })
})

test('an unmet requirement caps the strength at weak', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field meter requirements="symbol"></c2-password-field>')
  await page.getByLabel('Password', { exact: true }).click()
  await page.keyboard.type('CorrectHorseBattery9')
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '1')
  await page.keyboard.type('!')
  await expect(page.getByRole('meter')).toHaveAttribute('aria-valuenow', '4')
})

test('it submits with its form, validates required and resets', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-password-field name="pw" required value="init"></c2-password-field></form>')
  const host = page.locator('c2-password-field')
  const formValue = () => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('pw'))
  expect(await formValue()).toBe('init')
  const input = page.getByLabel('Password', { exact: true })
  await input.fill('')
  await page.keyboard.type('changed')
  expect(await formValue()).toBe('changed')
  await input.fill('')
  expect(await host.evaluate((el) => (el as HTMLElement & { validity: ValidityState }).validity.valueMissing)).toBe(true)
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(input).toHaveValue('init')
})

test('a Caps Lock warning shows while the password is hidden', async ({ page, renderScenario }) => {
  await renderScenario('<c2-password-field></c2-password-field>')
  await page.getByLabel('Password', { exact: true }).click()
  // Playwright cannot toggle the OS Caps Lock state, so send a key event that carries it.
  await page
    .getByLabel('Password', { exact: true })
    .evaluate((input) => input.dispatchEvent(new KeyboardEvent('keyup', { key: 'A', modifierCapsLock: true, bubbles: true, composed: true })))
  await expect(page.getByRole('status')).toHaveText('Caps Lock is on')
  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(page.getByRole('status')).toHaveText('')
})

test('has no accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-password-field placeholder="Password" help="Use at least 8 characters."></c2-password-field><c2-password-field aria-label="New password" meter requirements="length;number" value="abc"></c2-password-field><c2-password-field aria-label="Current" error error-text="Incorrect password."></c2-password-field><c2-password-field aria-label="Strong" meter requirements="length;number" value="Abcdefgh1!xyz"></c2-password-field>',
  )
  await accessible(page)
})
