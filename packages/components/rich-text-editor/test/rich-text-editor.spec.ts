import { test, expect, watch, accessible, props } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const text$ = (page: Page, name = 'Comment') => page.getByRole('textbox', { name })
const host = (page: Page) => page.locator('c2-rich-text-editor')
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Formatting' })
const tool = (page: Page, name: string) => toolbar(page).getByRole('button', { name, exact: true })

/**
 * Pastes `data` into the text. The clipboard data is defined on the event rather than passed to the constructor:
 * Firefox empties a `clipboardData` given to an untrusted `ClipboardEvent`.
 */
async function paste(page: Page, data: Record<string, string>) {
  await text$(page).evaluate((element, entries) => {
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

const events = (page: Page) => host(page).evaluate((element) => JSON.parse(element.getAttribute('data-events') ?? '[]') as unknown[])

const SAMPLE = `Thanks **Mai**, the fix looks *right*, <u>really</u> ~~maybe~~. See \`retry\`.

- First
  - Nested
1. One
2. Two

> Quoted

\`\`\`
const answer = 42
\`\`\`

Read the [guide](https://example.com/guide).`

test('renders every format from Markdown and writes the same Markdown back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment"></c2-rich-text-editor>`)
  await props(host(page), { value: SAMPLE })
  const content = text$(page)
  await expect(content.locator('strong')).toHaveText('Mai')
  await expect(content.locator('em')).toHaveText('right')
  await expect(content.locator('u')).toHaveText('really')
  await expect(content.locator('s')).toHaveText('maybe')
  await expect(content.locator('p code')).toHaveText('retry')
  await expect(content.locator('.item[data-kind="bullet"][data-indent="1"]')).toHaveText('Nested')
  await expect(content.locator('.item[data-kind="ordered"] .marker')).toHaveText(['1.', '2.'])
  await expect(content.locator('blockquote')).toHaveText('Quoted')
  await expect(content.locator('pre code')).toHaveText('const answer = 42')
  await expect(content.locator('a')).toHaveAttribute('href', 'https://example.com/guide')

  await content.locator('blockquote').click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', SAMPLE)
})

test('an empty field has an empty value and shows its placeholder', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" placeholder="Leave a comment…" value="Hi"></c2-rich-text-editor>`)
  const content = text$(page)
  await content.click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', '')
  await expect(content.locator('p.placeholder')).toHaveAttribute('data-placeholder', 'Leave a comment…')
  await expect(content).toHaveAttribute('aria-placeholder', 'Leave a comment…')
})

test('formatting shortcuts and typed Markdown format the text, and the toolbar shows what the selection carries', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment"></c2-rich-text-editor>`)
  await watch(host(page), 'format-change')
  const content = text$(page)
  await content.click()
  await page.keyboard.type('Ship it')
  await selectBack(page, 2)
  await page.keyboard.press('ControlOrMeta+b')
  await expect(host(page)).toHaveJSProperty('value', 'Ship **it**')
  await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true')
  await expect(tool(page, 'Italic')).toHaveAttribute('aria-pressed', 'false')
  expect(await events(page)).toContainEqual(expect.objectContaining({ bold: true, block: 'paragraph' }))

  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('- item')
  await expect(content.locator('.item[data-kind="bullet"]')).toHaveText('item')
  await expect(tool(page, 'Bulleted list')).toHaveAttribute('aria-pressed', 'true')
  // Backspace right after the conversion gives the typed Markdown back.
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Delete')
  await page.keyboard.type('- ')
  await page.keyboard.press('Backspace')
  await expect(content.locator('.item')).toHaveCount(0)
  await expect(host(page)).toHaveJSProperty('value', '\\- ')
})

test('the toolbar is one tab stop that the arrow keys move through', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button><c2-rich-text-editor label="Comment"></c2-rich-text-editor><button>After</button>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(tool(page, 'Bold')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tool(page, 'Italic')).toBeFocused()
  await page.keyboard.press('End')
  await expect(tool(page, 'Code block')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(tool(page, 'Bold')).toBeFocused()
  await tab()
  await expect(text$(page)).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  // The toolbar remembers the last button it had.
  await tab(true)
  await tab(true)
  await expect(tool(page, 'Bold')).toBeFocused()

  // Alt+F10 goes from the text to the toolbar, Escape back.
  await text$(page).click()
  await page.keyboard.press('Alt+F10')
  await expect(tool(page, 'Bold')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(text$(page)).toBeFocused()
  await accessible(page)
})

test('a toolbar button formats the selection and keeps it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="Plan"></c2-rich-text-editor>`)
  await text$(page).click()
  await page.keyboard.press('End')
  await selectBack(page, 4)
  await tool(page, 'Italic').click()
  await expect(host(page)).toHaveJSProperty('value', '*Plan*')
  await tool(page, 'Numbered list').click()
  await expect(host(page)).toHaveJSProperty('value', '1. *Plan*')
  await expect(text$(page)).toBeFocused()
})

test('Tab leaves the field, except in a list, where Escape gives it back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="- one&#10;- two" toolbar-position="none"></c2-rich-text-editor><button>After</button>`)
  const content = text$(page)
  await content.locator('.item-text').nth(1).click()
  await page.keyboard.press('Tab')
  await expect(content.locator('.item').nth(1)).toHaveAttribute('data-indent', '1')
  await expect(content).toBeFocused()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()

  await props(host(page), { value: 'Plain' })
  await content.click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('formats limits the toolbar, the shortcuts, typed Markdown and paste', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" formats="bold italic | bullet"></c2-rich-text-editor>`)
  await expect(toolbar(page).getByRole('button')).toHaveCount(3)
  await expect(toolbar(page).locator('.separator')).toHaveCount(1)
  const content = text$(page)
  await content.click()
  await page.keyboard.type('> not a quote')
  await expect(content.locator('blockquote')).toHaveCount(0)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+u')
  await expect(content.locator('u')).toHaveCount(0)
  await page.keyboard.press('Delete')
  await paste(page, {
    'text/html': '<h1>Title</h1><p><u>under</u> <strong>bold</strong> <span data-color="red">red</span></p><ol><li>one</li></ol>',
    'text/plain': 'x',
  })
  await expect(host(page)).toHaveJSProperty('value', 'Title\n\nunder **bold** red\n\none')
})

test('pasted styles from Google Docs become formats', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment"></c2-rich-text-editor>`)
  await text$(page).click()
  await paste(page, {
    'text/html':
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p><span style="font-weight:700;">Bold</span><span> and </span><span style="font-style:italic;">italic</span><span style="color:#ff0000"> red</span></p></b>',
    'text/plain': 'Bold and italic red',
  })
  await expect(host(page)).toHaveJSProperty('value', '**Bold** and *italic* red')
})

test('Mod+K edits a link; an unsafe address is refused', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="Read the plan"></c2-rich-text-editor>`)
  await text$(page).click()
  await page.keyboard.press('End')
  await selectBack(page, 4)
  await page.keyboard.press('ControlOrMeta+k')
  const address = page.getByRole('textbox', { name: 'Link address' })
  await expect(address).toBeFocused()
  // The text being linked stays highlighted while focus is in the popover.
  await expect(text$(page).locator('.link-target')).toHaveText('plan')
  await address.fill('example.com/plan')
  await page.keyboard.press('Enter')
  await expect(host(page)).toHaveJSProperty('value', 'Read the [plan](https://example.com/plan)')
  await expect(text$(page)).toBeFocused()

  // On the link, Mod+K opens it again with its address, and it can be removed.
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(address).toHaveValue('https://example.com/plan')
  await page.getByRole('button', { name: 'Remove link' }).click()
  await expect(host(page)).toHaveJSProperty('value', 'Read the plan')
  await expect(text$(page).locator('.link-target')).toHaveCount(0)

  expect(await host(page).evaluate((element) => element.setLink('javascript:alert(1)'))).toBe(false)
  await expect(host(page)).toHaveJSProperty('value', 'Read the plan')
})

test('Escape closes the link popover and returns to the text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="Read"></c2-rich-text-editor>`)
  await text$(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await tool(page, 'Link').click()
  await expect(page.getByRole('dialog', { name: 'Link' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Link' })).toBeHidden()
  await expect(text$(page)).toBeFocused()
})

test('takes part in a form: value, reset, required, maxlength and a disabled fieldset', async ({ page, renderScenario }) => {
  await renderScenario(`<form>
    <fieldset>
      <c2-rich-text-editor label="Comment" name="body" value="Hello" required maxlength="10"></c2-rich-text-editor>
    </fieldset>
  </form>`)
  const read = () => page.locator('main > form').evaluate((form: HTMLFormElement) => new FormData(form).get('body'))
  expect(await read()).toBe('Hello')
  await expect(host(page).locator('.counter')).toHaveText('5 / 10')

  await text$(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' world, again')
  await expect(host(page).locator('.counter')).toHaveText('18 / 10')
  await expect(host(page)).toHaveState('error')
  expect(await host(page).evaluate((element) => element.validity.tooLong)).toBe(true)
  await expect(text$(page)).toHaveAttribute('aria-invalid', 'true')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('Backspace')
  expect(await host(page).evaluate((element) => element.validity.valueMissing)).toBe(true)

  await page.locator('main > form').evaluate((form: HTMLFormElement) => form.reset())
  await expect(host(page)).toHaveJSProperty('value', 'Hello')
  expect(await host(page).evaluate((element) => element.checkValidity())).toBe(true)

  await page.locator('fieldset').evaluate((fieldset: HTMLFieldSetElement) => (fieldset.disabled = true))
  await expect(text$(page)).toHaveAttribute('contenteditable', 'false')
  expect(await read()).toBeNull()
})

test('Mod+Enter fires a cancelable submit that submits the form', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-rich-text-editor label="Comment" name="body" value="Ship"></c2-rich-text-editor></form>`)
  await page.locator('main > form').evaluate((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      form.setAttribute('data-submitted', String(Number(form.getAttribute('data-submitted') ?? 0) + 1))
    })
  })
  await host(page).evaluate((element) => element.addEventListener('submit', (event) => element.hasAttribute('data-block') && event.preventDefault()))
  await text$(page).click()
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('main > form')).toHaveAttribute('data-submitted', '1')
  await host(page).evaluate((element) => element.setAttribute('data-block', ''))
  await page.keyboard.press('ControlOrMeta+Enter')
  await expect(page.locator('main > form')).toHaveAttribute('data-submitted', '1')
  await expect(host(page)).toHaveJSProperty('value', 'Ship')
})

test('fires input on each edit and change on blur', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment"></c2-rich-text-editor><button>After</button>`)
  await host(page).evaluate((element) => {
    for (const name of ['input', 'change'])
      element.addEventListener(name, () => element.setAttribute(`data-${name}`, String(Number(element.getAttribute(`data-${name}`) ?? 0) + 1)))
  })
  await text$(page).click()
  await page.keyboard.type('ab')
  await expect(host(page)).toHaveAttribute('data-input', '2')
  await expect(host(page)).not.toHaveAttribute('data-change')
  await page.getByRole('button', { name: 'After' }).click()
  await expect(host(page)).toHaveAttribute('data-change', '1')
})

test('the toolbar sits at the bottom with the footer slots, or floats over the selection', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" toolbar-position="bottom" value="Note">
    <button slot="footer-start">Send</button>
    <button slot="footer-end">Cancel</button>
  </c2-rich-text-editor>`)
  const footer = host(page).locator('.footer')
  await expect(footer.locator('.toolbar')).toBeVisible()
  const send = await page.getByRole('button', { name: 'Send' }).boundingBox()
  const bold = await tool(page, 'Bold').boundingBox()
  const cancel = await page.getByRole('button', { name: 'Cancel' }).boundingBox()
  expect(send!.x).toBeLessThan(bold!.x)
  expect(bold!.x).toBeLessThan(cancel!.x)

  await props(host(page), { toolbarPosition: 'floating' })
  await expect(toolbar(page)).toBeHidden()
  await text$(page).click()
  await page.keyboard.press('End')
  await selectBack(page, 4)
  await expect(toolbar(page)).toBeVisible()
  const bar = await toolbar(page).boundingBox()
  const line = await text$(page).locator('p').boundingBox()
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(line!.y + 1)
  await page.keyboard.press('End')
  await expect(toolbar(page)).toBeHidden()

  await props(host(page), { toolbarPosition: 'none' })
  await expect(host(page).locator('.toolbar')).toHaveCount(0)
})

test('tools that do not fit move into a More menu', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="Word" style="width: 220px"></c2-rich-text-editor>`)
  const more = toolbar(page).getByRole('button', { name: 'More formatting' })
  await expect(more).toBeVisible()
  const visible = await toolbar(page).locator('.tool:visible').count()
  expect(visible).toBeLessThan(11)
  const box = await toolbar(page).boundingBox()
  expect(box!.height).toBeLessThan(50)

  await text$(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await more.click()
  await host(page).locator('c2-menu-item', { hasText: 'Code block' }).click()
  await expect(text$(page).locator('pre')).toHaveText('Word')

  // The menu ticks the formats the selection already has.
  await more.click()
  await expect(host(page).locator('c2-menu-item', { hasText: 'Code block' })).toHaveHostAria('aria-checked', 'true')
  await expect(host(page).locator('c2-menu-item', { hasText: 'Quote' })).toHaveHostAria('aria-checked', 'false')
  await page.keyboard.press('Escape')

  await props(host(page), { style: 'width: 600px' })
  await expect(more).toHaveCount(0)
})

test('read-only shows no toolbar and stays focusable; disabled is neither', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="Fixed" readonly></c2-rich-text-editor>`)
  await expect(host(page).locator('.toolbar')).toHaveCount(0)
  await expect(text$(page)).toHaveAttribute('tabindex', '0')
  await expect(text$(page)).toHaveAttribute('aria-readonly', 'true')
  await props(host(page), { readOnly: false, disabled: true })
  await expect(text$(page)).not.toHaveAttribute('tabindex')
  await expect(tool(page, 'Bold')).toBeDisabled()
})

test('a trigger character reports the word typed after it, and completeTrigger replaces it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" triggers="@ #"></c2-rich-text-editor>`)
  await watch(host(page), 'trigger')
  await text$(page).click()
  await page.keyboard.type('Hi @ma')
  await expect.poll(() => events(page)).toContainEqual(expect.objectContaining({ active: true, char: '@', query: 'ma' }))
  await host(page).evaluate((element) => element.completeTrigger('@Mai Tran', { href: 'https://example.com/u/mai' }))
  await expect(host(page)).toHaveJSProperty('value', 'Hi [@Mai Tran](https://example.com/u/mai) ')
  expect((await events(page)).at(-1)).toEqual(expect.objectContaining({ active: false }))

  // Escape dismisses a trigger; an e-mail address never starts one.
  await page.keyboard.type('#x')
  await page.keyboard.press('Escape')
  expect((await events(page)).at(-1)).toEqual(expect.objectContaining({ active: false, char: '#' }))
  const count = (await events(page)).length
  await page.keyboard.type(' me@example')
  expect((await events(page)).length).toBe(count)
})

test('toHTML gives clean HTML with real lists', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment"></c2-rich-text-editor>`)
  await props(host(page), { value: 'Hi **there** <u>u</u>\n\n- a\n  - b\n\n[x](https://example.com)' })
  const html = await host(page).evaluate((element) => element.toHTML())
  expect(html).toBe(
    '<p>Hi <strong>there</strong> <u>u</u></p><ul><li>a<ul><li>b</li></ul></li></ul><p><a href="https://example.com" rel="noopener noreferrer nofollow">x</a></p>',
  )
})

test('speaks the language of the page', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-rich-text-editor aria-label="Commentaire" maxlength="5"></c2-rich-text-editor></div>`)
  await expect(page.getByRole('toolbar', { name: 'Mise en forme' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gras', exact: true })).toBeVisible()
  await text$(page, 'Commentaire').click()
  await page.keyboard.type('Bonjour')
  expect(await host(page).evaluate((element) => element.validationMessage)).toBe('Utilisez 5 caractères au maximum.')
})

test('passes an accessibility scan in a field with a value and in the floating layout', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" value="**Hi** [link](https://example.com)" maxlength="100">
    <button slot="footer-end">Comment</button>
  </c2-rich-text-editor>
  <c2-rich-text-editor label="Note" toolbar-position="floating" placeholder="Write…"></c2-rich-text-editor>`)
  await accessible(page)
})

test('change still fires after a trip to the toolbar or the link popover', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment"></c2-rich-text-editor><button>After</button>`)
  await host(page).evaluate((element) =>
    element.addEventListener('change', () => element.setAttribute('data-change', String(Number(element.getAttribute('data-change') ?? 0) + 1))),
  )
  await text$(page).click()
  await page.keyboard.type('hello')
  await page.keyboard.press('Alt+F10')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'After' }).click()
  await expect(host(page)).toHaveAttribute('data-change', '1')

  // Leaving the field from the link popover reports the change too.
  await text$(page).click()
  await page.keyboard.type('!')
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('textbox', { name: 'Link address' })).toBeFocused()
  await page.getByRole('button', { name: 'After' }).click()
  await expect(host(page)).toHaveAttribute('data-change', '2')
})

test('the value never keeps a format that formats does not allow', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-rich-text-editor label="Comment" name="body" formats="bold" value="# Title&#10;&#10;- *item*"></c2-rich-text-editor></form>`)
  await expect(host(page)).toHaveJSProperty('value', 'Title\n\nitem')
  expect(await page.locator('main > form').evaluate((form: HTMLFormElement) => new FormData(form).get('body'))).toBe('Title\n\nitem')

  await props(host(page), { formats: '', value: '**hi** there' })
  await expect(host(page)).toHaveJSProperty('value', '**hi** there')
  await props(host(page), { formats: 'italic' })
  await expect(host(page)).toHaveJSProperty('value', 'hi there')
})

test('a moved editor keeps fitting its toolbar to its width', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="a"><c2-rich-text-editor label="Comment" style="width: 600px"></c2-rich-text-editor></div><div id="b"></div>`)
  const more = toolbar(page).getByRole('button', { name: 'More formatting' })
  await expect(more).toHaveCount(0)
  await page.evaluate(() => document.querySelector('#b')!.append(document.querySelector('c2-rich-text-editor')!))
  await props(host(page), { style: 'width: 220px' })
  await expect(more).toBeVisible()
})

test('a trigger character in the middle of a long word starts nothing', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Comment" triggers="@"></c2-rich-text-editor>`)
  await watch(host(page), 'trigger')
  await text$(page).click()
  // The @ sits exactly 64 characters before the caret, at the edge of the window the editor reads.
  await page.keyboard.type(`${'a'.repeat(10)}@${'b'.repeat(63)}`)
  expect(await events(page)).toEqual([])
})
