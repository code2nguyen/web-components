import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

type Shape = { id: string; type: string; x: number; y: number; w: number; h: number; text?: string; n?: number; color: string; stroke: number }
const annotator = (page: Page) => page.locator('c2-image-annotator')
const shapes = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { shapes: Shape[] }).shapes)
const overlay = (locator: Locator) => locator.locator('svg.overlay')
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')
const tool = (locator: Locator, name: string) => locator.locator(`[data-tool="${name}"]`)

/** Renders an annotator on the 400 × 200 test image, shown at `width` pixels, and waits for it to load. */
async function open(page: Page, renderScenario: (html: string) => Promise<void>, attributes = '', width = 400) {
  await renderScenario(`<c2-image-annotator style="width: ${width}px" ${attributes}></c2-image-annotator>`)
  await annotator(page).evaluate((element) => ((element as HTMLElement & { src: string }).src = (window as unknown as { testImage(): string }).testImage()))
  await expect(overlay(annotator(page))).toBeVisible()
}

/** Drags across the stage between two points given in displayed pixels from its top left. */
async function drag(page: Page, from: [number, number], to: [number, number], shift = false) {
  const box = (await overlay(annotator(page)).boundingBox())!
  await page.mouse.move(box.x + from[0], box.y + from[1])
  await page.mouse.down()
  if (shift) await page.keyboard.down('Shift')
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 3 })
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 3 })
  await page.mouse.up()
  if (shift) await page.keyboard.up('Shift')
}

test('draws a rectangle in image pixels at any display size, names everything, and passes axe', async ({ page, renderScenario }) => {
  await open(page, renderScenario, '', 200)
  await watch(annotator(page), 'annotation-change')
  await expect(tool(annotator(page), 'arrow')).toHaveAttribute('selected', '')
  await tool(annotator(page), 'rect').click()
  // Shown at half size: 50 displayed pixels are 100 image pixels.
  await drag(page, [20, 20], [70, 60])
  const [rect] = await shapes(annotator(page))
  expect(rect).toMatchObject({ type: 'rect', x: 40, y: 40, w: 100, h: 80, color: '#e11d48', stroke: 4 })
  expect((await events(annotator(page)))[0].shapes).toHaveLength(1)
  await expect(annotator(page).locator('[role="status"]')).toHaveText('Rectangle added')
  await expect(annotator(page).locator('g.shape')).toHaveAttribute('aria-label', 'Rectangle 1 of 1')
  await expect(annotator(page)).toHaveHostAria('role', 'group')
  await expect(annotator(page).locator('[role="toolbar"]')).toHaveAttribute('aria-label', 'Annotation tools')
  await accessible(page)
})

test('arrows snap with Shift; numbers count up; text is typed in place and an empty text is dropped', async ({ page, renderScenario }) => {
  await open(page, renderScenario)
  await drag(page, [100, 100], [200, 110], true)
  const [arrow] = await shapes(annotator(page))
  expect(arrow.type).toBe('arrow')
  expect(Math.round(arrow.h)).toBe(0)
  await tool(annotator(page), 'number').click()
  await overlay(annotator(page)).click({ position: { x: 50, y: 50 } })
  await overlay(annotator(page)).click({ position: { x: 80, y: 50 } })
  expect((await shapes(annotator(page))).filter((shape) => shape.type === 'number').map((shape) => shape.n)).toEqual([1, 2])
  await tool(annotator(page), 'text').click()
  await overlay(annotator(page)).click({ position: { x: 20, y: 150 } })
  await expect(annotator(page).locator('.text-editor')).toBeFocused()
  await page.keyboard.type('Wrong total')
  await page.keyboard.press('Enter')
  const text = (await shapes(annotator(page))).find((shape) => shape.type === 'text')!
  expect(text).toMatchObject({ text: 'Wrong total', x: 20, y: 150 })
  await expect(annotator(page).locator('text.label')).toHaveText('Wrong total')
  await overlay(annotator(page)).click({ position: { x: 300, y: 150 } })
  await page.keyboard.press('Escape')
  expect((await shapes(annotator(page))).filter((shape) => shape.type === 'text')).toHaveLength(1)
})

test('select moves and resizes a shape, Delete removes it, and undo and redo walk back and forth', async ({ page, renderScenario }) => {
  await open(page, renderScenario, `tool="select" shapes='[{"id":"a","type":"rect","x":50,"y":50,"w":100,"h":50,"color":"#e11d48","stroke":4}]'`)
  await drag(page, [100, 75], [130, 95])
  expect((await shapes(annotator(page)))[0]).toMatchObject({ x: 80, y: 70, w: 100, h: 50 })
  // The bottom-right handle.
  await drag(page, [180, 120], [220, 140])
  expect((await shapes(annotator(page)))[0]).toMatchObject({ x: 80, y: 70, w: 140, h: 70 })
  await page.keyboard.press('Delete')
  expect(await shapes(annotator(page))).toHaveLength(0)
  await page.keyboard.press('Control+z')
  expect((await shapes(annotator(page)))[0]).toMatchObject({ w: 140 })
  await annotator(page).locator('c2-icon-button[aria-label="Undo"]').click()
  expect((await shapes(annotator(page)))[0]).toMatchObject({ x: 80, w: 100 })
  await annotator(page).locator('c2-icon-button[aria-label="Undo"]').click()
  expect((await shapes(annotator(page)))[0]).toMatchObject({ x: 50 })
  await page.keyboard.press('Control+Shift+z')
  expect((await shapes(annotator(page)))[0]).toMatchObject({ x: 80, w: 100 })
})

test('from the keyboard: Enter adds a shape in the middle, Tab reaches it, arrows nudge it and Delete removes it', async ({ page, renderScenario }) => {
  await open(page, renderScenario)
  await tool(annotator(page), 'ellipse').click()
  await annotator(page).locator('.stage').focus()
  await page.keyboard.press('Enter')
  const [ellipse] = await shapes(annotator(page))
  expect(ellipse).toMatchObject({ type: 'ellipse', w: 40, h: 20 })
  await tool(annotator(page), 'select').click()
  await annotator(page).locator('.stage').focus()
  await page.keyboard.press('Tab')
  await expect(annotator(page).locator('g.shape')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  expect((await shapes(annotator(page)))[0]).toMatchObject({ x: ellipse.x + 1, y: ellipse.y + 10 })
  await page.keyboard.press('Delete')
  expect(await shapes(annotator(page))).toHaveLength(0)
  await expect(annotator(page).locator('[role="status"]')).toHaveText('Ellipse deleted')
})

test('the export flattens the shapes at full size: redaction is solid, blur is pixelated, strokes are drawn', async ({ page, renderScenario }) => {
  await open(
    page,
    renderScenario,
    `shapes='[{"id":"r","type":"redact","x":0,"y":20,"w":200,"h":30,"color":"#e11d48","stroke":4},{"id":"b","type":"blur","x":200,"y":100,"w":100,"h":100,"color":"#e11d48","stroke":4},{"id":"l","type":"line","x":10,"y":150,"w":150,"h":0,"color":"#16a34a","stroke":6}]'`,
    200,
  )
  const pixels = await annotator(page).evaluate(async (element) => {
    const canvas = await (element as HTMLElement & { toCanvas(): Promise<HTMLCanvasElement> }).toCanvas()
    const context = canvas.getContext('2d')!
    const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)]
    return { size: [canvas.width, canvas.height], redacted: at(60, 35), outside: at(60, 100), line: at(80, 150), blur: at(250, 150) }
  })
  expect(pixels.size).toEqual([400, 200])
  expect(pixels.redacted).toEqual([0, 0, 0])
  expect(pixels.outside).toEqual([255, 255, 255])
  expect(pixels.line).toEqual([22, 163, 74])
  // The blue half is still blue under the pixelation (no edge nearby).
  expect(pixels.blur).toEqual([51, 102, 204])
  const url = await annotator(page).evaluate((element) => (element as HTMLElement & { toDataURL(): Promise<string> }).toDataURL())
  expect(url.startsWith('data:image/png;base64,')).toBe(true)
})

test('a cross-origin image without CORS cannot be exported, and says why', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-image-annotator src="http://localhost:4175/packages/components/chat-message/emotion.png"></c2-image-annotator>`)
  await expect(overlay(annotator(page))).toBeVisible()
  await watch(annotator(page), 'annotator-error')
  const message = await annotator(page).evaluate((element) =>
    (element as HTMLElement & { toBlob(): Promise<Blob> })
      .toBlob()
      .then(() => 'exported')
      .catch((error: Error) => error.name),
  )
  expect(message).toBe('SecurityError')
  await expect.poll(async () => (await events(annotator(page))).length).toBe(1)
})

test('readonly shows the shapes with no toolbar or editing; its text follows the language', async ({ page, renderScenario }) => {
  await open(page, renderScenario, `readonly shapes='[{"id":"n","type":"number","x":50,"y":50,"w":0,"h":0,"n":1,"color":"#e11d48","stroke":4}]'`)
  await expect(annotator(page).locator('[role="toolbar"]')).toHaveCount(0)
  await expect(annotator(page).locator('g.shape text')).toHaveText('1')
  await drag(page, [10, 10], [60, 60])
  expect(await shapes(annotator(page))).toHaveLength(1)

  await renderScenario(`<div lang="fr"><c2-image-annotator></c2-image-annotator></div>`)
  await expect(annotator(page).locator('[role="toolbar"]')).toHaveAttribute('aria-label', "Outils d'annotation")
  await expect(tool(annotator(page), 'redact')).toHaveAttribute('aria-label', 'Masquer')
  await props(annotator(page), { readonly: true })
  await expect(annotator(page)).toHaveHostAria('aria-label', 'Image annotée')
})

test('regressions: clicking away keeps typed text, a text is one undo step, a blur never uncovers a redaction', async ({ page, renderScenario }) => {
  await open(page, renderScenario)
  await tool(annotator(page), 'text').click()
  await overlay(annotator(page)).click({ position: { x: 20, y: 150 } })
  await page.keyboard.type('Wrong total')
  // Finish by clicking elsewhere on the image.
  await overlay(annotator(page)).click({ position: { x: 300, y: 50 } })
  const texts = () => shapes(annotator(page)).then((list) => list.filter((shape) => shape.type === 'text').map((shape) => shape.text))
  await expect.poll(texts).toContain('Wrong total')
  // The click also placed a new text box; Escape drops it without a trace.
  await page.keyboard.press('Escape')
  await expect.poll(texts).toEqual(['Wrong total'])
  await page.keyboard.press('Control+z')
  expect(await shapes(annotator(page))).toEqual([])

  // A blur drawn after a redaction, over it: the redacted pixels stay black.
  await props(annotator(page), {
    shapes: [
      { id: 'r', type: 'redact', x: 0, y: 20, w: 200, h: 30, color: '#000000', stroke: 4 },
      { id: 'b', type: 'blur', x: 0, y: 0, w: 220, h: 80, color: '#e11d48', stroke: 4 },
    ],
  })
  const pixel = await annotator(page).evaluate(async (element) => {
    const canvas = await (element as HTMLElement & { toCanvas(): Promise<HTMLCanvasElement> }).toCanvas()
    return [...canvas.getContext('2d')!.getImageData(60, 35, 1, 1).data.slice(0, 3)]
  })
  expect(pixel).toEqual([0, 0, 0])
  await expect(annotator(page).locator('g.shape').last()).toHaveAttribute('data-id', 'r')
})
