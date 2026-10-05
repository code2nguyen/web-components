import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

const field = (attributes = '', children = '') => `<c2-inline-edit label="Project name" value="Apollo" ${attributes}>${children}</c2-inline-edit>`

const events = async (page: import('@playwright/test').Page) => JSON.parse((await page.locator('c2-inline-edit').getAttribute('data-events')) ?? '[]')

test('a click opens the field with the text selected, and Enter commits', async ({ page, renderScenario }) => {
  await renderScenario(field())
  const host = page.locator('c2-inline-edit')
  await watch(host, 'edit-commit')
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  const input = page.getByRole('textbox', { name: 'Project name' })
  await expect(input).toBeFocused()
  await expect(host).toHaveState('editing')
  await page.keyboard.type('Gemini')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Project name: Gemini' })).toBeFocused()
  await expect(host).not.toHaveState('editing')
  expect(await host.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('Gemini')
  expect(await events(page)).toEqual([{ value: 'Gemini', previousValue: 'Apollo' }])
})

test('Escape discards the draft and fires edit-cancel', async ({ page, renderScenario }) => {
  await renderScenario(field())
  const host = page.locator('c2-inline-edit')
  await watch(host, 'edit-cancel')
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Gemini')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeFocused()
  expect(await events(page)).toEqual([null])
})

test('opens from the keyboard and returns focus to the read view', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<a href="#">Before</a>${field()}`)
  await page.getByRole('link', { name: 'Before' }).focus()
  await tab()
  const display = page.getByRole('button', { name: 'Project name: Apollo' })
  await expect(display).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(display).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeFocused()
})

test('fires input and change once per committed change, never while typing', async ({ page, renderScenario }) => {
  await renderScenario(field())
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Zeus')
  await expect(page.locator('main')).toHaveAttribute('data-log', '')
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;change;')
  // An unchanged commit fires nothing.
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;change;')
})

test('leaving the field commits by default and cancels with blur-action="cancel"', async ({ page, renderScenario }) => {
  await renderScenario(`${field()}<c2-inline-edit label="Owner" value="Ada" blur-action="cancel"></c2-inline-edit><a href="#">Outside</a>`)
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Gemini')
  await page.getByRole('link', { name: 'Outside' }).click()
  await expect(page.getByRole('button', { name: 'Project name: Gemini' })).toBeVisible()

  await page.getByRole('button', { name: 'Owner: Ada' }).click()
  await page.keyboard.type('Grace')
  await page.getByRole('link', { name: 'Outside' }).click()
  await expect(page.getByRole('button', { name: 'Owner: Ada' })).toBeVisible()
})

test('a canceled edit-commit keeps the editor open with the draft', async ({ page, renderScenario }) => {
  await renderScenario(field())
  await page.locator('c2-inline-edit').evaluate((element) =>
    element.addEventListener('edit-commit', (event) => {
      if ((event as CustomEvent<{ value: string }>).detail.value.length < 3) event.preventDefault()
    }),
  )
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Io')
  await page.keyboard.press('Enter')
  const input = page.getByRole('textbox', { name: 'Project name' })
  await expect(input).toHaveValue('Io')
  await expect(input).toBeFocused()
  await page.keyboard.type('n')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Project name: Ion' })).toBeFocused()
})

test('required refuses an empty draft and marks the field invalid', async ({ page, renderScenario }) => {
  await renderScenario(field('required'))
  const host = page.locator('c2-inline-edit')
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  const input = page.getByRole('textbox', { name: 'Project name' })
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(host).toHaveState('invalid')
  await page.keyboard.type('B')
  await expect(input).not.toHaveAttribute('aria-invalid')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Project name: B' })).toBeVisible()
})

test('multiline: Enter adds a line, Ctrl+Enter commits, and the read view keeps the break', async ({ page, renderScenario }) => {
  await renderScenario('<c2-inline-edit label="Notes" value="One" multiline></c2-inline-edit>')
  await page.getByRole('button', { name: 'Notes: One' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Two')
  await expect(page.getByRole('textbox', { name: 'Notes' })).toHaveValue('One\nTwo')
  await page.keyboard.press('Control+Enter')
  const display = page.locator('c2-inline-edit').getByRole('button')
  await expect(display).toBeFocused()
  await expect(display).toHaveText('One\nTwo')
})

test('a slotted select is the editor: its value is set, a choice commits, and the read view shows the label', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-inline-edit label="Priority" value="low">
    <select slot="editor" aria-label="Priority"><option value="low">Low</option><option value="high">High</option></select>
  </c2-inline-edit>`)
  const host = page.locator('c2-inline-edit')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    main.addEventListener('change', (event) => (main.dataset.log += `${(event.target as Element).localName};`))
  })
  await expect(page.getByRole('button', { name: 'Priority: Low' })).toBeVisible()
  await expect(page.getByRole('combobox')).toBeHidden()
  await page.getByRole('button', { name: 'Priority: Low' }).click()
  const select = page.getByRole('combobox', { name: 'Priority' })
  await expect(select).toBeFocused()
  await expect(select).toHaveValue('low')
  await select.selectOption('high')
  await expect(page.getByRole('button', { name: 'Priority: High' })).toBeVisible()
  expect(await host.evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('high')
  // The select's own change stays inside; only the host's reaches the page.
  await expect(page.locator('main')).toHaveAttribute('data-log', 'c2-inline-edit;')
})

test('activation="dblclick" ignores a single click', async ({ page, renderScenario }) => {
  await renderScenario(field('activation="dblclick"'))
  const display = page.getByRole('button', { name: 'Project name: Apollo' })
  await display.click()
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await display.dblclick()
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeFocused()
})

test('controls: save commits and cancel discards', async ({ page, renderScenario }) => {
  await renderScenario(field('controls'))
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Gemini')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.type('Gemini')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: 'Project name: Gemini' })).toBeFocused()
})

test('disabled and readonly cannot be edited', async ({ page, renderScenario }) => {
  await renderScenario(`${field('disabled')}<c2-inline-edit label="Owner" value="Ada" readonly></c2-inline-edit>`)
  const display = page.getByRole('button', { name: 'Project name: Apollo' })
  await expect(display).toBeDisabled()
  await pointerClick(display)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.locator('c2-inline-edit').first()).toHaveState('disabled')
  await expect(page.getByRole('button', { name: /Owner/ })).toHaveCount(0)
  await expect(page.getByText('Ada')).toBeVisible()
  expect(
    await page
      .locator('c2-inline-edit')
      .nth(1)
      .evaluate((element) => (element as HTMLElement & { edit(): boolean }).edit()),
  ).toBe(false)
})

test('the placeholder shows while the value is empty', async ({ page, renderScenario }) => {
  await renderScenario('<c2-inline-edit label="Title" placeholder="Untitled"></c2-inline-edit>')
  await expect(page.locator('c2-inline-edit')).toHaveState('empty')
  await page.getByRole('button', { name: 'Title: Untitled' }).click()
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveAttribute('placeholder', 'Untitled')
})

test('submits the committed value with its form and resets to the authored one', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${field('name="project"')}<button type="reset">Reset</button></form>`)
  const read = () => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('project'))
  expect(await read()).toBe('Apollo')
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Gemini')
  expect(await read()).toBe('Apollo')
  await page.keyboard.press('Enter')
  expect(await read()).toBe('Gemini')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeVisible()
})

test('the editing property opens and closes the editor', async ({ page, renderScenario }) => {
  await renderScenario(field())
  const host = page.locator('c2-inline-edit')
  await props(host, { editing: true })
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Apollo')
  await props(host, { editing: false })
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeVisible()
})

test('has no axe violations in either mode', async ({ page, renderScenario }) => {
  await renderScenario(`${field()}<c2-inline-edit label="Notes" value="Text" multiline controls></c2-inline-edit>`)
  await accessible(page)
  await page.getByRole('button', { name: 'Notes: Text' }).click()
  await accessible(page)
})

test('a slotted c2-select commits on pick and the read view shows the option label', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-inline-edit label="Status" value="todo">
    <c2-select slot="editor" aria-label="Status"><c2-list-item value="todo">To do</c2-list-item><c2-list-item value="doing">In progress</c2-list-item></c2-select>
  </c2-inline-edit>`)
  const host = page.locator('c2-inline-edit')
  await page.getByRole('button', { name: 'Status: To do' }).click()
  await expect(page.locator('c2-select')).toHaveJSProperty('value', ['todo'])
  await page.getByRole('button', { name: 'Status' }).click()
  await page.locator('c2-list-item', { hasText: 'In progress' }).click()
  await expect(page.getByRole('button', { name: 'Status: In progress' })).toBeVisible()
  await expect(host).toHaveJSProperty('value', 'doing')
  await expect(host).not.toHaveState('editing')
})
