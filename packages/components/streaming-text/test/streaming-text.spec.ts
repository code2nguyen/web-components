import type { Page } from '@playwright/test'
import type { StreamingText } from '../src/streaming-text'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const words = (count: number, from = 0) =>
  Array.from({ length: count }, (_, i) => `word${from + i}`)
    .join(' ')
    .concat(' ')

/** Text currently revealed, without the part still buffered. */
const shown = (page: Page) => page.locator('c2-streaming-text').evaluate((element) => element.shadowRoot!.querySelector('.live')!.textContent ?? '')

const feed = (page: Page, chunk: string) =>
  page.locator('c2-streaming-text').evaluate(async (element: StreamingText, text: string) => {
    element.appendText(text)
    await element.updateComplete
  }, chunk)

/** Fake time that only moves when the test runs it, so frames cannot fire between a feed and the next assertion. */
async function pausedClock(page: Page, html: string, render: (html: string) => Promise<void>) {
  await page.clock.install({ time: 0 })
  await render(html)
  await page.clock.pauseAt(60_000)
}

const caretVisible = (page: Page) => page.locator('c2-streaming-text').evaluate((element) => element.shadowRoot!.querySelector('.caret--active') !== null)

test('a static value renders whole, with no caret and not busy', async ({ page, renderScenario }) => {
  await renderScenario('<c2-streaming-text value="Quarterly revenue grew 12%."></c2-streaming-text>')
  await expect(page.locator('c2-streaming-text')).toHaveText('Quarterly revenue grew 12%.')
  expect(await caretVisible(page)).toBe(false)
  await expect(page.locator('c2-streaming-text')).toHaveHostAria('aria-busy', null)
  await accessible(page)
})

test('a burst is released steadily and never trails the stream by more than the max lag', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-streaming-text streaming></c2-streaming-text>', renderScenario)
  await expect(page.locator('c2-streaming-text')).toHaveHostAria('aria-busy', 'true')
  const burst = words(60)
  await feed(page, burst)
  expect(await shown(page)).toBe('')

  await page.clock.runFor(150)
  const early = (await shown(page)).length
  expect(early).toBeGreaterThan(0)
  expect(early).toBeLessThan(burst.length)
  expect(burst.startsWith(await shown(page))).toBe(true)

  await page.clock.runFor(150)
  expect((await shown(page)).length).toBeGreaterThan(early)

  // 600 ms (the default max lag) after the burst, plus a frame or two of rounding.
  await page.clock.runFor(340)
  expect(await shown(page)).toBe(burst)
  expect(await caretVisible(page)).toBe(true)
})

test('ending the stream flushes the backlog, hides the caret and fires reveal-end once', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-streaming-text streaming></c2-streaming-text>', renderScenario)
  const element = page.locator('c2-streaming-text')
  await watch(element, 'reveal-end')
  await feed(page, words(200))
  await page.clock.runFor(50)
  await props(element, { streaming: false })
  expect(await element.getAttribute('data-events')).toBe('[]')

  // The default flush duration is 300 ms.
  await page.clock.runFor(340)
  expect(await shown(page)).toBe(words(200))
  await expect(element).toHaveAttribute('data-events', '[null]')
  expect(await caretVisible(page)).toBe(false)
  await expect(element).toHaveHostAria('aria-busy', null)

  await page.clock.runFor(500)
  await expect(element).toHaveAttribute('data-events', '[null]')
})

test('a growing word is held back until it is complete or the stream stalls', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-streaming-text streaming></c2-streaming-text>', renderScenario)
  await feed(page, 'Hello wor')
  await page.clock.runFor(200)
  expect(await shown(page)).toBe('Hello ')
  await feed(page, 'ld and')
  await page.clock.runFor(200)
  expect(await shown(page)).toBe('Hello world ')
  // No new chunk for longer than the max lag: the partial word is shown rather than left hanging.
  await page.clock.runFor(700)
  expect(await shown(page)).toBe('Hello world and')
})

test('reveal="instant" prints each chunk as it arrives', async ({ page, renderScenario }) => {
  await renderScenario('<c2-streaming-text streaming reveal="instant"></c2-streaming-text>')
  await feed(page, 'First chunk, ')
  expect(await shown(page)).toBe('First chunk, ')
  await feed(page, 'second chunk.')
  expect(await shown(page)).toBe('First chunk, second chunk.')
})

test('reduced motion prints each chunk as it arrives', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario('<c2-streaming-text streaming></c2-streaming-text>')
  await feed(page, words(30))
  expect(await shown(page)).toBe(words(30))
})

test('setting value to an extension appends; another value starts over', async ({ page, renderScenario }) => {
  await renderScenario('<c2-streaming-text value="Draft one"></c2-streaming-text>')
  const element = page.locator('c2-streaming-text')
  await props(element, { value: 'Draft one, extended' })
  await expect(element).toHaveText('Draft one, extended')
  await props(element, { value: 'Rewritten' })
  await expect(element).toHaveText('Rewritten')
  await element.evaluate(async (node: StreamingText) => {
    node.clear()
    await node.updateComplete
  })
  await expect(element).toHaveText('')
})

test('revealed text settles into one node that later chunks extend in place', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-streaming-text streaming></c2-streaming-text>', renderScenario)
  await feed(page, words(20))
  await page.clock.runFor(700)
  // Fade-in animations run on the real clock; wait for the spans to merge back.
  await expect.poll(() => page.locator('c2-streaming-text').evaluate((element) => element.shadowRoot!.querySelector('.live')!.childNodes.length)).toBe(1)

  // A live range over the first word survives every later append: the node it sits in is never replaced.
  await page.locator('c2-streaming-text').evaluate((element) => {
    const node = element.shadowRoot!.querySelector('.live')!.firstChild!
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 5)
    ;(window as Window & { probe?: { node: Node; range: Range } }).probe = { node, range }
  })
  for (let i = 0; i < 10; i++) {
    await feed(page, words(50, 20 + i * 50))
    await page.clock.runFor(100)
  }
  await props(page.locator('c2-streaming-text'), { streaming: false })
  await page.clock.runFor(400)
  expect(await shown(page)).toBe(words(520))
  await expect
    .poll(() => page.locator('c2-streaming-text').evaluate((element) => element.shadowRoot!.querySelector('.live')!.childNodes.length))
    .toBeLessThanOrEqual(25)
  const probe = await page.locator('c2-streaming-text').evaluate((element) => {
    const { node, range } = (window as Window & { probe?: { node: Node; range: Range } }).probe!
    return { same: element.shadowRoot!.querySelector('.live')!.firstChild === node, text: range.toString() }
  })
  expect(probe).toEqual({ same: true, text: 'word0' })
})

test('segment="grapheme" never splits a grapheme cluster', async ({ page, renderScenario }) => {
  await pausedClock(page, '<c2-streaming-text streaming segment="grapheme"></c2-streaming-text>', renderScenario)
  const family = '👩‍👩‍👧'
  const text = `${family} été ${family}`
  await feed(page, text)
  const allowed = new Set<string>()
  for (const part of new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)) allowed.add(text.slice(0, part.index + part.segment.length))
  allowed.add('')
  for (let i = 0; i < 40; i++) {
    await page.clock.runFor(16)
    expect(allowed.has(await shown(page))).toBe(true)
  }
  expect(await shown(page)).toBe(text)
})

test('the caret glyph comes from a CSS variable and can be hidden', async ({ page, renderScenario }) => {
  await renderScenario(`<style>.dot { --c2-streaming-text__caret--content: '●'; } .none { --c2-streaming-text__caret--content: none; }</style>
    <c2-streaming-text class="dot" streaming value="Thinking"></c2-streaming-text>
    <c2-streaming-text class="none" streaming value="Thinking"></c2-streaming-text>`)
  const caret = (selector: string) =>
    page.locator(selector).evaluate((element) => getComputedStyle(element.shadowRoot!.querySelector('.caret--active')!, '::after').content)
  expect(await caret('.dot')).toBe('"●"')
  expect(await caret('.none')).toBe('none')
})
