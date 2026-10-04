import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const page$ = (page: Page) => page.getByRole('textbox', { name: 'Notes' })
const host = (page: Page) => page.locator('c2-page-editor')
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' })
const slashMenu = (page: Page) => page.getByRole('listbox', { name: 'Insert a block' })

/**
 * Pastes `data` into the page. The clipboard data is defined on the event rather than passed to the constructor:
 * Firefox empties a `clipboardData` given to an untrusted `ClipboardEvent`.
 */
async function paste(page: Page, data: Record<string, string>) {
  await page$(page).evaluate((element, entries) => {
    const transfer = new DataTransfer()
    for (const [type, value] of Object.entries(entries)) transfer.setData(type, value)
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
  }, data)
}

async function selectBack(page: Page, count: number) {
  for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowLeft')
}

const SAMPLE = `# Launch plan

Ship the **new table** before <span data-color="red">Friday</span>, see \`c2-table\`.

- Faster sorting
  - Stable order
1. First
2. Second
- [x] Freeze the API
- [ ] Update the docs

> Easy to use matters most.

\`\`\`ts
const answer = 42
\`\`\`

---

Read the [guide](https://example.com/guide).`

test('renders every block from Markdown and writes the same Markdown back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  await host(page).evaluate((element, value) => ((element as HTMLElement & { value: string }).value = value), SAMPLE)
  const content = page$(page)
  await expect(content.locator('h1')).toHaveText('Launch plan')
  await expect(content.locator('strong')).toHaveText('new table')
  await expect(content.locator('span[data-color="red"]')).toHaveText('Friday')
  await expect(content.locator('p code')).toHaveText('c2-table')
  await expect(content.locator('.item[data-kind="bullet"][data-indent="1"]')).toHaveText('Stable order')
  await expect(content.locator('.item[data-kind="ordered"] .marker')).toHaveText(['1.', '2.'])
  await expect(content.locator('.item[data-kind="todo"]').first()).toHaveAttribute('data-checked', 'true')
  await expect(content.locator('blockquote')).toHaveText('Easy to use matters most.')
  await expect(content.locator('pre code')).toHaveText('const answer = 42')
  await expect(content.locator('.code-language')).toHaveText('TypeScript')
  await expect(content.locator('hr')).toHaveCount(1)
  await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/guide')

  // Typing anything makes the editor serialize its own document.
  await content.locator('h1').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', SAMPLE)
})

test('Markdown typed at the start of a line becomes a block, and Backspace right after undoes it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('# Title')
  await expect(content.locator('h1')).toHaveText('Title')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- ')
  await expect(content.locator('.autoformat-hint')).toHaveText('Bulleted list · ⌫ to undo')
  await page.keyboard.press('Backspace')
  await expect(content.locator('.item')).toHaveCount(0)
  await expect(content.locator('p').last()).toHaveText('- ')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Backspace')

  await page.keyboard.type('- milk')
  await page.keyboard.press('Enter')
  await page.keyboard.type('eggs')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('1. one')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('nested')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('[] call Sam')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('> quoted')
  await page.keyboard.press('Enter')
  await page.keyboard.type('a **bold**, *it*, ~~gone~~ and `code`')
  await page.keyboard.press('Enter')
  await page.keyboard.type('---')
  await page.keyboard.type('after')
  await expect(host(page)).toHaveJSProperty(
    'value',
    '# Title\n\n- milk\n- eggs\n1. one\n   1. nested\n- [ ] call Sam\n\n> quoted\n\na **bold**, *it*, ~~gone~~ and `code`\n\n---\n\nafter',
  )
})

test('Backspace at the start of a list item or heading makes it text first', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="## Heading&#10;&#10;- item"></c2-page-editor>`)
  const content = page$(page)
  await content.locator('.item-text').click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', '## Heading\n\nitem')
  await content.locator('h2').click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', 'Heading\n\nitem')
})

test('the slash menu filters as you type and inserts the chosen block', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('/')
  await expect(slashMenu(page)).toBeVisible()
  await expect(content).toHaveAttribute('aria-controls', 'slash-menu')
  await page.keyboard.type('co')
  await expect(slashMenu(page).getByRole('option').first()).toHaveText(/Code block/)
  await expect(slashMenu(page).getByRole('option', { name: /Red text/ })).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(slashMenu(page)).toBeHidden()
  await expect(content.locator('pre')).toHaveCount(1)
  await page.keyboard.type('npm test')
  await expect(host(page)).toHaveJSProperty('value', '```\nnpm test\n```')

  // Escape keeps what was typed.
  await page.keyboard.press('Control+Enter')
  await page.keyboard.type('/zzzz')
  await expect(slashMenu(page)).toBeHidden()
  await page.keyboard.press('Enter')
  await page.keyboard.type('/he')
  await expect(slashMenu(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(slashMenu(page)).toBeHidden()
  await expect(host(page)).toHaveJSProperty('value', '```\nnpm test\n```\n\n/zzzz\n\n/he')
})

test('the + button on an empty line opens the block menu, and colours apply to the line', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="Remember this"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const plus = page.getByRole('button', { name: 'Insert a block' }).first()
  await expect(plus).toBeVisible()
  await plus.click()
  await expect(slashMenu(page)).toBeVisible()
  await slashMenu(page)
    .getByRole('option', { name: /Heading 2/ })
    .click()
  await page.keyboard.type('Later')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Home')
  await page.keyboard.type('/red')
  await expect(slashMenu(page).getByRole('option').first()).toHaveText(/Red text/)
  await page.keyboard.press('Enter')
  await expect(host(page)).toHaveJSProperty('value', '<span data-color="red">Remember this</span>\n\n## Later')
})

test('the selection toolbar formats, colours and links the selected text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('ship the release')
  await expect(toolbar(page)).toBeHidden()
  await selectBack(page, 7)
  await expect(toolbar(page)).toBeVisible()
  await toolbar(page).getByRole('button', { name: 'Bold' }).click()
  await expect(host(page)).toHaveJSProperty('value', 'ship the **release**')
  await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')

  await toolbar(page).getByRole('button', { name: 'Colour' }).click()
  const palette = page.getByRole('dialog', { name: 'Colour' })
  await palette.getByRole('button', { name: 'Yellow background' }).click()
  await expect(host(page)).toHaveJSProperty('value', 'ship the <mark data-color="yellow">**release**</mark>')

  await toolbar(page).getByRole('button', { name: 'Link' }).click()
  const address = toolbar(page).getByRole('textbox', { name: 'Link address' })
  await expect(address).toBeFocused()
  await address.fill('example.com/notes')
  await address.press('Enter')
  await expect(host(page)).toHaveJSProperty('value', 'ship the [<mark data-color="yellow">**release**</mark>](https://example.com/notes)')

  await toolbar(page).getByRole('button', { name: 'Text' }).click()
  await page.getByRole('menuitemradio', { name: 'Heading 1' }).click()
  await expect(content.locator('h1')).toHaveCount(1)
})

test('a code block keeps indentation, picks a language and is left with Enter three times', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('```js ')
  await expect(content.locator('.code-language')).toHaveText('JavaScript')
  // The block with the caret shows how to indent and how to leave it.
  await expect(content.locator('.code-block.active .code-hint')).toBeVisible()
  await page.keyboard.type('if (ok) {')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.type('go()')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.type('}')
  await content.locator('.code-language').click()
  const search = page.getByRole('combobox', { name: 'Search languages' })
  await expect(search).toBeFocused()
  await search.fill('type')
  await search.press('Enter')
  await expect(content.locator('.code-language')).toHaveText('TypeScript')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('done')
  await expect(host(page)).toHaveJSProperty('value', '```typescript\nif (ok) {\n  go()\n}\n```\n\ndone')
  // Syntax colours arrive once the grammar loads.
  await expect(content.locator('pre span[style*="--_tok-token-keyword"]').first()).toHaveText('if')
})

test('ticking a to-do changes the value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="- [ ] Water the plants"></c2-page-editor>`)
  const box = page.getByRole('checkbox', { name: 'Done' })
  await expect(box).toHaveAttribute('aria-checked', 'false')
  await box.click()
  await expect(box).toHaveAttribute('aria-checked', 'true')
  await expect(host(page)).toHaveJSProperty('value', '- [x] Water the plants')
})

test('pasting Markdown or HTML keeps its structure, and a link pasted over text links it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await paste(page, { 'text/plain': '## Steps\n\n1. one\n2. two' })
  await expect(content.locator('h2')).toHaveText('Steps')
  await expect(content.locator('.item[data-kind="ordered"]')).toHaveCount(2)
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await paste(page, { 'text/html': '<ul><li>alpha<ul><li>beta</li></ul></li></ul><p style="color: red">plain <b>bold</b></p>', 'text/plain': 'alpha beta' })
  await expect(host(page)).toHaveJSProperty('value', '## Steps\n\n1. one\n2. two\n- alpha\n  - beta\n\nplain **bold**')
  await page.keyboard.type(' words')
  await selectBack(page, 5)
  await paste(page, { 'text/plain': 'https://example.com' })
  await expect(content.locator('a')).toHaveText('words')
})

test('fires input on each edit and change on blur, and takes part in forms', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-page-editor label="Notes" name="body" required></c2-page-editor></form><button>After</button>`)
  const editor = host(page)
  await expect.poll(() => editor.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await watch(editor, 'input')
  await page$(page).click()
  await page.keyboard.type('Hi')
  await expect(editor).toHaveAttribute('data-events', '[null,null]')
  await watch(editor, 'change')
  await page.getByRole('button', { name: 'After' }).click()
  await expect(editor).toHaveAttribute('data-events', '[null]')
  const data = await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('body'))
  expect(data).toBe('Hi')
  await expect.poll(() => editor.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})

test('read-only pages cannot be edited', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" readonly value="Fixed text"></c2-page-editor>`)
  const content = page$(page)
  await expect(content).toHaveAttribute('contenteditable', 'false')
  await expect(content).toHaveAttribute('aria-readonly', 'true')
  await content.click()
  await page.keyboard.type('more')
  await expect(host(page)).toHaveJSProperty('value', 'Fixed text')
})

test('blocks limits the menu and the shortcuts', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" blocks="paragraph bullet"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('# not a heading')
  await expect(content.locator('h1')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(slashMenu(page).getByRole('option')).toHaveText([/Text/, /Bulleted list/, /Default colour/, ...Array(16).fill(/./)])
})

test('is accessible with its menus open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="# Title&#10;&#10;- [ ] Task&#10;&#10;Some text"></c2-page-editor>`)
  await accessible(page)
  const content = page$(page)
  await content.locator('p').click()
  await page.keyboard.press('End')
  await selectBack(page, 4)
  await expect(toolbar(page)).toBeVisible()
  await accessible(page)
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/')
  await expect(slashMenu(page)).toBeVisible()
  await accessible(page)
})

test('code tokens take their colour from the --c2-page-editor__syntax-*--color variables', async ({ page, renderScenario }) => {
  // With the code ink set to the same colour, the 80/20 mix leaves the syntax colour itself.
  await renderScenario(
    `<c2-page-editor label="Notes" style="--c2-page-editor__syntax-keyword--color: rgb(255, 0, 0); --c2-page-editor__code-block--color: rgb(255, 0, 0)"></c2-page-editor>`,
  )
  await host(page).evaluate((element: HTMLElement & { value: string }) => (element.value = '```js\nif (ok) {}\n```'))
  const keyword = page$(page).locator('pre span[style*="--_tok-token-keyword"]').first()
  // The first code block loads shiki and its grammar, which takes longer than the default wait on a cold WebKit page.
  await expect(keyword).toHaveText('if', { timeout: 20_000 })
  // A browser serializes a mixed colour its own way: compare with the same mix computed in the page.
  const red = await page.evaluate(() => {
    const probe = document.body.appendChild(document.createElement('span'))
    probe.style.color = 'color-mix(in srgb, rgb(255, 0, 0) 80%, rgb(255, 0, 0))'
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  await expect(keyword).toHaveCSS('color', red)
  await host(page).evaluate((element) => element.style.setProperty('--c2-page-editor__syntax-keyword--color', 'rgb(0, 0, 255)'))
  await expect(keyword).not.toHaveCSS('color', red)
})
