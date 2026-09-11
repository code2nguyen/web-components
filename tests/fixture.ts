import { platform } from 'node:process'
import { test as base } from '@playwright/test'

export const test = base.extend<{ tab: (backward?: boolean) => Promise<void> }>({
  tab: async ({ page, browserName }, use) => {
    // Option+Tab includes buttons in macOS WebKit's default keyboard navigation.
    // https://support.apple.com/guide/safari/cpsh003/mac
    const key = browserName === 'webkit' && platform === 'darwin' ? 'Alt+Tab' : 'Tab'
    await use(async (backward = false) => {
      await page.keyboard.press(backward ? `Shift+${key}` : key)
    })
  },
})
