import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

test('keyboard updates hue and emits input', async ({ page, renderScenario }) => {
  await renderScenario('<c2-color-slider aria-label="Hue" value="120"></c2-color-slider>')
  const host = page.locator('c2-color-slider')
  await watch(host, 'input')
  await page.getByRole('slider').press('ArrowRight')
  await expect(host).toHaveJSProperty('value', 121)
  await expect(host).toHaveAttribute('data-events', '[null]')
  await accessible(page)
})
test('a nonzero minimum starts the visual handle at the left edge', async ({ page, renderScenario }) => {
  await renderScenario('<c2-color-slider min="100" max="200" value="100" aria-label="Hue"></c2-color-slider>')
  const handle = page.locator('.color-handle')
  await expect.poll(() => handle.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)).toBe(0)
  await props(page.locator('c2-color-slider'), { value: 200 })
  await expect.poll(() => handle.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeGreaterThan(0)
})
