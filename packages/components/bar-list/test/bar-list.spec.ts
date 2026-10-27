import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const list = (page: Page) => page.locator('c2-bar-list')
const rows = (page: Page) => list(page).locator('[part="row"]')
const PAGES = `items='[{"label":"/blog","value":320},{"label":"/","value":1280},{"label":"/pricing","value":640},{"label":"/docs","value":160}]'`

test('rows are listed largest first, each with a bar in proportion to the largest value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-bar-list ${PAGES} label="Top pages"></c2-bar-list>`)
  const items = page.getByRole('list', { name: 'Top pages' }).getByRole('listitem')
  await expect(items).toHaveText([/\/\s+1,280/, /\/pricing\s+640/, /\/blog\s+320/, /\/docs\s+160/])
  // Every row's track is the same width, whatever the width of its value.
  const tracks = await list(page)
    .locator('.track')
    .evaluateAll((all) => all.map((track) => Math.round(track.getBoundingClientRect().width)))
  expect(new Set(tracks).size).toBe(1)
  const widths = await list(page)
    .locator('[part="bar"]')
    .evaluateAll((bars) => bars.map((bar) => Math.round(bar.getBoundingClientRect().width)))
  const track = await list(page)
    .locator('.track')
    .first()
    .evaluate((track) => track.getBoundingClientRect().width)
  expect(widths[0]).toBe(Math.round(track))
  expect(Math.abs(widths[1] - track / 2)).toBeLessThan(2)
  expect(Math.abs(widths[3] - track / 8)).toBeLessThan(2)
  await accessible(page)
})

test('max-items shows the first rows and a button reveals the rest', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-bar-list ${PAGES} max-items="2"></c2-bar-list>`)
  await expect(rows(page)).toHaveCount(2)
  const toggle = page.getByRole('button', { name: 'Show all 4' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(rows(page)).toHaveCount(4)
  await page.getByRole('button', { name: 'Show fewer' }).click()
  await expect(rows(page)).toHaveCount(2)
})

test('values follow value-format and the page language; rows with an href are links, others buttons when interactive', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-bar-list interactive target="_blank" value-format='{"style":"percent","maximumFractionDigits":0}'
      items='[{"label":"Google","value":0.62,"href":"https://google.com","icon":"data:image/gif;base64,R0lGODlhAQABAAAAACw="},{"label":"Direct","value":0.38},{"label":"Bad","value":0.1,"href":"javascript:alert(1)"}]'></c2-bar-list></div>`,
  )
  await expect(page.getByRole('list', { name: 'Classement' })).toBeVisible()
  const link = page.getByRole('link', { name: /Google/ })
  await expect(link).toHaveAttribute('href', 'https://google.com')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toContainText('62 %')
  await expect(list(page).locator('[part="icon"]')).toHaveAttribute('alt', '')
  await watch(list(page), 'item-select')
  await page.getByRole('button', { name: /Direct/ }).click()
  expect(JSON.parse((await list(page).getAttribute('data-events'))!)).toEqual([{ item: { label: 'Direct', value: 0.38 }, index: 1 }])
  // An address that is not http(s) is not followed: the row is a button instead.
  await expect(page.getByRole('link')).toHaveCount(1)
  await accessible(page)
})

test('diverging bars grow from a centre line, values carry their sign and colour', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-bar-list diverging items='[{"label":"Germany","value":12},{"label":"France","value":-6},{"label":"Spain","value":0}]'></c2-bar-list>`,
  )
  await expect(page.getByRole('listitem')).toHaveText([/Germany\s+\+12/, /Spain\s+0/, /France\s+-6/])
  const track = await list(page).locator('.track').first().boundingBox()
  const positive = await list(page).locator('.bar--positive').boundingBox()
  const negative = await list(page).locator('.bar--negative').boundingBox()
  const centre = track!.x + track!.width / 2
  expect(Math.abs(positive!.x - centre)).toBeLessThan(1.5)
  expect(Math.abs(positive!.width - track!.width / 2)).toBeLessThan(1.5)
  expect(Math.abs(negative!.x + negative!.width - centre)).toBeLessThan(1.5)
  expect(Math.abs(negative!.width - track!.width / 4)).toBeLessThan(1.5)
  await expect(list(page).locator('.value--negative')).toHaveCSS('color', 'rgb(220, 38, 38)')
  await accessible(page)
})

test('a list with no items says so, with optional column titles', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-bar-list label-header="Page" value-header="Visitors"></c2-bar-list>`)
  await expect(list(page).locator('[part="empty"]')).toHaveText('No data')
  await expect(list(page).locator('[part="header"]')).toHaveText(/Page\s*Visitors/)
})

test('outside diverging mode a negative value draws no bar', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-bar-list items='[{"label":"Up","value":100},{"label":"Down","value":-80}]'></c2-bar-list>`)
  const widths = await list(page)
    .locator('[part="bar"]')
    .evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().width))
  expect(widths[1]).toBe(0)
})
