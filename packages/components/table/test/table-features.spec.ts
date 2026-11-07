import type { Page } from '@playwright/test'
import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const PEOPLE = [
  { id: 'p1', name: 'Ada Lovelace', team: 'Analytics', score: 1200, joined: '2021-03-04' },
  { id: 'p2', name: 'Grace Hopper', team: 'Compilers', score: 960, joined: '2019-07-12' },
  { id: 'p3', name: 'Alan Turing', team: 'Research', score: 870, joined: '2020-01-30' },
  { id: 'p4', name: 'Radia Perlman', team: 'Networks', score: 748, joined: '2022-11-02' },
]

const COLUMNS = `<c2-table-column field="name" header="Name" width="200px"></c2-table-column>
  <c2-table-column field="team" header="Team" width="140px"></c2-table-column>
  <c2-table-column field="score" header="Score" width="120px" align="end" format="number" summary="sum"></c2-table-column>`

const people = (attributes = '', columns = COLUMNS) =>
  `<c2-table style="height:360px;width:640px" row-key="id" rows='${JSON.stringify(PEOPLE)}' ${attributes}>
  ${columns}
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const status = (page: Page) => table(page).locator('[role="status"]')
const names = (page: Page) =>
  table(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.row--body')].map((row) => row.querySelector('[part~="cell-content-name"]')?.textContent?.trim()),
  )
const headers = (page: Page) =>
  table(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.row--header [role="columnheader"]')].map((cell) => cell.textContent?.trim() ?? ''),
  )

test('quick-filter keeps the rows matching every word, shown or raw, and the totals follow', async ({ page, renderScenario }) => {
  await renderScenario(people())
  await props(table(page), { quickFilter: 'a' })
  await expect.poll(() => names(page)).toEqual(['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Radia Perlman'])
  await props(table(page), { quickFilter: 'research turing' })
  await expect.poll(() => names(page)).toEqual(['Alan Turing'])
  await expect(table(page).locator('[part="summary-row"]')).toContainText('870')
  await expect(status(page)).toHaveText('1 of 4 rows')
  // The formatted text matches as well as the raw value.
  await props(table(page), { quickFilter: '1,200' })
  await expect.poll(() => names(page)).toEqual(['Ada Lovelace'])
  await props(table(page), { quickFilter: 'nobody' })
  await expect(table(page).locator('[part="state"]')).toHaveText('No matching rows')
  // A predicate composes with the text.
  await table(page).evaluate((element) => {
    const target = element as HTMLElement & { quickFilter: string; filter: (row: { score: number }) => boolean }
    target.quickFilter = ''
    target.filter = (row) => row.score > 900
  })
  await expect.poll(() => names(page)).toEqual(['Ada Lovelace', 'Grace Hopper'])
})

test('a column with filterable="false" is left out of the quick filter', async ({ page, renderScenario }) => {
  await renderScenario(people('quick-filter="compilers"', COLUMNS.replace('field="team" header="Team"', 'field="team" header="Team" filterable="false"')))
  await expect(table(page).locator('[part="state"]')).toHaveText('No matching rows')
})

test('renderDetail adds a chevron column; a row detail opens under its row, by click and by keyboard', async ({ page, renderScenario }) => {
  await renderScenario(people('selection="single"'))
  await table(page).evaluate((element) => {
    const log: unknown[] = []
    ;(window as unknown as { log: unknown[] }).log = log
    element.addEventListener('row-detail-toggle', (event) =>
      log.push({ key: (event as CustomEvent).detail.key, expanded: (event as CustomEvent).detail.expanded }),
    )
    ;(element as HTMLElement & { renderDetail: (context: { row: { name: string } }) => string }).renderDetail = ({ row }) => `About ${row.name}`
  })
  const toggle = table(page).locator('[part~="detail-toggle-cell"]').first()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(table(page).locator('[part="detail-row"]')).toHaveText('About Ada Lovelace')
  // The toggle does not select the row.
  expect(await table(page).evaluate((element) => (element as HTMLElement & { value: string[] }).value)).toEqual([])
  expect(await table(page).evaluate((element) => (element as HTMLElement & { expandedRows: string[] }).expandedRows)).toEqual(['p1'])
  await toggle.press('Enter')
  await expect(table(page).locator('[part="detail-row"]')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { log: unknown[] }).log)).toEqual([
    { key: 'p1', expanded: true },
    { key: 'p1', expanded: false },
  ])
  await props(table(page), { expandedRows: ['p2', 'p3'] })
  await expect(table(page).locator('[part="detail-row"]')).toHaveCount(2)
  await accessible(page)
})

test('an open detail turns windowing off, and closing the last one turns it back on', async ({ page, renderScenario }) => {
  const rows = Array.from({ length: 300 }, (_, index) => ({ id: `r${index}`, name: `Row ${index}`, team: 'T', score: index }))
  await renderScenario(`<c2-table style="height:360px;width:640px" row-key="id" rows='${JSON.stringify(rows)}'>${COLUMNS}</c2-table>`)
  await table(page).evaluate((element) => {
    ;(element as HTMLElement & { renderDetail: () => string }).renderDetail = () => 'Detail'
  })
  const virtualized = () => table(page).evaluate((element) => (element as HTMLElement & { isVirtualized: boolean }).isVirtualized)
  expect(await virtualized()).toBe(true)
  await props(table(page), { expandedRows: ['r1'] })
  expect(await virtualized()).toBe(false)
  await props(table(page), { expandedRows: [] })
  expect(await virtualized()).toBe(true)
})

test('an editable cell opens an editor; Enter commits through cell-edit, Escape cancels', async ({ page, renderScenario }) => {
  await renderScenario(people('editable'))
  await table(page).evaluate((element) => {
    const log: unknown[] = []
    ;(window as unknown as { log: unknown[] }).log = log
    element.addEventListener('cell-edit', (event) => {
      const { key, field, value, previousValue } = (event as CustomEvent).detail
      log.push({ key, field, value, previousValue })
    })
  })
  const original = await table(page).evaluate((element) => (element as HTMLElement & { rows: unknown[] }).rows[0])
  const scoreCell = table(page)
    .getByRole('row', { name: /Ada Lovelace/ })
    .locator('[part~="cell-score"]')
  await scoreCell.dblclick()
  const editor = table(page).locator('[part="editor"]')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveAttribute('type', 'number')
  await expect(editor).toHaveAttribute('aria-label', 'Edit Score')
  await editor.fill('1500')
  await editor.press('Enter')
  await expect(editor).toHaveCount(0)
  await expect(scoreCell).toHaveText('1,500')
  await expect(scoreCell).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as { log: unknown[] }).log)).toEqual([{ key: 'p1', field: 'score', value: 1500, previousValue: 1200 }])
  // `rows` holds a copy; the object the app gave is untouched.
  expect(original).toEqual(PEOPLE[0])
  expect(await table(page).evaluate((element) => (element as HTMLElement & { rows: { score: number }[] }).rows[0].score)).toBe(1500)

  // Typing on a focused cell starts an editor holding what was typed.
  const teamCell = table(page)
    .getByRole('row', { name: /Grace Hopper/ })
    .locator('[part~="cell-team"]')
  await teamCell.click()
  await page.keyboard.type('Ops')
  await expect(editor).toHaveValue('Ops')
  await page.keyboard.press('Escape')
  await expect(teamCell).toHaveText('Compilers')
  await expect(teamCell).toBeFocused()

  // A cancelled cell-edit keeps the rows as they were.
  await table(page).evaluate((element) => element.addEventListener('cell-edit', (event) => event.preventDefault()))
  await teamCell.press('F2')
  await editor.fill('Ops')
  await editor.press('Enter')
  await expect(teamCell).toHaveText('Compilers')
})

test('a column opts out of editing, and leaving the editor commits', async ({ page, renderScenario }) => {
  await renderScenario(people('editable', COLUMNS.replace('field="name" header="Name"', 'field="name" header="Name" editable="false"')))
  await table(page)
    .getByRole('row', { name: /Ada Lovelace/ })
    .locator('[part~="cell-name"]')
    .dblclick()
  await expect(table(page).locator('[part="editor"]')).toHaveCount(0)
  const teamCell = table(page)
    .getByRole('row', { name: /Ada Lovelace/ })
    .locator('[part~="cell-team"]')
  await teamCell.dblclick()
  await table(page).locator('[part="editor"]').fill('Science')
  await page.locator('main').click({ position: { x: 2, y: 2 } })
  await expect(teamCell).toHaveText('Science')
})

test('reorderable headers move by keyboard and by drag, within their pinned side', async ({ page, renderScenario }) => {
  await renderScenario(people('reorderable sortable'))
  await table(page).evaluate((element) => {
    const log: unknown[] = []
    ;(window as unknown as { log: unknown[] }).log = log
    element.addEventListener('column-reorder', (event) => log.push((event as CustomEvent).detail))
  })
  const name = table(page).getByRole('columnheader', { name: 'Name' })
  await name.focus()
  await page.keyboard.press('Control+Shift+ArrowRight')
  expect(await headers(page)).toEqual(['Team', 'Name', 'Score'])
  await expect(table(page).getByRole('columnheader', { name: 'Name' })).toBeFocused()
  await expect(status(page)).toHaveText('Name moved to position 2 of 3')
  expect(await table(page).evaluate((element) => (element as HTMLElement & { columnOrder: string[] }).columnOrder)).toEqual(['team', 'name', 'score'])

  // Drag Score onto the left half of Team: it lands first. The drag does not sort.
  const score = await table(page).getByRole('columnheader', { name: 'Score' }).boundingBox()
  const team = await table(page).getByRole('columnheader', { name: 'Team' }).boundingBox()
  await page.mouse.move(score!.x + score!.width / 2, score!.y + score!.height / 2)
  await page.mouse.down()
  await page.mouse.move(team!.x + 40, team!.y + team!.height / 2, { steps: 6 })
  await expect(table(page).locator('.cell--drop-before')).toHaveCount(1)
  await page.mouse.up()
  expect(await headers(page)).toEqual(['Score', 'Team', 'Name'])
  expect(await table(page).evaluate((element) => (element as HTMLElement & { sortModel: unknown[] }).sortModel)).toEqual([])
  expect(await page.evaluate(() => (window as unknown as { log: unknown[] }).log)).toEqual([
    { id: 'name', order: ['team', 'name', 'score'] },
    { id: 'score', order: ['score', 'team', 'name'] },
  ])

  // A pinned column stays among its side.
  await table(page).evaluate((element) => ((element.querySelector('c2-table-column[field="name"]') as HTMLElement & { pinned: string }).pinned = 'start'))
  await expect.poll(() => headers(page)).toEqual(['Name', 'Score', 'Team'])
  await table(page).getByRole('columnheader', { name: 'Name' }).focus()
  await page.keyboard.press('Control+Shift+ArrowRight')
  expect(await headers(page)).toEqual(['Name', 'Score', 'Team'])
})

test('hidden-columns hides by id, and allColumns lists every column for a column menu', async ({ page, renderScenario }) => {
  await renderScenario(people('hidden-columns="team"'))
  expect(await headers(page)).toEqual(['Name', 'Score'])
  await table(page).evaluate((element) => (element as HTMLElement & { setColumnHidden(id: string, hidden: boolean): void }).setColumnHidden('team', false))
  await expect.poll(() => headers(page)).toEqual(['Name', 'Team', 'Score'])
  await table(page).evaluate((element) => (element as HTMLElement & { setColumnHidden(id: string, hidden: boolean): void }).setColumnHidden('score', true))
  await expect.poll(() => headers(page)).toEqual(['Name', 'Team'])
  expect(
    await table(page).evaluate((element) => (element as HTMLElement & { allColumns: { field: string }[] }).allColumns.map((column) => column.field)),
  ).toEqual(['name', 'team', 'score'])
})

test('toCSV writes the rows as CSV, escaping quotes, separators and formula-like text', async ({ page, renderScenario }) => {
  const rows = [
    { id: 'a', name: 'Plain', team: 'One, Two', score: 1200 },
    { id: 'b', name: 'He said "hi"', team: '=SUM(A1)', score: -5 },
  ]
  await renderScenario(`<c2-table style="height:300px;width:640px" row-key="id" selection="multiple" rows='${JSON.stringify(rows)}'>${COLUMNS}</c2-table>`)
  const csv = (options?: unknown) =>
    table(page).evaluate((element, value) => (element as HTMLElement & { toCSV(options?: unknown): string }).toCSV(value), options)
  expect(await csv()).toBe(['Name,Team,Score', 'Plain,"One, Two",1200', `"He said ""hi""",'=SUM(A1),-5`].join('\r\n'))
  expect(await csv({ formatted: true, header: false, separator: ';' })).toBe(['Plain;One, Two;1,200', `"He said ""hi""";'=SUM(A1);-5`].join('\r\n'))
  await props(table(page), { value: ['b'] })
  expect(await csv({ rows: 'selected', columns: 'all', escapeFormulas: false })).toBe(['Name,Team,Score', `"He said ""hi""",=SUM(A1),-5`].join('\r\n'))
})

test('copy from the grid puts the selected rows, or the focused cell, on the clipboard', async ({ page, renderScenario }) => {
  await renderScenario(people('selection="multiple"'))
  const copy = () =>
    table(page).evaluate((element) => {
      const target = element.shadowRoot!.activeElement!
      const event = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, composed: true, cancelable: true })
      target.dispatchEvent(event)
      return { text: event.clipboardData!.getData('text/plain'), handled: event.defaultPrevented }
    })
  await table(page)
    .getByRole('row', { name: /Grace Hopper/ })
    .locator('[part~="cell-score"]')
    .click({ modifiers: ['ControlOrMeta'] })
  expect(await copy()).toEqual({ text: 'Grace Hopper\tCompilers\t960', handled: true })
  await props(table(page), { value: [] })
  expect(await copy()).toEqual({ text: '960', handled: true })
})

test('sorting is announced, and the text follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(people('sortable'))
  await table(page).getByRole('columnheader', { name: 'Score' }).click()
  await expect(status(page)).toHaveText('Sorted by Score, ascending')
  await table(page).getByRole('columnheader', { name: 'Score' }).click()
  await expect(status(page)).toHaveText('Sorted by Score, descending')
  await table(page).getByRole('columnheader', { name: 'Score' }).click()
  await expect(status(page)).toHaveText('Sort removed')
  await table(page).evaluate((element) => element.setAttribute('lang', 'fr'))
  await table(page).getByRole('columnheader', { name: 'Score' }).click()
  await expect(status(page)).toHaveText('Trié par Score, croissant')
  await props(table(page), { rows: [] })
  await expect(table(page).locator('[part="state"]')).toHaveText('Aucune ligne')
})
