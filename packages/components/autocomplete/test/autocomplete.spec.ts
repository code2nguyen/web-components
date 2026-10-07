import type { Page } from '@playwright/test'
import { accessible, expect, slotPresenceMatrix } from '../../../../tests/component-fixture'
import type { Autocomplete } from '../src/autocomplete'
import { test } from './fixture'

// Suggestion rows state their role through ElementInternals, which getByRole cannot see: find them by tag.
const options = (page: Page) => page.locator('c2-autocomplete c2-list-item')

test('header presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const header = page.locator('c2-autocomplete').locator('.panel-header')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-autocomplete><span slot="header" data-slot-presence-probe>Suggestions</span></c2-autocomplete>',
    host: 'c2-autocomplete',
    slot: 'header',
    assertPresent: async (present) => (present ? expect(header).not.toHaveAttribute('hidden', '') : expect(header).toHaveAttribute('hidden', '')),
  })
})

test('filters label and description fields, then selects with the keyboard', async ({ page, scenario }) => {
  await scenario('local')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox', { name: 'Search destinations' })

  await input.fill('par')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(options(page)).toHaveCount(4)
  await expect(options(page).first()).toHaveHostAria('role', 'option')

  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(host).toHaveJSProperty('value', 'paris-texas')
  await expect(host).toHaveAttribute('data-selected', /"value":"paris-texas"/)
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await accessible(page)
})

test('keeps suggestions open when the input is clicked with an existing query', async ({ page, scenario }) => {
  await scenario('local')
  const input = page.getByRole('combobox', { name: 'Search destinations' })

  await input.fill('par')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await input.click()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(options(page)).toHaveCount(4)

  await page.mouse.click(5, 5)
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.click()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await input.press('Escape')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
})

test('preserves the query and reuses its results when selection behavior is preserve', async ({ page, scenario }) => {
  await scenario('preserve')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox', { name: 'Search destinations' })

  await input.fill('airport')
  await options(page)
    .filter({ hasText: /Charles de Gaulle Airport/ })
    .click()
  await expect(host).toHaveJSProperty('value', 'airport')
  await expect(host).toHaveAttribute('data-selected', /"value":"cdg"/)
  await expect(input).toHaveAttribute('aria-expanded', 'false')

  await input.click()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(options(page).filter({ hasText: /Charles de Gaulle Airport/ })).toBeVisible()
})

test('loads remote suggestions and aborts a stale request', async ({ page, scenario }) => {
  await scenario('remote')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox')

  await input.fill('p')
  await expect(page.getByRole('status')).toHaveText('Loading suggestions…')
  await input.fill('par')
  await expect(host).toHaveAttribute('data-aborted', 'p')
  await expect(options(page)).toHaveCount(3)
  await expect(host).toHaveAttribute('data-request', 'par')
})

test('reuses the last successful remote results when reopening an unchanged query', async ({ page, scenario }) => {
  await scenario('remote')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox')

  await input.fill('par')
  await expect(options(page)).toHaveCount(3)
  await expect(host).toHaveAttribute('data-request-count', '1')

  await page.mouse.click(5, 5)
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.click()

  await expect(host).toHaveAttribute('data-request-count', '1')
  await expect(options(page)).toHaveCount(3)
  await expect(page.getByRole('status')).toHaveCount(0)

  await host.evaluate((element) => (element as Autocomplete).load())
  await expect(host).toHaveAttribute('data-request-count', '2')
})

test('supports pointer selection, clear, query events and form submission', async ({ page, scenario }) => {
  await scenario('form')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox')

  await input.fill('airport')
  await options(page)
    .filter({ hasText: /Charles de Gaulle Airport/ })
    .click()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('destination'))).toBe('cdg')

  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(host).toHaveJSProperty('value', '')
  await expect(host).toHaveAttribute('data-query', '')
})

test('shows the empty state and disabled state', async ({ page, scenario }) => {
  await scenario('empty')
  await page.getByRole('combobox').fill('nowhere')
  await expect(page.getByRole('status')).toHaveText('No suggestions found.')

  await scenario('disabled')
  await expect(page.getByRole('combobox')).toBeDisabled()
  await expect(page.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false')
})

test('composes list items around renderItem content between header and footer slots', async ({ page, scenario }) => {
  await scenario('custom')
  const host = page.locator('c2-autocomplete')
  await page.getByRole('combobox').fill('platform')

  await expect(host.locator('c2-list')).toBeVisible()
  await expect(host.locator('c2-list-item')).toHaveCount(1)
  await expect(page.getByText('People directory')).toBeVisible()
  await expect(page.getByText('View all people')).toBeVisible()
  await expect(options(page).filter({ hasText: /Ada Lovelace\s*Platform/ })).toBeVisible()

  await options(page)
    .filter({ hasText: /Ada Lovelace\s*Platform/ })
    .click()
  await expect(host).toHaveJSProperty('value', '7')
  await expect(host).toHaveAttribute('data-selected', /"id":7/)
})

test('consumer-owned slot content remains directly styleable', async ({ page, scenario }) => {
  await scenario('local')
  const slots = ['clear-icon', 'empty', 'error', 'footer', 'header', 'loading', 'prefix-icon', 'suffix-icon']
  await page.locator('c2-autocomplete').evaluate((host, names) => {
    for (const name of names) host.insertAdjacentHTML('beforeend', `<span class="slot-probe" slot="${name}">${name}</span>`)
  }, slots)
  await page.locator('.slot-probe').evaluateAll((nodes) => nodes.forEach((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)')))
  await expect(page.locator('.slot-probe')).toHaveCount(slots.length)
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.color)))
    .toEqual(slots.map(() => 'rgb(1, 2, 3)'))
})

test('the option, description and list variables reach the composed c2-list and its rows', async ({ page, scenario }) => {
  await scenario('local')
  await page.locator('c2-autocomplete').evaluate((element: Autocomplete) => {
    element.style.setProperty('--c2-autocomplete__list--padding', '13px')
    element.style.setProperty('--c2-autocomplete__option--min-height', '57px')
    element.style.setProperty('--c2-autocomplete__option--padding-left', '21px')
    element.style.setProperty('--c2-autocomplete__option--gap', '17px')
    element.style.setProperty('--c2-autocomplete__option--border-radius', '9px')
    element.style.setProperty('--c2-autocomplete__option__active--background', 'rgb(1, 2, 3)')
    element.style.setProperty('--c2-autocomplete__option__active--color', 'rgb(250, 251, 252)')
    element.style.setProperty('--c2-autocomplete__description--color', 'rgb(40, 50, 60)')
    element.style.setProperty('--c2-autocomplete__description--font-size', '15px')
  })
  await page.getByRole('combobox', { name: 'Search destinations' }).fill('par')
  await expect(page.locator('c2-autocomplete c2-list')).toHaveCSS('padding-top', '13px')
  const row = options(page).nth(1)
  await row.hover()
  const box = row.locator('.c2-list-item')
  await expect(box).toHaveCSS('min-height', '57px')
  await expect(box).toHaveCSS('padding-left', '21px')
  await expect(box).toHaveCSS('gap', '17px')
  await expect(box).toHaveCSS('border-top-left-radius', '9px')
  // The pointer makes the row active: it is the list's selected row, hovered.
  await expect(box).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(box).toHaveCSS('color', 'rgb(250, 251, 252)')
  const description = options(page).first().locator('.c2-list-item__description')
  await expect(description).toHaveCSS('font-size', '15px')
  await expect(description).toHaveCSS('color', 'rgb(40, 50, 60)')
})

test('hides the header and footer when the panel has little room, and shows them again when it has enough', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 400, height: 200 })
  await renderScenario(`<c2-autocomplete aria-label="People" suggestions='["Ada","Alan","Grace"]'>
    <span slot="header">People</span>
    <span slot="footer">Invite</span>
  </c2-autocomplete>`)
  const host = page.locator('c2-autocomplete')
  const header = host.locator('.panel-header')
  const footer = host.locator('.panel-footer')

  await page.getByRole('combobox', { name: 'People' }).fill('a')
  await expect(options(page).first()).toBeVisible()
  await expect(header).toBeHidden()
  await expect(footer).toBeHidden()

  await page.setViewportSize({ width: 400, height: 700 })
  await expect(header).toBeVisible()
  await expect(footer).toBeVisible()
})
