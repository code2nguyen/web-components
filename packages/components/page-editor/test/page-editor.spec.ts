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

/**
 * Home moves the browser's caret, and ProseMirror picks a caret move up from an asynchronous `selectionchange`: the
 * click's own selection can land after Home and put the caret back, and a key pressed before the editor caught up acts
 * on the old selection. Press Home until the editor's own selection is at the start of its block (pressing it again is
 * harmless).
 */
async function pressHome(page: Page) {
  const offset = () =>
    host(page).evaluate((element) => {
      const { view } = element as unknown as { view: { state: { selection: { $from: { parentOffset: number } } } } }
      return view.state.selection.$from.parentOffset
    })
  await expect(async () => {
    await page.keyboard.press('Home')
    await expect.poll(offset, { timeout: 500 }).toBe(0)
  }).toPass()
}

test('an empty heading just made by Markdown shows the undo note, not its placeholder under it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('## ')
  await expect(content.locator('.autoformat-hint')).toHaveText('Heading 2 · ⌫ to undo')
  await expect(content.locator('h2')).not.toHaveClass(/placeholder/)
  // Once the note goes, the empty heading names itself again.
  await page.keyboard.type('x')
  await page.keyboard.press('Backspace')
  await expect(content.locator('h2')).toHaveAttribute('data-placeholder', 'Heading 2')
})

test('Backspace at the start of a list item or heading makes it text first', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="## Heading&#10;&#10;- item"></c2-page-editor>`)
  const content = page$(page)
  await content.locator('.item-text').click()
  await pressHome(page)
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', '## Heading\n\nitem')
  await content.locator('h2').click()
  await pressHome(page)
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
  await page.keyboard.press('ControlOrMeta+Enter')
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

test("a web page's lines pasted as one paragraph of <br>s become lines of their own, so a heading takes one, and - lines a list", async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const content = page$(page)
  await content.click()
  await paste(page, {
    'text/html': '<div>Details<br>A flat in Hanoi.<br><br>- 91 m²<br>- South-east balcony</div>',
    'text/plain': 'Details\nA flat in Hanoi.\n\n- 91 m²\n- South-east balcony',
  })
  await expect(content.locator('p')).toHaveCount(2)
  await expect(content.locator('.item[data-kind="bullet"]')).toHaveText(['91 m²', 'South-east balcony'])
  await content.locator('p', { hasText: 'Details' }).click()
  // A key, so the editor has taken the caret from the click before the block changes.
  await page.keyboard.press('ArrowLeft')
  await host(page).evaluate((element: HTMLElement & { setBlock(block: string): boolean }) => element.setBlock('heading2'))
  await expect(content.locator('h2')).toHaveText('Details')
  await expect(content.locator('p')).toHaveCount(1)
  await expect(host(page)).toHaveJSProperty('value', '## Details\n\nA flat in Hanoi.\n\n- 91 m²\n- South-east balcony')

  // Copied from a page editor, a line break typed with Shift+Enter stays one.
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await paste(page, { 'text/html': '<p data-pm-slice="0 0 []">one<br>two</p>', 'text/plain': 'one\ntwo' })
  await expect(content.locator('p', { hasText: 'one' }).locator('br')).toHaveCount(1)
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

const cell = (page: Page, ref: string) => page.locator(`c2-page-editor c2-spreadsheet #cell-${ref}`)
const grid = (page: Page) => page.locator('c2-page-editor c2-spreadsheet [role="grid"]')
const columnHeader = (page: Page, index: number) => page.locator('c2-page-editor c2-spreadsheet .column-header').nth(index)
const nameField = (page: Page) => page.locator('c2-page-editor c2-spreadsheet .label-editor')
const menuItem = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)

const TABLE = `Before

<!-- table: formula-bar -->
| Item | Cost |
| --- | ---: |
| Bus \\| night | 450 |
| Total | =SUM(B1:B1) |

After`

test('a pipe table is a spreadsheet whose edits are written back as a pipe table', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const editor = host(page)
  await editor.evaluate((element, value) => ((element as HTMLElement & { value: string }).value = value), TABLE)
  // The header names the columns; the rows under it are numbered from 1.
  await expect(columnHeader(page, 0)).toHaveText(/A\s*Item/)
  await expect(columnHeader(page, 1)).toHaveText(/B\s*Cost/)
  await expect(cell(page, 'A1')).toHaveText('Bus | night')
  await expect(cell(page, 'B2')).toHaveText('450')
  await expect(page.locator('c2-page-editor c2-spreadsheet .formula-input')).toBeVisible()
  await expect(editor).toHaveJSProperty('text', 'Before\nItem\tCost\nBus | night\t450\nTotal\t=SUM(B1:B1)\nAfter')

  // One `input` from the page per edit: the sheet's own events stay inside it.
  await watch(editor, 'input')
  await cell(page, 'B1').click()
  await page.keyboard.type('500')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'B2')).toHaveText('500')
  await expect(editor).toHaveAttribute('data-events', '[null]')
  await expect(editor).toHaveJSProperty('value', TABLE.replace('| 450 |', '| 500 |'))

  // Double-clicking a column header renames the column, which is the header row of the value.
  await columnHeader(page, 1).dblclick()
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Price')
  await page.keyboard.press('Enter')
  await expect(editor).toHaveJSProperty('value', TABLE.replace('| 450 |', '| 500 |').replace('| Item | Cost |', '| Item | Price |'))
})

test('the slash menu inserts a table that takes the keyboard, and the arrows and Escape leave it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const editor = host(page)
  const content = page$(page)
  await content.click()
  await page.keyboard.type('Intro')
  await page.keyboard.press('Enter')
  await page.keyboard.type('/table')
  await expect(slashMenu(page).getByRole('option').first()).toHaveText(/Table/)
  await page.keyboard.press('Enter')
  // A new table starts on the name of its first column; Tab goes on to the next one, Enter to the first row.
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.type('Name')
  await page.keyboard.press('Tab')
  await page.keyboard.type('Age')
  await page.keyboard.press('Enter')
  await expect(grid(page)).toBeFocused()
  await expect(editor).toHaveJSProperty('value', 'Intro\n\n| Name | Age |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |')

  // ArrowUp on the first row leaves for the line above, ArrowDown at its end comes back.
  await expect(cell(page, 'A1')).toHaveCSS('outline-style', 'solid')
  await page.keyboard.press('ArrowUp')
  await expect(content).toBeFocused()
  // Left behind, the table shows no current cell.
  await expect(cell(page, 'A1')).toHaveCSS('outline-style', 'none')
  await page.keyboard.type('!')
  await page.keyboard.press('ArrowDown')
  await expect(grid(page)).toBeFocused()
  await expect(cell(page, 'A1')).toHaveClass(/active/)
  await expect(cell(page, 'A1')).toHaveCSS('outline-style', 'solid')

  // Escape selects the table as a block: typing leaves it alone, Enter goes back in, Backspace removes it.
  await page.keyboard.press('Escape')
  await expect(content.locator('.table-block')).toHaveClass(/ProseMirror-selectednode/)
  await page.keyboard.type('x')
  await page.keyboard.press('Enter')
  await expect(grid(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Backspace')
  await expect(content.locator('.table-block')).toHaveCount(0)
  await expect(editor).toHaveJSProperty('value', 'Intro!')
})

test('the right-click menu and the buttons under a table change its rows, columns and options', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="| A | B |&#10;| --- | --- |&#10;| 1 | 2 |"></c2-page-editor>`)
  const editor = host(page)
  await expect(cell(page, 'A1')).toHaveText('1')
  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'row-below').click()
  await expect(editor).toHaveJSProperty('value', '| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |')

  await cell(page, 'B1').click({ button: 'right' })
  await menuItem(page, 'formula-bar').click()
  await expect(page.locator('c2-page-editor c2-spreadsheet .formula-input')).toBeVisible()
  await expect(editor).toHaveJSProperty('value', '<!-- table: formula-bar -->\n| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |')

  await cell(page, 'B1').click({ button: 'right' })
  await menuItem(page, 'delete-columns').click()
  // A new column opens with its name to type.
  await page$(page).getByRole('button', { name: 'New column' }).click()
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.type('C')
  await page.keyboard.press('Enter')
  await expect(editor).toHaveJSProperty('value', '<!-- table: formula-bar -->\n| A | C |\n| --- | --- |\n| 1 |  |\n|  |  |')

  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'rename-column').click()
  await expect(nameField(page)).toBeFocused()
  await page.keyboard.type('Name')
  await page.keyboard.press('Enter')
  await expect(columnHeader(page, 0)).toHaveText(/A\s*Name/)

  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'delete-table').click()
  await expect(page$(page).locator('.table-block')).toHaveCount(0)
  await expect(editor).toHaveJSProperty('value', '')
})

test('the right-click menu adds a total under the selected cells', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="| Item | Cost |&#10;| --- | --- |&#10;| Hotel | 2 |&#10;| Taxi | 3 |"></c2-page-editor>`)
  const editor = host(page)
  // One cell: nothing to total.
  await cell(page, 'B1').click({ button: 'right' })
  await expect(menuItem(page, 'total')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await cell(page, 'B1').click()
  await page.keyboard.press('Shift+ArrowDown')
  await cell(page, 'B2').click({ button: 'right' })
  await menuItem(page, 'total').hover()
  await menuItem(page, 'total-SUM').click()
  await expect(editor).toHaveJSProperty('value', '| Item | Cost |\n| --- | --- |\n| Hotel | 2 |\n| Taxi | 3 |\n|  | =SUM(B1:B2) |')
  await expect(cell(page, 'B3')).toHaveText('5')
})

test('cell styles are written as page text styles in the pipe table, and read back', async ({ page, renderScenario }) => {
  const value = [
    '| Item | Cost |',
    '| --- | --- |',
    '| <mark data-color="yellow"><span data-color="red" data-size="large">**Hotel**</span></mark> | 2 |',
    '| \\**not bold** | <span data-size="small">3</span> |',
  ].join('\n')
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const editor = host(page)
  await editor.evaluate((element: HTMLElement & { value: string }, markdown) => (element.value = markdown), value)
  await expect(cell(page, 'A1')).toHaveText('Hotel')
  await expect(cell(page, 'A1')).toHaveClass(/background-yellow/)
  await expect(cell(page, 'A1')).toHaveClass(/color-red/)
  await expect(cell(page, 'A1')).toHaveClass(/bold/)
  await expect(cell(page, 'A2')).toHaveText('**not bold**')
  await expect(cell(page, 'A2')).not.toHaveClass(/bold/)
  await expect(cell(page, 'B2')).toHaveClass(/size-small/)

  // An edit writes the table back with its styles as they were.
  await cell(page, 'B1').click()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await expect(editor).toHaveJSProperty('value', value.replace('| 2 |', '| 5 |'))
})

test('the right-click menu makes cells bold, colours them and sizes them', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="| Item | Cost |&#10;| --- | --- |&#10;| Hotel | 2 |"></c2-page-editor>`)
  const editor = host(page)
  await cell(page, 'A1').click()
  await page.keyboard.press('Shift+ArrowRight')
  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'bold').click()
  await expect(editor).toHaveJSProperty('value', '| Item | Cost |\n| --- | --- |\n| **Hotel** | **2** |')

  await cell(page, 'A1').click({ button: 'right' })
  await expect(menuItem(page, 'bold')).toHaveJSProperty('checked', true)
  await menuItem(page, 'text-colour').hover()
  // The swatches show the page's colours, though the menu renders outside the page's stylesheet.
  const red = await page$(page).evaluate((element) => getComputedStyle(element).getPropertyValue('--_color-red'))
  expect(red).not.toBe('')
  await expect(menuItem(page, 'color-red').locator('[data-color="red"]')).not.toHaveCSS(
    'color',
    await menuItem(page, 'color-default')
      .locator('span')
      .evaluate((element) => getComputedStyle(element).color),
  )
  await menuItem(page, 'color-red').click()
  await expect(cell(page, 'B1')).toHaveClass(/color-red/)

  await cell(page, 'A1').click()
  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'background-colour').hover()
  await menuItem(page, 'background-yellow').click()
  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'text-size').hover()
  await menuItem(page, 'size-large').click()
  await expect(editor).toHaveJSProperty(
    'value',
    '| Item | Cost |\n| --- | --- |\n| <mark data-color="yellow"><span data-color="red" data-size="large">**Hotel**</span></mark> | <span data-color="red">**2**</span> |',
  )

  // Ctrl/⌘+B in the sheet is saved too, and undo takes it back.
  await page.keyboard.press('ControlOrMeta+b')
  await expect
    .poll(() => editor.evaluate((element: HTMLElement & { value: string }) => element.value))
    .toMatch(/\| <mark data-color="yellow"><span data-color="red" data-size="large">Hotel<\/span><\/mark> \|/)
})

test('a style from the right-click menu applies to every cell of a range selected with the mouse', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="| A | B |&#10;| --- | --- |&#10;| 1 | 2 |&#10;| 3 | 4 |"></c2-page-editor>`)
  await cell(page, 'A1').hover()
  await page.mouse.down()
  await cell(page, 'B2').hover()
  await page.mouse.up()
  const cells = ['A1', 'B1', 'A2', 'B2']
  await cell(page, 'B2').click({ button: 'right' })
  await menuItem(page, 'text-size').hover()
  await menuItem(page, 'size-large').click()
  await cell(page, 'A1').click({ button: 'right' })
  await menuItem(page, 'text-colour').hover()
  await menuItem(page, 'color-blue').click()
  await cell(page, 'B1').click({ button: 'right' })
  await menuItem(page, 'background-colour').hover()
  await menuItem(page, 'background-green').click()
  for (const ref of cells) {
    await expect(cell(page, ref)).toHaveClass(/size-large/)
    await expect(cell(page, ref)).toHaveClass(/color-blue/)
    await expect(cell(page, ref)).toHaveClass(/background-green/)
  }
})

test('the selection stays highlighted while the right-click menu is open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" value="| A | B |&#10;| --- | --- |&#10;| 1 | 2 |&#10;| 3 | 4 |"></c2-page-editor>`)
  await cell(page, 'A1').click()
  await page.keyboard.press('Shift+ArrowRight')
  const background = await cell(page, 'B1').evaluate((element) => getComputedStyle(element).backgroundImage)
  expect(background).not.toBe('none')
  await cell(page, 'B1').click({ button: 'right' })
  await expect(menuItem(page, 'bold')).toBeVisible()
  await expect(cell(page, 'B1')).toHaveCSS('background-image', background)
  await expect(cell(page, 'A1')).toHaveCSS('outline-style', 'solid')
  // Closed and left for the text, the table hides its selection again.
  await page.keyboard.press('Escape')
  await page$(page).locator('p').last().click()
  await expect(cell(page, 'B1')).not.toHaveCSS('background-image', background)
})

test('cells pasted from a sheet make a table, and a single cell is pasted as text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes"></c2-page-editor>`)
  const editor = host(page)
  await page$(page).click()
  await paste(page, {
    'text/html':
      '<google-sheets-html-origin><table><tbody><tr><td>Item</td><td>Qty</td></tr><tr><td>Pens</td><td>4</td></tr></tbody></table></google-sheets-html-origin>',
    'text/plain': 'Item\tQty\nPens\t4',
  })
  await expect(columnHeader(page, 0)).toHaveText(/A\s*Item/)
  await expect(cell(page, 'A1')).toHaveText('Pens')
  await expect(editor).toHaveJSProperty('value', '| Item | Qty |\n| --- | --- |\n| Pens | 4 |')

  await editor.evaluate((element) => ((element as HTMLElement & { value: string }).value = ''))
  await page$(page).click()
  await paste(page, { 'text/html': '<table><tr><td>42</td></tr></table>', 'text/plain': '42' })
  await expect(editor).toHaveJSProperty('value', '42')

  // Without HTML, tab-separated lines are a sheet too.
  await page.keyboard.press('Enter')
  await paste(page, { 'text/plain': 'a\tb\nc\td' })
  await expect(editor).toHaveJSProperty('value', '42\n\n| a | b |\n| --- | --- |\n| c | d |')
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
  await page.keyboard.press('Escape')
  await page.keyboard.press('Backspace')
  // A table is not allowed: pasted, its rows become lines of text.
  await paste(page, { 'text/html': '<table><tr><th>Item</th><th>Qty</th></tr><tr><td>Pens</td><td>4</td></tr></table>', 'text/plain': 'Item\tQty\nPens\t4' })
  await expect(page$(page).locator('.table-block')).toHaveCount(0)
  await expect(host(page)).toHaveJSProperty('value', '\\# not a heading\n\nItem | Qty\n\nPens | 4')
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
  const errors: string[] = []
  page.on('console', (message) => ['error', 'warning'].includes(message.type()) && !message.text().includes('lit.dev/msg') && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  await host(page).evaluate((element: HTMLElement & { value: string }) => (element.value = '```js\nif (ok) {}\n```'))
  const block = page$(page).locator('pre').first()
  await expect(page$(page).locator('.code-language')).toHaveText('JavaScript')
  await expect(block).toContainText('if (ok)')
  const keyword = block.locator('span[style*="--_tok-token-keyword"]').first()
  try {
    await expect(keyword).toHaveText('if', { timeout: 15_000 })
  } catch (error) {
    // Say what the block holds instead, so a failure in one engine shows whether tokens are missing or coloured otherwise.
    const html = await block.evaluate((element) => element.outerHTML)
    // The editor's own view of it: the block's language and how many syntax decorations the highlighter holds.
    const editor = await host(page).evaluate((element) => {
      type Plugin = { key: string; getState(state: unknown): { find(): unknown[] } | undefined }
      type View = { state: { plugins: Plugin[]; doc: { firstChild: { attrs: { language?: string } } | null } } }
      const { view } = element as unknown as { view: View }
      const highlight = view.state.plugins.find((plugin) => plugin.key.startsWith('c2-page-editor-highlight'))
      return { language: view.state.doc.firstChild?.attrs.language, decorations: highlight?.getState(view.state)?.find().length }
    })
    throw new Error(`${(error as Error).message}\ncode block: ${html}\neditor: ${JSON.stringify(editor)}\npage errors: ${JSON.stringify(errors)}`, {
      cause: error,
    })
  }
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

test('the interface follows the nearest lang, including placeholders and code blocks already drawn', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-page-editor label="Notes"></c2-page-editor></div>`)
  const content = page$(page)
  const lang = (value: string) => page.locator('div[lang]').evaluate((el, value) => el.setAttribute('lang', value), value)
  await content.click()
  await expect(content.locator('[data-placeholder]')).toHaveAttribute('data-placeholder', 'Tapez « / » pour les commandes')
  await page.keyboard.type('/')
  const frenchMenu = page.getByRole('listbox', { name: 'Insérer un bloc' })
  await expect(frenchMenu.getByRole('option', { name: /Titre 1/ })).toBeVisible()
  // The menu matches the names in the page's language, and still the English ones.
  await page.keyboard.type('sépa')
  await expect(frenchMenu.getByRole('option').first()).toHaveText(/Séparateur/)
  await page.keyboard.press('Escape')
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')

  // The placeholder already on screen follows a language switch.
  await lang('vi')
  await expect(content.locator('[data-placeholder]')).toHaveAttribute('data-placeholder', 'Gõ “/” để mở lệnh')
  await page.keyboard.type('/tieu')
  await expect(page.getByRole('listbox', { name: 'Chèn khối' }).getByRole('option').first()).toHaveText(/Tiêu đề 1/)
  await page.keyboard.press('Escape')
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace')
  await page.keyboard.type('```js ')
  await expect(content.locator('.code-copy')).toHaveAttribute('aria-label', 'Sao chép mã')
  await expect(content.locator('.code-language')).toHaveAttribute('aria-label', 'Ngôn ngữ: JavaScript')
  await page.keyboard.press('ControlOrMeta+Enter')
  await page.keyboard.type('xin chao')
  await selectBack(page, 4)
  await expect(page.getByRole('toolbar', { name: 'Định dạng' }).getByRole('button', { name: 'Đậm' })).toBeVisible()

  // A language the component does not ship falls back to English, in the code block drawn before the switch too.
  await lang('de')
  await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toBeVisible()
  await expect(content.locator('.code-copy')).toHaveAttribute('aria-label', 'Copy code')
  await expect(content.locator('.code-language')).toHaveAttribute('aria-label', 'Language: JavaScript')
  await expect(content.locator('.code-hint')).toContainText('leave the block')
})

test('a table frame ends with its last column, and a table wider than the page scrolls inside it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-page-editor label="Notes" style="width: 700px" value="| A | B |\n| --- | --- |\n| 1 | 2 |"></c2-page-editor>`)
  const frame = page.locator('c2-page-editor .table-sheet .spreadsheet')
  const grid = page.locator('c2-page-editor .table-sheet .grid')
  const [frameBox, gridBox] = [await frame.boundingBox(), await grid.boundingBox()]
  // The frame's 1px border on each side, no more; the block (its outline, its tools) is as wide.
  expect(frameBox!.width - gridBox!.width).toBeLessThanOrEqual(2)
  expect(Math.round((await page.locator('c2-page-editor .table-block').boundingBox())!.width)).toBe(Math.round(frameBox!.width))
  await page.locator('c2-page-editor').evaluate((element: HTMLElement & { value: string }) => {
    const header = Array.from({ length: 12 }, (_, index) => `C${index}`)
    element.value = `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n| ${header.map(() => 'x').join(' | ')} |`
  })
  const content = await page.locator('c2-page-editor .ProseMirror').boundingBox()
  await expect.poll(async () => (await frame.boundingBox())!.width).toBeLessThanOrEqual(content!.width)
  expect(await page.locator('c2-page-editor .table-sheet .scroller').evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
})
