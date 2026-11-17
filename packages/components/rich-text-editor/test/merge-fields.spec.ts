import { test, expect, watch, accessible, props } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { RichTextEditor, RichTextMergeField } from '../src/rich-text-editor'

const text$ = (page: Page, name = 'Email') => page.getByRole('textbox', { name })
const host = (page: Page) => page.locator('c2-rich-text-editor')
const chips = (page: Page) => host(page).locator('.merge-field')
const events = (page: Page) => host(page).evaluate((element) => JSON.parse(element.getAttribute('data-events') ?? '[]') as unknown[])

const FIELDS: RichTextMergeField[] = [
  { name: 'first_name', label: 'First name', fallback: 'there' },
  { name: 'company', label: 'Company' },
]
const fieldsAttribute = JSON.stringify(FIELDS).replaceAll("'", '&#39;')

const editor = (value: string, extra = '') =>
  `<c2-rich-text-editor label="Email" merge-fields='${fieldsAttribute}' ${extra} value="${value.replaceAll('"', '&quot;')}"></c2-rich-text-editor>`

/** Puts the caret at the end of the text with a real click and End: WebKit drops the caret of a programmatic focus. */
async function caretAtEnd(page: Page) {
  await text$(page).click()
  await page.keyboard.press('End')
}

test('tokens of listed fields are drawn as chips, while the value, text and HTML keep the token', async ({ page, renderScenario }) => {
  await renderScenario(editor('Hi {{first_name|there}} from **{{ company }}**, see {{unknown}}.'))
  await expect(chips(page)).toHaveText(['First name', 'Company'])
  await expect(chips(page).nth(0)).toHaveAttribute('title', 'Merge field: First name (if empty: there)')
  await expect(chips(page).nth(1)).toHaveAttribute('title', 'Merge field: Company')
  await expect(chips(page).nth(1)).toHaveAttribute('contenteditable', 'false')
  // A chip keeps the formats around it; an unlisted token stays text. Spaces inside a token are not kept.
  await expect(text$(page).locator('strong .merge-field')).toHaveText('Company')
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name|there}} from **{{company}}**, see {{unknown}}.')
  expect(await host(page).evaluate((element: RichTextEditor) => element.text)).toBe('Hi {{first_name|there}} from {{company}}, see {{unknown}}.')
  expect(await host(page).evaluate((element: RichTextEditor) => element.toHTML())).toBe(
    '<p>Hi <span data-merge-field="first_name">{{first_name|there}}</span> from <strong><span data-merge-field="company">{{company}}</span></strong>, see {{unknown}}.</p>',
  )
})

test('without merge fields every token stays text and the value is untouched', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-rich-text-editor label="Email" value="Hi {{first_name}}"></c2-rich-text-editor>`)
  await expect(chips(page)).toHaveCount(0)
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name}}')
  expect(await host(page).evaluate((element: RichTextEditor) => element.insertMergeField('first_name'))).toBe(false)
})

test('insertMergeField puts a chip at the caret with the field fallback, and refuses an unlisted field', async ({ page, renderScenario }) => {
  await renderScenario(editor('Hi !'))
  await watch(host(page), 'input')
  await caretAtEnd(page)
  await page.keyboard.press('ArrowLeft')
  expect(await host(page).evaluate((element: RichTextEditor) => element.insertMergeField('nickname'))).toBe(false)
  expect(await host(page).evaluate((element: RichTextEditor) => element.insertMergeField('first_name'))).toBe(true)
  await expect(chips(page)).toHaveText(['First name'])
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name|there}}!')
  expect((await events(page)).length).toBe(1)
  // The caret is after the chip.
  await page.keyboard.type(',')
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name|there}},!')
  expect(await host(page).evaluate((element: RichTextEditor) => element.insertMergeField('company', { fallback: 'your {team}' }))).toBe(true)
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name|there}},{{company|your team}}!')
})

test('Backspace and Delete remove a chip as one unit', async ({ page, renderScenario }) => {
  await renderScenario(editor('Dear {{first_name}}, hi'))
  await caretAtEnd(page)
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', 'Dear , hi')
  await expect(chips(page)).toHaveCount(0)

  await props(host(page), { value: 'Dear {{company}}, hi' })
  await caretAtEnd(page)
  // Past ", hi", then a step that selects the chip and one that leaves the caret right before it.
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowLeft')
  await expect(chips(page)).not.toHaveClass(/ProseMirror-selectednode/)
  await page.keyboard.press('Delete')
  await expect(host(page)).toHaveJSProperty('value', 'Dear , hi')
})

test('a typed token of a listed field becomes a chip; an unlisted one stays text', async ({ page, renderScenario }) => {
  await renderScenario(editor(''))
  await text$(page).click()
  await page.keyboard.type('Hello {{company}} and {{team}}')
  await expect(chips(page)).toHaveText(['Company'])
  await expect(host(page)).toHaveJSProperty('value', 'Hello {{company}} and {{team}}')
})

test('the arrow keys select a chip, Enter activates it, and insertMergeField then replaces it', async ({ page, renderScenario }) => {
  await renderScenario(editor('Dear {{first_name}}, hi'))
  await watch(host(page), 'merge-field-activate')
  await caretAtEnd(page)
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft')
  // One more step selects the chip rather than entering it.
  await page.keyboard.press('ArrowLeft')
  await expect(chips(page)).toHaveClass(/ProseMirror-selectednode/)
  await page.keyboard.press('Enter')
  await expect
    .poll(() => events(page))
    .toEqual([
      expect.objectContaining({ field: { name: 'first_name', label: 'First name', fallback: 'there' }, fallback: '', rect: expect.objectContaining({}) }),
    ])
  await expect(host(page)).toHaveJSProperty('value', 'Dear {{first_name}}, hi')
  expect(await host(page).evaluate((element: RichTextEditor) => element.insertMergeField('first_name', { fallback: 'friend' }))).toBe(true)
  await expect(host(page)).toHaveJSProperty('value', 'Dear {{first_name|friend}}, hi')
  await expect(chips(page)).toHaveCount(1)
})

test('clicking a chip selects it and fires merge-field-activate with where it is drawn', async ({ page, renderScenario }) => {
  await renderScenario(editor('Dear {{company|your team}}, hi'))
  await watch(host(page), 'merge-field-activate')
  await chips(page).click()
  await expect.poll(async () => (await events(page)).length).toBe(1)
  const [detail] = (await events(page)) as Array<{ field: RichTextMergeField; fallback: string; rect: { width: number; height: number } }>
  expect(detail.field.name).toBe('company')
  expect(detail.fallback).toBe('your team')
  expect(detail.rect.width).toBeGreaterThan(0)
  await expect(chips(page)).toHaveClass(/ProseMirror-selectednode/)
})

test('a trigger such as {{ opens the app picker, and insertMergeField replaces what was typed', async ({ page, renderScenario }) => {
  await renderScenario(editor('', 'triggers="{{"'))
  await watch(host(page), 'trigger')
  await text$(page).click()
  await page.keyboard.type('Hi {{fir')
  await expect.poll(() => events(page)).toContainEqual(expect.objectContaining({ active: true, char: '{{', query: 'fir' }))
  expect(await host(page).evaluate((element: RichTextEditor) => element.insertMergeField('first_name'))).toBe(true)
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name|there}}')
  await expect.poll(async () => (await events(page)).at(-1)).toEqual(expect.objectContaining({ active: false }))
})

test('a pasted token becomes a chip', async ({ page, renderScenario }) => {
  await renderScenario(editor(''))
  await text$(page).click()
  await text$(page).evaluate((element) => {
    const transfer = new DataTransfer()
    transfer.setData('text/plain', 'Thanks {{company}}!')
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: transfer })
    element.dispatchEvent(event)
  })
  await expect(chips(page)).toHaveText(['Company'])
  await expect(host(page)).toHaveJSProperty('value', 'Thanks {{company}}!')
})

test('renderMergeField draws the chip, and changing the field list redraws the text without changing the value', async ({ page, renderScenario }) => {
  await renderScenario(editor('Hi {{first_name}} at {{company}}'))
  await host(page).evaluate(async (element: RichTextEditor) => {
    element.renderMergeField = ({ label, field }) => {
      const span = document.createElement('span')
      span.className = 'custom'
      span.textContent = `${label.toUpperCase()} (${field.name})`
      return span
    }
    await element.updateComplete
  })
  await expect(chips(page).locator('.custom')).toHaveText(['FIRST NAME (first_name)', 'COMPANY (company)'])

  await props(host(page), { mergeFields: [{ name: 'company', label: 'Organisation' }] })
  await expect(chips(page)).toHaveCount(1)
  await expect(chips(page).locator('.custom')).toHaveText('ORGANISATION (company)')
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name}} at {{company}}')

  await props(host(page), { mergeFields: [] })
  await expect(chips(page)).toHaveCount(0)
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name}} at {{company}}')
})

test('a chip title speaks the language of the page', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${editor('Bonjour {{first_name|toi}}')}</div>`)
  await expect(chips(page)).toHaveAttribute('title', 'Champ de fusion : First name (si vide : toi)')
})

test('passes an accessibility scan with chips, one of them selected', async ({ page, renderScenario }) => {
  await renderScenario(editor('Hi {{first_name}} from {{company}}'))
  await chips(page).first().click()
  await accessible(page)
})

test('a new array with the same fields keeps the caret and the history', async ({ page, renderScenario }) => {
  await renderScenario(editor('Hi {{first_name}}'))
  await caretAtEnd(page)
  await page.keyboard.type(' there')
  await props(host(page), { mergeFields: structuredClone(FIELDS) })
  await page.keyboard.type('!')
  await expect(host(page)).toHaveJSProperty('value', 'Hi {{first_name}} there!')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(host(page)).not.toHaveJSProperty('value', 'Hi {{first_name}} there!')
})

test('inline code applied over a chip leaves the chip out of it', async ({ page, renderScenario }) => {
  await renderScenario(editor('a {{company}} b'))
  await text$(page).click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.press('ControlOrMeta+e')
  await expect(text$(page).locator('code')).toHaveCount(2)
  await expect(chips(page)).toHaveCount(1)
  await expect(host(page)).toHaveJSProperty('value', '`a `{{company}}` b`')
})

test('a field whose name a token cannot hold, or whose fallback is not text, is handled without throwing', async ({ page, renderScenario }) => {
  await renderScenario(editor('x'))
  await props(host(page), { mergeFields: [{ name: 'a|b' }, { name: ' spaced' }, { name: 'count', fallback: 0 }] })
  await caretAtEnd(page)
  const results = await host(page).evaluate((element: RichTextEditor) => [
    element.insertMergeField('a|b'),
    element.insertMergeField(' spaced'),
    element.insertMergeField('count'),
  ])
  expect(results).toEqual([false, false, true])
  await expect(host(page)).toHaveJSProperty('value', 'x{{count}}')
})
