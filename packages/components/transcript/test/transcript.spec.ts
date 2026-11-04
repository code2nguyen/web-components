import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const transcript = (page: Page, selector = 'c2-transcript') => page.locator(selector)
const segment = (locator: Locator, index: number) => locator.locator(`[part="segment"][data-index="${index}"]`)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

const SEGMENTS = [
  { speaker: 'ana', start: 42, end: 50, text: 'Thanks for joining. I want to walk through the Q3 launch plan.' },
  { speaker: 'ana', start: 50, end: 58, text: 'Short version: we keep the free tier, and per-seat pricing.' },
  {
    speaker: 'marcus',
    start: 65,
    end: 72,
    text: 'That works for sales. Do we have a migration path?',
    words: [
      { text: 'That', start: 65 },
      { text: 'works', start: 65.4 },
      { text: 'for', start: 65.8 },
      { text: 'sales.', start: 66.1 },
      { text: 'Do', start: 67 },
      { text: 'we', start: 67.3 },
      { text: 'have', start: 67.5 },
      { text: 'a', start: 67.8 },
      { text: 'migration', start: 68 },
      { text: 'path?', start: 68.6, end: 69.2 },
    ],
  },
  { speaker: 'ana', start: 78, end: 3725, text: 'Yes, they keep their price until renewal. Priya has the numbers.' },
]
const SPEAKERS = { ana: { name: 'Ana Ruiz' }, marcus: { name: 'Marcus Lee' } }
const json = (value: unknown) => JSON.stringify(value).replaceAll("'", '&#39;')
const scenario = (attributes = '', style = '') =>
  `<c2-transcript segments='${json(SEGMENTS)}' speakers='${json(SPEAKERS)}' ${attributes} style="${style}"></c2-transcript>`

test('groups segments by speaker under a name and a time, as a named region of articles that passes axe', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  const groups = transcript(page).locator('[part="group"]')
  await expect(groups).toHaveCount(3)
  await expect(groups.nth(0).locator('[part="speaker"]')).toHaveText('Ana Ruiz')
  await expect(groups.nth(0).locator('[part="segment"]')).toHaveCount(2)
  await expect(groups.nth(1)).toHaveAttribute('aria-label', 'Marcus Lee, 1:05')
  await expect(groups.nth(2).locator('[part="time"]')).toHaveText('1:18')
  await expect(groups.nth(2).locator('[part="time"]')).toHaveAttribute('aria-label', 'Play from 1:18')
  await expect(transcript(page)).toHaveHostAria('role', 'region')
  await expect(transcript(page)).toHaveHostAria('aria-label', 'Transcript')
  // Speakers take the palette in the order they first speak, so Ana and Marcus differ.
  const colors = await groups.evaluateAll((elements) =>
    elements.map((element) => getComputedStyle(element.querySelector('c2-avatar')!).getPropertyValue('--c2-avatar--background').trim()),
  )
  expect(colors[0]).toBe(colors[2])
  expect(colors[0]).not.toBe(colors[1])
  await accessible(page)
})

test('current-time tints the segment playing, underlines its word and mutes the words to come', async ({ page, renderScenario }) => {
  await renderScenario(scenario('current-time="44"'))
  await expect(segment(transcript(page), 0)).toHaveClass(/active/)
  await expect(segment(transcript(page), 0)).toHaveAttribute('aria-current', 'time')
  await props(transcript(page), { currentTime: 67.4 })
  await expect(segment(transcript(page), 0)).not.toHaveClass(/active/)
  await expect(segment(transcript(page), 2)).toHaveClass(/active/)
  const words = segment(transcript(page), 2).locator('.word')
  await expect(words.nth(5)).toHaveClass(/now/)
  await expect(words.nth(4)).toHaveClass(/spoken/)
  await expect(words.nth(6)).not.toHaveClass(/spoken/)
  const color = (index: number) => words.nth(index).evaluate((element) => getComputedStyle(element).color)
  expect(await color(6)).not.toBe(await color(4))
  // Between segments nothing is playing.
  await props(transcript(page), { currentTime: 60 })
  await expect(transcript(page).locator('.segment.active')).toHaveCount(0)
})

test('clicking a time, a segment or a word seeks there; cancelling the event keeps the position', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await watch(transcript(page), 'transcript-seek')
  await transcript(page).locator('[part="time"]').nth(1).click()
  await segment(transcript(page), 1).click()
  await segment(transcript(page), 2).locator('.word').nth(8).click()
  const seen = await events(transcript(page))
  expect(seen.map((detail: { time: number }) => detail.time)).toEqual([65, 50, 68])
  expect(seen[2].segment.speaker).toBe('marcus')
  await expect(segment(transcript(page), 2)).toHaveClass(/active/)
  expect(await transcript(page).evaluate((element) => (element as HTMLElement & { currentTime: number }).currentTime)).toBe(68)

  await transcript(page).evaluate((element) => element.addEventListener('transcript-seek', (event) => event.preventDefault()))
  await segment(transcript(page), 0).click()
  expect(await transcript(page).evaluate((element) => (element as HTMLElement & { currentTime: number }).currentTime)).toBe(68)
})

test('the segments are one tab stop: arrows move, Enter plays from the one focused', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button>Before</c2-button>${scenario()}`)
  await watch(transcript(page), 'transcript-seek')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(segment(transcript(page), 0)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(segment(transcript(page), 2)).toBeFocused()
  await page.keyboard.press('End')
  await expect(segment(transcript(page), 3)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await events(transcript(page))).map((detail: { time: number }) => detail.time)).toEqual([78])
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(segment(transcript(page), 3)).toBeFocused()
})

test('follows a real <audio> in a scroll box; scrolling away shows Jump to current, which comes back', async ({ page, renderScenario }) => {
  // Instant scrolling, so a click never lands while a smooth scroll is still moving the segment under the pointer.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const many = Array.from({ length: 30 }, (_value, index) => ({
    speaker: index % 3 ? 'ana' : 'marcus',
    start: index * 2,
    end: index * 2 + 2,
    text: `Line ${index} of the meeting, long enough to wrap now and then.`,
  }))
  await renderScenario(
    `<audio id="audio"></audio><c2-transcript speakers='${json(SPEAKERS)}' segments='${json(many)}' style="height: 220px; --c2-transcript__segment--padding: 2px 6px"></c2-transcript>`,
  )
  await page.evaluate(() => {
    const audio = document.getElementById('audio') as HTMLAudioElement
    audio.src = (window as unknown as { silence: (seconds: number) => string }).silence(60)
    ;(document.querySelector('c2-transcript') as HTMLElement & { media: HTMLMediaElement }).media = audio
  })
  await page.waitForFunction(() => (document.getElementById('audio') as HTMLAudioElement).readyState >= 1)
  const scroll = transcript(page).locator('[part="scroll"]')
  const top = () => scroll.evaluate((element) => element.scrollTop)
  await page.evaluate(() => ((document.getElementById('audio') as HTMLAudioElement).currentTime = 40.5))
  await expect(segment(transcript(page), 20)).toHaveClass(/active/)
  await expect.poll(top).toBeGreaterThan(400)
  await expect(transcript(page).locator('[part="jump"]')).toHaveCount(0)
  // The page itself did not scroll.
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  await scroll.hover()
  await page.mouse.wheel(0, -5000)
  // Firefox animates a wheel scroll even under reduced motion: wait until it has come to rest at the top, so the
  // segment playing is out of view for good before the time moves on.
  await expect.poll(top).toBe(0)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(transcript(page).locator('[part="jump"]')).toBeVisible()
  await page.evaluate(() => ((document.getElementById('audio') as HTMLAudioElement).currentTime = 50.5))
  await expect(segment(transcript(page), 25)).toHaveClass(/active/)
  // Paused: the view stays where the reader put it.
  expect(await top()).toBeLessThan(50)
  await transcript(page).locator('[part="jump"]').click()
  await expect(transcript(page).locator('[part="jump"]')).toHaveCount(0)
  await expect.poll(top).toBeGreaterThan(500)

  // A click seeks the audio itself.
  await segment(transcript(page), 3).click()
  await expect.poll(() => page.evaluate(() => (document.getElementById('audio') as HTMLAudioElement).currentTime)).toBe(6)
})

test('query marks matches ignoring case and accents; next and previous move between them and say where', async ({ page, renderScenario }) => {
  const segments = [...SEGMENTS, { speaker: 'marcus', start: 90, text: 'Le prix du café: PRICE, price.' }]
  await renderScenario(`<c2-transcript segments='${json(segments)}' speakers='${json(SPEAKERS)}' query="price"></c2-transcript>`)
  await watch(transcript(page), 'match-change')
  const marks = transcript(page).locator('mark')
  await expect(marks).toHaveText(['price', 'PRICE', 'price'])
  await expect(marks.nth(0)).toHaveClass('current')
  await transcript(page).evaluate((element) => (element as HTMLElement & { nextMatch(): void }).nextMatch())
  await expect(marks.nth(1)).toHaveClass('current')
  await expect(transcript(page).locator('[role="status"]')).toHaveText('2 of 3 matches')
  await transcript(page).evaluate((element) => {
    const host = element as HTMLElement & { previousMatch(): void }
    host.previousMatch()
    host.previousMatch()
  })
  await expect(marks.nth(2)).toHaveClass('current')
  expect((await events(transcript(page))).at(-1)).toEqual({ count: 3, index: 2 })

  await props(transcript(page), { query: 'CAFE' })
  await expect(marks).toHaveText(['café'])
  // A match inside word-level text is marked inside the word.
  await props(transcript(page), { query: 'migration' })
  await expect(segment(transcript(page), 2).locator('.word mark')).toHaveText('migration')
  await props(transcript(page), { query: 'zebra' })
  await expect(marks).toHaveCount(0)
  await expect(transcript(page).locator('[role="status"]')).toHaveText('No matches')
})

test('compact puts a time before every segment; appended and interim segments stay in view at the bottom', async ({ page, renderScenario }) => {
  await renderScenario(scenario('layout="compact"', 'height: 160px'))
  await expect(transcript(page).locator('[part="time"]')).toHaveText(['0:42', '0:50', '1:05', '1:18'])
  await expect(transcript(page).locator('c2-avatar')).toHaveCount(0)
  await expect(transcript(page).locator('[part="speaker"]')).toHaveText(['Ana Ruiz', 'Marcus Lee', 'Ana Ruiz'])
  const scroll = transcript(page).locator('[part="scroll"]')
  await scroll.evaluate((element) => (element.scrollTop = element.scrollHeight))
  await transcript(page).evaluate((element) => {
    const host = element as HTMLElement & { segments: object[] }
    host.segments = [...host.segments, { speaker: 'priya', start: 3730, text: 'So about eleven perc', interim: true }]
  })
  await expect(segment(transcript(page), 4)).toHaveClass(/interim/)
  await expect(transcript(page).locator('[part="time"]').last()).toHaveText('1:02:10')
  await expect.poll(() => scroll.evaluate((element) => Math.round(element.scrollTop + element.clientHeight - element.scrollHeight))).toBeGreaterThanOrEqual(-2)
  expect(await segment(transcript(page), 4).evaluate((element) => getComputedStyle(element).fontStyle)).toBe('italic')
})

test('its text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${scenario('query="zebra"')}</div>`)
  await expect(transcript(page)).toHaveHostAria('aria-label', 'Transcription')
  await expect(transcript(page).locator('[part="time"]').first()).toHaveAttribute('aria-label', 'Lire à partir de 0:42')
  await expect(transcript(page).locator('[role="status"]')).toHaveText('Aucun résultat')
})

test('regressions: a loaded transcript opens at its start, appended matches are counted, a colour adds no declarations', async ({ page, renderScenario }) => {
  const many = Array.from({ length: 30 }, (_value, index) => ({ speaker: 'ana', start: index * 2, text: `Line ${index} about the price of things.` }))
  await renderScenario(
    `<c2-transcript query="price" style="height: 200px" speakers='${json({ ana: { name: 'Ana', color: 'red; background-image: url(x)' } })}' segments='${json(many)}'></c2-transcript>`,
  )
  const scroll = transcript(page).locator('[part="scroll"]')
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0)
  // A late load opens at the start too.
  await transcript(page).evaluate(async (element) => {
    const host = element as HTMLElement & { segments: object[]; updateComplete: Promise<boolean> }
    host.segments = []
    await host.updateComplete
    host.segments = Array.from({ length: 30 }, (_value, index) => ({ speaker: 'ana', start: index * 2, text: `Line ${index} about the price of things.` }))
    await host.updateComplete
  })
  expect(await scroll.evaluate((element) => element.scrollTop)).toBe(0)

  const group = transcript(page).locator('[part="group"]').first()
  expect(await group.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none')
  expect(await group.evaluate((element) => (element as HTMLElement).style.getPropertyValue('--_speaker'))).toBe('')

  await watch(transcript(page), 'match-change')
  await transcript(page).evaluate((element) => {
    const host = element as HTMLElement & { segments: object[] }
    host.segments = [...host.segments, { speaker: 'ana', start: 70, text: 'One more price.' }]
  })
  await expect.poll(async () => (await events(transcript(page))).at(-1)).toEqual({ count: 31, index: 0 })
  await expect(transcript(page).locator('[role="status"]')).toHaveText('1 of 31 matches')
})

test('regression: a reader scroll that passes the segment playing does not resume following', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const many = Array.from({ length: 30 }, (_value, index) => ({
    speaker: 'ana',
    start: index * 2,
    end: index * 2 + 2,
    text: `Line ${index} of the meeting, long enough to wrap now and then.`,
  }))
  await renderScenario(`<c2-transcript current-time="40.5" segments='${json(many)}' style="height: 220px"></c2-transcript>`)
  const scroll = transcript(page).locator('[part="scroll"]')
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(400)
  const passing = await scroll.evaluate((element) => {
    const host = element.getRootNode() as ShadowRoot
    const playing = host.querySelector<HTMLElement>('[data-index="20"]')!
    return playing.offsetTop - 20
  })
  await scroll.hover()
  await page.mouse.wheel(0, -5000)
  await expect(transcript(page).locator('[part="jump"]')).toBeVisible()
  // On its way, the reader's scroll shows the segment playing for a moment, and the time moves on right then.
  const after = await scroll.evaluate(async (element, top) => {
    // Mid-scroll: a scroll event there, and the time moves on before the scroll comes to rest.
    element.scrollTop = top
    element.dispatchEvent(new Event('scroll'))
    ;(element.getRootNode() as ShadowRoot & { host: HTMLElement & { currentTime: number } }).host.currentTime = 50.5
    await new Promise((resolve) => setTimeout(resolve, 50))
    return element.scrollTop
  }, passing)
  expect(after).toBe(passing)
})
