import type { Locator, Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const LINES = [
  { id: 'L1', item: 'Design review', hours: 4, status: 'open', billable: true, due: '2026-11-02' },
  { id: 'L2', item: 'Build', hours: 12, status: 'done', billable: false, due: '2026-11-05' },
  { id: 'L3', item: 'Launch', hours: 2, status: 'open', billable: true, due: '2026-11-09' },
]

const COLUMNS = `<c2-table-column field="item" header="Item" width="200px" editor="text" required></c2-table-column>
  <c2-table-column field="hours" header="Hours" width="100px" align="end" editor="number" summary="sum"></c2-table-column>
  <c2-table-column field="status" header="Status" width="120px" editor="select" options='[{"value":"open","label":"Open"},{"value":"done","label":"Done"}]'></c2-table-column>
  <c2-table-column field="billable" header="Billable" width="100px" editor="checkbox"></c2-table-column>
  <c2-table-column field="due" header="Due" width="140px" editor="date"></c2-table-column>
  <c2-table-column field="id" header="Id" width="80px"></c2-table-column>`

const lines = (attributes = 'editable') =>
  `<c2-table style="height:360px;width:780px" row-key="id" aria-label="Lines" rows='${JSON.stringify(LINES)}' ${attributes}>
  ${COLUMNS}
</c2-table>`

const table = (page: Page) => page.locator('c2-table')
const cell = (page: Page, name: string | RegExp) => table(page).getByRole('gridcell', { name, exact: typeof name === 'string' })
const editor = (page: Page) => table(page).locator('.editor')
const rows = (page: Page) => table(page).evaluate((element: HTMLElement & { rows: unknown[] }) => element.rows)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

/**
 * Pastes `text` into the focused cell. The clipboard is the external boundary, so it is stubbed: `clipboardData` is
 * set on the event itself, which every engine honours, rather than through the `ClipboardEvent` init dictionary, which
 * engines treat differently for an event made by script.
 */
const paste = (page: Page, text: string) =>
  page.evaluate((value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    const event = new ClipboardEvent('paste', { bubbles: true, composed: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', { value: data })
    document.querySelector('c2-table')!.shadowRoot!.activeElement!.dispatchEvent(event)
  }, text)

/** Records `cell-change` without its `column`, an element that does not serialize. */
const watchChanges = (locator: Locator) =>
  locator.evaluate((element) => {
    const events: unknown[] = []
    element.setAttribute('data-events', '[]')
    element.addEventListener('cell-change', (event) => {
      const { column, ...rest } = (event as CustomEvent<{ column: { field: string } }>).detail
      events.push({ ...rest, column: column.field })
      element.setAttribute('data-events', JSON.stringify(events))
    })
  })

test('Enter opens one editor over the cell, Enter commits it, moves down and marks the cell as changed', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  await watchChanges(table(page))
  await cell(page, 'Build').click()
  await expect(editor(page)).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(editor(page)).toHaveCount(1)
  await expect(editor(page)).toBeFocused()
  await expect(editor(page)).toHaveValue('Build')
  await expect(editor(page)).toHaveAccessibleName('Edit Item')
  await page.keyboard.press('End')
  await page.keyboard.type(' and test')
  await page.keyboard.press('Enter')

  await expect(editor(page)).toHaveCount(0)
  await expect(cell(page, 'Launch')).toBeFocused()
  await expect(cell(page, 'Build and test')).toHaveAttribute('part', /\bcell-dirty\b/)
  await expect(cell(page, 'Design review')).not.toHaveAttribute('part', /\bcell-dirty\b/)
  expect(await events(table(page))).toMatchObject([{ key: 'L2', field: 'item', value: 'Build and test', previousValue: 'Build', row: { item: 'Build' } }])
  // The application's objects are never mutated: the edited row is a copy in a new array.
  const after = await table(page).evaluate((element: HTMLElement & { rows: Record<string, unknown>[] }) => element.rows[1].item)
  expect(after).toBe('Build and test')
  const changes = await table(page).evaluate((element: HTMLElement & { getChanges(): { updated: { row: { item: string }; original: { item: string } }[] } }) =>
    element.getChanges().updated.map(({ row, original }) => [original.item, row.item]),
  )
  expect(changes).toEqual([['Build', 'Build and test']])
  await accessible(page)
})

test('typing replaces the value, Escape cancels, and Delete clears a cell', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  await cell(page, '12').click()
  await page.keyboard.type('30')
  await expect(editor(page)).toHaveValue('30')
  await page.keyboard.press('Tab')
  // Tab commits as a number and moves to the next editable column.
  expect((await rows(page))[1]).toMatchObject({ hours: 30 })
  await expect(cell(page, 'Done')).toBeFocused()

  await cell(page, 'Launch').click()
  await page.keyboard.type('X')
  await page.keyboard.press('Escape')
  await expect(editor(page)).toHaveCount(0)
  await expect(cell(page, 'Launch')).toBeFocused()

  // An emptied required cell is marked invalid, for screen readers too.
  await page.keyboard.press('Delete')
  const emptied = table(page).locator('.row--body').nth(2).locator('.cell').first()
  await expect(emptied).toHaveAttribute('aria-invalid', 'true')
  await expect(emptied).toHaveAttribute('part', /\bcell-invalid\b/)
  await expect(emptied).toContainText('Required')
  await accessible(page)
})

test('cell-change is cancelable, and rowRule adjusts the row before it is stored', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  await table(page).evaluate((element: HTMLElement & { rowRule: unknown }) => {
    element.addEventListener('cell-change', (event) => {
      if ((event as CustomEvent<{ value: unknown }>).detail.value === 'Nope') event.preventDefault()
    })
    // More than 8 hours is split: the rest goes to overtime.
    element.rowRule = ({ row }: { row: Record<string, number> }) => (row.hours > 8 ? { ...row, hours: 8, overtime: row.hours - 8 } : undefined)
  })
  await cell(page, 'Launch').dblclick()
  await expect(editor(page)).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('Nope')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'Launch')).toBeVisible()

  await cell(page, '4').click()
  await page.keyboard.type('11')
  await page.keyboard.press('Enter')
  expect((await rows(page))[0]).toMatchObject({ hours: 8, overtime: 3 })
})

test('select and checkbox editors: the cell shows the label, a checkbox toggles in place', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  await watch(table(page), 'rows-change')
  await expect(cell(page, 'Open')).toHaveCount(2)

  await cell(page, 'Done').click()
  await page.keyboard.press('F2')
  await expect(table(page).locator('select.editor')).toBeFocused()
  await table(page).locator('select.editor').selectOption('Open')
  await page.keyboard.press('Enter')
  expect((await rows(page))[1]).toMatchObject({ status: 'open' })
  await expect(cell(page, 'Open')).toHaveCount(3)

  const checkboxes = table(page).locator('c2-checkbox')
  await expect(checkboxes).toHaveCount(3)
  await checkboxes.nth(1).click()
  expect((await rows(page))[1]).toMatchObject({ billable: true })
  // Space on the focused cell toggles it back.
  await page.keyboard.press('Space')
  await expect.poll(async () => ((await rows(page))[1] as { billable: boolean }).billable).toBe(false)
  expect((await events(table(page))).map((detail: { reason: string }) => detail.reason)).toEqual(['edit', 'edit', 'edit'])
  await accessible(page)
})

test('a block pasted from a spreadsheet fills cells from the focused one and adds rows past the last', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  await watch(table(page), 'rows-change')
  await cell(page, 'Launch').click()
  await paste(page, 'Ship\t"1,5"\tDone\r\nRetro\t3\topen\r\n')
  await expect.poll(async () => (await rows(page)).length).toBe(4)
  const [, , third, fourth] = await rows(page)
  // "1,5" is not a number in this locale: it is kept as text, and the cell says so.
  expect(third).toMatchObject({ id: 'L3', item: 'Ship', hours: '1,5', status: 'done' })
  expect(fourth).toEqual({ item: 'Retro', hours: 3, status: 'open' })
  await expect(table(page).locator('.row--body').nth(2).locator('.cell').nth(1)).toHaveAttribute('aria-invalid', 'true')
  await expect(table(page).locator('.row--body').nth(3)).toHaveAttribute('part', /\brow-new\b/)
  expect((await events(table(page))).map((detail: { reason: string }) => detail.reason)).toEqual(['paste'])
})

test('addRow, duplicateRow, deleteRows and revertChanges; validate reports the invalid cells', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  const result = await table(page).evaluate(
    async (element: HTMLElement & Record<string, (...args: unknown[]) => unknown> & { rows: Record<string, unknown>[] }) => {
      await element.addRow({ id: 'L4', hours: 1 })
      await element.duplicateRow(element.rows[0])
      await element.deleteRows([element.rows[2]])
      const errors = (await element.validate()) as { key: string; message: string; column: { field: string } }[]
      const changes = element.getChanges() as { added: { id?: string }[]; removed: { id: string }[] }
      return {
        ids: element.rows.map((row) => row.id ?? '(copy)'),
        added: changes.added.map((row) => row.id ?? '(copy)'),
        removed: changes.removed.map((row) => row.id),
        errors: errors.map((error) => `${error.key}:${error.column.field}:${error.message}`),
      }
    },
  )
  expect(result).toEqual({ ids: ['L1', '(copy)', 'L3', 'L4'], added: ['(copy)', 'L4'], removed: ['L2'], errors: ['L4:item:Required'] })
  await expect(table(page).locator('[part~="cell-invalid"]')).toHaveCount(1)

  await table(page).evaluate((element: HTMLElement & { revertChanges(): void }) => element.revertChanges())
  expect((await rows(page)).map((row) => (row as { id: string }).id)).toEqual(['L1', 'L2', 'L3'])
  await expect(table(page).locator('[part~="cell-invalid"]')).toHaveCount(0)
})

test('isCellEditable locks rows, and a table without editable keeps Enter for row-activate and loads no editing code', async ({ page, renderScenario }) => {
  await renderScenario(lines('editable'))
  await table(page).evaluate(async (element: HTMLElement & { isCellEditable: unknown; updateComplete: Promise<boolean> }) => {
    element.isCellEditable = ({ row }: { row: { status: string } }) => row.status !== 'done'
    await element.updateComplete
  })
  await cell(page, 'Build').click()
  await page.keyboard.press('Enter')
  await expect(editor(page)).toHaveCount(0)
  await expect(table(page).locator('c2-checkbox').nth(1)).toHaveJSProperty('disabled', true)

  await renderScenario(lines(''))
  await watch(table(page), 'row-activate')
  await cell(page, 'Build').click()
  await page.keyboard.press('Enter')
  await page.keyboard.type('x')
  await expect(editor(page)).toHaveCount(0)
  expect(await events(table(page))).toMatchObject([{ key: 'L2' }, { key: 'L2' }])
  await expect(table(page).locator('c2-checkbox').first()).toHaveJSProperty('disabled', true)
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('table-editing')))
  expect(loaded).toBe(false)
})

test('editable costs nothing on the read path: 50,000 rows render the same window with and without it', async ({ page, renderScenario }) => {
  const count = async (editable: boolean) => {
    await renderScenario(`<c2-table style="height:480px;width:520px" row-key="id" aria-label="Rows" ${editable ? 'editable' : ''}>
  <c2-table-column field="id" header="Id" width="160px"></c2-table-column>
  <c2-table-column field="name" header="Name" width="240px" editor="text"></c2-table-column>
</c2-table>`)
    return table(page).evaluate(async (element: HTMLElement & { rows: unknown[]; updateComplete: Promise<boolean> }) => {
      element.rows = Array.from({ length: 50_000 }, (_, index) => ({ id: String(index), name: `Row ${index}` }))
      let done = await element.updateComplete
      while (!done) done = await element.updateComplete
      return element.shadowRoot!.querySelectorAll('.row--body').length
    })
  }
  const without = await count(false)
  expect(without).toBeLessThan(40)
  expect(await count(true)).toBe(without)
})

test('a row scrolled to, by the keyboard or after addRow, is not left under the sticky summary row', async ({ page, renderScenario }) => {
  const many = Array.from({ length: 30 }, (_, index) => ({ id: `R${index}`, item: `Row ${index}`, hours: 1 }))
  await renderScenario(`<c2-table style="height:240px;width:420px" row-key="id" aria-label="Rows" editable rows='${JSON.stringify(many)}'>
  <c2-table-column field="item" header="Item" width="200px" editor="text"></c2-table-column>
  <c2-table-column field="hours" header="Hours" width="100px" align="end" editor="number" summary="sum"></c2-table-column>
</c2-table>`)
  const covered = (key: string) =>
    table(page).evaluate((element, rowKey) => {
      const root = element.shadowRoot!
      const row = root.querySelector(`.row--body[data-row-key="${rowKey}"]`)!.getBoundingClientRect()
      const summary = root.querySelector('.row--summary')!.getBoundingClientRect()
      return Math.round(row.bottom - summary.top)
    }, key)
  await cell(page, 'Row 0').click()
  for (let step = 0; step < 8; step++) await page.keyboard.press('ArrowDown')
  await expect(cell(page, 'Row 8')).toBeFocused()
  expect(await covered('R8')).toBeLessThanOrEqual(0)

  await table(page).evaluate(async (element: HTMLElement & { addRow(row: object): Promise<object>; rows: object[]; scrollToIndex(index: number): void }) => {
    const row = await element.addRow({ id: 'NEW', item: 'Added', hours: 2 })
    element.scrollToIndex(element.rows.indexOf(row))
  })
  await expect(cell(page, 'Added')).toBeVisible()
  expect(await covered('NEW')).toBeLessThanOrEqual(0)
})

test('a column validate sees empty cells too, and its message marks the cell', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  const errors = await table(page).evaluate(async (element: HTMLElement & { validate(): Promise<{ key: string; message: string }[]> }) => {
    const hours = element.querySelector('c2-table-column[field="due"]') as HTMLElement & { validate: unknown }
    hours.validate = ({ value, row }: { value: unknown; row: { status: string } }) => (value === null && row.status === 'open' ? 'Set a due date' : undefined)
    const rows = (element as unknown as { rows: Record<string, unknown>[] }).rows
    ;(element as unknown as { rows: unknown[] }).rows = rows.map((row) => (row.id === 'L3' ? { ...row, due: null } : row))
    await (element as unknown as { updateComplete: Promise<unknown> }).updateComplete
    return (await element.validate()).map(({ key, message }) => `${key}:${message}`)
  })
  expect(errors).toEqual(['L3:Set a due date'])
  await expect(table(page).locator('.row--body').nth(2).locator('.cell').nth(4)).toHaveAttribute('title', 'Set a due date')
})

test('a number cell takes a typed minus sign, and keys in a custom editor stay in it', async ({ page, renderScenario }) => {
  await renderScenario(lines())
  await cell(page, '12').click()
  await page.keyboard.type('-5.5')
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await rows(page))[1]).toMatchObject({ hours: -5.5 })

  // A picker made into an editor: arrows and letters are its own, not the grid's.
  await table(page).evaluate((element) => {
    const column = element.querySelector('c2-table-column[field="item"]') as HTMLElement & { renderEditor: unknown }
    column.renderEditor = ({ draft, setDraft }: { draft: string; setDraft(value: string): void }) => {
      const list = document.createElement('div')
      list.className = 'picker'
      list.tabIndex = 0
      list.textContent = draft
      list.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') setDraft(`${draft} ↓`)
      })
      return list
    }
  })
  await cell(page, 'Launch').click()
  await page.keyboard.press('Enter')
  await expect(table(page).locator('.picker')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('k')
  await expect(table(page).locator('.picker')).toBeFocused()
  await page.keyboard.press('Enter')
  expect((await rows(page))[2]).toMatchObject({ item: 'Launch ↓' })
  await expect(cell(page, 'Launch ↓')).toBeVisible()
})

test('columns handed over again while a cell is edited keep the editor and the marks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-table style="height:300px;width:420px" row-key="id" aria-label="Lines" editable rows='${JSON.stringify(LINES)}'></c2-table>`)
  const columns = () => [
    { field: 'item', header: 'Item', width: '200px', editor: 'text', required: true },
    { field: 'hours', header: 'Hours', width: '100px', editor: 'number' },
  ]
  await table(page).evaluate((element: HTMLElement & { columns: unknown }, value) => (element.columns = value), columns())
  await cell(page, 'Build').click()
  await page.keyboard.press('Delete')
  await expect(table(page).locator('[part~="cell-invalid"]')).toHaveCount(1)
  await cell(page, 'Launch').click()
  await page.keyboard.type('Go')
  // A framework re-renders and passes equal, new column objects.
  await table(page).evaluate((element: HTMLElement & { columns: unknown }, value) => (element.columns = value), columns())
  await expect(editor(page)).toHaveValue('Go')
  await expect(table(page).locator('[part~="cell-invalid"]')).toHaveCount(1)
  await page.keyboard.press('Enter')
  expect((await rows(page))[2]).toMatchObject({ item: 'Go' })
})

test('a paste on a paged table fills the next page, and deleteRows keeps the selection on its rows', async ({ page, renderScenario }) => {
  const many = Array.from({ length: 6 }, (_, index) => ({ item: `Row ${index}`, hours: index }))
  await renderScenario(`<c2-table style="height:300px;width:420px" aria-label="Rows" editable page-size="3" selection="multiple" rows='${JSON.stringify(many)}'>
  <c2-table-column field="item" header="Item" width="200px" editor="text"></c2-table-column>
  <c2-table-column field="hours" header="Hours" width="100px" editor="number"></c2-table-column>
</c2-table>`)
  await cell(page, 'Row 2').click()
  await paste(page, 'Two\nThree\n')
  await expect.poll(async () => (await rows(page)).map((row) => (row as { item: string }).item)).toEqual(['Row 0', 'Row 1', 'Two', 'Three', 'Row 4', 'Row 5'])

  // Without a row-key a key is a position: after a delete the selection follows its rows, not the positions.
  const selected = await table(page).evaluate(
    async (element: HTMLElement & Record<string, (...args: unknown[]) => unknown> & { rows: object[]; value: string[] }) => {
      element.selectRows([element.rows[4], element.rows[5]])
      await element.deleteRows([element.rows[0]])
      return element.value.map((key) => (element.rows[Number(key)] as { item: string }).item)
    },
  )
  expect(selected).toEqual(['Row 4', 'Row 5'])
})
