import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

// Rows state their role and aria-* through ElementInternals, which getByRole cannot see, so they are found by value.
const row = (page: Page, value: string) => page.locator(`c2-command-item[value="${value}"]`)
const field = (page: Page) => page.getByRole('combobox', { name: 'Search commands' })
const activeValue = (page: Page) =>
  page.locator('c2-command').evaluate((element) => (element as HTMLElement & { activeItem?: { value: string } }).activeItem?.value)
const events = (page: Page) =>
  page.locator('c2-command').evaluate((element) => JSON.parse(element.getAttribute('data-events') ?? '[]').map((d: { value: string }) => d.value))

const palette = `<c2-command>
  <c2-command-group heading="Suggestions">
    <c2-command-item value="calendar">Calendar</c2-command-item>
    <c2-command-item value="emoji" keywords="smiley, face">Search emoji</c2-command-item>
    <c2-command-item value="calculator" disabled>Calculator</c2-command-item>
  </c2-command-group>
  <c2-command-separator></c2-command-separator>
  <c2-command-group heading="Settings">
    <c2-command-item value="profile">Profile<span slot="shortcut">⌘P</span></c2-command-item>
    <c2-command-item value="billing">Billing</c2-command-item>
  </c2-command-group>
</c2-command>`

test('the first enabled row is highlighted and the field announces it', async ({ page, renderScenario }) => {
  await renderScenario(palette)
  await expect(row(page, 'calendar')).toHaveHostAria('role', 'option')
  await expect(row(page, 'calendar')).toHaveHostAria('aria-selected', 'true')
  await expect(row(page, 'emoji')).toHaveHostAria('aria-selected', 'false')
  await expect(row(page, 'calculator')).toHaveHostAria('aria-disabled', 'true')
  await expect(page.getByRole('listbox', { name: 'Search commands' })).toBeVisible()
  const pointsAtCalendar = () =>
    page.locator('c2-command').evaluate((host) => {
      const input = host.shadowRoot!.querySelector('input') as HTMLInputElement & { ariaActiveDescendantElement?: Element | null }
      return !('ariaActiveDescendantElement' in input) || input.ariaActiveDescendantElement === host.querySelector('[value="calendar"]')
    })
  expect(await pointsAtCalendar()).toBe(true)
})

test('typing filters rows by label and keywords and hides groups without a match', async ({ page, renderScenario }) => {
  await renderScenario(palette)
  await field(page).click()
  await page.keyboard.type('face')
  await expect(row(page, 'emoji')).toBeVisible()
  await expect(row(page, 'calendar')).toBeHidden()
  await expect(page.locator('c2-command-group[heading="Settings"]')).toBeHidden()
  await expect(page.locator('c2-command-separator')).toBeHidden()
  expect(await activeValue(page)).toBe('emoji')

  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('bil')
  await expect(row(page, 'billing')).toBeVisible()
  await expect(page.locator('c2-command-group[heading="Suggestions"]')).toBeHidden()
  await expect(page.locator('c2-command')).toHaveJSProperty('query', 'bil')
})

test('every query word must match, and nothing matching shows the empty slot', async ({ page, renderScenario }) => {
  await renderScenario(palette)
  await field(page).fill('search emo')
  await expect(row(page, 'emoji')).toBeVisible()
  await field(page).fill('search billing')
  await expect(page.getByText('No results found.')).toBeVisible()
  await expect(page.locator('c2-command-item:visible')).toHaveCount(0)
  await field(page).fill('')
  await expect(page.getByText('No results found.')).toBeHidden()
  await expect(page.locator('c2-command-item:visible')).toHaveCount(5)
})

test('arrow keys skip disabled rows, stop at the ends, and Enter fires command-select', async ({ page, renderScenario }) => {
  await renderScenario(palette)
  await watch(page.locator('c2-command'), 'command-select')
  await field(page).click()
  await page.keyboard.press('ArrowUp')
  expect(await activeValue(page)).toBe('calendar')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect(await activeValue(page)).toBe('profile')
  await expect(row(page, 'profile')).toHaveHostAria('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  expect(await activeValue(page)).toBe('billing')
  await page.keyboard.press('Enter')
  expect(await events(page)).toEqual(['billing'])
  await expect(field(page)).toBeFocused()
})

test('loop wraps the highlight around the ends', async ({ page, renderScenario }) => {
  await renderScenario(palette.replace('<c2-command>', '<c2-command loop>'))
  await field(page).click()
  await page.keyboard.press('ArrowUp')
  expect(await activeValue(page)).toBe('billing')
  await page.keyboard.press('ArrowDown')
  expect(await activeValue(page)).toBe('calendar')
})

test('hovering highlights a row and a click activates it without leaving the field', async ({ page, renderScenario }) => {
  await renderScenario(palette)
  await watch(page.locator('c2-command'), 'command-select')
  await field(page).click()
  await row(page, 'profile').hover()
  expect(await activeValue(page)).toBe('profile')
  await row(page, 'profile').click()
  await row(page, 'calculator').click()
  expect(await events(page)).toEqual(['profile'])
  await expect(field(page)).toBeFocused()
})

test('an href row navigates unless command-select is cancelled', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-command><c2-command-item value="docs" href="#docs">Docs</c2-command-item><c2-command-item value="api" href="#api">API</c2-command-item></c2-command>`,
  )
  await page
    .locator('c2-command')
    .evaluate((element) => element.addEventListener('command-select', (event) => (event as CustomEvent).detail.value === 'api' && event.preventDefault()))
  await field(page).click()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#docs$/)
  await row(page, 'api').click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#docs$/)
})

test('manual-filter shows every row whatever the query', async ({ page, renderScenario }) => {
  await renderScenario(palette.replace('<c2-command>', '<c2-command manual-filter>'))
  await field(page).fill('zzz')
  await expect(page.locator('c2-command-item:visible')).toHaveCount(5)
})

test('rows added later are filtered and can be highlighted', async ({ page, renderScenario }) => {
  await renderScenario(palette)
  await field(page).fill('rep')
  await expect(page.getByText('No results found.')).toBeVisible()
  await page
    .locator('c2-command-group[heading="Settings"]')
    .evaluate((group) => group.insertAdjacentHTML('beforeend', '<c2-command-item value="reports">Reports</c2-command-item>'))
  await expect(row(page, 'reports')).toBeVisible()
  await expect(page.getByText('No results found.')).toBeHidden()
  await expect.poll(() => activeValue(page)).toBe('reports')
})

test('has no accessibility violations, full and filtered', async ({ page, renderScenario }) => {
  await renderScenario(palette.replace('</c2-command>', '<span slot="footer">↑↓ to navigate</span></c2-command>'))
  await accessible(page)
  await field(page).fill('zzz')
  await accessible(page)
})
