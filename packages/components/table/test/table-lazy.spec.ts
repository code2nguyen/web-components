import type { Page } from '@playwright/test'
import { test, expect } from '../../../../tests/component-fixture'

const PEOPLE = [
  { id: '1', name: 'Ada Lovelace', score: 128000 },
  { id: '2', name: 'Grace Hopper', score: 96500 },
]

const people = (attributes = '') =>
  `<c2-table style="height:240px;width:420px" row-key="id" aria-label="People" rows='${JSON.stringify(PEOPLE)}' ${attributes}>
  <c2-table-column field="name" header="Name" width="200px"></c2-table-column>
  <c2-table-column field="score" header="Score" width="120px" align="end" format="number"></c2-table-column>
</c2-table>`

/** Whether the browser fetched a module whose URL holds `name`. */
const fetched = (page: Page, name: string) => page.evaluate((part) => performance.getEntriesByType('resource').some((entry) => entry.name.includes(part)), name)

test('a table without animate-updates never loads the realtime code', async ({ page, renderScenario }) => {
  await renderScenario(people())
  await page.locator('c2-table').evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<unknown> }) => {
    element.rows = [{ id: '1', name: 'Ada Lovelace', score: 256000 }]
    await element.updateComplete
  })
  await expect(page.locator('c2-table').getByRole('gridcell', { name: '256,000' })).toBeVisible()
  expect(await fetched(page, 'table-animation')).toBe(false)
})

test('a snapshot that comes before the realtime code waits for it, and still animates', async ({ page, renderScenario }) => {
  // The realtime code is slow to arrive: the first snapshot is assigned before it is there.
  await page.route('**/table-animation*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400))
    await route.continue()
  })
  await renderScenario(people('animate-updates update-duration="600" highlight-updates'))
  const state = await page.locator('c2-table').evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<unknown> }) => {
    element.rows = [
      { id: '1', name: 'Ada Lovelace', score: 256000 },
      { id: '2', name: 'Grace Hopper', score: 96500 },
    ]
    await element.updateComplete
    return element.shadowRoot!.querySelector('[data-row-key="1"]')?.getAttribute('data-update-state')
  })
  expect(state).toBe('increased')
  expect(await fetched(page, 'table-animation')).toBe(true)
  await expect(page.locator('c2-table').getByRole('gridcell', { name: '256,000' })).toBeVisible()
})
