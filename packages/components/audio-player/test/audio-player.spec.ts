import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

// A 12-second voice note and the 48 peaks stored with it, from the docs site's media.
const NOTE = '/apps/ui/public/media/voice-note.webm'
const PEAKS = JSON.stringify([0.2, 0.6, 1, 0.4, 0.1, 0.8, 0.5, 0.3, 0.9, 0.2, 0.7, 0.4, 0.6, 0.1, 0.3, 0.8, 0.5, 0.2, 0.9, 0.4, 0.6, 0.3, 0.7, 0.1])

const player = (page: Page, selector = 'c2-audio-player') => page.locator(selector)
const playButton = (locator: Locator) => locator.locator('.play')
const waveform = (locator: Locator) => locator.locator('.waveform')
const bars = (locator: Locator) => locator.locator('.bar')
const time = (locator: Locator) => locator.locator('.time .text')
const mediaTime = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { media: HTMLAudioElement }).media.currentTime)
const mediaPaused = (locator: Locator) => locator.evaluate((element) => (element as HTMLElement & { media: HTMLAudioElement }).media.paused)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as unknown[]

test('peaks draw the waveform as a seek slider; the length shows before playing; the player is a named group that passes axe', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-audio-player src="${NOTE}" label="voice note from Ana" peaks='${PEAKS}' duration="12"></c2-audio-player>`)
  const host = player(page)
  await expect(host).toHaveHostAria('role', 'group')
  await expect(host).toHaveHostAria('aria-label', 'voice note from Ana')
  await expect(playButton(host)).toHaveAccessibleName('Play voice note from Ana')
  await expect(time(host)).toHaveText('0:12')
  const slider = waveform(host)
  await expect(slider).toHaveAttribute('role', 'slider')
  await expect(slider).toHaveAttribute('aria-valuetext', '0:00 of 0:12')
  // At most `bars` (48) bars, as many as fit; the 24 peaks are spread over them, so heights differ.
  const count = await bars(host).count()
  expect(count).toBeGreaterThan(20)
  expect(count).toBeLessThanOrEqual(48)
  const heights = new Set(await bars(host).evaluateAll((all) => all.map((bar) => (bar as HTMLElement).style.height)))
  expect(heights.size).toBeGreaterThan(3)
  await expect(host.locator('.bar.played')).toHaveCount(0)
  await accessible(page)
})

test('the play button plays and pauses, the time and the played bars follow, the speed cycles, and the host fires the media events', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-audio-player src="${NOTE}" label="voice note" peaks='${PEAKS}'></c2-audio-player>`)
  const host = player(page)
  await watch(host, 'play')
  await playButton(host).click()
  await expect(playButton(host)).toHaveAccessibleName('Pause voice note')
  await expect.poll(() => mediaTime(host)).toBeGreaterThan(0.3)
  await expect(time(host)).toHaveText(/^0:0\d \/ 0:12$/)
  await expect.poll(() => host.locator('.bar.played').count()).toBeGreaterThan(0)
  expect(await events(host)).toEqual([null])
  // Speed: 1× → 1.5× → 2× → 1×.
  const speed = host.locator('.speed')
  await expect(speed).toHaveAccessibleName('Playback speed 1×')
  await speed.click()
  await expect(speed).toHaveText('1.5×')
  expect(await host.evaluate((element) => (element as HTMLElement & { media: HTMLAudioElement }).media.playbackRate)).toBe(1.5)
  await speed.click()
  await speed.click()
  await expect(speed).toHaveText('1×')
  await playButton(host).click()
  await expect(playButton(host)).toHaveAccessibleName('Play voice note')
  expect(await mediaPaused(host)).toBe(true)
})

test('the waveform seeks by pointer and by keyboard: arrows move 5 s, Home and End go to the ends, Space plays', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-audio-player src="${NOTE}" label="voice note" peaks='${PEAKS}'></c2-audio-player>`)
  const host = player(page)
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { media: HTMLAudioElement }).media.duration)).toBeGreaterThan(11)
  const box = (await waveform(host).boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(() => mediaTime(host)).toBeCloseTo(6, 0)
  await expect(waveform(host)).toBeFocused()
  await expect(waveform(host)).toHaveAttribute('aria-valuetext', '0:06 of 0:12')
  // Dragging scrubs: the played bars follow the pointer, the audio seeks on release.
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect.poll(() => mediaTime(host)).toBeCloseTo(9, 0)
  await page.keyboard.press('Home')
  await expect.poll(() => mediaTime(host)).toBe(0)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => mediaTime(host)).toBe(5)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => mediaTime(host)).toBe(0)
  await page.keyboard.press('End')
  await expect.poll(() => mediaTime(host)).toBeGreaterThan(11.9)
  await page.keyboard.press('Home')
  await page.keyboard.press('Space')
  await expect.poll(() => mediaPaused(host)).toBe(false)
  await page.keyboard.press('Space')
  await expect.poll(() => mediaPaused(host)).toBe(true)
})

test('without peaks the waveform is computed from the file; a file that cannot load says so and stays flat', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-audio-player id="decoded" src="${NOTE}" label="decoded"></c2-audio-player>
    <c2-audio-player id="missing" src="/apps/ui/public/media/missing.webm" label="missing"></c2-audio-player>`)
  const decoded = player(page, '#decoded')
  await expect(waveform(decoded)).not.toHaveClass(/flat/)
  const heights = new Set(await bars(decoded).evaluateAll((all) => all.map((bar) => (bar as HTMLElement).style.height)))
  expect(heights.size).toBeGreaterThan(3)
  const missing = player(page, '#missing')
  await expect(missing.locator('.time')).toHaveText('Cannot play this recording')
  await expect(playButton(missing)).toBeDisabled()
  await expect(waveform(missing)).toHaveClass(/flat/)
})

test('exclusive players pause each other; a slotted audio element plays and is never written on', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-audio-player id="one" exclusive src="${NOTE}" label="one" peaks='${PEAKS}'></c2-audio-player>
    <c2-audio-player id="two" exclusive label="two" peaks='${PEAKS}'><audio src="${NOTE}" preload="metadata"></audio></c2-audio-player>`)
  const one = player(page, '#one')
  const two = player(page, '#two')
  const attributes = () => two.locator('audio').evaluate((audio) => [...audio.attributes].map((attribute) => `${attribute.name}=${attribute.value}`))
  const before = await attributes()
  expect(await two.evaluate((element) => (element as HTMLElement & { media: HTMLAudioElement }).media === element.querySelector('audio'))).toBe(true)
  await playButton(one).click()
  await expect.poll(() => mediaPaused(one)).toBe(false)
  await playButton(two).click()
  await expect.poll(() => mediaPaused(two)).toBe(false)
  await expect.poll(() => mediaPaused(one)).toBe(true)
  await expect(playButton(one)).toHaveAccessibleName('Play one')
  await playButton(two).click()
  expect(await attributes()).toEqual(before)
})

test('a transcript opens behind a toggle; the bubble variant is narrower and fits fewer bars; French names', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-audio-player id="text" src="${NOTE}" label="note" peaks='${PEAKS}' transcript="Hi team, quick update on the launch."></c2-audio-player>
    <div style="width: 220px"><c2-audio-player id="bubble" variant="bubble" src="${NOTE}" label="note" peaks='${PEAKS}' duration="12"><span slot="avatar">AR</span></c2-audio-player></div>
    <div lang="fr"><c2-audio-player id="fr" src="${NOTE}" label="la note" peaks='${PEAKS}' duration="12"></c2-audio-player></div>`)
  const text = player(page, '#text')
  const toggle = text.locator('.toggle')
  await expect(toggle).toHaveAccessibleName('Show transcript')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(text.locator('.transcript')).toBeHidden()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toHaveAccessibleName('Hide transcript')
  await expect(text.locator('.transcript')).toHaveText('Hi team, quick update on the launch.')
  const bubble = player(page, '#bubble')
  await expect.poll(() => bars(bubble).count()).toBeLessThan(30)
  await expect(bubble.locator('.avatar')).toBeVisible()
  await expect(time(bubble)).toHaveText('0:12')
  const french = player(page, '#fr')
  await expect(playButton(french)).toHaveAccessibleName('Lire la note')
  await expect(waveform(french)).toHaveAttribute('aria-valuetext', '0:00 sur 0:12')
  await expect(french.locator('.speed')).toHaveAccessibleName('Vitesse de lecture 1×')
  await accessible(page)
})
