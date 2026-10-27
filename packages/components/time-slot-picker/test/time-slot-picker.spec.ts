import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Picker = HTMLElement & { value: string; date: string }

const picker = (page: Page) => page.locator('c2-time-slot-picker')
const value = (page: Page) => picker(page).evaluate((element: Picker) => element.value)
const events = async (page: Page) => JSON.parse((await picker(page).getAttribute('data-events'))!)

// Wednesday 14 October 2026: free times at 09:00, 09:30 and 14:00, 18:00 taken; nothing on the 15th; one time on the 16th.
const SLOTS = JSON.stringify([
  { start: '2026-10-14T09:00:00Z', end: '2026-10-14T09:30:00Z' },
  { start: '2026-10-14T09:30:00Z', end: '2026-10-14T10:00:00Z' },
  { start: '2026-10-14T14:00:00Z', end: '2026-10-14T14:30:00Z' },
  { start: '2026-10-14T18:00:00Z', end: '2026-10-14T18:30:00Z', available: false },
  { start: '2026-10-16T10:00:00Z', end: '2026-10-16T10:30:00Z' },
])

const scenario = (attributes = '', lang = 'en-GB', zone = 'UTC') =>
  `<div lang="${lang}"><c2-time-slot-picker time-zone="${zone}" slots='${SLOTS}' ${attributes}></c2-time-slot-picker></div>`

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T08:00:00Z'))
})

test('shows the first free day, its times grouped by period in the zone, taken ones named as such, booked days disabled', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await expect(picker(page)).toHaveHostAria('role', 'group')
  await expect(picker(page)).toHaveHostAria('aria-label', 'Choose a time')
  await expect(page.getByRole('option', { name: /^Wednesday,? 14 October 2026/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('option', { name: /^Thursday,? 15 October 2026/ })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('listbox', { name: 'Morning' }).getByRole('option')).toHaveText([/^0?9:00$/, /^0?9:30$/])
  await expect(page.getByRole('listbox', { name: 'Afternoon' }).getByRole('option')).toHaveText([/^14:00$/])
  await expect(page.getByRole('listbox', { name: 'Evening' }).getByRole('option', { name: '18:00, unavailable' })).toHaveAttribute('aria-disabled', 'true')
  await expect(picker(page).locator('[part="zone"]')).toHaveText('Times in Coordinated Universal Time')
  await accessible(page)
})

test('a click picks the time: input then change with the slot, and the form receives its start', async ({ page, renderScenario }) => {
  await renderScenario(`<form lang="en-GB"><c2-time-slot-picker name="when" required time-zone="UTC" slots='${SLOTS}'></c2-time-slot-picker></form>`)
  await watch(picker(page), 'change')
  expect(await picker(page).evaluate((element: Picker & { checkValidity(): boolean }) => element.checkValidity())).toBe(false)
  await page.getByRole('option', { name: /^0?9:30$/ }).click()
  expect(await value(page)).toBe('2026-10-14T09:30:00Z')
  await expect(page.getByRole('option', { name: /^0?9:30$/ })).toHaveAttribute('aria-selected', 'true')
  expect(await events(page)).toEqual([{ value: '2026-10-14T09:30:00Z', slot: { start: '2026-10-14T09:30:00Z', end: '2026-10-14T10:00:00Z' } }])
  expect(await page.locator('form').evaluate((form: HTMLFormElement) => new FormData(form).get('when'))).toBe('2026-10-14T09:30:00Z')
  await page.getByRole('option', { name: '18:00, unavailable' }).click({ force: true })
  expect(await value(page)).toBe('2026-10-14T09:30:00Z')
})

test('a day with no free time offers the next one; showing a day fires date-change', async ({ page, renderScenario }) => {
  await renderScenario(scenario('date="2026-10-13"'))
  await watch(picker(page), 'date-change')
  await expect(picker(page).locator('[part="empty"]')).toContainText(/No times on Tuesday,? 13 October/)
  await page.getByRole('button', { name: /Next available: Wednesday,? 14 October/ }).click()
  await expect(page.getByRole('listbox', { name: 'Morning' })).toBeVisible()
  await page.getByRole('option', { name: /^Friday,? 16 October 2026/ }).click()
  await expect(page.getByRole('option', { name: /^10:00$/ })).toBeVisible()
  expect(await events(page)).toEqual([{ date: '2026-10-14' }, { date: '2026-10-16' }])
})

test('the times have one tab stop; the arrows move across groups and step over taken times; Enter picks', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await page.getByRole('option', { name: /^0?9:00$/ }).focus()
  await expect(page.getByRole('option', { name: /^0?9:30$/ })).toHaveAttribute('tabindex', '-1')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('option', { name: /^14:00$/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('option', { name: /^14:00$/ })).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  expect(await value(page)).toBe('2026-10-14T09:00:00Z')
})

test('times are filed under their day in the time zone shown; show-end shows the range; group-by none lists one group', async ({ page, renderScenario }) => {
  await renderScenario(scenario('show-end group-by="none"', 'en-GB', 'Asia/Tokyo'))
  // 18:00 UTC on the 14th is 03:00 on the 15th in Tokyo.
  await expect(page.getByRole('listbox', { name: /^Times on Wednesday,? 14 October/ }).getByRole('option')).toHaveText([
    /18:00\s*–\s*18:30/,
    /18:30\s*–\s*19:00/,
    /23:00\s*–\s*23:30/,
  ])
  // Its only time on the 15th is taken, so the 15th is booked.
  await expect(page.getByRole('option', { name: /^Thursday,? 15 October 2026/ })).toHaveAttribute('aria-disabled', 'true')
})

test('loading shows a busy list; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(scenario('loading', 'fr'))
  await expect(page.getByRole('listbox', { name: 'Chargement des horaires' })).toHaveAttribute('aria-busy', 'true')
  await picker(page).evaluate((element: Picker & { loading: boolean }) => (element.loading = false))
  await expect(page.getByRole('listbox', { name: 'Matin' }).getByRole('option')).toHaveText([/^0?9:00$/, /^0?9:30$/])
  await expect(picker(page)).toHaveHostAria('aria-label', 'Choisir un horaire')
  await expect(page.getByRole('option', { name: '18:00, indisponible' })).toBeVisible()
})

test('slots that arrive after the picker renders move it to their first free day, and set from outside the strip reports the days shown', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="en-GB"><c2-time-slot-picker time-zone="UTC"></c2-time-slot-picker></div>`)
  await watch(picker(page), 'range-change')
  await picker(page).evaluate((element: Picker & { slots: unknown }, slots) => (element.slots = JSON.parse(slots)), JSON.stringify([{ start: '2026-10-27T09:00:00Z' }]))
  await expect(page.getByRole('option', { name: /^Tuesday,? 27 October 2026/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('option', { name: /^0?9:00$/ })).toBeVisible()
  expect(await events(page)).toEqual([{ start: '2026-10-26', end: '2026-11-01' }])
})
