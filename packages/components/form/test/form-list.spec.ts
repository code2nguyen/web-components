import type { Page } from '@playwright/test'
import type { FormList, FormListRowValue } from '../src/form-list'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const list = (page: Page) => page.locator('c2-form-list')

const row = `<template>
  <fieldset class="row">
    <legend>Contact <span data-row-number></span></legend>
    <c2-form-field label="Name"><c2-text-field name="name" required></c2-text-field></c2-form-field>
    <c2-form-field label="Email"><c2-text-field name="email"></c2-text-field></c2-form-field>
    <button type="button" data-action="move-up">Move up</button>
    <button type="button" data-action="move-down">Move down</button>
    <button type="button" data-action="duplicate">Duplicate</button>
    <button type="button" data-action="remove">Remove</button>
  </fieldset>
</template>`

const contacts = (attributes = 'name="contacts"', rows = '') => `<c2-form>
  <form>
    <c2-form-list ${attributes}>${row}${rows}</c2-form-list>
    <div><c2-button type="submit">Save</c2-button> <c2-button type="reset">Discard</c2-button></div>
  </form>
</c2-form>`

const authored = (name: string, email = '') => `<fieldset class="row">
  <legend>Contact <span data-row-number></span></legend>
  <c2-form-field label="Name"><c2-text-field name="name" value="${name}" required></c2-text-field></c2-form-field>
  <c2-form-field label="Email"><c2-text-field name="email" value="${email}"></c2-text-field></c2-form-field>
  <button type="button" data-action="move-up">Move up</button>
  <button type="button" data-action="move-down">Move down</button>
  <button type="button" data-action="duplicate">Duplicate</button>
  <button type="button" data-action="remove">Remove</button>
</fieldset>`

const value = (page: Page) => list(page).evaluate((element) => (element as FormList).value)
const names = (page: Page) => page.locator('c2-form-list c2-text-field').evaluateAll((fields) => fields.map((field) => field.getAttribute('name')))
const formValues = (page: Page) => page.locator('c2-form').evaluate((element) => (element as HTMLElement & { values: Record<string, unknown> }).values)

test('starts with min rows, and the add button appends a row and focuses its first control', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts" min="1"'))
  await expect(page.locator('fieldset.row')).toHaveCount(1)
  await expect(page.locator('legend')).toHaveText(['Contact 1'])
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(page.locator('fieldset.row')).toHaveCount(2)
  await expect(page.getByRole('textbox', { name: 'Name' }).nth(1)).toBeFocused()
  await expect(page.locator('legend')).toHaveText(['Contact 1', 'Contact 2'])
  expect(await names(page)).toEqual(['contacts.0.name', 'contacts.0.email', 'contacts.1.name', 'contacts.1.email'])
})

test('value reads every row as an object, and the form submits indexed names', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada', 'ada@example.com') + authored('Grace')))
  expect(await value(page)).toEqual([
    { name: 'Ada', email: 'ada@example.com' },
    { name: 'Grace', email: '' },
  ])
  expect(await formValues(page)).toEqual({
    'contacts.0.name': 'Ada',
    'contacts.0.email': 'ada@example.com',
    'contacts.1.name': 'Grace',
    'contacts.1.email': '',
  })
})

test('without a name the controls keep their names', async ({ page, renderScenario }) => {
  await renderScenario(contacts('', authored('Ada') + authored('Grace')))
  expect(await names(page)).toEqual(['name', 'email', 'name', 'email'])
  expect((await formValues(page)).name).toEqual(['Ada', 'Grace'])
})

test('setting value replaces the rows within min and max', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts" min="1" max="2"'))
  await watch(list(page), 'rows-change')
  const rows: FormListRowValue[] = [{ name: 'Ada', email: 'ada@example.com' }, { name: 'Grace' }, { name: 'Hedy' }]
  await list(page).evaluate((element, data) => ((element as FormList).value = data), rows)
  await expect(page.locator('fieldset.row')).toHaveCount(2)
  await expect(page.getByRole('textbox', { name: 'Name' }).first()).toHaveValue('Ada')
  await expect(page.getByRole('textbox', { name: 'Name' }).nth(1)).toHaveValue('Grace')
  await expect(page.getByRole('button', { name: 'Add another' })).toBeDisabled()
  await expect(list(page)).toHaveState('at-max')
  await list(page).evaluate((element) => ((element as FormList).value = []))
  await expect(page.locator('fieldset.row')).toHaveCount(1)
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('')
  const events = JSON.parse((await list(page).getAttribute('data-events')) ?? '[]') as { action: string }[]
  expect(events.map((event) => event.action)).toEqual(['set', 'set'])
})

test('remove, duplicate and move act on their row and renumber the names', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada') + authored('Grace') + authored('Hedy')))
  await watch(list(page), 'rows-change')
  await page.getByRole('group', { name: 'Contact 2' }).getByRole('button', { name: 'Remove' }).click()
  expect((await value(page)).map((entry) => entry.name)).toEqual(['Ada', 'Hedy'])
  expect(await names(page)).toEqual(['contacts.0.name', 'contacts.0.email', 'contacts.1.name', 'contacts.1.email'])
  await page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Duplicate' }).click()
  expect((await value(page)).map((entry) => entry.name)).toEqual(['Ada', 'Ada', 'Hedy'])
  await expect(page.getByRole('group', { name: 'Contact 2' }).getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.getByRole('group', { name: 'Contact 3' }).getByRole('button', { name: 'Move up' }).click()
  expect((await value(page)).map((entry) => entry.name)).toEqual(['Ada', 'Hedy', 'Ada'])
  await expect(page.getByRole('group', { name: 'Contact 2' }).getByRole('button', { name: 'Move up' })).toBeFocused()
  const events = JSON.parse((await list(page).getAttribute('data-events')) ?? '[]') as { action: string; index: number; from?: number }[]
  expect(events.map(({ action, index, from }) => ({ action, index, from }))).toEqual([
    { action: 'remove', index: 1, from: undefined },
    { action: 'duplicate', index: 1, from: undefined },
    { action: 'move', index: 1, from: 2 },
  ])
})

test('actions are disabled where they cannot apply', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts" min="1" max="2"', authored('Ada')))
  const first = page.getByRole('group', { name: 'Contact 1' })
  await expect(first.getByRole('button', { name: 'Remove' })).toBeDisabled()
  await expect(first.getByRole('button', { name: 'Move up' })).toBeDisabled()
  await expect(first.getByRole('button', { name: 'Move down' })).toBeDisabled()
  await expect(first.getByRole('button', { name: 'Duplicate' })).toBeEnabled()
  await expect(list(page)).toHaveState('at-min')
  await first.getByRole('button', { name: 'Duplicate' }).click()
  await expect(first.getByRole('button', { name: 'Remove' })).toBeEnabled()
  await expect(first.getByRole('button', { name: 'Move down' })).toBeEnabled()
  await expect(first.getByRole('button', { name: 'Duplicate' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Add another' })).toBeDisabled()
})

test('an action the author disabled stays disabled', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada').replace('data-action="remove"', 'data-action="remove" disabled') + authored('Grace')))
  await expect(page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Remove' })).toBeDisabled()
  await page.getByRole('group', { name: 'Contact 2' }).getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Remove' })).toBeDisabled()
})

test('keyboard: add, remove and move keep the focus in a sensible place', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada') + authored('Grace')))
  await page.getByRole('button', { name: 'Add another' }).focus()
  await page.keyboard.press('Enter')
  const third = page.getByRole('group', { name: 'Contact 3' })
  await expect(third.getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.keyboard.type('Hedy')
  await third.getByRole('button', { name: 'Remove' }).focus()
  await page.keyboard.press('Space')
  // The last row went: focus moves to the row before it.
  await expect(page.getByRole('group', { name: 'Contact 2' }).getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Remove' }).focus()
  await page.keyboard.press('Enter')
  // A middle or first row went: focus moves to the row that took its place.
  await expect(page.getByRole('group', { name: 'Contact 1' }).getByRole('textbox', { name: 'Name' })).toHaveValue('Grace')
  await expect(page.getByRole('group', { name: 'Contact 1' }).getByRole('textbox', { name: 'Name' })).toBeFocused()
  await page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Remove' }).focus()
  await page.keyboard.press('Enter')
  // No row is left: focus moves to the add button.
  await expect(page.getByRole('button', { name: 'Add another' })).toBeFocused()
  await expect(list(page)).toHaveState('empty')
})

test('moving a row to the edge hands focus to the other move button', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada') + authored('Grace')))
  await page.getByRole('group', { name: 'Contact 2' }).getByRole('button', { name: 'Move up' }).focus()
  await page.keyboard.press('Enter')
  expect((await value(page)).map((entry) => entry.name)).toEqual(['Grace', 'Ada'])
  await expect(page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Move down' })).toBeFocused()
})

test('announces each change in a live region', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada')))
  const status = list(page).getByRole('status')
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(status).toHaveText('Row 2 added')
  await page.getByRole('group', { name: 'Contact 2' }).getByRole('button', { name: 'Move up' }).click()
  await expect(status).toHaveText('Row moved to position 1 of 2')
  await page.getByRole('group', { name: 'Contact 1' }).getByRole('button', { name: 'Remove' }).click()
  await expect(status).toHaveText('Row 1 removed')
})

test('validation reaches the controls of added rows, and a reset restores the initial rows', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada')))
  await page.getByRole('button', { name: 'Add another' }).click()
  await page.getByRole('button', { name: 'Add another' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('c2-form').locator('[part="summary-link"]')).toHaveCount(2)
  await page.getByRole('group', { name: 'Contact 1' }).getByRole('textbox', { name: 'Name' }).fill('Grace')
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.locator('fieldset.row')).toHaveCount(1)
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Ada')
})

test('a structural change makes the surrounding form dirty', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts"', authored('Ada')))
  await expect(page.locator('c2-form')).not.toHaveState('dirty')
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(page.locator('c2-form')).toHaveState('dirty')
})

test('a nested list renames its controls under its row', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-list name="people" min="1">
    <template>
      <fieldset class="person">
        <legend>Person <span data-row-number></span></legend>
        <c2-form-field label="Name"><c2-text-field name="name"></c2-text-field></c2-form-field>
        <c2-form-list name="phones" min="1">
          <template><div class="phone"><c2-form-field label="Phone"><c2-text-field name="number"></c2-text-field></c2-form-field></div></template>
          <button type="button" slot="footer" data-action="add">Add phone</button>
        </c2-form-list>
      </fieldset>
    </template>
  </c2-form-list>`)
  await page.getByRole('button', { name: 'Add phone' }).click()
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(page.locator('c2-text-field')).toHaveCount(5)
  expect(await page.locator('c2-text-field').evaluateAll((fields) => fields.map((field) => field.getAttribute('name')))).toEqual([
    'people.0.name',
    'people.0.phones.0.number',
    'people.0.phones.1.number',
    'people.1.name',
    'people.1.phones.0.number',
  ])
  await page
    .locator('c2-form-list')
    .first()
    .evaluate((element) => {
      ;(element as FormList).value = [{ name: 'Ada', phones: [{ number: '1' }, { number: '2' }] }]
    })
  expect(
    await page
      .locator('c2-form-list')
      .first()
      .evaluate((element) => (element as FormList).value),
  ).toEqual([{ name: 'Ada', phones: [{ number: '1' }, { number: '2' }] }])
})

test('shows the empty slot while there are no rows', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-list>${row}<p slot="empty">No contacts yet.</p></c2-form-list>`)
  await expect(page.getByText('No contacts yet.')).toBeVisible()
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(page.getByText('No contacts yet.')).toBeHidden()
})

test('translates its text with the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-form-list>${row}</c2-form-list></div>`)
  await page.getByRole('button', { name: 'Ajouter' }).click()
  await expect(list(page).getByRole('status')).toHaveText('Ligne 1 ajoutée')
})

test('native inputs read and write by type, and only form controls are renamed', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-form-list name="items">
    <template><div class="item"><a name="anchor">Item</a><input name="title" aria-label="Title"><input type="checkbox" name="done" aria-label="Done"><fieldset disabled><input name="locked" value="x"></fieldset></div></template>
  </c2-form-list></form>`)
  await list(page).evaluate((element) => ((element as FormList).value = [{ title: 'Write docs', done: true }, { title: 'Ship' }]))
  await expect(page.getByRole('textbox', { name: 'Title' }).first()).toHaveValue('Write docs')
  await expect(page.getByRole('checkbox', { name: 'Done' }).first()).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Done' }).nth(1)).not.toBeChecked()
  expect(await value(page)).toEqual([{ title: 'Write docs', done: 'on' }, { title: 'Ship' }])
  expect(await page.locator('a').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('name')))).toEqual(['anchor', 'anchor'])
  expect(await page.locator('input:not([type])').evaluateAll((inputs) => inputs.map((input) => input.getAttribute('name')))).toEqual([
    'items.0.title',
    'items.0.locked',
    'items.1.title',
    'items.1.locked',
  ])
  await list(page).evaluate(async (element) => {
    ;(element as FormList).name = ''
    await (element as FormList).updateComplete
  })
  expect(await page.locator('input[aria-label="Title"]').evaluateAll((inputs) => inputs.map((input) => input.getAttribute('name')))).toEqual(['title', 'title'])
})

test('spans every column of a c2-form grid', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form style="--c2-form--columns: 1fr 1fr"><form><c2-form-list>${row}</c2-form-list></form></c2-form>`)
  await expect(list(page)).toHaveCSS('grid-column-start', '1')
  await expect(list(page)).toHaveCSS('grid-column-end', '-1')
})

test('writes no attribute on its host', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-form-list>${row}</c2-form-list>`)
  await page.getByRole('button', { name: 'Add another' }).click()
  await expect(list(page)).toHaveJSProperty('attributes.length', 0)
})

test('is accessible with rows', async ({ page, renderScenario }) => {
  await renderScenario(contacts('name="contacts" min="1"', authored('Ada')))
  await accessible(page)
})
