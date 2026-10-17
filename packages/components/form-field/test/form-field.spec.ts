import type { Page } from '@playwright/test'
import type { FormField } from '../src/form-field'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const field = (page: Page) => page.locator('c2-form-field')
const supporting = (page: Page) => page.locator('c2-form-field').locator('.supporting-text')

test('names and describes the input inside a c2-text-field', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form-field label="Email" hint="We'll send a confirmation link."><c2-text-field name="email" type="email"></c2-text-field></c2-form-field>`,
  )
  const input = page.getByRole('textbox', { name: 'Email' })
  await expect(input).toBeVisible()
  await expect(input).toHaveAccessibleDescription("We'll send a confirmation link.")
  // The field draws the hint; the text field hides its own line while managed.
  await expect(page.locator('c2-text-field').locator('.supporting-text')).toHaveCount(0)
  await expect(supporting(page)).toHaveText("We'll send a confirmation link.")
})

test('slotted label and hint win over the attributes', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form-field label="Ignored" hint="Ignored"><span slot="label">Display name</span><span slot="hint">Shown on your <b>profile</b>.</span><c2-text-field></c2-text-field></c2-form-field>`,
  )
  const input = page.getByRole('textbox', { name: 'Display name' })
  await expect(input).toHaveAccessibleDescription('Shown on your profile.')
})

test('clicking the label focuses the control', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Full name"><c2-text-field></c2-text-field></c2-form-field>`)
  await field(page).locator('[part="label"]').click()
  await expect(page.getByRole('textbox', { name: 'Full name' })).toBeFocused()
})

test('shows nothing while untouched, then the error on validate(), then clears it as the value is fixed', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email"><c2-text-field type="email" required></c2-text-field></c2-form-field>`)
  const input = page.getByRole('textbox', { name: 'Email' })
  await expect(field(page)).toHaveState('invalid')
  await expect(field(page)).not.toHaveState('user-invalid')
  await input.fill('ada@')
  await expect(field(page)).not.toHaveState('user-invalid')

  await field(page).evaluate((element) => (element as FormField).validate())
  await expect(field(page)).toHaveState('user-invalid')
  await expect(supporting(page)).toHaveText('Enter an email address, like name@example.com.')
  await expect(input).toHaveAccessibleDescription('Error: Enter an email address, like name@example.com.')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('c2-text-field')).toHaveState('error')

  await input.fill('ada@example.com')
  await expect(field(page)).not.toHaveState('user-invalid')
  await expect(input).not.toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('c2-text-field')).not.toHaveState('error')
})

test('shows the error when a form submit finds the control invalid', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-form-field label="Full name"><c2-text-field name="fullName" required></c2-text-field></c2-form-field><button>Save</button></form>`,
  )
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(supporting(page)).toHaveText('Fill in this field.')
})

test('a slotted error with data-match is used for its validity key only', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email">
      <c2-text-field type="email" required></c2-text-field>
      <span slot="error" data-match="valueMissing">Enter your email address.</span>
      <span slot="error">Check the email address.</span>
    </c2-form-field>`)
  const input = page.getByRole('textbox', { name: 'Email' })
  await field(page).evaluate((element) => (element as FormField).validate())
  await expect(supporting(page)).toHaveText('Enter your email address.')
  await input.fill('nope')
  await expect(supporting(page)).toHaveText('Check the email address.')
})

test('error-text makes the control invalid and blocks a form submit', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-form-field label="Handle" error-text="That handle is taken."><c2-text-field name="handle" value="admin"></c2-text-field></c2-form-field></form>`,
  )
  await expect.poll(() => page.locator('form').evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(false)
  await expect(supporting(page)).toHaveText('That handle is taken.')
  await field(page).evaluate((element) => element.removeAttribute('error-text'))
  await expect.poll(() => page.locator('form').evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true)
})

test('a server error shows until the user edits the control', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email"><c2-text-field name="email" value="ada@example.com"></c2-text-field></c2-form-field>`)
  await field(page).evaluate((element) => (element as FormField).setServerError('Already registered.'))
  await expect(supporting(page)).toHaveText('Already registered.')
  await expect(page.locator('c2-text-field')).toHaveJSProperty('validity.customError', true)
  await page.getByRole('textbox', { name: 'Email' }).press('End')
  await page.keyboard.type('x')
  await expect(field(page)).not.toHaveState('user-invalid')
  await expect(page.locator('c2-text-field')).toHaveJSProperty('validity.valid', true)
})

test('a warning shows without blocking validity', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form-field label="Password" hint="12 characters or more." warning-text="This password appeared in a data breach."><c2-text-field type="password"></c2-text-field></c2-form-field>`,
  )
  await expect(field(page)).toHaveState('warning')
  await expect(supporting(page).locator('.warning')).toHaveText('This password appeared in a data breach.')
  await expect(supporting(page).locator('.hint')).toBeHidden()
  await expect(page.locator('c2-text-field')).toHaveJSProperty('validity.valid', true)
})

test('validate-on="blur" shows the error when focus leaves an edited control', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email" validate-on="blur"><c2-text-field type="email"></c2-text-field></c2-form-field>`)
  const input = page.getByRole('textbox', { name: 'Email' })
  await input.focus()
  await page.keyboard.press('Tab')
  await expect(field(page)).not.toHaveState('user-invalid')
  await input.fill('ada@')
  await expect(field(page)).not.toHaveState('user-invalid')
  await page.keyboard.press('Tab')
  await expect(field(page)).toHaveState('user-invalid')
})

test('validate-on="input" shows the error while typing', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email" validate-on="input"><c2-text-field type="email"></c2-text-field></c2-form-field>`)
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@')
  await expect(field(page)).toHaveState('user-invalid')
})

test('marks required fields with an asterisk, or optional ones with "Optional"', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Name"><c2-text-field required></c2-text-field></c2-form-field>
    <c2-form-field label="Company" necessity="optional"><c2-text-field></c2-text-field></c2-form-field>
    <c2-form-field label="Code" necessity="none"><c2-text-field required></c2-text-field></c2-form-field>`)
  await expect(field(page).nth(0).locator('.required')).toHaveText('*')
  await expect(field(page).nth(1).locator('.optional')).toHaveText('Optional')
  await expect(field(page).nth(2).locator('.required, .optional')).toHaveCount(0)
  await expect(field(page).nth(0)).toHaveState('required')
  // The marker is decoration: the name stays the label text.
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
})

test('counts characters against maxlength', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Bio" counter><c2-textarea maxlength="20"></c2-textarea></c2-form-field>`)
  const counter = field(page).locator('[part="counter"]')
  await expect(counter).toHaveText('0 / 20')
  await page.getByRole('textbox', { name: 'Bio' }).fill('Mathematician, w')
  await expect(counter).toHaveText('16 / 20')
  await expect(counter).not.toHaveClass(/near/)
  await page.keyboard.type('rite')
  await expect(counter).toHaveText('20 / 20')
  await expect(counter).toHaveClass(/near/)
  await expect(field(page).locator('.live')).toHaveText('0 characters left')
})

test('names a c2-select trigger and shows a choice message', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Country"><c2-select required placeholder="Select a country">
      <c2-list-item value="GB">United Kingdom</c2-list-item><c2-list-item value="FR">France</c2-list-item>
    </c2-select></c2-form-field>`)
  await field(page).evaluate((element) => (element as FormField).validate())
  const trigger = page.getByRole('button', { name: 'Country' })
  await expect(trigger).toHaveAccessibleDescription('Error: Select an option.')
  await expect(page.locator('c2-select')).toHaveState('error')
  await trigger.click()
  await page.locator('c2-list-item', { hasText: 'France' }).click()
  await expect(field(page)).not.toHaveState('user-invalid')
})

test('a checkbox keeps its own text as its name and gets the error as description', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field><c2-checkbox name="terms" required>I agree to the terms</c2-checkbox></c2-form-field>`)
  await expect(field(page).locator('[part="label-row"]')).toBeHidden()
  await field(page).evaluate((element) => (element as FormField).validate())
  const box = page.getByRole('checkbox', { name: 'I agree to the terms' })
  await expect(box).toHaveAccessibleDescription('Error: Check this box to continue.')
  await expect(page.locator('c2-checkbox')).toHaveState('error')
  await box.check()
  await expect(field(page)).not.toHaveState('user-invalid')
})

test('a switch gets the hint as description', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field hint="Every Monday."><c2-switch>Weekly digest</c2-switch></c2-form-field>`)
  await expect(page.getByRole('switch', { name: 'Weekly digest' })).toHaveAccessibleDescription('Every Monday.')
})

test('the control gets its own line back when it leaves the field', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email"><c2-text-field help="Own help"></c2-text-field></c2-form-field><div id="out"></div>`)
  await expect(page.locator('c2-text-field').locator('.supporting-text')).toHaveCount(0)
  await page.evaluate(() => document.querySelector('#out')!.append(document.querySelector('c2-text-field')!))
  await expect(page.locator('c2-text-field').locator('.supporting-text')).toHaveText('Own help')
  await expect(page.getByRole('textbox')).not.toHaveAccessibleName('Email')
})

test('claims a control that upgrades after the field', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Late"><late-field></late-field></c2-form-field>`)
  await page.evaluate(async () => {
    const TextField = customElements.get('c2-text-field')!
    customElements.define('late-field', class extends TextField {})
    await customElements.whenDefined('late-field')
  })
  await expect(page.getByRole('textbox', { name: 'Late' })).toBeVisible()
})

test('a form reset clears the shown error', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-form-field label="Name"><c2-text-field required></c2-text-field></c2-form-field><button type="reset">Reset</button></form>`)
  await field(page).evaluate((element) => (element as FormField).validate())
  await expect(field(page)).toHaveState('user-invalid')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(field(page)).not.toHaveState('user-invalid')
})

test('writes no attribute on its host or its children', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email" hint="Hint"><c2-text-field type="email" required></c2-text-field></c2-form-field>`)
  await field(page).evaluate((element) => (element as FormField).validate())
  await expect(field(page)).toHaveState('user-invalid')
  const attributes = await page
    .locator('main')
    .evaluate((main) => [...main.querySelectorAll('*')].map((el) => [el.localName, el.getAttributeNames().sort().join(',')]))
  expect(attributes).toEqual([
    ['c2-form-field', 'hint,label'],
    ['c2-text-field', 'required,type'],
  ])
})

test('is accessible with a hint, an error and a warning', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-field label="Email" hint="We'll send a link."><c2-text-field type="email"></c2-text-field></c2-form-field>
    <c2-form-field label="Name" id="err"><c2-text-field required></c2-text-field></c2-form-field>
    <c2-form-field label="Password" warning-text="Weak password."><c2-text-field type="password"></c2-text-field></c2-form-field>
    <c2-form-field><c2-checkbox required>I agree</c2-checkbox></c2-form-field>`)
  await page.locator('#err').evaluate((element) => (element as FormField).validate())
  await accessible(page)
})
