import type { Locator } from '@playwright/test'
import { accessible, expect, props, slotPresenceMatrix, test, watch } from '../../../../tests/component-fixture'

test('supporting-text presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const region = page.locator('c2-date-input').locator('.supporting-text')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-date-input><span slot="supporting-text" data-slot-presence-probe>Help</span></c2-date-input>',
    host: 'c2-date-input',
    slot: 'supporting-text',
    assertPresent: async (present) => expect(region).toHaveCount(present ? 1 : 0),
  })
})

test('consumer-owned calendar and supporting slots remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-date-input><span class="slot-probe" slot="calendar-icon">Calendar</span><span class="slot-probe" slot="supporting-text">Help</span></c2-date-input>',
  )
  await page.addStyleTag({ content: '.slot-probe{color:rgb(1,2,3)}' })
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color)))
    .toEqual(Array(2).fill('rgb(1, 2, 3)'))
})

test('publishes an ISO date through events and form data', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-date-input name="birthday" aria-label="Birthday"></c2-date-input></form>')
  const host = page.locator('c2-date-input')
  const input = host.locator('input')
  await watch(host, 'input')
  await input.fill('2026-10-12')
  await expect(host).toHaveJSProperty('value', '2026-10-12')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('birthday'))).toBe('2026-10-12')
})

test('forwards native date constraints and required validity', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-input required min="2026-01-10" max="2026-01-20" aria-label="Travel date"></c2-date-input>')
  const host = page.locator('c2-date-input')
  const input = host.locator('input')
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await input.fill('2026-01-09')
  await expect(input).toHaveJSProperty('validity.rangeUnderflow', true)
  await input.fill('2026-01-15')
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})

test('resets to its authored date and respects disabled fieldsets', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-date-input name="due" value="2026-09-15" aria-label="Due date"></c2-date-input></fieldset></form>')
  const host = page.locator('c2-date-input')
  const input = host.locator('input')
  await input.fill('2026-09-20')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(input).toHaveValue('2026-09-15')
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(input).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('due'))).toBe(false)
})

test('delegates focus and exposes helper and error states accessibly', async ({ page, renderScenario }) => {
  await renderScenario('<c2-date-input aria-label="Appointment" help="Choose a weekday."></c2-date-input>')
  const host = page.locator('c2-date-input')
  const input = host.locator('input')
  await host.evaluate((element) => (element as HTMLElement).focus())
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-describedby', 'supporting-text')
  await expect(host.locator('.supporting-text')).toHaveText('Choose a weekday.')
  await props(host, { error: true, errorText: 'That day is unavailable.' })
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(host.locator('.supporting-text')).toHaveText('That day is unavailable.')
  await accessible(page)
})

test('supports read-only state and a custom calendar icon', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-date-input value="2026-09-15" readonly aria-label="Published on">
      <svg slot="calendar-icon" data-testid="calendar" viewBox="0 0 24 24"></svg>
    </c2-date-input>
  `)
  await expect(page.locator('c2-date-input input')).toHaveAttribute('readonly', '')
  await expect(page.getByTestId('calendar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open calendar' })).toBeDisabled()
})

test('clicking the calendar icon focuses the input and opens the picker', async ({ page, renderScenario, browserName }) => {
  await renderScenario('<c2-date-input aria-label="Start date"></c2-date-input>')
  const input = page.locator('c2-date-input input')
  await page.getByRole('button', { name: 'Open calendar' }).click()
  await expect(input).toBeFocused()
  // `:open` reports an open date picker in Chromium; other engines lack it or show the picker out of process.
  if (browserName === 'chromium') await expect.poll(() => input.evaluate((element) => element.matches(':open'))).toBe(true)
})

test('clicking the calendar icon survives showPicker() throwing', async ({ page, renderScenario }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await renderScenario('<c2-date-input aria-label="Start date"></c2-date-input>')
  await page.evaluate(() => {
    HTMLInputElement.prototype.showPicker = () => {
      throw new DOMException('showPicker() called from cross-origin iframe.', 'SecurityError')
    }
  })
  await page.getByRole('button', { name: 'Open calendar' }).click()
  await expect(page.locator('c2-date-input input')).toBeFocused()
  expect(errors).toEqual([])
})

/** The popover is open and has moved focus to a day, which it does a moment after it opens. */
const focusInCalendar = (host: Locator) => expect.poll(() => host.evaluate((element) => element.shadowRoot!.activeElement?.localName)).toBe('c2-date-selector')

const calendarField = (attributes = '', children = '') =>
  `<form><c2-date-input picker="calendar" name="due" aria-label="Due date" ${attributes}>${children}</c2-date-input></form><button id="after">After</button>`

test('picker="calendar" loads the calendar on first open, and picking a day stores it and closes', async ({ page, renderScenario }) => {
  await renderScenario(calendarField('value="2026-10-12" min="2026-10-05" max="2026-10-25"'))
  const host = page.locator('c2-date-input')
  const opener = host.getByRole('button', { name: 'Open calendar' })
  // Nothing of the calendar exists before it is asked for.
  await expect(host.locator('c2-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => !!customElements.get('c2-date-selector'))).toBe(false)
  await expect(opener).toHaveAttribute('aria-expanded', 'false')
  await expect(opener).toHaveAttribute('aria-haspopup', 'dialog')

  await watch(host, 'change')
  await opener.click()
  const dialog = host.getByRole('dialog', { name: 'Due date' })
  await expect(dialog).toBeVisible()
  await expect(opener).toHaveAttribute('aria-expanded', 'true')
  // Focus lands on the selected day, and the bounds reach the calendar.
  await expect(dialog.getByRole('gridcell', { name: /October 12, 2026/ })).toBeFocused()
  await expect(dialog.getByRole('gridcell', { name: /October 4, 2026/ })).toBeDisabled()
  await expect(dialog.getByRole('gridcell', { name: /October 26, 2026/ })).toBeDisabled()

  await dialog.getByRole('gridcell', { name: /October 20, 2026/ }).click()
  await expect(dialog).toBeHidden()
  await expect(host).toHaveJSProperty('value', '2026-10-20')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await expect(host.locator('input')).toBeFocused()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('due'))).toBe('2026-10-20')
  await accessible(page)
})

test('the calendar opens from the keyboard, moves by arrow keys and closes on Escape back to the field', async ({ page, renderScenario }) => {
  await renderScenario(calendarField('value="2026-10-12"'))
  const host = page.locator('c2-date-input')
  await host.locator('input').focus()
  await page.keyboard.press('Alt+ArrowDown')
  const dialog = host.getByRole('dialog')
  await expect(dialog.getByRole('gridcell', { name: /October 12, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('gridcell', { name: /October 20, 2026/ })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(host.locator('input')).toBeFocused()
  await expect(host).toHaveJSProperty('value', '2026-10-12')

  await page.keyboard.press('Alt+ArrowDown')
  await expect(dialog.getByRole('gridcell', { name: /October 12, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', '2026-10-13')
  await expect(dialog).toBeHidden()
})

test('Today and Clear set the value, Today respects the bounds, and slotted actions sit beside them', async ({ page, renderScenario }) => {
  await renderScenario(calendarField('value="2020-02-03"', '<button slot="calendar-actions" id="preset" type="button">In a week</button>'))
  const host = page.locator('c2-date-input')
  const today = await page.evaluate(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  })
  await watch(host, 'input')
  await host.getByRole('button', { name: 'Open calendar' }).click()
  await expect(page.getByRole('button', { name: 'In a week' })).toBeVisible()
  // The calendar shows the month of the value, and focus is on that day.
  await expect(host.getByRole('gridcell', { name: /February 3, 2020/ })).toBeFocused()
  await host.getByRole('button', { name: 'Today' }).click()
  await expect(host).toHaveJSProperty('value', today)
  await expect(host.getByRole('dialog')).toBeHidden()

  await host.getByRole('button', { name: 'Open calendar' }).click()
  await host.getByRole('button', { name: 'Clear' }).click()
  // With no value, the calendar opens on today.
  await host.getByRole('button', { name: 'Open calendar' }).click()
  await expect(host.locator('c2-date-selector').locator('[aria-current="date"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(host).toHaveJSProperty('value', '')
  await expect(host).toHaveAttribute('data-events', '[null,null]')

  // A preset sets the value and closes the popover itself.
  await host.getByRole('button', { name: 'Open calendar' }).click()
  await focusInCalendar(host)
  await expect(host.getByRole('button', { name: 'Clear' })).toBeDisabled()
  await page.locator('#preset').evaluate((button) => {
    const field = button.closest('c2-date-input') as HTMLElement & { pick(value: string): void }
    button.addEventListener('click', () => field.pick('2031-01-08'))
  })
  await page.getByRole('button', { name: 'In a week' }).focus()
  await page.keyboard.press('Enter')
  await expect(host.getByRole('dialog')).toBeHidden()
  await expect(host).toHaveJSProperty('value', '2031-01-08')
  // A preset reports the change like a day does, and focus goes back to the field.
  await expect(host).toHaveAttribute('data-events', '[null,null,null]')
  await expect(host.locator('input')).toBeFocused()

  // Escape with a slotted action focused returns to the field too.
  await host.getByRole('button', { name: 'Open calendar' }).click()
  await focusInCalendar(host)
  await page.getByRole('button', { name: 'In a week' }).focus()
  await page.keyboard.press('Escape')
  await expect(host.getByRole('dialog')).toBeHidden()
  await expect(host.locator('input')).toBeFocused()

  await props(host, { max: '2000-01-01' })
  await host.getByRole('button', { name: 'Open calendar' }).click()
  await expect(host.getByRole('button', { name: 'Today' })).toBeDisabled()
})

test('the native picker stays the default, and a disabled or read-only field opens no calendar', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-date-input aria-label="Plain"></c2-date-input><c2-date-input id="ro" picker="calendar" readonly aria-label="Locked"></c2-date-input>',
  )
  const plain = page.locator('c2-date-input').first()
  await expect(plain.getByRole('button', { name: 'Open calendar' })).not.toHaveAttribute('aria-haspopup')
  await plain.getByRole('button', { name: 'Open calendar' }).click()
  await expect(page.locator('c2-overlay')).toHaveCount(0)
  expect(await page.evaluate(() => !!customElements.get('c2-date-selector'))).toBe(false)

  await page.locator('#ro').evaluate((element: HTMLElement & { showCalendar(): Promise<void> }) => element.showCalendar())
  await expect(page.locator('#ro').locator('c2-overlay')).toHaveCount(0)
})

test('the calendar speaks the field language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${calendarField('value="2026-10-12"')}</div>`)
  const host = page.locator('c2-date-input')
  await host.getByRole('button', { name: 'Open calendar' }).click()
  await expect(host.getByRole('button', { name: "Aujourd'hui" })).toBeVisible()
  await expect(host.getByRole('button', { name: 'Effacer' })).toBeVisible()
  await expect(host.getByRole('dialog').getByRole('gridcell', { name: /12 octobre 2026/ })).toBeFocused()
})

test('the popover is named by its form field, and a field taken out while open reopens on the first press', async ({ page, renderScenario }) => {
  await renderScenario('<c2-form-field label="Ship by"><c2-date-input picker="calendar" value="2026-10-12"></c2-date-input></c2-form-field>')
  const host = page.locator('c2-date-input')
  const opener = host.getByRole('button', { name: 'Open calendar' })
  await opener.click()
  await expect(host.getByRole('dialog', { name: 'Ship by' })).toBeVisible()

  // Removing the field hides the popover without telling it.
  await host.evaluate((element) => {
    const parent = element.parentElement!
    element.remove()
    parent.append(element)
  })
  await expect(opener).toHaveAttribute('aria-expanded', 'false')
  await opener.click()
  await expect(host.getByRole('dialog', { name: 'Ship by' })).toBeVisible()

  await host.evaluate((element: HTMLElement & { readOnly: boolean }) => (element.readOnly = true))
  await expect(host.getByRole('dialog')).toBeHidden()
  await expect(opener).toHaveAttribute('aria-expanded', 'false')
})
