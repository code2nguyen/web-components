import type { Locator, Page } from '@playwright/test'
import { accessible, props, expect as hostExpect } from '../../../../tests/component-fixture'
import type { TodoList } from '../src/todo-list'
import { test, expect } from './fixture'

const tasksOf = (list: Locator) =>
  list.evaluate((element: TodoList) => element.tasks.map(({ id, label, done, dropped, archived }) => ({ id, label, done, dropped, archived })))
const labels = (list: Locator) => list.locator('.task .label-text')
/** A custom property as the list's container resolves it. */
const cssVar = (list: Locator, name: string) =>
  list.locator('.container').evaluate((element, name) => getComputedStyle(element).getPropertyValue(name).trim(), name)

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
  await expect(list.getByRole('progressbar', { name: '2 of 6 tasks done' })).toHaveAttribute('aria-valuenow', '33')
  // The heading suggests the list icon, drawn inside the ring; archived tasks are not counted.
  await expect(list.locator('.ring-value c2-task-icon-calendar')).toBeAttached()
  await expect(list.locator('.task')).toHaveCount(6)
})

test('draws the ring and the hero ring as a circular c2-progress, stroked in units of a 48px canvas', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const ring = list.locator('c2-progress.ring')
  const indicator = ring.locator('[part="indicator"]')

  await expect(ring).toHaveAttribute('variant', 'circular')
  await expect(ring.locator('[part="track"]')).toHaveCSS('width', '44px')
  await expect(indicator).toHaveCSS('stroke-width', '4.125px')

  await list.evaluate((element: TodoList) => (element.look = { progress: 'hero' }))
  await expect(ring.locator('[part="track"]')).toHaveCSS('width', '120px')
  await expect(indicator).toHaveCSS('stroke-width', '17.5px')
  await expect(ring.locator('.ring-value')).toHaveText('33%')
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

test('Edit task edits the name and note together, saved when the focus leaves them', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Actions for Book the train to Lyon' }).click()
  await list.getByRole('menuitem', { name: 'Edit task' }).click()
  const name = list.getByRole('textbox', { name: 'Name of Book the train to Lyon' })
  const note = list.getByRole('textbox', { name: 'Note for Book the train to Lyon' })
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('Book the train to Lyon')
  await expect(note).toHaveValue('Friday evening, back Sunday')

  // Moving between the two fields stays in edit mode.
  await name.fill('Book the train to Lyon and back')
  await note.click()
  await note.fill('Friday 18:04, seat 42')
  await expect(name).toBeVisible()

  // A click outside the list saves both in one change and returns to read mode.
  await page.mouse.click(5, 5)
  await expect(name).toHaveCount(0)
  const row = list.locator('[data-reorder-key="e"]')
  await expect(row.locator('.label-text')).toHaveText('Book the train to Lyon and back')
  await expect(row.locator('.note')).toHaveText('Friday 18:04, seat 42')
  await expect(list).toHaveAttribute('data-events', 'task-change tasks-change')
  await expect(list.locator('.toast')).toContainText('Edited “Book the train to Lyon”')

  await list.getByRole('button', { name: 'Undo' }).click()
  await expect(row.locator('.label-text')).toHaveText('Book the train to Lyon')
  await expect(row.locator('.note')).toHaveText('Friday evening, back Sunday')
})

test('clicking a task does not edit it, it shows the whole note', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const note = list.locator('[data-reorder-key="b"] .note')

  await expect(note).toHaveText('Dr. Martin, 14 rue Oberkampf')
  await list.locator('[data-reorder-key="b"] .label').click()
  await expect(list.locator('.editor')).toHaveCount(0)
  await expect(note).toHaveText('Dr. Martin, 14 rue Oberkampf Bring the insurance card')
  await note.click()
  await expect(note).toHaveText('Dr. Martin, 14 rue Oberkampf')
  await expect(list).not.toHaveAttribute('data-events', /task-change/)
})

test('Enter in the name saves, Enter in the note adds a line', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('checkbox', { name: 'Dentist appointment' }).press('F2')
  const note = list.getByRole('textbox', { name: 'Note for Dentist appointment' })
  await expect(note).toHaveValue('Dr. Martin, 14 rue Oberkampf\nBring the insurance card')
  await note.press('Enter')
  await expect(note).toBeVisible()

  const name = list.getByRole('textbox', { name: 'Name of Dentist appointment' })
  await name.fill('Dentist check-up')
  await name.press('Enter')
  await expect(name).toHaveCount(0)
  await expect(list.locator('[data-reorder-key="b"] .label-text')).toHaveText('Dentist check-up')
  await expect(list.getByRole('checkbox', { name: 'Dentist check-up' })).toBeFocused()
})

test('Edit task from the menu or F2; doing something else saves it', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')

  await list.getByRole('button', { name: 'Actions for Renew passport' }).click()
  await list.getByRole('menuitem', { name: 'Edit task' }).click()
  const name = list.getByRole('textbox', { name: 'Name of Renew passport' })
  await expect(name).toBeFocused()
  await name.fill('Renew both passports')
  const note = list.getByRole('textbox', { name: 'Note for Renew passport' })
  await note.fill('Photos first')

  // Opening another row's menu saves the edit.
  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await expect(name).toHaveCount(0)
  await expect(list.getByRole('menu', { name: 'Actions for Dentist appointment' })).toBeVisible()
  await expect(list.locator('[data-reorder-key="c"] .label-text')).toHaveText('Renew both passports')
  await expect(list.locator('[data-reorder-key="c"] .note')).toHaveText('Photos first')

  await page.keyboard.press('Escape')
  await list.getByRole('checkbox', { name: 'Renew both passports' }).press('F2')
  await expect(list.getByRole('textbox', { name: 'Name of Renew both passports' })).toBeFocused()
})

test('Escape cancels an edit and an empty name keeps the old one', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const passport = list.getByRole('checkbox', { name: 'Renew passport' })

  await passport.press('F2')
  const name = list.getByRole('textbox', { name: 'Name of Renew passport' })
  await name.fill('Something else')
  await name.press('Escape')
  await expect(name).toHaveCount(0)
  await expect(passport).toBeFocused()
  await expect(list.locator('[data-reorder-key="c"] .label-text')).toHaveText('Renew passport')

  await passport.press('F2')
  await name.fill('   ')
  await name.press('Enter')
  await expect(list.locator('[data-reorder-key="c"] .label-text')).toHaveText('Renew passport')
  await expect(list).not.toHaveAttribute('data-events', /task-change/)
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
  await expect(list.getByRole('menuitem', { name: 'Edit task' })).toBeFocused()
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
  await expect(list.locator('[data-reorder-key="b"] .task')).toHaveClass(/highlighted/)
  await expect.poll(() => list.evaluate((element: TodoList) => element.tasks.find((task) => task.id === 'b')?.highlight)).toBe(1)
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
  await expect(list.locator('.editor')).toHaveCount(0)

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

test('a press on the menu or the icon picker never drags the task under it', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const order = async () => (await tasksOf(list)).map((task) => task.id)
  const before = await order()
  // Press on the panel's padding (not on a control) and pull it down, as a drag would.
  const dragFromCorner = async (panel: ReturnType<typeof list.locator>) => {
    // Wait out the opening animation: mid-scale, the corner is still outside the panel.
    await panel.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
    const box = (await panel.boundingBox())!
    await page.mouse.move(box.x + 3, box.y + 3)
    await page.mouse.down()
    await page.mouse.move(box.x + 3, box.y + 40, { steps: 4 })
    await page.mouse.move(box.x + 3, box.y + 140, { steps: 8 })
    await page.mouse.up()
  }

  await list.getByRole('button', { name: 'Change icon for Book the train to Lyon' }).click()
  const picker = list.locator('.icon-popover')
  await expect(picker).toHaveCSS('cursor', 'default')
  await dragFromCorner(picker)
  await expect(picker).toBeVisible()
  await expect.poll(order).toEqual(before)

  await page.keyboard.press('Escape')
  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  const menu = list.getByRole('menu', { name: 'Actions for Dentist appointment' })
  await expect(menu).toHaveCSS('cursor', 'default')
  await dragFromCorner(menu)
  await expect.poll(order).toEqual(before)
  await expect(list).not.toHaveAttribute('data-events', /task-reorder/)
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

  // A c2-tabs strip; its tabs state their role through ElementInternals, which getByRole does not read.
  const tabs = list.locator('c2-tabs.filters c2-tab')
  await expect(tabs).toHaveText(['All6', 'To do4', 'Done2'])
  await hostExpect(tabs.first()).toHaveHostAria('role', 'tab')
  await hostExpect(tabs.first()).toHaveHostAria('aria-selected', 'true')
  await tabs.nth(1).click()
  await expect(labels(list)).toHaveText(['Dentist appointment', 'Renew passport', 'Book the train to Lyon', 'Birthday present for Anna'])
  await expect(list.locator('.grip')).toHaveCount(0)
  await hostExpect(tabs.nth(1)).toHaveHostAria('aria-selected', 'true')
  // Arrow keys move along the strip, as in any tab list.
  await page.keyboard.press('ArrowRight')
  await expect(labels(list)).toHaveText(['Send the Q3 report to Léa', 'Call the plumber about the leak'])
  await expect(tabs.nth(2)).toBeFocused()
  await tabs.first().click()
  await expect(labels(list)).toHaveCount(6)
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
  // Night takes the classic palette's dark pens and accent. The panel has no pen field: the palette owns the accent.
  await expect.poll(() => cssVar(list, '--c2-todo-list__pen-green--color')).toBe('#2dd4bf')
  await expect(list.getByRole('radiogroup', { name: 'Pen' })).toHaveCount(0)
  await expect(list.locator('.ring [part="indicator"]')).toHaveCSS('stroke', 'rgb(103, 171, 255)')

  await list.getByRole('radio', { name: 'Cross' }).click()
  await list.getByRole('radio', { name: 'Bar' }).click()
  await expect(list.locator('.bar')).toBeVisible()
  await list.getByRole('button', { name: 'Back to the list' }).click()
  await expect(list.getByRole('button', { name: 'Customize look' })).toBeFocused()
  await expect(list.locator('[data-reorder-key="a"] .mark path')).toHaveAttribute('d', /^M6\.5 6\.8/)
  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ background: 6, doneMark: 'cross', progress: 'bar' })

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Reset' }).click()
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(list.locator('.ring')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(list.locator('.tasks')).toBeVisible()
})

test('a palette recolours the highlighters and pens, in a light or dark variant', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const passport = list.locator('[data-reorder-key="c"] .task')
  const before = await passport.evaluate((element) => getComputedStyle(element).backgroundColor)

  await list.getByRole('button', { name: 'Customize look' }).click()
  // A dropdown: the trigger shows the current palette, its list floats over the panel.
  const trigger = list.getByRole('button', { name: 'Palette' })
  await expect(trigger).toHaveAccessibleDescription('From the theme')
  const palettes = list.getByRole('listbox', { name: 'Palette' })
  await expect(palettes).toHaveCount(0)
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(palettes.getByRole('option')).toHaveText(['Classic', 'Soft', 'Earth', 'Ocean'])
  await expect(palettes.getByRole('option', { name: 'Classic' })).toBeFocused()
  await accessible(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(palettes.getByRole('option', { name: 'Earth' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(palettes).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAccessibleDescription('Earth')

  // Escape or a click elsewhere closes the list and leaves the panel open.
  await trigger.click()
  await expect(palettes.getByRole('option', { name: 'Earth' })).toHaveAttribute('aria-selected', 'true')
  await expect(palettes.getByRole('option', { name: 'Earth' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(palettes).toHaveCount(0)
  await trigger.click()
  await list.locator('.panel-title').click()
  await expect(palettes).toHaveCount(0)
  await expect(list.getByRole('region', { name: 'Customize the list' })).toBeVisible()
  // Earth's violet pen, light variant, on the default white background.
  await expect.poll(() => cssVar(list, '--c2-todo-list__pen-violet--color')).toBe('#664673')

  await list.getByRole('radio', { name: 'Night' }).click()
  await expect.poll(() => cssVar(list, '--c2-todo-list__pen-violet--color')).toBe('#d1b7dc')
  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ palette: 3, background: 6 })

  await list.getByRole('button', { name: 'Back to the list' }).click()
  await expect(passport).not.toHaveCSS('background-color', before)
  // The palette's accent is what changes most: Earth's dark sienna on the ticks, the progress and the Add button.
  await expect(list.locator('.add-button')).toHaveCSS('background-color', 'rgb(235, 169, 147)')
  await expect(list.locator('.add-button')).toHaveCSS('color', 'rgb(11, 18, 32)')
  await expect(list.locator('[data-reorder-key="f"] .label')).toHaveCSS('color', 'rgb(209, 183, 220)')
  // The per-task submenu offers the palette's colours.
  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await list.getByRole('menuitem', { name: 'Text colour' }).hover()
  await expect(list.getByRole('menuitemradio', { name: 'Violet ink text' })).toHaveCSS('background-color', 'rgb(209, 183, 220)')
})

test('choosing a palette recolours the progress, even over a pen stored earlier', async ({ page, scenario }) => {
  await scenario()
  await page.evaluate(() => localStorage.setItem('c2-todo-list:spec', JSON.stringify({ look: { pen: 'green' } })))
  await scenario('persist')
  const list = page.locator('c2-todo-list')
  const ring = list.locator('.ring [part="indicator"]')
  await expect(ring).toHaveCSS('stroke', 'rgb(15, 118, 110)')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Palette' }).click()
  await list.getByRole('option', { name: 'Earth' }).click()
  await list.getByRole('button', { name: 'Back to the list' }).click()
  // Earth's sienna accent, light variant.
  await expect(ring).toHaveCSS('stroke', 'rgb(154, 74, 38)')
  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ palette: 3 })

  await list.evaluate((element: TodoList) => (element.look = { palette: 'earth', progress: 'bar' }))
  await expect(list.locator('c2-progress.bar')).toHaveCSS('--c2-progress__indicator--background-color', '#9a4a26')
})

test('a palette on the default background follows a dark theme', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  await list.evaluate((element: TodoList) => {
    element.style.setProperty('--c2-todo-list__container--background-color', '#18181b')
    element.style.setProperty('--c2-todo-list__container--color', '#f4f4f5')
    element.look = { palette: 'ocean' }
  })
  await expect(list.locator('[data-reorder-key="f"] .label')).toHaveCSS('color', 'rgb(189, 181, 255)')
})

test('changes a task’s highlighter and text colour from its menu, in place', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  const row = list.locator('[data-reorder-key="b"] .task')

  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await list.getByRole('menuitem', { name: 'Highlight' }).hover()
  await list.getByRole('menuitemradio', { name: 'Pink highlighter' }).click()
  await expect(row).toHaveClass(/highlighted/)
  await expect(row).not.toHaveCSS('background-color', 'rgb(255, 255, 255)')

  await list.getByRole('menuitem', { name: 'Text colour' }).hover()
  await list.getByRole('menuitemradio', { name: 'Violet ink text' }).click()
  await expect(row.locator('.label')).toHaveCSS('color', 'rgb(124, 58, 237)')
  // The panel never opened: per-task styling happens in the list.
  await expect(list.getByRole('region', { name: 'Customize the list' })).toHaveCount(0)

  await expect.poll(() => list.evaluate((element: TodoList) => element.tasks.find((task) => task.id === 'b'))).toMatchObject({ highlight: 4, ink: 4 })
})

test('a custom pen and highlighter list stores positions, and a new list recolours the tasks in place', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  // The scenario's tasks were written with the default colours' names: they are read as positions.
  await expect
    .poll(() =>
      list.evaluate((element: TodoList) =>
        element.tasks.filter((task) => task.ink || task.highlight).map(({ id, ink, highlight }) => ({ id, ink, highlight })),
      ),
    )
    .toEqual([
      { id: 'c', ink: undefined, highlight: 1 },
      { id: 'f', ink: 4, highlight: undefined },
    ])

  const light = {
    pens: [
      { name: 'Plum', value: 'rgb(110, 40, 120)' },
      { name: 'Teal', value: 'rgb(0, 110, 110)' },
      'rgb(150, 60, 20)',
      { name: 'Moss', value: 'rgb(60, 100, 30)' },
    ],
    highlights: [{ name: 'Lemon', value: 'rgb(250, 230, 100)' }],
  }
  await props(list, light)
  const passport = list.locator('[data-reorder-key="c"] .task')
  const anna = list.locator('[data-reorder-key="f"] .label')
  await expect(anna).toHaveCSS('color', 'rgb(60, 100, 30)')
  const lightBackground = await passport.evaluate((element) => getComputedStyle(element).backgroundColor)

  // A dark theme hands over a list of the same length: the tasks keep their positions and take the new colours.
  await props(list, {
    pens: light.pens.map((pen) => (typeof pen === 'string' ? 'rgb(200, 230, 170)' : { ...pen, value: 'rgb(200, 230, 170)' })),
    highlights: [{ name: 'Lemon', value: 'rgb(90, 80, 10)' }],
  })
  await expect(anna).toHaveCSS('color', 'rgb(200, 230, 170)')
  await expect(passport).not.toHaveCSS('background-color', lightBackground)

  // The menu offers the list's colours under their labels and stores the chosen position.
  await list.getByRole('button', { name: 'Actions for Dentist appointment' }).click()
  await list.getByRole('menuitem', { name: 'Text colour' }).hover()
  // The default swatch and the list's four pens, nothing from the built-in list.
  await expect(list.getByRole('menuitemradio')).toHaveCount(5)
  await expect(list.getByRole('menuitemradio', { name: 'Violet ink text' })).toHaveCount(0)
  // A colour given without a name is called by its position.
  await expect(list.getByRole('menuitemradio', { name: 'Pen 3 text' })).toBeVisible()
  await list.getByRole('menuitemradio', { name: 'Teal text' }).click()
  await expect.poll(() => list.evaluate((element: TodoList) => element.tasks.find((task) => task.id === 'b')?.ink)).toBe(2)
})

test('custom backgrounds and palettes fill the panel and are stored by position', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  await props(list, {
    backgrounds: [
      { name: 'Cream', value: 'rgb(255, 250, 235)', color: 'rgb(40, 30, 20)' },
      { name: 'Ink', value: '#101828', color: 'rgb(240, 240, 250)' },
    ],
    palettes: [
      { name: 'Brand', accent: 'rgb(79, 70, 229)', pens: ['rgb(20, 20, 120)'], dark: { accent: 'rgb(165, 180, 252)', pens: ['rgb(200, 210, 255)'] } },
      { name: 'Forest', accent: 'rgb(21, 128, 61)' },
    ],
  })
  await list.getByRole('button', { name: 'Customize look' }).click()
  const backgrounds = list.getByRole('radiogroup', { name: 'Background' }).getByRole('radio')
  await expect(backgrounds).toHaveCount(3)
  await list.getByRole('radio', { name: 'Cream' }).click()
  await expect.poll(() => cssVar(list, '--c2-todo-list__container--background-color')).toBe('rgb(255, 250, 235)')
  await expect.poll(() => cssVar(list, '--c2-todo-list__accent--color')).toBe('rgb(79, 70, 229)')

  const trigger = list.getByRole('button', { name: 'Palette' })
  await expect(trigger).toHaveAccessibleDescription('Brand')
  await trigger.click()
  await expect(list.getByRole('listbox', { name: 'Palette' }).getByRole('option')).toHaveText(['Brand', 'Forest'])
  await list.getByRole('option', { name: 'Forest' }).click()
  await expect.poll(() => cssVar(list, '--c2-todo-list__accent--color')).toBe('rgb(21, 128, 61)')
  await expect.poll(() => list.evaluate((element: TodoList) => element.look)).toEqual({ background: 1, palette: 2 })

  // A dark background takes the palette's dark variant, worked out from the background's colour.
  await trigger.click()
  await list.getByRole('option', { name: 'Brand' }).click()
  await list.getByRole('radio', { name: 'Ink' }).click()
  await expect.poll(() => cssVar(list, '--c2-todo-list__accent--color')).toBe('rgb(165, 180, 252)')
  await list.getByRole('button', { name: 'Back to the list' }).click()
  await expect(list.locator('[data-reorder-key="b"] .label')).toHaveCSS('color', 'rgb(240, 240, 250)')
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
  await expect(list.getByText('Saved in this browser')).toHaveCount(0)
  await list.getByRole('button', { name: 'Back to the list' }).click()
  await list.getByRole('checkbox', { name: 'Renew passport' }).click()

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('c2-todo-list:spec') ?? 'null'))
  expect(stored.look).toEqual({ background: 5, progress: 'hero' })
  expect(stored.tasks.find((task: { id: string }) => task.id === 'c').done).toBe(true)

  await scenario('persist')
  await expect(list.locator('.container')).toHaveCSS('background-color', 'rgb(248, 241, 228)')
  await expect(list.locator('.progress-hero')).toBeVisible()
  await expect(list.getByRole('checkbox', { name: 'Renew passport' })).toHaveAttribute('aria-checked', 'true')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Reset' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('c2-todo-list:spec') ?? 'null').look)).toEqual({})
})

test('changes the list icon from the customize panel, and remembers it', async ({ page, scenario }) => {
  await scenario('persist')
  const list = page.locator('c2-todo-list')
  const ring = list.locator('.ring-value')
  await expect(ring.locator('c2-task-icon-calendar')).toBeAttached()

  await list.getByRole('button', { name: 'Customize look' }).click()
  const toggle = list.getByRole('button', { name: 'Icon' })
  await expect(toggle).toHaveAccessibleDescription('Schedule · from the heading')
  await toggle.click()
  // The named list icons, after Automatic (the heading's suggestion) and Empty.
  const tiles = list.locator('.list-icon-option')
  await expect(tiles).toHaveCount(22)
  await expect(tiles.nth(0)).toHaveText('Automatic')
  await expect(tiles.nth(1)).toHaveText('Empty')
  await expect(tiles.nth(2)).toHaveText('Work')
  await expect(tiles.nth(0)).toBeFocused()
  await accessible(page)
  // Four to a row: down goes from Automatic to Groceries.
  await page.keyboard.press('ArrowDown')
  await expect(list.getByRole('button', { name: 'Groceries' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(toggle).toBeFocused()
  await expect(toggle).toHaveAccessibleDescription('Groceries')
  await expect(list).toHaveAttribute('data-events', 'look-change')

  // Escape closes the dropdown without changing anything, and leaves the panel open.
  await toggle.click()
  await expect(list.getByRole('button', { name: 'Groceries' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(list.locator('.panel-icons')).toHaveCount(0)
  await expect(list.getByRole('region', { name: 'Customize the list' })).toBeVisible()
  await expect(list).toHaveAttribute('data-events', 'look-change')

  await list.getByRole('button', { name: 'Back to the list' }).click()
  await expect(ring.locator('c2-task-icon-cart')).toBeAttached()
  await scenario('persist')
  await expect(ring.locator('c2-task-icon-cart')).toBeAttached()
  expect(await list.evaluate((element: TodoList) => element.look.icon)).toBe('groceries')

  await list.getByRole('button', { name: 'Customize look' }).click()
  await list.getByRole('button', { name: 'Icon' }).click()
  await list.getByRole('button', { name: 'Empty' }).click()
  await expect(list.getByRole('button', { name: 'Icon' })).toHaveAccessibleDescription('Empty')
  await list.getByRole('button', { name: 'Icon' }).click()
  await list.getByRole('button', { name: 'Automatic' }).click()
  await expect(list.getByRole('button', { name: 'Icon' })).toHaveAccessibleDescription('Schedule · from the heading')
})

test('takes a list icon name in the icon attribute', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-todo-list')
  await list.evaluate((element: TodoList) => (element.icon = 'travel'))
  await expect(list.locator('.ring-value c2-task-icon-flight')).toBeAttached()
  // Any task icon name still works, and none leaves it empty.
  await list.evaluate((element: TodoList) => (element.icon = 'gift'))
  await expect(list.locator('.ring-value c2-task-icon-gift')).toBeAttached()
  await list.evaluate((element: TodoList) => (element.icon = 'none'))
  await expect(list.locator('.ring-value [class="icon"]')).toHaveCount(0)
})

test('ignores a stored look that is no longer valid', async ({ page, scenario }) => {
  await scenario()
  await page.evaluate(() =>
    localStorage.setItem('c2-todo-list:spec', JSON.stringify({ look: { background: 'neon', pen: 'green', progress: 42, icon: 'nope' } })),
  )
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
  await list.locator('[data-reorder-key="c"] .task').press('F2')
  await list.locator('[data-reorder-key="b"] .label').click()
  await expect(list.locator('.editor')).toHaveCount(0)
  // A readonly list shows the whole note instead.
  await expect(list.locator('[data-reorder-key="b"] .note')).toHaveText('Dr. Martin, 14 rue Oberkampf Bring the insurance card')
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
  // A c2-progress, named by the count it draws.
  await expect(list.locator('c2-progress.bar')).toHaveJSProperty('value', 33)
  await expect(list.locator('c2-progress.bar').getByRole('progressbar', { name: '2 of 6 tasks done' })).toBeVisible()
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

for (const look of [
  'classic-sand',
  'soft-paper',
  'soft-default',
  'earth-mint',
  'ocean-sky',
  'earth-blush',
  'soft-night',
  'ocean-night',
  'earth-night',
] as const) {
  test(`has no detectable accessibility violations with the ${look} palette and background`, async ({ page }) => {
    await page.goto(`/packages/components/todo-list/test/scenarios.html?scenario=default&look=${look}`)
    await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
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
