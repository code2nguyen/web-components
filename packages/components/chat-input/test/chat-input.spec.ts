import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

test('typing publishes value and Enter submits exactly once then clears', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input aria-label="Message" placeholder="Write a message"></c2-chat-input>')
  const host = page.locator('c2-chat-input')
  await watch(host, 'submit-message')
  await expect.poll(() => page.getByRole('textbox').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(20)
  await page.getByRole('textbox').focus()
  await expect(page.getByRole('textbox')).toBeFocused()
  await page.getByRole('textbox').fill('Hello')
  await expect(host).toHaveJSProperty('value', 'Hello')
  await expect
    .poll(() =>
      page.getByRole('textbox').evaluate((element) => {
        const style = getComputedStyle(element)
        return style.caretColor === style.color
      }),
    )
    .toBe(true)
  await page.getByRole('textbox').press('Enter')
  await expect(host).toHaveAttribute('data-events', '["Hello"]')
  await expect(page.getByRole('textbox')).toHaveValue('')
  await expect(page.getByRole('textbox')).toBeFocused()
  await accessible(page)
})
test('Shift+Enter and Alt+Enter insert newlines without submitting', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input aria-label="Message"></c2-chat-input>')
  const input = page.getByRole('textbox')
  await watch(page.locator('c2-chat-input'), 'submit-message')
  await input.fill('First')
  await input.press('Shift+Enter')
  await input.pressSequentially('Second')
  await input.press('Alt+Enter')
  await input.pressSequentially('Third')
  await expect(input).toHaveValue('First\nSecond\nThird')
  await expect(page.locator('c2-chat-input')).toHaveAttribute('data-events', '[]')
})
test('send button submits while empty messages and canceled submissions are preserved', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input aria-label="Message"></c2-chat-input>')
  const host = page.locator('c2-chat-input')
  const input = page.getByRole('textbox')
  const send = page.getByRole('button', { name: 'Send message' })
  await expect(send).toBeDisabled()
  await input.fill('   ')
  await expect(send).toBeDisabled()
  await input.fill('Keep this draft')
  await expect(send).toBeEnabled()
  await host.evaluate((element) => element.addEventListener('submit-message', (event) => event.preventDefault(), { once: true }))
  await send.click()
  await expect(input).toHaveValue('Keep this draft')
  await send.click()
  await expect(input).toHaveValue('')
})
test('does not submit Enter while an IME composition is active', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input value="Composing" aria-label="Message"></c2-chat-input>')
  const host = page.locator('c2-chat-input')
  await watch(host, 'submit-message')
  await page.getByRole('textbox').dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  await expect(host).toHaveAttribute('data-events', '[]')
  await expect(page.getByRole('textbox')).toHaveValue('Composing')
})
test('can use Enter as a regular newline in newline mode', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input enter-behavior="newline" aria-label="Message"></c2-chat-input>')
  const host = page.locator('c2-chat-input')
  const input = page.getByRole('textbox')
  await watch(host, 'submit-message')
  await input.fill('First')
  await input.press('Enter')
  await input.pressSequentially('Second')
  await expect(input).toHaveValue('First\nSecond')
  await expect(host).toHaveAttribute('data-events', '[]')
})
test('grows for multiline and programmatic values, then shrinks after submission', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input style="width: 280px" aria-label="Message"></c2-chat-input>')
  const host = page.locator('c2-chat-input')
  const input = page.getByRole('textbox')
  const initialHeight = await input.evaluate((element) => element.getBoundingClientRect().height)
  await host.evaluate(async (element) => {
    const chatInput = element as HTMLElement & { value: string; updateComplete: Promise<boolean> }
    chatInput.value = 'One\nTwo\nThree\nFour'
    await chatInput.updateComplete
  })
  await expect.poll(() => input.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(initialHeight)
  await input.press('Enter')
  await expect.poll(() => input.evaluate((element) => element.getBoundingClientRect().height)).toBe(initialHeight)
  await host.evaluate(async (element) => {
    const chatInput = element as HTMLElement & { value: string; updateComplete: Promise<boolean> }
    chatInput.style.setProperty('--c2-chat-input__textarea--max-height', '60px')
    chatInput.value = Array.from({ length: 20 }, (_, index) => `Line ${index + 1}`).join('\n')
    await chatInput.updateComplete
  })
  await expect.poll(() => input.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThanOrEqual(60)
  await expect.poll(() => input.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
})
test('renders toolbar actions and a custom send icon', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-chat-input value="Ready" aria-label="Message">
      <button slot="toolbar" type="button" aria-label="Attach file">Attach</button>
      <svg slot="send-icon" data-testid="custom-send-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h20"></path></svg>
    </c2-chat-input>
  `)
  await expect(page.getByRole('button', { name: 'Attach file' })).toBeVisible()
  await expect(page.locator('[part="toolbar"]')).toBeVisible()
  await expect(page.getByTestId('custom-send-icon')).toBeVisible()
  await accessible(page)
})
test('input edits mark the value dirty even without a keyboard event', async ({ page, renderScenario }) => {
  await renderScenario('<c2-chat-input value="Original" aria-label="Message"></c2-chat-input>')
  await page.getByRole('textbox').fill('Pasted')
  await page.locator('c2-chat-input').evaluate((el) => el.setAttribute('value', 'Replacement'))
  await expect(page.getByRole('textbox')).toHaveValue('Pasted')
})
test('participates in forms, validates required and resets its initial value', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-chat-input name="message" value="Draft" required aria-label="Message"></c2-chat-input></form>')
  const host = page.locator('c2-chat-input')
  const input = page.getByRole('textbox')
  const form = page.locator('form')
  await input.fill('Ready to send')
  await expect.poll(() => form.evaluate((element) => new FormData(element as HTMLFormElement).get('message'))).toBe('Ready to send')
  await input.fill('')
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(input).toHaveValue('Draft')
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})
test('fieldset disabled state prevents chat input submission', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset disabled><c2-chat-input name="message" value="Draft" aria-label="Message"></c2-chat-input></fieldset></form>')
  await expect(page.getByRole('textbox')).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((element) => new FormData(element as HTMLFormElement).has('message'))).toBe(false)
})
