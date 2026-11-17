import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { SelectionToolbar } from '../src/selection-toolbar'

const host = (page: Page) => page.locator('c2-selection-toolbar')
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Selection actions' })
const events = async (page: Page) => JSON.parse((await host(page).getAttribute('data-events'))!)

const SCENARIO = `<c2-selection-toolbar>
  <p id="text">The quick brown fox jumps over the lazy dog.</p>
  <button slot="toolbar" data-action="ask">Ask AI</button>
  <button slot="toolbar" data-action="comment">Comment</button>
</c2-selection-toolbar>
<p id="outside">Text outside the toolbar's content.</p>`

/** Selects `word` inside the paragraph with `id`, as a keyboard selection would. */
const select = (page: Page, id: string, word: string) =>
  page.evaluate(
    ({ id, word }) => {
      const node = document.getElementById(id)!.firstChild!
      const start = node.textContent!.indexOf(word)
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, start + word.length)
      const selection = document.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
    },
    { id, word },
  )

test('a selection inside the content shows the toolbar above it and fires selection-change', async ({ page, renderScenario }) => {
  // Room above the text, so the toolbar has no reason to flip below it.
  await renderScenario(`<div style="padding-top: 120px">${SCENARIO}</div>`)
  await watch(host(page), 'selection-change')
  await expect(toolbar(page)).toBeHidden()
  await select(page, 'text', 'brown fox')
  await expect(toolbar(page)).toBeVisible()
  expect(await events(page)).toEqual([{ text: 'brown fox' }])
  const [bar, word] = await Promise.all([
    toolbar(page).boundingBox(),
    page.evaluate(() => {
      const rect = document.getSelection()!.getRangeAt(0).getBoundingClientRect()
      return { top: rect.top }
    }),
  ])
  expect(bar!.y + bar!.height).toBeLessThanOrEqual(word.top)
  expect(await host(page).evaluate((element: SelectionToolbar) => element.selection?.text)).toBe('brown fox')
  await accessible(page)
})

test('pressing a control keeps the selection and fires selection-action with its action', async ({ page, renderScenario }) => {
  await renderScenario(SCENARIO)
  await watch(host(page), 'selection-action')
  await select(page, 'text', 'lazy dog')
  await page.getByRole('button', { name: 'Comment' }).click()
  expect(await events(page)).toEqual([{ action: 'comment', text: 'lazy dog' }])
  expect(await page.evaluate(() => document.getSelection()!.toString())).toBe('lazy dog')
  await expect(toolbar(page)).toBeVisible()
})

test('it hides when the selection collapses or is outside the content, and stays hidden below min-length', async ({ page, renderScenario }) => {
  await renderScenario(SCENARIO)
  await watch(host(page), 'toggle')
  await select(page, 'text', 'quick')
  await expect(toolbar(page)).toBeVisible()
  await page.evaluate(() => document.getSelection()!.collapseToStart())
  await expect(toolbar(page)).toBeHidden()
  await select(page, 'outside', 'Text outside')
  await page.waitForTimeout(400)
  await expect(toolbar(page)).toBeHidden()
  expect(await events(page)).toEqual([{ open: true }, { open: false }])
  await host(page).evaluate((element: SelectionToolbar) => (element.minLength = 10))
  await select(page, 'text', 'quick')
  await page.waitForTimeout(400)
  await expect(toolbar(page)).toBeHidden()
})

test('a mouse selection shows it on pointer up', async ({ page, renderScenario }) => {
  await renderScenario(SCENARIO)
  const box = (await page.locator('#text').boundingBox())!
  await page.mouse.move(box.x + 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
  await expect(toolbar(page)).toBeHidden()
  await page.mouse.up()
  await expect(toolbar(page)).toBeVisible()
})

test('Alt+F10 moves focus into the toolbar; the arrows move between controls; Escape returns focus and hides it', async ({ page, renderScenario }) => {
  await renderScenario(`<button id="before">Before</button>${SCENARIO}`)
  await page.locator('#before').focus()
  await select(page, 'text', 'jumps')
  await expect(toolbar(page)).toBeVisible()
  await expect(host(page).locator('[role="status"]')).toHaveText('Actions available, press Alt+F10')
  await page.keyboard.press('Alt+F10')
  await expect(page.getByRole('button', { name: 'Ask AI' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Comment' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Ask AI' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(toolbar(page)).toBeHidden()
  await expect(page.locator('#before')).toBeFocused()
})

test('disabled never shows; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${SCENARIO.replace('<c2-selection-toolbar>', '<c2-selection-toolbar disabled>')}</div>`)
  await select(page, 'text', 'fox')
  await page.waitForTimeout(400)
  await expect(page.getByRole('toolbar')).toBeHidden()
  await host(page).evaluate((element: SelectionToolbar) => (element.disabled = false))
  await select(page, 'text', 'brown')
  await expect(page.getByRole('toolbar', { name: 'Actions sur la sélection' })).toBeVisible()
})

test('a selection across two paragraphs shows it; one in a form field does not; disabling hides it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-selection-toolbar>
    <p id="one">First paragraph.</p>
    <p id="two">Second paragraph.</p>
    <textarea id="field">Text in a field</textarea>
    <button slot="toolbar">Comment</button>
  </c2-selection-toolbar>`)
  await page.evaluate(() => {
    const range = document.createRange()
    range.setStart(document.getElementById('one')!.firstChild!, 6)
    range.setEnd(document.getElementById('two')!.firstChild!, 6)
    document.getSelection()!.removeAllRanges()
    document.getSelection()!.addRange(range)
  })
  await expect(toolbar(page)).toBeVisible()
  await host(page).evaluate((element: SelectionToolbar) => (element.disabled = true))
  await expect(toolbar(page)).toBeHidden()
  await host(page).evaluate((element: SelectionToolbar) => (element.disabled = false))
  await page.locator('#field').focus()
  await page.locator('#field').evaluate((field: HTMLTextAreaElement) => field.setSelectionRange(0, 4))
  await page.waitForTimeout(400)
  await expect(toolbar(page)).toBeHidden()
})

const PROMPT = `<div style="padding-top: 160px"><c2-selection-toolbar>
  <p id="text">The quick brown fox jumps over the lazy dog.</p>
  <button slot="toolbar" data-prompt>Ask AI</button>
  <button slot="toolbar" data-action="comment">Comment</button>
  <input slot="prompt" aria-label="Instruction" value="Make it shorter" />
  <button slot="prompt" data-action="improve">Improve</button>
</c2-selection-toolbar></div>`

const prompt = (page: Page, name = 'Ask about the selection') => page.getByRole('dialog', { name })

/** The panel sits above the anchor and spans it horizontally (it is wider, and shifted to stay on screen). */
const above = (panel: { x: number; y: number; width: number; height: number }, anchor: { left: number; right: number; top: number }) => {
  expect(panel.y + panel.height).toBeLessThanOrEqual(anchor.top)
  expect(panel.x).toBeLessThanOrEqual(anchor.left)
  expect(panel.x + panel.width).toBeGreaterThanOrEqual(anchor.right)
}

const rangeRect = (page: Page) =>
  host(page).evaluate((element: SelectionToolbar) => {
    const { left, right, top } = element.selection!.range.getBoundingClientRect()
    return { left, right, top, text: element.selection!.text }
  })

test('a data-prompt control turns the toolbar into a prompt at the same anchor, which keeps the selection until Escape', async ({ page, renderScenario }) => {
  await renderScenario(`<button id="before">Before</button>${PROMPT}`)
  await page.locator('#before').focus()
  await watch(host(page), 'toggle')
  await select(page, 'text', 'brown fox')
  await expect(toolbar(page)).toBeVisible()
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await expect(prompt(page)).toBeVisible()
  await expect(host(page)).toHaveAttribute('prompting', '')
  await expect(page.getByRole('button', { name: 'Comment' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Instruction' })).toBeFocused()
  above((await prompt(page).boundingBox())!, await rangeRect(page))
  // Typing and moving the caret in the field neither hides the prompt nor moves focus out of the field.
  await page.keyboard.press('End')
  await page.keyboard.type(' please')
  await page.keyboard.press('ArrowLeft')
  await page.waitForTimeout(400)
  await expect(page.getByRole('textbox', { name: 'Instruction' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Instruction' })).toHaveValue('Make it shorter please')
  await expect(prompt(page)).toBeVisible()
  expect(await host(page).evaluate((element: SelectionToolbar) => element.selection?.text)).toBe('brown fox')
  await accessible(page)
  await page.keyboard.press('Escape')
  await expect(prompt(page)).toBeHidden()
  await expect(host(page)).not.toHaveAttribute('prompting')
  await expect(page.locator('#before')).toBeFocused()
  expect(await events(page)).toEqual([{ open: true }, { open: false }])
})

test('the result slot shows once filled; its actions fire selection-action with the frozen text, and the app closes it', async ({ page, renderScenario }) => {
  await renderScenario(PROMPT)
  await watch(host(page), 'selection-action')
  await select(page, 'text', 'lazy dog')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await expect(prompt(page)).toBeVisible()
  await expect(host(page).locator('[part="result"]')).toBeHidden()
  await page.getByRole('button', { name: 'Improve' }).click()
  await host(page).evaluate((element: SelectionToolbar) => {
    const answer = Object.assign(document.createElement('p'), { slot: 'result', id: 'answer', textContent: 'sleepy hound' })
    const replace = Object.assign(document.createElement('button'), { slot: 'result', textContent: 'Replace' })
    replace.dataset.action = 'replace'
    element.append(answer, replace)
    element.addEventListener('selection-action', (event) => {
      if (event.detail.action !== 'replace') return
      const range = element.selection!.range
      range.deleteContents()
      range.insertNode(document.createTextNode(answer.textContent!))
      element.prompting = false
    })
  })
  await expect(page.locator('#answer')).toBeVisible()
  await page.getByRole('button', { name: 'Replace' }).click()
  expect(await events(page)).toEqual([
    { action: 'improve', text: 'lazy dog' },
    { action: 'replace', text: 'lazy dog' },
  ])
  await expect(prompt(page)).toBeHidden()
  await expect(page.locator('#text')).toHaveText('The quick brown fox jumps over the sleepy hound.')
})

test('prompting with a caret anchors to the caret, and with no selection to the content; disabled never prompts', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="padding-top: 160px"><c2-selection-toolbar>
    <div id="editor" contenteditable="true">Write here and ask for help.</div>
    <input slot="prompt" aria-label="Instruction" />
  </c2-selection-toolbar></div>`)
  await page.locator('#editor').focus()
  await page.evaluate(() => document.getSelection()!.collapse(document.getElementById('editor')!.firstChild!, 10))
  await host(page).evaluate((element: SelectionToolbar) => (element.prompting = true))
  await expect(prompt(page)).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Instruction' })).toBeFocused()
  const caret = await rangeRect(page)
  expect(caret.text).toBe('')
  above((await prompt(page).boundingBox())!, caret)
  await page.keyboard.press('Escape')
  await expect(prompt(page)).toBeHidden()
  await expect(page.locator('#editor')).toBeFocused()

  await page.locator('#editor').evaluate((editor) => editor.blur())
  await page.evaluate(() => document.getSelection()!.removeAllRanges())
  await host(page).evaluate((element: SelectionToolbar) => (element.prompting = true))
  await expect(prompt(page)).toBeVisible()
  const content = (await host(page).boundingBox())!
  const middle = content.x + content.width / 2
  above((await prompt(page).boundingBox())!, { left: middle, right: middle, top: content.y })
  expect(await host(page).evaluate((element: SelectionToolbar) => element.selection)).toBeNull()
  await host(page).evaluate((element: SelectionToolbar) => (element.disabled = true))
  await expect(prompt(page)).toBeHidden()
  await host(page).evaluate((element: SelectionToolbar) => (element.prompting = true))
  await page.waitForTimeout(100)
  await expect(prompt(page)).toBeHidden()
  await expect(host(page)).not.toHaveAttribute('prompting')
})

test('Alt+F10 then Enter on a data-prompt control opens the prompt from the keyboard; its name follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${PROMPT}</div>`)
  await select(page, 'text', 'jumps')
  await expect(page.getByRole('toolbar', { name: 'Actions sur la sélection' })).toBeVisible()
  await page.keyboard.press('Alt+F10')
  await expect(page.getByRole('button', { name: 'Ask AI' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(prompt(page, 'Demander à propos de la sélection')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Instruction' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Improve' })).toBeFocused()
})
