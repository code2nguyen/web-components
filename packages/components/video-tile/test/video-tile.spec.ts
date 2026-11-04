import { test, expect, accessible, props, watch, webAudioRuns } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type FakeStream = (options?: { video?: boolean; audio?: boolean }) => MediaStream

const tile = (page: Page, selector = 'c2-video-tile') => page.locator(selector)

/** Hands the tile a fake camera (and microphone) from the scenario page. */
async function giveStream(page: Page, options: { video?: boolean; audio?: boolean } = {}, selector = 'c2-video-tile') {
  await tile(page, selector).evaluate(async (element, opts) => {
    const subject = element as HTMLElement & { stream: MediaStream; updateComplete: Promise<boolean> }
    subject.stream = (window as unknown as { fakeStream: FakeStream }).fakeStream(opts)
    await subject.updateComplete
  }, options)
}

test('a participant without video: an initials avatar on the surface, named by the group', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-tile name="Kenji Watanabe"></c2-video-tile>`)
  await expect(tile(page)).toHaveHostAria('role', 'group')
  await expect(tile(page)).toHaveHostAria('aria-label', 'Kenji Watanabe')
  await expect(tile(page).locator('c2-avatar')).toBeVisible()
  await expect(tile(page).locator('c2-avatar')).toHaveText('KW')
  await expect(tile(page).locator('[part="name"]')).toHaveText('Kenji Watanabe')
  // The meter sits in the pill, silent.
  await expect(tile(page).locator('[part="name"] c2-audio-visualizer')).toBeVisible()
  await accessible(page)
})

test('a live camera plays in the muted inner video; video-off or an ended track shows the avatar again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-tile name="Ana Ruiz"></c2-video-tile>`)
  await giveStream(page)
  const video = tile(page).locator('video[part="video"]')
  await expect(tile(page).locator('c2-avatar')).toHaveCount(0)
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).muted && (element as HTMLVideoElement).srcObject !== null)).toBe(true)
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThan(1)

  await props(tile(page), { videoOff: true })
  await expect(tile(page).locator('c2-avatar')).toBeVisible()
  await props(tile(page), { videoOff: false })
  await expect(tile(page).locator('c2-avatar')).toHaveCount(0)

  await tile(page).evaluate((element) => (element as HTMLElement & { stream: MediaStream }).stream.getVideoTracks().forEach((track) => track.stop()))
  // A stopped track fires no `ended` on its own page; the tile reads it again on the next update.
  await props(tile(page), { pinned: true })
  await expect(tile(page).locator('c2-avatar')).toBeVisible()
})

test('local mirrors and says "(You)"; a screen share fits, is not mirrored and is named for its owner', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-video-tile id="me" name="Sam Lee" local muted></c2-video-tile><c2-video-tile id="share" name="Ana Ruiz" kind="screen" local></c2-video-tile>`,
  )
  await giveStream(page, {}, '#me')
  await giveStream(page, {}, '#share')
  const transform = (selector: string) =>
    tile(page, selector)
      .locator('video')
      .evaluate((video) => getComputedStyle(video).transform)
  await expect.poll(() => transform('#me')).toBe('matrix(-1, 0, 0, 1, 0, 0)')
  await expect.poll(() => transform('#share')).toBe('none')
  expect(
    await tile(page, '#share')
      .locator('video')
      .evaluate((video) => getComputedStyle(video).objectFit),
  ).toBe('contain')
  expect(
    await tile(page, '#me')
      .locator('video')
      .evaluate((video) => getComputedStyle(video).objectFit),
  ).toBe('cover')
  await expect(tile(page, '#me')).toHaveHostAria('aria-label', 'Sam Lee (You), muted')
  await expect(tile(page, '#me').locator('[part="name"] svg')).toBeVisible()
  await expect(tile(page, '#share')).toHaveHostAria('aria-label', "Ana Ruiz's screen")
  // A screen share has no microphone of its own.
  await expect(tile(page, '#share').locator('[part="name"] c2-audio-visualizer, [part="name"] svg')).toHaveCount(0)
})

test('badges: a raised hand is named and announced once, pinned and connection join the name, the badge slot adds more', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-video-tile name="Diego Fernández" pinned connection="poor"><span slot="badge">REC</span></c2-video-tile><c2-video-tile id="up" name="Lea" hand-raised></c2-video-tile>`,
  )
  await expect(tile(page).first()).toHaveHostAria('aria-label', 'Diego Fernández, pinned, poor connection')
  await expect(tile(page).first().locator('.signal.poor')).toBeVisible()
  await expect(tile(page).first().getByText('REC')).toBeVisible()
  // Already up when the tile appeared: not news.
  await expect(tile(page, '#up')).toHaveHostAria('aria-label', 'Lea, hand raised')
  await expect(tile(page, '#up').locator('.announce')).toHaveText('')

  await props(tile(page).first(), { handRaised: true, connection: 'fair' })
  await expect(tile(page).first().locator('.badge.hand')).toBeVisible()
  await expect(tile(page).first().locator('.announce')).toHaveText('Diego Fernández raised a hand')
  await expect(tile(page).first()).toHaveHostAria('aria-label', 'Diego Fernández, hand raised, pinned, unstable connection')
  await props(tile(page).first(), { connection: 'good' })
  await expect(tile(page).first().locator('.signal')).toHaveCount(0)
  await accessible(page)
})

test('speaking draws the outline; detect-speaking lets the meter decide from the level or the stream', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-tile name="Ana Ruiz" speaking></c2-video-tile><c2-video-tile id="auto" name="Lea" detect-speaking level="0"></c2-video-tile>`)
  await expect(tile(page).first().locator('.tile.speaking')).toHaveCount(1)
  await expect(tile(page).first()).toHaveState('speaking')
  // Speaking is not part of the name: it changes too often to be read.
  await expect(tile(page).first()).toHaveHostAria('aria-label', 'Ana Ruiz')

  await expect(tile(page, '#auto')).not.toHaveState('speaking')
  await props(tile(page, '#auto'), { level: 0.7 })
  await expect(tile(page, '#auto')).toHaveState('speaking')
  await props(tile(page, '#auto'), { level: 0 })
  await expect(tile(page, '#auto')).not.toHaveState('speaking')
})

test('detect-speaking hears a stream; a muted tile has no meter', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-tile id="auto" name="Lea" detect-speaking></c2-video-tile>`)
  await page.locator('main').click()
  test.skip(!(await webAudioRuns(page)), 'Web Audio does not run in this browser here (no audio device), so a stream reads as silence')
  await giveStream(page, { video: false, audio: true }, '#auto')
  await expect(tile(page, '#auto')).toHaveState('speaking')
  // Muted: no meter, so nothing to detect.
  await props(tile(page, '#auto'), { muted: true })
  await expect(tile(page, '#auto').locator('c2-audio-visualizer')).toHaveCount(0)
})

test('a video the SDK attached plays from the default slot; actions show on hover and focus', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-video-tile name="Ana Ruiz"><video id="sdk" muted autoplay></video><c2-icon-button slot="actions" aria-label="More options for Ana Ruiz">⋮</c2-icon-button></c2-video-tile>`,
  )
  await expect(tile(page).locator('video[part="video"]')).toHaveCount(0)
  await expect(tile(page).locator('c2-avatar')).toHaveCount(0)
  const actions = tile(page).locator('.actions')
  expect(await actions.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await tile(page).hover()
  await expect.poll(() => actions.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
  await page.mouse.move(0, 0)
  await expect.poll(() => actions.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
  await page.getByRole('button', { name: 'More options for Ana Ruiz' }).focus()
  await expect.poll(() => actions.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')

  await page.locator('#sdk').evaluate((video) => video.remove())
  await expect(tile(page).locator('c2-avatar')).toBeVisible()
})

test('its text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-video-tile name="Sam" local muted hand-raised></c2-video-tile><c2-video-tile id="share" name="Ana" kind="screen"></c2-video-tile></div>`,
  )
  await expect(tile(page).first()).toHaveHostAria('aria-label', 'Sam (vous), micro coupé, main levée')
  await expect(tile(page, '#share').locator('[part="name"]')).toHaveText('Écran de Ana')
})

test('regressions: the inner video is muted as a property, a muted tile stops speaking, a second raised hand is announced again', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-video-tile name="Ana Ruiz" detect-speaking level="0"></c2-video-tile>`)
  await watch(tile(page), 'speaking-change')
  await props(tile(page), { level: 0.7 })
  expect(
    await tile(page)
      .locator('video')
      .evaluate((video) => (video as HTMLVideoElement).muted),
  ).toBe(true)
  await expect(tile(page)).toHaveState('speaking')
  await expect.poll(async () => JSON.parse((await tile(page).getAttribute('data-events')) ?? '[]')).toEqual([{ speaking: true }])
  await props(tile(page), { muted: true })
  await expect(tile(page)).not.toHaveState('speaking')
  await expect.poll(async () => JSON.parse((await tile(page).getAttribute('data-events')) ?? '[]')).toEqual([{ speaking: true }, { speaking: false }])

  // Record what the live region says: the same words twice must be said twice.
  await tile(page).evaluate((element) => {
    const region = element.shadowRoot!.querySelector('.announce')!
    const said: string[] = []
    ;(window as unknown as { said: string[] }).said = said
    new MutationObserver(() => region.textContent?.trim() && said.push(region.textContent.trim())).observe(region, {
      childList: true,
      characterData: true,
      subtree: true,
    })
  })
  await props(tile(page), { handRaised: true })
  await expect.poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said)).toEqual(['Ana Ruiz raised a hand'])
  await props(tile(page), { handRaised: false })
  await props(tile(page), { handRaised: true })
  await expect.poll(() => page.evaluate(() => (window as unknown as { said: string[] }).said)).toEqual(['Ana Ruiz raised a hand', 'Ana Ruiz raised a hand'])
})
