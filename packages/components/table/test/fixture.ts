import { expect } from '@playwright/test'
import { test as base } from '../../../../tests/fixture'

export const test = base.extend<{ bench: () => Promise<void> }>({
  bench: async ({ page }, use) => {
    await use(async () => {
      await page.goto('/packages/components/table/test/scenarios.html')
      await expect(page.locator('html')).toHaveAttribute('data-bench-ready', 'true')
    })
  },
})
export { expect } from '@playwright/test'

/** Rows the fixed 480px viewport holds, plus the default overscan on both sides. Used as the ceiling for the window. */
export const MAX_WINDOW_ROWS = Math.ceil(480 / 36) + 1 + 6 * 2

export const SMALL = 1_000
/** Above 8_200_000px of rows (220k at 37px), so the controller's capped-scroll path is covered too. */
export const HUGE = 250_000
