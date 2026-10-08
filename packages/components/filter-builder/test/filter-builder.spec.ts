import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const tree = (page: Page) => page.getByRole('status', { name: 'Tree' })
const chips = (page: Page) => page.locator('c2-filter-builder c2-chip.chip')
const item = (page: Page, text: string) => page.locator('c2-filter-builder c2-overlay c2-command-item', { hasText: text }).first()
const search = (page: Page) => page.locator('c2-filter-builder c2-overlay c2-command input')
const addButton = (page: Page) => page.getByRole('button', { name: 'Filter', exact: true })

async function resolvePeople(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { pendingQueries(): string[] }).pendingQueries().length)).toBeGreaterThan(0)
  await page.evaluate(() => (window as unknown as { resolvePeople(): void }).resolvePeople())
}

test('an empty bar shows only the add button', async ({ page, scenario }) => {
  await scenario()
  await expect(addButton(page)).toBeVisible()
  await expect(chips(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0)
})

test('a given tree shows one chip per condition, read as a sentence', async ({ page, scenario }) => {
  await scenario('applied')
  await expect(chips(page)).toHaveCount(2)
  await expect(chips(page).nth(0)).toContainText('Status')
  await expect(chips(page).nth(0)).toContainText('is any of')
  await expect(chips(page).nth(0)).toContainText('In progress, In review')
  // The assignee's label comes from `resolveOptions`: the tree only holds `ana`.
  await expect(chips(page).nth(1)).toContainText('Ana Ng')
  await expect(page.getByRole('button', { name: 'Status: is any of', exact: true })).toHaveAttribute('aria-haspopup', 'listbox')
  await expect(page.getByRole('button', { name: 'Remove Status is any of In progress, In review' })).toBeVisible()
  await expect(tree(page)).toHaveText('')
})

test('more than two values collapse into a count, using the field summary when given', async ({ page, scenario }) => {
  await scenario('many-values')
  await expect(chips(page).first()).toContainText('3 selected')
})

test('picking a field opens its values; ticking values builds an is / is any of condition', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await expect(search(page)).toBeFocused()
  await item(page, 'Status').click()
  await expect(chips(page)).toHaveCount(1)
  await expect(chips(page).first()).toHaveClass(/draft/)
  await expect(item(page, 'In progress')).toBeVisible()
  await expect(item(page, 'In progress')).toContainText('41')
  await item(page, 'In progress').click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"status","operator":"eq","value":"doing"}]}')
  await expect(chips(page).first()).toContainText('is')
  await expect(item(page, 'In progress')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.type('review')
  await page.keyboard.press('Enter')
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"status","operator":"in","value":["doing","review"]}]}')
  await expect(chips(page).first()).toContainText('is any of')
  await page.keyboard.press('Escape')
  await expect(page.locator('c2-filter-builder c2-overlay')).not.toHaveAttribute('open')
  await expect(page.getByRole('button', { name: 'Status is any of: In progress, In review' })).toBeFocused()
})

test('unticking every value and closing drops the condition', async ({ page, scenario }) => {
  await scenario('many-values')
  await page.getByRole('button', { name: /^Status is any of:/ }).click()
  for (const label of ['To do', 'In progress', 'In review']) await item(page, label).click()
  await page.keyboard.press('Escape')
  await expect(chips(page)).toHaveCount(0)
  await expect(tree(page)).toHaveText('{"op":"and","rules":[]}')
})

test('the field search also finds values and adds them in one step', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await page.keyboard.type('in rev')
  await expect(item(page, 'In review')).toContainText('Status')
  await page.keyboard.press('Enter')
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"status","operator":"eq","value":"review"}]}')
  await expect(page.locator('c2-filter-builder c2-overlay')).not.toHaveAttribute('open')
})

test('a condition closed without a value is dropped and never reported', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await item(page, 'Title').click()
  await expect(chips(page)).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(chips(page)).toHaveCount(0)
  await expect(tree(page)).toHaveText('')
  await expect(addButton(page)).toBeFocused()
})

test('a text condition commits as you type and closes on Enter', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await item(page, 'Title').click()
  await expect(page.locator('c2-filter-builder c2-overlay c2-text-field input')).toBeFocused()
  await page.keyboard.type('sort')
  await page.keyboard.press('Enter')
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"title","operator":"contains","value":"sort"}]}')
  await expect(chips(page).first()).toContainText('Title')
  await expect(chips(page).first()).toContainText('contains')
  await expect(chips(page).first()).toContainText('sort')
})

test('a number condition shows its unit', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await item(page, 'Estimate').click()
  await page.keyboard.type('5')
  await page.keyboard.press('Enter')
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"estimate","operator":"eq","value":5}]}')
  await expect(chips(page).first()).toContainText('5 pts')
})

test('a boolean field is added complete, with no value step', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await item(page, 'Blocked').click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"blocked","operator":"is_true"}]}')
  await expect(chips(page).first()).toContainText('is true')
  await expect(chips(page).first().locator('c2-chip-part[name="value"]')).toHaveCount(0)
})

test('changing the operator keeps the value, and a valueless operator drops it', async ({ page, scenario }) => {
  await scenario('applied')
  await page.getByRole('button', { name: 'Status: is any of', exact: true }).click()
  const list = page.locator('c2-filter-builder c2-overlay c2-list')
  await expect(list).toBeVisible()
  await list.locator('c2-list-item[value="neq"]').click()
  await expect(tree(page)).toContainText('{"field":"status","operator":"not_in","value":["doing","review"]}')
  await page.getByRole('button', { name: 'Status: is none of', exact: true }).click()
  await list.locator('c2-list-item[value="empty"]').click()
  await expect(tree(page)).toContainText('{"field":"status","operator":"empty"}')
  await expect(chips(page).first().locator('c2-chip-part[name="value"]')).toHaveCount(0)
})

test('a relative date picks a preset or a custom amount and unit', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await item(page, 'Due').click()
  await page.keyboard.press('Escape')
  await addButton(page).click()
  await item(page, 'Due').click()
  await page.locator('c2-filter-builder c2-overlay c2-date-input input').fill('2026-10-31')
  await page.keyboard.press('Enter')
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"due","operator":"eq","value":"2026-10-31"}]}')
  await page.getByRole('button', { name: 'Due: is', exact: true }).click()
  await page.locator('c2-filter-builder c2-overlay c2-list-item', { hasText: 'in the last' }).click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"due","operator":"last","value":{"amount":7,"unit":"day"}}]}')
  await page.locator('c2-filter-builder c2-overlay c2-chip', { hasText: '30 days' }).click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"due","operator":"last","value":{"amount":30,"unit":"day"}}]}')
  await page.locator('c2-filter-builder c2-overlay c2-list-item', { hasText: 'weeks' }).click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"due","operator":"last","value":{"amount":30,"unit":"week"}}]}')
  await expect(chips(page).first()).toContainText('in the last')
  await expect(chips(page).first()).toContainText('30 weeks')
})

test('async options load on open and again for each query, and the pick is labelled', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).click()
  await item(page, 'Assignee').click()
  await expect(page.locator('c2-filter-builder c2-overlay')).toContainText('Loading…')
  await resolvePeople(page)
  await expect(item(page, 'Ben Kowalski')).toBeVisible()
  await page.keyboard.type('car')
  await resolvePeople(page)
  await expect(item(page, 'Ben Kowalski')).toHaveCount(0)
  await item(page, 'Carla Ruiz').click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"assignee","operator":"eq","value":"carla"}]}')
  await page.keyboard.press('Escape')
  await expect(chips(page).first()).toContainText('Carla Ruiz')
  await expect(chips(page).first().locator('c2-avatar')).toHaveCount(1)
})

test('Clear empties the tree; Backspace on a chip removes it and keeps focus in the bar', async ({ page, scenario }) => {
  await scenario('applied')
  await page.getByRole('button', { name: 'Status: is any of', exact: true }).focus()
  await page.keyboard.press('Backspace')
  await expect(chips(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Assignee: is', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(chips(page)).toHaveCount(0)
  await expect(tree(page)).toHaveText('{"op":"and","rules":[]}')
  await expect(addButton(page)).toBeFocused()
})

test('a nested group and an unknown field show as plain, removable chips', async ({ page, scenario }) => {
  await scenario('group')
  await expect(chips(page).nth(1)).toContainText('2 conditions')
  await expect(chips(page).nth(1)).toContainText('any')
  await page.getByRole('button', { name: 'Remove 2 conditions any' }).click()
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"status","operator":"eq","value":"todo"}]}')
  await scenario('unknown')
  await expect(chips(page).first()).toContainText('priority')
  await expect(chips(page).first().locator('c2-chip-part[interactive]')).toHaveCount(0)
})

test('disabled blocks adding, editing and removing', async ({ page, scenario }) => {
  await scenario('disabled')
  await expect(addButton(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Status: is any of', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: /^Remove Status/ })).toBeDisabled()
})

test('labels translate the interface text', async ({ page, scenario }) => {
  await scenario('labels')
  await expect(page.getByRole('button', { name: 'Filtrer', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Filtrer', exact: true }).click()
  await item(page, 'Status').click()
  await item(page, 'Done').click()
  await expect(chips(page).first()).toContainText('est')
  await expect(page.getByRole('button', { name: 'Effacer' })).toBeVisible()
})

test('renderValue replaces the value part of the chip', async ({ page, scenario }) => {
  await scenario('render-value')
  await expect(chips(page).first().locator('.custom-value')).toHaveText('IN PROGRESS + IN REVIEW')
})

test('a narrow bar becomes a Filters button with a sheet of editable conditions', async ({ page, scenario }) => {
  await scenario('compact')
  const filters = page.getByRole('button', { name: 'Filters 2' })
  await expect(filters).toBeVisible()
  await expect(addButton(page)).toHaveCount(0)
  await filters.click()
  const sheet = page.locator('c2-filter-builder c2-sheet')
  await expect(sheet).toHaveAttribute('open')
  await sheet.locator('c2-list-item', { hasText: 'Status' }).click()
  await sheet.locator('c2-command-item', { hasText: 'Done' }).click()
  await expect(tree(page)).toContainText('{"field":"status","operator":"in","value":["doing","review","done"]}')
  await sheet.getByRole('button', { name: 'Status' }).click()
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(sheet).not.toHaveAttribute('open')
  await expect(filters).toBeFocused()
})

for (const state of ['default', 'applied', 'compact']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the open field picker has no axe violations', async ({ page, scenario }) => {
  await scenario('applied')
  await addButton(page).click()
  await expect(search(page)).toBeFocused()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('the whole flow works from the keyboard and focus returns to the chip', async ({ page, scenario }) => {
  await scenario()
  await addButton(page).focus()
  await page.keyboard.press('Enter')
  await expect(search(page)).toBeFocused()
  await page.keyboard.type('esti')
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-filter-builder c2-overlay c2-number-input input')).toBeFocused()
  await page.keyboard.type('3')
  await page.keyboard.press('Enter')
  await expect(tree(page)).toHaveText('{"op":"and","rules":[{"field":"estimate","operator":"eq","value":3}]}')
  await expect(page.getByRole('button', { name: 'Estimate is: 3 pts', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('button', { name: 'Estimate: is', exact: true })).toBeFocused()
})

test('chips sit on one row and the editor opens under the part that was clicked', async ({ page, scenario }) => {
  await scenario('applied')
  const [first, second] = await Promise.all([chips(page).nth(0).boundingBox(), chips(page).nth(1).boundingBox()])
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(1)
  const value = page.getByRole('button', { name: /^Status is any of:/ })
  await value.click()
  const popover = page.locator('c2-filter-builder [part="popover"]')
  await expect(popover).toBeVisible()
  const [anchor, box] = await Promise.all([value.boundingBox(), popover.boundingBox()])
  expect(box!.y).toBeGreaterThanOrEqual(anchor!.y + anchor!.height)
  expect(Math.abs(box!.x - anchor!.x)).toBeLessThan(2)
})
