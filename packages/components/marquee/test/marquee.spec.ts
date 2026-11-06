import type { Locator, Page } from '@playwright/test'
import { accessible, expect as componentExpect } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

/** Stops every item's animation at `ms` into the shared cycle, so positions can be read exactly. */
async function seek(page: Page, ms: number) {
  await page.locator('c2-marquee').evaluate((host, time) => {
    for (const item of host.shadowRoot!.querySelectorAll('.item')) {
      for (const animation of item.getAnimations()) {
        animation.pause()
        animation.currentTime = time
      }
    }
  }, ms)
}

async function box(locator: Locator) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a rendered element')
  return rect
}

/** Left edge of each item relative to the strip's left edge. */
async function offsets(page: Page, axis: 'x' | 'y' = 'x') {
  const strip = await box(page.locator('c2-marquee'))
  const items = await page.locator('c2-marquee > .logo').all()
  return Promise.all(items.map(async (item) => Math.round((await box(item))[axis] - strip[axis]) || 0))
}

test('lays the items out end to end and moves them toward the start', async ({ page, scenario }) => {
  await scenario()
  await componentExpect(page.locator('c2-marquee')).toHaveHostAria('role', 'marquee')

  await seek(page, 0)
  expect(await offsets(page)).toEqual([0, 120, 240, 360, 480, 600])

  // 40px per second by default.
  await seek(page, 1000)
  expect(await offsets(page)).toEqual([-40, 80, 200, 320, 440, 560])

  // The first item leaves the strip whole, then joins the end of the line, keeping the spacing.
  await seek(page, 3500)
  expect(await offsets(page)).toEqual([580, -20, 100, 220, 340, 460])
})

test('follows the speed variable', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-marquee').evaluate((host: HTMLElement) => host.style.setProperty('--c2-marquee--speed', '80'))
  await seek(page, 1000)
  expect(await offsets(page)).toEqual([-80, 40, 160, 280, 400, 520])
})

test('reverse moves the items toward the end', async ({ page, scenario }) => {
  await scenario('reverse')
  await seek(page, 0)
  // The last item waits off the start edge, where it enters from (the same point of the loop as 600px).
  expect(await offsets(page)).toEqual([0, 120, 240, 360, 480, -120])
  await seek(page, 1000)
  expect(await offsets(page)).toEqual([40, 160, 280, 400, 520, -80])
})

test('starts from the right and moves right in a right-to-left page', async ({ page, scenario }) => {
  await scenario('rtl')
  const strip = await box(page.locator('c2-marquee'))
  // The gap pads the inline end of each item, which is its left side here.
  const first = page.locator('c2-marquee > .logo').first()

  await seek(page, 0)
  expect(Math.round((await box(first)).x + 100 - (strip.x + strip.width))).toBe(0)
  await seek(page, 1000)
  expect(Math.round((await box(first)).x + 100 - (strip.x + strip.width))).toBe(40)
})

test('vertical strips move up inside their own height', async ({ page, scenario }) => {
  await scenario('vertical')
  expect(Math.round((await box(page.locator('c2-marquee'))).height)).toBe(300)
  await seek(page, 0)
  expect(await offsets(page, 'y')).toEqual([0, 60, 120, 180, 240, 300])
  await seek(page, 1000)
  expect(await offsets(page, 'y')).toEqual([-40, 20, 80, 140, 200, 260])
})

test('items shorter than the strip leave a gap and re-enter from outside it', async ({ page, scenario }) => {
  await scenario('short')
  await seek(page, 0)
  expect(await offsets(page)).toEqual([0, 120])
  // The cycle is the strip plus the widest item (520px): once the first item has left (at -120px) it re-enters
  // from 400px, just past the right edge, so 140px of travel puts it at 380px.
  await seek(page, 3500)
  expect(await offsets(page)).toEqual([380, -20])
})

test('pauses on hover, on focus inside and while paused is set', async ({ page, scenario, tab }) => {
  await scenario()
  const item = page.locator('c2-marquee').locator('.item').first()
  await expect(item).toHaveCSS('animation-play-state', 'running')

  await page.locator('c2-marquee').hover()
  await expect(item).toHaveCSS('animation-play-state', 'paused')
  await page.mouse.move(0, 400)
  await expect(item).toHaveCSS('animation-play-state', 'running')

  await tab()
  await expect(page.getByRole('link', { name: 'Item 2' })).toBeFocused()
  await expect(item).toHaveCSS('animation-play-state', 'paused')
})

test('the paused attribute freezes the strip', async ({ page, scenario }) => {
  await scenario('paused')
  await expect(page.locator('c2-marquee').locator('.item').first()).toHaveCSS('animation-play-state', 'paused')
})

test('lays out a child added later', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-marquee').evaluate((host) => host.insertAdjacentHTML('beforeend', '<span class="logo">Item 7</span>'))
  await expect(page.getByText('Item 7')).toBeVisible()
  await expect.poll(async () => (await seek(page, 0), offsets(page))).toEqual([0, 120, 240, 360, 480, 600, 720])
})

test('reduced motion stops the strip and lets it scroll by hand', async ({ page, scenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await scenario()
  const viewport = page.locator('c2-marquee').locator('.viewport')
  await expect(page.locator('c2-marquee').locator('.item').first()).toHaveCSS('animation-name', 'none')
  expect(await offsets(page)).toEqual([0, 120, 240, 360, 480, 600])
  await expect(viewport).toHaveCSS('overflow-x', 'auto')
  expect(await viewport.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
})

test('is accessible', async ({ page, scenario }) => {
  await scenario()
  await accessible(page)
})
