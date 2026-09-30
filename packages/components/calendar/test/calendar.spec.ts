import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('draws a multi-day event as a bar on every week it covers', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  const vacation = page.getByRole('button', { name: 'Vacation, September 10, 2026 – September 15, 2026' })
  // Thursday 10 – Sunday 13, then Monday 14 – Tuesday 15 on the next row.
  await expect(vacation).toHaveCount(2)
  const [first, second] = [await vacation.nth(0).boundingBox(), await vacation.nth(1).boundingBox()]
  expect(second!.y).toBeGreaterThan(first!.y)
  expect(first!.width).toBeGreaterThan(second!.width)
})

test('stacks overlapping events in separate lanes', async ({ page, scenario }) => {
  await scenario()
  const vacation = await page
    .getByRole('button', { name: /^Vacation/ })
    .first()
    .boundingBox()
  const flight = await page.getByRole('button', { name: 'Flight, September 10, 2026' }).boundingBox()
  expect(flight!.x).toBeCloseTo(vacation!.x, 0)
  expect(flight!.y).toBeGreaterThan(vacation!.y)
})

test('skips events without a valid start date', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('button', { name: /Broken/ })).toHaveCount(0)
})

test('fires event-click with the clicked entry', async ({ page, scenario }) => {
  await scenario()
  await page
    .getByRole('button', { name: /^Vacation/ })
    .last()
    .click()
  await expect(page.getByRole('status')).toHaveText('click:vacation')
})

test('opens an event from the keyboard', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Flight, September 10, 2026' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('click:flight')
})

test('navigates months and reports the change', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Next month' }).click()
  await expect(page.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('month:2026-10')
  await expect(page.locator('c2-calendar')).toHaveJSProperty('month', '2026-10')
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page.getByRole('heading', { name: 'August 2026' })).toBeVisible()
})

test('reads month and events from attributes', async ({ page, scenario }) => {
  await scenario('attribute')
  await expect(page.getByRole('heading', { name: 'November 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ski trip, November 20, 2026 – November 22, 2026' })).toHaveCount(1)
})

test('keeps a Sunday-first week in one row', async ({ page, scenario }) => {
  await scenario('sunday')
  // Sunday first: September 10 – 12 and 13 – 15 fall in two rows.
  await expect(page.getByRole('button', { name: /^Vacation/ })).toHaveCount(2)
  await expect(page.locator('c2-calendar').locator('.weekdays span').first()).toHaveText('Sun')
})

test('has no axe violations', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('region', { name: 'September 2026' })).toBeVisible()
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})

test.describe('month picker', () => {
  test('marks the months that have events', async ({ page, scenario }) => {
    await scenario()
    await page.getByRole('button', { name: 'September 2026' }).click()
    const picker = page.getByRole('dialog', { name: 'Choose a month' })
    await expect(picker).toBeVisible()
    await expect(picker.getByRole('button', { name: 'September 2026, has events' })).toBeFocused()
    await expect(picker.getByRole('button', { name: 'October 2026, has events' })).toBeVisible()
    await expect(picker.getByRole('button', { name: 'November 2026', exact: true })).toBeVisible()
  })

  test('jumps to a month of another year in a few clicks', async ({ page, scenario }) => {
    await scenario()
    await page.getByRole('button', { name: 'September 2026' }).click()
    await page.getByRole('button', { name: /^Next year/ }).click()
    await expect(page.getByRole('dialog').getByText('2027')).toBeVisible()
    await page.getByRole('button', { name: 'June 2027, has events' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'June 2027' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('month:2027-06')
    await expect(page.getByRole('button', { name: 'Future trip, June 1, 2027' })).toBeVisible()
  })

  test('moves with the keyboard and picks with Enter', async ({ page, scenario }) => {
    await scenario()
    await page.getByRole('button', { name: 'September 2026' }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('button', { name: /^October 2026/ })).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByRole('button', { name: /^June 2026/ })).toBeFocused()
    await page.keyboard.press('PageUp')
    await expect(page.getByRole('button', { name: /^June 2025/ })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'June 2025' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'June 2025' })).toBeFocused()
  })

  test('closes on Escape and on an outside click without changing month', async ({ page, scenario }) => {
    await scenario()
    const title = page.getByRole('button', { name: 'September 2026' })
    await title.click()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(title).toBeFocused()
    await expect(title).toHaveAttribute('aria-expanded', 'false')

    await title.click()
    await page.mouse.click(5, 5)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  })

  test('can be turned off', async ({ page, scenario }) => {
    await scenario('no-picker')
    await expect(page.getByRole('heading', { name: 'September 2026' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'September 2026' })).toHaveCount(0)
  })

  test('has no axe violations while open', async ({ page, scenario }) => {
    await scenario()
    await page.getByRole('button', { name: 'September 2026' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
})

test('keeps white text on an event with its own colour when the theme darkens the default text', async ({ page, scenario }) => {
  await scenario()
  // The dark theme sets the default event text to a dark colour for its lighter default bar.
  await page.locator('c2-calendar').evaluate((element) => (element as HTMLElement).style.setProperty('--c2-calendar__event--color', 'rgb(24, 24, 27)'))
  await expect(page.getByRole('button', { name: /^Vacation/ }).first()).toHaveCSS('color', 'rgb(255, 255, 255)')
  await expect(page.getByRole('button', { name: /^Flight/ })).toHaveCSS('color', 'rgb(24, 24, 27)')
})

test('speaks the language set in locale', async ({ page, scenario }) => {
  await scenario('french')
  await expect(page.getByRole('heading', { name: 'septembre 2026' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aujourd’hui' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mois suivant' })).toBeVisible()
  await expect(page.locator('c2-calendar').locator('.weekdays span').first()).toHaveText('lun.')
  await page.getByRole('button', { name: 'septembre 2026', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Choisir un mois' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'octobre 2026, contient des événements' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Année suivante' })).toBeVisible()
})

test.describe('without a locale attribute', () => {
  test.use({ locale: 'fr-FR' })

  test("follows the browser's language", async ({ page, scenario }) => {
    await scenario('browser-locale')
    await expect(page.getByRole('button', { name: 'Aujourd’hui' })).toBeVisible()
  })
})
