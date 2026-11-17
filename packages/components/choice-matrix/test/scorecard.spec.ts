import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { Scorecard } from '../src/scorecard'
import type { ChoiceMatrix } from '../src/choice-matrix'

const card = (page: Page) => page.locator('c2-scorecard')
const SCALE = JSON.stringify([
  { value: '1', label: 'Strong no', fail: true },
  { value: '2', label: 'No' },
  { value: '3', label: 'Yes' },
  { value: '4', label: 'Strong yes' },
  { value: 'na', label: 'N/A', na: true },
])
const CRITERIA = JSON.stringify([
  { value: 'design', label: 'System design', group: 'Skills', weight: 2 },
  { value: 'code', label: 'Coding', group: 'Skills' },
  { value: 'values', label: 'Values', group: 'Culture', critical: true },
])
const BANDS = JSON.stringify([
  { min: 75, label: 'Hire', tone: 'success' },
  { min: 50, label: 'Maybe', tone: 'warning' },
  { min: 0, label: 'No hire', tone: 'error' },
])

test('answers score each criterion by its weight, subtotal each group and total the card with its verdict', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-scorecard name="sc" label="Interview" columns='${SCALE}' rows='${CRITERIA}' bands='${BANDS}'></c2-scorecard></form>`)
  await expect(page.getByRole('group', { name: 'Interview' })).toBeVisible()
  await watch(card(page), 'score-change')
  await page.getByRole('radio', { name: /^System design .*Strong yes$/ }).check()
  await page.getByRole('radio', { name: /^Coding.* No$/ }).check()
  // Design: 4 × 2 of 4 × 2; coding: 2 of 4. Skills 10 / 12.
  await expect(card(page).locator('[part="row-score"]')).toHaveText(['10 / 12', '8 / 8', '2 / 4', '', ''])
  await expect(card(page).locator('[part="summary"]')).toContainText('10 / 12')
  await expect(card(page).locator('[part="summary"]')).toContainText('83%')
  await expect(card(page).locator('[part="band"]')).toHaveText('Hire')
  await expect(card(page).locator('[part="summary"]')).toContainText('2 of 3 answered')
  expect(JSON.parse((await card(page).getAttribute('data-events'))!).at(-1)).toMatchObject({ points: 10, possible: 12, answered: 2, total: 3, failed: [] })
  const form = await page.locator('form').evaluate((element: HTMLFormElement) => [...new FormData(element)])
  expect(form).toEqual([
    ['sc[design]', '4'],
    ['sc[code]', '2'],
  ])
  await accessible(page)
})

test('a critical criterion answered with a failing point fails the card; not applicable counts towards neither total', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scorecard columns='${SCALE}' rows='${CRITERIA}' bands='${BANDS}' value='{"design":"4","code":"na"}'></c2-scorecard>`)
  await expect(card(page).locator('[part="row-score"]').nth(2)).toHaveText('N/A')
  expect(await card(page).evaluate((element: Scorecard) => element.score)).toMatchObject({ points: 8, possible: 8, percent: 100, answered: 2 })
  await expect(page.getByRole('rowheader', { name: /Values/ })).toContainText('Critical')
  // The weight is shown as ×2 and read as "weight 2".
  await expect(page.getByRole('rowheader', { name: /^System design\s*,\s*weight 2$/ })).toBeVisible()
  await page.getByRole('radio', { name: /^Values.*Strong no$/ }).check()
  await expect(card(page).locator('[part="failed"]')).toHaveText('Failed: Values')
  await expect(card(page).locator('[part="band"]')).toHaveCount(0)
})

test('a comment field goes under a criterion through its detail slot, or renderRowDetail on any choice matrix', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-scorecard columns='${SCALE}' rows='${CRITERIA}'>
    <textarea slot="detail-code" aria-label="Comment on coding"></textarea>
  </c2-scorecard></div>`)
  await expect(card(page).locator('[part="row-detail"]')).toHaveCount(1)
  await expect(page.getByRole('textbox', { name: 'Comment on coding' })).toBeVisible()
  await expect(card(page).locator('[part="summary"]')).toContainText('0 sur 3 renseignés')
  await expect(page.getByRole('rowheader', { name: /Values/ })).toContainText('Critique')
  // A slot added later opens its line.
  await card(page).evaluate((element) => {
    const note = document.createElement('p')
    note.slot = 'detail-values'
    note.textContent = 'Ask about the on-call rota.'
    element.append(note)
  })
  await expect(card(page).locator('[part="row-detail"]')).toHaveCount(2)
  await accessible(page)

  await renderScenario(
    `<c2-choice-matrix type="radio" rows='[{"value":"a","label":"A"},{"value":"b","label":"B"}]' columns='[{"value":"x","label":"X"},{"value":"y","label":"Y"}]'></c2-choice-matrix>`,
  )
  await page.locator('c2-choice-matrix').evaluate((element: ChoiceMatrix) => {
    element.renderRowDetail = ({ row, chosen }) => (chosen.includes('y') ? `Why ${row.label}?` : undefined)
  })
  await expect(page.locator('c2-choice-matrix [part="row-detail"]')).toHaveCount(0)
  await page.getByRole('radio', { name: 'B Y' }).check()
  await expect(page.locator('c2-choice-matrix [part="row-detail"]')).toHaveText('Why B?')
})

test('a disabled criterion counts towards nothing, type cannot make checkboxes, and a moved slot moves its line', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scorecard type="checkbox" columns='${SCALE}'
    rows='[{"value":"a","label":"A"},{"value":"b","label":"B"},{"value":"c","label":"C","disabled":true}]'
    value='{"a":"4","b":"2","c":"1"}'><p slot="detail-a">Note</p></c2-scorecard>`)
  await expect(card(page).getByRole('checkbox')).toHaveCount(0)
  await expect(card(page).locator('[part="summary"]')).toContainText('2 of 2 answered')
  expect(await card(page).evaluate((element: Scorecard) => element.score)).toMatchObject({ points: 6, possible: 8, answered: 2, total: 2 })
  await expect(card(page).locator('[part="row-score"]')).toHaveText(['4 / 4', '2 / 4', ''])
  const lines = () =>
    card(page).evaluate((element) => [...element.shadowRoot!.querySelectorAll('[part="row-detail"] slot')].map((slot) => slot.getAttribute('name')))
  expect(await lines()).toEqual(['detail-a'])
  await card(page).evaluate((element) => (element.querySelector('p')!.slot = 'detail-b'))
  await expect.poll(lines).toEqual(['detail-b'])
})
