import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const IMAGE = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="${color}"/></svg>`)}`
const layers = `<img slot="before" src="${IMAGE('#1d4ed8')}" alt="Kitchen before" /><img slot="after" src="${IMAGE('#dc2626')}" alt="Kitchen after" />`

const compare = (page: Page, selector = 'c2-image-compare') => page.locator(selector)
const handle = (locator: Locator) => locator.locator('.handle')
const position = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { position: number }).position)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as unknown[]
/** Which layer shows at a share of the frame's width (or height when vertical), sampled from a screenshot. */
async function colorAt(page: Page, locator: Locator, share: number, vertical = false): Promise<string> {
  const box = (await locator.boundingBox())!
  const x = vertical ? box.x + box.width / 2 : box.x + box.width * share
  const y = vertical ? box.y + box.height * share : box.y + box.height * 0.6
  return pixel(page, x, y)
}

/** `before` (blue), `after` (red) or `chip` (the dark chip over the blue layer) at a point of the page. */
async function pixel(page: Page, x: number, y: number): Promise<string> {
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })
  return page.evaluate(async (data) => {
    const image = new Image()
    image.src = `data:image/png;base64,${data}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const [r, , b] = context.getImageData(0, 0, 1, 1).data
    return r > b ? 'after' : b > 150 ? 'before' : 'chip'
  }, shot.toString('base64'))
}

test('the after layer is cut at the divider; the handle is a named slider; each label chip is cut with its layer', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-image-compare before-label="Before" after-label="After">${layers}</c2-image-compare>`)
  const host = compare(page)
  await expect(page.getByRole('slider', { name: 'Compare: Kitchen before / Kitchen after' })).toHaveAttribute('aria-valuetext', '50% before, 50% after')
  await expect(handle(host)).toHaveAttribute('aria-valuenow', '50')
  await expect(handle(host)).toHaveAttribute('aria-orientation', 'horizontal')
  expect(await colorAt(page, host, 0.25)).toBe('before')
  expect(await colorAt(page, host, 0.75)).toBe('after')
  await expect(host.locator('.before-label')).toHaveText('Before')
  const chip = (await host.locator('.before-label').boundingBox())!
  const middle = { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 }
  expect(await pixel(page, middle.x, middle.y)).toBe('chip')
  // Once the divider passes over it, the before chip is cut with its layer: the after layer shows there.
  await host.evaluate((element) => ((element as HTMLElement & { position: number }).position = 5))
  expect(await pixel(page, middle.x, middle.y)).toBe('after')
  await expect(host.locator('.after-label')).toBeVisible()
  // The component wrote nothing on its host.
  expect(await host.evaluate((element) => element.getAttributeNames().sort())).toEqual(['after-label', 'before-label'])
  await accessible(page)
})

test('dragging the handle or pressing anywhere moves the divider: input while moving, change on release', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-image-compare>${layers}</c2-image-compare>`)
  const host = compare(page)
  await watch(host, 'change')
  const inputs = await host.evaluate((element) => {
    const seen: number[] = []
    element.addEventListener('input', () => seen.push((element as HTMLElement & { position: number }).position))
    ;(window as unknown as { inputs: number[] }).inputs = seen
    return seen.length
  })
  expect(inputs).toBe(0)
  const box = (await host.boundingBox())!
  const knob = (await handle(host).boundingBox())!
  await page.mouse.move(knob.x + knob.width / 2, knob.y + knob.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 4 })
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 })
  expect(await events(host)).toEqual([])
  await page.mouse.up()
  expect(Math.round(await position(host))).toBe(80)
  expect(await events(host)).toHaveLength(1)
  expect((await page.evaluate(() => (window as unknown as { inputs: number[] }).inputs)).length).toBeGreaterThan(2)
  await expect(handle(host)).toBeFocused()
  expect(await colorAt(page, host, 0.7)).toBe('before')
  // A press anywhere on the images moves the divider there.
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2)
  expect(Math.round(await position(host))).toBe(20)
  expect(await events(host)).toHaveLength(2)
})

test('the keyboard moves the divider by 1%, Page keys by 10%, Home and End to the edges; each move is a change', async ({ page, renderScenario }) => {
  await renderScenario(`<button>Before</button><c2-image-compare label="Retouch" position="30">${layers}</c2-image-compare>`)
  const host = compare(page)
  await watch(host, 'change')
  await page.getByRole('button', { name: 'Before' }).focus()
  await page.keyboard.press('Tab')
  const slider = page.getByRole('slider', { name: 'Retouch' })
  await expect(slider).toBeFocused()
  await page.keyboard.press('ArrowRight')
  expect(await position(host)).toBe(31)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  expect(await position(host)).toBe(29)
  await page.keyboard.press('PageDown')
  expect(await position(host)).toBe(39)
  await page.keyboard.press('PageUp')
  expect(await position(host)).toBe(29)
  await page.keyboard.press('End')
  expect(await position(host)).toBe(100)
  await expect(slider).toHaveAttribute('aria-valuetext', '100% before, 0% after')
  await page.keyboard.press('ArrowRight')
  expect(await position(host)).toBe(100)
  await page.keyboard.press('Home')
  expect(await position(host)).toBe(0)
  // Every key that acts fires change; the one at the edge settles in place and fires it too.
  expect(await events(host)).toHaveLength(8)
})

test('vertical stacks the layers top to bottom; hover follows the pointer without a press', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-image-compare id="v" orientation="vertical" after-label="After">${layers}</c2-image-compare><c2-image-compare id="h" hover>${layers}</c2-image-compare>`,
  )
  const vertical = compare(page, '#v')
  await expect(handle(vertical)).toHaveAttribute('aria-orientation', 'vertical')
  expect(await colorAt(page, vertical, 0.25, true)).toBe('before')
  expect(await colorAt(page, vertical, 0.75, true)).toBe('after')
  await handle(vertical).focus()
  await page.keyboard.press('ArrowDown')
  expect(await position(vertical)).toBe(51)
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  expect(await position(vertical)).toBe(49)

  const hover = compare(page, '#h')
  await watch(hover, 'change')
  const box = (await hover.boundingBox())!
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2)
  expect(Math.round(await position(hover))).toBe(25)
  expect(await events(hover)).toEqual([])
  // Leaving after moving settles it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60)
  await expect.poll(() => events(hover)).toHaveLength(1)
  // Hover, then press and drag: the release settles it once; leaving afterwards reports nothing more.
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2)
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => events(hover)).toHaveLength(2)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 60)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await events(hover)).toHaveLength(2)
  await accessible(page)
})

test('a translation names the handle and reads its value in its language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-image-compare position="25">${layers}</c2-image-compare></div>`)
  const slider = page.getByRole('slider', { name: 'Comparer : Kitchen before / Kitchen after' })
  await expect(slider).toHaveAttribute('aria-valuetext', /25\s?% avant, 75\s?% après/)
})
