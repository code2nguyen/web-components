import { test as base, expect } from '../../../../tests/component-fixture'

export const test = base.extend<{ scenario: (name?: string) => Promise<void> }>({
  scenario: async ({ page }, use) => {
    await use(async (name = 'default') => {
      await page.goto(`/packages/components/diff-viewer/test/scenarios.html?scenario=${encodeURIComponent(name)}`)
      await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
    })
  },
})
export { expect, accessible } from '../../../../tests/component-fixture'
