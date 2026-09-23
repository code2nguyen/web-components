import { expect, test } from '@playwright/test'

for (const width of [1280, 768]) {
  test(`primary routes remain bounded at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    for (const route of ['./', './services/', './traces/', './logs/', './dashboards/', './alerts/']) {
      await page.goto(route)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
    }
  })

  test(`global scope stays pinned below the header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('./logs/?pageSize=100')

    const header = page.locator('c2-header')
    const globalScope = page.locator('.global-scope')
    const navigationToggle = globalScope.locator('c2-icon-button.scope-navigation-toggle')
    await expect(header).toHaveCSS('position', 'sticky')
    await expect(globalScope).toHaveCSS('position', 'sticky')
    await expect(navigationToggle).toHaveAttribute('aria-label', 'Close navigation')
    await expect(header.locator('c2-icon-button[aria-label$=" navigation"]')).toHaveCount(0)

    await navigationToggle.click()
    await expect(navigationToggle).toHaveAttribute('aria-label', 'Open navigation')

    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true)
    await page.evaluate(() => window.scrollTo(0, 1200))

    await expect.poll(() => header.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(0)
    await expect
      .poll(async () => {
        const headerBottom = await header.evaluate((element) => Math.round(element.getBoundingClientRect().bottom))
        const scopeTop = await globalScope.evaluate((element) => Math.round(element.getBoundingClientRect().top))
        return Math.abs(headerBottom - scopeTop)
      })
      .toBeLessThanOrEqual(1)

    const controlHeights = await globalScope
      .locator('.scope-navigation-toggle, .scope-environment c2-select, .scope-theme c2-theme-select')
      .evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().height)))
    expect(new Set(controlHeights)).toEqual(new Set([34]))

    if (width === 1280) {
      const labelTops = await globalScope
        .locator('.scope-field > .scope-label, .replay-controls > .scope-label, .scope-theme > .scope-label')
        .evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
      expect(Math.max(...labelTops) - Math.min(...labelTops)).toBeLessThanOrEqual(1)
    } else {
      const topRowBounds = await globalScope
        .locator('.scope-navigation-toggle, .scope-environment, .scope-theme')
        .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()))
      expect(topRowBounds[0].right).toBeLessThanOrEqual(topRowBounds[1].left)
      expect(topRowBounds[1].right).toBeLessThanOrEqual(topRowBounds[2].left)
    }
  })
}

test('long fixtures wrap inside their owning regions', async ({ page }) => {
  await page.goto('./services/')
  await expect(page.locator('c2-table').getByText('recommendation-engine-with-an-intentionally-long-name', { exact: true })).toBeVisible()
  await page.goto('./logs/?q=intentionally%20long')
  await expect(page.getByText(/intentionally long diagnostic message/).first()).toBeVisible()
})
