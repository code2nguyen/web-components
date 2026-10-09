import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const FIELDS = JSON.stringify([
  { key: 'service', label: 'Service', values: ['web', 'api', 'billing worker'] },
  { key: 'status', label: 'Status', values: [{ value: 'error', description: '4xx and 5xx' }, 'ok'] },
  { key: 'env', values: ['prod', 'staging'] },
])

const events = async (page: Page) => JSON.parse((await page.locator('c2-query-input').getAttribute('data-events')) ?? '[]')
const options = (page: Page) => page.getByRole('option')
const chips = (page: Page) => page.locator('c2-query-input c2-chip.filter')
/** The toggle button of the chip whose text is `text`: its accessible name is the chip's text. */
const chipToggle = (page: Page, text: string) => page.getByRole('button', { name: text, exact: true })

test('standalone key:value terms become chips; grouped terms and free text stay coloured text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input value='service:web -status:>=500 (env:prod OR "timed out") NOT env:dev' aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  await expect(chips(page)).toHaveText(['service:web', '-status:>=500'])
  await expect(chips(page).nth(1)).toHaveClass(/negated/)
  await expect(page.getByRole('textbox', { name: 'Query' })).toHaveValue('(env:prod OR "timed out") NOT env:dev')
  await expect(host.locator('.highlight .token.key')).toHaveText(['env', 'env'])
  await expect(host.locator('.highlight .token.operator')).toHaveText(['OR', 'NOT'])
  await expect(host.locator('.highlight .token.paren')).toHaveText(['(', ')'])
  await expect(host.locator('.highlight .token.text')).toHaveText(['"timed out"'])
  // `value` is the chips, then the text.
  await expect(host).toHaveJSProperty('value', 'service:web -status:>=500 (env:prod OR "timed out") NOT env:dev')
  // Without `fields`, every key is accepted and the field is a plain textbox.
  await expect(host).not.toHaveState('invalid')
})

test('a chip switches off and on, and is left out of the query while off', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input name="q" value="service:web env:prod timeout" aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  await watch(host, 'search')
  const toggle = chipToggle(page, 'env:prod')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(chips(page).nth(1)).toHaveClass(/inactive/)
  await expect(host).toHaveJSProperty('value', 'service:web timeout')
  const [off] = await events(page)
  expect(off.trigger).toBe('toggle')
  expect(off.value).toBe('service:web timeout')
  expect(off.filters.map(({ text, active }: { text: string; active: boolean }) => [text, active])).toEqual([
    ['service:web', true],
    ['env:prod', false],
  ])
  // Keyboard: Space on the focused chip switches it back on.
  await toggle.focus()
  await page.keyboard.press('Space')
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(host).toHaveJSProperty('value', 'service:web env:prod timeout')
  expect((await events(page)).map((event: { trigger: string }) => event.trigger)).toEqual(['toggle', 'toggle'])
})

test('the cross removes a chip and keeps focus in the field', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input value="service:web env:prod" aria-label="Query"></c2-query-input>`)
  const host = page.locator('c2-query-input')
  await watch(host, 'search')
  await page.getByRole('button', { name: 'Remove filter service:web' }).click()
  await expect(chips(page)).toHaveText(['env:prod'])
  await expect(host).toHaveJSProperty('value', 'env:prod')
  expect((await events(page))[0]).toMatchObject({ trigger: 'remove', value: 'env:prod' })
  await expect(chipToggle(page, 'env:prod')).toBeFocused()
  // Backspace on a focused chip removes it too; focus falls back to the text.
  await page.keyboard.press('Backspace')
  await expect(chips(page)).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeFocused()
  await expect(host).toHaveJSProperty('value', '')
})

test('Backspace at the start of the text puts the last chip back for editing; arrows walk the chips', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' value="service:web env:prod" aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  await page.keyboard.press('ArrowLeft')
  await expect(chipToggle(page, 'env:prod')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(chipToggle(page, 'service:web')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(input).toBeFocused()

  await page.keyboard.press('Backspace')
  await expect(chips(page)).toHaveText(['service:web'])
  await expect(input).toHaveValue('env:prod')
  // The caret is at the end of the term, so the list offers env's values again.
  await expect(page.locator('#suggestions-label')).toHaveText('env')
  await expect(options(page).locator('.option-label')).toHaveText(['prod'])
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')
  await expect(options(page).locator('.option-label')).toHaveText(['prod', 'staging'])
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(chips(page)).toHaveText(['service:web', 'env:staging'])
  await expect(input).toHaveValue('')
})

test('Enter turns the standalone terms into chips and runs the query', async ({ page, renderScenario }) => {
  await renderScenario('<c2-query-input placeholder="Filter logs"></c2-query-input>')
  const host = page.locator('c2-query-input')
  await watch(host, 'search')
  const input = page.getByRole('textbox', { name: 'Filter logs' })
  await input.click()
  await page.keyboard.type('service:web NOT env:prod status:>=500 "timed out"')
  // Typed terms stay text until the query runs.
  await expect(chips(page)).toHaveCount(0)
  expect(await events(page)).toEqual([])
  await page.keyboard.press('Enter')
  await expect(chips(page)).toHaveText(['service:web', 'status:>=500'])
  await expect(input).toHaveValue('NOT env:prod "timed out"')
  const [detail] = await events(page)
  expect(detail.trigger).toBe('submit')
  expect(detail.value).toBe('service:web status:>=500 NOT env:prod "timed out"')
  expect(detail.terms.map(({ key, value, negated, comparator, quoted }: Record<string, unknown>) => ({ key, value, negated, comparator, quoted }))).toEqual([
    { key: 'service', value: 'web', negated: false, comparator: undefined, quoted: false },
    { key: 'status', value: '500', negated: false, comparator: '>=', quoted: false },
    { key: 'env', value: 'prod', negated: true, comparator: undefined, quoted: false },
    { key: null, value: 'timed out', negated: false, comparator: undefined, quoted: true },
  ])
})

test('suggests keys, then the values of the chosen key; a picked value becomes a chip', async ({ page, renderScenario }) => {
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
  await expect(chips(page)).toHaveText(['status:ok'])
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(host).toHaveJSProperty('value', 'status:ok')
  // A picked value completes the term and closes the list until the next keystroke.
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.type('se')
  await expect(options(page).locator('.option-label')).toHaveText(['service'])
})

test('the value list follows the key under the caret', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.fill('env:p OR service:')
  await expect(page.locator('#suggestions-label')).toHaveText('Service')
  await expect(options(page).locator('.option-label')).toHaveText(['web', 'api', 'billing worker'])
  // Back into the first term's value: the list switches to env's values, filtered by what is left of the caret.
  await page.keyboard.press('Home')
  for (let step = 0; step < 'env:p'.length; step++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('#suggestions-label')).toHaveText('env')
  await expect(options(page).locator('.option-label')).toHaveText(['prod'])
  // A term joined by OR stays text when its value is picked.
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('env:prod OR service:')
  await expect(chips(page)).toHaveCount(0)
})

test('a value with spaces is quoted, and a click picks a suggestion', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.click()
  await page.keyboard.type('service:bil')
  await expect(options(page).locator('.option-label')).toHaveText(['billing worker'])
  await options(page).first().click()
  await expect(chips(page)).toHaveText(['service:"billing worker"'])
  await expect(input).toBeFocused()
  await expect(page.locator('c2-query-input')).toHaveJSProperty('terms', [
    { key: 'service', value: 'billing worker', negated: false, quoted: true, start: 0, end: 24 },
  ])
})

test('completing a key in the middle of the text keeps the rest', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' aria-label="Query"></c2-query-input>`)
  const input = page.getByRole('combobox', { name: 'Query' })
  await input.fill('sta:ok env:prod')
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
  await expect(chips(page).first()).toHaveClass(/invalid/)
  await expect(chips(page).nth(1)).not.toHaveClass(/invalid/)
  await expect(host).toHaveState('invalid')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('button', { name: 'Remove filter host:a1' }).click()
  await expect(host).not.toHaveState('invalid')
  await expect(input).not.toHaveAttribute('aria-invalid')
  await input.fill('service:"web')
  await expect(host.locator('.token.invalid')).toHaveText(['"web'])
  await expect(host).toHaveState('invalid')
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
  await renderScenario(`<c2-query-input fields='${FIELDS}' value="service:web" aria-label="Query"></c2-query-input>`)
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
  await expect(chips(page)).toHaveCount(0)
  expect(await events(page)).toEqual([{ value: '', trigger: 'clear', terms: [], filters: [] }])
})

test('the clear button empties the field', async ({ page, renderScenario }) => {
  await renderScenario('<c2-query-input value="env:prod timeout" aria-label="Query"></c2-query-input>')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['clear', 'input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  await page.getByRole('button', { name: 'Clear query' }).click()
  await expect(page.getByRole('textbox', { name: 'Query' })).toHaveValue('')
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeFocused()
  await expect(page.locator('main')).toHaveAttribute('data-log', 'clear;input;change;')
  await expect(chips(page)).toHaveCount(0)
  await expect(page.locator('c2-query-input .token')).toHaveCount(0)
})

test('submits its query with a form, resets, and follows a disabled fieldset', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-query-input name="q" value="env:prod web" aria-label="Query"></c2-query-input></fieldset></form>')
  const formValue = () => page.locator('form').evaluate((form: HTMLFormElement) => new FormData(form).get('q'))
  expect(await formValue()).toBe('env:prod web')
  // A switched-off chip is not submitted; a reset brings it back.
  await chipToggle(page, 'env:prod').click()
  await expect.poll(formValue).toBe('web')
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  await expect(chipToggle(page, 'env:prod')).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(formValue).toBe('env:prod web')
  await page.locator('fieldset').evaluate((fieldset: HTMLFieldSetElement) => (fieldset.disabled = true))
  await expect(page.getByRole('textbox', { name: 'Query' })).toBeDisabled()
  await expect(chipToggle(page, 'env:prod')).toBeDisabled()
  await expect(page.locator('c2-query-input')).toHaveState('disabled')
  expect(await formValue()).toBeNull()
})

test('is accessible with chips, one switched off, and the suggestions open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-query-input fields='${FIELDS}' value="service:web -env:prod" aria-label="Query"></c2-query-input>`)
  await chipToggle(page, 'service:web').click()
  await page.getByRole('combobox', { name: 'Query' }).click()
  await page.keyboard.type('st')
  await expect(options(page)).toHaveCount(1)
  await accessible(page)
})

test('the in-text highlight keeps the input metrics and scrolls with a long query', async ({ page, renderScenario }) => {
  await renderScenario('<c2-query-input aria-label="Query"></c2-query-input>')
  const input = page.getByRole('textbox', { name: 'Query' })
  await input.click()
  await page.keyboard.type('service:web -status:>=500 '.repeat(5))
  const host = page.locator('c2-query-input')
  await expect(host.locator('.highlight .term')).toHaveCount(10)
  // The pending-term chips take no width: the coloured copy is exactly as wide as the input's text.
  const widths = await host.evaluate((element) => {
    const root = element.shadowRoot!
    const field = root.querySelector('input')!
    const style = getComputedStyle(field)
    return {
      input: field.scrollWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      text: root.querySelector<HTMLElement>('.highlight-text')!.getBoundingClientRect().width,
    }
  })
  expect(Math.abs(widths.input - widths.text)).toBeLessThanOrEqual(2)
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
