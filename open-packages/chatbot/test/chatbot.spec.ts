import { test, expect, accessible } from '../../../tests/component-fixture'

// The open package currently implements only the static chat shell.
test('renders its header and registers the composed avatar from source', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chatbot></c2-chatbot>')
  await expect(page.getByRole('img', { name: 'Elisa Jasmin' })).toHaveText('EJ')
  await expect(page.locator('.c2-chatbot__header-container')).toContainText('Elisa Jasmin')
  await accessible(page)
})
test('the shell can be detached and reattached without duplicate content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chatbot></c2-chatbot>')
  await page.locator('c2-chatbot').evaluate((el) => {
    const parent = el.parentElement!
    el.remove()
    parent.append(el)
  })
  await expect(page.locator('c2-avatar')).toHaveCount(1)
  await expect(page.locator('.c2-chatbot__input-container')).toBeAttached()
})

test('the default slot projects conversation content into the public messages region', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chatbot class="support-chat"><p class="message">How can we help?</p></c2-chatbot>')
  await page.addStyleTag({
    content: '.support-chat::part(messages){padding:18px;background-color:rgb(239,246,255)}',
  })

  const message = page.locator('.message')
  const region = page.locator('c2-chatbot').locator('[part="messages"]')
  await expect(message).toBeVisible()
  await expect(message).toHaveText('How can we help?')
  await expect.poll(() => message.evaluate((node) => node.assignedSlot?.name)).toBe('')
  await expect(region).toHaveCSS('padding', '18px')
  await expect(region).toHaveCSS('background-color', 'rgb(239, 246, 255)')
  await accessible(page)
})
