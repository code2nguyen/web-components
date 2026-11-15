import type { Page } from '@playwright/test'
import { accessible, expect } from '../../../../tests/component-fixture'
import type { Autocomplete } from '../src/autocomplete'
import { test } from './fixture'

// The record picker: `multiple` picks as chips, a "create" row and recent items.

const options = (page: Page) => page.locator('c2-autocomplete c2-list-item')
const chips = (page: Page) => page.locator('c2-autocomplete c2-chip')
const formEntries = (page: Page) => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).getAll('destination'))

test('multiple keeps every pick as a chip, leaves picks out of the suggestions and submits one entry per pick', async ({ page, scenario }) => {
  await scenario('multiple')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox', { name: 'Search destinations' })

  await input.fill('par')
  await expect(options(page)).toHaveCount(4)
  await input.press('Enter')
  await expect(chips(page)).toHaveText(['Paris'])
  await expect(input).toHaveValue('')
  await expect(host).toHaveAttribute('data-changes', '1')
  await expect.poll(() => formEntries(page)).toEqual(['paris'])

  await input.fill('par')
  await expect(options(page)).toHaveCount(3)
  await expect(options(page).filter({ hasText: /^Paris\s*France$/ })).toHaveCount(0)
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(chips(page)).toHaveText(['Paris', 'Charles de Gaulle Airport'])
  await expect.poll(() => formEntries(page)).toEqual(['paris', 'cdg'])
  await accessible(page)
})

test('Backspace in an empty input and the chip remove button drop a pick', async ({ page, scenario }) => {
  await scenario('multiple')
  const host = page.locator('c2-autocomplete')
  await host.evaluate((element: Autocomplete) => {
    element.selectedItems = [
      { value: 'paris', label: 'Paris' },
      { value: 'cdg', label: 'Charles de Gaulle Airport' },
      { value: 'lyon', label: 'Lyon' },
    ]
  })
  const input = page.getByRole('combobox', { name: 'Search destinations' })
  await expect(chips(page)).toHaveCount(3)

  await input.focus()
  await input.press('Backspace')
  await expect(chips(page)).toHaveText(['Paris', 'Charles de Gaulle Airport'])
  await expect(host).toHaveAttribute('data-removed', /"value":"lyon".*"index":2/)
  await expect.poll(() => formEntries(page)).toEqual(['paris', 'cdg'])

  await page.getByRole('button', { name: 'Remove Paris' }).click()
  await expect(chips(page)).toHaveText(['Charles de Gaulle Airport'])
  await expect(host).toHaveAttribute('data-removed', /"value":"paris"/)
  await expect(input).toBeFocused()
  // The chip's own `remove` event stays inside the autocomplete.
  await expect(host).not.toHaveAttribute('data-stray-remove')

  // Backspace only removes a pick while the query is empty.
  await input.fill('ly')
  await input.press('Backspace')
  await expect(chips(page)).toHaveCount(1)
})

test('preserve keeps the query and the remaining matches open after a pick', async ({ page, scenario }) => {
  await scenario('multiple')
  const host = page.locator('c2-autocomplete')
  await host.evaluate((element: Autocomplete) => (element.selectionBehavior = 'preserve'))
  const input = page.getByRole('combobox', { name: 'Search destinations' })

  await input.fill('par')
  await input.press('Enter')
  await expect(input).toHaveValue('par')
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(options(page)).toHaveCount(3)
  await input.press('Enter')
  await expect(chips(page)).toHaveCount(2)
})

test('required, reset and a read-only picker follow the picks', async ({ page, scenario }) => {
  await scenario('multiple')
  const host = page.locator('c2-autocomplete')
  const valueMissing = () => host.evaluate((element: Autocomplete) => element.validity.valueMissing)
  await host.evaluate((element: Autocomplete) => (element.required = true))
  await expect.poll(valueMissing).toBe(true)

  const input = page.getByRole('combobox', { name: 'Search destinations' })
  await input.fill('lyon')
  await expect.poll(valueMissing).toBe(true)
  await input.press('Enter')
  await expect.poll(valueMissing).toBe(false)

  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(chips(page)).toHaveCount(0)
  await expect.poll(() => formEntries(page)).toEqual([])

  await host.evaluate((element: Autocomplete) => {
    element.selectedItems = [{ value: 'paris', label: 'Paris' }]
    element.readonly = true
  })
  await expect(page.getByRole('button', { name: 'Remove Paris' })).toHaveCount(0)
})

test('selected-items in markup render chips and are restored by a form reset', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-autocomplete multiple name="tag" aria-label="Tags" item-key="id"
    suggestions='[{"id":"a","label":"Alpha"},{"id":"b","label":"Beta"}]'
    selected-items='[{"id":"b","label":"Beta"}]'></c2-autocomplete></form>`)
  await expect(chips(page)).toHaveText(['Beta'])
  const input = page.getByRole('combobox', { name: 'Tags' })
  await input.fill('a')
  await expect(options(page)).toHaveText(['Alpha'], { useInnerText: true })
  await input.press('Enter')
  await expect(chips(page)).toHaveText(['Beta', 'Alpha'])
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).getAll('tag'))).toEqual(['b', 'a'])
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(chips(page)).toHaveText(['Beta'])
})

test('renderPick replaces the chip label', async ({ page, scenario }) => {
  await scenario('multiple')
  await page.locator('c2-autocomplete').evaluate((element: Autocomplete) => {
    element.renderPick = ({ item }) => `★ ${(item as { label: string }).label}`
    element.selectedItems = [{ value: 'paris', label: 'Paris' }]
  })
  await expect(chips(page)).toHaveText(['★ Paris'])
})

test('creatable offers a create row the keyboard reaches, and pick() takes the created record', async ({ page, scenario }) => {
  await scenario('creatable')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox', { name: 'Search destinations' })

  // An exact match hides the row.
  await input.fill('paris')
  await expect(options(page).filter({ hasText: 'Create' })).toHaveCount(0)

  await input.fill('par')
  const create = options(page).last()
  await expect(create).toHaveText('Create “par”', { useInnerText: true })
  await input.press('End')
  await expect(input).toHaveAttribute('aria-activedescendant', (await create.getAttribute('id'))!)

  // Nothing matches: the row is the only one, but Enter alone does not create a record from a typo.
  await input.fill('Nantes')
  await expect(options(page)).toHaveText(['Create “Nantes”'], { useInnerText: true })
  await expect(page.getByRole('status')).toHaveCount(0)
  await input.press('Enter')
  await expect(host).not.toHaveAttribute('data-create')
  // Enter commits the input, which fires a native change of its own; count from here.
  await host.evaluate((element) => ((element as HTMLElement).dataset.changes = '0'))
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(host).toHaveAttribute('data-create', 'Nantes')
  // The scenario's handler creates the record and hands it back with pick(), which fires change.
  await expect(chips(page)).toHaveText(['Nantes'])
  await expect(host).toHaveAttribute('data-changes', '1')
  await expect.poll(() => formEntries(page)).toEqual(['new-nantes'])
  await accessible(page)

  // A record outside the shown page still counts as an exact match.
  await host.evaluate((element: Autocomplete) => (element.maxResults = 1))
  await input.fill('lyon')
  await expect(options(page)).toHaveCount(1)
  await input.fill('paris')
  await expect(options(page).filter({ hasText: 'Create' })).toHaveCount(0)
})

test('Left Arrow reaches the picks, which the arrows move between and Backspace or Delete remove', async ({ page, scenario }) => {
  await scenario('multiple')
  const host = page.locator('c2-autocomplete')
  await host.evaluate((element: Autocomplete) => {
    element.selectedItems = [
      { value: 'paris', label: 'Paris' },
      { value: 'cdg', label: 'Charles de Gaulle Airport' },
      { value: 'lyon', label: 'Lyon' },
    ]
  })
  const input = page.getByRole('combobox', { name: 'Search destinations' })
  const removeButton = (name: string) => page.getByRole('button', { name: `Remove ${name}` })

  // Out of the Tab order: Shift+Tab from the input leaves the field.
  await input.focus()
  await input.press('Shift+Tab')
  await expect(removeButton('Lyon')).not.toBeFocused()

  await input.focus()
  await input.press('ArrowLeft')
  await expect(removeButton('Lyon')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(removeButton('Charles de Gaulle Airport')).toBeFocused()
  await page.keyboard.press('Backspace')
  await expect(chips(page)).toHaveText(['Paris', 'Lyon'])
  await expect(removeButton('Paris')).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(chips(page)).toHaveText(['Lyon'])
  await expect(removeButton('Lyon')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(input).toBeFocused()
  await expect.poll(() => formEntries(page)).toEqual(['lyon'])
})

test('a record without its item-key field is keyed by its label', async ({ page, scenario }) => {
  await scenario('multiple')
  await page.locator('c2-autocomplete').evaluate((element: Autocomplete) => {
    element.pick({ label: 'New A' })
    element.pick({ label: 'New B' })
  })
  await expect(chips(page)).toHaveText(['New A', 'New B'])
  await expect.poll(() => formEntries(page)).toEqual(['New A', 'New B'])
})

test('a pointer chooses the create row of a single-value autocomplete', async ({ page, scenario }) => {
  await scenario('local')
  const host = page.locator('c2-autocomplete')
  await host.evaluate((element: Autocomplete) => {
    element.creatable = true
    element.addEventListener('create-request', (event) => element.pick({ value: 'new', label: event.detail.query }))
  })
  await page.getByRole('combobox').fill('Lille')
  await options(page).filter({ hasText: 'Create “Lille”' }).click()
  await expect(host).toHaveJSProperty('value', 'new')
  await expect.poll(() => host.evaluate((element: Autocomplete) => (element.selectedItem as { label: string }).label)).toBe('Lille')
})

test('recent items show under a heading while the query is empty, then give way to matches', async ({ page, scenario }) => {
  await scenario('recent')
  const host = page.locator('c2-autocomplete')
  const input = page.getByRole('combobox', { name: 'Search destinations' })
  // The default description grey on the active row's grey is 4.39:1, an existing default this step does not change;
  // the audit is about the heading inside the listbox.
  await host.evaluate((element: Autocomplete) => element.style.setProperty('--c2-autocomplete__description--color', '#52525b'))

  await input.focus()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  await expect(host.locator('c2-list h3')).toHaveText('Recent')
  await expect(options(page)).toHaveText(['LyonFrance', 'Charles de Gaulle AirportParis, France'], { useInnerText: true })
  await accessible(page)

  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(host).toHaveJSProperty('value', 'cdg')

  await input.fill('')
  await expect(options(page)).toHaveCount(2)
  await input.fill('paris')
  await expect(host.locator('c2-list h3')).toHaveCount(0)
  await expect(options(page)).toHaveCount(4)
})

test('recent items leave out the picks of a multiple picker', async ({ page, scenario }) => {
  await scenario('recent')
  const host = page.locator('c2-autocomplete')
  await host.evaluate((element: Autocomplete) => {
    element.multiple = true
    element.selectedItems = [{ value: 'lyon', label: 'Lyon' }]
  })
  await page.getByRole('combobox').click()
  await expect(options(page)).toHaveText(['Charles de Gaulle AirportParis, France'], { useInnerText: true })
})

test('without the new attributes nothing opens on focus and no chip loads', async ({ page, scenario }) => {
  await scenario('local')
  const input = page.getByRole('combobox')
  await input.focus()
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await input.fill('zzz')
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  expect(await page.evaluate(() => customElements.get('c2-chip'))).toBeUndefined()
})

test('the create row and the recent heading follow the nearest lang', async ({ page, scenario }) => {
  await scenario('recent')
  await page.locator('main').evaluate((main) => main.setAttribute('lang', 'fr'))
  const host = page.locator('c2-autocomplete')
  await host.evaluate((element: Autocomplete) => (element.creatable = true))
  const input = page.getByRole('combobox')
  await input.focus()
  await expect(host.locator('c2-list h3')).toHaveText('Récents')
  await input.fill('Nantes')
  await expect(options(page)).toHaveText(['Créer « Nantes »'], { useInnerText: true })
})
