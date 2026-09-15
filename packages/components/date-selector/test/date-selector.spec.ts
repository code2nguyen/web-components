import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('completes a range, then starts a new one', async ({ page, scenario }) => {
  await scenario()
  const selector = page.locator('c2-date-selector')
  await page.getByRole('gridcell', { name: /September 15, 2026/ }).click()
  await expect(selector).toHaveAttribute('from', '2026-09-10')
  await expect(selector).toHaveAttribute('to', '2026-09-15')
  await expect(page.getByRole('status')).toHaveText('2026-09-10/2026-09-15')

  await page.getByRole('gridcell', { name: /September 18, 2026/ }).click()
  await expect(selector).toHaveAttribute('from', '2026-09-18')
  await expect(selector).toHaveAttribute('to', '')
})

test('an earlier second date restarts the range', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('gridcell', { name: /September 7, 2026/ }).click()
  await expect(page.locator('c2-date-selector')).toHaveAttribute('from', '2026-09-07')
  await expect(page.locator('c2-date-selector')).toHaveAttribute('to', '')
})

test('moves through the calendar with arrow and page keys', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('gridcell', { name: /September 10, 2026/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('gridcell', { name: /September 11, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('gridcell', { name: /September 18, 2026/ })).toBeFocused()
  await page.keyboard.press('PageDown')
  await expect(page.getByRole('gridcell', { name: /October 18, 2026/ })).toBeFocused()
})

test('enforces min and max dates', async ({ page, scenario }) => {
  await scenario('constrained')
  await expect(page.getByRole('gridcell', { name: /September 7, 2026/ })).toBeDisabled()
  await expect(page.getByRole('gridcell', { name: /September 20, 2026/ })).toBeEnabled()
  await expect(page.getByRole('gridcell', { name: /September 21, 2026/ })).toBeDisabled()
})

test('submits both endpoints and resets to authored values', async ({ page, scenario }) => {
  await scenario('complete')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('status')).toHaveText('{"trip":"2026-09-10","trip-end":"2026-09-15"}')
  await page.getByRole('gridcell', { name: /September 18, 2026/ }).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('c2-date-selector')).toHaveAttribute('from', '2026-09-10')
  await expect(page.locator('c2-date-selector')).toHaveAttribute('to', '2026-09-15')
})

test('has an accessible calendar structure without axe violations', async ({ page, scenario }) => {
  await scenario('complete')
  await expect(page.getByRole('group', { name: 'Choose a date range' })).toBeVisible()
  await expect(page.getByRole('grid', { name: 'September 2026' })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
