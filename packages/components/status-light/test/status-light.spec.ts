import type { Locator } from '@playwright/test'
import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const dot = (host: Locator) => host.locator('[part="dot"]')
const background = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor)

test('renders a neutral dot before its label, exposed as plain text', async ({ page, renderScenario }) => {
  await renderScenario('<c2-status-light>Queued</c2-status-light>')
  const host = page.locator('c2-status-light')
  await expect(dot(host)).toBeVisible()
  expect(await background(dot(host))).toBe('rgb(113, 113, 122)')
  const [mark, label] = [(await dot(host).boundingBox())!, (await host.locator('[part="label"]').boundingBox())!]
  expect(mark.width).toBe(8)
  expect(Math.round(label.x - (mark.x + mark.width))).toBe(8)
  await expect(page.locator('main')).toMatchAriaSnapshot(`
    - main:
      - text: Queued
  `)
  await expect(host).toHaveHostAria('role', null)
  await accessible(page)
})

test('tone picks the dot colour, and the dot variable wins over it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-status-light tone="success">Live</c2-status-light>')
  const host = page.locator('c2-status-light')
  expect(await background(dot(host))).toBe('rgb(22, 163, 74)')
  await props(host, { tone: 'danger' })
  expect(await background(dot(host))).toBe('rgb(220, 38, 38)')
  await host.evaluate((element) => (element as HTMLElement).style.setProperty('--c2-status-light__dot--background', 'rgb(1, 2, 3)'))
  expect(await background(dot(host))).toBe('rgb(1, 2, 3)')
})

test('pulse draws an animated ring that reduced motion stills', async ({ page, renderScenario }) => {
  await renderScenario('<c2-status-light tone="primary" pulse>Building</c2-status-light>')
  const ring = (host: Locator) => host.locator('[part="dot"]').evaluate((element) => getComputedStyle(element, '::after').animationName)
  const host = page.locator('c2-status-light')
  expect(await ring(host)).toBe('c2-status-light-pulse')
  await props(host, { pulse: false })
  expect(await ring(host)).toBe('none')
  await props(host, { pulse: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await host.locator('[part="dot"]').evaluate((element) => getComputedStyle(element, '::after').display)).toBe('none')
})

test('a bare dot is an image named by accessible-label, and drops the gap', async ({ page, renderScenario }) => {
  await renderScenario('<c2-status-light tone="danger" accessible-label="Failed"></c2-status-light>')
  const host = page.locator('c2-status-light')
  await expect(host).toHaveHostAria('role', 'img')
  await expect(host).toHaveHostAria('aria-label', 'Failed')
  expect((await host.boundingBox())!.width).toBe(8)
  await expect(host).not.toHaveAttribute('role')
  await accessible(page)

  await props(host, { accessibleLabel: '' })
  await expect(host).toHaveHostAria('role', null)
  await expect(host).toHaveHostAria('aria-label', null)
})

test('accessible-label replaces a short visible label', async ({ page, renderScenario }) => {
  await renderScenario('<c2-status-light tone="warning" accessible-label="Priority 1">P1</c2-status-light>')
  const host = page.locator('c2-status-light')
  await expect(host).toHaveHostAria('role', 'img')
  await expect(host).toHaveHostAria('aria-label', 'Priority 1')
  await expect(host).toHaveText('P1')
  await accessible(page)
})

test('an icon in the dot slot replaces the dot and takes the tone colour', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-status-light tone="success"><svg slot="dot" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12l5 5L20 7"></path></svg>Passed</c2-status-light>',
  )
  const host = page.locator('c2-status-light')
  const icon = host.locator('svg')
  expect(await icon.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(22, 163, 74)')
  expect((await icon.boundingBox())!.width).toBe(14)
  expect(await background(dot(host))).toBe('rgba(0, 0, 0, 0)')
  await accessible(page)
})

test('the label adds and removes its gap as content comes and goes', async ({ page, renderScenario }) => {
  await renderScenario('<c2-status-light accessible-label="Idle"></c2-status-light>')
  const host = page.locator('c2-status-light')
  expect((await host.boundingBox())!.width).toBe(8)
  await host.evaluate((element) => (element.textContent = 'Idle'))
  await expect.poll(async () => (await host.boundingBox())!.width).toBeGreaterThan(20)
  await host.evaluate((element) => (element.textContent = ''))
  await expect.poll(async () => (await host.boundingBox())!.width).toBe(8)
})

test('a long label truncates inside a narrow container', async ({ page, renderScenario }) => {
  await renderScenario('<div style="width: 120px"><c2-status-light tone="warning">Ready with warnings from the image pipeline</c2-status-light></div>')
  const host = page.locator('c2-status-light')
  expect((await host.boundingBox())!.width).toBeLessThanOrEqual(120)
  await expect(dot(host)).toBeVisible()
  expect((await dot(host).boundingBox())!.width).toBe(8)
})
