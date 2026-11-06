import type { Locator } from '@playwright/test'
import { accessible } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

async function box(locator: Locator) {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a rendered element')
  return rect
}

test('draws a browser window with the address in its title bar', async ({ page, scenario }) => {
  await scenario()
  const frame = page.locator('c2-device-frame')
  await expect(frame.locator('[part="bar"]')).toBeVisible()
  await expect(frame.locator('[part="address"]')).toHaveText('app.example.com/inbox')
  await expect(frame.locator('.dots')).toHaveAttribute('aria-hidden', 'true')
  await expect(frame.locator('.island')).toHaveCount(0)
  // The window fills its container and fits its content's height.
  expect(Math.round((await box(frame.locator('[part="frame"]'))).width)).toBe(800)
  await expect(page.getByText('Inbox', { exact: true })).toBeVisible()
  await accessible(page)
})

test('slotted address and actions replace the url text', async ({ page, scenario }) => {
  await scenario('address')
  // The url stays as the slot's fallback, which is not rendered.
  await expect(page.locator('c2-device-frame').locator('.url')).toBeHidden()
  await expect(page.getByRole('link', { name: 'example.com/docs' })).toBeVisible()
  await expect(page.getByText('⋯')).toBeVisible()
})

test('draws a phone at its width and screen shape, with a camera island', async ({ page, scenario }) => {
  await scenario('phone')
  const frame = page.locator('c2-device-frame').locator('[part="frame"]')
  const rect = await box(frame)
  expect(Math.round(rect.width)).toBe(300)
  expect(Math.round(rect.height)).toBe(Math.round((300 * 19.5) / 9))
  await expect(page.locator('c2-device-frame').locator('.island')).toBeVisible()
  await expect(page.locator('c2-device-frame').locator('[part="bar"]')).toHaveCount(0)
  // The bezel surrounds the screen.
  const screen = await box(page.locator('c2-device-frame').locator('[part="screen"]'))
  expect(Math.round(screen.x - rect.x)).toBe(12)
})

test('a phone narrower than its container keeps its shape', async ({ page, scenario }) => {
  await scenario('narrow')
  const rect = await box(page.locator('c2-device-frame').locator('[part="frame"]'))
  expect(Math.round(rect.width)).toBe(200)
  expect(Math.round(rect.height)).toBe(Math.round((200 * 19.5) / 9))
})

test('keeps its size in a container that shrinks to fit its content', async ({ page, scenario }) => {
  await scenario('centred')
  expect(Math.round((await box(page.locator('c2-device-frame').locator('[part="frame"]'))).width)).toBe(300)

  await scenario('centred-laptop')
  expect(Math.round((await box(page.locator('c2-device-frame').locator('[part="frame"]'))).width)).toBe(300)
  expect(Math.round((await box(page.locator('c2-device-frame').locator('[part="base"]'))).width)).toBe(357)

  // A percentage width has nothing to resolve against there: the screen stands in at 360px instead of collapsing.
  await scenario('centred-browser')
  expect(Math.round((await box(page.locator('c2-device-frame').locator('[part="frame"]'))).width)).toBe(362)
  await scenario('centred-default-laptop')
  expect(Math.round((await box(page.locator('c2-device-frame').locator('[part="base"]'))).width)).toBe(384)
})

test('shrinks below its stand-in width in a narrow flex row', async ({ page, scenario }) => {
  await scenario('narrow-row')
  expect(Math.round((await box(page.locator('c2-device-frame').locator('[part="frame"]'))).width)).toBe(200)
})

test('the size variables resize the device', async ({ page, scenario }) => {
  await scenario('phone')
  const frame = page.locator('c2-device-frame')
  await frame.evaluate((host: HTMLElement) => {
    host.style.setProperty('--c2-device-frame__phone--width', '240px')
    host.style.setProperty('--c2-device-frame__phone--aspect-ratio', '1 / 2')
  })
  const rect = await box(frame.locator('[part="frame"]'))
  expect(Math.round(rect.width)).toBe(240)
  expect(Math.round(rect.height)).toBe(480)
})

test('draws a tablet', async ({ page, scenario }) => {
  await scenario('tablet')
  const rect = await box(page.locator('c2-device-frame').locator('[part="frame"]'))
  expect(Math.round(rect.width)).toBe(560)
  expect(Math.round(rect.height)).toBe(Math.round((560 * 4) / 3))
})

test('draws a laptop whose deck is wider than its lid', async ({ page, scenario }) => {
  await scenario('laptop')
  const lid = await box(page.locator('c2-device-frame').locator('[part="frame"]'))
  const base = await box(page.locator('c2-device-frame').locator('[part="base"]'))
  expect(Math.round(base.width)).toBe(800)
  expect(lid.width).toBeLessThan(base.width)
  // The lid is centred on the deck and sits on it.
  expect(Math.round(lid.x + lid.width / 2)).toBe(Math.round(base.x + base.width / 2))
  expect(Math.round(lid.y + lid.height)).toBe(Math.round(base.y))
})

test('an unknown device falls back to the browser window', async ({ page, scenario }) => {
  await scenario('unknown')
  await expect(page.locator('c2-device-frame').locator('[part="address"]')).toHaveText('example.com')
})

test('the screen is a size container content can query', async ({ page, scenario }) => {
  await scenario('phone')
  // 276px wide inside the phone: one column.
  await expect(page.locator('.layout')).toHaveCSS('grid-template-columns', /^\d+(\.\d+)?px$/)
  await scenario()
  // 798px wide in the browser window: two columns.
  await expect(page.locator('.layout')).toHaveCSS('grid-template-columns', /^\S+px \S+px$/)
})

test('a picture covers the screen', async ({ page, scenario }) => {
  await scenario('image')
  const screen = await box(page.locator('c2-device-frame').locator('[part="screen"]'))
  const image = await box(page.getByRole('img', { name: 'Dashboard' }))
  expect(Math.round(image.width)).toBe(Math.round(screen.width))
  expect(Math.round(image.height)).toBe(Math.round(screen.height))
  await accessible(page)
})
