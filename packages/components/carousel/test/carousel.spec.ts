import { test, expect } from './fixture'
import type { Page } from '@playwright/test'

/** Index of the slide whose start edge lines up with the track's start edge, read from real geometry. */
async function slideAtStart(page: Page) {
  return page.locator('c2-carousel').evaluate((carousel) => {
    const track = carousel.shadowRoot!.querySelector('.c2-carousel-track')!
    const rtl = getComputedStyle(track).direction === 'rtl'
    const edge = rtl ? track.getBoundingClientRect().right : track.getBoundingClientRect().left
    return [...carousel.children].findIndex((slide) => Math.abs((rtl ? slide.getBoundingClientRect().right : slide.getBoundingClientRect().left) - edge) < 2)
  })
}

const indicator = (page: Page, index: number) => page.getByRole('button', { name: `Go to slide ${index}`, exact: true })

test('names the region and every slide', async ({ page, scenario }) => {
  await scenario()
  const region = page.getByRole('region', { name: 'Featured' })
  await expect(region).toHaveAttribute('aria-roledescription', 'carousel')
  const slides = page.getByRole('group', { name: /of 5$/ })
  await expect(slides).toHaveCount(5)
  await expect(slides.first()).toHaveAccessibleName('1 of 5')
  await expect(slides.first()).toHaveAttribute('aria-roledescription', 'slide')
})

test('keeps an author slide label', async ({ page, scenario }) => {
  await scenario('labelled')
  await expect(page.getByRole('group', { name: 'Cover' })).toBeVisible()
  await expect(page.getByRole('group', { name: '2 of 3' })).toBeAttached()
})

test('next and previous move one slide and stop at the ends', async ({ page, scenario }) => {
  await scenario()
  const previous = page.getByRole('button', { name: 'Previous slide' })
  const next = page.getByRole('button', { name: 'Next slide' })
  await expect(previous).toBeDisabled()
  await next.click()
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(1)
  await expect(page.locator('c2-carousel')).toHaveAttribute('index', '1')
  await previous.click()
  await expect.poll(() => slideAtStart(page)).toBe(0)
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('0->1/5,1->0/5')
  for (let i = 0; i < 4; i++) await next.click()
  await expect(indicator(page, 5)).toHaveAttribute('aria-current', 'true')
  await expect(next).toBeDisabled()
  await expect.poll(() => slideAtStart(page)).toBe(4)
})

test('a disabled control hands focus to the opposite one', async ({ page, scenario }) => {
  await scenario('loop')
  await page.locator('c2-carousel').evaluate((carousel) => carousel.removeAttribute('loop'))
  const next = page.getByRole('button', { name: 'Next slide' })
  await next.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(next).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous slide' })).toBeFocused()
})

test('loop wraps around both ends', async ({ page, scenario }) => {
  await scenario('loop')
  await page.getByRole('button', { name: 'Previous slide' }).click()
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(2)
  await page.getByRole('button', { name: 'Next slide' }).click()
  await expect(indicator(page, 1)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('0->2/3,2->0/3')
})

test('an indicator jumps to its slide', async ({ page, scenario }) => {
  await scenario()
  await indicator(page, 4).click()
  await expect.poll(() => slideAtStart(page)).toBe(3)
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('0->3/5')
})

test('the indicators are one tab stop that arrow keys rove', async ({ page, scenario, tab }) => {
  await scenario()
  await indicator(page, 1).focus()
  await page.keyboard.press('ArrowRight')
  await expect(indicator(page, 2)).toBeFocused()
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('End')
  await expect(indicator(page, 5)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(indicator(page, 1)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(indicator(page, 5)).toBeFocused()
  await tab(true)
  await expect(indicator(page, 4)).not.toBeFocused()
  await expect.poll(() => slideAtStart(page)).toBe(4)
})

test('the focused track moves with arrow keys, Home and End', async ({ page, scenario, tab }) => {
  await scenario()
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  const track = page.locator('c2-carousel').locator('.c2-carousel-track')
  await expect(track).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await page.keyboard.press('End')
  await expect(indicator(page, 5)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(4)
  await page.keyboard.press('Home')
  await expect.poll(() => slideAtStart(page)).toBe(0)
  await expect(indicator(page, 1)).toHaveAttribute('aria-current', 'true')
})

test('scrolling the track updates the current slide', async ({ page, scenario }) => {
  await scenario()
  const track = page.locator('c2-carousel').locator('.c2-carousel-track')
  const box = await track.boundingBox()
  if (!box) throw new Error('Track has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(box.width * 2, 0)
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText(/->2\/5$/)
})

test('tabbing to a link in a later slide makes it current', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('link', { name: 'Link 3' }).focus()
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
})

test('an initial index is shown without firing slide-change', async ({ page, scenario }) => {
  await scenario('start')
  await expect.poll(() => slideAtStart(page)).toBe(2)
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('')
})

test('several slides per view reduce the reachable positions', async ({ page, scenario }) => {
  await scenario('multi')
  await expect(page.getByRole('group', { name: 'Choose slide' }).getByRole('button')).toHaveCount(5)
  await indicator(page, 5).click()
  await expect.poll(() => slideAtStart(page)).toBe(4)
  await expect(page.getByRole('button', { name: 'Next slide' })).toBeDisabled()
})

test('a single slide shows no controls', async ({ page, scenario }) => {
  await scenario('single')
  await expect(page.getByRole('button', { name: 'Next slide' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Choose slide' })).toHaveCount(0)
})

test('right-to-left arrows follow the reading direction', async ({ page, scenario }) => {
  await scenario('rtl')
  await page.getByRole('button', { name: 'Next slide' }).click()
  await expect.poll(() => slideAtStart(page)).toBe(1)
  await indicator(page, 2).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(2)
})

test('autoplay advances, wraps, pauses on hover and stops with the control', async ({ page, scenario }) => {
  await scenario('autoplay')
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await expect(indicator(page, 1)).toHaveAttribute('aria-current', 'true', { timeout: 3000 })
  const track = page.locator('c2-carousel').locator('.c2-carousel-track')
  await expect(track).toHaveAttribute('aria-live', 'off')

  // The pointer over the carousel holds rotation; the announcement comes back while it is held.
  const box = await track.boundingBox()
  if (!box) throw new Error('Track has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await expect(track).toHaveAttribute('aria-live', 'polite')
  await page.mouse.move(0, 0)
  await expect(track).toHaveAttribute('aria-live', 'off')

  await page.getByRole('button', { name: 'Stop slide rotation' }).click()
  const play = page.getByRole('button', { name: 'Start slide rotation' })
  await expect(play).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(track).toHaveAttribute('aria-live', 'polite')
  // Pressing play restarts rotation even though focus and the pointer are inside the carousel.
  await play.click()
  await expect(track).toHaveAttribute('aria-live', 'off')
})
