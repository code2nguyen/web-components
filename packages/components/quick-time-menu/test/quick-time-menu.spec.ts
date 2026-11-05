import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

// Monday 9 November 2026, 14:12 in Paris.
const NOW = '2026-11-09T13:12:00Z'
const ZONE = 'Europe/Paris'
const menu = (page: Page, selector = 'c2-quick-time-menu') => page.locator(selector)
const trigger = (page: Page) => menu(page).locator('.trigger')
const rows = (page: Page) => menu(page).locator('[role="menuitemradio"], [role="menuitem"]')
const events = async (page: Page, selector = 'c2-quick-time-menu') => JSON.parse((await menu(page, selector).getAttribute('data-events')) ?? '[]')

const resolve = (page: Page, at: string, now = NOW, extra: Record<string, string> = {}) =>
  page.evaluate(
    ({ at, now, zone, extra }) =>
      (window as unknown as { quickTime: { resolveQuickTime: (at: string, options: object) => string } }).quickTime.resolveQuickTime(at, {
        now,
        timeZone: zone,
        locale: 'en-GB',
        ...extra,
      }),
    { at, now, zone: ZONE, extra },
  )

test('expressions resolve to wall-clock times in the zone, and those that do not apply resolve to nothing', async ({ page, renderScenario }) => {
  await renderScenario('')
  const cases: Record<string, string> = {
    'later today': '2026-11-09T17:00',
    'this evening': '2026-11-09T18:00',
    'end of day': '2026-11-09T18:00',
    tomorrow: '2026-11-10T09:00',
    'tomorrow 5:30pm': '2026-11-10T17:30',
    'this weekend': '2026-11-14T09:00',
    'next week': '2026-11-16T09:00',
    '+30m': '2026-11-09T14:42',
    '+1h30m': '2026-11-09T15:42',
    '+2d': '2026-11-11T14:12',
    'monday 16:00': '2026-11-09T16:00',
    'monday 09:00': '2026-11-16T09:00',
    'next monday 16:00': '2026-11-16T16:00',
    'saturday 10:00': '2026-11-14T10:00',
    'Fri at 08:15': '2026-11-13T08:15',
    'today 9am': '',
    'next blursday': '',
    'tomorrow 25:00': '',
    '': '',
  }
  for (const [at, expected] of Object.entries(cases)) expect(await resolve(page, at), at).toBe(expected)
  // `morning` moves the default time of day.
  expect(await resolve(page, 'tomorrow', NOW, { morning: '07:30' })).toBe('2026-11-10T07:30')
  // In the evening, Later today and This evening no longer apply; on a weekend, This weekend does not.
  expect(await resolve(page, 'later today', '2026-11-09T17:30:00Z')).toBe('')
  expect(await resolve(page, 'this evening', '2026-11-09T16:20:00Z')).toBe('')
  expect(await resolve(page, 'this weekend', '2026-11-14T09:00:00Z')).toBe('')
  // A function of the current instant.
  const viaFunction = await page.evaluate(
    ({ now, zone }) =>
      (window as unknown as { quickTime: { resolveQuickTime: (at: (now: Date) => Date, options: object) => string } }).quickTime.resolveQuickTime(
        (current) => new Date(current.getTime() + 3_600_000),
        { now, timeZone: zone },
      ),
    { now: NOW, zone: ZONE },
  )
  expect(viaFunction).toBe('2026-11-09T15:12')
})

test('the menu lists each preset with the time it resolves to; a pick sets the value, fires the events and shows the time', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-quick-time-menu label="Snooze until" now="${NOW}" time-zone="${ZONE}"></c2-quick-time-menu>`)
  await watch(menu(page), 'time-select')
  await expect(trigger(page)).toHaveText('Snooze until')
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  await trigger(page).click()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(rows(page)).toHaveText([
    /Later today\s*17:00/,
    /This evening\s*18:00/,
    /Tomorrow\s*Tue 09:00/,
    /This weekend\s*Sat 09:00/,
    /Next week\s*Mon 16 Nov, 09:00/,
    /Pick a date and time…/,
  ])
  await expect(rows(page).first()).toBeFocused()
  await expect(rows(page).nth(2)).toHaveAttribute('aria-label', /^Tomorrow, Tuesday,? 10 November 2026 at 09:00$/)
  await accessible(page)

  await rows(page).nth(2).click()
  await expect(rows(page)).toHaveCount(0)
  expect(await menu(page).evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('2026-11-10T09:00')
  expect(await events(page)).toEqual([{ value: '2026-11-10T09:00', preset: 'tomorrow' }])
  await expect(trigger(page)).toHaveText('Tue 09:00')
  await expect(trigger(page)).toHaveAttribute('aria-label', /^Snooze until: Tuesday,? 10 November 2026 at 09:00$/)
  await expect(trigger(page)).toBeFocused()
  expect(await menu(page).evaluate((element) => (element as HTMLElement & { valueAsDate: Date }).valueAsDate.toISOString())).toBe('2026-11-10T08:00:00.000Z')

  // Reopened, the chosen row is checked and focused.
  await trigger(page).click()
  await expect(rows(page).nth(2)).toHaveAttribute('aria-checked', 'true')
  await expect(rows(page).nth(0)).toHaveAttribute('aria-checked', 'false')
  await expect(rows(page).nth(2)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(trigger(page)).toBeFocused()

  // The clear button sits beside the trigger.
  await menu(page).getByRole('button', { name: 'Clear time' }).click()
  expect(await menu(page).evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('')
  await expect(trigger(page)).toHaveText('Snooze until')
  await expect(menu(page).getByRole('button', { name: 'Clear time' })).toHaveCount(0)
})

test('the keyboard opens the menu, moves through the rows and picks; typeahead jumps by first letter', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quick-time-menu now="${NOW}" time-zone="${ZONE}"></c2-quick-time-menu>`)
  await page.keyboard.press('Tab')
  await expect(trigger(page)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows(page).first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('End')
  await expect(rows(page).last()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(rows(page).first()).toBeFocused()
  await page.keyboard.press('n')
  await expect(rows(page).nth(4)).toBeFocused()
  await page.keyboard.press('t')
  await expect(rows(page).nth(1)).toBeFocused()
  await page.keyboard.press('t')
  await expect(rows(page).nth(2)).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await menu(page).evaluate((element) => (element as HTMLElement & { value: string }).value)).toBe('2026-11-10T09:00')
  await expect(trigger(page)).toBeFocused()
  // ArrowUp opens on the last row.
  await page.keyboard.press('ArrowUp')
  await expect(rows(page).last()).toBeFocused()
})

test('"Pick a date and time…" swaps the list for a date and time panel; Back returns, Set picks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quick-time-menu now="${NOW}" time-zone="${ZONE}"></c2-quick-time-menu>`)
  await watch(menu(page), 'time-select')
  await trigger(page).click()
  await rows(page).last().click()
  const panel = menu(page).getByRole('group', { name: 'Pick a date and time' })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.hint')).toHaveText(/^Tuesday,? 10 November 2026 at 09:00$/)
  await panel.getByRole('button', { name: 'Back' }).click()
  await expect(rows(page).last()).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel).toBeVisible()
  await menu(page)
    .locator('c2-date-time-picker')
    .evaluate((picker) => {
      ;(picker as HTMLElement & { value: string }).value = '2026-11-12T08:30'
      picker.dispatchEvent(new Event('change'))
    })
  await expect(panel.locator('.hint')).toHaveText(/^Thursday,? 12 November 2026 at 08:30$/)
  await accessible(page)
  await panel.getByRole('button', { name: 'Set' }).click()
  await expect(panel).toHaveCount(0)
  expect(await events(page)).toEqual([{ value: '2026-11-12T08:30', preset: null }])
  await expect(trigger(page)).toHaveText('Thu 08:30')
})

test('presets of its own as JSON expressions, hidden outside min and max; inline draws the list in place', async ({ page, renderScenario }) => {
  const presets = JSON.stringify([
    { id: 'soon', label: 'In 20 minutes', at: '+20m' },
    { id: 'hour', label: 'In 1 hour', at: '+1h' },
    { id: 'tomorrow', label: 'Tomorrow', at: 'tomorrow' },
    { id: 'friday', label: 'Friday', at: 'friday 09:00' },
  ])
  await renderScenario(
    `<c2-quick-time-menu inline label="Remind me" now="${NOW}" time-zone="${ZONE}" max="2026-11-11T00:00" presets='${presets}'></c2-quick-time-menu>`,
  )
  await watch(menu(page), 'time-select')
  await expect(menu(page).locator('.trigger')).toHaveCount(0)
  await expect(menu(page).getByRole('menu', { name: 'Remind me' })).toBeVisible()
  await expect(rows(page)).toHaveText([/In 20 minutes\s*14:32/, /In 1 hour\s*15:12/, /Tomorrow\s*Tue 09:00/, /Pick a date and time…/])
  await rows(page).nth(1).click()
  await expect(rows(page).nth(1)).toHaveAttribute('aria-checked', 'true')
  await expect(rows(page).nth(1)).toBeFocused()
  expect(await events(page)).toEqual([{ value: '2026-11-09T15:12', preset: 'hour' }])
  await accessible(page)
})

test('a form control: submitted under its name, required until a time is chosen, reset to its first value', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-quick-time-menu name="snooze" required now="${NOW}" time-zone="${ZONE}"></c2-quick-time-menu><c2-quick-time-menu name="other" value="2026-11-20T10:00"></c2-quick-time-menu></form>`,
  )
  const form = page.locator('form')
  const data = () => form.evaluate((element) => [...new FormData(element as HTMLFormElement).entries()])
  expect(await data()).toEqual([['other', '2026-11-20T10:00']])
  const first = menu(page, 'c2-quick-time-menu[name="snooze"]')
  expect(await first.evaluate((element) => (element as HTMLElement & { validity: ValidityState }).validity.valueMissing)).toBe(true)
  await first.locator('.trigger').click()
  await first.locator('[role="menuitemradio"]').first().click()
  expect(await data()).toEqual([
    ['snooze', '2026-11-09T17:00'],
    ['other', '2026-11-20T10:00'],
  ])
  expect(await first.evaluate((element) => (element as HTMLElement & { validity: ValidityState }).validity.valid)).toBe(true)
  await props(menu(page, 'c2-quick-time-menu[name="other"]'), { value: '2026-11-21T10:00' })
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  expect(await data()).toEqual([['other', '2026-11-20T10:00']])
})

test('inside a c2-form-field its label names the trigger; disabled turns the trigger off', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form-field label="Follow up"><c2-quick-time-menu now="${NOW}" time-zone="${ZONE}"></c2-quick-time-menu></c2-form-field><c2-quick-time-menu id="off" disabled></c2-quick-time-menu>`,
  )
  await expect(menu(page).first().locator('.trigger')).toHaveAttribute('aria-label', 'Follow up')
  await expect(page.locator('#off .trigger')).toBeDisabled()
  await accessible(page)
})

test('a slotted trigger opens the menu and carries aria-haspopup and aria-expanded', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quick-time-menu now="${NOW}" time-zone="${ZONE}"><button slot="trigger" id="own">Remind me</button></c2-quick-time-menu>`)
  const own = page.locator('#own')
  await expect(menu(page).locator('.trigger')).toBeHidden()
  await expect(own).toHaveAttribute('aria-haspopup', 'menu')
  await expect(own).toHaveAttribute('aria-expanded', 'false')
  await own.click()
  await expect(own).toHaveAttribute('aria-expanded', 'true')
  await expect(rows(page).first()).toBeFocused()
  // A second click on the trigger of the open menu closes it.
  await own.click()
  await expect(rows(page)).toHaveCount(0)
  await expect(own).toHaveAttribute('aria-expanded', 'false')
})
