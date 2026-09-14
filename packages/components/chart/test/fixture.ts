import { expect } from '@playwright/test'
import { test as base } from '../../../../tests/fixture'

// Pulls in the `window.chartScenario` declaration the scenario page installs.
import './scenario-api'

/**
 * Opens a scenario and waits for it to settle. A chart's engine arrives through a dynamic import, so the
 * page flags itself only once every chart has drawn (or reported that it never will).
 */
export const test = base.extend<{ scenario: (name?: string) => Promise<void> }>({
  scenario: async ({ page }, use) => {
    await use(async (name = 'default') => {
      await page.goto(`/packages/components/chart/test/scenarios.html?scenario=${encodeURIComponent(name)}`)
      await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
    })
  },
})
export { expect } from '@playwright/test'
