import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const visualizer = (page: Page, selector = 'c2-audio-visualizer') => page.locator(selector)
const events = async (page: Page, selector = 'c2-audio-visualizer') => JSON.parse((await visualizer(page, selector).getAttribute('data-events')) ?? '[]')

/** The height of each bar, in pixels. */
const barHeights = (page: Page, selector = 'c2-audio-visualizer') =>
  visualizer(page, selector)
    .locator('.bar')
    .evaluateAll((bars) => bars.map((bar) => Math.round(bar.getBoundingClientRect().height)))

test('decorative by default; a label makes it an image of that name', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-audio-visualizer level="0.5"></c2-audio-visualizer><c2-audio-visualizer id="orb" variant="orb" state="thinking" label="Assistant thinking"></c2-audio-visualizer>`,
  )
  await expect(visualizer(page).first()).toHaveHostAria('aria-hidden', 'true')
  await expect(visualizer(page).first()).toHaveHostAria('role', null)
  await expect(visualizer(page, '#orb')).toHaveHostAria('role', 'img')
  await expect(visualizer(page, '#orb')).toHaveHostAria('aria-label', 'Assistant thinking')
  await expect(visualizer(page, '#orb')).toHaveHostAria('aria-hidden', null)
  await accessible(page)
})

test('bars: one per `bars`, the middle tallest for a level, flat at 0 and when muted', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-audio-visualizer level="0.8"></c2-audio-visualizer>`)
  await expect(visualizer(page).locator('.bar')).toHaveCount(5)
  await expect.poll(async () => (await barHeights(page))[2]).toBeGreaterThan(20)
  const heights = await barHeights(page)
  expect(heights[2]).toBeGreaterThan(heights[0])
  expect(heights[0]).toBe(heights[4])
  expect(heights[1]).toBe(heights[3])

  await props(visualizer(page), { bars: 9 })
  await expect(visualizer(page).locator('.bar')).toHaveCount(9)

  await props(visualizer(page), { level: 0 })
  await expect.poll(() => barHeights(page)).toEqual(new Array(9).fill(4))

  await props(visualizer(page), { level: 0.8, muted: true })
  await expect.poll(() => barHeights(page)).toEqual(new Array(9).fill(4))
  const colour = await visualizer(page)
    .locator('.bar')
    .first()
    .evaluate((bar) => getComputedStyle(bar).backgroundColor)
  expect(colour).toBe('rgb(161, 161, 170)')
})

test('speaking-change fires when the level crosses the threshold, and ends only after a short hold', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-audio-visualizer level="0"></c2-audio-visualizer>`)
  await watch(visualizer(page), 'speaking-change')
  await props(visualizer(page), { level: 0.5 })
  await expect.poll(() => events(page)).toEqual([{ speaking: true }])
  await expect(visualizer(page)).toHaveState('speaking')
  expect(await visualizer(page).evaluate((element) => (element as HTMLElement & { speaking: boolean }).speaking)).toBe(true)

  // A pause shorter than the hold does not end speaking.
  await visualizer(page).evaluate(async (element) => {
    const subject = element as HTMLElement & { level: number }
    subject.level = 0.01
    await new Promise((resolve) => setTimeout(resolve, 100))
    subject.level = 0.5
  })
  await page.waitForTimeout(400)
  expect(await events(page)).toEqual([{ speaking: true }])

  await props(visualizer(page), { level: 0.01 })
  await expect.poll(() => events(page)).toEqual([{ speaking: true }, { speaking: false }])
  await expect(visualizer(page)).not.toHaveState('speaking')

  // A raised threshold, then a source that goes away.
  await props(visualizer(page), { speakingThreshold: 0.6, level: 0.5 })
  await page.waitForTimeout(200)
  expect(await events(page)).toHaveLength(2)
  await props(visualizer(page), { level: 0.9 })
  await expect.poll(() => events(page)).toHaveLength(3)
  await visualizer(page).evaluate((element) => element.removeAttribute('level'))
  await props(visualizer(page), { level: undefined })
  await expect.poll(() => events(page)).toEqual([{ speaking: true }, { speaking: false }, { speaking: true }, { speaking: false }])
})

test('a MediaStream is analysed: a tone lifts the bars and speaks; a stream without audio draws nothing', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-audio-visualizer bars="7"></c2-audio-visualizer>`)
  await watch(visualizer(page), 'speaking-change')
  // A user gesture lets the shared AudioContext run.
  await page.locator('main').click()
  await visualizer(page).evaluate((element) => {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    oscillator.frequency.value = 220
    const destination = context.createMediaStreamDestination()
    oscillator.connect(destination)
    oscillator.start()
    ;(window as unknown as { tone: MediaStream }).tone = destination.stream
    ;(element as HTMLElement & { stream: MediaStream }).stream = destination.stream
  })
  await expect.poll(async () => Math.max(...(await barHeights(page)))).toBeGreaterThan(10)
  await expect.poll(() => events(page)).toEqual([{ speaking: true }])

  await visualizer(page).evaluate((element) => ((element as HTMLElement & { stream: MediaStream | null }).stream = null))
  await expect.poll(() => events(page)).toEqual([{ speaking: true }, { speaking: false }])
  await expect.poll(() => barHeights(page)).toEqual(new Array(7).fill(4))

  // Video only: there is nothing to analyse.
  await visualizer(page).evaluate((element) => {
    const canvas = document.createElement('canvas')
    ;(element as HTMLElement & { stream: MediaStream }).stream = canvas.captureStream()
  })
  await page.waitForTimeout(200)
  expect(await barHeights(page)).toEqual(new Array(7).fill(4))
})

test('wave and orb draw the level', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-audio-visualizer id="wave" variant="wave" level="0"></c2-audio-visualizer><c2-audio-visualizer id="orb" variant="orb" level="0"></c2-audio-visualizer>`,
  )
  const path = () => visualizer(page, '#wave').locator('path').getAttribute('d')
  const flat = await path()
  expect(flat).toMatch(/^M0 50\.00/)
  await expect(visualizer(page, '#wave').locator('svg[part="wave"]')).toBeVisible()
  await props(visualizer(page, '#wave'), { level: 0.8 })
  await expect.poll(path).not.toBe(flat)

  const orbLevel = () =>
    visualizer(page, '#orb')
      .locator('[part="orb"]')
      .evaluate((orb) => Number((orb as HTMLElement).style.getPropertyValue('--_level')))
  await expect.poll(orbLevel).toBe(0)
  await props(visualizer(page, '#orb'), { level: 1 })
  await expect.poll(orbLevel).toBeGreaterThan(0.9)
  const small = (await visualizer(page, '#orb').locator('[part="orb"]').boundingBox())!.width
  expect(small).toBeGreaterThan(90)
})

test('without a source, state animates; idle is flat; reduced motion holds a steady meter', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-audio-visualizer state="speaking"></c2-audio-visualizer><c2-audio-visualizer id="idle"></c2-audio-visualizer>`)
  const first = await barHeights(page)
  await expect.poll(async () => JSON.stringify(await barHeights(page))).not.toBe(JSON.stringify(first))
  expect(await barHeights(page, '#idle')).toEqual(new Array(5).fill(4))
  // An animated state is not a source: it never says it is speaking.
  await watch(visualizer(page).first(), 'speaking-change')
  await page.waitForTimeout(200)
  expect(await events(page, 'c2-audio-visualizer >> nth=0')).toEqual([])

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForTimeout(300)
  const still = await barHeights(page)
  await page.waitForTimeout(600)
  expect(await barHeights(page)).toEqual(still)
  expect(Math.max(...still)).toBeGreaterThan(10)
})
