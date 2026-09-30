import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('shows the month of its value with that day selected', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('grid', { name: 'September 2026' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toHaveAttribute('aria-selected', 'true')
})

test('selects a day with the pointer and fires change', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('gridcell', { name: /September 18, 2026/ }).click()
  await expect(page.locator('c2-calendar')).toHaveAttribute('value', '2026-09-18')
  await expect(page.getByRole('status')).toHaveText('2026-09-18')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toHaveAttribute('aria-selected', 'false')
})

test('moves with arrow and page keys and selects with Enter', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Next month' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('gridcell', { name: /September 11, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('gridcell', { name: /September 18, 2026/ })).toBeFocused()
  await page.keyboard.press('PageDown')
  await expect(page.getByRole('gridcell', { name: /October 18, 2026/ })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-calendar')).toHaveAttribute('value', '2026-10-18')
})

test('navigates months with the header buttons', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('grid', { name: 'October 2026' })).toBeVisible()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page.getByRole('grid', { name: 'August 2026' })).toBeVisible()
})

test('starts the week on Sunday when asked', async ({ page, scenario }) => {
  await scenario('sunday')
  // September 1, 2026 is a Tuesday: two leading blanks with Sunday first.
  const firstRow = page.getByRole('row').nth(1)
  await expect(firstRow.getByRole('gridcell').nth(2)).toHaveAccessibleName(/September 1, 2026/)
})

test('enforces min and max dates', async ({ page, scenario }) => {
  await scenario('constrained')
  await expect(page.getByRole('gridcell', { name: /September 7, 2026/ })).toBeDisabled()
  await expect(page.getByRole('gridcell', { name: /September 20, 2026/ })).toBeEnabled()
  await expect(page.getByRole('gridcell', { name: /September 21, 2026/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled()
})

test('does nothing while disabled', async ({ page, scenario }) => {
  await scenario('disabled')
  await expect(page.getByRole('gridcell', { name: /September 18, 2026/ })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled()
})

test('submits its value, validates required and resets', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('gridcell', { name: /September 18, 2026/ }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('status')).toHaveText('{"day":"2026-09-18"}')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('c2-calendar')).toHaveAttribute('value', '2026-09-10')
})

test('is invalid while required and empty', async ({ page, scenario }) => {
  await scenario('empty')
  expect(await page.locator('c2-calendar').evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('group', { name: 'Choose a date' })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
