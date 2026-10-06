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

  await page.keyboard.type('x')
  await page.keyboard.press('Escape')
  await expect(input).toHaveValue('')
  await expect.poll(() => events(page)).toEqual([{ value: '', trigger: 'clear' }])
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
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Search' })).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(() => localStorage.getItem('c2n-search-history:issues'))).toBeNull()
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
