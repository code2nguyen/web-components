import { accessible, expect, props, slotPresenceMatrix, test, watch } from '../../../../tests/component-fixture'

type Validatable = HTMLElement & { checkValidity(): boolean }

test('supporting-text presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const region = page.locator('c2-time-input').locator('.supporting-text')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-time-input><span slot="supporting-text" data-slot-presence-probe>Help</span></c2-time-input>',
    host: 'c2-time-input',
    slot: 'supporting-text',
    assertPresent: async (present) => expect(region).toHaveCount(present ? 1 : 0),
  })
})

test('consumer-owned clock and supporting slots remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-time-input><span class="slot-probe" slot="clock-icon">Clock</span><span class="slot-probe" slot="supporting-text">Help</span></c2-time-input>',
  )
  await page.addStyleTag({ content: '.slot-probe{color:rgb(1,2,3)}' })
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color)))
    .toEqual(Array(2).fill('rgb(1, 2, 3)'))
})

test('publishes a 24-hour time through events and form data', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-time-input name="start" aria-label="Start time"></c2-time-input></form>')
  const host = page.locator('c2-time-input')
  const input = host.locator('input')
  await watch(host, 'input')
  await input.fill('14:30')
  await expect(host).toHaveJSProperty('value', '14:30')
  await expect(host).toHaveJSProperty('valueAsNumber', (14 * 60 + 30) * 60 * 1000)
  await expect(host).toHaveAttribute('data-events', '[null]')
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('start'))).toBe('14:30')
})

test('forwards native time constraints and required validity', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-input required min="09:00" max="17:00" step="900" aria-label="Meeting time"></c2-time-input>')
  const host = page.locator('c2-time-input')
  const input = host.locator('input')
  await expect.poll(() => host.evaluate((element) => (element as Validatable).checkValidity())).toBe(false)
  await input.fill('08:45')
  await expect(input).toHaveJSProperty('validity.rangeUnderflow', true)
  await input.fill('10:10')
  await expect(input).toHaveJSProperty('validity.stepMismatch', true)
  await input.fill('10:15')
  await expect.poll(() => host.evaluate((element) => (element as Validatable).checkValidity())).toBe(true)
})

test('resets to its authored time and respects disabled fieldsets', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset><c2-time-input name="alarm" value="07:00" aria-label="Alarm"></c2-time-input></fieldset></form>')
  const host = page.locator('c2-time-input')
  const input = host.locator('input')
  await input.fill('06:30')
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(input).toHaveValue('07:00')
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(input).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('alarm'))).toBe(false)
})

test('delegates focus and exposes helper and error states accessibly', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-input aria-label="Pickup time" help="Between 09:00 and 18:00."></c2-time-input>')
  const host = page.locator('c2-time-input')
  const input = host.locator('input')
  await host.evaluate((element) => (element as HTMLElement).focus())
  await expect(input).toBeFocused()
  await expect(input).toHaveAttribute('aria-describedby', 'supporting-text')
  await expect(host.locator('.supporting-text')).toHaveText('Between 09:00 and 18:00.')
  await props(host, { error: true, errorText: 'The shop is closed then.' })
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(host.locator('.supporting-text')).toHaveText('The shop is closed then.')
  await accessible(page)
})

test('supports read-only state and a custom clock icon', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-time-input value="08:00" readonly aria-label="Opens at">
      <svg slot="clock-icon" data-testid="clock" viewBox="0 0 24 24"></svg>
    </c2-time-input>
  `)
  await expect(page.locator('c2-time-input input')).toHaveAttribute('readonly', '')
  await expect(page.getByTestId('clock')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open time picker' })).toBeDisabled()
})

test('picks a time from its own picker and fires input and change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-input lang="en-GB" aria-label="Start time"></c2-time-input>')
  const host = page.locator('c2-time-input')
  await watch(host, 'input')
  await page.getByRole('button', { name: 'Open time picker' }).click()
  await expect(page.getByRole('listbox', { name: 'Hours' })).toBeVisible()
  await expect(page.getByRole('listbox', { name: 'AM/PM' })).toHaveCount(0)
  await page.getByRole('listbox', { name: 'Hours' }).getByRole('option', { name: '14' }).click()
  await page.getByRole('listbox', { name: 'Minutes' }).getByRole('option', { name: '30' }).click()
  await expect(host).toHaveJSProperty('value', '14:30')
  await expect(host.locator('input')).toHaveValue('14:30')
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await expect(page.getByRole('listbox', { name: 'Minutes' }).getByRole('option', { name: '30' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('listbox', { name: 'Hours' })).toHaveCount(0)
})

test('picker columns follow step, min and max', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-input lang="en-GB" value="10:15" min="09:00" max="17:00" step="900" aria-label="Meeting"></c2-time-input>')
  await page.getByRole('button', { name: 'Open time picker' }).click()
  const hours = page.getByRole('listbox', { name: 'Hours' })
  const minutes = page.getByRole('listbox', { name: 'Minutes' })
  await expect(minutes.getByRole('option')).toHaveText(['00', '15', '30', '45'])
  await expect(hours.getByRole('option', { name: '08' })).toHaveAttribute('aria-disabled', 'true')
  await expect(hours.getByRole('option', { name: '09' })).not.toHaveAttribute('aria-disabled')
  // 17:00 is the last valid time, so moving to 17 snaps the minute to :00.
  await hours.getByRole('option', { name: '17' }).click()
  await expect(page.locator('c2-time-input')).toHaveJSProperty('value', '17:00')
  await expect(minutes.getByRole('option', { name: '15' })).toHaveAttribute('aria-disabled', 'true')
})

test('picker shows AM/PM on 12-hour locales and supports the keyboard', async ({ page, renderScenario }) => {
  await renderScenario('<c2-time-input lang="en-US" value="09:00" aria-label="Alarm"></c2-time-input>')
  const host = page.locator('c2-time-input')
  await host.locator('input').focus()
  await page.keyboard.press('Alt+ArrowDown')
  const hours = page.getByRole('listbox', { name: 'Hours' })
  await expect(hours).toBeFocused()
  await expect(hours.getByRole('option').first()).toHaveText('12')
  await page.keyboard.press('ArrowDown')
  await expect(host).toHaveJSProperty('value', '10:00')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('listbox', { name: 'AM/PM' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(host).toHaveJSProperty('value', '22:00')
  await page.keyboard.press('Escape')
  await expect(hours).toHaveCount(0)
  await expect(host.locator('input')).toBeFocused()
})
