import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const FIELDS = JSON.stringify([
  { key: 'service', label: 'Service', values: ['web', 'api', 'billing worker'] },
  { key: 'status', label: 'Status', values: [{ value: 'error', description: '4xx and 5xx' }, 'ok'] },
  { key: 'env', values: ['prod', 'staging'] },
])

const events = async (page: Page) => JSON.parse((await page.locator('c2-query-input').getAttribute('data-events')) ?? '[]')
const options = (page: Page) => page.getByRole('option')

test('colours each part of the query and keeps the highlight in step with the text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input value='service:web -status:>=500 (env:prod OR "timed out")'></c2-query-input>`)
  const host = page.locator('c2-query-input')
  await expect(host.locator('.highlight-text')).toHaveText('service:web -status:>=500 (env:prod OR "timed out")')
  await expect(host.locator('.token.key')).toHaveText(['service', 'status', 'env'])
  await expect(host.locator('.token.value')).toHaveText(['web', '500', 'prod'])
  await expect(host.locator('.token.comparator')).toHaveText(['>='])
  await expect(host.locator('.token.negation')).toHaveText(['-'])
  await expect(host.locator('.token.operator')).toHaveText(['OR'])
  await expect(host.locator('.token.paren')).toHaveText(['(', ')'])
  await expect(host.locator('.token.text')).toHaveText(['"timed out"'])
  // Without `fields`, every key is accepted and the field is a plain textbox.
  await expect(host.locator('.token.invalid')).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Search query' })).toBeVisible()
})

test('draws each key:value term, with its negation, as one chip', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input value='service:web -status:>=500 timeout OR env:' aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  await expect(host.locator('.term')).toHaveText(['service:web', '-status:>=500', 'env:'])
  await expect(host.locator('.term.negated')).toHaveText(['-status:>=500'])
  // Free text and operators stay plain.
  await expect(host.locator('.term .token.text, .term .token.operator')).toHaveCount(0)
  // The chips take no width: on a query wider than the field, the coloured copy is exactly as wide as the input's
  // text (word spacing included), so the caret stays on its letter all the way along.
  await host.evaluate((element: HTMLElement & { value: string }) => (element.value = 'service:web -status:>=500 env:prod '.repeat(4)))
  const widths = await host.evaluate((element) => {
    const root = element.shadowRoot!
    const input = root.querySelector('input')!
    const style = getComputedStyle(input)
    return {
      input: input.scrollWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      text: root.querySelector<HTMLElement>('.highlight-text')!.getBoundingClientRect().width,
    }
  })
  expect(Math.abs(widths.input - widths.text)).toBeLessThanOrEqual(2)
})

test('Enter runs the query with its parsed terms', async ({ page, renderScenario }) => {
  await renderScenario('<c2-query-input placeholder="Filter logs"></c2-query-input>')
  const host = page.locator('c2-query-input')
  await watch(host, 'search')
  await page.getByRole('textbox', { name: 'Filter logs' }).click()
  await page.keyboard.type('service:web NOT env:prod status:>=500 "timed out"')
  expect(await events(page)).toEqual([])
  await page.keyboard.press('Enter')
  const [detail] = await events(page)
  expect(detail.trigger).toBe('submit')
  expect(detail.value).toBe('service:web NOT env:prod status:>=500 "timed out"')
  expect(detail.terms.map(({ key, value, negated, comparator, quoted }: Record<string, unknown>) => ({ key, value, negated, comparator, quoted }))).toEqual([
    { key: 'service', value: 'web', negated: false, comparator: undefined, quoted: false },
    { key: 'env', value: 'prod', negated: true, comparator: undefined, quoted: false },
    { key: 'status', value: '500', negated: false, comparator: '>=', quoted: false },
    { key: null, value: 'timed out', negated: false, comparator: undefined, quoted: true },
  ])
  await expect(host).toHaveJSProperty('value', 'service:web NOT env:prod status:>=500 "timed out"')
})

test('suggests keys, then the values of the chosen key', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  // Focus on an empty field lists every key.
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(host).toHaveState('expanded')
  await expect(options(page).locator('.option-label')).toHaveText(['service', 'status', 'env'])

  await page.keyboard.type('st')
  await expect(options(page).locator('.option-label')).toHaveText(['status'])
  await expect(options(page).first().locator('mark')).toHaveText('st')
  // Tab completes the key and the list turns to its values.
  await page.keyboard.press('Tab')
  await expect(input).toHaveValue('status:')
  await expect(input).toBeFocused()
  await expect(page.locator('#suggestions-label')).toHaveText('Status')
  await expect(options(page).locator('.option-label')).toHaveText(['error', 'ok'])
  await expect(options(page).first().locator('.option-description')).toHaveText('4xx and 5xx')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-activedescendant', 'suggestion-1')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('status:ok ')
  // A picked value completes the term and closes the list until the next keystroke.
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.type('se')
  await expect(options(page).locator('.option-label')).toHaveText(['service'])
})

test('the value list follows the key under the caret', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' value="env:prod service:" aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  await page.keyboard.press('End')
  await expect(page.locator('#suggestions-label')).toHaveText('Service')
  await expect(options(page).locator('.option-label')).toHaveText(['web', 'api', 'billing worker'])
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('env:prod service:web ')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  // Back into the first term's value: the list reopens with env's values, filtered by what is left of the caret.
  await page.keyboard.press('Home')
  for (let step = 0; step < 'env:p'.length; step++) await page.keyboard.press('ArrowRight')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#suggestions-label')).toHaveText('env')
  await expect(options(page).locator('.option-label')).toHaveText(['prod'])
})

test('a value with spaces is quoted, and a click picks a suggestion', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  await page.keyboard.type('service:bil')
  await expect(options(page).locator('.option-label')).toHaveText(['billing worker'])
  await options(page).first().click()
  await expect(input).toHaveValue('service:"billing worker" ')
  await expect(input).toBeFocused()
  await expect(page.locator('c2-query-input')).toHaveJSProperty('terms', [
    { key: 'service', value: 'billing worker', negated: false, quoted: true, start: 0, end: 24 },
  ])
})

test('completing a key in the middle of the query keeps the rest', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' value="sta:ok env:prod" aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  await input.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(options(page).locator('.option-label')).toHaveText(['status'])
  await page.keyboard.press('Tab')
  await expect(input).toHaveValue('status:ok env:prod')
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe('status:'.length)
})

test('an unknown key and an unterminated quote are marked invalid', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' value='host:a1 service:web' aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  const input = page.getByRole('combobox', { name: 'Query' })
  await expect(host.locator('.token.invalid')).toHaveText(['host'])
  await expect(host).toHaveState('invalid')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await input.fill('service:web')
  await expect(host).not.toHaveState('invalid')
  await expect(input).not.toHaveAttribute('aria-invalid')
  await input.fill('service:"web')
  await expect(host.locator('.token.invalid')).toHaveText(['"web'])
})

test('suggest reports what the caret completes, once per change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  await watch(page.locator('c2-query-input'), 'suggest')
  await page.getByRole('combobox', { name: 'Query' }).click()
  await page.keyboard.type('env:p')
  await expect
    .poll(() => events(page))
    .toEqual([
      { kind: 'key', key: null, prefix: '' },
      { kind: 'key', key: null, prefix: 'e' },
      { kind: 'key', key: null, prefix: 'en' },
      { kind: 'key', key: null, prefix: 'env' },
      { kind: 'value', key: 'env', prefix: '' },
      { kind: 'value', key: 'env', prefix: 'p' },
    ])
})

test('Escape closes the suggestions, then clears the query', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  await watch(host, 'search')
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  await page.keyboard.type('env:')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await expect(input).toHaveValue('env:')
  await page.keyboard.press('Escape')
  await expect(input).toHaveValue('')
  expect(await events(page)).toEqual([{ value: '', trigger: 'clear', terms: [] }])
})

test('the clear button empties the field', async ({ page, renderScenario }) => {
  await renderScenario('<c2-query-input value="env:prod" aria-label="Query"></c2-query-input>')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['clear', 'input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  await page.getByRole('button', { name: 'Clear query' }).click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeFocused()
  await expect(page.locator('main')).toHaveAttribute('data-log', 'clear;input;change;')
  await expect(page.locator('c2-query-input .token')).toHaveCount(0)
})

test('submits its query with a form and follows a disabled fieldset', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-query-input name="q" value="env:prod" aria-label="Query"></c2-query-input></fieldset></form>')
  const formValue = () => page.locator('form').evaluate((form: HTMLFormElement) => new FormData(form).get('q'))
  expect(await formValue()).toBe('env:prod')
  await page.locator('fieldset').evaluate((fieldset: HTMLFieldSetElement) => (fieldset.disabled = true))
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeDisabled()
  await expect(page.locator('c2-query-input')).toHaveState('disabled')
  expect(await formValue()).toBeNull()
})

test('is accessible with the suggestions open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' value="service:web" aria-label="Query"></c2-query-input>`)
  await page.getByRole('combobox', { name: 'Query' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' st')
  await expect(options(page)).toHaveCount(1)
  await accessible(page)
})

test('the highlight scrolls with a query wider than the field', async ({ page, renderScenario }) => {
  await renderScenario('<c2-query-input aria-label="Query"></c2-query-input>')
  const input = page.getByRole('textbox', { name: 'Query' })
  await input.click()
  await page.keyboard.type('service:web '.repeat(8))
  const offsets = () =>
    input.evaluate((element: HTMLInputElement) => {
      const text = element.closest('.editor')!.querySelector<HTMLElement>('.highlight-text')!
      return { scroll: element.scrollLeft, shift: 0 - new DOMMatrix(getComputedStyle(text).transform).m41 }
    })
  await expect.poll(async () => (await offsets()).scroll).toBeGreaterThan(0)
  const { scroll, shift } = await offsets()
  expect(shift).toBe(scroll)
  await page.keyboard.press('Home')
  await expect.poll(async () => (await offsets()).shift).toBe(0)
})
