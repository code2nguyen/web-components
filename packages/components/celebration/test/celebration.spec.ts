import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const celebration = (page: Page) => page.locator('c2-celebration')
const stage = (page: Page) => celebration(page).locator('canvas')
const events = async (page: Page) => JSON.parse((await celebration(page).getAttribute('data-events')) ?? '[]')
const FAST = 'style="--c2-celebration--duration: 600ms"'

/** Whether the canvas has a drawn pixel, optionally of one colour (r, g, b within 40). */
const drawn = (page: Page, color?: [number, number, number]) =>
  stage(page).evaluate((element, rgb) => {
    const canvas = element as HTMLCanvasElement
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] < 200) continue
      if (!rgb) return true
      if (Math.abs(data[index] - rgb[0]) < 40 && Math.abs(data[index + 1] - rgb[1]) < 40 && Math.abs(data[index + 2] - rgb[2]) < 40) return true
    }
    return false
  }, color)

test('fire() throws confetti in the top layer, over the whole viewport, then clears it and says so', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-celebration ${FAST}><c2-button>Publish</c2-button></c2-celebration>`)
  await watch(celebration(page), 'celebration-end')
  await expect(stage(page)).toBeHidden()
  await celebration(page).evaluate((element) => (element as HTMLElement & { fire(): void }).fire())
  await expect(stage(page)).toBeVisible()
  expect(await stage(page).evaluate((element) => element.matches(':popover-open'))).toBe(true)
  expect(await stage(page).evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none')
  await expect.poll(() => drawn(page)).toBe(true)
  await expect.poll(() => events(page)).toEqual([null])
  await expect(stage(page)).toBeHidden()
  await accessible(page)
})

test('trigger="click" fires from the click; the colours come from the variable', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-celebration trigger="click" style="--c2-celebration--duration: 600ms; --c2-celebration--colors: rgb(220, 20, 60)"><c2-button>Publish</c2-button></c2-celebration>`,
  )
  await watch(celebration(page), 'celebration-end')
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect.poll(() => drawn(page, [220, 20, 60])).toBe(true)
  expect(await drawn(page, [2, 101, 220])).toBe(false)
  await expect.poll(() => events(page)).toEqual([null])
  // From the keyboard too, from the element's centre.
  await page.getByRole('button', { name: 'Publish' }).focus()
  await page.keyboard.press('Enter')
  await expect(stage(page)).toBeVisible()
  await expect.poll(() => events(page)).toHaveLength(2)
})

test('burst and emoji draw and end; a page click goes through the stage while it plays', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-celebration kind="burst" style="--c2-celebration--duration: 1500ms"></c2-celebration><c2-button id="under">Under</c2-button>`)
  await watch(celebration(page), 'celebration-end')
  await page.evaluate(() => document.getElementById('under')!.addEventListener('click', () => (document.body.dataset.clicked = 'yes')))
  await celebration(page).evaluate((element) => (element as HTMLElement & { fire(options: object): void }).fire({ x: 40, y: 40 }))
  await expect.poll(() => drawn(page)).toBe(true)
  await page.getByRole('button', { name: 'Under' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-clicked', 'yes')
  await expect.poll(() => events(page)).toEqual([null])

  await props(celebration(page), { kind: 'emoji', emoji: ['🚀'] })
  await celebration(page).evaluate((element) => (element as HTMLElement & { fire(): void }).fire())
  await expect.poll(() => drawn(page)).toBe(true)
  await expect.poll(() => events(page)).toHaveLength(2)
})

test('under reduced motion nothing is drawn, and the end still fires', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-celebration ${FAST}></c2-celebration>`)
  await watch(celebration(page), 'celebration-end')
  await celebration(page).evaluate((element) => (element as HTMLElement & { fire(): void }).fire())
  await expect.poll(() => events(page)).toEqual([null])
  await expect(stage(page)).toBeHidden()
})
