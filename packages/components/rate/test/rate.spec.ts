import { accessible } from '../../../../tests/component-fixture'
import type { Rate } from '../src/rate'
import { test, expect } from './fixture'

test('selects a whole-star rating with the pointer', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-rate')
  const slider = page.getByRole('slider', { name: 'Product rating' })

  await host.locator('.item').nth(3).click()

  await expect(host).toHaveJSProperty('value', 4)
  await expect(host).toHaveAttribute('value', '4')
  await expect(host).toHaveAttribute('data-change', '4')
  await expect(slider).toHaveAttribute('aria-valuetext', '4 out of 5')
})

test('selects half-star values from either side of an icon', async ({ page, scenario }) => {
  await scenario('half')
  const host = page.locator('c2-rate')
  const fourthStar = host.locator('.item').nth(3)

  await fourthStar.click({ position: { x: 2, y: 12 } })
  await expect(host).toHaveJSProperty('value', 3.5)

  const bounds = await fourthStar.boundingBox()
  await fourthStar.click({ position: { x: Math.max(1, (bounds?.width ?? 24) - 2), y: 12 } })
  await expect(host).toHaveJSProperty('value', 4)
})

test('supports Arrow, Home and End keys', async ({ page, scenario }) => {
  await scenario('half')
  const host = page.locator('c2-rate')
  const slider = page.getByRole('slider', { name: 'Product rating' })

  await slider.focus()
  await slider.press('ArrowRight')
  await expect(host).toHaveJSProperty('value', 2.5)
  await slider.press('Home')
  await expect(host).toHaveJSProperty('value', 0)
  await slider.press('End')
  await expect(host).toHaveJSProperty('value', 5)
})

test('can clear the current rating by selecting it again', async ({ page, scenario }) => {
  await scenario('clearable')
  const host = page.locator('c2-rate')

  await host.locator('.item').nth(1).click()
  await expect(host).toHaveJSProperty('value', 0)
})

test('submits its value and participates in required validation', async ({ page, scenario }) => {
  await scenario('form')
  const host = page.locator('c2-rate')

  await expect.poll(() => host.evaluate((element: Rate) => element.validity.valueMissing)).toBe(true)
  await host.locator('.item').nth(4).click()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('score'))).toBe('5')
  await expect.poll(() => host.evaluate((element: Rate) => element.validity.valid)).toBe(true)
})

test('readonly and disabled ratings do not change', async ({ page, scenario }) => {
  await scenario('readonly')
  let host = page.locator('c2-rate')
  await expect(page.getByRole('slider')).toHaveAttribute('tabindex', '-1')
  await host.locator('.item').nth(4).click()
  await expect(host).toHaveJSProperty('value', 2)

  await scenario('disabled')
  host = page.locator('c2-rate')
  await expect(page.getByRole('slider')).toHaveAttribute('aria-disabled', 'true')
  await host.locator('.item').nth(4).click()
  await expect(host).toHaveJSProperty('value', 2)
})

test('has no detectable accessibility violations', async ({ page, scenario }) => {
  await scenario('half')
  await accessible(page)
})
