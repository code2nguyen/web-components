import { expect, test } from '@playwright/test'

test('search lists the conversations c2-highlight marks, ignoring accents', async ({ page }) => {
  await page.goto('./')

  const items = page.locator('.inbox__list c2-list-item')

  await page.locator('c2-text-field input').fill('bergstrom')
  await expect(items).toHaveCount(1)
  await expect(items.locator('mark')).toHaveText('Bergström')
})

test('stamps the list with c2-relative-time and the thread with c2-format-date', async ({ page }) => {
  await page.goto('./')

  await expect(page.locator('c2-list-item c2-relative-time').first().locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
  await expect(page.locator('c2-chat-message c2-format-date').first().locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/)
})

test('c2-form rejects a blank reply and sends a written one', async ({ page }) => {
  await page.goto('./')

  const messages = page.locator('c2-chat-message')
  const before = await messages.count()
  const send = page.locator('c2-button', { hasText: 'Send reply' })

  await page.locator('c2-textarea textarea').fill('   ')
  await send.click()
  await expect(page.getByText('Write a reply before sending.', { exact: true })).toBeVisible()
  await expect(messages).toHaveCount(before)

  await page.locator('c2-textarea textarea').fill('We have reset your session, please try again.')
  await send.click()
  await expect(messages).toHaveCount(before + 1)
  await expect(page.locator('c2-textarea textarea')).toHaveValue('')
  await expect(page.getByText('Write a reply before sending.', { exact: true })).toBeHidden()

  // The emptied composer reads as untouched: visiting it shows no "required" error, and the form is not dirty.
  await page.locator('c2-textarea textarea').focus()
  await page.locator('c2-textarea textarea').blur()
  const field = page.locator('.thread__composer c2-form-field')
  expect(await field.evaluate((el) => el.matches(':state(user-invalid)'))).toBe(false)
  expect(await page.locator('.thread__composer').evaluate((el) => el.matches(':state(dirty)'))).toBe(false)
})

test('Cmd+Enter sends the reply and empties the composer', async ({ page }) => {
  await page.goto('./')

  const messages = page.locator('c2-chat-message')
  const before = await messages.count()
  const textarea = page.locator('c2-textarea textarea')
  await textarea.fill('Thanks, closing this out.')
  await textarea.press('Meta+Enter')

  await expect(messages).toHaveCount(before + 1)
  await expect(textarea).toHaveValue('')
})
