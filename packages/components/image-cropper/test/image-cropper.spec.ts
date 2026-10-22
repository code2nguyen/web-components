import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'
import type { CropRect, ImageCropper } from '../src/image-cropper'

const selection = (page: Page, name = 'Crop area') => page.getByRole('group', { name })
const handle = (page: Page, position: string) => page.locator(`c2-image-cropper [part="handle"].${position}`)
const events = (page: Page) => page.getByLabel('Crop events')

/** The selection in natural pixels, rounded so pointer arithmetic compares cleanly. */
const crop = (page: Page) =>
  page.locator('c2-image-cropper').evaluate((element: ImageCropper) => {
    const { x, y, width, height } = element.crop as CropRect
    return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
  })

/** Top-left corner of the rendered image: natural and rendered pixels coincide in these scenarios. */
async function origin(page: Page) {
  const box = await page.locator('c2-image-cropper [part="image"]').boundingBox()
  if (!box) throw new Error('Image has no bounds')
  return box
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const image = await origin(page)
  await page.mouse.move(image.x + from.x, image.y + from.y)
  await page.mouse.down()
  await page.mouse.move(image.x + to.x, image.y + to.y, { steps: 5 })
  await page.mouse.up()
}

test('selects the centred 80% of the image once it loads', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-image-cropper [part="image"]')).toHaveAttribute('alt', 'Four coloured quadrants')
  expect(await crop(page)).toEqual({ x: 40, y: 30, width: 320, height: 240 })
  const image = await origin(page)
  const box = await selection(page).boundingBox()
  expect(box!.x - image.x).toBeCloseTo(40, 0)
  expect(box!.width).toBeCloseTo(320, 0)
  await expect(handle(page, 'n')).toHaveCount(1)
  await expect(page.locator('c2-image-cropper [part="handle"]')).toHaveCount(8)
})

test('dragging the selection moves it and reports the change once released', async ({ page, scenario }) => {
  await scenario()
  await drag(page, { x: 200, y: 150 }, { x: 180, y: 140 })
  expect(await crop(page)).toEqual({ x: 20, y: 20, width: 320, height: 240 })
  await expect(events(page)).toHaveText(/input:\d+ change:1$/)
  await expect(selection(page)).toBeFocused()
  // Focus taken by a drag draws no ring; the next key press brings it back.
  await expect(selection(page)).toHaveCSS('outline-style', 'none')
  await page.keyboard.press('ArrowLeft')
  await expect(selection(page)).toHaveCSS('outline-style', 'solid')
})

test('keeps the selection inside the image', async ({ page, scenario }) => {
  await scenario()
  await drag(page, { x: 200, y: 150 }, { x: 0, y: 0 })
  expect(await crop(page)).toEqual({ x: 0, y: 0, width: 320, height: 240 })
})

test('a corner handle resizes from the opposite corner', async ({ page, scenario }) => {
  await scenario()
  await drag(page, { x: 360, y: 270 }, { x: 300, y: 200 })
  expect(await crop(page)).toEqual({ x: 40, y: 30, width: 260, height: 170 })
})

test('an edge handle resizes one side', async ({ page, scenario }) => {
  await scenario()
  await drag(page, { x: 40, y: 150 }, { x: 100, y: 150 })
  expect(await crop(page)).toEqual({ x: 100, y: 30, width: 260, height: 240 })
})

test('aspect-ratio keeps the proportions and hides the edge handles', async ({ page, scenario }) => {
  await scenario('square')
  expect(await crop(page)).toEqual({ x: 80, y: 30, width: 240, height: 240 })
  await expect(page.locator('c2-image-cropper [part="handle"]')).toHaveCount(4)
  await drag(page, { x: 320, y: 270 }, { x: 250, y: 260 })
  const { width, height } = await crop(page)
  expect(width).toBe(height)
  expect(width).toBe(230)
})

test('changing aspect-ratio refits the selection around its centre', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-image-cropper').evaluate((element: ImageCropper) => element.setAttribute('aspect-ratio', '16/9'))
  const { x, y, width, height } = await crop(page)
  expect(width / height).toBeCloseTo(16 / 9, 2)
  expect(x + width / 2).toBeCloseTo(200, 0)
  expect(y + height / 2).toBeCloseTo(150, 0)
})

test('dragging on the image outside the selection draws a new one', async ({ page, scenario }) => {
  await scenario()
  await drag(page, { x: 380, y: 290 }, { x: 300, y: 200 })
  expect(await crop(page)).toEqual({ x: 300, y: 200, width: 80, height: 90 })
})

test('a click on the image keeps the selection', async ({ page, scenario }) => {
  await scenario()
  const image = await origin(page)
  await page.mouse.click(image.x + 10, image.y + 10)
  expect(await crop(page)).toEqual({ x: 40, y: 30, width: 320, height: 240 })
  await expect(events(page)).toHaveText('')
})

test('Escape cancels a drag', async ({ page, scenario }) => {
  await scenario()
  const image = await origin(page)
  await page.mouse.move(image.x + 200, image.y + 150)
  await page.mouse.down()
  await page.mouse.move(image.x + 150, image.y + 120, { steps: 3 })
  expect((await crop(page)).x).toBe(0)
  await page.keyboard.press('Escape')
  expect(await crop(page)).toEqual({ x: 40, y: 30, width: 320, height: 240 })
  await page.mouse.move(image.x + 100, image.y + 100)
  await page.mouse.up()
  expect(await crop(page)).toEqual({ x: 40, y: 30, width: 320, height: 240 })
  await expect(events(page)).toHaveText(/change:0$/)
})

test('moves, resizes and scales with the keyboard and announces the result', async ({ page, scenario, tab }) => {
  await scenario()
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(selection(page)).toBeFocused()
  await expect(selection(page)).toHaveCSS('outline-style', 'solid')
  await expect(selection(page)).toHaveAccessibleDescription(/Arrow keys move the selection/)

  await page.keyboard.press('ArrowRight')
  expect(await crop(page)).toEqual({ x: 41, y: 30, width: 320, height: 240 })
  await page.keyboard.press('Shift+ArrowUp')
  expect(await crop(page)).toEqual({ x: 41, y: 20, width: 320, height: 240 })
  await page.keyboard.press('Alt+ArrowLeft')
  expect(await crop(page)).toEqual({ x: 41, y: 20, width: 319, height: 240 })
  await page.keyboard.press('Alt+ArrowDown')
  expect(await crop(page)).toEqual({ x: 41, y: 20, width: 319, height: 241 })
  await expect(page.locator('c2-image-cropper [aria-live="polite"]')).toHaveText('319 × 241 pixels at 41, 20')

  await page.keyboard.press('-')
  const scaled = await crop(page)
  expect(scaled.width).toBe(303)
  await expect(events(page)).toHaveText('input:5 change:5')
})

test('authored crop is kept', async ({ page, scenario }) => {
  await scenario('authored')
  expect(await crop(page)).toEqual({ x: 10, y: 20, width: 100, height: 50 })
})

test('toBlob returns the selection as a PNG at its natural size', async ({ page, scenario }) => {
  await scenario('authored')
  const size = await page.locator('c2-image-cropper').evaluate(async (element: ImageCropper) => {
    const bitmap = await createImageBitmap(await element.toBlob())
    return { width: bitmap.width, height: bitmap.height }
  })
  expect(size).toEqual({ width: 100, height: 50 })
  const scaled = await page.locator('c2-image-cropper').evaluate((element: ImageCropper) => {
    const canvas = element.toCanvas({ width: 50 })
    return { width: canvas.width, height: canvas.height, pixel: [...canvas.getContext('2d')!.getImageData(10, 10, 1, 1).data] }
  })
  // The authored selection lies in the red top-left quadrant.
  expect(scaled).toEqual({ width: 50, height: 25, pixel: [239, 68, 68, 255] })
})

test('an ellipse clips the output to the selection', async ({ page, scenario }) => {
  await scenario('ellipse')
  await expect(selection(page)).toHaveCSS('border-radius', '50%')
  const corners = await page.locator('c2-image-cropper').evaluate((element: ImageCropper) => {
    const canvas = element.toCanvas()
    const context = canvas.getContext('2d')!
    return [context.getImageData(1, 1, 1, 1).data[3], context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data[3]]
  })
  expect(corners).toEqual([0, 255])
})

test('disabled locks the selection', async ({ page, scenario, tab }) => {
  await scenario('disabled')
  await expect(page.locator('c2-image-cropper [part="handle"]')).toHaveCount(0)
  await expect(selection(page)).toHaveAttribute('aria-disabled', 'true')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(selection(page)).not.toBeFocused()
  await drag(page, { x: 200, y: 150 }, { x: 100, y: 100 })
  expect(await crop(page)).toEqual({ x: 40, y: 30, width: 320, height: 240 })
})

test('shows the placeholder slot without a src', async ({ page, scenario }) => {
  await scenario('empty')
  await expect(page.getByText('Choose an image')).toBeVisible()
  await expect(page.locator('c2-image-cropper [part="image"]')).toHaveCount(0)
})

test('speaks the language of the page', async ({ page, scenario }) => {
  await scenario('french')
  await expect(selection(page, 'Zone de recadrage')).toBeVisible()
})

for (const name of ['default', 'ellipse', 'disabled']) {
  test(`has no detectable accessibility violations (${name})`, async ({ page, scenario }) => {
    await scenario(name)
    const results = await new AxeBuilder({ page }).include('c2-image-cropper').analyze()
    expect(results.violations).toEqual([])
  })
}
