import { test, expect, accessible } from '../../../../tests/component-fixture'

test('message, author, time and actions remain in their slots', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-chat-message><span slot="title">Ada</span><time slot="header-time">10:30</time><p slot="message">Hello there</p><button slot="emotion">Like</button></c2-chat-message>',
  )
  await expect(page.getByText('Ada', { exact: true })).toBeVisible()
  await expect(page.getByText('10:30', { exact: true })).toBeVisible()
  await expect(page.getByText('Hello there', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Like' }).click()
  await accessible(page)
})
test('new slotted text updates the displayed message', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-message><p slot="message">Streaming</p></c2-chat-message>')
  await page.locator('[slot="message"]').evaluate((el) => (el.textContent = 'Complete response'))
  await expect(page.getByText('Complete response', { exact: true })).toBeVisible()
})
