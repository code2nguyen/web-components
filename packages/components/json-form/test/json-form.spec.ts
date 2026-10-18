import type { Locator, Page } from '@playwright/test'
import { test, expect, props, accessible } from '../../../../tests/component-fixture'
import { validateSchema, fromAjvErrors } from '../src/validate'
import type { JsonSchema } from '../src/types'

const profile: JsonSchema = {
  type: 'object',
  required: ['name', 'email'],
  properties: {
    name: { type: 'string', title: 'Full name', minLength: 2 },
    email: { type: 'string', format: 'email', description: 'We never share it.' },
    age: { type: 'integer', minimum: 18 },
    newsletter: { type: 'boolean', title: 'Send me the newsletter', default: true },
    plan: { type: 'string', enum: ['free', 'pro', 'team'] },
  },
}

const host = (page: Page) => page.locator('c2-json-form')
const value = (locator: Locator) => locator.evaluate((element) => JSON.parse(JSON.stringify((element as HTMLElement & { value: unknown }).value ?? null)))

async function countEvents(locator: Locator) {
  await locator.evaluate((element) => {
    const counts = { input: 0, change: 0 }
    element.addEventListener('input', () => counts.input++)
    element.addEventListener('change', () => counts.change++)
    ;(element as HTMLElement & { counts: typeof counts }).counts = counts
  })
}

const counts = (locator: Locator) => locator.evaluate((element) => ({ ...(element as HTMLElement & { counts: { input: number; change: number } }).counts }))

test.describe('generated layout', () => {
  test('renders one labelled control per property and fills schema defaults', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: profile, value: { name: 'Ada' } })
    await expect(page.getByRole('textbox', { name: 'Full name' })).toHaveValue('Ada')
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('')
    await expect(page.getByRole('checkbox', { name: 'Send me the newsletter' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'pro' })).toBeVisible()
    expect(await value(host(page))).toEqual({ name: 'Ada', newsletter: true })
    await accessible(page)
  })

  test('edits write typed values at their path and fire input and change', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: profile, value: {} })
    await countEvents(host(page))
    await page.getByRole('textbox', { name: 'Full name' }).fill('Grace')
    await page.getByRole('spinbutton', { name: 'Age' }).fill('36')
    await page.getByRole('radio', { name: 'team' }).click()
    await page.getByRole('checkbox', { name: 'Send me the newsletter' }).uncheck()
    expect(await value(host(page))).toEqual({ name: 'Grace', age: 36, plan: 'team', newsletter: false })
    const { input, change } = await counts(host(page))
    expect(input).toBeGreaterThanOrEqual(4)
    expect(change).toBeGreaterThanOrEqual(3)
  })

  test('an emptied text field removes its key', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: profile, value: { name: 'Ada', email: 'ada@example.com' } })
    await page.getByRole('textbox', { name: 'Email' }).fill('')
    expect(await value(host(page))).toEqual({ name: 'Ada', newsletter: true })
  })

  test('an enum with more than five options becomes a select', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    const sizes = ['xs', 's', 'm', 'l', 'xl', 'xxl']
    await props(host(page), { schema: { type: 'object', properties: { size: { type: 'string', enum: sizes } } }, value: { size: 'l' } })
    await expect(host(page).locator('c2-select')).toHaveCount(1)
    await expect(host(page).locator('c2-radio')).toHaveCount(0)
  })
})

test.describe('validation', () => {
  test('a field shows its error once committed, not while untouched', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: profile, value: {} })
    const name = page.getByRole('textbox', { name: 'Full name' })
    await expect(host(page).locator('c2-form-field[data-json-path="/name"]')).toHaveAttribute('error-text', '')
    await name.fill('A')
    await name.blur()
    await expect(host(page).locator('c2-form-field[data-json-path="/name"]')).toHaveAttribute('error-text', 'Use at least 2 characters.')
    await expect(host(page).locator('c2-form-field[data-json-path="/email"]')).toHaveAttribute('error-text', '')
    await name.fill('Ada')
    await expect(host(page).locator('c2-form-field[data-json-path="/name"]')).toHaveAttribute('error-text', '')
  })

  test('reportValidity shows every error and focuses the first invalid field', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: profile, value: {} })
    const valid = await host(page).evaluate((element) => (element as HTMLElement & { reportValidity(): boolean }).reportValidity())
    expect(valid).toBe(false)
    await expect(host(page).locator('c2-form-field[data-json-path="/name"]')).toHaveAttribute('error-text', 'Fill in this field.')
    await expect(host(page).locator('c2-form-field[data-json-path="/email"]')).toHaveAttribute('error-text', 'Fill in this field.')
    await expect(page.getByRole('textbox', { name: 'Full name' })).toBeFocused()
    const errors = await host(page).evaluate((element) => (element as HTMLElement & { errors: { path: string; keyword: string }[] }).errors)
    expect(errors.map((error) => `${error.path} ${error.keyword}`)).toEqual(['/name required', '/email required'])
  })

  test('a custom validator replaces the built-in one', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await host(page).evaluate((element) => {
      Object.assign(element, {
        schema: { type: 'object', properties: { code: { type: 'string' } } },
        validator: (_schema: unknown, data: { code?: string }) =>
          data?.code === 'X' ? [] : [{ path: '/code', keyword: 'server', message: 'Use the code X.' }],
      })
    })
    expect(await host(page).evaluate((element) => (element as HTMLElement & { reportValidity(): boolean }).reportValidity())).toBe(false)
    await expect(host(page).locator('c2-form-field[data-json-path="/code"]')).toHaveAttribute('error-text', 'Use the code X.')
    await page.getByRole('textbox', { name: 'Code' }).fill('X')
    await expect(host(page).locator('c2-form-field[data-json-path="/code"]')).toHaveAttribute('error-text', '')
  })

  test('inside a form it submits JSON under its name and blocks an invalid submit', async ({ page, renderScenario }) => {
    await renderScenario(`<form><c2-json-form name="profile"></c2-json-form><button>Send</button></form>`)
    await props(host(page), { schema: profile, value: {} })
    await page.locator('form').evaluate((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault()
        form.setAttribute('data-submitted', String(new FormData(form as HTMLFormElement).get('profile')))
      })
    })
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.locator('form')).not.toHaveAttribute('data-submitted')
    await expect(page.getByRole('textbox', { name: 'Full name' })).toBeFocused()
    await page.getByRole('textbox', { name: 'Full name' }).fill('Ada')
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.locator('form')).toHaveAttribute('data-submitted', /Ada/)
    expect(JSON.parse((await page.locator('form').getAttribute('data-submitted')) ?? '')).toEqual({ name: 'Ada', email: 'ada@example.com', newsletter: true })
  })
})

test.describe('ui schema', () => {
  const address: JsonSchema = {
    type: 'object',
    required: ['street'],
    properties: {
      sameAsShipping: { type: 'boolean', title: 'Same as shipping' },
      street: { type: 'string' },
      city: { type: 'string' },
      notes: { type: 'string' },
    },
  }

  test('layouts group and order the fields, and * renders the rest', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), {
      schema: address,
      uiSchema: {
        type: 'VerticalLayout',
        elements: [
          {
            type: 'Group',
            label: 'Billing',
            elements: [
              {
                type: 'HorizontalLayout',
                elements: [
                  { type: 'Control', scope: '#/properties/city' },
                  { type: 'Control', scope: 'street' },
                ],
              },
            ],
          },
          { type: 'Control', scope: '*' },
        ],
      },
    })
    await expect(page.getByRole('group', { name: 'Billing' })).toBeVisible()
    await expect(page.getByRole('group', { name: 'Billing' }).getByRole('textbox')).toHaveCount(2)
    const labels = await host(page)
      .locator('c2-form-field')
      .evaluateAll((fields) => fields.map((field) => field.getAttribute('data-json-path')))
    expect(labels).toEqual(['/city', '/street', '/sameAsShipping', '/notes'])
  })

  test('a HIDE rule follows the data, and a hidden field does not block the form', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), {
      schema: address,
      value: {},
      uiSchema: {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/sameAsShipping' },
          {
            type: 'Group',
            label: 'Billing address',
            rule: { effect: 'HIDE', condition: { scope: '#/properties/sameAsShipping', schema: { const: true } } },
            elements: [{ type: 'Control', scope: '#/properties/street' }],
          },
        ],
      },
    })
    await expect(page.getByRole('textbox', { name: 'Street' })).toBeVisible()
    expect(await host(page).evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
    await page.getByRole('checkbox', { name: 'Same as shipping' }).check()
    await expect(page.getByRole('textbox', { name: 'Street' })).toHaveCount(0)
    expect(await host(page).evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
  })

  test('options.widget picks another renderer and GridLayout spans columns', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), {
      schema: address,
      uiSchema: {
        type: 'GridLayout',
        options: { columns: 2 },
        elements: [
          { type: 'Control', scope: 'street' },
          { type: 'Control', scope: 'city' },
          { type: 'Control', scope: 'notes', options: { widget: 'textarea', span: 2 } },
        ],
      },
    })
    await expect(host(page).locator('c2-textarea')).toHaveCount(1)
    const [street, city, notes] = await host(page)
      .locator('c2-form-field')
      .evaluateAll((fields) => fields.map((field) => Math.round(field.getBoundingClientRect().width)))
    expect(street).toBe(city)
    expect(notes).toBeGreaterThan(street * 2 - 1)
  })

  test('a stepper stops at a step that has errors', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), {
      schema: address,
      value: {},
      uiSchema: {
        type: 'Categorization',
        options: { variant: 'stepper' },
        elements: [
          { type: 'Category', label: 'Address', elements: [{ type: 'Control', scope: 'street' }] },
          { type: 'Category', label: 'Notes', elements: [{ type: 'Control', scope: 'notes' }] },
        ],
      },
    })
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(host(page).locator('c2-form-field[data-json-path="/street"]')).toHaveAttribute('error-text', 'Fill in this field.')
    await expect(page.getByRole('textbox', { name: 'Notes' })).toBeHidden()
    await page.getByRole('textbox', { name: 'Street' }).fill('Main St')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Street' })).toBeHidden()
  })

  test('reportValidity opens the tab holding the first error', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), {
      schema: address,
      value: {},
      uiSchema: {
        type: 'Categorization',
        elements: [
          { type: 'Category', label: 'Notes', elements: [{ type: 'Control', scope: 'notes' }] },
          { type: 'Category', label: 'Address', elements: [{ type: 'Control', scope: 'street' }] },
        ],
      },
    })
    await expect(page.getByRole('textbox', { name: 'Notes' })).toBeVisible()
    await host(page).evaluate((element) => (element as HTMLElement & { reportValidity(): boolean }).reportValidity())
    await expect(page.getByRole('textbox', { name: 'Street' })).toBeFocused()
  })
})

test.describe('arrays', () => {
  const team: JsonSchema = {
    type: 'object',
    properties: {
      members: {
        type: 'array',
        minItems: 1,
        items: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, role: { type: 'string', default: 'dev' } } },
      },
      tags: { type: 'array', items: { type: 'string' } },
      days: { type: 'array', items: { type: 'string', enum: ['mon', 'tue', 'wed'] } },
    },
  }

  test('a list of objects adds and removes items', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: team, value: {} })
    await page.getByRole('button', { name: 'Add' }).click()
    await page.getByRole('button', { name: 'Add' }).click()
    expect(await value(host(page))).toEqual({ members: [{ role: 'dev' }, { role: 'dev' }] })
    await page.getByRole('group', { name: 'Item 2' }).getByRole('textbox', { name: 'Name' }).fill('Grace')
    await page.getByRole('group', { name: 'Item 1' }).getByRole('button', { name: 'Remove' }).click()
    expect(await value(host(page))).toEqual({ members: [{ role: 'dev', name: 'Grace' }] })
  })

  test('an array of enum values is a checkbox group', async ({ page, renderScenario }) => {
    await renderScenario('<c2-json-form></c2-json-form>')
    await props(host(page), { schema: team, value: { days: ['tue'] } })
    await expect(page.getByRole('checkbox', { name: 'tue' })).toBeChecked()
    await page.getByRole('checkbox', { name: 'mon' }).check()
    expect(((await value(host(page))) as { days: string[] }).days.sort()).toEqual(['mon', 'tue'])
  })
})

test.describe('markup layout', () => {
  test('c2-json-field places fields in the author markup; * renders the rest', async ({ page, renderScenario }) => {
    await renderScenario(`<c2-json-form>
      <div class="row">
        <c2-json-field scope="email"></c2-json-field>
        <p>Between the fields</p>
        <c2-json-field scope="#/properties/name" label="Your name"></c2-json-field>
      </div>
      <c2-json-field scope="*"></c2-json-field>
    </c2-json-form>`)
    await props(host(page), { schema: profile, value: {} })
    await expect(host(page).locator('c2-json-field').first().locator('c2-form-field')).toHaveAttribute('data-json-path', '/email')
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible()
    // The rest: age, newsletter and plan, but not the two placed fields again.
    await expect(page.getByRole('textbox')).toHaveCount(2)
    await expect(page.getByRole('spinbutton', { name: 'Age' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Your name' }).fill('Ada')
    expect(await value(host(page))).toEqual({ name: 'Ada', newsletter: true })
    expect(await host(page).evaluate((element) => (element as HTMLElement & { reportValidity(): boolean }).reportValidity())).toBe(false)
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused()
  })
})

test('a form-specific renderer outranks the built-in one', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-form></c2-json-form>')
  await host(page).evaluate((element) => {
    Object.assign(element, {
      renderers: [
        {
          name: 'color',
          tester: (ui: { type: string }, schema?: { format?: string }) => (ui.type === 'Control' && schema?.format === 'color' ? 10 : -1),
          render: (ctx: { value: unknown; pointer: string }) => {
            const output = document.createElement('output')
            output.dataset.path = ctx.pointer
            output.textContent = String(ctx.value)
            return output
          },
        },
      ],
      schema: { type: 'object', properties: { accent: { type: 'string', format: 'color' } } },
      value: { accent: '#ff0000' },
    })
  })
  await expect(host(page).locator('output[data-path="/accent"]')).toHaveText('#ff0000')
})

test.describe('validator', () => {
  test('reports the keywords forms need, with required on the property', () => {
    const schema: JsonSchema = {
      type: 'object',
      required: ['a'],
      $defs: { short: { type: 'string', maxLength: 3 } },
      properties: { a: { type: 'string' }, b: { $ref: '#/$defs/short' }, c: { type: 'integer', minimum: 1 }, d: { type: 'string', format: 'email' } },
    }
    const errors = validateSchema(schema, { b: 'long', c: 0.5, d: 'x' })
    expect(errors.map((error) => `${error.path} ${error.keyword}`)).toEqual(['/a required', '/b maxLength', '/c type', '/d format'])
  })

  test('if/then and dependentRequired', () => {
    const schema: JsonSchema = {
      type: 'object',
      if: { properties: { country: { const: 'US' } }, required: ['country'] },
      then: { required: ['state'] },
      dependentRequired: { phone: ['phoneType'] },
    }
    expect(validateSchema(schema, { country: 'US', phone: '1' }).map((error) => error.path)).toEqual(['/state', '/phoneType'])
    expect(validateSchema(schema, { country: 'FR' })).toEqual([])
  })

  test('fromAjvErrors moves required onto the missing property', () => {
    expect(fromAjvErrors([{ instancePath: '/billing', keyword: 'required', params: { missingProperty: 'zip' }, message: 'x' }])).toEqual([
      { path: '/billing/zip', keyword: 'required', params: { missingProperty: 'zip' }, message: undefined },
    ])
  })
})
