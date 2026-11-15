import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

/** What the scenarios share with the page: the `confirm()` and `prompt()` helpers. */
type TestWindow = Window & {
  c2Confirm: (options: object) => Promise<boolean>
  c2Prompt: (options: object) => Promise<string | null>
}

type PromptHost = HTMLElement & {
  prompt(options?: object): Promise<unknown>
  show(): Promise<boolean>
}

/** Opens the dialog from a launcher button, the way an app does, and records the answer as JSON on the button. */
async function launch(page: Page, options?: object | 'show') {
  await page.locator('#launch').evaluate((button, options) => {
    button.addEventListener('click', async () => {
      const dialog = document.querySelector('c2-confirm-dialog') as PromptHost
      // A prompt's `validate` cannot cross from the test; the scenario reads it from the page.
      const validate = (window as unknown as { validate?: unknown }).validate
      const answer = options === 'show' ? await dialog.show() : await dialog.prompt({ ...(options ?? {}), ...(validate ? { validate } : {}) })
      button.dataset.answer = JSON.stringify(answer)
    })
  }, options)
  await page.getByRole('button', { name: 'Launch' }).click()
}

const answer = (page: Page) => page.locator('#launch')

test('a plain confirmation does not load the fields or the text field', async ({ page, renderScenario }) => {
  await renderScenario(`<button id="launch">Launch</button><c2-confirm-dialog heading="Publish?" confirm-label="Publish"></c2-confirm-dialog>`)
  await launch(page, 'show')
  await expect(page.getByRole('button', { name: 'Publish' })).toBeFocused()
  expect(await page.evaluate(() => !!customElements.get('c2-text-field'))).toBe(false)
  await page.keyboard.press('Enter')
  await expect(answer(page)).toHaveAttribute('data-answer', 'true')
})

test.describe('typed confirmation', () => {
  const markup = `
    <button id="launch">Launch</button>
    <c2-confirm-dialog destructive heading="Delete repository?" message="Its issues and pull requests are removed." confirm-label="Delete" confirm-text="acme/web"></c2-confirm-dialog>`

  test('the confirm button stays disabled until the phrase is typed', async ({ page, renderScenario }) => {
    await renderScenario(markup)
    await launch(page, 'show')

    const dialog = page.getByRole('alertdialog', { name: 'Delete repository?' })
    const field = page.getByRole('textbox', { name: 'Type acme/web to confirm' })
    const remove = page.getByRole('button', { name: 'Delete' })
    await expect(field).toBeFocused()
    await expect(remove).toBeDisabled()
    await accessible(page)

    await page.keyboard.type('acme/we')
    await expect(remove).toBeDisabled()
    // Enter before the phrase matches does nothing.
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(answer(page)).not.toHaveAttribute('data-answer')

    await page.keyboard.type('b ')
    await expect(remove).toBeEnabled()
    await page.keyboard.press('Enter')
    await expect(answer(page)).toHaveAttribute('data-answer', 'true')
    await expect(dialog).toBeHidden()
  })

  test('Tab reaches Cancel and the enabled confirm button; reopening clears the typed text', async ({ page, renderScenario, tab }) => {
    await renderScenario(markup)
    await launch(page, 'show')
    const dialog = page.getByRole('alertdialog')
    const field = page.getByRole('textbox', { name: 'Type acme/web to confirm' })
    await expect(field).toBeFocused()
    await page.keyboard.type('acme/web')
    await tab()
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused()
    await tab()
    await expect(page.getByRole('button', { name: 'Delete' })).toBeFocused()
    await tab(true)
    await page.keyboard.press('Enter')
    await expect(answer(page)).toHaveAttribute('data-answer', 'false')
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Launch' }).click()
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  test('the instruction follows the nearest lang', async ({ page, renderScenario }) => {
    await renderScenario(`
      <div lang="fr"><button id="launch">Launch</button>
        <c2-confirm-dialog heading="Supprimer ?" confirm-label="Supprimer" confirm-text="prod"></c2-confirm-dialog></div>`)
    await launch(page, 'show')
    await expect(page.getByRole('textbox', { name: 'Saisissez prod pour confirmer' })).toBeFocused()
    await expect(page.getByText('Saisissez prod pour confirmer')).toBeVisible()
  })

  test('confirm() takes the phrase too', async ({ page, renderScenario }) => {
    await renderScenario('<p>Page</p>')
    const result = page.evaluate(() => (window as unknown as TestWindow).c2Confirm({ heading: 'Drop table?', confirmLabel: 'Drop', confirmText: 'users' }))
    const field = page.getByRole('textbox', { name: 'Type users to confirm' })
    await expect(field).toBeFocused()
    await field.fill('users')
    await page.getByRole('button', { name: 'Drop' }).click()
    expect(await result).toBe(true)
    await expect(page.locator('c2-confirm-dialog')).toHaveCount(0)
  })
})

test.describe('prompt', () => {
  const markup = `
    <button id="launch">Launch</button>
    <c2-confirm-dialog heading="Rename file" message="The link keeps working." confirm-label="Rename"></c2-confirm-dialog>`

  test('resolves with the typed value; the initial value is selected', async ({ page, renderScenario }) => {
    await renderScenario(markup)
    const host = page.locator('c2-confirm-dialog')
    await watch(host, 'close')
    await launch(page, { label: 'File name', value: 'report.pdf' })

    const dialog = page.getByRole('alertdialog', { name: 'Rename file' })
    const field = page.getByRole('textbox', { name: 'File name' })
    await expect(field).toBeFocused()
    await expect(field).toHaveValue('report.pdf')
    await accessible(page)

    // The whole value is selected, so typing replaces it.
    await page.keyboard.type('q3-report.pdf')
    await page.keyboard.press('Enter')
    await expect(answer(page)).toHaveAttribute('data-answer', '"q3-report.pdf"')
    await expect(host).toHaveAttribute('data-events', '[{"confirmed":true}]')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused()
  })

  test('resolves null on Cancel and on Escape', async ({ page, renderScenario }) => {
    await renderScenario(markup)
    await launch(page, { value: 'a.txt' })
    const dialog = page.getByRole('alertdialog')
    // With no label, the heading names the field.
    await expect(page.getByRole('textbox', { name: 'Rename file' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(answer(page)).toHaveAttribute('data-answer', 'null')
    await expect(dialog).toBeHidden()

    await page.getByRole('button', { name: 'Launch' }).click()
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(answer(page)).toHaveAttribute('data-answer', 'null')
  })

  test('a required field keeps the dialog open with an error until it is filled', async ({ page, renderScenario }) => {
    await renderScenario(markup)
    await launch(page, { label: 'File name', required: true })
    const dialog = page.getByRole('alertdialog')
    const field = page.getByRole('textbox', { name: 'File name' })

    await page.getByRole('button', { name: 'Rename' }).click()
    await expect(dialog).toBeVisible()
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('aria-invalid', 'true')
    await expect(field).toHaveAccessibleDescription('Error: Fill in this field.')
    await expect(page.locator('c2-confirm-dialog [part="error"]')).toBeVisible()
    // Said by the live region too, for an Enter that leaves the focus where it is.
    await expect(page.locator('c2-confirm-dialog [aria-live="polite"]')).toHaveText('Fill in this field.')
    await accessible(page)

    // The error follows the value once shown.
    await page.keyboard.type('notes.md')
    await expect(page.locator('c2-confirm-dialog [part="error"]')).toBeHidden()
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Enter')
    await expect(answer(page)).toHaveAttribute('data-answer', '"notes.md"')
  })

  test('validate shows its message and spins the button while it is pending', async ({ page, renderScenario }) => {
    await renderScenario(markup)
    await page.evaluate(() => {
      const win = window as unknown as { validate: (value: string) => Promise<string | null>; release: () => void }
      win.validate = (value) => new Promise((resolve) => (win.release = () => resolve(value.includes('/') ? 'A file name cannot contain a slash.' : null)))
    })
    await launch(page, { label: 'File name', value: 'a/b' })
    const rename = page.getByRole('button', { name: 'Rename' })
    const field = page.getByRole('textbox', { name: 'File name' })

    await expect(field).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(rename).toHaveAttribute('aria-busy', 'true')
    await page.evaluate(() => (window as unknown as { release: () => void }).release())
    await expect(rename).not.toHaveAttribute('aria-busy', 'true')
    await expect(field).toHaveAccessibleDescription('Error: A file name cannot contain a slash.')
    await expect(field).toBeFocused()

    // Editing clears the error; `validate` runs again on the next confirm only.
    await field.fill('a-b')
    await expect(field).not.toHaveAttribute('aria-invalid', 'true')
    await page.keyboard.press('Enter')
    await expect(rename).toHaveAttribute('aria-busy', 'true')
    await page.evaluate(() => (window as unknown as { release: () => void }).release())
    await expect(answer(page)).toHaveAttribute('data-answer', '"a-b"')
  })

  test('a control in the input slot is named, validated and read', async ({ page, renderScenario }) => {
    await renderScenario(`
      <button id="launch">Launch</button>
      <c2-confirm-dialog heading="Move 3 tasks" input-label="Board" confirm-label="Move">
        <c2-select slot="input" required>
          <c2-list-item value="roadmap">Roadmap</c2-list-item>
          <c2-list-item value="design">Design</c2-list-item>
        </c2-select>
      </c2-confirm-dialog>`)
    await launch(page)
    const dialog = page.getByRole('alertdialog', { name: 'Move 3 tasks' })
    const select = page.getByRole('button', { name: 'Board' })
    await expect(select).toBeFocused()
    await accessible(page)

    await page.getByRole('button', { name: 'Move' }).click()
    await expect(dialog).toBeVisible()
    await expect(select).toHaveAccessibleDescription(/^Error: /)

    await select.click()
    await page.locator('c2-list-item', { hasText: 'Design' }).click()
    await expect(select).not.toHaveAccessibleDescription(/Error/)
    await page.getByRole('button', { name: 'Move' }).click()
    await expect(answer(page)).toHaveAttribute('data-answer', '["design"]')
  })

  test('show() on a dialog that prompted before shows no built-in field', async ({ page, renderScenario }) => {
    await renderScenario(markup)
    await launch(page, { label: 'File name' })
    const dialog = page.getByRole('alertdialog')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    await page.locator('c2-confirm-dialog').evaluate((element) => void (element as PromptHost).show())
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Rename' })).toBeFocused()
  })

  test('prompt() mounts a temporary dialog and resolves with the value', async ({ page, renderScenario }) => {
    await renderScenario('<p>Page</p>')
    const result = page.evaluate(() =>
      (window as unknown as TestWindow).c2Prompt({ heading: 'New folder', label: 'Folder name', placeholder: 'Untitled', confirmLabel: 'Create' }),
    )
    const field = page.getByRole('textbox', { name: 'Folder name' })
    await expect(field).toBeFocused()
    await expect(field).toHaveAttribute('placeholder', 'Untitled')
    await page.keyboard.type('Invoices')
    await page.getByRole('button', { name: 'Create' }).click()
    expect(await result).toBe('Invoices')
    await expect(page.locator('c2-confirm-dialog')).toHaveCount(0)
  })
})
