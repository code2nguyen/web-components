import { test, expect, props, accessible } from '../../../../tests/component-fixture'
import type { Locator } from '@playwright/test'

// Closed content is skipped with `content-visibility: hidden`. Playwright's WebKit visibility check does not ask the
// browser, and its closed-`<details>` lookup stops at the shadow boundary, so ask `checkVisibility()` directly.
const shown = (locator: Locator) => expect.poll(() => locator.evaluate((element) => element.checkVisibility()))

const panels = '<c2-details label="First"><p>First panel</p></c2-details><c2-details label="Second"><p>Second panel</p></c2-details>'

test('consumer-owned disclosure panels remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario('<c2-accordion><c2-details class="slot-probe" label="Panel">Content</c2-details></c2-accordion>')
  await page.locator('.slot-probe').evaluate((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)'))
  await expect(page.locator('.slot-probe')).toHaveCSS('color', 'rgb(1, 2, 3)')
})
test('opening one disclosure closes its sibling', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-accordion>${panels}</c2-accordion>`)
  await page.locator('summary').nth(0).click()
  await page.locator('summary').nth(1).click()
  await shown(page.getByText('First panel', { exact: true })).toBe(false)
  await expect(page.getByText('Second panel', { exact: true })).toBeVisible()
  await accessible(page)
})
test('multiple permits both panels and switching back enforces exclusivity', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-accordion multiple>${panels}</c2-accordion>`)
  await page.locator('summary').nth(0).click()
  await page.locator('summary').nth(1).click()
  await expect(page.getByText('First panel', { exact: true })).toBeVisible()
  await expect(page.getByText('Second panel', { exact: true })).toBeVisible()
  await props(page.locator('c2-accordion'), { multiple: false })
  await expect(page.locator('c2-details[expanded]')).toHaveCount(1)
})
