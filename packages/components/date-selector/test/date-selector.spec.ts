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
  await expect(selector).toHaveAttribute('compare-from', '2026-09-04')
  await expect(selector).toHaveAttribute('compare-to', '2026-09-09')
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
  await expect(selector).toHaveAttribute('compare-from', '2026-09-17')
  await expect(selector).toHaveAttribute('compare-to', '2026-09-19')
  await expect(page.getByRole('status')).toHaveText('2026-09-20/2026-09-22 vs 2026-09-17/2026-09-19')
})

test('previous-year shifts the range by a year, February 29 included', async ({ page, scenario }) => {
  await scenario('compare-year')
  const selector = page.locator('c2-date-selector')
  await expect(selector).toHaveAttribute('compare-from', '2025-09-10')
  await expect(selector).toHaveAttribute('compare-to', '2025-09-15')
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
  await expect(selector).toHaveAttribute('compare-from', '2026-09-21')
  await expect(selector).toHaveJSProperty('compareTo', '')
  // A lone start is a one-day band while the end is picked.
  await expect(page.getByRole('gridcell', { name: /September 21, 2026/ })).toHaveClass(/compare-start compare-end/)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(selector).toHaveAttribute('compare-to', '2026-09-28')
  // The range itself is untouched, and the comparison no longer follows it: it is custom now.
  await expect(selector).toHaveAttribute('from', '2026-09-10')
  await expect(selector).toHaveAttribute('to', '2026-09-15')
  await expect(page.getByRole('status')).toHaveText('2026-09-10/2026-09-15 vs 2026-09-21/2026-09-28')
  await selector.evaluate((element: HTMLElementTagNameMap['c2-date-selector']) => (element.editing = 'range'))
  await page.getByRole('gridcell', { name: /September 2, 2026/ }).click()
  await expect(selector).toHaveAttribute('from', '2026-09-02')
  await expect(selector).toHaveAttribute('compare-from', '2026-09-21')
  await expect(selector).toHaveAttribute('compare-to', '2026-09-28')
})

test('submits the comparison range beside the range and resets both', async ({ page, scenario }) => {
  await scenario('compare-period')
  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page.getByRole('status')).toHaveText('{"trip":"2026-09-10","trip-end":"2026-09-15","trip-compare":"2026-09-04","trip-compare-end":"2026-09-09"}')
  await page.getByRole('gridcell', { name: /September 20, 2026/ }).click()
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.locator('c2-date-selector')).toHaveAttribute('to', '2026-09-15')
  await expect(page.locator('c2-date-selector')).toHaveAttribute('compare-from', '2026-09-04')
})

test('a preset keeps its comparison range through a reset and over a range set by hand', async ({ page, scenario }) => {
  await scenario('compare-period')
  const selector = page.locator('c2-date-selector')
  // Reset with the range untouched: the derived comparison range is derived again, not emptied.
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(selector).toHaveAttribute('compare-from', '2026-09-04')
  await expect(selector).toHaveAttribute('compare-to', '2026-09-09')
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

test('the comparison note and the navigation follow the nearest lang', async ({ page, scenario }) => {
  await scenario('compare-lang')
  await expect(page.getByRole('gridcell', { name: /September 5, 2026/ })).toHaveAccessibleDescription('Dans la période de comparaison')
  await expect(page.getByRole('button', { name: 'Mois précédent' })).toBeVisible()
})

test('the validation message follows a change of language', async ({ page, scenario }) => {
  await scenario()
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
