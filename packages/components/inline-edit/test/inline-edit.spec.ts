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
  expect(await read()).toBe('Apollo')
})

test('a disabled fieldset blocks editing and leaves the value out of the form', async ({ page, renderScenario }) => {
  await renderScenario(`<form><fieldset disabled>${field('name="project"')}</fieldset></form>`)
  const display = page.getByRole('button', { name: 'Project name: Apollo' })
  await expect(display).toBeDisabled()
  await pointerClick(display)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.locator('c2-inline-edit')).toHaveState('disabled')
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('project'))).toBe(false)
})

test('a name set as a property submits the value', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${field()}</form>`)
  await props(page.locator('c2-inline-edit'), { name: 'project' })
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('project'))).toBe('Apollo')
})

test('a value set as a property before connection is what form reset restores', async ({ page, renderScenario }) => {
  await renderScenario('<form></form><button type="button">Reset form</button>')
  await page.locator('form').evaluate(async (form) => {
    const element = document.createElement('c2-inline-edit') as HTMLElement & { value: string; label: string; updateComplete: Promise<boolean> }
    element.value = 'Apollo'
    element.label = 'Project name'
    form.append(element)
    await element.updateComplete
    element.value = 'Gemini'
    await element.updateComplete
    ;(form as HTMLFormElement).reset()
    await element.updateComplete
  })
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeVisible()
})

test('a veto while leaving the field keeps the draft open without taking focus back', async ({ page, renderScenario }) => {
  await renderScenario(`${field()}<a href="#">Outside</a>`)
  await page.locator('c2-inline-edit').evaluate((element) => element.addEventListener('edit-commit', (event) => event.preventDefault()))
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.type('Gemini')
  await page.getByRole('link', { name: 'Outside' }).click()
  await expect(page.getByRole('link', { name: 'Outside' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Project name' })).toHaveValue('Gemini')
})

test('disabling or making read-only while editing closes the editor without committing', async ({ page, renderScenario }) => {
  await renderScenario(field())
  const host = page.locator('c2-inline-edit')
  for (const change of [{ disabled: true }, { readOnly: true }]) {
    await props(host, { disabled: false, readOnly: false })
    await page.getByRole('button', { name: 'Project name: Apollo' }).click()
    await page.keyboard.type('Gemini')
    await props(host, change)
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(host).toHaveJSProperty('value', 'Apollo')
  }
})

test('a refused draft in a slotted editor is marked invalid on the control', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-inline-edit label="Priority" value="low" required>
    <select slot="editor" aria-label="Priority"><option value="">None</option><option value="low">Low</option></select>
  </c2-inline-edit>`)
  await page.getByRole('button', { name: 'Priority: Low' }).click()
  const select = page.getByRole('combobox', { name: 'Priority' })
  await select.selectOption('')
  await expect(select).toHaveAttribute('aria-invalid', 'true')
  await expect(page.locator('c2-inline-edit')).toHaveState('invalid')
  await select.selectOption('low')
  await expect(page.getByRole('button', { name: 'Priority: Low' })).toBeVisible()
  await expect(page.locator('select')).not.toHaveAttribute('aria-invalid')
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

test('a disabled property leaves the value out of the form and skips required validation', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-inline-edit label="Project name" name="project" required></c2-inline-edit></form>')
  const host = page.locator('c2-inline-edit')
  const read = () => page.locator('form').evaluate((form) => [new FormData(form as HTMLFormElement).has('project'), (form as HTMLFormElement).checkValidity()])
  expect(await read()).toEqual([true, false])
  await props(host, { disabled: true })
  expect(await read()).toEqual([false, true])
})

test('removing its own disabled attribute inside a disabled fieldset keeps it disabled', async ({ page, renderScenario }) => {
  await renderScenario(`<form><fieldset disabled>${field('name="project" disabled')}</fieldset></form>`)
  const host = page.locator('c2-inline-edit')
  await host.evaluate((element) => element.removeAttribute('disabled'))
  await expect(host).toHaveState('disabled')
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeDisabled()
})

test('disabling a refused draft clears the invalid state', async ({ page, renderScenario }) => {
  await renderScenario(field('required'))
  const host = page.locator('c2-inline-edit')
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  await expect(host).toHaveState('invalid')
  await props(host, { disabled: true })
  await expect(host).not.toHaveState('editing')
  await expect(host).not.toHaveState('invalid')
})

test('activation="none" opens from edit() and returns focus to the read view', async ({ page, renderScenario }) => {
  await renderScenario(field('activation="none"'))
  const host = page.locator('c2-inline-edit')
  await host.evaluate((element) => (element as HTMLElement & { edit(): boolean }).edit())
  await expect(page.getByRole('textbox', { name: 'Project name' })).toBeFocused()
  await page.keyboard.type('Gemini')
  await page.keyboard.press('Enter')
  await expect(host.locator('.display')).toBeFocused()
  await expect(host).toHaveJSProperty('value', 'Gemini')
})

test('rendered with editing set, a slotted editor shows the value and focus stays put', async ({ page, renderScenario }) => {
  await renderScenario(`<a href="#">Before</a><c2-inline-edit label="Priority" value="high" editing>
    <select slot="editor" aria-label="Priority"><option value="low">Low</option><option value="high">High</option></select>
  </c2-inline-edit>`)
  await page.getByRole('link', { name: 'Before' }).focus()
  const select = page.getByRole('combobox', { name: 'Priority' })
  await expect(select).toHaveValue('high')
  await expect(page.getByRole('link', { name: 'Before' })).toBeFocused()
  await select.selectOption('low')
  await expect(page.getByRole('button', { name: 'Priority: Low' })).toBeVisible()
})

test('a slotted editor whose change does not bubble still commits', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-inline-edit label="Size" value="s"><span slot="editor" aria-label="Size"></span></c2-inline-edit>`)
  const host = page.locator('c2-inline-edit')
  await page.getByRole('button', { name: 'Size: s' }).click()
  await host.evaluate((element) => {
    const editor = element.querySelector('[slot="editor"]') as HTMLElement & { value: string }
    editor.value = 'xl'
    editor.dispatchEvent(new Event('change'))
  })
  await expect(page.getByRole('button', { name: 'Size: xl' })).toBeVisible()
  await expect(host).toHaveJSProperty('value', 'xl')
})

test('opening and closing the editor does not fire focusout on the host', async ({ page, renderScenario }) => {
  await renderScenario(`${field()}<c2-inline-edit label="Priority" value="low">
    <select slot="editor" aria-label="Priority"><option value="low">Low</option><option value="high">High</option></select>
  </c2-inline-edit><a href="#">Outside</a>`)
  const log = page.locator('main')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const host of main.querySelectorAll('c2-inline-edit')) host.addEventListener('focusout', () => (main.dataset.log += `${host.getAttribute('label')};`))
  })
  await page.getByRole('button', { name: 'Project name: Apollo' }).click()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toBeFocused()
  await expect(log).toHaveAttribute('data-log', '')
  // Moving to the next inline edit is leaving the first one.
  await page.getByRole('button', { name: 'Priority: Low' }).click()
  await expect(page.getByRole('combobox', { name: 'Priority' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Priority: Low' })).toBeFocused()
  await expect(log).toHaveAttribute('data-log', 'Project name;')
  await page.getByRole('link', { name: 'Outside' }).focus()
  await expect(log).toHaveAttribute('data-log', 'Project name;Priority;')
})

test('formatValue returning undefined falls back to the default text', async ({ page, renderScenario }) => {
  await renderScenario(field())
  await page.locator('c2-inline-edit').evaluate(async (element) => {
    const host = element as HTMLElement & { formatValue?: (value: string) => string | undefined; updateComplete: Promise<boolean> }
    host.formatValue = () => undefined
    await host.updateComplete
  })
  await expect(page.getByRole('button', { name: 'Project name: Apollo' })).toHaveText('Apollo')
})

test('a multiline field grows with its text', async ({ page, renderScenario }) => {
  await renderScenario('<c2-inline-edit label="Notes" value="One" multiline></c2-inline-edit>')
  await page.getByRole('button', { name: 'Notes: One' }).click()
  const textarea = page.getByRole('textbox', { name: 'Notes' })
  const before = (await textarea.boundingBox())!.height
  await page.keyboard.press('End')
  await page.keyboard.type('\nTwo\nThree')
  await expect.poll(async () => (await textarea.boundingBox())!.height).toBeGreaterThan(before * 2)
  expect(await textarea.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
})
