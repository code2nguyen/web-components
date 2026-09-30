import { accessible } from '../../../../tests/component-fixture'
import type { TodoList } from '../src/todo-list'
import { test, expect } from './fixture'

test('summarises progress in the ring and the heading', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await expect(list.getByRole('heading', { name: 'Launch week' })).toBeVisible()
  await expect(list.locator('.meta')).toHaveText('2 of 4 done · 1 urgent')
  await expect(list.getByRole('img', { name: '50% complete, 2 of 4 tasks done' })).toBeVisible()
  await expect(list.locator('.ring-value')).toHaveText('50')
})

test('checks a task with the pointer and the keyboard', async ({ page, scenario, tab }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const ship = list.getByRole('checkbox', { name: 'Ship the build' })

  await ship.click()
  await expect(ship).toHaveAttribute('aria-checked', 'true')
  await expect(list.locator('.meta')).toHaveText('3 of 4 done')
  await expect(list).toHaveAttribute('data-events', 'task-toggle tasks-change')
  await expect.poll(() => list.evaluate((element: TodoList) => element.tasks.find((task) => task.id === 'c')?.done)).toBe(true)

  await ship.focus()
  await tab()
  await tab()
  await tab()
  await expect(list.getByRole('checkbox', { name: 'Book the team dinner' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(list.locator('.meta')).toHaveText('All done. Nice work.')
  await expect(list.locator('.ring-check')).toBeVisible()
})

test('adds a task from the add field and gives it a fitting icon', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const input = list.getByRole('textbox', { name: 'New task' })
  const add = list.getByRole('button', { name: 'Add', exact: true })

  await expect(add).toBeDisabled()
  await input.fill('Book the dentist')
  await input.press('Enter')

  const row = list.locator('.task').filter({ hasText: 'Book the dentist' })
  await expect(row).toBeVisible()
  await expect(row.locator('c2-task-icon-tooth')).toBeAttached()
  await expect(input).toHaveValue('')
  await expect(list.locator('.meta')).toHaveText('2 of 5 done · 1 urgent')
  await expect(list).toHaveAttribute('data-events', 'task-add tasks-change')
})

test('deletes a task and keeps focus in the list', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Delete Review pricing copy' }).click()
  await expect(list.locator('.task')).toHaveCount(3)
  await expect(list.getByRole('checkbox', { name: 'Ship the build' })).toBeFocused()
  await expect(list).toHaveAttribute('data-events', 'task-remove tasks-change')
})

test('filters tasks by state', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'To do 2' }).click()
  await expect(list.locator('.task .label')).toHaveText(['Ship the build', 'Book the team dinner'])
  await list.getByRole('button', { name: 'Done 2' }).click()
  await expect(list.locator('.task .label')).toHaveText(['Draft the announcement', 'Review pricing copy'])
  await list.getByRole('button', { name: 'All 4' }).click()
  await expect(list.locator('.task')).toHaveCount(4)
})

test('customizes the background, accent and progress style', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const customize = list.getByRole('button', { name: 'Customize look' })

  await customize.click()
  await expect(customize).toHaveAttribute('aria-expanded', 'true')
  await list.getByRole('radio', { name: 'Midnight' }).click()
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(24, 24, 27)')

  await list.getByRole('radio', { name: 'Pink' }).first().click()
  await expect(list.locator('.ring-fill')).toHaveCSS('stroke', 'rgb(244, 114, 182)')

  await list.getByRole('radio', { name: 'Bar' }).click()
  await expect(list.locator('.bar')).toBeVisible()
  await expect(list.locator('.ring')).toHaveCount(0)

  await list.getByRole('radio', { name: 'Compact' }).click()
  await expect(list.locator('.tile').first()).toHaveCSS('width', '30px')
  await expect
    .poll(() => list.evaluate((element: TodoList) => element.look))
    .toEqual({ background: 'midnight', accent: 'pink', progress: 'bar', density: 'compact' })

  await list.getByRole('button', { name: 'Reset' }).click()
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(list.locator('.ring')).toBeVisible()
  await expect(list).toHaveAttribute('data-events', 'look-change look-change look-change look-change look-change')
})

test('changes a task icon and colour from its tile', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const tile = list.getByRole('button', { name: 'Change icon for Book the team dinner' })

  await tile.click()
  await expect(list.getByRole('region', { name: 'Customize' })).toBeVisible()
  await expect(tile).toHaveAttribute('aria-pressed', 'true')

  await list.getByRole('searchbox', { name: 'Search icons' }).fill('pizza')
  await list.getByRole('button', { name: 'Takeaway' }).click()
  await expect(tile.locator('c2-task-icon-pizza')).toBeAttached()

  await list.getByRole('radiogroup', { name: 'Icon colour' }).getByRole('radio', { name: 'Green' }).click()
  await expect(tile).toHaveCSS('color', 'rgb(21, 128, 61)')
  await expect.poll(() => list.evaluate((element: TodoList) => element.tasks.find((task) => task.id === 'd'))).toMatchObject({ icon: 'pizza', color: 'green' })
  await expect(list).toHaveAttribute('data-events', 'task-change tasks-change task-change tasks-change')
})

test('moves through the icon picker with the arrow keys', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Change icon for Ship the build' }).click()
  const current = list.locator('.icon-option[aria-pressed="true"]')
  await current.focus()
  await page.keyboard.press('ArrowRight')
  await expect(list.locator('.icon-option[tabindex="0"]')).toBeFocused()
  await expect(list.locator('.icon-option[tabindex="0"]')).not.toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Home')
  await expect(list.locator('.icon-option').first()).toBeFocused()
})

test('closes the panel with Escape and returns focus to its button', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const customize = list.getByRole('button', { name: 'Customize look' })

  await customize.click()
  await list.getByRole('radio', { name: 'Mint' }).focus()
  await page.keyboard.press('Escape')
  await expect(list.getByRole('region', { name: 'Customize' })).toHaveCount(0)
  await expect(customize).toBeFocused()
})

test('remembers the look and the tasks in localStorage', async ({ page, scenario }) => {
  await scenario('persist')
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('radio', { name: 'Mint' }).click()
  await list.getByRole('radio', { name: 'Hero' }).click()
  await list.getByRole('checkbox', { name: 'Ship the build' }).click()
  await expect(list.getByText('Saved in this browser')).toBeVisible()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('c2-todo-list:spec') ?? 'null'))
  expect(stored.look).toEqual({ background: 'mint', progress: 'hero' })
  expect(stored.tasks.find((task: { id: string }) => task.id === 'c').done).toBe(true)

  await scenario('persist')
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(244, 251, 248)')
  await expect(list.locator('.progress-hero')).toBeVisible()
  await expect(list.getByRole('checkbox', { name: 'Ship the build' })).toHaveAttribute('aria-checked', 'true')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('c2-todo-list:spec') ?? 'null').look)).toEqual({})
})

test('ignores a stored look that is no longer valid', async ({ page, scenario }) => {
  await scenario()
  await page.evaluate(() => localStorage.setItem('c2-todo-list:spec', JSON.stringify({ look: { background: 'neon', accent: 'pink', progress: 42 } })))
  await scenario('persist')
  const list = page.locator('c2-todo-list')

  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ accent: 'pink' })
  await expect(list.locator('.task')).toHaveCount(4)
})

test('readonly lists cannot be changed', async ({ page, scenario }) => {
  await scenario('readonly')
  const list = page.locator('c2-todo-list')

  await expect(list.getByRole('checkbox', { name: 'Ship the build' })).toBeDisabled()
  await expect(list.getByRole('textbox', { name: 'New task' })).toHaveCount(0)
  await expect(list.getByRole('button', { name: /^Delete / })).toHaveCount(0)
  await expect(list.getByRole('button', { name: 'Customize look' })).toHaveCount(0)
})

test('shows the empty slot and the finished state', async ({ page, scenario }) => {
  await scenario('empty')
  const list = page.locator('c2-todo-list')
  await expect(list.getByText('Nothing planned yet.')).toBeVisible()
  await expect(list.locator('.meta')).toHaveText('No tasks yet')
  await expect(list.locator('.filters')).toHaveCount(0)

  await scenario('all-done')
  await expect(list.locator('.meta')).toHaveText('All done. Nice work.')
  await expect(list.getByRole('img', { name: '100% complete, 1 of 1 tasks done' })).toBeVisible()
})

test('draws the bar and hero progress styles', async ({ page, scenario }) => {
  await scenario('bar')
  const list = page.locator('c2-todo-list')
  await expect(list.locator('.bar-fill')).toHaveAttribute('style', /width:\s*50%/)
  await expect(list.locator('.ring')).toHaveCount(0)

  await scenario('hero')
  await expect(list.locator('.progress-hero .ring-value')).toHaveText('50%')
})

for (const name of ['default', 'hero'] as const) {
  test(`has no detectable accessibility violations: ${name}`, async ({ page, scenario }) => {
    await scenario(name)
    await accessible(page)
  })
}

test('has no detectable accessibility violations with the panel open on a dark background', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  await list.getByRole('button', { name: 'Change icon for Ship the build' }).click()
  await list.getByRole('radio', { name: 'Midnight' }).click()
  await accessible(page)
})
