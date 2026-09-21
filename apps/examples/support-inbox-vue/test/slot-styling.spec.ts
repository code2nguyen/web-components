import { expect, test } from '@playwright/test'

test('keeps Vue-scoped assigned styles separate from the public part and nested shadow root', async ({ page }) => {
  await page.goto('./')

  const message = page.locator('c2-chat-message').first()
  const assignedCopy = message.locator('.thread__message-copy')
  const contentRegion = message.locator('[part="content"]')
  const nestedAvatarSurface = message.locator('.thread__nested-avatar').locator('.c2-avatar')

  expect(await assignedCopy.evaluate((node) => Number.parseFloat(getComputedStyle(node).letterSpacing))).toBeGreaterThan(0)
  await expect(contentRegion).toHaveCSS('outline-style', 'solid')
  await expect(contentRegion).toHaveCSS('outline-width', '1px')
  await expect(nestedAvatarSurface).toHaveCSS('outline-style', 'none')

  expect(await assignedCopy.evaluate((node) => node.getAttributeNames().some((name) => name.startsWith('data-v-')))).toBe(true)
  expect(await contentRegion.evaluate((node) => node.getAttributeNames().some((name) => name.startsWith('data-v-')))).toBe(false)
})
