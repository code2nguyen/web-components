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

test('the paper picker changes the ruling and the paper colour', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" paper-picker value="Hello"></c2-notepad>')
  const host = page.locator('c2-notepad')
  const button = page.getByRole('button', { name: 'Paper' })
  const sheet = host.locator('.sheet')
  const plain = await sheet.evaluate((element) => getComputedStyle(element).backgroundColor)
  await watch(host, 'paper-change')

  // From the keyboard the card opens with the focus on the current choice.
  await button.focus()
  await page.keyboard.press('Enter')
  const menu = page.getByRole('dialog', { name: 'Paper' })
  await expect(menu).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('radio', { name: 'Notebook', exact: true })).toBeFocused()
  await expect(menu.getByRole('radio', { name: 'Lined', exact: true })).toHaveAttribute('aria-checked', 'true')

  await menu.getByRole('radio', { name: 'Grid', exact: true }).click()
  await expect(host).toHaveAttribute('paper', 'grid')
  await page.keyboard.press('ArrowRight')
  await expect(host).toHaveAttribute('paper', 'dot')
  await expect(menu.getByRole('radio', { name: 'Dot grid', exact: true })).toBeFocused()

  await menu.getByRole('radio', { name: 'Yellow', exact: true }).click()
  await expect(host).toHaveAttribute('paper-color', 'yellow')
  // The colours are two rows of three (White Yellow Green / Blue Pink Night): ArrowDown moves a whole row.
  await page.keyboard.press('ArrowDown')
  await expect(host).toHaveAttribute('paper-color', 'pink')
  await expect(menu.getByRole('radio', { name: 'Pink', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(host).toHaveAttribute('paper-color', 'yellow')
  await expect.poll(() => sheet.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(plain)
  await expect(host).toHaveAttribute(
    'data-events',
    JSON.stringify([
      { pad: 'notebook', paper: 'grid', paperColor: 'default' },
      { pad: 'notebook', paper: 'dot', paperColor: 'default' },
      { pad: 'notebook', paper: 'dot', paperColor: 'yellow' },
      { pad: 'notebook', paper: 'dot', paperColor: 'pink' },
      { pad: 'notebook', paper: 'dot', paperColor: 'yellow' },
    ]),
  )

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(button).toBeFocused()
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await accessible(page)
})

test('the paper picker opens on hover like a hover card, with an arrow at the button', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" paper-picker></c2-notepad><p>Elsewhere</p>')
  const button = page.getByRole('button', { name: 'Paper' })
  const menu = page.getByRole('dialog', { name: 'Paper' })
  await button.hover()
  await expect(menu).toBeVisible()
  // Hover does not take the focus away from wherever the writer was.
  await expect(menu.getByRole('radio', { name: 'Notebook', exact: true })).not.toBeFocused()
  // The arrow sits under the middle of the button.
  const arrow = await menu.evaluate((element) => parseFloat(getComputedStyle(element).getPropertyValue('--_arrow-x')) + element.getBoundingClientRect().left)
  const box = (await button.boundingBox())!
  expect(Math.abs(arrow - (box.x + box.width / 2))).toBeLessThan(2)

  // Moving onto the card keeps it open; leaving both closes it.
  await menu.getByRole('radio', { name: 'Pink', exact: true }).hover()
  await expect(menu).toBeVisible()
  await page.getByText('Elsewhere').hover()
  await expect(menu).toBeHidden()

  // A click pins it open, so leaving with the pointer does not close it.
  await button.click()
  await page.getByText('Elsewhere').hover()
  await page.waitForTimeout(400)
  await expect(menu).toBeVisible()
  await button.click()
  await expect(menu).toBeHidden()
})

test('the paper picker switches the pad, a preset of the paper variables', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" paper-picker value="Hello"></c2-notepad>')
  const host = page.locator('c2-notepad')
  const sheet = host.locator('.sheet')
  await watch(host, 'paper-change')
  await page.getByRole('button', { name: 'Paper' }).click()
  const menu = page.getByRole('dialog', { name: 'Paper' })
  await expect(menu.getByRole('radio', { name: 'Notebook', exact: true })).toHaveAttribute('aria-checked', 'true')
  await expect(menu.getByRole('radio', { name: 'White', exact: true })).toHaveAttribute('aria-checked', 'true')

  await menu.getByRole('radio', { name: 'Legal pad', exact: true }).click()
  await expect(host).toHaveAttribute('pad', 'legal')
  await expect(sheet).toHaveCSS('background-color', 'rgb(251, 241, 166)')
  await expect(host.locator('.glue')).toBeVisible()
  await expect(host.locator('.spiral')).toBeHidden()
  // The default colour is named after the pad's own colour.
  await expect(menu.getByRole('radio', { name: 'Canary', exact: true })).toHaveAttribute('aria-checked', 'true')

  // Pads sit in rows of three: ArrowDown from Notebook lands on Index card.
  await menu.getByRole('radio', { name: 'Notebook', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(host).toHaveAttribute('pad', 'index-card')

  // A paper colour still applies over the pad.
  await menu.getByRole('radio', { name: 'Pink', exact: true }).click()
  await expect(sheet).toHaveCSS('background-color', 'rgb(251, 230, 234)')
  await expect(host).toHaveAttribute(
    'data-events',
    JSON.stringify([
      { pad: 'legal', paper: 'lined', paperColor: 'default' },
      { pad: 'index-card', paper: 'lined', paperColor: 'default' },
      { pad: 'index-card', paper: 'lined', paperColor: 'pink' },
    ]),
  )
  await accessible(page)
})

test('a sticky note leans by a random angle, picked again each time it becomes one, unless the rotation is set', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-notepad label="A" pad="sticky"></c2-notepad><c2-notepad label="B" pad="sticky" style="--c2-notepad__sheet--rotate: 0deg"></c2-notepad><c2-notepad label="C"></c2-notepad>',
  )
  const rotate = (index: number) =>
    page
      .locator('c2-notepad .sheet')
      .nth(index)
      .evaluate((element) => getComputedStyle(element).rotate)
  await expect.poll(async () => Math.abs(parseFloat(await rotate(0)))).toBeGreaterThanOrEqual(1)
  expect(Math.abs(parseFloat(await rotate(0)))).toBeLessThanOrEqual(4)
  expect(await rotate(1)).toMatch(/^(none|0deg)$/)
  expect(await rotate(2)).toMatch(/^(none|0deg)$/)
  // The angle lives inside the shadow root: the host carries no attribute or style it was not given.
  await expect(page.locator('c2-notepad').first()).not.toHaveAttribute('style')

  // Switching to another pad and back picks a new angle (twenty switches never all land on the same one).
  const first = page.locator('c2-notepad').first()
  const angles = new Set<string>()
  for (let i = 0; i < 20; i++) {
    await first.evaluate((element) => (element.pad = 'notebook'))
    await expect.poll(() => rotate(0)).toMatch(/^(none|0deg)$/)
    await first.evaluate((element) => (element.pad = 'sticky'))
    await expect.poll(() => rotate(0)).not.toMatch(/^(none|0deg)$/)
    const angle = parseFloat(await rotate(0))
    expect(Math.abs(angle)).toBeGreaterThanOrEqual(1)
    expect(Math.abs(angle)).toBeLessThanOrEqual(4)
    angles.add(String(angle))
  }
  expect(angles.size).toBeGreaterThan(1)
})

test('a variable set on the element wins over the pad preset', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-notepad label="Notes" pad="sticky" style="--c2-notepad__pad-sticky--background: #ccffcc; --c2-notepad__writing--font-size: 14px"></c2-notepad>',
  )
  const sheet = page.locator('c2-notepad .sheet')
  await expect(sheet).toHaveCSS('background-color', 'rgb(204, 255, 204)')
  await expect(page.locator('c2-notepad .writing')).toHaveCSS('font-size', '14px')
  await expect(page.locator('c2-notepad .spiral')).toBeHidden()
})

test('the toolbar and the paper card follow the page when it scrolls', async ({ page, renderScenario }) => {
  await renderScenario('<div style="height:300px"></div><c2-notepad label="Notes" paper-picker></c2-notepad><div style="height:2000px"></div>')
  await surface(page).click()
  await page.keyboard.type('scroll me')
  await expect(page.locator('c2-notepad')).toHaveJSProperty('value', 'scroll me')
  await selectBack(page, 2)
  await expect(toolbar(page)).toBeVisible()
  const sheet = page.locator('c2-notepad .sheet')
  const gap = async (popover: import('@playwright/test').Locator) => (await popover.boundingBox())!.y - (await sheet.boundingBox())!.y
  const toolbarGap = await gap(toolbar(page))
  await page.evaluate(() => window.scrollBy(0, 120))
  await expect.poll(() => gap(toolbar(page))).toBeCloseTo(toolbarGap, -1)

  await page.getByRole('button', { name: 'Paper' }).click()
  const menu = page.getByRole('dialog', { name: 'Paper' })
  await expect(menu).toBeVisible()
  const menuGap = await gap(menu)
  await page.evaluate(() => window.scrollBy(0, 60))
  await expect.poll(() => gap(menu)).toBeCloseTo(menuGap, -1)
})

test('paper and paper-color work without the picker', async ({ page, renderScenario }) => {
  await renderScenario('<c2-notepad label="Notes" paper="blank" paper-color="green"></c2-notepad>')
  await expect(page.getByRole('button', { name: 'Paper' })).toHaveCount(0)
  const sheet = page.locator('c2-notepad .sheet')
  await expect.poll(() => sheet.evaluate((element) => getComputedStyle(element).getPropertyValue('--_rule-c').trim())).toBe('transparent')
  await expect(sheet).toHaveCSS('background-color', 'rgb(232, 243, 228)')
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
