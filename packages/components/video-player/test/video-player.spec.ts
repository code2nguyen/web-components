import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const MEDIA = '/apps/ui/public/media'
// A 24 s, three-chapter video (Intro, Dashboards, Reports at 0, 8 and 16 s) with English and French captions.
const VIDEO = `<video muted playsinline preload="auto" src="${MEDIA}/tour.webm" poster="${MEDIA}/tour-poster.jpg">
  <track kind="captions" srclang="en" label="English" src="${MEDIA}/tour.en.vtt" />
  <track kind="captions" srclang="fr" label="Français" src="${MEDIA}/tour.fr.vtt" />
  <track kind="chapters" srclang="en" src="${MEDIA}/tour.chapters.vtt" />
</video>`

const player = (page: Page) => page.locator('c2-video-player')
const video = (page: Page) => page.locator('c2-video-player video').first()
const seek = (locator: Locator) => locator.locator('[part="seek"]')
const ready = (page: Page) => expect.poll(() => video(page).evaluate((element) => (element as HTMLVideoElement).readyState >= 1)).toBe(true)
const mediaTime = (page: Page) => video(page).evaluate((element) => (element as HTMLVideoElement).currentTime)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

test('a slotted video gets a named group, a big play button, chapters from its track and the time; it passes axe', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await expect(player(page)).toHaveHostAria('role', 'group')
  await expect(player(page)).toHaveHostAria('aria-label', 'Product tour')
  await expect(page.getByRole('button', { name: 'Play Product tour' })).toBeVisible()
  await ready(page)
  await expect(player(page).locator('.time')).toHaveText(/0:00 \/ 0:24/)
  // The chapters track gives three segments, the first one named in the time.
  await expect(player(page).locator('.segment')).toHaveCount(3)
  await expect(player(page).locator('.time')).toContainText('Intro')
  // The player never writes on the author's video.
  expect(await video(page).evaluate((element) => element.getAttributeNames().sort())).toEqual(['muted', 'playsinline', 'poster', 'preload', 'src'])
  expect(await player(page).evaluate((element) => (element as HTMLElement & { media: HTMLVideoElement }).media === element.querySelector('video'))).toBe(true)
  await accessible(page)
})

test('playing, pausing and seeking: the big button starts it, the seek bar says where it is, chapter-change fires', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await watch(player(page), 'chapter-change')
  await ready(page)
  await page.getByRole('button', { name: 'Play Product tour' }).click()
  await expect(page.getByRole('button', { name: 'Play Product tour' })).toHaveCount(0)
  await expect.poll(() => mediaTime(page)).toBeGreaterThan(0.2)
  await expect(player(page)).toHaveState('playing')
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(player(page)).not.toHaveState('playing')
  // Seeking into the second chapter.
  await seek(player(page)).focus()
  await page.keyboard.press('4')
  await expect.poll(() => mediaTime(page)).toBeCloseTo(9.6, 0)
  await expect(seek(player(page))).toHaveAttribute('aria-valuetext', '0:09 of 0:24, Dashboards')
  await expect.poll(() => events(player(page))).toContainEqual({ index: 1, chapter: { start: 8, title: 'Dashboards' } })
  await expect(player(page).locator('.time')).toContainText('Dashboards')
})

test('the keyboard: K plays, arrows seek, J and L jump 10 s, M mutes, Home and End go to the ends', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await ready(page)
  await page.getByRole('button', { name: 'Play', exact: true }).focus()
  await page.keyboard.press('k')
  await expect(player(page)).toHaveState('playing')
  await page.keyboard.press('k')
  await expect(player(page)).not.toHaveState('playing')
  await page.keyboard.press('End')
  await expect.poll(() => mediaTime(page)).toBeGreaterThan(23)
  await page.keyboard.press('Home')
  await expect.poll(() => mediaTime(page)).toBe(0)
  await page.keyboard.press('l')
  await expect.poll(() => mediaTime(page)).toBeCloseTo(10, 0)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => mediaTime(page)).toBeCloseTo(15, 0)
  await page.keyboard.press('j')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => mediaTime(page)).toBeCloseTo(0, 0)
  // The video starts muted; M unmutes it and mutes it again.
  await page.keyboard.press('m')
  await expect.poll(() => video(page).evaluate((element) => (element as HTMLVideoElement).muted)).toBe(false)
  await expect(page.getByRole('button', { name: 'Mute', exact: true })).toBeVisible()
  await page.keyboard.press('m')
  await expect.poll(() => video(page).evaluate((element) => (element as HTMLVideoElement).muted)).toBe(true)
})

test('hovering the seek bar shows the time, the chapter and the thumbnail from the sprite; a drag seeks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour" thumbnails="${MEDIA}/tour-thumbs.vtt">${VIDEO}</c2-video-player>`)
  await ready(page)
  const box = (await seek(player(page)).boundingBox())!
  // 75% of 24 s: 18 s, in Reports, on the sprite's tenth tile (row 2, column 1).
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2)
  const preview = player(page).locator('[part="preview"]')
  await expect(preview.locator('.label')).toHaveText('Reports · 0:18')
  const thumb = preview.locator('img')
  await expect(thumb).toHaveAttribute('src', /tour-thumbs\.jpg$/)
  await expect(thumb).toHaveCSS('width', '160px')
  await expect(thumb).toHaveCSS('object-position', '-160px -180px')
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => mediaTime(page)).toBeCloseTo(6, 0)
  await page.mouse.move(box.x + box.width / 2, box.y - 120)
  await expect(preview).toHaveCount(0)
})

test('the settings menu sets the speed and the captions; the captions button and C turn them off and on again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await ready(page)
  const settings = page.getByRole('button', { name: 'Settings' })
  await settings.click()
  // Menu rows state their role through ElementInternals, which getByRole cannot read: find them by value.
  const row = (value: string) => player(page).locator(`c2-menu-item[value="${value}"]`)
  await row('rate:1.5').click()
  await expect.poll(() => video(page).evaluate((element) => (element as HTMLVideoElement).playbackRate)).toBe(1.5)
  await expect(player(page).locator('.announcement')).toHaveText('Speed 1.5×')
  await settings.click()
  await expect(row('rate:1.5')).toHaveAttribute('checked', '')
  await expect(row('rate:1.5')).toContainText('1.5×')
  await expect(row('cc:1')).toContainText('Français')
  await row('cc:1').click()
  const modes = () => video(page).evaluate((element) => [...(element as HTMLVideoElement).textTracks].map((track) => `${track.kind}:${track.mode}`))
  await expect.poll(modes).toEqual(['captions:disabled', 'captions:showing', 'chapters:hidden'])
  const cc = page.getByRole('button', { name: 'Turn off captions: Français' })
  await expect(cc).toHaveAttribute('aria-pressed', 'true')
  await cc.click()
  await expect.poll(modes).toEqual(['captions:disabled', 'captions:disabled', 'chapters:hidden'])
  // C brings back the last track.
  await page.getByRole('button', { name: 'Turn on captions: Français' }).focus()
  await page.keyboard.press('c')
  await expect.poll(modes).toEqual(['captions:disabled', 'captions:showing', 'chapters:hidden'])
  await accessible(page)
})

test('while playing, the controls hide once the pointer rests and come back when it moves', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await ready(page)
  await page.getByRole('button', { name: 'Play Product tour' }).click()
  await expect(player(page)).toHaveState('playing')
  const box = (await player(page).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 40)
  await expect(player(page)).toHaveState('idle', { timeout: 6000 })
  await expect(player(page).locator('[part="controls"]')).toHaveCSS('opacity', '0')
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + 60)
  await expect(player(page)).not.toHaveState('idle')
  // Paused, the controls stay.
  await page.keyboard.press('Escape')
  await video(page).evaluate((element) => (element as HTMLVideoElement).pause())
  await expect(player(page)).not.toHaveState('playing')
})

test('src renders the player’s own video; a missing file shows the error panel with a way to try again', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-video-player id="own" label="Own" src="${MEDIA}/tour.webm" poster="${MEDIA}/tour-poster.jpg" chapters='[{"start":0,"title":"Start"},{"start":12,"title":"End"}]'></c2-video-player>
     <c2-video-player id="broken" label="Broken" src="${MEDIA}/missing.webm"></c2-video-player>`,
  )
  const own = page.locator('#own')
  expect(await own.evaluate((element) => (element as HTMLElement & { media: HTMLVideoElement }).media?.classList.contains('own'))).toBe(true)
  await expect(own.locator('.time')).toHaveText(/0:00 \/ 0:24 · Start/)
  await expect(own.locator('.segment')).toHaveCount(2)
  const broken = page.locator('#broken')
  await expect(broken.getByRole('alert')).toContainText('The video can’t be played')
  await expect(broken.getByRole('alert')).toContainText('not found')
  await expect(broken.getByRole('button', { name: 'Play Broken' })).toHaveCount(0)
  await broken.getByRole('button', { name: 'Try again' }).click()
  await expect(broken.getByRole('alert')).toBeVisible()
})

test('parseVtt reads cue times and text; formatTime writes minutes, and hours past the hour', async ({ page, renderScenario }) => {
  await renderScenario('')
  const result = await page.evaluate(() => {
    const { parseVtt, formatTime } = (window as unknown as { vtt: { parseVtt(text: string): unknown; formatTime(value: number, hours?: boolean): string } }).vtt
    return {
      cues: parseVtt('WEBVTT\n\nintro\n00:00.000 --> 00:08.000 align:start\nIntro\n\n00:01:02.500 --> 01:00:00.000\nTwo\nlines\n'),
      times: [formatTime(0), formatTime(75), formatTime(3725), formatTime(65, true), formatTime(Number.NaN)],
    }
  })
  expect(result.cues).toEqual([
    { start: 0, end: 8, text: 'Intro' },
    { start: 62.5, end: 3600, text: 'Two\nlines' },
  ])
  expect(result.times).toEqual(['0:00', '1:15', '1:02:05', '0:01:05', '0:00'])
})

test('a video whose every <source> fails shows the error panel, though the video itself never fires error', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-video-player label="Sources"><video muted playsinline><source src="${MEDIA}/missing.webm" type="video/webm" /><source src="${MEDIA}/missing-too.webm" type="video/webm" /></video></c2-video-player>`,
  )
  await expect(player(page).getByRole('alert')).toContainText('The video can’t be played')
  await expect(player(page).getByRole('button', { name: 'Play Sources' })).toHaveCount(0)
})

test('a new source while playing leaves the player paused, not stuck on Pause', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await ready(page)
  await page.getByRole('button', { name: 'Play Product tour' }).click()
  await expect(player(page)).toHaveState('playing')
  // The app swaps the file: the media resets (emptied) without a pause event.
  await video(page).evaluate((element, src) => ((element as HTMLVideoElement).src = src), `${MEDIA}/tour.webm?next`)
  await expect(player(page)).not.toHaveState('playing')
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
})

test('a control clicked with the mouse keeps its focus but no longer keeps the controls up', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-player label="Product tour">${VIDEO}</c2-video-player>`)
  await ready(page)
  await page.getByRole('button', { name: 'Play Product tour' }).click()
  await page.getByRole('button', { name: 'Pause', exact: true }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(player(page)).toHaveState('playing')
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeFocused()
  await expect(player(page)).toHaveState('idle', { timeout: 6000 })
})

test('without a label the group is named in the page language, and follows a change of lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="en"><c2-video-player>${VIDEO}</c2-video-player></div>`)
  await page.evaluate(() =>
    (window as unknown as { addTranslations(map: object): void }).addTranslations({ fr: { 'video-player': { player: 'Lecteur vidéo' } } }),
  )
  await expect(player(page)).toHaveHostAria('aria-label', 'Video player')
  await page.locator('div[lang]').evaluate((element) => element.setAttribute('lang', 'fr'))
  await expect(player(page)).toHaveHostAria('aria-label', 'Lecteur vidéo')
})

test('right to left, the seek bar runs from the right and ← moves forward', async ({ page, renderScenario }) => {
  await renderScenario(`<div dir="rtl"><c2-video-player label="Product tour">${VIDEO}</c2-video-player></div>`)
  await ready(page)
  const box = (await seek(player(page)).boundingBox())!
  // A quarter of the way from the right edge: about 6 s of 24.
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2)
  await expect.poll(() => mediaTime(page)).toBeCloseTo(6, 0)
  await seek(player(page)).focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => mediaTime(page)).toBeCloseTo(5, 0)
  // The handle sits right of centre for an early time.
  const handle = (await player(page).locator('.handle').boundingBox())!
  expect(handle.x).toBeGreaterThan(box.x + box.width / 2)
})

test('inside a centring flex frame the player keeps its width instead of shrinking to nothing', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div id="frame" style="display: flex; justify-content: center; width: 480px">${'<c2-video-player label="Product tour">' + VIDEO + '</c2-video-player>'}</div>`,
  )
  const frame = (await page.locator('#frame').boundingBox())!
  const box = (await player(page).boundingBox())!
  expect(box.width).toBeCloseTo(frame.width, 0)
  expect(box.height).toBeCloseTo((frame.width * 9) / 16, 0)
})
