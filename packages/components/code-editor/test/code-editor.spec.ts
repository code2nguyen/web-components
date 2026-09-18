import { test, expect } from './fixture'

const content = (page: import('@playwright/test').Page) => page.locator('.cm-content')

test('mounts CodeMirror and highlights the document from the component CSS variables', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('main')).toHaveAttribute('data-engine', 'ready')
  await expect(content(page)).toBeVisible()
  await expect(content(page)).toContainText("const greeting = 'hello'")

  // The palette is CSS, not a CodeMirror theme: the token classes resolve to the component's own variables.
  await expect(page.locator('.c2tok-keyword').first()).toHaveCSS('color', 'rgb(207, 34, 46)')
  await expect(page.locator('.c2tok-comment').first()).toHaveCSS('color', 'rgb(99, 108, 118)')
  await expect(page.locator('.c2tok-string').first()).toHaveCSS('color', 'rgb(3, 47, 98)')
})

test('typing updates the value and fires input, then change on blur', async ({ page, scenario }) => {
  await scenario()
  await content(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' // edited')

  await expect.poll(() => page.locator('c2-code-editor').evaluate((element) => (element as HTMLElement & { value: string }).value)).toContain('// edited')

  // Every keystroke is an `input`; `change` waits for the blur, as a native control does.
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText(/^[1-9]\d* 0$/)
  await page.getByRole('button', { name: 'After', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText(/^[1-9]\d* 1$/)
})

test('assigning value replaces the document without a remount', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-code-editor').evaluate((element) => {
    ;(element as HTMLElement & { value: string }).value = 'const replaced = true'
  })
  await expect(content(page)).toContainText('const replaced = true')
  await expect(content(page)).not.toContainText('greeting')
  // A programmatic assignment is not user input.
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText('0 0')
})

test('line numbers are a gutter that can be toggled live', async ({ page, scenario }) => {
  await scenario('line-numbers')
  await expect(page.locator('.cm-gutters')).toBeVisible()
  await expect(page.locator('.cm-lineNumbers .cm-gutterElement').nth(1)).toHaveText('1')

  await page.locator('c2-code-editor').evaluate((element) => element.removeAttribute('line-numbers'))
  await expect(page.locator('.cm-lineNumbers')).toHaveCount(0)
  // The document survived the reconfiguration.
  await expect(content(page)).toContainText("const greeting = 'hello'")
})

test('the language can be swapped live', async ({ page, scenario }) => {
  await scenario('json')
  await expect(page.locator('.c2tok-property').first()).toBeVisible()
  await page.locator('c2-code-editor').evaluate((element) => {
    ;(element as HTMLElement & { value: string }).value = '.a { color: red }'
    element.setAttribute('language', 'css')
  })
  await expect(content(page)).toContainText('.a { color: red }')
  await expect(page.locator('.c2tok-keyword, .c2tok-property, .c2tok-tag').first()).toBeVisible()
})

test('no language means no highlighting but a working editor', async ({ page, scenario }) => {
  await scenario('no-language')
  await expect(content(page)).toBeVisible()
  await expect(page.locator('.c2tok-keyword')).toHaveCount(0)
  await content(page).click()
  await page.keyboard.type('plain text')
  await expect(content(page)).toContainText('plain text')
})

test('readonly allows focus and selection but refuses edits', async ({ page, scenario }) => {
  await scenario('readonly')
  await content(page).click()
  await page.keyboard.type('nope')
  await expect(content(page)).not.toContainText('nope')
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText('0 0')
})

test('disabled blocks edits and dims the editor', async ({ page, scenario }) => {
  await scenario('disabled')
  await expect(page.locator('[part="container"]')).toHaveClass(/is-disabled/)
  await expect(page.locator('[part="container"]')).toHaveCSS('opacity', '0.38')

  // Real pointer input: locator.click() would wait for a disabled element to become enabled.
  const bounds = await content(page).boundingBox()
  if (!bounds) throw new Error('Editor has no bounds')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + 8)
  await page.keyboard.type('nope')
  await expect(content(page)).not.toContainText('nope')
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText('0 0')
})

test('placeholder shows only while the document is empty', async ({ page, scenario }) => {
  await scenario('placeholder')
  await expect(page.locator('.cm-placeholder')).toHaveText('Paste your code')
  await content(page).click()
  await page.keyboard.type('x')
  await expect(page.locator('.cm-placeholder')).toHaveCount(0)
})

test('the label and supporting text come from the attributes or the slots', async ({ page, scenario }) => {
  await scenario('help')
  await expect(page.locator('[part="label"]')).toHaveText('Source')
  await expect(page.locator('[part="supporting-text"]')).toHaveText('Tab indents.')

  await scenario('slot-label')
  // Slotted content stays in the light DOM, so assert on the slotted nodes and on the shadow rows being shown.
  await expect(page.locator('[part="label"]')).toBeVisible()
  await expect(page.locator('c2-code-editor > [slot="label"]')).toHaveText('Slotted label')
  await expect(page.locator('c2-code-editor > [slot="supporting-text"]')).toHaveText('Slotted help')
})

test('error replaces the supporting text and recolours the frame', async ({ page, scenario }) => {
  await scenario('error')
  await expect(page.getByRole('alert')).toHaveText('Unexpected token.')
  await expect(page.locator('[part="container"]')).toHaveClass(/is-invalid/)
  await expect(page.locator('[part="editor"]')).toHaveCSS('border-color', 'rgb(220, 38, 38)')
})

test('takes part in a form: submits, validates and resets', async ({ page, scenario }) => {
  await scenario('form')
  const subject = page.locator('c2-code-editor')
  await expect(subject).toHaveJSProperty('value', 'const initial = 1')

  await content(page).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' + 1')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('status', { name: 'Submitted' })).toHaveText('const initial = 1 + 1')

  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(subject).toHaveJSProperty('value', 'const initial = 1')
  await expect(content(page)).toContainText('const initial = 1')

  // `required` is unmet once the document is emptied.
  await subject.evaluate((element) => {
    ;(element as HTMLElement & { value: string }).value = ''
  })
  await expect(subject).toHaveJSProperty('validity.valueMissing', true)
  await subject.evaluate((element) => {
    ;(element as HTMLElement & { value: string }).value = 'x'
  })
  await expect(subject).toHaveJSProperty('validity.valid', true)
})

test('falls back to a textarea when CodeMirror is not installed', async ({ page, scenario }) => {
  // The engine is only ever reached through a dynamic import, so refusing the request is exactly what a consumer
  // who skipped the optional peer gets.
  await page.route('**/*codemirror*', (route) => route.abort())
  await scenario('fallback')
  await expect(page.locator('main')).toHaveAttribute('data-engine', 'basic')
  await expect(page.locator('.cm-content')).toHaveCount(0)

  const textarea = page.getByRole('textbox', { name: 'Source' })
  await expect(textarea).toBeVisible()
  await expect(textarea).toHaveValue(/const greeting/)

  await textarea.click()
  await page.keyboard.press('End')
  await page.keyboard.type('!')
  await expect.poll(() => page.locator('c2-code-editor').evaluate((element) => (element as HTMLElement & { value: string }).value)).toContain('!')
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText(/^[1-9]\d* 0$/)
  await page.getByRole('button', { name: 'After', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Events' })).toHaveText(/^[1-9]\d* 1$/)
})

test('the editor takes its whole look from the component variables', async ({ page, scenario }) => {
  await scenario('themed')
  const editor = page.locator('[part="editor"]')
  await expect(editor).toHaveCSS('background-color', 'rgb(13, 17, 23)')
  await expect(editor).toHaveCSS('border-radius', '12px')
  await expect(editor).toHaveCSS('border-color', 'rgb(48, 54, 61)')
  await expect(page.locator('.c2tok-keyword').first()).toHaveCSS('color', 'rgb(255, 123, 114)')
  await expect(page.locator('.c2tok-comment').first()).toHaveCSS('color', 'rgb(139, 148, 158)')
  await expect(page.locator('.cm-lineNumbers .cm-gutterElement:not(.cm-activeLineGutter)').first()).toHaveCSS('color', 'rgb(110, 118, 129)')
})

test('focus moves into the editor in tab order and the host delegates focus', async ({ page, scenario, tab }) => {
  await scenario()
  await page.getByRole('button', { name: 'Before', exact: true }).focus()
  await tab()
  await expect(content(page)).toBeFocused()

  await page.getByRole('button', { name: 'Before', exact: true }).focus()
  await page.locator('c2-code-editor').evaluate((element) => (element as HTMLElement).focus())
  await expect(content(page)).toBeFocused()
})
