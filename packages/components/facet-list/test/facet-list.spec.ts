import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { FacetList } from '../src/facet-list'

const names = (page: Page) => page.getByRole('checkbox').evaluateAll((boxes) => boxes.map((box) => box.getAttribute('aria-label')))

const facet = (page: Page) => page.locator('c2-facet-list')
const state = (page: Page) => facet(page).evaluate((element: FacetList) => ({ include: element.include, exclude: element.exclude }))
const VALUES = `values='[{"value":"search","count":8100},{"value":"checkout","count":12400},{"value":"payments","count":2300},{"value":"auth","label":"Auth service","count":950}]'`

test('values are checkboxes named by label and count, sorted by count, in a group named by the facet', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-facet-list label="Service" ${VALUES}></c2-facet-list>`)
  await expect(facet(page)).toHaveHostAria('role', 'group')
  await expect(facet(page)).toHaveHostAria('aria-label', 'Service')
  expect(await names(page)).toEqual(['checkout, 12.4K', 'search, 8.1K', 'payments, 2.3K', 'Auth service, 950'])
  await expect(page.getByRole('button', { name: 'Service', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await accessible(page)
})

test('the checkbox includes, Only isolates, Exclude excludes, Clear empties; each change fires filter-change first', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-facet-list label="Service" ${VALUES}></c2-facet-list>`)
  await watch(facet(page), 'filter-change')
  await page.getByRole('checkbox', { name: /^checkout/ }).check()
  await page.getByRole('checkbox', { name: /^search/ }).check()
  expect(await state(page)).toEqual({ include: ['checkout', 'search'], exclude: [] })
  await page.getByRole('button', { name: 'Only payments' }).click()
  expect(await state(page)).toEqual({ include: ['payments'], exclude: [] })
  await page.getByRole('button', { name: 'Exclude auth' }).click()
  expect(await state(page)).toEqual({ include: ['payments'], exclude: ['auth'] })
  await expect(page.getByRole('checkbox', { name: 'Auth service, 950, excluded' })).toHaveJSProperty('indeterminate', true)
  await page.getByRole('button', { name: 'Include Auth service' }).click()
  expect(await state(page)).toEqual({ include: ['payments'], exclude: [] })
  await page.getByRole('button', { name: 'Clear Service' }).click()
  expect(await state(page)).toEqual({ include: [], exclude: [] })
  expect(JSON.parse((await facet(page).getAttribute('data-events'))!).at(0)).toEqual({ include: ['checkout'], exclude: [] })
  await expect(page.getByRole('button', { name: 'Clear Service' })).toHaveCount(0)
})

test('cancelling filter-change keeps the selection, and the checkbox follows it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-facet-list label="Service" ${VALUES}></c2-facet-list>`)
  await facet(page).evaluate((element: FacetList) => element.addEventListener('filter-change', (event) => event.preventDefault()))
  await page.getByRole('checkbox', { name: /^checkout/ }).click()
  await expect(page.getByRole('checkbox', { name: /^checkout/ })).not.toBeChecked()
  expect(await state(page)).toEqual({ include: [], exclude: [] })
})

test('search filters the values, max-items shows the first ones, and the title collapses the facet', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-facet-list label="Service" searchable max-items="2" ${VALUES}></c2-facet-list>`)
  await expect(page.getByRole('checkbox')).toHaveCount(2)
  await page.getByRole('button', { name: 'Show all 4' }).click()
  await expect(page.getByRole('checkbox')).toHaveCount(4)
  await page.getByRole('searchbox', { name: 'Filter values' }).fill('AUTH')
  await expect(page.getByRole('checkbox')).toHaveCount(1)
  expect(await names(page)).toEqual(['Auth service, 950'])
  await page.getByRole('searchbox', { name: 'Filter values' }).fill('zzz')
  await expect(facet(page).locator('.empty')).toHaveText('No values match')
  await watch(facet(page), 'toggle')
  await page.getByRole('button', { name: 'Service', exact: true }).click()
  await expect(page.getByRole('searchbox')).toBeHidden()
  await expect(facet(page))
    .toHaveAttribute('open', /.*/, { timeout: 100 })
    .catch(() => undefined)
  expect(await facet(page).evaluate((element: FacetList) => element.open)).toBe(false)
})

test('the text follows the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-facet-list ${VALUES} include="search"></c2-facet-list></div>`)
  await expect(facet(page)).toHaveHostAria('aria-label', 'Filtre')
  await expect(page.getByRole('button', { name: 'Seulement checkout' })).toHaveText('Seul')
  await expect(page.getByRole('button', { name: 'Effacer Filtre' })).toBeVisible()
  await accessible(page)
})

test('numeric values are read as text, and a selected value past max-items stays visible', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-facet-list label="Status" max-items="2" include="500" values='[{"value":200,"count":9000},{"value":404,"count":300},{"value":500,"count":12}]'></c2-facet-list>`,
  )
  expect(await names(page)).toEqual(['200, 9K', '404, 300', '500, 12'])
  await expect(page.getByRole('checkbox', { name: '500, 12' })).toBeChecked()
})
