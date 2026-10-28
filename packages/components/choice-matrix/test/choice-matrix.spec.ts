import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { ChoiceMatrix } from '../src/choice-matrix'

const matrix = (page: Page) => page.locator('c2-choice-matrix')
const value = (page: Page) => matrix(page).evaluate((element: ChoiceMatrix) => element.value)
const COLUMNS = `columns='[{"value":"read","label":"Read"},{"value":"write","label":"Write"},{"value":"admin","label":"Admin"}]'`
const ROWS = `rows='[{"value":"issues","label":"Issues","group":"Repository"},{"value":"pulls","label":"Pull requests","group":"Repository"},{"value":"billing","label":"Billing","group":"Organization","description":"Invoices and plans"}]'`

test('each choice is a checkbox named by its row and column, and checking one updates value and the form', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-choice-matrix name="perm" label="Permissions" ${ROWS} ${COLUMNS}></c2-choice-matrix></form>`)
  await expect(page.getByRole('group', { name: 'Permissions' })).toBeVisible()
  await watch(matrix(page), 'change')
  await page.getByRole('checkbox', { name: 'Issues Read' }).check()
  await page.getByRole('checkbox', { name: 'Issues Write' }).check()
  expect(await value(page)).toEqual({ issues: ['read', 'write'] })
  expect(JSON.parse((await matrix(page).getAttribute('data-events'))!).at(-1)).toEqual({ value: { issues: ['read', 'write'] } })
  const form = await page.locator('form').evaluate((element: HTMLFormElement) => [...new FormData(element)])
  expect(form).toEqual([
    ['perm[issues]', 'read'],
    ['perm[issues]', 'write'],
  ])
  await expect(page.getByRole('rowheader', { name: /Billing/ })).toContainText('Invoices and plans')
  await accessible(page)
})

test('row, column and group toggles check or clear their cells and show a mixed state, skipping disabled ones', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-choice-matrix toggles="both" ${ROWS} columns='[{"value":"read","label":"Read"},{"value":"write","label":"Write"},{"value":"admin","label":"Admin","disabled":true}]'></c2-choice-matrix>`,
  )
  await page.getByRole('checkbox', { name: 'All of Issues' }).click()
  expect(await value(page)).toEqual({ issues: ['read', 'write'] })
  const readAll = page.getByRole('checkbox', { name: 'Read for all' })
  await expect(readAll).toHaveJSProperty('indeterminate', true)
  await readAll.click()
  expect(await value(page)).toEqual({ issues: ['read', 'write'], pulls: ['read'], billing: ['read'] })
  await expect(readAll).toBeChecked()
  await page.getByRole('checkbox', { name: 'Write for Repository' }).click()
  expect(await value(page)).toEqual({ issues: ['read', 'write'], pulls: ['read', 'write'], billing: ['read'] })
  await page.getByRole('checkbox', { name: 'Write for Repository' }).click()
  expect(await value(page)).toEqual({ issues: ['read'], pulls: ['read'], billing: ['read'] })
  await expect(page.getByRole('checkbox', { name: 'Admin for all' })).toBeDisabled()
  await accessible(page)
})

test('radio rows take one column each, the arrows move along a row, and required asks for every row', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-choice-matrix type="radio" required name="survey" label="Agreement"
      rows='[{"value":"q1","label":"The docs are clear"},{"value":"q2","label":"Setup was easy"}]'
      columns='[{"value":"disagree","label":"Disagree"},{"value":"neutral","label":"Neutral"},{"value":"agree","label":"Agree"}]'></c2-choice-matrix></form>`,
  )
  expect(await matrix(page).evaluate((element: ChoiceMatrix) => [element.checkValidity(), element.validationMessage])).toEqual([
    false,
    'Please answer every row.',
  ])
  await page.getByRole('radio', { name: 'The docs are clear Neutral' }).check()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'The docs are clear Agree' })).toBeChecked()
  expect(await value(page)).toEqual({ q1: 'agree' })
  await page.getByRole('radio', { name: 'Setup was easy Disagree' }).check()
  expect(await matrix(page).evaluate((element: ChoiceMatrix) => element.checkValidity())).toBe(true)
  // No toggles in a radio matrix.
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  expect(await value(page)).toEqual({})
  await accessible(page)
})

test('a value set from the attribute is shown, and disabled turns every choice off', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-choice-matrix toggles="rows" ${ROWS} ${COLUMNS} value='{"billing":["admin"]}'></c2-choice-matrix></div>`)
  await expect(page.getByRole('checkbox', { name: 'Billing Admin' })).toBeChecked()
  await expect(page.getByRole('group', { name: 'Choix' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Tout Billing' })).toHaveJSProperty('indeterminate', true)
  await matrix(page).evaluate((element: ChoiceMatrix) => (element.disabled = true))
  await expect(page.getByRole('checkbox', { name: 'Billing Admin' })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Tout Billing' })).toBeDisabled()
})

test('one input per change, after value updates; a vetoed change is drawn back; unknown values survive', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-choice-matrix ${ROWS} ${COLUMNS} value='{"issues":["read","triage"]}'></c2-choice-matrix>`)
  await matrix(page).evaluate((element: ChoiceMatrix) => {
    const seen: unknown[] = []
    ;(window as unknown as { seen: unknown[] }).seen = seen
    element.addEventListener('input', () => seen.push(JSON.parse(JSON.stringify(element.value))))
  })
  await page.getByRole('checkbox', { name: 'Issues Write' }).check()
  expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([{ issues: ['read', 'write', 'triage'] }])

  // A controlled consumer puts the old value back: the checkbox follows it.
  await matrix(page).evaluate((element: ChoiceMatrix) => element.addEventListener('change', () => (element.value = { issues: ['read', 'write', 'triage'] })))
  await page.getByRole('checkbox', { name: 'Pull requests Read' }).click()
  await expect(page.getByRole('checkbox', { name: 'Pull requests Read' })).not.toBeChecked()
})

test('required radio rows: an answered disabled row does not stand in for an unanswered one', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-choice-matrix type="radio" required rows='[{"value":"a","label":"A","disabled":true},{"value":"b","label":"B"}]' columns='[{"value":"x","label":"X"}]' value='{"a":"x"}'></c2-choice-matrix>`,
  )
  expect(await matrix(page).evaluate((element: ChoiceMatrix) => element.checkValidity())).toBe(false)
})
