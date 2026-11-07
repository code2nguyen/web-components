import { test, expect, accessible, props } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const backdrop = (page: Page, selector = 'c2-backdrop') => page.locator(selector)
const pattern = (page: Page, selector?: string) => backdrop(page, selector).locator('[part="pattern"]')

test('the content sits above a decorative pattern that takes no pointer and is hidden from assistive technology', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-backdrop style="height: 200px"><h2>Ship it</h2><c2-button id="go">Start</c2-button></c2-backdrop>`)
  await expect(page.getByRole('heading', { name: 'Ship it' })).toBeVisible()
  await expect(pattern(page)).toHaveAttribute('aria-hidden', 'true')
  expect(await pattern(page).evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none')
  expect(await pattern(page).evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('radial-gradient')
  // The pattern is behind: a click on the button reaches it.
  await page.evaluate(() => document.getElementById('go')!.addEventListener('click', () => (document.body.dataset.clicked = 'yes')))
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('body')).toHaveAttribute('data-clicked', 'yes')
  await accessible(page)
})

test('each pattern draws its own layer, and the fade is a variable', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-backdrop style="height: 160px; --c2-backdrop__meteor--count: 5">Content</c2-backdrop>`)
  await props(backdrop(page), { pattern: 'grid' })
  expect(await pattern(page).evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('linear-gradient')
  await props(backdrop(page), { pattern: 'stripes' })
  expect(await pattern(page).evaluate((element) => getComputedStyle(element).backgroundImage)).toContain('repeating-linear-gradient')
  await props(backdrop(page), { pattern: 'aurora' })
  await expect(pattern(page).locator('.blob')).toHaveCount(3)
  await props(backdrop(page), { pattern: 'meteors' })
  await expect(pattern(page).locator('.meteor')).toHaveCount(5)
  expect(await pattern(page).evaluate((element) => getComputedStyle(element).maskImage)).toContain('radial-gradient')
  await backdrop(page).evaluate((element) => element.style.setProperty('--c2-backdrop__mask--image', 'none'))
  expect(await pattern(page).evaluate((element) => getComputedStyle(element).maskImage)).toBe('none')
})

test('flicker draws squares on a canvas the size of the box, and lights some of them over time', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-backdrop pattern="flicker" style="width: 320px; height: 160px">Content</c2-backdrop>`)
  const canvas = pattern(page).locator('canvas')
  const size = await canvas.evaluate((element) => {
    const canvas = element as HTMLCanvasElement
    return [Math.round(canvas.width / devicePixelRatio), Math.round(canvas.height / devicePixelRatio)]
  })
  expect(size).toEqual([320, 160])
  // Some pixel takes the flicker colour (blue) once squares light up.
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const canvas = element as HTMLCanvasElement
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        for (let index = 0; index < data.length; index += 4) if (data[index + 2] > 150 && data[index] < 120 && data[index + 3] > 60) return true
        return false
      }),
    )
    .toBe(true)
})

test('a moving pattern pauses off screen, and stays still under reduced motion', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-backdrop pattern="aurora" style="height: 160px">Content</c2-backdrop><div style="height: 3000px"></div>`)
  await expect(pattern(page)).not.toHaveClass(/paused/)
  await page.evaluate(() => window.scrollTo(0, 2500))
  await expect(pattern(page)).toHaveClass(/paused/)
  expect(
    await pattern(page)
      .locator('.blob')
      .first()
      .evaluate((element) => getComputedStyle(element).animationPlayState),
  ).toBe('paused')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-backdrop pattern="meteors" style="height: 160px">Content</c2-backdrop>`)
  expect(
    await pattern(page)
      .locator('.meteor')
      .first()
      .evaluate((element) => getComputedStyle(element).display),
  ).toBe('none')
})

test('regressions: a count of 0 draws no meteors, a size in rem keeps the flicker grid, content is not clipped', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-backdrop id="m" pattern="meteors" style="height: 100px; --c2-backdrop__meteor--count: 0">Content</c2-backdrop><c2-backdrop id="f" pattern="flicker" style="width: 320px; height: 160px; --c2-backdrop--size: 1rem">Content</c2-backdrop>`,
  )
  await expect(pattern(page, '#m').locator('.meteor')).toHaveCount(0)
  expect(await backdrop(page, '#m').evaluate((element) => getComputedStyle(element).overflow)).toBe('visible')
  // 1rem is 16px: 20 × 10 cells, not 320 × 160.
  expect(await backdrop(page, '#f').evaluate((element) => (element as unknown as { columns: number; rows: number }).columns)).toBe(20)
})
