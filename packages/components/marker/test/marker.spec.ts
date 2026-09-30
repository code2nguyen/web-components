import { accessible, expect } from '../../../../tests/component-fixture'
import { test } from './fixture'

test('highlights its text as a mark from the start', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-marker')
  const mark = host.locator('[part="mark"]')

  await expect(host).toHaveText('fully automated')
  await expect(host).toHaveHostAria('role', 'mark')
  await expect(mark).toHaveClass(/is-drawn/)
  await expect(mark).toHaveCSS('background-size', '100% 100%')
  await expect(mark).toHaveCSS('transition-duration', '0s')
  // Nothing about the state leaks onto the host, which a server renderer would report as a hydration mismatch.
  expect(await host.evaluate((element) => element.getAttributeNames())).toEqual(['id'])
  await accessible(page)
})

test('draws each variant and falls back to a highlight for an unknown one', async ({ page, scenario }) => {
  await scenario('variants')

  await expect(page.locator('#underline [part="mark"]')).toHaveCSS('background-size', '100% 2px')
  await expect(page.locator('#strike [part="mark"]')).toHaveCSS('background-position', '0% 55%')
  await expect(page.locator('#strike')).toHaveHostAria('role', 'deletion')
  await expect(page.locator('#underline')).toHaveHostAria('role', 'mark')

  for (const id of ['box', 'circle']) {
    const outline = page.locator(`#${id} [part="outline"]`)
    await expect(outline).toHaveAttribute('aria-hidden', 'true')
    await expect(outline.locator('path')).toHaveCSS('stroke-dashoffset', '0px')
    // The outline encloses the text with the default 4px offset on every side.
    const [text, box] = await Promise.all([page.locator(`#${id} [part="mark"]`).boundingBox(), outline.boundingBox()])
    expect(box!.x).toBeCloseTo(text!.x - 4, 0)
    expect(box!.width).toBeCloseTo(text!.width + 8, 0)
  }
  await expect(page.locator('#highlight [part="outline"]')).toHaveCount(0)

  await expect(page.locator('#unknown [part="mark"]')).toHaveClass(/mark--highlight/)
  await expect(page.locator('#unknown')).toHaveHostAria('role', 'mark')
  await accessible(page)
})

test('follows the text across wrapped lines', async ({ page, scenario }) => {
  await scenario('wrap')
  const mark = page.locator('c2-marker [part="mark"]')

  const lines = await mark.evaluate((element) => element.getClientRects().length)
  expect(lines).toBeGreaterThan(1)
  // WebKit only knows the prefixed property.
  const decoration = await mark.evaluate((element) => {
    const style = getComputedStyle(element)
    return style.getPropertyValue('box-decoration-break') || style.getPropertyValue('-webkit-box-decoration-break')
  })
  expect(decoration).toBe('clone')
})

test('is themed through its CSS variables', async ({ page, scenario }) => {
  await scenario('themed')
  const host = page.locator('c2-marker')
  const path = host.locator('[part="outline"] path')

  await expect(path).toHaveCSS('stroke', 'rgb(220, 38, 38)')
  await expect(path).toHaveCSS('stroke-width', '3px')
  await expect(host.locator('[part="mark"]')).toHaveCSS('padding-left', '6px')

  await host.evaluate((element: HTMLElement) => element.style.setProperty('--c2-marker__stroke--color', 'rgb(2, 101, 220)'))
  await expect(path).toHaveCSS('stroke', 'rgb(2, 101, 220)')
})

test('draws an animated mark once it scrolls into view', async ({ page, scenario }) => {
  await scenario('animated')
  const visible = page.locator('#visible [part="mark"]')
  const below = page.locator('#below [part="mark"]')

  await expect(visible).toHaveClass(/is-drawn/)
  await expect(visible).toHaveCSS('transition-duration', '2s')
  await expect(below).not.toHaveClass(/is-drawn/)
  await expect(below.locator('path')).toHaveCSS('stroke-dashoffset', '1px')

  await page.mouse.wheel(0, 4000)
  await expect(below).toHaveClass(/is-drawn/)

  // Drawn once: scrolling back out of view leaves the mark in place.
  await page.mouse.wheel(0, -4000)
  await expect(below).toHaveClass(/is-drawn/)
})

test('draws without motion when the user prefers reduced motion', async ({ page, scenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scenario('animated')
  const visible = page.locator('#visible [part="mark"]')

  await expect(visible).toHaveClass(/is-drawn/)
  await expect(visible).toHaveCSS('transition-duration', '0s')
})
