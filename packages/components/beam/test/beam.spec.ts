import type { Page } from '@playwright/test'
import { accessible } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

const track = (page: Page) => page.locator('c2-beam').locator('[part="track"]')
const beam = (page: Page) => page.locator('c2-beam').locator('[part="beam"]')

test('draws a line from edge to edge of the two elements', async ({ page, scenario }) => {
  await scenario()
  await expect(track(page)).toHaveAttribute('d', 'M 40 100 Q 200 100 360 100')
  await expect(beam(page)).toHaveAttribute('d', 'M 40 100 Q 200 100 360 100')
  await expect(page.locator('c2-beam').locator('svg')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('c2-beam')).toHaveCSS('pointer-events', 'none')
  await accessible(page)
})

test('curvature bends the middle of the line', async ({ page, scenario }) => {
  await scenario('curved')
  // The line leaves each box toward the control point, 40px above the middle.
  await expect(track(page)).toHaveAttribute('d', 'M 40 95.6 Q 200 60 360 95.6')
  await page.locator('c2-beam').evaluate((element: HTMLElement & { curvature: number }) => (element.curvature = -40))
  await expect(track(page)).toHaveAttribute('d', 'M 40 104.4 Q 200 140 360 104.4')
})

test('the light travels from the first element to the second', async ({ page, scenario }) => {
  await scenario()
  const offsetAt = (time: number) =>
    beam(page).evaluate((path, ms) => {
      const animation = path.getAnimations()[0]!
      animation.pause()
      animation.currentTime = ms
      return getComputedStyle(path).strokeDashoffset
    }, time)
  // 3s by default: the 20-unit light starts just before the line and ends past it.
  expect(await offsetAt(0)).toBe('20px')
  expect(await offsetAt(1500)).toBe('-40px')
  await expect(beam(page)).toHaveCSS('animation-direction', 'normal')
})

test('reverse sends the light back', async ({ page, scenario }) => {
  await scenario('reverse')
  await expect(beam(page)).toHaveCSS('animation-direction', 'reverse')
})

test('the timing variables set the speed', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-beam').evaluate((element: HTMLElement) => {
    element.style.setProperty('--c2-beam__beam--duration', '5s')
    element.style.setProperty('--c2-beam__beam--delay', '-1s')
  })
  await expect(beam(page)).toHaveCSS('animation-duration', '5s')
  await expect(beam(page)).toHaveCSS('animation-delay', '-1s')
})

test('follows an element that changes size', async ({ page, scenario }) => {
  await scenario()
  await page.locator('#target').evaluate((element: HTMLElement) => (element.style.height = '80px'))
  // The target's centre moves down 20px, so the line now slopes down to it.
  await expect(track(page)).toHaveAttribute('d', 'M 40 101.1 Q 200 110 360 118.9')
})

test('redraw() follows an element that moved without resizing', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-beam').evaluate((element: HTMLElement & { redraw(): void }) => {
    document.getElementById('target')!.style.left = '260px'
    element.redraw()
  })
  await expect(track(page)).toHaveAttribute('d', 'M 40 100 Q 150 100 260 100')
})

test('waits for an element added later, and draws nothing until then', async ({ page, scenario }) => {
  await scenario('late')
  await expect(page.locator('c2-beam').locator('svg')).toHaveCount(0)
  await page.locator('.diagram').evaluate((diagram) => diagram.insertAdjacentHTML('afterbegin', '<div class="node" id="target">B</div>'))
  await expect(track(page)).toHaveAttribute('d', 'M 40 100 Q 200 100 360 100')
})

test('reduced motion keeps the line and drops the light', async ({ page, scenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scenario()
  // A horizontal path has no height, so check it is drawn rather than "visible".
  await expect(track(page)).toHaveAttribute('d', 'M 40 100 Q 200 100 360 100')
  await expect(track(page)).toHaveCSS('display', 'inline')
  await expect(beam(page)).toHaveCSS('display', 'none')
})
