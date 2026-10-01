import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const surface = (page: Page) => page.getByRole('textbox', { name: 'Notes' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' })

/** Selects the last `count` characters before the caret with real keyboard input. Wait for the typed value first. */
async function selectBack(page: Page, count: number) {
  for (let i = 0; i < count; i++) await page.keyboard.press('Shift+ArrowLeft')
}

test('typing writes Markdown into value and fires input, then change on blur', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes"></c2-notepad><button>After</button>')
  const host = page.locator('c2-notepad')
  await watch(host, 'input')
  await surface(page).click()
  await page.keyboard.type('Call the bank')
  await page.keyboard.press('Enter')
  await page.keyboard.type('about **late fees** and ~~nothing~~ ==now==')
  await expect(host).toHaveJSProperty('value', 'Call the bank\nabout **late fees** and ~~nothing~~ ==now==')
  await expect(host).toHaveJSProperty('text', 'Call the bank\nabout late fees and nothing now')
  await expect(surface(page).locator('strong')).toHaveText('late fees')
  await expect(surface(page).locator('mark[data-color="yellow"]')).toHaveText('now')
  const inputs = JSON.parse((await host.getAttribute('data-events')) ?? '[]') as unknown[]
  expect(inputs.length).toBeGreaterThan(10)

  await watch(host, 'change')
  await page.getByRole('button', { name: 'After' }).click()
  await expect(host).toHaveAttribute('data-events', '[null]')
})

test('selecting text opens the tape toolbar, which formats the selection', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).click()
  await page.keyboard.type('pick up the dry cleaning')
  await expect(host).toHaveJSProperty('value', 'pick up the dry cleaning')
  await expect(toolbar(page)).toBeHidden()
  await selectBack(page, 8)
  await expect(toolbar(page)).toBeVisible()

  await toolbar(page).getByRole('button', { name: 'Bold' }).click()
  await expect(host).toHaveJSProperty('value', 'pick up the dry **cleaning**')
  await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')

  // The inks share one button: hovering it shows the colours.
  await expect(toolbar(page).getByRole('button', { name: 'Red ink' })).toBeHidden()
  await toolbar(page)
    .getByRole('button', { name: /^Ink colour/ })
    .hover()
  await toolbar(page).getByRole('button', { name: 'Red ink' }).click()
  await expect(host).toHaveJSProperty('value', 'pick up the dry <span data-ink="red">**cleaning**</span>')
  await expect(toolbar(page).getByRole('button', { name: 'Ink colour: Red ink' })).toBeVisible()
  // Picking a colour closes the flyout even though the pointer is still over it.
  await expect(toolbar(page).getByRole('button', { name: 'Green ink' })).toBeHidden()

  await toolbar(page)
    .getByRole('button', { name: /^Highlighter/ })
    .hover()
  await toolbar(page).getByRole('button', { name: 'Pink highlighter' }).click()
  await expect(host).toHaveJSProperty('value', 'pick up the dry <span data-ink="red"><mark data-color="pink">**cleaning**</mark></span>')
  await toolbar(page)
    .getByRole('button', { name: /^Ink colour/ })
    .hover()
  await toolbar(page).getByRole('button', { name: 'Default ink', exact: true }).click()
  await expect(host).toHaveJSProperty('value', 'pick up the dry <mark data-color="pink">**cleaning**</mark>')

  // There is no clear-formatting button; the shortcut remains.
  await expect(toolbar(page).getByRole('button', { name: 'Clear formatting' })).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+Backslash')
  await expect(host).toHaveJSProperty('value', 'pick up the dry cleaning')
  // The page kept focus and the selection: the toolbar is still there for the next format.
  await expect(surface(page)).toBeFocused()
  await expect(toolbar(page)).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(toolbar(page)).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(toolbar(page)).toBeHidden()
})

test('keyboard shortcuts and the toolbar are reachable without a pointer', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).focus()
  await page.keyboard.type('one two')
  await expect(host).toHaveJSProperty('value', 'one two')
  await selectBack(page, 3)
  await page.keyboard.press('ControlOrMeta+i')
  await expect(host).toHaveJSProperty('value', 'one *two*')
  await page.keyboard.press('ControlOrMeta+u')
  await expect(host).toHaveJSProperty('value', 'one *<u>two</u>*')

  await page.keyboard.press('Alt+F10')
  const bold = toolbar(page).getByRole('button', { name: 'Bold' })
  await expect(bold).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(toolbar(page).getByRole('button', { name: 'Italic' })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', 'one ***<u>two</u>***')
  await expect(bold).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(surface(page)).toBeFocused()
})

test('a colour flyout opens by tap and by keyboard', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).click()
  await page.keyboard.type('ink me')
  await expect(host).toHaveJSProperty('value', 'ink me')
  await selectBack(page, 2)
  const inks = toolbar(page).getByRole('button', { name: /^Ink colour/ })
  await expect(inks).toHaveAttribute('aria-expanded', 'false')

  // Touch screens have no hover: a tap on the button opens the flyout.
  await inks.dispatchEvent('click')
  await expect(inks).toHaveAttribute('aria-expanded', 'true')
  await expect(toolbar(page).getByRole('button', { name: 'Green ink' })).toBeVisible()
  await inks.dispatchEvent('click')
  await expect(inks).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('Alt+F10')
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight')
  await expect(inks).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(toolbar(page).getByRole('button', { name: 'Default ink', exact: true })).toBeFocused()
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(toolbar(page).getByRole('button', { name: 'Red ink' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', 'ink <span data-ink="red">me</span>')
  await expect(toolbar(page).getByRole('button', { name: 'Ink colour: Red ink' })).toBeFocused()
  await expect(inks).toHaveAttribute('aria-expanded', 'false')

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Escape')
  await expect(inks).toBeFocused()
  await expect(inks).toHaveAttribute('aria-expanded', 'false')
})

test('checklist lines: typed, continued with Enter, ticked by pointer and keyboard', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).click()
  await page.keyboard.type('[ ] milk')
  await page.keyboard.press('Enter')
  await page.keyboard.type('eggs')
  await expect(host).toHaveJSProperty('value', '- [ ] milk\n- [ ] eggs')

  await watch(host, 'check-change')
  await surface(page).getByRole('checkbox').first().click()
  await expect(host).toHaveJSProperty('value', '- [x] milk\n- [ ] eggs')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ line: 0, checked: true, text: 'milk' }]))
  await expect(surface(page).getByRole('checkbox').first()).toHaveAttribute('aria-checked', 'true')

  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(host).toHaveJSProperty('value', '- [x] milk\n- [x] eggs')

  // An empty item ends the list; Backspace at the start of an item turns it back into a line.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await page.keyboard.type('done')
  await expect(host).toHaveJSProperty('value', '- [x] milk\n- [x] eggs\ndone')
})

test('a key pressed before selectionchange arrives acts at the real caret', async ({ page, renderScenario }) => {
  // The browser reports a moved caret (a click, Ctrl+End) through an asynchronous selectionchange, and a fast key
  // can arrive first. Moving the caret and pressing Enter in one task reproduces that race deterministically.
  await renderScenario('<c2-notepad label="Notes" value="October goals&#10;- [ ] run"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).evaluate((element) => {
    const root = element.getRootNode() as ShadowRoot & { getSelection?: () => Selection | null }
    const selection = root.getSelection?.() ?? document.getSelection()!
    const last = element.querySelector('.task-text')!.firstChild!
    selection.collapse(last, last.textContent!.length)
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
  })
  await page.keyboard.type('stretch')
  await expect(host).toHaveJSProperty('value', 'October goals\n- [ ] run\n- [ ] stretch')
})

test('a value set from outside renders, and writing it back keeps the caret and the ink', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" value="- [x] **eggs**&#10;==call== mum"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await expect(surface(page).getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')
  await expect(surface(page).locator('strong')).toHaveText('eggs')
  await props(host, { value: 'Fresh <span data-ink="green">start</span>' })
  await expect(surface(page).locator('[data-ink="green"]')).toHaveText('start')

  // A framework binding writes the emitted value straight back (v-model); that must not reset the page.
  await host.evaluate((element) =>
    element.addEventListener('input', () => ((element as HTMLElement & { value: string }).value = (element as HTMLElement & { value: string }).value)),
  )
  await surface(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' now')
  // The pen keeps its ink: text typed right after inked text continues in that ink.
  await expect(host).toHaveJSProperty('value', 'Fresh <span data-ink="green">start now</span>')
})

test('participates in forms: FormData, required, maxlength and reset', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-notepad label="Notes" name="notes" value="Original" maxlength="12"></c2-notepad></form>')
  const host = page.locator('c2-notepad')
  const form = page.locator('form')
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).get('notes'))).toBe('Original')
  await surface(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' text that is far too long')
  await expect(host).toHaveJSProperty('text', 'Original tex')
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('value', 'Original')

  await props(host, { value: '', required: true })
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await surface(page).click()
  await page.keyboard.type('x')
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})

test('read-only and disabled pages cannot be written on', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" value="Keep" readonly></c2-notepad>')
  const host = page.locator('c2-notepad')
  await expect(surface(page)).toHaveAttribute('contenteditable', 'false')
  await expect(surface(page)).toHaveAttribute('aria-readonly', 'true')
  await surface(page).focus()
  await page.keyboard.type('x')
  await expect(host).toHaveJSProperty('value', 'Keep')
  await props(host, { readOnly: false, disabled: true })
  await expect(surface(page)).toHaveAttribute('aria-disabled', 'true')
  await expect(surface(page)).toHaveAttribute('contenteditable', 'false')
})

test('marks limits the toolbar, the shortcuts and pasted formatting', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" marks="bold"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).click()
  await page.keyboard.type('plain')
  await expect(host).toHaveJSProperty('value', 'plain')
  await selectBack(page, 5)
  await expect(toolbar(page).getByRole('button', { name: 'Bold' })).toBeVisible()
  await expect(toolbar(page).getByRole('button', { name: 'Italic' })).toBeHidden()
  await expect(toolbar(page).getByRole('button', { name: /^Ink colour/ })).toBeHidden()
  await expect(toolbar(page).getByRole('button', { name: /^Highlighter/ })).toBeHidden()
  await page.keyboard.press('ControlOrMeta+i')
  await expect(host).toHaveJSProperty('value', 'plain')

  await page.keyboard.press('End')
  await surface(page).evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/html', '<p><em>it</em> <strong>bold</strong></p>')
    data.setData('text/plain', 'it bold')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(host).toHaveJSProperty('value', 'plainit **bold**')
})

test('pasted plain text is read as notepad Markdown', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await surface(page).click()
  await surface(page).evaluate((element) => {
    const data = new DataTransfer()
    data.setData('text/plain', '- [ ] buy **milk**\n- [x] call')
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  })
  await expect(host).toHaveJSProperty('value', '- [ ] buy **milk**\n- [x] call')
  await expect(surface(page).getByRole('checkbox')).toHaveCount(2)
})

test('a tearable pad tears its page off, unless page-tear is cancelled', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" tearable value="To call: plumber"></c2-notepad>')
  const host = page.locator('c2-notepad')
  await watch(host, 'page-tear')
  await page.getByRole('button', { name: 'Tear off' }).click()
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ value: 'To call: plumber', page: 1 }]))
  await expect(host).toHaveJSProperty('value', '')
  await expect(host).toHaveJSProperty('page', 2)

  await surface(page).click()
  await page.keyboard.type('keep me')
  await host.evaluate((element) => element.addEventListener('page-tear', (event) => event.preventDefault()))
  await page.getByRole('button', { name: 'Tear off' }).click()
  await expect(host).toHaveJSProperty('value', 'keep me')
  await expect(host).toHaveJSProperty('page', 2)
})

test('the bundled handwriting face is registered only when the page uses it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" value="Hello"></c2-notepad>')
  await expect
    .poll(() => page.evaluate(() => [...document.fonts].some((face) => face.family.replace(/"/g, '') === 'C2 Notepad Hand' && face.status === 'loaded')))
    .toBe(true)
  await expect(surface(page)).toHaveCSS('font-family', /C2 Notepad Hand/)
})

test('representative states pass an accessibility scan', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-notepad label="Notes" value="- [ ] milk&#10;**bold** note"><span slot="header">Groceries</span></c2-notepad>
    <c2-notepad aria-label="Archived" value="Old" disabled></c2-notepad>
    <c2-notepad aria-label="Signed" value="Signed" readonly></c2-notepad>
    <c2-notepad aria-label="Required" required error error-text="Write something first"></c2-notepad>
  `)
  await expect(page.getByRole('alert')).toHaveText('Write something first')
  await surface(page).click()
  await page.keyboard.press('End')
  await selectBack(page, 4)
  await expect(toolbar(page)).toBeVisible()
  await accessible(page)
})
