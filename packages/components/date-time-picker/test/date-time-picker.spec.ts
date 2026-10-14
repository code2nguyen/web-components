import { accessible, expect, props, slotPresenceMatrix, test, watch } from '../../../../tests/component-fixture'
import type { Locator } from '@playwright/test'

type Picker = HTMLElement & { checkValidity(): boolean; valueAsDate: Date | null; valueAsISOString: string; value: string }

const formValue = (form: Locator, name: string) => form.evaluate((element, key) => new FormData(element as HTMLFormElement).get(key), name)

test('supporting-text presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const region = page.locator('c2-date-time-picker').locator('.supporting-text')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-date-time-picker><span slot="supporting-text" data-slot-presence-probe>Help</span></c2-date-time-picker>',
    host: 'c2-date-time-picker',
    slot: 'supporting-text',
    assertPresent: async (present) => expect(region).toHaveCount(present ? 1 : 0),
  })
})

test('publishes a typed wall-clock value through events and form data', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-date-time-picker name="start" aria-label="Start"></c2-date-time-picker></form>')
  const host = page.locator('c2-date-time-picker')
  await watch(host, 'input')
  await host.locator('input').fill('2026-10-14T09:30')
  await expect(host).toHaveJSProperty('value', '2026-10-14T09:30')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await expect.poll(() => formValue(page.locator('form'), 'start')).toBe('2026-10-14T09:30')
})

test('reads the value in its time zone and submits the zone when asked', async ({ page, renderScenario }) => {
  await renderScenario(`<form>
    <c2-date-time-picker name="at" time-zone-name="tz" time-zone="America/New_York" value="2026-07-01T09:00" aria-label="Call"></c2-date-time-picker>
  </form>`)
  const host = page.locator('c2-date-time-picker')
  await expect(host).toHaveJSProperty('valueAsISOString', '2026-07-01T09:00:00-04:00')
  await expect.poll(() => host.evaluate((element) => (element as Picker).valueAsDate?.toISOString())).toBe('2026-07-01T13:00:00.000Z')
  await expect.poll(() => formValue(page.locator('form'), 'tz')).toBe('America/New_York')
  await expect.poll(() => formValue(page.locator('form'), 'at')).toBe('2026-07-01T09:00')
  // Winter time in the same zone is UTC-5, and setting an instant writes its wall clock there.
  await host.evaluate((element) => ((element as Picker).valueAsDate = new Date('2026-01-15T17:45:00Z')))
  await expect(host).toHaveJSProperty('value', '2026-01-15T12:45')
  await expect(host).toHaveJSProperty('valueAsISOString', '2026-01-15T12:45:00-05:00')
  await expect(host.locator('.time-zone')).toHaveText('EST')
})

test('a time skipped by a daylight-saving jump resolves forward', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-time-picker time-zone="Europe/Paris" value="2026-03-29T02:30" aria-label="Night"></c2-date-time-picker>')
  await expect
    .poll(() => page.locator('c2-date-time-picker').evaluate((element) => (element as Picker).valueAsDate?.toISOString()))
    .toBe('2026-03-29T01:30:00.000Z')
})

test('forwards min, max, step and required to validity', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-time-picker required min="2026-10-01T09:00" max="2026-10-31T17:00" step="900" aria-label="Slot"></c2-date-time-picker>')
  const host = page.locator('c2-date-time-picker')
  const input = host.locator('input')
  await expect.poll(() => host.evaluate((element) => (element as Picker).checkValidity())).toBe(false)
  await input.fill('2026-09-30T10:00')
  await expect(input).toHaveJSProperty('validity.rangeUnderflow', true)
  await input.fill('2026-10-02T10:10')
  await expect(input).toHaveJSProperty('validity.stepMismatch', true)
  await input.fill('2026-10-02T10:15')
  await expect.poll(() => host.evaluate((element) => (element as Picker).checkValidity())).toBe(true)
})

test('picks a date and a time in the popup and fires input and change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-time-picker lang="en-GB" value="2026-10-14T09:30" aria-label="Meeting"></c2-date-time-picker>')
  const host = page.locator('c2-date-time-picker')
  await watch(host, 'change')
  await page.getByRole('button', { name: 'Open date and time picker' }).click()
  const dialog = page.getByRole('dialog', { name: 'Meeting' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('October 2026')).toBeVisible()
  // Days are found by date: their spoken label is the engine's own wording of the date.
  await expect(dialog.locator('.day[data-date="2026-10-14"]')).toBeFocused()
  await expect(dialog.locator('.day[data-date="2026-10-14"]')).toHaveAttribute('aria-label', /14.*October.*2026/)
  await dialog.locator('.day[data-date="2026-10-20"]').click()
  await expect(host).toHaveJSProperty('value', '2026-10-20T09:30')
  await dialog.getByLabel('Time', { exact: true }).locator('input').fill('16:45')
  await expect(host).toHaveJSProperty('value', '2026-10-20T16:45')
  await expect(host.locator('input[type="datetime-local"]')).toHaveValue('2026-10-20T16:45')
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  // The time field's own picker opens over the popup without closing it.
  await dialog.getByRole('button', { name: 'Open time picker' }).click()
  await page.getByRole('listbox', { name: 'Minutes' }).getByRole('option', { name: '15' }).click()
  await expect(host).toHaveJSProperty('value', '2026-10-20T16:15')
  await page.getByRole('button', { name: 'Done' }).last().click()
  await expect(page.getByRole('listbox', { name: 'Minutes' })).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await expect(dialog).toHaveCount(0)
})

test('the calendar follows the keyboard and returns focus on Escape', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-time-picker lang="en-GB" value="2026-01-30T08:00" aria-label="Departure"></c2-date-time-picker>')
  const host = page.locator('c2-date-time-picker')
  await host.locator('input').focus()
  await page.keyboard.press('Alt+ArrowDown')
  const dialog = page.getByRole('dialog', { name: 'Departure' })
  await expect(dialog.locator('.day[data-date="2026-01-30"]')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(dialog.locator('.day[data-date="2026-02-01"]')).toBeFocused()
  await expect(dialog.getByText('February 2026')).toBeVisible()
  // February has no 30th or 31st, so a month back from the 28th keeps the day.
  await page.keyboard.press('End')
  await page.keyboard.press('PageDown')
  await expect(dialog.locator('.day[data-date="2026-03-01"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', '2026-03-01T08:00')
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(host.locator('input')).toBeFocused()
})

test('min and max disable days, stop navigation and clamp the time', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-date-time-picker lang="en-GB" value="2026-10-12T12:00" min="2026-10-10T09:00" max="2026-10-20T17:00" aria-label="Visit"></c2-date-time-picker>',
  )
  const host = page.locator('c2-date-time-picker')
  await page.getByRole('button', { name: 'Open date and time picker' }).click()
  const dialog = page.getByRole('dialog', { name: 'Visit' })
  await expect(dialog.locator('.day[data-date="2026-10-09"]')).toBeDisabled()
  await expect(dialog.locator('.day[data-date="2026-10-21"]')).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  await expect(dialog.getByRole('button', { name: 'Next month' })).toBeDisabled()
  await host.evaluate((element) => ((element as Picker).value = '2026-10-12T07:00'))
  await dialog.locator('.day[data-date="2026-10-10"]').click()
  await expect(host).toHaveJSProperty('value', '2026-10-10T09:00')
  await dialog.locator('.day[data-date="2026-10-20"]').click()
  await dialog.getByLabel('Time', { exact: true }).locator('input').fill('18:30')
  await expect(host).toHaveJSProperty('value', '2026-10-20T17:00')
})

test('choosing another time zone keeps the wall clock and moves the instant', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-date-time-picker lang="en-GB" value="2026-10-14T09:00" time-zone="Europe/London"
    time-zones="Europe/London, Asia/Tokyo America/Los_Angeles" aria-label="Standup"></c2-date-time-picker>`)
  const host = page.locator('c2-date-time-picker')
  await watch(host, 'input')
  await page.getByRole('button', { name: 'Open date and time picker' }).click()
  const zone = page.getByRole('combobox', { name: 'Time zone' })
  // The offset label is the engine's own wording (Chromium writes GMT+1, Firefox BST), so only the zone name is pinned.
  await expect(zone.getByRole('option')).toHaveText([/^Europe\/London \(.+\)$/, /^Asia\/Tokyo \(.+\)$/, /^America\/Los Angeles \(.+\)$/])
  await zone.selectOption('Asia/Tokyo')
  await expect(host).toHaveAttribute('time-zone', 'Asia/Tokyo')
  await expect(host).toHaveJSProperty('value', '2026-10-14T09:00')
  await expect(host).toHaveJSProperty('valueAsISOString', '2026-10-14T09:00:00+09:00')
  await expect(host).toHaveAttribute('data-events', '[null]')
})

test('Now picks the current wall clock in the time zone, on the step grid', async ({ page, renderScenario }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T06:07:00Z'))
  await renderScenario('<c2-date-time-picker lang="en-GB" time-zone="Asia/Tokyo" step="900" aria-label="Reminder"></c2-date-time-picker>')
  const host = page.locator('c2-date-time-picker')
  await page.getByRole('button', { name: 'Open date and time picker' }).click()
  await page.getByRole('button', { name: 'Now' }).click()
  await expect(host).toHaveJSProperty('value', '2026-10-14T15:00')
  await expect(page.locator('.day[data-date="2026-10-14"]')).toHaveAttribute('aria-current', 'date')
})

test('resets to its authored value and zone and respects disabled fieldsets', async ({ page, renderScenario }) => {
  await renderScenario(`<form><fieldset>
    <c2-date-time-picker name="due" value="2026-10-14T09:00" time-zone="Europe/Paris" aria-label="Due"></c2-date-time-picker>
  </fieldset></form>`)
  const host = page.locator('c2-date-time-picker')
  await host.locator('input').fill('2026-11-01T10:00')
  await props(host, { timeZone: 'Asia/Tokyo' })
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host.locator('input')).toHaveValue('2026-10-14T09:00')
  await expect(host).toHaveAttribute('time-zone', 'Europe/Paris')
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(host.locator('input')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Open date and time picker' })).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('due'))).toBe(false)
})

test('read-only keeps the value and cannot open the popup', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-time-picker readonly value="2026-10-14T09:00" aria-label="Created"></c2-date-time-picker>')
  await expect(page.locator('c2-date-time-picker input')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Open date and time picker' })).toBeDisabled()
})

test('shows helper and error text accessibly, with the popup open too', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-date-time-picker lang="en-GB" time-zone="Europe/Paris" value="2026-10-14T09:00" aria-label="Launch" help="Paris time."></c2-date-time-picker>',
  )
  const host = page.locator('c2-date-time-picker')
  const input = host.locator('input')
  await host.evaluate((element) => (element as HTMLElement).focus())
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-describedby', 'supporting-text')
  await props(host, { error: true, errorText: 'Pick a weekday.' })
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(host.locator('.supporting-text')).toHaveText('Pick a weekday.')
  await accessible(page)
  await page.getByRole('button', { name: 'Open date and time picker' }).click()
  await expect(page.getByRole('dialog', { name: 'Launch' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Launch' }).getByText(/^Europe\/Paris \(.+\)$/)).toBeVisible()
  await accessible(page)
})

test('the interface text and calendar follow the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-date-time-picker value="2026-10-14T09:00" week-start="monday" aria-label="Rendez-vous"></c2-date-time-picker></div>')
  await page.getByRole('button', { name: 'Ouvrir le sélecteur de date et d’heure' }).click()
  const dialog = page.getByRole('dialog', { name: 'Rendez-vous' })
  await expect(dialog.getByText('octobre 2026')).toBeVisible()
  await expect(dialog.getByRole('columnheader')).toHaveText(['L', 'M', 'M', 'J', 'V', 'S', 'D'])
  await expect(dialog.getByRole('button', { name: 'Maintenant' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Mois suivant' })).toBeVisible()
})
