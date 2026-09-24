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

test('public border-left and corner radius variables reach the gradient', async ({ page, renderScenario }) => {
  await renderScenario('<c2-color-slider aria-label="Hue"></c2-color-slider>')
  const host = page.locator('c2-color-slider')
  const gradient = page.locator('.gradient')
  await host.evaluate((element) => {
    element.style.setProperty('--c2-color-slider--border-left', '5px solid rgb(231, 17, 73)')
    element.style.setProperty('--c2-color-slider--border-top-left-radius', '21px')
  })
  await expect(gradient).toHaveCSS('border-left-width', '5px')
  await expect(gradient).toHaveCSS('border-left-color', 'rgb(231, 17, 73)')
  await expect(gradient).toHaveCSS('border-top-left-radius', '21px')
})
