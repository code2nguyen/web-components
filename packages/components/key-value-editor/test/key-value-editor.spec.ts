import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'
import { formatEnv, parseEnv } from '../src/dotenv'

const editor = (attributes = '', children = '') => `<c2-key-value-editor label="Environment variables" ${attributes}>${children}</c2-key-value-editor>`

const entries = (host: Locator) => host.evaluate((element) => (element as HTMLElement & { entries: unknown }).entries)

/** Pastes text into the focused field through a real `paste` event carrying it, as the clipboard would. */
async function paste(page: Page, text: string) {
  await page.evaluate((data) => {
    let target = document.activeElement
    while (target?.shadowRoot?.activeElement) target = target.shadowRoot.activeElement
    const transfer = new DataTransfer()
    transfer.setData('text/plain', data)
    const event = new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true })
    // Some engines drop `clipboardData` from the constructor; define it so the event carries the text either way.
    if (!event.clipboardData) Object.defineProperty(event, 'clipboardData', { value: transfer })
    // An untrusted paste has no default action, so play the browser's part when the component lets it through.
    if (target?.dispatchEvent(event) && target instanceof HTMLInputElement) {
      target.setRangeText(data.replace(/\r?\n/g, ''), target.selectionStart ?? 0, target.selectionEnd ?? 0, 'end')
      target.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertFromPaste' }))
    }
  }, text)
}

test('typing into the blank row adds an entry, and Enter walks to the next row', async ({ page, renderScenario }) => {
  await renderScenario(editor())
  const host = page.locator('c2-key-value-editor')
  await expect(host).toHaveState('empty')
  await page.getByRole('textbox', { name: 'Key 1' }).click()
  await page.keyboard.type('API_URL')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Value 1' })).toBeFocused()
  await page.keyboard.type('https://api.example.com')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Key 2' })).toBeFocused()
  expect(await entries(host)).toEqual([
    { key: 'API_URL', value: 'https://api.example.com' },
    { key: '', value: '' },
  ])
  await expect(host).not.toHaveState('empty')
})

test('Backspace in an empty row removes it and returns to the previous value', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"A","value":"1"},{"key":"","value":""}]'`))
  await page.getByRole('textbox', { name: 'Key 2' }).click()
  await page.keyboard.press('Backspace')
  await expect(page.getByRole('textbox', { name: 'Key 2' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Value 1' })).toBeFocused()
})

test('the add and remove buttons edit the rows and fire input then change', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"A","value":"1"},{"key":"B","value":"2"}]'`))
  const host = page.locator('c2-key-value-editor')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  await page.getByRole('button', { name: 'Remove A' }).click()
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;change;')
  await expect(page.getByRole('textbox', { name: 'Key 1' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Key 1' })).toHaveValue('B')
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(page.getByRole('textbox', { name: 'Key 2' })).toBeFocused()
  expect(await entries(host)).toEqual([
    { key: 'B', value: '2' },
    { key: '', value: '' },
  ])
})

test('typing fires input per keystroke and change once on leaving the field', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"A","value":"1"}]'`))
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  await page.getByRole('textbox', { name: 'Value 1' }).click()
  await page.keyboard.type('23')
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;input;')
  await page.getByRole('textbox', { name: 'Key 1' }).click()
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;input;change;')
})

test('pasting a .env into a key field splits it into rows and updates existing keys', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"NODE_ENV","value":"development"},{"key":"","value":""}]'`))
  const host = page.locator('c2-key-value-editor')
  await page.getByRole('textbox', { name: 'Key 2' }).click()
  await paste(page, '# local settings\nexport DATABASE_URL="postgres://localhost/app"\nNODE_ENV=production\nGREETING="hello\\nworld" # comment\n')
  expect(await entries(host)).toEqual([
    { key: 'NODE_ENV', value: 'production' },
    { key: 'DATABASE_URL', value: 'postgres://localhost/app' },
    { key: 'GREETING', value: 'hello\nworld' },
  ])
  await expect(page.getByRole('textbox', { name: 'Value 3' })).toBeFocused()
})

test('a value field keeps a single KEY=value or plain multi-line text as typed', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"QUERY","value":""}]'`))
  const host = page.locator('c2-key-value-editor')
  await page.getByRole('textbox', { name: 'Value 1' }).click()
  await paste(page, 'a=b')
  expect(await entries(host)).toEqual([{ key: 'QUERY', value: 'a=b' }])
  await page.keyboard.press('ControlOrMeta+a')
  await paste(page, '-----BEGIN KEY-----\nabc=\n-----END KEY-----')
  expect(await entries(host)).toEqual([{ key: 'QUERY', value: '-----BEGIN KEY-----abc=-----END KEY-----' }])
})

test('masked values are hidden until revealed per row', async ({ page, renderScenario }) => {
  await renderScenario(editor(`masked entries='[{"key":"TOKEN","value":"s3cret"},{"key":"MODE","value":"dev","masked":false}]'`))
  const secret = page.getByLabel('Value 1', { exact: true })
  await expect(secret).toHaveAttribute('type', 'password')
  await expect(page.getByRole('textbox', { name: 'Value 2' })).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Show value 2' })).toHaveCount(0)
  const toggle = page.getByRole('button', { name: 'Show value 1' })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(secret).toHaveAttribute('type', 'text')
  await expect(page.getByRole('button', { name: 'Hide value 1' })).toHaveAttribute('aria-pressed', 'true')
  await accessible(page)
})

test('duplicate keys and keys outside key-pattern are refused with a message', async ({ page, renderScenario }) => {
  await renderScenario(editor(`key-pattern="[A-Z_][A-Z0-9_]*" entries='[{"key":"API","value":"1"},{"key":"API","value":"2"},{"key":"bad-key","value":"3"}]'`))
  const host = page.locator('c2-key-value-editor')
  await expect(host).toHaveState('invalid')
  await expect(page.getByRole('textbox', { name: 'Key 1' })).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('textbox', { name: 'Key 1' })).toHaveAccessibleDescription('This key is already used.')
  await expect(page.getByRole('textbox', { name: 'Key 3' })).toHaveAccessibleDescription('This key is not valid.')
  expect(await host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await page.getByRole('textbox', { name: 'Key 2' }).fill('OTHER')
  await page.getByRole('textbox', { name: 'Key 3' }).fill('GOOD_KEY')
  await expect(host).not.toHaveState('invalid')
  await expect(page.getByRole('textbox', { name: 'Key 1' })).not.toHaveAttribute('aria-invalid', 'true')
})

test('submits the rows as .env text and resets with its form', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${editor(`name="env" entries='[{"key":"A","value":"1"}]'`)}</form>`)
  const form = page.locator('form')
  await page.getByRole('textbox', { name: 'Value 1' }).fill('two words')
  await page.getByRole('button', { name: 'Add another' }).click()
  await page.keyboard.type('B')
  expect(await form.evaluate((element) => new FormData(element as HTMLFormElement).get('env'))).toBe('A="two words"\nB=')
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(page.getByRole('textbox', { name: 'Value 1' })).toHaveValue('1')
  await expect(page.getByRole('textbox', { name: 'Key 2' })).toHaveCount(0)
})

test('required is unmet until a row has a key', async ({ page, renderScenario }) => {
  await renderScenario(editor('required'))
  const host = page.locator('c2-key-value-editor')
  const valid = () => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())
  expect(await valid()).toBe(false)
  await page.getByRole('textbox', { name: 'Key 1' }).fill('A')
  expect(await valid()).toBe(true)
})

test('view mode lists the keyed rows as text, with masked values revealed on demand', async ({ page, renderScenario }) => {
  await renderScenario(
    editor(
      `mode="view" masked entries='[{"key":"TOKEN","value":"s3cret"},{"key":"REGION","value":"eu-west-1","masked":false},{"key":"","value":"dropped"}]'`,
      '<button slot="actions">Edit</button>',
    ),
  )
  const host = page.locator('c2-key-value-editor')
  await expect(host).toHaveState('view')
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add another' })).toHaveCount(0)
  await expect(page.getByRole('term')).toHaveText(['TOKEN', 'REGION'])
  await expect(page.getByRole('definition').nth(1)).toHaveText('eu-west-1')
  await expect(page.getByRole('definition').first()).not.toContainText('s3cret')
  await page.getByRole('button', { name: 'Show TOKEN' }).click()
  await expect(page.getByRole('definition').first()).toContainText('s3cret')
  await expect(page.getByRole('button', { name: 'Hide TOKEN' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
  await accessible(page)
})

test('view mode with no keyed rows shows the empty slot', async ({ page, renderScenario }) => {
  await renderScenario(editor('mode="view"'))
  await expect(page.locator('c2-key-value-editor')).toContainText('No variables')
  await renderScenario(editor('mode="view"', '<span slot="empty">Nothing configured yet</span>'))
  await expect(page.getByText('Nothing configured yet')).toBeVisible()
})

test('switching to edit mode turns the rows back into fields', async ({ page, renderScenario }) => {
  await renderScenario(editor(`mode="view" entries='[{"key":"A","value":"1"}]'`))
  await page.locator('c2-key-value-editor').evaluate((element) => element.setAttribute('mode', 'edit'))
  await expect(page.getByRole('textbox', { name: 'Value 1' })).toHaveValue('1')
})

test('lock-keys shows keys as text, names each value field by its key, and allows no add or remove', async ({ page, renderScenario }) => {
  await renderScenario(editor(`lock-keys entries='[{"key":"DATABASE_URL","value":""},{"key":"API_KEY","value":""}]'`))
  const host = page.locator('c2-key-value-editor')
  await expect(page.getByRole('textbox', { name: 'Key 1' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add another' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Remove/ })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'DATABASE_URL' }).click()
  await page.keyboard.type('postgres://db')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'API_KEY' })).toBeFocused()
  // Enter on the last row adds nothing when keys are locked.
  await page.keyboard.press('Enter')
  expect(await entries(host)).toEqual([
    { key: 'DATABASE_URL', value: 'postgres://db' },
    { key: 'API_KEY', value: '' },
  ])
  await accessible(page)
})

test('with lock-keys, a pasted .env fills the matching rows and drops the rest', async ({ page, renderScenario }) => {
  await renderScenario(editor(`lock-keys entries='[{"key":"DATABASE_URL","value":""},{"key":"API_KEY","value":""}]'`))
  const host = page.locator('c2-key-value-editor')
  await page.getByRole('textbox', { name: 'DATABASE_URL' }).click()
  await paste(page, 'DATABASE_URL=postgres://db\nAPI_KEY=abc\nUNKNOWN=1')
  expect(await entries(host)).toEqual([
    { key: 'DATABASE_URL', value: 'postgres://db' },
    { key: 'API_KEY', value: 'abc' },
  ])
})

test('an entry with lockKey keeps its key and cannot be removed, while other rows stay editable', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"NODE_ENV","value":"production","lockKey":true},{"key":"FEATURE","value":"on"}]'`))
  await expect(page.getByRole('textbox', { name: 'NODE_ENV' })).toHaveValue('production')
  await expect(page.getByRole('button', { name: 'Remove NODE_ENV' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Key 2' })).toHaveValue('FEATURE')
  await page.getByRole('button', { name: 'Remove FEATURE' }).click()
  await expect(page.getByRole('textbox', { name: 'NODE_ENV' })).toBeFocused()
})

test('disabled turns off every control', async ({ page, renderScenario }) => {
  await renderScenario(editor(`disabled entries='[{"key":"A","value":"1"}]'`))
  await expect(page.getByRole('textbox', { name: 'Key 1' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add another' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Remove A' })).toBeDisabled()
  await expect(page.locator('c2-key-value-editor')).toHaveState('disabled')
})

test('has no axe violations with rows and a hint', async ({ page, renderScenario }) => {
  await renderScenario(editor(`entries='[{"key":"A","value":"1"}]'`, '<span slot="hint">Paste a .env file into a key field.</span>'))
  await accessible(page)
})

test('parseEnv and formatEnv round-trip quoting and escapes', () => {
  const entries = [
    { key: 'PLAIN', value: 'abc=def' },
    { key: 'SPACES', value: ' padded ' },
    { key: 'MULTI', value: 'line one\nline "two"' },
    { key: 'HASH', value: 'a #b' },
    { key: 'EMPTY', value: '' },
  ]
  expect(parseEnv(formatEnv(entries))).toEqual(entries)
  expect(parseEnv("A='single # kept'\nB=`tick`\nC=1 # dropped")).toEqual([
    { key: 'A', value: 'single # kept' },
    { key: 'B', value: 'tick' },
    { key: 'C', value: '1' },
  ])
  expect(parseEnv('not an env file\nA=1')).toBeNull()
  expect(parseEnv('A=1\nA=2')).toEqual([{ key: 'A', value: '2' }])
})
