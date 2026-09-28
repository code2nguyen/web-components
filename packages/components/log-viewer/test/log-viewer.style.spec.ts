import { test, expect } from './fixture'

test('font and CSS variables recalculate layout and public parts remain available', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    element.style.setProperty('--c2-log-viewer--font-size', '20px')
    element.style.setProperty('--c2-log-viewer--background', 'rgb(10, 20, 30)')
  })
  await expect
    .poll(() =>
      viewer
        .locator('[part="cell"]')
        .first()
        .evaluate((cell) => cell.getBoundingClientRect().width),
    )
    .toBeGreaterThan(80)
  expect(await viewer.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(10, 20, 30)')
  await expect
    .poll(() =>
      viewer
        .locator('[part="entry"]')
        .first()
        .evaluate((entry) => entry.clientHeight),
    )
    .toBe(49)
  for (const part of ['viewport', 'content', 'entry', 'cell', 'text']) expect(await viewer.locator(`[part="${part}"]`).count()).toBeGreaterThan(0)
})

test('custom spacing participates in virtual offsets and continuous text inset', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => element.style.setProperty('--c2-log-viewer__cell--padding', '10px 12px'))
  await expect
    .poll(() =>
      viewer
        .locator('[part="entry"]')
        .first()
        .evaluate((row) => row.getBoundingClientRect().height),
    )
    .toBeCloseTo(41.45, 1)
  const adjacent = await viewer.locator('[part="entry"]').evaluateAll((rows) => rows.slice(0, 2).map((row) => row.getBoundingClientRect()))
  expect(Math.abs(adjacent[0].bottom - adjacent[1].top)).toBeLessThan(1)
  await viewer.evaluate((element) => {
    element.setAttribute('tabular', 'false')
    element.style.setProperty('--c2-log-viewer__text--inset', '24px')
  })
  await expect(viewer.locator('.plain-entry').first()).toHaveCSS('left', '24px')
})

test('unconfigured viewer has readable metadata, severity colors and row dividers', async ({ page, scenario }) => {
  await scenario('entries')
  const viewer = page.locator('c2-log-viewer')
  expect(await viewer.evaluate((element) => element.getAttribute('style'))).toBeNull()
  await expect(viewer).toHaveCSS('background-color', 'rgb(11, 18, 32)')
  await expect(viewer).toHaveCSS('border-radius', '12px')
  await expect(viewer.locator('[data-attribute="timestamp"]').first()).toHaveCSS('color', 'rgb(148, 163, 184)')
  await expect(viewer.locator('[data-index="0"] [data-attribute="level"]')).toHaveCSS('color', 'rgb(110, 231, 183)')
  await expect(viewer.locator('[data-index="1"] [data-attribute="level"]')).toHaveCSS('color', 'rgb(252, 211, 77)')
  await expect(viewer.locator('[data-index="2"] [data-attribute="level"]')).toHaveCSS('color', 'rgb(253, 164, 175)')
  await expect(viewer.locator('[part="cell"]').first()).toHaveCSS('padding', '8px 12px')
  expect(
    await viewer
      .locator('[part="cell"]')
      .first()
      .evaluate((cell) => cell.getBoundingClientRect().width),
  ).toBeLessThan(70)
  expect(
    await viewer
      .locator('[part="entry"]')
      .first()
      .evaluate((row) => getComputedStyle(row).boxShadow),
  ).not.toBe('none')
})
