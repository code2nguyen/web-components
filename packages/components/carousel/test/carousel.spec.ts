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
  // Scroll the track to an absolute offset: `scroll-snap-stop: always` stops a relative scroll (a wheel, `scrollBy`)
  // at the next slide in Firefox and WebKit, so a two-slide wheel is not a portable way to land on slide 3.
  await page.locator('c2-carousel').evaluate((carousel) => {
    const track = carousel.shadowRoot!.querySelector('.c2-carousel-track')!
    const slide = carousel.children[2]
    track.scrollTo({ left: track.scrollLeft + slide.getBoundingClientRect().left - track.getBoundingClientRect().left })
  })
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText(/->2\/5$/)
})

/** Press the mouse at the centre of the track, move it `dx` pixels in steps, and release it. */
async function dragTrack(page: Page, dx: number, from?: { x: number; y: number }) {
  const box = await page.locator('c2-carousel').locator('.c2-carousel-track').boundingBox()
  if (!box) throw new Error('Track has no bounds')
  const start = from ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + dx, start.y, { steps: 8 })
  await page.mouse.up()
}

test('dragging the track with the mouse turns the page either way', async ({ page, scenario }) => {
  await scenario()
  await dragTrack(page, -200)
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(1)
  // A short drag still turns the page instead of snapping back.
  await dragTrack(page, -40)
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(2)
  await dragTrack(page, 40)
  await expect.poll(() => slideAtStart(page)).toBe(1)
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('0->1/5,1->2/5,2->1/5')
})

test('dragging stops at the ends without loop', async ({ page, scenario }) => {
  await scenario()
  await dragTrack(page, 200)
  await expect.poll(() => slideAtStart(page)).toBe(0)
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('')
})

test('right-to-left dragging follows the reading direction', async ({ page, scenario }) => {
  await scenario('rtl')
  await dragTrack(page, 200)
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(1)
})

test('the click that ends a drag does not follow a link, a plain click does', async ({ page, scenario }) => {
  await scenario()
  const link = page.getByRole('link', { name: 'Link 1' })
  const box = await link.boundingBox()
  if (!box) throw new Error('Link has no bounds')
  await dragTrack(page, -200, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  expect(new URL(page.url()).hash).toBe('')
  await page.getByRole('link', { name: 'Link 2' }).click()
  await expect.poll(() => new URL(page.url()).hash).toBe('#link-2')
})

test('mouse-drag="false" leaves the track to native scrolling', async ({ page, scenario }) => {
  await scenario('no-drag')
  await dragTrack(page, -200)
  await expect.poll(() => slideAtStart(page)).toBe(0)
  await expect(indicator(page, 1)).toHaveAttribute('aria-current', 'true')
})

test('by default the controls stay shown and in place with the pointer away', async ({ page, scenario }) => {
  await scenario()
  await page.mouse.move(0, 0)
  const next = page.getByRole('button', { name: 'Next slide' })
  expect(await next.evaluate((button) => [getComputedStyle(button).opacity, getComputedStyle(button).translate])).toEqual(['1', '0px'])
})

test('controls can show only while the pointer is over the carousel', async ({ page, scenario }) => {
  await scenario('hover-controls')
  const next = page.getByRole('button', { name: 'Next slide' })
  const opacity = () => next.evaluate((button) => Number(getComputedStyle(button).opacity))
  // How far the button sits from its resting place along the row; hidden, it waits a little towards its own edge.
  const shift = () => next.evaluate((button) => Math.round(new DOMMatrix(getComputedStyle(button).translate.replace(/^(\S+)(\s.*)?$/, 'translate($1)')).e))
  await page.mouse.move(0, 0)
  await expect.poll(opacity).toBe(0)
  await expect.poll(shift).toBe(8)
  const box = await page.locator('c2-carousel').boundingBox()
  if (!box) throw new Error('Carousel has no bounds')
  await page.mouse.move(box.x + box.width / 2, box.y + 40)
  await expect.poll(opacity).toBe(1)
  await expect.poll(shift).toBe(0)
  await page.mouse.move(0, 0)
  await expect.poll(opacity).toBe(0)
  // Keyboard focus inside the carousel reveals them too.
  await page.getByRole('link', { name: 'Link 1' }).focus()
  await expect.poll(opacity).toBe(1)
})

for (const [scenarioName, leftControl, rightControl] of [
  ['side-controls', 'Previous slide', 'Next slide'],
  ['side-controls-rtl', 'Next slide', 'Previous slide'],
] as const) {
  test(`${scenarioName}: each edge zone shows only its own control, the middle neither`, async ({ page, scenario }) => {
    await scenario(scenarioName)
    const opacityOf = (name: string) => () => page.getByRole('button', { name, exact: true }).evaluate((button) => Number(getComputedStyle(button).opacity))
    const box = await page.locator('c2-carousel').boundingBox()
    if (!box) throw new Error('Carousel has no bounds')
    // Within the default 20% zone along an edge only that edge's control shows; the middle shows neither.
    await page.mouse.move(box.x + box.width * 0.15, box.y + 40)
    await expect.poll(opacityOf(leftControl)).toBe(1)
    await expect.poll(opacityOf(rightControl)).toBe(0)
    await page.mouse.move(box.x + box.width * 0.5, box.y + 40)
    await expect.poll(opacityOf(leftControl)).toBe(0)
    await expect.poll(opacityOf(rightControl)).toBe(0)
    await page.mouse.move(box.x + box.width * 0.3, box.y + 40)
    await expect.poll(opacityOf(leftControl)).toBe(0)
    await page.mouse.move(box.x + box.width * 0.85, box.y + 40)
    await expect.poll(opacityOf(rightControl)).toBe(1)
    await expect.poll(opacityOf(leftControl)).toBe(0)
    await page.mouse.move(0, 0)
    await expect.poll(opacityOf(rightControl)).toBe(0)
    await expect.poll(opacityOf(leftControl)).toBe(0)
  })
}

test('clicking a peeking slide moves to it', async ({ page, scenario }) => {
  await scenario('peek')
  const box = await page.locator('c2-carousel').locator('.c2-carousel-track').boundingBox()
  if (!box) throw new Error('Track has no bounds')
  // The sliver of slide 2 at the end edge; a locator click would scroll the slide into view first.
  await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2)
  await expect(indicator(page, 2)).toHaveAttribute('aria-current', 'true')
  await expect.poll(() => slideAtStart(page)).toBe(1)
  // Slide 2 is now fully in view: clicking it again does nothing, clicking the next sliver moves on.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.click(box.x + box.width - 10, box.y + box.height / 2)
  // The last of the three slides cannot reach the start edge; the track scrolls to its end instead.
  await expect(indicator(page, 3)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('0->1/3,1->2/3')
})

test('clicking a fully visible slide does not move the carousel', async ({ page, scenario }) => {
  await scenario('multi')
  await page.getByText('Slide 2').click()
  await expect(indicator(page, 1)).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('status', { name: 'Changes' })).toHaveText('')
})

test('the edge zone width is a CSS variable and never narrower than the control', async ({ page, scenario }) => {
  await scenario('side-controls')
  const carousel = page.locator('c2-carousel')
  const box = await carousel.boundingBox()
  if (!box) throw new Error('Carousel has no bounds')
  const opacity = () => page.getByRole('button', { name: 'Next slide' }).evaluate((button) => Number(getComputedStyle(button).opacity))
  await carousel.evaluate((element) => (element as HTMLElement).style.setProperty('--c2-carousel__control__zone--width', '40%'))
  await page.mouse.move(box.x + box.width * 0.65, box.y + 40)
  await expect.poll(opacity).toBe(1)
  // A zone set below the control's own extent (12px inset + 36px) still covers the control.
  await carousel.evaluate((element) => (element as HTMLElement).style.setProperty('--c2-carousel__control__zone--width', '10px'))
  await page.mouse.move(box.x + box.width / 2, box.y + 40)
  await expect.poll(opacity).toBe(0)
  await page.mouse.move(box.x + box.width - 40, box.y + 40)
  await expect.poll(opacity).toBe(1)
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
