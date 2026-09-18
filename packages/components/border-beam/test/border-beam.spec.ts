import { accessible } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

test('fills its container as a pointer-transparent decorative overlay', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-border-beam')

  await expect(host).toBeVisible()
  await expect(host.locator('.border-beam')).toHaveAttribute('aria-hidden', 'true')
  await expect(host.locator('[part="beam"]')).toHaveCount(1)
  await expect(host).toHaveCSS('pointer-events', 'none')
  await accessible(page)
})

test('applies timing and playback controls', async ({ page, scenario }) => {
  await scenario('controls')
  const host = page.locator('c2-border-beam')
  const beams = host.locator('[part="beam"]')
  const beam = beams.first()

  await expect(host).toHaveAttribute('reverse')
  await expect(host).toHaveAttribute('paused')
  await expect(beams).toHaveCount(2)
  await expect(beam).toHaveCSS('animation-duration', '2.5s')
  await expect(beam).toHaveCSS('animation-delay', '-1s')
  await expect(beam).toHaveCSS('animation-direction', 'reverse')
  await expect(beam).toHaveCSS('animation-play-state', 'paused')
  await expect(host.locator('.border-beam')).toHaveCSS('padding', '2px')

  await host.evaluate((element: HTMLElement) => element.style.setProperty('--c2-border-beam__beam--duration', '9s'))
  await expect(beam).toHaveCSS('animation-duration', '9s')
})

test('moves forward and backward when restricted to one border', async ({ page, scenario }) => {
  await scenario('side')
  const layer = page.locator('c2-border-beam .border-beam')
  const beam = layer.locator('[part="beam"]')

  await expect(layer).toHaveCount(1)
  await expect(layer).toHaveClass(/border-beam--top/)
  await expect(beam).toHaveCSS('animation-direction', 'alternate')
})
