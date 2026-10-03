// `subscribeRenderedRows` (exported from `@c2n/table`) is the framework-agnostic core that `useRenderedRows` in
// `@c2n/table/react` and `@c2n/table/vue` both wrap, so its seeding, updates, disposal and upgrade tolerance are tested
// here. The tests load its own module, which registers nothing, so they can also subscribe before `c2-table` upgrades.
import { test, expect } from '../../../../tests/component-fixture'

const PEOPLE = [
  { id: '1', name: 'Ada Lovelace', score: 128000 },
  { id: '2', name: 'Grace Hopper', score: 96500 },
  { id: '3', name: 'Alan Turing', score: 87200 },
]

const rows = JSON.stringify(PEOPLE).replace(/'/g, '&#39;')
const columns = `<c2-table-column field="name" header="Name" width="200px"></c2-table-column>
  <c2-table-column field="score" header="Score" width="200px" sortable cell-slot></c2-table-column>`
const markup = `<c2-table style="height:240px;width:520px" row-key="id" rows='${rows}'>${columns}</c2-table>`

/** Served by the shared Vite server from source; a variable keeps tsc from resolving the URL as a module. */
const MODULE_URL = '/packages/components/table/src/rendered-rows.ts'

type Rendered = { line: number; key: string; row: { name: string } }
type Probe = { reports: string[][]; dispose?: () => void }
type Subscribe = (element: Element | null | undefined, listener: (rows: Rendered[]) => void) => () => void

declare global {
  interface Window {
    renderedRowsProbe: Probe
  }
}

const reports = (page: import('@playwright/test').Page) => page.evaluate(() => window.renderedRowsProbe.reports)

test('reports the rows already rendered, then every range-change, until disposed', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await page.locator('c2-table').evaluate(async (element, url) => {
    const { subscribeRenderedRows } = (await import(url)) as { subscribeRenderedRows: Subscribe }
    const probe: Probe = { reports: [] }
    window.renderedRowsProbe = probe
    probe.dispose = subscribeRenderedRows(element, (rendered) => probe.reports.push(rendered.map(({ line, key, row }) => `${line}:${key}:${row.name}`)))
  }, MODULE_URL)
  // Seeded synchronously from `renderedRange`: the table rendered before the subscription.
  expect(await reports(page)).toEqual([['0:1:Ada Lovelace', '1:2:Grace Hopper', '2:3:Alan Turing']])

  // A sort keeps every key in the window but moves them to other lines.
  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect.poll(async () => (await reports(page)).at(-1)).toEqual(['0:3:Alan Turing', '1:2:Grace Hopper', '2:1:Ada Lovelace'])

  const count = (await reports(page)).length
  await page.evaluate(() => window.renderedRowsProbe.dispose!())
  await page.getByRole('columnheader', { name: 'Score' }).click()
  await expect(page.locator('c2-table').locator('.row--body').first()).toContainText('Ada Lovelace')
  expect(await reports(page)).toHaveLength(count)
})

test('subscribes to an element that is not upgraded yet and reports once it renders', async ({ page, renderScenario }) => {
  await renderScenario('')
  await page.evaluate(
    async ({ url, markup }) => {
      const { subscribeRenderedRows } = (await import(url)) as { subscribeRenderedRows: Subscribe }
      // A document without a browsing context has no custom element registry: the table stays an HTMLElement.
      const inert = document.implementation.createHTMLDocument('')
      inert.body.innerHTML = markup
      const element = inert.querySelector('c2-table')!
      const probe: Probe = { reports: [] }
      window.renderedRowsProbe = probe
      probe.dispose = subscribeRenderedRows(element, (rendered) => probe.reports.push(rendered.map(({ line, key }) => `${line}:${key}`)))
      // Nothing to seed from (no `renderedRange`), and nothing thrown.
      if (probe.reports.length !== 0 || 'renderedRange' in element) throw new Error('expected an un-upgraded element')
      document.querySelector('main')!.append(document.adoptNode(element))
    },
    { url: MODULE_URL, markup },
  )
  await expect.poll(async () => (await reports(page)).at(-1)).toEqual(['0:1', '1:2', '2:3'])
})

test('a missing element subscribes to nothing', async ({ page, renderScenario }) => {
  await renderScenario('')
  const called = await page.evaluate(async (url) => {
    const { subscribeRenderedRows } = (await import(url)) as { subscribeRenderedRows: Subscribe }
    let calls = 0
    subscribeRenderedRows(null, () => calls++)()
    subscribeRenderedRows(undefined, () => calls++)()
    return calls
  }, MODULE_URL)
  expect(called).toBe(0)
})
