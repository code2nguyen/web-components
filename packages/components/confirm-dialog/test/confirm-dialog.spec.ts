import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

/** Globals the scenarios share with the page: the `confirm()` helper and the hand-settled action. */
type TestWindow = Window & { c2Confirm: (options: object) => Promise<boolean>; settle: (ok: boolean) => void }

/** Opens the dialog from a launcher button, the way an app does, and records the answer `show()` resolves with. */
async function launch(page: Page) {
  await page.locator('#launch').evaluate((button) =>
    button.addEventListener('click', async () => {
      const dialog = document.querySelector('c2-confirm-dialog') as HTMLElement & { show(): Promise<boolean> }
      const answer = await dialog.show()
      button.dataset.answer = String(answer)
    }),
  )
  await page.getByRole('button', { name: 'Launch' }).click()
}

const markup = (attributes = 'confirm-label="Publish"') => `
  <button id="launch">Launch</button>
  <c2-confirm-dialog heading="Publish changes?" message="Everyone with the link will see them." ${attributes}></c2-confirm-dialog>`

test('show resolves true when the user confirms, as a labelled and described alertdialog', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = page.locator('c2-confirm-dialog')
  await watch(host, 'close')
  await launch(page)

  const dialog = page.getByRole('alertdialog', { name: 'Publish changes?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription('Everyone with the link will see them.')
  await expect(page.getByRole('button', { name: 'Publish' })).toBeFocused()
  await accessible(page)

  await page.keyboard.press('Enter')
  await expect(page.locator('#launch')).toHaveAttribute('data-answer', 'true')
  await expect(host).toHaveAttribute('data-events', '[{"confirmed":true}]')
  await expect(dialog).toBeHidden()
  await expect(host).not.toHaveAttribute('open')
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused()
})

test('destructive focuses Cancel first, so Enter cancels', async ({ page, renderScenario }) => {
  await renderScenario(markup('destructive confirm-label="Delete"'))
  const host = page.locator('c2-confirm-dialog')
  await watch(host, 'cancel')
  await launch(page)

  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Delete' })).toHaveCSS('background-color', 'rgb(220, 38, 38)')
  await accessible(page)
  await page.keyboard.press('Enter')
  await expect(page.locator('#launch')).toHaveAttribute('data-answer', 'false')
  await expect(host).toHaveAttribute('data-events', '[null]')
})

test('Escape cancels, a click on the backdrop does not', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()

  await page.mouse.click(4, 4)
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#launch')).toHaveAttribute('data-answer', 'false')
  await expect(dialog).toBeHidden()
})

test('preventing confirm keeps the dialog open', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await page.locator('c2-confirm-dialog').evaluate((dialog) => dialog.addEventListener('confirm', (event) => event.preventDefault()))
  await launch(page)
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(page.locator('#launch')).not.toHaveAttribute('data-answer')
})

test('confirmAction keeps the dialog busy until it settles and open when it fails', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  const host = page.locator('c2-confirm-dialog')
  await watch(host, 'confirm-error')
  // The test settles each run of the action by hand through `window.settle`.
  await host.evaluate((element) => {
    const win = window as unknown as TestWindow
    ;(element as HTMLElement & { confirmAction: () => Promise<void> }).confirmAction = () =>
      new Promise<void>((resolve, reject) => (win.settle = (ok) => (ok ? resolve() : reject(new Error('Network down')))))
  })
  await launch(page)
  const confirmButton = page.getByRole('button', { name: 'Publish' })
  await confirmButton.click()
  await expect(confirmButton).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toBeVisible()

  await page.evaluate(() => (window as unknown as TestWindow).settle(false))
  await expect(confirmButton).not.toHaveAttribute('aria-busy', 'true')
  await expect(host).toHaveAttribute('data-events', /Network down|\{"error":\{\}\}/)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await expect(confirmButton).toBeFocused()

  await confirmButton.click()
  await expect(confirmButton).toHaveAttribute('aria-busy', 'true')
  await page.evaluate(() => (window as unknown as TestWindow).settle(true))
  await expect(page.locator('#launch')).toHaveAttribute('data-answer', 'true')
  await expect(page.getByRole('alertdialog')).toBeHidden()
})

test('removing the open attribute answers false', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.locator('c2-confirm-dialog').evaluate((dialog) => dialog.removeAttribute('open'))
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.locator('#launch')).toHaveAttribute('data-answer', 'false')
})

test('slots replace the heading and message', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-confirm-dialog open destructive confirm-label="Delete">
      <svg slot="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"></circle></svg>
      <span slot="heading">Delete <strong>web-components</strong>?</span>
      <p>The repository and its 243 pull requests are removed for everyone.</p>
    </c2-confirm-dialog>`)
  const dialog = page.getByRole('alertdialog', { name: 'Delete web-components?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription('The repository and its 243 pull requests are removed for everyone.')
  await expect(page.locator('svg[slot="icon"]')).toHaveCSS('color', 'rgb(220, 38, 38)')
  await accessible(page)
})

test('confirm() mounts a temporary dialog, resolves with the answer and removes it', async ({ page, renderScenario }) => {
  await renderScenario('<p>Page</p>')
  const answer = page.evaluate(() =>
    (window as unknown as TestWindow).c2Confirm({
      heading: 'Leave without saving?',
      confirmLabel: 'Leave',
      destructive: true,
    }),
  )
  await expect(page.getByRole('alertdialog', { name: 'Leave without saving?' })).toBeVisible()
  await page.getByRole('button', { name: 'Leave' }).click()
  expect(await answer).toBe(true)
  await expect(page.locator('c2-confirm-dialog')).toHaveCount(0)
})
