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
  // A lone start date draws no range strip behind its circle.
  const start = page.getByRole('gridcell', { name: /September 18, 2026/ })
  await expect(start).toHaveAttribute('aria-selected', 'true')
  await expect(start).not.toHaveClass(/range-start/)
})

test('an earlier second date restarts the range', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('gridcell', { name: /September 7, 2026/ }).click()
  await expect(page.locator('c2-date-selector')).toHaveAttribute('from', '2026-09-07')
  // A reflected default is not written onto the host (it would fail SSR hydration), so it is read as a property.
  await expect(page.locator('c2-date-selector')).toHaveJSProperty('to', '')
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
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Next month' })).toBeDisabled()
})

test('navigates freely without bounds', async ({ page, scenario }) => {
  await scenario('default')
  await expect(page.getByRole('button', { name: 'Previous month' })).toBeEnabled()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('grid', { name: 'October 2026' })).toBeVisible()
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

test('a hovered selected day keeps its selected fill', async ({ page, scenario }) => {
  await scenario()
  const day = page.getByRole('gridcell', { name: /September 18, 2026/ })
  // Clicking leaves the pointer over the day, as a tap does on touch screens where :hover sticks.
  await day.click()
  await expect(day).toHaveAttribute('aria-selected', 'true')
  await expect(day.locator('span')).toHaveCSS('background-color', 'rgb(2, 101, 220)')
})

test('single mode picks one date into value and leaves the range alone', async ({ page, scenario }) => {
  await scenario('single')
  const selector = page.locator('c2-date-selector')
  await expect(page.getByRole('group', { name: 'Choose a date' })).toBeVisible()
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('gridcell', { name: /September 15, 2026/ }).click()
  await expect(selector).toHaveAttribute('value', '2026-09-15')
  await expect(selector).toHaveJSProperty('from', '')
  await expect(page.getByRole('status')).toHaveText('value:2026-09-15')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toHaveAttribute('aria-selected', 'false')
  // No range strip in single mode.
  await expect(page.locator('c2-date-selector .in-range, c2-date-selector .range-start')).toHaveCount(0)
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('status')).toHaveText('{"trip":"2026-09-15"}')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(selector).toHaveAttribute('value', '2026-09-10')
})

test('single mode selects with the keyboard', async ({ page, scenario }) => {
  await scenario('single')
  await page.getByRole('gridcell', { name: /September 10, 2026/ }).focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-date-selector')).toHaveAttribute('value', '2026-09-11')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press(' ')
  await expect(page.locator('c2-date-selector')).toHaveAttribute('value', '2026-09-18')
})

test('multiple mode toggles dates, sorted, and submits each one', async ({ page, scenario }) => {
  await scenario('multiple')
  const selector = page.locator('c2-date-selector')
  // The authored list is normalized to ascending order.
  await expect(selector).toHaveAttribute('value', '2026-09-03,2026-09-10')
  await expect(page.getByRole('group', { name: 'Choose dates' })).toBeVisible()
  await expect(page.getByRole('grid', { name: 'September 2026' })).toHaveAttribute('aria-multiselectable', 'true')
  await page.getByRole('gridcell', { name: /September 7, 2026/ }).click()
  await expect(selector).toHaveAttribute('value', '2026-09-03,2026-09-07,2026-09-10')
  await expect(page.getByRole('status')).toHaveText('value:2026-09-03,2026-09-07,2026-09-10')
  // Keyboard: Space on a selected date removes it.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toBeFocused()
  await page.keyboard.press(' ')
  await expect(selector).toHaveAttribute('value', '2026-09-03,2026-09-07')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toHaveAttribute('aria-selected', 'false')
  const submitted = await page.evaluate(() => new FormData(document.querySelector('form')!).getAll('trip'))
  expect(submitted).toEqual(['2026-09-03', '2026-09-07'])
})

test('required multiple mode is invalid until a date is picked', async ({ page, scenario }) => {
  await scenario('multiple-empty')
  const selector = page.locator('c2-date-selector')
  await expect.poll(() => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validity.valueMissing)).toBe(true)
  await expect.poll(() => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validationMessage)).toBe('Choose at least one date')
  // With nothing selected the calendar opens on the current month: pick its 7th.
  await page
    .getByRole('gridcell', { name: /\b7, \d{4}/ })
    .first()
    .click()
  await expect.poll(() => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validity.valid)).toBe(true)
})

test('marks the dates listed in marked', async ({ page, scenario }) => {
  await scenario('marked')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ }).locator('.marker')).toHaveCount(1)
  await expect(page.getByRole('gridcell', { name: /September 14, 2026/ }).locator('.marker')).toHaveCount(1)
  await expect(page.getByRole('gridcell', { name: /September 11, 2026/ }).locator('.marker')).toHaveCount(0)
  // The selected day's dot switches to the selected colour.
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ }).locator('.marker')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.getByRole('gridcell', { name: /September 14, 2026/ }).locator('.marker')).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test('renderDay adds content under the number and keeps the accessible name', async ({ page, scenario }) => {
  await scenario('render-day')
  const day = page.getByRole('gridcell', { name: /September 15, 2026/ })
  await expect(day.locator('.day-content')).toHaveText('$150')
  await expect(day).toHaveClass(/has-content/)
  await expect(page.getByRole('gridcell', { name: /September 14, 2026/ }).locator('.day-content')).toHaveText('event')
  await expect(page.getByRole('gridcell', { name: /September 11, 2026/ }).locator('.day-content')).toHaveCount(0)
  await expect(page.getByRole('gridcell', { name: /September 11, 2026/ })).not.toHaveClass(/has-content/)
  // The content is the day's description; its name stays the date.
  await expect(day).toHaveAccessibleDescription('$150')
  // A marked day with content keeps both: the dot moves above the number.
  await expect(page.getByRole('gridcell', { name: /September 14, 2026/ }).locator('.marker')).toHaveCount(1)
  // The range path is unchanged by a renderer.
  await day.click()
  await expect(page.locator('c2-date-selector')).toHaveAttribute('to', '2026-09-15')
})

test('range mode draws no marker or content nodes by default', async ({ page, scenario }) => {
  await scenario('complete')
  await expect(page.locator('c2-date-selector .marker, c2-date-selector .day-content')).toHaveCount(0)
  await expect(page.locator('c2-date-selector')).not.toHaveAttribute('mode')
  await expect(page.getByRole('grid', { name: 'September 2026' })).not.toHaveAttribute('aria-multiselectable')
})

test('multiple mode keeps a tab stop in a month without the first selected date', async ({ page, scenario }) => {
  await scenario('multiple')
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('grid', { name: 'October 2026' })).toBeVisible()
  // The first selected date (September 3) is not shown, yet a day of October still takes Tab.
  await page.getByRole('button', { name: 'Next month' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('c2-date-selector .day:focus')).toHaveAttribute('data-date', /^2026-10-/)
})

test('previous-period draws the comparison band before the range and follows it', async ({ page, scenario }) => {
  await scenario('compare-period')
  const selector = page.locator('c2-date-selector')
  // Six days, September 10 to 15, compare with the six days before: September 4 to 9.
  await expect(selector).toHaveJSProperty('compareFrom', '2026-09-04')
  await expect(selector).toHaveJSProperty('compareTo', '2026-09-09')
  await expect(page.locator('c2-date-selector .day.compare')).toHaveCount(6)
  await expect(page.getByRole('gridcell', { name: /September 4, 2026/ })).toHaveClass(/compare-start/)
  await expect(page.getByRole('gridcell', { name: /September 9, 2026/ })).toHaveClass(/compare-end/)
  await expect(page.getByRole('gridcell', { name: /September 9, 2026/ })).toHaveAccessibleDescription('In the comparison period')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).not.toHaveClass(/compare/)
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toHaveAccessibleDescription('')
  // The band is drawn under the day, in the comparison colour.
  const band = await page.locator('c2-date-selector [data-date="2026-09-06"]').evaluate((day) => getComputedStyle(day, '::after').backgroundColor)
  expect(band).toBe('rgb(234, 88, 12)')

  // A new range clears the derived comparison until it is complete, then derives it again; the events carry it.
  await page.getByRole('gridcell', { name: /September 20, 2026/ }).click()
  await expect(selector).toHaveJSProperty('compareFrom', '')
  await expect(page.getByRole('status')).toHaveText('2026-09-20/ vs /')
  await page.getByRole('gridcell', { name: /September 22, 2026/ }).click()
  await expect(selector).toHaveJSProperty('compareFrom', '2026-09-17')
  await expect(selector).toHaveJSProperty('compareTo', '2026-09-19')
  await expect(page.getByRole('status')).toHaveText('2026-09-20/2026-09-22 vs 2026-09-17/2026-09-19')
})

test('previous-year shifts the range by a year, February 29 included', async ({ page, scenario }) => {
  await scenario('compare-year')
  const selector = page.locator('c2-date-selector')
  await expect(selector).toHaveJSProperty('compareFrom', '2025-09-10')
  await expect(selector).toHaveJSProperty('compareTo', '2025-09-15')
  const leap = await selector.evaluate(async (element: HTMLElementTagNameMap['c2-date-selector']) => {
    element.from = '2028-02-29'
    element.to = '2028-03-02'
    await element.updateComplete
    return [element.compareFrom, element.compareTo]
  })
  expect(leap).toEqual(['2027-02-28', '2027-03-02'])
})

test('editing="compare" picks the comparison range by click and keyboard, and ends the preset', async ({ page, scenario }) => {
  await scenario('compare-editing')
  const selector = page.locator('c2-date-selector')
  await page.getByRole('gridcell', { name: /September 21, 2026/ }).click()
  await expect(selector).toHaveAttribute('compare', 'custom')
  await expect(selector).toHaveJSProperty('compareFrom', '2026-09-21')
  await expect(selector).toHaveJSProperty('compareTo', '')
  // A lone start is a one-day band while the end is picked.
  await expect(page.getByRole('gridcell', { name: /September 21, 2026/ })).toHaveClass(/compare-start compare-end/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(selector).toHaveJSProperty('compareTo', '2026-09-28')
  // The range itself is untouched, and the comparison no longer follows it: it is custom now.
  await expect(selector).toHaveAttribute('from', '2026-09-10')
  await expect(selector).toHaveAttribute('to', '2026-09-15')
  await expect(page.getByRole('status')).toHaveText('2026-09-10/2026-09-15 vs 2026-09-21/2026-09-28')
  await selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => (element.editing = 'range'))
  await page.getByRole('gridcell', { name: /September 2, 2026/ }).click()
  await expect(selector).toHaveAttribute('from', '2026-09-02')
  await expect(selector).toHaveJSProperty('compareFrom', '2026-09-21')
  await expect(selector).toHaveJSProperty('compareTo', '2026-09-28')
})

test('submits the comparison range beside the range and resets both', async ({ page, scenario }) => {
  await scenario('compare-period')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('status')).toHaveText('{"trip":"2026-09-10","trip-end":"2026-09-15","trip-compare":"2026-09-04","trip-compare-end":"2026-09-09"}')
  await page.getByRole('gridcell', { name: /September 20, 2026/ }).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('c2-date-selector')).toHaveAttribute('to', '2026-09-15')
  await expect(page.locator('c2-date-selector')).toHaveJSProperty('compareFrom', '2026-09-04')
})

test('a preset keeps its comparison range through a reset and over a range set by hand', async ({ page, scenario }) => {
  await scenario('compare-period')
  const selector = page.locator('c2-date-selector')
  // Reset with the range untouched: the derived comparison range is derived again, not emptied.
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(selector).toHaveJSProperty('compareFrom', '2026-09-04')
  await expect(selector).toHaveJSProperty('compareTo', '2026-09-09')
  const kept = await selector.evaluate(async (element: HTMLElementTagNameMap['c2-date-selector']) => {
    element.compareFrom = '2026-01-01'
    element.compareTo = '2026-01-05'
    await element.updateComplete
    return [element.compareFrom, element.compareTo]
  })
  expect(kept).toEqual(['2026-09-04', '2026-09-09'])
})

test('a range without compare draws no band, no comparison note and no footer', async ({ page, scenario }) => {
  await scenario('complete')
  await expect(page.locator('c2-date-selector .compare, c2-date-selector #compare-note')).toHaveCount(0)
  await expect(page.locator('c2-date-selector [part="footer"]')).toBeHidden()
  await page.getByRole('gridcell', { name: /September 18, 2026/ }).click()
  // The change detail keeps its two keys.
  await expect(page.getByRole('status')).toHaveText('2026-09-18/')
})

test('the footer slot shows the app controls under the months', async ({ page, scenario }) => {
  await scenario('footer')
  const footer = page.locator('c2-date-selector [part="footer"]')
  await expect(footer).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare to' })).toBeVisible()
  // The slotted control sits in the footer row, under the month grid.
  const grid = (await page.getByRole('grid', { name: 'September 2026' }).boundingBox())!
  const control = (await page.getByRole('button', { name: 'Compare to' }).boundingBox())!
  const row = (await footer.boundingBox())!
  expect(control.y).toBeGreaterThanOrEqual(grid.y + grid.height)
  expect(control.y).toBeGreaterThanOrEqual(row.y)
  // A disabled selector makes its footer inert, so the app's controls cannot change it either.
  await page.locator('c2-date-selector').evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => (element.disabled = true))
  await expect(footer).toHaveAttribute('inert', '')
  const focused = await page.getByRole('button', { name: 'Compare to', includeHidden: true }).evaluate((button) => {
    button.focus()
    return document.activeElement === button
  })
  expect(focused).toBe(false)
})

test('without locale, the comparison note and the navigation follow the nearest lang', async ({ page, scenario }) => {
  await scenario('compare-lang')
  await expect(page.locator('c2-date-selector [data-date="2026-09-05"]')).toHaveAccessibleDescription('Dans la période de comparaison')
  await expect(page.getByRole('button', { name: 'Mois précédent' })).toBeVisible()
})

test('the validation message follows a change of language', async ({ page, scenario }) => {
  await scenario('no-locale')
  const selector = page.locator('c2-date-selector')
  const message = () => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validationMessage)
  await expect.poll(message).toBe('Choose a start and end date')
  await page.locator('main').evaluate((main) => main.setAttribute('lang', 'fr'))
  await expect.poll(message).toBe('Choisissez une date de début et de fin')
})

test('a comparison range has no axe violations', async ({ page, scenario }) => {
  await scenario('compare-period')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test("a footer control's input and change stay inside the selector", async ({ page, scenario }) => {
  await scenario('footer')
  const heard = page.locator('c2-date-selector').evaluate((element) => {
    const events: string[] = []
    for (const type of ['input', 'change']) element.addEventListener(type, (event) => events.push(`${type}:${(event.target as Element).localName}`))
    ;(window as unknown as { heard: string[] }).heard = events
  })
  await heard
  await page.getByRole('checkbox', { name: 'Compare' }).click()
  await expect(page.getByRole('status')).toHaveText('footer change')
  await page.getByRole('gridcell', { name: /September 15, 2026/ }).click()
  // Only the selector's own pair reached its listeners.
  expect(await page.evaluate(() => (window as unknown as { heard: string[] }).heard)).toEqual(['input:c2-date-selector', 'change:c2-date-selector'])
})

test('a preset derives the comparison range without writing attributes on the host', async ({ page, scenario }) => {
  await scenario()
  const outcome = await page.evaluate(async () => {
    const element = document.createElement('c2-date-selector')
    for (const [name, value] of Object.entries({ from: '2026-09-10', to: '2026-09-15', compare: 'previous-period', locale: 'en-US' }))
      element.setAttribute(name, value)
    document.querySelector('main')!.append(element)
    await element.updateComplete
    return { compareFrom: element.compareFrom, attributes: element.getAttributeNames().sort() }
  })
  expect(outcome).toEqual({ compareFrom: '2026-09-04', attributes: ['compare', 'from', 'locale', 'to'] })
})

test('restoring the form state keeps a comparison range picked by hand', async ({ page, scenario }) => {
  await scenario('compare-editing')
  await page.getByRole('gridcell', { name: /September 21, 2026/ }).click()
  await page.getByRole('gridcell', { name: /September 24, 2026/ }).click()
  const restored = await page.evaluate(async () => {
    const element = document.createElement('c2-date-selector')
    Object.assign(element, { from: '2026-09-10', to: '2026-09-15', compare: 'previous-period' })
    document.querySelector('main')!.append(element)
    await element.updateComplete
    element.formStateRestoreCallback('2026-09-10/2026-09-15/2026-09-21/2026-09-24/custom')
    await element.updateComplete
    return [element.compare, element.compareFrom, element.compareTo]
  })
  expect(restored).toEqual(['custom', '2026-09-21', '2026-09-24'])
})

test('the locale property also picks the language of the built-in text', async ({ page, scenario }) => {
  await scenario()
  const selector = page.locator('c2-date-selector')
  await selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => (element.locale = 'fr-FR'))
  await expect(page.getByRole('button', { name: 'Mois précédent' })).toBeVisible()
  await expect
    .poll(() => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validationMessage))
    .toBe('Choisissez une date de début et de fin')
})

test('translations added after the first render rewrite the validation message', async ({ page, scenario }) => {
  await scenario('no-locale')
  const selector = page.locator('c2-date-selector')
  await page.locator('main').evaluate((main) => main.setAttribute('lang', 'de'))
  await expect
    .poll(() => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validationMessage))
    .toBe('Choose a start and end date')
  await page.evaluate(() => {
    const { addTranslations } = window as unknown as { addTranslations: (catalogs: Record<string, Record<string, Record<string, string>>>) => void }
    addTranslations({ de: { 'date-selector': { missingRange: 'Wählen Sie ein Start- und Enddatum' } } })
  })
  await expect
    .poll(() => selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => element.validationMessage))
    .toBe('Wählen Sie ein Start- und Enddatum')
})

test('disabled-dates and isDateDisabled close days: read with their reason, not picked, stepped over by the arrows', async ({ page, scenario }) => {
  await scenario('closed')
  const selector = page.locator('c2-date-selector')
  await expect(page.getByRole('gridcell', { name: /^Friday, September 11, 2026, Holiday$/ })).toBeDisabled()
  await expect(page.getByRole('gridcell', { name: /^Tuesday, September 15, 2026$/ })).toBeDisabled()
  await expect(page.getByRole('gridcell', { name: /^Sunday, September 13, 2026$/ })).toBeDisabled()
  await page.getByRole('gridcell', { name: /September 13, 2026/ }).click({ force: true })
  await expect(selector).toHaveAttribute('value', '2026-09-10')
  await page.getByRole('gridcell', { name: /September 10, 2026/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('gridcell', { name: /September 12, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('gridcell', { name: /September 14, 2026/ })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('gridcell', { name: /September 16, 2026/ })).toBeFocused()
  // Back over the same days; down a week onto a closed day lands on the next open one.
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('gridcell', { name: /September 14, 2026/ })).toBeFocused()
  await page.getByRole('gridcell', { name: /September 8, 2026/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('gridcell', { name: /September 16, 2026/ })).toBeFocused()
  await page.getByRole('gridcell', { name: /September 7, 2026/ }).focus()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('gridcell', { name: /September 5, 2026/ })).toBeFocused()
})

test('Home and End stay in the week when its first or last day is closed', async ({ page, scenario }) => {
  await scenario('closed')
  await page.getByRole('gridcell', { name: /September 9, 2026/ }).focus()
  // Sunday 13 is closed: End stops on Saturday 12, not on Monday 14 of the next week.
  await page.keyboard.press('End')
  await expect(page.getByRole('gridcell', { name: /September 12, 2026/ })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('gridcell', { name: /September 7, 2026/ })).toBeFocused()
})

test('the grid keeps exactly one tab stop, on a day that can be picked', async ({ page, scenario }) => {
  const stops = () => page.locator('c2-date-selector').locator('.day[tabindex="0"]')
  // A range starting on a closed day: the tab stop falls back to a day that can be picked.
  await scenario('closed-range')
  await expect(stops()).toHaveCount(1)
  await expect(stops()).toBeEnabled()
  // Nothing selected and no min: one tab stop, not one per day.
  await scenario('multiple-empty')
  await expect(stops()).toHaveCount(1)
})

test('a selected day closed afterwards is not submitted and does not answer required', async ({ page, scenario }) => {
  await scenario('single')
  const selector = page.locator('c2-date-selector')
  const state = () =>
    selector.evaluate((element: HTMLElement & { checkValidity(): boolean }) => ({
      valid: element.checkValidity(),
      submitted: new FormData(element.closest('form')!).get('trip'),
    }))
  expect(await state()).toEqual({ valid: true, submitted: '2026-09-10' })
  await selector.evaluate((element: HTMLElement & { disabledDates: string[] }) => (element.disabledDates = ['2026-09-10']))
  await expect.poll(state).toEqual({ valid: false, submitted: null })
  expect(await selector.evaluate((element: HTMLElement & { validationMessage: string }) => element.validationMessage)).toBe(
    'The chosen date is no longer available',
  )
})

test('the focus stays in the grid when the focused day is closed under it', async ({ page, scenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('scheduled an update')) warnings.push(message.text())
  })
  await scenario('single')
  await page.getByRole('gridcell', { name: /September 15, 2026/ }).focus()
  await page.locator('c2-date-selector').evaluate((element: HTMLElement & { disabledDates: string[] }) => (element.disabledDates = ['2026-09-15']))
  await expect(page.getByRole('gridcell', { name: /September 15, 2026/ })).toBeDisabled()
  await expect(page.locator('c2-date-selector').locator('.day:focus')).toHaveCount(1)
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('c2-date-selector').locator('.day:focus')).toHaveCount(1)
  expect(warnings).toEqual([])
})

test('Home lands on the nearest day inside min', async ({ page, scenario }) => {
  await scenario('constrained')
  // min is Tuesday 8 September: Home from Friday 11 stops there, not on the Monday before it.
  await page.getByRole('gridcell', { name: /September 11, 2026/ }).focus()
  await page.keyboard.press('Home')
  await expect(page.getByRole('gridcell', { name: /September 8, 2026/ })).toBeFocused()
})

test('a range start closed afterwards does not anchor the next click, which starts a new range', async ({ page, scenario }) => {
  await scenario()
  const selector = page.locator('c2-date-selector')
  await selector.evaluate((element: HTMLElement & { disabledDates: string[] }) => (element.disabledDates = ['2026-09-10']))
  await page.getByRole('gridcell', { name: /September 15, 2026/ }).click()
  await expect(selector).toHaveAttribute('from', '2026-09-15')
  await expect(selector).toHaveJSProperty('to', '')
})

test('in multiple mode a selected day closed afterwards can still be taken out', async ({ page, scenario }) => {
  await scenario('multiple')
  const selector = page.locator('c2-date-selector')
  await selector.evaluate((element: HTMLElement & { disabledDates: string[] }) => (element.disabledDates = ['2026-09-10', '2026-09-11']))
  // An unselected closed day stays closed.
  await expect(page.getByRole('gridcell', { name: /September 11, 2026/ })).toBeDisabled()
  await page.getByRole('gridcell', { name: /September 10, 2026/ }).click()
  await expect(selector).toHaveAttribute('value', '2026-09-03')
  await expect(page.getByRole('gridcell', { name: /September 10, 2026/ })).toBeDisabled()
})

test('a range shows its end as the tab stop when its start is not shown', async ({ page, scenario }) => {
  await scenario()
  const selector = page.locator('c2-date-selector')
  await selector.evaluate((element: HTMLElement & { from: string; to: string }) => Object.assign(element, { from: '2026-08-28', to: '2026-09-03' }))
  await expect(selector.locator('.day[tabindex="0"]')).toHaveAttribute('data-date', '2026-09-03')
})
