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

test('accepts natural message content in the default slot', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-message><p>A message without slot boilerplate</p></c2-chat-message>')
  await expect(page.getByText('A message without slot boilerplate', { exact: true })).toBeVisible()
  await accessible(page)
})

test('reflects programmatic alignment and exposes layout parts', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-message><span slot="avatar">AI</span><span slot="message">Answer</span></c2-chat-message>')
  const message = page.locator('c2-chat-message')

  await message.evaluate((element) => ((element as HTMLElement & { align: string }).align = 'right'))
  await expect(message).toHaveAttribute('align', 'right')
  await expect(message.locator('[part="base"]')).toHaveCSS('flex-direction', 'row-reverse')
  await expect(message.locator('[part="content"]')).toBeVisible()
  await expect(page.getByText('Answer', { exact: true })).toBeVisible()
})

test('removes empty optional regions without hiding content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-message>Only the answer</c2-chat-message>')
  const message = page.locator('c2-chat-message')

  await expect(message.locator('[part="header"]')).toBeHidden()
  await expect(message.locator('[part="footer"]')).toBeHidden()
  await expect(page.getByText('Only the answer', { exact: true })).toBeVisible()
})
