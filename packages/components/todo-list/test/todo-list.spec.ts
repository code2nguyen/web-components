import type { Locator, Page } from '@playwright/test'
import { accessible } from '../../../../tests/component-fixture'
import type { TodoList } from '../src/todo-list'
import { test, expect } from './fixture'

const tasksOf = (list: Locator) =>
  list.evaluate((element: TodoList) => element.tasks.map(({ id, label, done, dropped, archived }) => ({ id, label, done, dropped, archived })))
const labels = (list: Locator) => list.locator('.task .label-text')

async function swipe(page: Page, row: Locator, distance: number) {
  const box = (await row.boundingBox())!
  const y = box.y + box.height / 2
  const x = box.x + box.width / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + distance / 2, y, { steps: 5 })
  await page.mouse.move(x + distance, y, { steps: 5 })
  await page.mouse.up()
}

test('summarises progress in the ring and the heading', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await expect(list.getByRole('heading', { name: 'This week' })).toBeVisible()
  await expect(list.locator('.meta')).toHaveText('2 of 6 done · 1 urgent')
  await expect(list.getByRole('img', { name: '33% complete, 2 of 6 tasks done' })).toBeVisible()
  // The heading suggests the list icon, drawn inside the ring; archived tasks are not counted.
  await expect(list.locator('.ring-value c2-task-icon-calendar')).toBeAttached()
  await expect(list.locator('.task')).toHaveCount(6)
})

test('checks a task with a hand-drawn tick, by pointer and by keyboard', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const passport = list.getByRole('checkbox', { name: 'Renew passport' })

  await passport.click()
  await expect(passport).toHaveAttribute('aria-checked', 'true')
  await expect(passport.locator('path')).toHaveAttribute('d', /^M4\.5 12\.6/)
  await expect(list.locator('[data-reorder-key="c"] .strike')).toBeAttached()
  await expect(list.locator('.meta')).toHaveText('3 of 6 done')
  await expect(list).toHaveAttribute('data-events', 'task-toggle tasks-change')

  await passport.press('Space')
  await expect(passport).toHaveAttribute('aria-checked', 'false')
})

test('adds a plain task, with a note after a dash', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const input = list.getByRole('textbox', { name: 'New task' })

  await expect(list.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  await input.fill('Oat milk - 2 L barista')
  await input.press('Enter')

  const row = list.locator('.task').filter({ hasText: 'Oat milk' })
  await expect(row.locator('.label-text')).toHaveText('Oat milk')
  await expect(row.locator('.note')).toHaveText('2 L barista')
  await expect(row.locator('.task-icon')).toHaveCount(0)
  await expect(input).toHaveValue('')
  await expect(list).toHaveAttribute('data-events', 'task-add tasks-change')
})

test('opens a note by clicking the task and saves it', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.locator('[data-reorder-key="e"] .label').click()
  const note = list.getByRole('textbox', { name: 'Note for Book the train to Lyon' })
  await expect(note).toBeFocused()
  await expect(note).toHaveValue('Friday evening, back Sunday')
  await note.fill('Friday 18:04, seat 42')
  await note.press('Escape')

  await expect(note).toHaveCount(0)
  await expect(list.locator('[data-reorder-key="e"] .note')).toHaveText('Friday 18:04, seat 42')
  await expect(list).toHaveAttribute('data-events', 'task-change tasks-change')
})

test('the ⋯ menu marks a task won’t do, archives it and undoes the archive', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const more = list.getByRole('button', { name: 'Actions for Dentist appointment' })

  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await list.getByRole('menuitem', { name: 'Won’t do' }).click()
  await expect(list.getByRole('checkbox', { name: 'Dentist appointment, won’t do' })).toBeVisible()
  await expect(list.locator('.meta')).toHaveText('3 of 6 done · 1 urgent')

  await more.click()
  await list.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(list.locator('[data-reorder-key="b"]')).toHaveCount(0)
  await expect(list.locator('.toast')).toContainText('Archived “Dentist appointment”')
  await expect(list.getByRole('button', { name: /Archived · 2/ })).toBeVisible()

  await list.getByRole('button', { name: 'Undo' }).click()
  await expect(list.locator('[data-reorder-key="b"]')).toHaveCount(1)
  await expect(list).toHaveAttribute('data-events', 'task-change tasks-change task-archive tasks-change task-restore tasks-change')
})

test('opens the menu with the keyboard and closes it with Escape', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const more = list.getByRole('button', { name: 'Actions for Dentist appointment' })

  await more.focus()
  await more.press('ArrowDown')
  await expect(list.getByRole('menuitem', { name: 'Edit note' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(list.getByRole('menuitem', { name: 'Add an icon' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const highlight = list.getByRole('menuitem', { name: 'Highlight' })
  await expect(highlight).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(list.getByRole('menuitemradio', { name: 'No highlight' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(list.getByRole('menuitemradio', { name: 'Yellow highlighter' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(list.locator('[data-reorder-key="b"] .task')).toHaveClass(/highlight-yellow/)
  await page.keyboard.press('Escape')
  await expect(highlight).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(list.getByRole('menu')).toHaveCount(0)
  await expect(more).toBeFocused()

  // Right-click opens the same menu.
  await list.locator('[data-reorder-key="e"] .body').click({ button: 'right' })
  await expect(list.getByRole('menu', { name: 'Actions for Book the train to Lyon' })).toBeVisible()
})

test('archives, drops and deletes with shortcut keys, keeping focus in the list', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('checkbox', { name: 'Book the train to Lyon' }).focus()
  await page.keyboard.press('x')
  await expect(list.getByRole('checkbox', { name: 'Book the train to Lyon, won’t do' })).toBeFocused()
  await page.keyboard.press('e')
  await expect(list.locator('[data-reorder-key="e"]')).toHaveCount(0)
  await expect(list.getByRole('checkbox', { name: 'Birthday present for Anna' })).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(list.locator('[data-reorder-key="f"]')).toHaveCount(0)
  await expect(list.locator('.toast')).toContainText('Deleted “Birthday present for Anna”')
  await expect(list.getByRole('checkbox', { name: 'Call the plumber about the leak, won’t do' })).toBeFocused()

  await list.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(async () => (await tasksOf(list)).map((task) => task.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
})

test('swipes left to reveal archive and delete, and right to check', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const row = list.locator('[data-reorder-key="c"] .task')

  await swipe(page, row, -160)
  const archive = list.locator('c2-reorder-list').getByRole('button', { name: 'Archive' })
  await expect(archive).toBeVisible()
  await archive.click()
  await expect(list.locator('[data-reorder-key="c"]')).toHaveCount(0)
  await expect(list.locator('.meta')).toHaveText('2 of 5 done')

  // A long swipe to the right checks the task at once; a short one reveals Done.
  await swipe(page, list.locator('[data-reorder-key="b"] .task'), 330)
  await expect(list.getByRole('checkbox', { name: 'Dentist appointment' })).toHaveAttribute('aria-checked', 'true')
  // A swipe is not a click: the note did not open.
  await expect(list.locator('.note-input')).toHaveCount(0)
  await expect(list).toHaveAttribute('data-events', 'task-archive tasks-change task-toggle tasks-change')
})

test('closes a swiped row without deleting it', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const actions = list.locator('c2-reorder-list').getByRole('button', { name: 'Delete' })

  await swipe(page, list.locator('[data-reorder-key="c"] .task'), -160)
  await expect(actions).toBeVisible()
  await list.locator('[data-reorder-key="c"] .label').click()
  await expect(actions).toHaveCount(0)
  await expect(list.locator('.note-input')).toHaveCount(0)

  await swipe(page, list.locator('[data-reorder-key="c"] .task'), -160)
  await page.keyboard.press('Escape')
  await expect(actions).toHaveCount(0)
  await expect(list.locator('[data-reorder-key="c"]')).toHaveCount(1)
  await expect(list).not.toHaveAttribute('data-events', /task-/)
})

test('reorders tasks by dragging the grip', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const first = list.locator('[data-reorder-key="a"]')
  const third = list.locator('[data-reorder-key="c"]')

  await first.hover()
  const grip = (await first.locator('.grip').boundingBox())!
  const target = (await third.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 30, { steps: 4 })
  await page.mouse.move(grip.x + grip.width / 2, target.y + target.height - 4, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => (await tasksOf(list)).map((task) => task.id)).toEqual(['b', 'c', 'a', 'd', 'e', 'f', 'g'])
  await expect(labels(list).first()).toHaveText('Dentist appointment')
  await expect(list).toHaveAttribute('data-events', 'task-reorder tasks-change')
})

test('restores and deletes archived tasks', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const toggle = list.getByRole('button', { name: /Archived · 1/ })

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await list.getByRole('button', { name: 'Restore Pay the electricity bill' }).click()
  await expect(list.locator('[data-reorder-key="g"]')).toBeVisible()
  await expect(list.getByRole('button', { name: /Archived/ })).toHaveCount(0)
  await expect(list).toHaveAttribute('data-events', 'task-restore tasks-change')
})

test('filters tasks by state', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'To do 4' }).click()
  await expect(labels(list)).toHaveText(['Dentist appointment', 'Renew passport', 'Book the train to Lyon', 'Birthday present for Anna'])
  await expect(list.locator('.grip')).toHaveCount(0)
  await list.getByRole('button', { name: 'Done 2' }).click()
  await expect(labels(list)).toHaveText(['Send the Q3 report to Léa', 'Call the plumber about the leak'])
})

test('a background sets the text colour and the pens it offers', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await expect(list.getByRole('region', { name: 'Customize the list' })).toBeVisible()
  await expect(list.locator('.tasks')).toHaveCount(0)
  await list.getByRole('radio', { name: 'Night' }).click()
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(26, 26, 31)')
  await expect(list.locator('.heading')).toHaveCSS('color', 'rgb(241, 240, 238)')
  await expect(list.locator('.pen-swatch.pen-green').first()).toHaveCSS('background-color', 'rgb(110, 231, 183)')

  await list.getByRole('radiogroup', { name: 'Pen' }).getByRole('radio', { name: 'Green ink' }).click()
  await expect(list.locator('.ring-fill')).toHaveCSS('stroke', 'rgb(110, 231, 183)')

  await list.getByRole('radio', { name: 'Cross' }).click()
  await list.getByRole('radio', { name: 'Bar' }).click()
  await expect(list.locator('.bar')).toBeVisible()
  await list.getByRole('button', { name: 'Back to the list' }).click()
  await expect(list.getByRole('button', { name: 'Customize look' })).toBeFocused()
  await expect(list.locator('[data-reorder-key="a"] .mark path')).toHaveAttribute('d', /^M6\.5 6\.8/)
  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ background: 'night', pen: 'green', doneMark: 'cross', progress: 'bar' })

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Reset' }).click()
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(list.locator('.ring')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(list.locator('.tasks')).toBeVisible()
})

test('changes a task’s highlighter and text colour from its menu, in place', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const row = list.locator('[data-reorder-key="b"] .task')

  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await list.getByRole('menuitem', { name: 'Highlight' }).hover()
  await list.getByRole('menuitemradio', { name: 'Pink highlighter' }).click()
  await expect(row).toHaveClass(/highlight-pink/)
  await expect(row).not.toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await list.getByRole('menuitem', { name: 'Text colour' }).hover()
  await list.getByRole('menuitemradio', { name: 'Violet ink text' }).click()
  await expect(row.locator('.label')).toHaveCSS('color', 'rgb(124, 58, 237)')
  // The panel never opened: per-task styling happens in the list.
  await expect(list.getByRole('region', { name: 'Customize the list' })).toHaveCount(0)

  await expect
    .poll(() => list.evaluate((element: TodoList) => element.tasks.find((task) => task.id === 'b')))
    .toMatchObject({ highlight: 'pink', ink: 'violet' })
})

test('clicking a task’s icon opens the icon picker; the menu adds one to a task without', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await list.getByRole('menuitem', { name: 'Add an icon' }).click()
  const picker = list.getByRole('dialog', { name: 'Icon for Dentist appointment' })
  await expect(picker.getByRole('searchbox', { name: 'Search icons' })).toBeFocused()
  await picker.getByRole('searchbox', { name: 'Search icons' }).fill('dentist')
  await picker.getByRole('button', { name: 'Dentist', exact: true }).click()
  await expect(picker).toHaveCount(0)
  const icon = list.getByRole('button', { name: 'Change icon for Dentist appointment' })
  await expect(icon.locator('c2-task-icon-tooth')).toBeAttached()
  await expect(icon).toBeFocused()

  await icon.click()
  await list.getByRole('dialog', { name: 'Icon for Dentist appointment' }).getByRole('button', { name: 'No icon' }).click()
  await expect(list.locator('[data-reorder-key="b"] .task-icon')).toHaveCount(0)

  await list.getByRole('button', { name: 'Change icon for Book the train to Lyon' }).click()
  await page.keyboard.press('Escape')
  await expect(list.getByRole('dialog')).toHaveCount(0)
  await expect(list.getByRole('button', { name: 'Change icon for Book the train to Lyon' })).toBeFocused()
})

test('groups the icon picker by category', async ({ page, scenario }) => {
  await scenario('groceries')
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Change icon for Green lentils' }).click()
  const food = list.getByRole('group', { name: 'Food & groceries' })
  await expect(food.getByRole('button', { name: 'Legumes' })).toHaveAttribute('aria-pressed', 'true')
  await expect(food.getByRole('button', { name: 'Dairy' })).toBeVisible()
  await expect(food.getByRole('button', { name: 'Meat' })).toBeVisible()
})

test('remembers the look and the tasks in localStorage', async ({ page, scenario }) => {
  await scenario('persist')
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('radio', { name: 'Sand' }).click()
  await list.getByRole('radio', { name: 'Hero' }).click()
  await expect(list.getByText('Saved in this browser')).toBeVisible()
  await list.getByRole('button', { name: 'Back to the list' }).click()
  await list.getByRole('checkbox', { name: 'Renew passport' }).click()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('c2-todo-list:spec') ?? 'null'))
  expect(stored.look).toEqual({ background: 'sand', progress: 'hero' })
  expect(stored.tasks.find((task: { id: string }) => task.id === 'c').done).toBe(true)

  await scenario('persist')
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(248, 241, 228)')
  await expect(list.locator('.progress-hero')).toBeVisible()
  await expect(list.getByRole('checkbox', { name: 'Renew passport' })).toHaveAttribute('aria-checked', 'true')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('c2-todo-list:spec') ?? 'null').look)).toEqual({})
})

test('ignores a stored look that is no longer valid', async ({ page, scenario }) => {
  await scenario()
  await page.evaluate(() => localStorage.setItem('c2-todo-list:spec', JSON.stringify({ look: { background: 'neon', pen: 'green', progress: 42 } })))
  await scenario('persist')
  const list = page.locator('c2-todo-list')

  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ pen: 'green' })
  await expect(list.locator('.task')).toHaveCount(6)
})

test('readonly lists cannot be changed', async ({ page, scenario }) => {
  await scenario('readonly')
  const list = page.locator('c2-todo-list')

  await expect(list.getByRole('checkbox', { name: 'Renew passport' })).toBeDisabled()
  await expect(list.getByRole('textbox', { name: 'New task' })).toHaveCount(0)
  await expect(list.getByRole('button', { name: /^Actions for / })).toHaveCount(0)
  await expect(list.locator('.grip')).toHaveCount(0)
  await list.locator('[data-reorder-key="c"] .body').click({ button: 'right' })
  await expect(list.getByRole('menu')).toHaveCount(0)
})

test('shows the empty slot and the finished state', async ({ page, scenario }) => {
  await scenario('empty')
  const list = page.locator('c2-todo-list')
  await expect(list.getByText('Nothing planned yet.')).toBeVisible()
  await expect(list.locator('.meta')).toHaveText('No tasks yet')
  await expect(list.locator('.filters')).toHaveCount(0)

  await scenario('all-done')
  await expect(list.locator('.meta')).toHaveText('All done. Nice work.')
  await expect(list.locator('.ring-check')).toBeVisible()
})

test('draws the bar and hero progress styles', async ({ page, scenario }) => {
  await scenario('bar')
  const list = page.locator('c2-todo-list')
  await expect(list.locator('.bar-fill')).toHaveAttribute('style', /width:\s*33%/)
  await expect(list.locator('.ring')).toHaveCount(0)
  await expect(list.locator('.list-icon c2-task-icon-calendar')).toBeAttached()

  await scenario('hero')
  await expect(list.locator('.progress-hero .ring-value')).toHaveText('33%')
})

for (const name of ['default', 'groceries', 'plain'] as const) {
  test(`has no detectable accessibility violations: ${name}`, async ({ page, scenario }) => {
    await scenario(name)
    await accessible(page)
  })
}

for (const look of ['paper', 'night', 'mint', 'sky'] as const) {
  test(`has no detectable accessibility violations on the ${look} background`, async ({ page }) => {
    await page.goto(`/packages/components/todo-list/test/scenarios.html?scenario=default&look=${look}`)
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
    await accessible(page)
  })
}

test('has no detectable accessibility violations with a submenu, the icon picker and the panel', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await list.getByRole('menuitem', { name: 'Highlight' }).hover()
  await expect(list.getByRole('menuitemradio', { name: 'Pink highlighter' })).toBeVisible()
  await accessible(page)

  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await list.getByRole('button', { name: 'Change icon for Book the train to Lyon' }).click()
  await accessible(page)

  await page.keyboard.press('Escape')
  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('radio', { name: 'Blush' }).click()
  await accessible(page)
})
