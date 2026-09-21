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
