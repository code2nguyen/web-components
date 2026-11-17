import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

// The active shape, review mode (`readonly selectable`), confidence flags and the detail card: extraction review,
// pinned comments and image pins.

type Shape = { id: string; type: string; x: number; y: number; w: number; h: number; n?: number; label?: string; confidence?: number }
type Annotator = HTMLElement & {
  active: string | null
  shapes: Shape[]
  next(): string | null
  previous(): string | null
  renderDetail?: (context: { shape: Shape; index: number; count: number }) => unknown
}
const annotator = (page: Page) => page.locator('c2-image-annotator')
const overlay = (locator: Locator) => locator.locator('svg.overlay')
const shape = (locator: Locator, id: string) => locator.locator(`g.shape[data-id="${id}"]`)
const card = (locator: Locator) => locator.locator('.detail')
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as { id: string | null; shape: Shape | null }[]
const ids = async (locator: Locator) => (await events(locator)).map((event) => event.id)
const active = (locator: Locator) => locator.evaluate((element) => (element as Annotator).active)
/** Lets the page run what a click or key queued (focus handlers, the update they request) before reading state. */
const settle = (page: Page) => page.evaluate(() => new Promise((resolve) => setTimeout(resolve)))

/** Three extracted fields of the 400 × 200 test image; the total is unsure. */
const FIELDS = JSON.stringify([
  { id: 'email', type: 'rect', x: 6, y: 20, w: 190, h: 28, color: '#2563eb', stroke: 2, label: 'Email', confidence: 0.97 },
  { id: 'total', type: 'rect', x: 220, y: 60, w: 120, h: 40, color: '#2563eb', stroke: 2, label: 'Total', confidence: 0.62 },
  { id: 'date', type: 'rect', x: 220, y: 140, w: 120, h: 30, color: '#2563eb', stroke: 2, label: 'Due date' },
])

/** Renders an annotator on the test image, shown at 400 pixels, and waits for it to load. */
async function open(page: Page, renderScenario: (html: string) => Promise<void>, attributes = '', children = '', before = '') {
  await renderScenario(`${before}<c2-image-annotator style="width: 400px" ${attributes}>${children}</c2-image-annotator>`)
  await annotator(page).evaluate((element) => ((element as HTMLElement & { src: string }).src = (window as unknown as { testImage(): string }).testImage()))
  await expect(overlay(annotator(page))).toBeVisible()
}

test('review mode: Tab and the arrow keys walk the regions, a click picks one, Escape clears; nothing is edited', async ({ page, renderScenario }) => {
  await open(page, renderScenario, `readonly selectable shapes='${FIELDS}'`)
  const element = annotator(page)
  await watch(element, 'shape-select')
  await expect(element.locator('[role="toolbar"]')).toHaveCount(0)
  await expect(shape(element, 'total')).toHaveAttribute('aria-label', 'Rectangle 2 of 3: Total: 62% confidence, needs review')
  await expect(shape(element, 'total')).toHaveClass(/\blow\b/)
  await expect(shape(element, 'email')).toHaveAttribute('aria-label', 'Rectangle 1 of 3: Email')
  await expect(shape(element, 'email')).not.toHaveClass(/\blow\b/)

  await element.locator('.stage').focus()
  await page.keyboard.press('Tab')
  await expect(shape(element, 'email')).toBeFocused()
  await expect.poll(() => active(element)).toBe('email')
  await page.keyboard.press('ArrowRight')
  await expect(shape(element, 'total')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(shape(element, 'date')).toBeFocused()
  // The last one stays the last.
  await page.keyboard.press('ArrowRight')
  await settle(page)
  await page.keyboard.press('ArrowUp')
  await expect(shape(element, 'total')).toBeFocused()
  await expect.poll(() => ids(element)).toEqual(['email', 'total', 'date', 'total'])
  expect((await events(element))[3].shape).toMatchObject({ id: 'total', label: 'Total', confidence: 0.62 })
  // The active region is outlined, without resize handles.
  await expect(element.locator('.selection .outline')).toHaveCount(1)
  await expect(element.locator('.selection .handle')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect.poll(() => active(element)).toBeNull()
  await expect(element.locator('.selection')).toHaveCount(0)

  // A click on a region picks it, a click on the image clears it; a drag draws nothing.
  await shape(element, 'date').locator('rect.hit').click()
  await expect.poll(() => active(element)).toBe('date')
  await overlay(element).click({ position: { x: 100, y: 150 } })
  await expect.poll(() => active(element)).toBeNull()
  await expect.poll(() => ids(element)).toEqual(['email', 'total', 'date', 'total', null, 'date', null])
  expect(await element.evaluate((node) => (node as Annotator).shapes.length)).toBe(3)
  await accessible(page)
})

test('active set by the app is highlighted and scrolled into view, without an event; next() and previous() report', async ({ page, renderScenario }) => {
  // The annotator starts below the fold, with a region already active: loading the page does not scroll to it.
  await open(page, renderScenario, `readonly active="email" shapes='${FIELDS}'`, '', '<div style="height: 1500px"></div>')
  const element = annotator(page)
  await watch(element, 'shape-select')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(shape(element, 'email')).toHaveClass(/\bselected\b/)
  // Not selectable: the shapes are no tab stops, and a click picks nothing.
  await expect(shape(element, 'email')).toHaveAttribute('tabindex', '-1')

  await props(element, { active: 'date' })
  await expect(shape(element, 'date')).toHaveClass(/\bselected\b/)
  await expect(shape(element, 'date')).toBeInViewport()
  expect(await events(element)).toEqual([])

  expect(await element.evaluate((node) => (node as Annotator).next())).toBe('date')
  expect(await element.evaluate((node) => (node as Annotator).previous())).toBe('total')
  expect(await element.evaluate((node) => (node as Annotator).previous())).toBe('email')
  await expect.poll(() => ids(element)).toEqual(['total', 'email'])
})

test('the detail slot shows beside the active shape; Enter moves into it, Escape comes back, its keys stay its own', async ({ page, renderScenario }) => {
  await open(
    page,
    renderScenario,
    `tool="select" shapes='[{"id":"p1","type":"number","x":60,"y":60,"w":0,"h":0,"n":1,"color":"#e11d48","stroke":4},{"id":"p2","type":"number","x":340,"y":160,"w":0,"h":0,"n":2,"color":"#16a34a","stroke":4}]'`,
    '<div slot="detail"><label>Reply <input class="reply" /></label></div>',
  )
  const element = annotator(page)
  await expect(card(element)).toBeHidden()
  await shape(element, 'p1').locator('rect.hit').click()
  await expect(card(element)).toBeVisible()
  await expect(card(element)).toHaveAttribute('aria-label', 'Number 1 of 2')
  // Beside the pin: right of it, level with its top.
  const pin = (await shape(element, 'p1').locator('circle').boundingBox())!
  let box = (await card(element).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(pin.x + pin.width)
  expect(Math.abs(box.y - pin.y)).toBeLessThan(2)

  // The second pin is in the lower right: the card goes to its left, its bottom level with the pin's.
  await shape(element, 'p2').focus()
  await expect.poll(() => active(element)).toBe('p2')
  const second = (await shape(element, 'p2').locator('circle').boundingBox())!
  box = (await card(element).boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(second.x)
  expect(Math.abs(box.y + box.height - (second.y + second.height))).toBeLessThan(2)

  await page.keyboard.press('Enter')
  await expect(card(element)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('input.reply')).toBeFocused()
  // Typing in the card neither deletes the pin nor undoes anything.
  await page.keyboard.type('Looks off')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Control+z')
  await expect.poll(() => element.evaluate((node) => (node as Annotator).shapes.length)).toBe(2)
  await page.keyboard.press('Escape')
  await expect(shape(element, 'p2')).toBeFocused()
  await expect.poll(() => active(element)).toBe('p2')
  await page.keyboard.press('Escape')
  await expect(card(element)).toBeHidden()
})

test('pinned comments: the number tool drops a pin that becomes active and opens the card', async ({ page, renderScenario }) => {
  await open(page, renderScenario, 'tool="number"', '<p slot="detail">New thread</p>')
  const element = annotator(page)
  await watch(element, 'shape-select')
  await overlay(element).click({ position: { x: 100, y: 50 } })
  await expect(card(element)).toBeVisible()
  await expect.poll(() => events(element).then((list) => list.length)).toBe(1)
  const [event] = await events(element)
  expect(event.shape).toMatchObject({ type: 'number', n: 1, x: 100, y: 50 })
  expect(event.id).toBe(await active(element))
})

test('renderDetail draws the card from the active shape; the slot wins over it', async ({ page, renderScenario }) => {
  await open(page, renderScenario, `readonly selectable shapes='${FIELDS}'`)
  const element = annotator(page)
  await element.evaluate((node) => {
    ;(node as Annotator).renderDetail = ({ shape, index, count }) => {
      const text = document.createElement('span')
      text.className = 'rendered'
      text.textContent = `${shape.label} ${index + 1}/${count} ${Math.round((shape.confidence ?? 1) * 100)}%`
      return text
    }
  })
  await expect(card(element)).toBeHidden()
  await props(element, { active: 'total' })
  await expect(element.locator('.rendered')).toHaveText('Total 2/3 62%')
  await expect(card(element)).toBeVisible()
  await element.evaluate((node) => node.append(Object.assign(document.createElement('b'), { slot: 'detail', textContent: 'Own' })))
  await expect(element.locator('.rendered')).toBeHidden()
  await expect(page.locator('b[slot="detail"]')).toBeVisible()
})

test('looks come from variables; a threshold of 0.5 unflags; existing users see no card, no dimming, no flag', async ({ page, renderScenario }) => {
  await open(page, renderScenario, `readonly selectable active="email" shapes='${FIELDS}'`)
  const element = annotator(page)
  await element.evaluate((node) => node.style.setProperty('--c2-image-annotator__shape__inactive--opacity', '0.4'))
  const opacity = (id: string) => shape(element, id).evaluate((node) => getComputedStyle(node).opacity)
  expect(await opacity('total')).toBe('0.4')
  expect(await opacity('email')).toBe('1')
  expect(
    await shape(element, 'total')
      .locator('rect')
      .first()
      .evaluate((node) => getComputedStyle(node).stroke),
  ).toBe('rgb(217, 119, 6)')
  await props(element, { confidenceThreshold: 0.5 })
  await expect(shape(element, 'total')).not.toHaveClass(/\blow\b/)

  await open(page, renderScenario, `shapes='${FIELDS}'`)
  await expect(card(annotator(page))).toBeHidden()
  await expect(annotator(page).locator('.selection')).toHaveCount(0)
  // Without the select tool, shapes are no tab stops (as before).
  await expect(shape(annotator(page), 'email')).toHaveAttribute('tabindex', '-1')
})

test('the confidence flag follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-image-annotator readonly shapes='${FIELDS}'></c2-image-annotator></div>`)
  await annotator(page).evaluate((element) => ((element as HTMLElement & { src: string }).src = (window as unknown as { testImage(): string }).testImage()))
  await expect(shape(annotator(page), 'total')).toHaveAttribute('aria-label', 'Rectangle 2 sur 3 : Total : confiance 62 %, à vérifier')
})

test('regressions: a choice that disappears is reported, a wide shape gets its card below, a labelled text keeps its text', async ({
  page,
  renderScenario,
}) => {
  await open(
    page,
    renderScenario,
    `tool="select" active="wide" shapes='[{"id":"wide","type":"rect","x":10,"y":20,"w":380,"h":30,"color":"#2563eb","stroke":2,"label":"Address"},{"id":"t","type":"text","x":20,"y":150,"w":100,"h":20,"text":"Wrong total","label":"Note","color":"#e11d48","stroke":4},{"id":"n","type":"number","x":300,"y":150,"w":0,"h":0,"n":1,"confidence":0.2,"color":"#e11d48","stroke":4}]'`,
    '<p slot="detail">Card</p>',
  )
  const element = annotator(page)
  await watch(element, 'shape-select')
  // No room beside a shape as wide as the image: the card goes under it.
  const wide = (await shape(element, 'wide').locator('rect').first().boundingBox())!
  const box = (await card(element).boundingBox())!
  expect(box.y).toBeGreaterThanOrEqual(wide.y + wide.height)
  expect(box.width).toBeGreaterThan(200)
  await expect(shape(element, 't')).toHaveAttribute('aria-label', 'Text 2 of 3: Note: Wrong total')
  // A low-confidence badge is announced but not dashed: only outlines are.
  await expect(shape(element, 'n')).toHaveAttribute('aria-label', 'Number 3 of 3: 20% confidence, needs review')
  await expect(shape(element, 'n')).not.toHaveClass(/\blow\b/)

  // The app loads the next document: the active shape is gone, and the choice is cleared out loud.
  await props(element, { shapes: [{ id: 'other', type: 'rect', x: 10, y: 10, w: 50, h: 50, color: '#2563eb', stroke: 2 }] })
  await expect.poll(() => active(element)).toBeNull()
  await expect(card(element)).toBeHidden()
  await expect(overlay(element)).not.toHaveClass(/has-active/)
  await props(element, { active: 'other' })
  // Turning readonly on drops the editing choice, reported too.
  await props(element, { readonly: true })
  await expect.poll(() => active(element)).toBeNull()
  await expect.poll(() => ids(element)).toEqual([null, null])
})
