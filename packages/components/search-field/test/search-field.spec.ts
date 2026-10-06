import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const events = async (page: Page, index = 0) => JSON.parse((await page.locator('c2-search-field').nth(index).getAttribute('data-events')) ?? '[]')

test('typing fires one debounced search, and Enter fires at once', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field placeholder="Search issues" debounce="200"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await watch(host, 'search')
  const input = page.getByRole('searchbox', { name: 'Search issues' })
  await input.click()
  await page.keyboard.type('bug')
  await expect.poll(() => events(page)).toEqual([{ value: 'bug', trigger: 'input' }])
  await page.keyboard.type('s')
  await page.keyboard.press('Enter')
  // Enter cancels the pending debounce, so "bugs" is searched once.
  await expect
    .poll(() => events(page))
    .toEqual([
      { value: 'bug', trigger: 'input' },
      { value: 'bugs', trigger: 'submit' },
    ])
  await page.waitForTimeout(300)
  expect(await events(page)).toHaveLength(2)
  await expect(host).toHaveJSProperty('value', 'bugs')
})

test('debounce="0" searches on every keystroke and re-dispatches input', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field debounce="0"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await watch(host, 'search')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    main.addEventListener('input', () => (main.dataset.log += 'input;'))
  })
  await page.getByRole('searchbox', { name: 'Search' }).click()
  await page.keyboard.type('ab')
  expect((await events(page)).map((event: { value: string }) => event.value)).toEqual(['a', 'ab'])
  await expect(page.locator('main')).toHaveAttribute('data-log', 'input;input;')
})

test('the clear button and Escape empty the field and search for nothing', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field value="draft" aria-label="Find"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await watch(host, 'search')
  await page.locator('main').evaluate((main) => {
    main.dataset.log = ''
    for (const type of ['clear', 'input', 'change']) main.addEventListener(type, () => (main.dataset.log += `${type};`))
  })
  const input = page.getByRole('searchbox', { name: 'Find' })
  await page.getByRole('button', { name: 'Clear search' }).click()
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(page.getByRole('button', { name: 'Clear search' })).toHaveCount(0)
  await expect(page.locator('main')).toHaveAttribute('data-log', 'clear;input;change;')
  expect(await events(page)).toEqual([{ value: '', trigger: 'clear' }])

  // Escape clears a query that was searched.
  await page.keyboard.type('x')
  await expect
    .poll(() => events(page))
    .toEqual([
      { value: '', trigger: 'clear' },
      { value: 'x', trigger: 'input' },
    ])
  await page.keyboard.press('Escape')
  await expect(input).toHaveValue('')
  await expect
    .poll(() => events(page))
    .toEqual([
      { value: '', trigger: 'clear' },
      { value: 'x', trigger: 'input' },
      { value: '', trigger: 'clear' },
    ])

  // Clearing a query whose search never ran leaves the last search (empty) standing: no duplicate event.
  await page.keyboard.type('y')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  expect(await events(page)).toHaveLength(3)
})

test('a shortcut focuses the field and shows a hint while it is empty and unfocused', async ({ page, renderScenario }) => {
  await renderScenario('<input aria-label="Other"><c2-search-field shortcut="/, mod+k"></c2-search-field>')
  const input = page.getByRole('searchbox', { name: 'Search' })
  const hint = page.locator('c2-search-field kbd')
  await expect(hint).toHaveText('/')
  await expect(input).toHaveAttribute('aria-keyshortcuts', /\//)

  await page.locator('body').click()
  await page.keyboard.press('/')
  await expect(input).toBeFocused()
  await expect(hint).toBeHidden()
  await expect(input).toHaveValue('')

  // A bare key is typing inside another field.
  await page.getByRole('textbox', { name: 'Other' }).click()
  await page.keyboard.press('/')
  await expect(page.getByRole('textbox', { name: 'Other' })).toHaveValue('/')
  // A chord works from anywhere.
  await page.keyboard.press('ControlOrMeta+k')
  await expect(input).toBeFocused()
})

test('recent searches open on focus, follow the arrow keys and run on Enter', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field recent="label:bug;assignee:me;is:open"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await watch(host, 'search')
  const input = page.getByRole('combobox', { name: 'Search' })
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.click()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(host).toHaveState('expanded')
  const options = page.getByRole('option')
  await expect(options).toHaveText(['label:bug', 'assignee:me', 'is:open'])

  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(input).toHaveAttribute('aria-activedescendant', 'recent-1')
  await page.keyboard.press('Enter')
  await expect(input).toHaveValue('assignee:me')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  expect(await events(page)).toEqual([{ value: 'assignee:me', trigger: 'recent' }])

  // Escape closes the panel before it clears anything.
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
})

test('typing narrows the recent searches and a click runs one', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field recent="label:bug;assignee:me;label:docs"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await watch(host, 'search')
  await page.getByRole('combobox', { name: 'Search' }).click()
  await page.keyboard.type('label')
  await expect(page.getByRole('option')).toHaveText(['label:bug', 'label:docs'])
  await expect(page.getByRole('option').first().locator('mark')).toHaveText('label')
  await page.getByRole('option', { name: 'label:docs' }).click()
  await expect(page.getByRole('combobox', { name: 'Search' })).toHaveValue('label:docs')
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeFocused()
  await expect.poll(() => events(page)).toContainEqual({ value: 'label:docs', trigger: 'recent' })
})

test('history-key records committed searches, persists them and clears them', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/search-field/test/scenarios.html')
  await page.evaluate(() => localStorage.removeItem('c2n-search-history:issues'))
  await renderScenario('<c2-search-field history-key="issues" recent-limit="2"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await watch(host, 'recent-change')
  const input = page.getByRole('combobox', { name: 'Search' })
  await input.click()
  for (const query of ['one', 'two', 'three']) {
    await page.keyboard.type(query)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
  }
  await expect(page.getByRole('option')).toHaveText(['three', 'two'])
  expect(await page.evaluate(() => localStorage.getItem('c2n-search-history:issues'))).toBe('["three","two"]')
  expect((await events(page)).at(-1)).toEqual({ recent: ['three', 'two'] })

  // A new field with the same key starts from the stored list.
  await renderScenario('<c2-search-field history-key="issues"></c2-search-field>')
  await page.getByRole('combobox', { name: 'Search' }).click()
  await expect(page.getByRole('option')).toHaveText(['three', 'two'])
  await page.getByRole('button', { name: 'Clear recent searches' }).click()
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Search' })).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(() => localStorage.getItem('c2n-search-history:issues'))).toBeNull()
})

test('the recent-searches Clear button is reachable from the keyboard', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field recent="label:bug;is:open"></c2-search-field>')
  const input = page.getByRole('combobox', { name: 'Search' })
  await input.click()
  await page.keyboard.press('Tab')
  const clear = page.getByRole('button', { name: 'Clear recent searches' })
  await expect(clear).toBeFocused()
  // Focus on the button keeps the panel open.
  await expect(page.getByRole('option')).toHaveCount(2)
  // Escape there closes the panel and returns to the field.
  await page.keyboard.press('Escape')
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowDown')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Tab')
  await expect(clear).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('option')).toHaveCount(0)
  // With no recent searches left the field is a plain searchbox again.
  await expect(page.getByRole('searchbox', { name: 'Search' })).toBeFocused()
})

test('switching history-key loads that key and never carries over the previous list', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/search-field/test/scenarios.html')
  await page.evaluate(() => {
    localStorage.setItem('c2n-search-history:a', '["from a"]')
    localStorage.removeItem('c2n-search-history:b')
  })
  await renderScenario('<c2-search-field history-key="a" recent="seed"></c2-search-field>')
  const host = page.locator('c2-search-field')
  await expect(host).toHaveJSProperty('recent', ['from a'])
  await props(host, { historyKey: 'b' })
  await expect(host).toHaveJSProperty('recent', [])
  await props(host, { historyKey: 'a' })
  await expect(host).toHaveJSProperty('recent', ['from a'])
})

test('form reset lets the same query be searched again', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-search-field name="q" debounce="0"></c2-search-field></form>')
  const host = page.locator('c2-search-field')
  await watch(host, 'search')
  const input = page.getByRole('searchbox', { name: 'Search' })
  await input.click()
  await page.keyboard.type('a')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(input).toHaveValue('')
  await page.keyboard.type('a')
  expect(await events(page)).toEqual([
    { value: 'a', trigger: 'input' },
    { value: 'a', trigger: 'input' },
  ])
})

test('submits the query with its form and resets to the authored value', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-search-field name="q" value="open"></c2-search-field><button type="reset">Reset</button></form>')
  const read = () => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('q'))
  expect(await read()).toBe('open')
  await page.getByRole('searchbox', { name: 'Search' }).fill('closed')
  expect(await read()).toBe('closed')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveValue('open')
})

test('disabled ignores the shortcut and leaves the query out of the form', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-search-field name="q" value="x" shortcut="mod+k" disabled></c2-search-field></form>')
  const input = page.getByRole('searchbox', { name: 'Search' })
  await expect(input).toBeDisabled()
  await expect(page.locator('c2-search-field')).toHaveState('disabled')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(input).not.toBeFocused()
  expect(await page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('q'))).toBe(false)
})

test('loading swaps the icon for a spinner and marks the field busy', async ({ page, renderScenario }) => {
  await renderScenario('<c2-search-field></c2-search-field>')
  const host = page.locator('c2-search-field')
  await props(host, { loading: true })
  await expect(page.getByRole('searchbox', { name: 'Search' })).toHaveAttribute('aria-busy', 'true')
  await expect(host).toHaveState('loading')
  await expect(host.locator('.spinner')).toBeVisible()
})

test('has no axe violations closed and open', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-search-field placeholder="Search" shortcut="mod+k" value="label"></c2-search-field><c2-search-field recent="label:bug;is:open" aria-label="Issues"></c2-search-field>',
  )
  await accessible(page)
  await page.getByRole('combobox', { name: 'Issues' }).click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await accessible(page)
})
