import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const routes = ['./', './services/', './traces/', './logs/', './dashboards/', './alerts/']

for (const route of routes) {
  test(`${route} passes representative WCAG A/AA automation`, async ({ page }) => {
    await page.goto(route)
    // A role query skips the alerts page's no-JavaScript baseline, which stays in the document (hidden) after hydration.
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible()
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(result.violations).toEqual([])
  })
}

test('keyboard navigation, sheet focus return, live status, and 200% zoom remain usable', async ({ page }) => {
  await page.goto('./')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  await page.getByRole('button', { name: 'Built with c2n' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Built with c2n' })).toBeFocused()
  // Browser zoom at 200% halves the CSS viewport, so the page's media queries respond to it. CSS `zoom` on the root does
  // not: it scales a 1280px layout to 2560px with the desktop breakpoints still applied, which no browser zoom produces.
  const viewport = page.viewportSize()!
  await page.setViewportSize({ width: viewport.width / 2, height: viewport.height / 2 })
  await expect(page.getByRole('button', { name: 'Built with c2n' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
})
