import type { Page } from '@playwright/test'
import type { Form } from '../src/form'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

/** Records an event's detail without its elements, FormData or functions, which do not serialize. */
async function record(page: Page, name: string) {
  await page.locator('c2-form').evaluate((element, eventName) => {
    const events: unknown[] = []
    element.setAttribute('data-events', '[]')
    element.addEventListener(eventName, (event) => {
      events.push(
        JSON.parse(
          JSON.stringify((event as CustomEvent).detail, (key, value) => (key === 'control' || key === 'formData' || key === 'submitter' ? undefined : value)),
        ),
      )
      element.setAttribute('data-events', JSON.stringify(events))
    })
  }, name)
}

const host = (page: Page) => page.locator('c2-form')
const summary = (page: Page) => page.locator('c2-form').locator('[part="summary"]')

const account = (attributes = '') => `<c2-form ${attributes}>
  <form>
    <c2-form-field label="Full name"><c2-text-field name="fullName" required></c2-text-field></c2-form-field>
    <c2-form-field label="Email"><c2-text-field name="email" type="email" required value="ada@"></c2-text-field></c2-form-field>
    <c2-form-field label="Handle" necessity="optional"><c2-text-field name="handle" value="ada"></c2-text-field></c2-form-field>
    <c2-form-field><c2-checkbox name="terms" value="yes" required>I agree to the terms</c2-checkbox></c2-form-field>
    <div><c2-button type="submit">Save</c2-button> <c2-button type="reset">Discard</c2-button></div>
  </form>
</c2-form>`

async function fillValid(page: Page) {
  await page.getByRole('textbox', { name: 'Full name' }).fill('Ada Lovelace')
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
  await page.getByRole('checkbox', { name: 'I agree to the terms' }).check()
}

test('a failed submit shows every error, focuses the summary and fires invalid-submit', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await record(page, 'invalid-submit')
  let dialogs = 0
  page.on('dialog', () => dialogs++)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page)).toBeFocused()
  await expect(summary(page).locator('[part="summary-heading"]')).toHaveText('There are 3 problems with this form')
  await expect(summary(page).locator('[part="summary-link"]')).toHaveText([
    'Fill in this field.',
    'Enter an email address, like name@example.com.',
    'Check this box to continue.',
  ])
  await expect(host(page)).toHaveState('invalid')
  await expect(host(page)).toHaveState('submitted')
  const events = JSON.parse((await host(page).getAttribute('data-events')) ?? '[]') as { errors: { name: string }[] }[]
  expect(events.map((event) => event.errors.map((error) => error.name))).toEqual([['fullName', 'email', 'terms']])
  expect(dialogs).toBe(0)
})

test('a summary entry focuses its control, and entries leave as they are fixed', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await page.getByRole('button', { name: 'Save' }).click()
  await summary(page).getByText('Enter an email address, like name@example.com.').click()
  const email = page.getByRole('textbox', { name: 'Email' })
  await expect(email).toBeFocused()
  await email.fill('ada@example.com')
  await expect(summary(page).locator('[part="summary-link"]')).toHaveText(['Fill in this field.', 'Check this box to continue.'])
})

test('a single error focuses its control instead of showing a summary', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await page.getByRole('textbox', { name: 'Full name' }).fill('Ada Lovelace')
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('checkbox', { name: 'I agree to the terms' })).toBeFocused()
  await expect(summary(page)).toHaveCount(0)
})

test('error-summary="always" summarizes a single error, "none" never does', async ({ page, renderScenario }) => {
  await renderScenario(account('error-summary="always"'))
  await page.getByRole('textbox', { name: 'Full name' }).fill('Ada Lovelace')
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page).locator('[part="summary-heading"]')).toHaveText('There is a problem with this form')

  await renderScenario(account('error-summary="none"'))
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page)).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Full name' })).toBeFocused()
})

test('a valid submit fires valid-submit with the values and does not navigate', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await record(page, 'valid-submit')
  await fillValid(page)
  const url = page.url()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => JSON.parse((await host(page).getAttribute('data-events')) ?? '[]').length).toBe(1)
  const [detail] = JSON.parse((await host(page).getAttribute('data-events')) ?? '[]') as { values: Record<string, string> }[]
  expect(detail.values).toEqual({ fullName: 'Ada Lovelace', email: 'ada@example.com', handle: 'ada', terms: 'yes' })
  expect(page.url()).toBe(url)
  await expect(host(page)).not.toHaveState('invalid')
})

test('waitUntil keeps the form submitting with the button running, then marks it pristine', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await page.evaluate(() => {
    const form = document.querySelector('c2-form') as Form
    form.addEventListener('valid-submit', (event) => {
      event.detail.waitUntil(new Promise((resolve) => ((window as unknown as { finish: (v: unknown) => void }).finish = resolve)))
    })
  })
  await fillValid(page)
  await expect(host(page)).toHaveState('dirty')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(host(page)).toHaveState('submitting')
  await expect(page.locator('c2-button[type="submit"]')).toHaveJSProperty('running', true)
  await page.evaluate(() => (window as unknown as { finish: (v: unknown) => void }).finish(undefined))
  await expect(host(page)).not.toHaveState('submitting')
  await expect(page.locator('c2-button[type="submit"]')).toHaveJSProperty('running', false)
  await expect(host(page)).not.toHaveState('dirty')
})

test('a waitUntil rejected with an error map shows the errors on their fields', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await page.evaluate(() => {
    ;(document.querySelector('c2-form') as Form).addEventListener('valid-submit', (event) =>
      event.detail.waitUntil(Promise.reject({ email: 'Already registered.' })),
    )
  })
  await fillValid(page)
  await page.getByRole('button', { name: 'Save' }).click()
  const email = page.getByRole('textbox', { name: 'Email' })
  await expect(email).toHaveAccessibleDescription('Error: Already registered.')
  await expect(email).toBeFocused()
  await page.keyboard.type('x')
  await expect(email).not.toHaveAccessibleDescription(/Already registered/)
})

test('server errors from the errors attribute show on fields and in the summary', async ({ page, renderScenario }) => {
  await renderScenario(account(`errors='{"handle": "That handle is taken.", "plan": "Your plan expired."}'`))
  const handle = page.getByRole('textbox', { name: 'Handle' })
  await expect(handle).toHaveAccessibleDescription('Error: That handle is taken.')
  await fillValid(page)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page).locator('[part="summary-link"]')).toHaveText(['That handle is taken.', 'Your plan expired.'])
  await host(page).evaluate((element) => (element as Form).setErrors({}))
  await expect(handle).not.toHaveAccessibleDescription(/taken/)
})

test('a validator adds cross-field errors after native validation passes', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form><form>
    <c2-form-field label="Password"><c2-text-field name="password" type="password" required></c2-text-field></c2-form-field>
    <c2-form-field label="Confirm password"><c2-text-field name="confirm" type="password" required></c2-text-field></c2-form-field>
    <c2-button type="submit">Create</c2-button>
  </form></c2-form>`)
  await record(page, 'valid-submit')
  await host(page).evaluate((element) => {
    ;(element as Form).validator = async (values) => (values.password === values.confirm ? {} : { confirm: 'The passwords do not match.' })
  })
  await page.getByRole('textbox', { name: 'Password', exact: true }).fill('analytical')
  await page.getByRole('textbox', { name: 'Confirm password' }).fill('engine')
  await page.getByRole('button', { name: 'Create' }).click()
  const confirm = page.getByRole('textbox', { name: 'Confirm password' })
  await expect(confirm).toHaveAccessibleDescription('Error: The passwords do not match.')
  await expect(confirm).toBeFocused()
  await confirm.fill('analytical')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect.poll(async () => JSON.parse((await host(page).getAttribute('data-events')) ?? '[]').length).toBe(1)
})

test('dirty-change fires when values start and stop differing, and reset clears errors', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await watch(host(page), 'dirty-change')
  const handle = page.getByRole('textbox', { name: 'Handle' })
  await handle.fill('ada2')
  await expect(host(page)).toHaveState('dirty')
  await handle.fill('ada')
  await expect(host(page)).not.toHaveState('dirty')
  await expect(host(page)).toHaveAttribute('data-events', '[{"dirty":true},{"dirty":false}]')

  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page)).toBeVisible()
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(summary(page)).toHaveCount(0)
  await expect(page.locator('c2-form-field').first()).not.toHaveState('user-invalid')
  await expect(host(page)).not.toHaveState('submitted')
})

test('necessity and validate-on are the defaults of the fields inside', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form necessity="optional" validate-on="input"><form>
    <c2-form-field label="Email"><c2-text-field name="email" type="email"></c2-text-field></c2-form-field>
    <c2-form-field label="Name" necessity="none"><c2-text-field name="name"></c2-text-field></c2-form-field>
  </form></c2-form>`)
  await expect(page.locator('c2-form-field').nth(0).locator('.optional')).toHaveText('Optional')
  await expect(page.locator('c2-form-field').nth(1).locator('.optional')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@')
  await expect(page.locator('c2-form-field').nth(0)).toHaveState('user-invalid')
})

test('submit() validates like a submit button', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await host(page).evaluate((element) => (element as Form).submit())
  await expect(summary(page)).toBeFocused()
})

test('writes no attribute on its host or the form', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form><form><c2-form-field label="Name"><c2-text-field name="name" required></c2-text-field></c2-form-field><c2-form-field label="Email"><c2-text-field name="email" required></c2-text-field></c2-form-field><c2-button type="submit">Save</c2-button></form></c2-form>`,
  )
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page)).toBeVisible()
  await expect(host(page)).toHaveJSProperty('attributes.length', 0)
  await expect(page.locator('form')).toHaveJSProperty('attributes.length', 0)
})

test('is accessible after a failed submit', async ({ page, renderScenario }) => {
  await renderScenario(account())
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(summary(page)).toBeFocused()
  await accessible(page)
})
