import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

test('typing publishes value and Enter submits exactly once then clears', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input aria-label="Message" placeholder="Write a message"></c2-chat-input>')
  const host = page.locator('c2-chat-input')
  await watch(host, 'submit-message')
  await page.getByRole('textbox').fill('Hello')
  await expect(host).toHaveJSProperty('value', 'Hello')
  await page.getByRole('textbox').press('Enter')
  await expect(host).toHaveAttribute('data-events', '["Hello"]')
  await expect(page.getByRole('textbox')).toHaveValue('')
  await accessible(page)
})
test('Alt+Enter inserts a newline without submitting', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input aria-label="Message"></c2-chat-input>')
  const input = page.getByRole('textbox')
  await watch(page.locator('c2-chat-input'), 'submit-message')
  await input.fill('First')
  await input.press('Alt+Enter')
  await input.pressSequentially('Second')
  await expect(input).toHaveValue('First\nSecond')
  await expect(page.locator('c2-chat-input')).toHaveAttribute('data-events', '[]')
})
test('input edits mark the value dirty even without a keyboard event', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input value="Original" aria-label="Message"></c2-chat-input>')
  await page.getByRole('textbox').fill('Pasted')
  await page.locator('c2-chat-input').evaluate((el) => el.setAttribute('value', 'Replacement'))
  await expect(page.getByRole('textbox')).toHaveValue('Pasted')
})
