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
