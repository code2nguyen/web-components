import { accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'
import type { Autocomplete } from '../src/autocomplete'
import { test, expect } from './fixture'

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
  await expect(page.getByRole('option')).toHaveCount(4)

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
  await expect(page.getByRole('option')).toHaveCount(4)

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
  await page.getByRole('option', { name: /Charles de Gaulle Airport/ }).click()
  await expect(host).toHaveJSProperty('value', 'airport')
  await expect(host).toHaveAttribute('data-selected', /"value":"cdg"/)
  await expect(input).toHaveAttribute('aria-expanded', 'false')

  await input.click()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('option', { name: /Charles de Gaulle Airport/ })).toBeVisible()
})

test('loads remote suggestions and aborts a stale request', async ({ page, scenario }) => {
  await scenario('remote')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox')

  await input.fill('p')
  await expect(page.getByRole('status')).toHaveText('Loading suggestions…')
  await input.fill('par')
  await expect(host).toHaveAttribute('data-aborted', 'p')
  await expect(page.getByRole('option')).toHaveCount(3)
  await expect(host).toHaveAttribute('data-request', 'par')
})

test('reuses the last successful remote results when reopening an unchanged query', async ({ page, scenario }) => {
  await scenario('remote')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox')

  await input.fill('par')
  await expect(page.getByRole('option')).toHaveCount(3)
  await expect(host).toHaveAttribute('data-request-count', '1')

  await page.mouse.click(5, 5)
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.click()

  await expect(host).toHaveAttribute('data-request-count', '1')
  await expect(page.getByRole('option')).toHaveCount(3)
  await expect(page.getByRole('status')).toHaveCount(0)

  await host.evaluate((element) => (element as Autocomplete).load())
  await expect(host).toHaveAttribute('data-request-count', '2')
})

test('supports pointer selection, clear, query events and form submission', async ({ page, scenario }) => {
  await scenario('form')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox')

  await input.fill('airport')
  await page.getByRole('option', { name: /Charles de Gaulle Airport/ }).click()
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
  await expect(page.getByRole('option', { name: /Ada Lovelace Platform/ })).toBeVisible()

  await page.getByRole('option', { name: /Ada Lovelace Platform/ }).click()
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
