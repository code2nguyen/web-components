import type { Locator, Page } from '@playwright/test'
import type { Spreadsheet } from '../src/spreadsheet'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const budget = `<c2-spreadsheet label="Budget" rows="6" columns='[{"label":"Item"},{"label":"Qty","format":"number"},{"label":"Price","format":"currency"},{"label":"Total","format":"currency"}]'
  data='[["Flights",2,300,"=B1*C1"],["Hotel",3,100,"=B2*C2"],["Total","","","=SUM(D1:D2)"]]'></c2-spreadsheet>`

const host = (page: Page) => page.locator('c2-spreadsheet')
const cell = (page: Page, ref: string) => page.locator(`c2-spreadsheet #cell-${ref}`)
const grid = (page: Page) => page.locator('c2-spreadsheet [role="grid"]')

/**
 * Dispatches a clipboard event on the grid, as the browser does for Ctrl/⌘+C, X and V, and returns the copied text.
 *
 * Engines build a synthetic event's `clipboardData` differently: Chromium and WebKit use the `clipboardData` passed in,
 * while Firefox ignores it and creates its own, filled from its non-standard `dataType` and `data` init fields. Passing
 * both and reading back through `event.clipboardData` works in all three.
 */
async function clipboardEvent(locator: Locator, type: 'copy' | 'cut' | 'paste', text = ''): Promise<string> {
  return locator.evaluate(
    (element, [eventType, pasted]) => {
      const data = new DataTransfer()
      const init: ClipboardEventInit & { dataType?: string; data?: string } = { clipboardData: data, bubbles: true, composed: true, cancelable: true }
      if (eventType === 'paste') {
        data.setData('text/plain', pasted)
        init.dataType = 'text/plain'
        init.data = pasted
      }
      const event = new ClipboardEvent(eventType, init)
      element.dispatchEvent(event)
      return (event.clipboardData ?? data).getData('text/plain')
    },
    [type, text] as const,
  )
}

test('computes formulas and formats each column', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await expect(cell(page, 'A1')).toHaveText('Flights')
  await expect(cell(page, 'D1')).toHaveText('$600.00')
  await expect(cell(page, 'D3')).toHaveText('$900.00')
  await expect(page.locator('c2-spreadsheet [role="columnheader"]').nth(2)).toHaveText(/B\s*Qty/)
  expect(await host(page).evaluate((element: Spreadsheet) => element.getValue('D3'))).toBe(900)
  expect(await host(page).evaluate((element: Spreadsheet) => element.toCSV())).toBe('Flights,2,300,600\nHotel,3,100,300\nTotal,,,900')
})

test('typing replaces a cell, Enter commits and moves down, and dependents recalculate', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await watch(host(page), 'cell-change')
  await cell(page, 'B1').click()
  await page.keyboard.type('5')
  await expect(page.locator('c2-spreadsheet .editor')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cell(page, 'D1')).toHaveText('$1,500.00')
  await expect(cell(page, 'D3')).toHaveText('$1,800.00')
  await expect(cell(page, 'B2')).toHaveClass(/active/)
  await expect(grid(page)).toBeFocused()
  await expect(host(page)).toHaveAttribute('data-events', JSON.stringify([{ changes: [{ ref: 'B1', input: '5', value: 5, previous: '2' }] }]))
  expect(await host(page).evaluate((element: Spreadsheet) => element.data[0])).toEqual(['Flights', 5, 300, '=B1*C1'])
})

test('F2 edits the existing input, Escape cancels and Tab commits to the right', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'D1').click()
  await page.keyboard.press('F2')
  const editor = page.locator('c2-spreadsheet .editor')
  await expect(editor).toHaveValue('=B1*C1')
  await page.keyboard.type('*2')
  await page.keyboard.press('Escape')
  await expect(cell(page, 'D1')).toHaveText('$600.00')

  await cell(page, 'A2').dblclick()
  await expect(editor).toHaveValue('Hotel')
  await page.keyboard.press('End')
  await page.keyboard.type(' (3 nights)')
  await page.keyboard.press('Tab')
  await expect(cell(page, 'A2')).toHaveText('Hotel (3 nights)')
  await expect(cell(page, 'B2')).toHaveClass(/active/)
})

test('arrow keys commit a typed value and move, but stay in a formula', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'A4').click()
  await page.keyboard.type('Taxes')
  await page.keyboard.press('ArrowRight')
  await expect(cell(page, 'A4')).toHaveText('Taxes')
  await expect(cell(page, 'B4')).toHaveClass(/active/)
  await page.keyboard.type('=SUM(B1:B2)')
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('c2-spreadsheet .editor')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(cell(page, 'B4')).toHaveText('5')
})

test('highlights the cells a formula reads while it is edited', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'D3').click()
  await page.keyboard.press('Enter')
  await expect(cell(page, 'D1')).toHaveClass(/reference-1/)
  await expect(cell(page, 'D2')).toHaveClass(/reference-1/)
  await expect(cell(page, 'C1')).not.toHaveClass(/reference/)
})

test('Shift+arrows extend the range, the summary adds it up and selection-change stays on the element', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="parent">${budget.replace('<c2-spreadsheet', '<c2-spreadsheet summary formula-bar')}</div>`)
  await watch(host(page), 'selection-change')
  await watch(page.locator('#parent'), 'selection-change')
  await cell(page, 'D1').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(page.locator('c2-spreadsheet .name-box')).toHaveText('D1:D3')
  await expect(page.locator('c2-spreadsheet .summary')).toHaveText(/Sum\s*1,800\s*Average\s*600\s*Count\s*3/)
  await expect(cell(page, 'D2')).toHaveClass(/selected/)
  await expect(cell(page, 'D2')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('c2-spreadsheet .formula-input')).toHaveValue('=B1*C1')
  await expect(host(page)).toHaveAttribute('data-events', /"range":"D1:D3","active":"D1"/)
  await expect(page.locator('#parent')).toHaveAttribute('data-events', '[]')
  expect(await host(page).evaluate((element: Spreadsheet) => element.selection)).toBe('D1:D3')
})

test('pointer selects cells, ranges, columns and rows', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet', '<c2-spreadsheet formula-bar'))
  const nameBox = page.locator('c2-spreadsheet .name-box')
  await cell(page, 'A1').click()
  await cell(page, 'C2').click({ modifiers: ['Shift'] })
  await expect(nameBox).toHaveText('A1:C2')
  await cell(page, 'B1').hover()
  await page.mouse.down()
  await cell(page, 'C3').hover()
  await page.mouse.up()
  await expect(nameBox).toHaveText('B1:C3')
  await page.locator('c2-spreadsheet [role="columnheader"][data-column="3"]').click()
  await expect(nameBox).toHaveText('D1:D6')
  await page.locator('c2-spreadsheet [role="rowheader"][data-row="1"]').click()
  await expect(nameBox).toHaveText('A2:D2')
})

test('dragging a column edge resizes it without selecting, and writes the width to columns', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet', '<c2-spreadsheet formula-bar'))
  await cell(page, 'A1').click()
  const header = page.locator('c2-spreadsheet [role="columnheader"][data-column="1"]')
  const width = async () => Math.round((await header.boundingBox())!.width)
  expect(await width()).toBe(112)

  await watch(host(page), 'column-resize')
  const handle = (await header.locator('.resizer').boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + 48, handle.y + handle.height / 2, { steps: 4 })
  await page.mouse.up()

  expect(await width()).toBe(160)
  expect(Math.round((await cell(page, 'B2').boundingBox())!.width)).toBe(160)
  await expect(page.locator('c2-spreadsheet .name-box')).toHaveText('A1')
  await expect(host(page)).toHaveAttribute('data-events', JSON.stringify([{ column: 'B', index: 1, width: 160 }]))
  const columns = await host(page).evaluate((element: Spreadsheet) => element.columns)
  expect(columns).toEqual([
    { label: 'Item' },
    { label: 'Qty', format: 'number', width: 160 },
    { label: 'Price', format: 'currency' },
    { label: 'Total', format: 'currency' },
  ])
})

test('a column stops at its minWidth, double-clicking the edge fits the content, and resizable="false" turns it off', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-spreadsheet rows="2" columns='[{"minWidth":60},{},{"resizable":false}]'
    data='[["A much longer piece of text than the column shows","x"]]'></c2-spreadsheet>`)
  const header = (column: number) => page.locator(`c2-spreadsheet [role="columnheader"][data-column="${column}"]`)
  const width = async (column: number) => Math.round((await header(column).boundingBox())!.width)

  const handle = (await header(0).locator('.resizer').boundingBox())!
  await page.mouse.move(handle.x + 4, handle.y + 4)
  await page.mouse.down()
  await page.mouse.move(handle.x - 200, handle.y + 4, { steps: 4 })
  await page.mouse.up()
  expect(await width(0)).toBe(60)

  await header(0).locator('.resizer').dblclick()
  expect(await width(0)).toBeGreaterThan(200)
  expect(await cell(page, 'A1').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(page.locator('c2-spreadsheet .editor')).toHaveCount(0)

  await expect(header(2).locator('.resizer')).toHaveCount(0)
  await host(page).evaluate((element) => element.setAttribute('resizable', 'false'))
  await expect(page.locator('c2-spreadsheet .resizer')).toHaveCount(0)
})

test('Delete clears the selection, and undo and redo restore it', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'B1').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Delete')
  await expect(cell(page, 'B1')).toHaveText('')
  await expect(cell(page, 'D3')).toHaveText('$0.00')
  await page.keyboard.press('ControlOrMeta+z')
  await expect(cell(page, 'B1')).toHaveText('2')
  await expect(cell(page, 'D3')).toHaveText('$900.00')
  await page.keyboard.press('ControlOrMeta+y')
  await expect(cell(page, 'B2')).toHaveText('')
})

test('the formula bar edits the current cell', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet', '<c2-spreadsheet formula-bar'))
  await cell(page, 'C2').click()
  const bar = page.locator('c2-spreadsheet .formula-input')
  await bar.click()
  await bar.fill('=C1/4')
  await expect(cell(page, 'C2')).toHaveText('=C1/4')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'C2')).toHaveText('$75.00')
  await expect(cell(page, 'D2')).toHaveText('$225.00')
  await expect(grid(page)).toBeFocused()
})

test('shows error values with their reason and announces them', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'A5').click()
  await page.keyboard.type('=1/0')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'A5')).toHaveText('#DIV/0!')
  await expect(cell(page, 'A5')).toHaveAttribute('title', 'Division by zero')
  await expect(page.locator('c2-spreadsheet [role="status"]')).toHaveText('A5: Division by zero')
  await page.keyboard.type('=A6+1')
  await page.keyboard.press('Enter')
  await page.keyboard.type('=A6')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'A6')).toHaveText('#CIRC!')
})

test('copies values as tab-separated text and pastes formulas with shifted references', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'A1').click()
  await page.keyboard.press('Shift+ArrowRight')
  expect(await clipboardEvent(grid(page), 'copy')).toBe('Flights\t2')

  await cell(page, 'D2').click()
  const copied = await clipboardEvent(grid(page), 'copy')
  expect(copied).toBe('300')
  await cell(page, 'D4').click()
  await clipboardEvent(grid(page), 'paste', copied)
  expect(await host(page).evaluate((element: Spreadsheet) => element.getInput('D4'))).toBe('=B4*C4')
})

test('pastes text copied from another spreadsheet as values', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await watch(host(page), 'cell-change')
  await cell(page, 'A4').click()
  await clipboardEvent(grid(page), 'paste', 'Train\t4\t"40"\r\nTaxi\t1\t25\r\n')
  await expect(cell(page, 'C4')).toHaveText('$40.00')
  await expect(cell(page, 'A5')).toHaveText('Taxi')
  await expect(page.locator('c2-spreadsheet .grid')).toHaveAttribute('aria-activedescendant', 'cell-A4')
  expect(await host(page).evaluate((element: Spreadsheet) => element.selection)).toBe('A4:C5')
  await expect(host(page)).toHaveAttribute('data-events', /"ref":"C5","input":"25","value":25/)
})

test('a paste past the last row and column grows the sheet instead of dropping cells', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-spreadsheet rows="2" columns='[{"label":"Item"},{"label":"Qty"}]'></c2-spreadsheet>`)
  await cell(page, 'B2').click()
  await clipboardEvent(grid(page), 'paste', 'a\tb\tc\nd\te\tf\ng\th\ti')
  await expect(cell(page, 'D4')).toHaveText('i')
  const size = await host(page).evaluate((element: Spreadsheet) => ({ rows: element.rows, columns: element.columns, selection: element.selection }))
  expect(size).toEqual({ rows: 4, columns: [{ label: 'Item' }, { label: 'Qty' }, {}, {}], selection: 'B2:D4' })
  await expect(page.locator('c2-spreadsheet [role="row"]')).toHaveCount(5)
})

test('insertRows and insertColumns move cells, their column options and the formulas that read them', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'D3').click()
  await host(page).evaluate((element: Spreadsheet) => element.insertRows(1))
  await expect(cell(page, 'A3')).toHaveText('Hotel')
  await expect(cell(page, 'A2')).toHaveText('')
  expect(await host(page).evaluate((element: Spreadsheet) => [element.rows, element.getInput('D3'), element.getInput('D4'), element.selection])).toEqual([
    7,
    '=B3*C3',
    '=SUM(D1:D3)',
    'D4',
  ])

  // The new row sits inside the total's range, so a value typed into it is added up.
  await host(page).evaluate((element: Spreadsheet) => element.setInput('D2', 50))
  await expect(cell(page, 'D4')).toHaveText('$950.00')

  await host(page).evaluate((element: Spreadsheet) => element.insertColumns(1, 2))
  await expect(page.locator('c2-spreadsheet [role="columnheader"][data-column="3"]')).toHaveText(/D\s*Qty/)
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getInput('F3'), element.getInput('F4'), element.data[0]])).toEqual([
    '=D3*E3',
    '=SUM(F1:F3)',
    ['Flights', null, null, 2, 300, '=D1*E1'],
  ])
  await expect(cell(page, 'F4')).toHaveText('$950.00')

  // History named cells by their old addresses, so the insertion clears it rather than undo the wrong cell.
  await host(page).evaluate((element: Spreadsheet) => element.undo())
  await expect(cell(page, 'F2')).toHaveText('$50.00')
})

test('deleteRows and deleteColumns close the gap and break references to what they removed', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await host(page).evaluate((element: Spreadsheet) => element.deleteRows(0))
  await expect(cell(page, 'A1')).toHaveText('Hotel')
  expect(await host(page).evaluate((element: Spreadsheet) => [element.rows, element.getInput('D1'), element.getInput('D2')])).toEqual([
    5,
    '=B1*C1',
    '=SUM(D1:D1)',
  ])
  await expect(cell(page, 'D2')).toHaveText('$300.00')

  await host(page).evaluate((element: Spreadsheet) => element.deleteColumns(1))
  await expect(page.locator('c2-spreadsheet [role="columnheader"][data-column="1"]')).toHaveText(/B\s*Price/)
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getInput('C1'), element.data[0]])).toEqual(['=#REF!*B1', ['Hotel', 100, '=#REF!*B1']])
  await expect(cell(page, 'C1')).toHaveText('#REF!')

  // One row and one column always stay.
  await host(page).evaluate((element: Spreadsheet) => {
    element.deleteRows(0, 99)
    element.deleteColumns(0, 99)
  })
  expect(await host(page).evaluate((element: Spreadsheet) => [element.rows, element.columns])).toEqual([1, [{ label: 'Total', format: 'currency' }]])
})

test('answers an enclosing context menu with what was right-clicked, selecting it first', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  const request = (selector: string) =>
    host(page).evaluate((element, target) => {
      const node = element.shadowRoot!.querySelector(target)!
      const detail = { data: undefined as unknown, source: null as Element | null }
      node.dispatchEvent(new CustomEvent('c2-context-menu-request', { bubbles: true, composed: true, detail }))
      return { data: detail.data, source: detail.source === element }
    }, selector)

  await cell(page, 'A1').click()
  await cell(page, 'B2').click({ modifiers: ['Shift'] })
  // Inside the selection, it stays.
  expect(await request('#cell-B1')).toEqual({
    data: { area: 'cell', range: 'A1:B2', active: 'A1', start: { row: 0, column: 0 }, end: { row: 1, column: 1 } },
    source: true,
  })
  // Outside it, the cell is selected first.
  expect((await request('#cell-C3')).data).toMatchObject({ area: 'cell', range: 'C3', active: 'C3' })
  expect((await request('[role="rowheader"][data-row="1"]')).data).toMatchObject({ area: 'row', range: 'A2:D2' })
  expect((await request('[role="columnheader"][data-column="2"] .column-label')).data).toMatchObject({ area: 'column', range: 'C1:C6' })
  expect((await request('[data-corner]')).data).toMatchObject({ area: 'corner', range: 'A1:D6' })
  await expect(grid(page)).toBeFocused()
})

test('cut clears the range it copied', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'A1').click()
  expect(await clipboardEvent(grid(page), 'cut')).toBe('Flights')
  await expect(cell(page, 'A1')).toHaveText('')
})

test('read-only sheets select and copy but never change', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet', '<c2-spreadsheet readonly formula-bar'))
  await cell(page, 'B1').click()
  await page.keyboard.type('9')
  await page.keyboard.press('Delete')
  await page.keyboard.press('Enter')
  await cell(page, 'B1').dblclick()
  await clipboardEvent(grid(page), 'paste', '7')
  await expect(page.locator('c2-spreadsheet .editor')).toHaveCount(0)
  await expect(cell(page, 'B1')).toHaveText('2')
  await expect(page.locator('c2-spreadsheet .formula-input')).toHaveAttribute('readonly', '')
  expect(await clipboardEvent(grid(page), 'copy')).toBe('2')
})

test('Tab outside an edit leaves the grid', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button>${budget}<button>After</button>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(grid(page)).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('rename-columns names a column in its header: Enter saves, Tab goes on, Escape cancels', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-spreadsheet label="Budget" rows="2" columns="3" rename-columns></c2-spreadsheet>`)
  const header = (index: number) => page.locator('c2-spreadsheet .column-header').nth(index)
  const field = page.locator('c2-spreadsheet .label-editor')
  await watch(host(page), 'column-rename')
  await header(0).dblclick()
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute('aria-label', 'Name of column A')
  await page.keyboard.type('Item')
  await page.keyboard.press('Tab')
  await expect(field).toHaveAttribute('aria-label', 'Name of column B')
  await page.keyboard.type('Cost')
  await page.keyboard.press('Enter')
  await expect(grid(page)).toBeFocused()
  await expect(header(0)).toHaveText(/A\s*Item/)
  await expect(header(1)).toHaveText(/B\s*Cost/)
  await expect(host(page)).toHaveAttribute(
    'data-events',
    JSON.stringify([
      { column: 'A', index: 0, label: 'Item', previous: '' },
      { column: 'B', index: 1, label: 'Cost', previous: '' },
    ]),
  )
  expect(await host(page).evaluate((element: Spreadsheet) => element.columns)).toEqual([{ label: 'Item' }, { label: 'Cost' }, {}])

  // From code, and cancelled with Escape.
  await host(page).evaluate((element: Spreadsheet) => element.renameColumn(0))
  await expect(field).toHaveValue('Item')
  await page.keyboard.type('Nope')
  await page.keyboard.press('Escape')
  await expect(header(0)).toHaveText(/A\s*Item/)

  // Without the attribute, a double-click on a header does not open it.
  await host(page).evaluate((element: Spreadsheet) => (element.renameColumns = false))
  await header(2).dblclick()
  await expect(field).toHaveCount(0)
})

test('styles colour, size and bold cells, move with them and undo with the values', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-spreadsheet label="Budget" rows="4" columns="3" data='[["a","b"],["c","d"]]' styles='{"A1":{"background":"yellow","bold":true},"B1":{"color":"nope"}}'></c2-spreadsheet>`,
  )
  await expect(cell(page, 'A1')).toHaveClass(/background-yellow/)
  await expect(cell(page, 'A1')).toHaveClass(/bold/)
  await expect(cell(page, 'A1')).toHaveCSS('font-weight', '600')
  await expect(cell(page, 'B1')).not.toHaveClass(/color-/)

  // From code: parts merge, null removes one, and no event fires.
  await watch(host(page), 'style-change')
  await host(page).evaluate((element: Spreadsheet) => {
    element.setStyle('A1:B2', { color: 'red', size: 'large' })
    element.setStyle('A1', { background: null })
  })
  expect(await host(page).evaluate((element: Spreadsheet) => element.styles)).toEqual({
    A1: { color: 'red', size: 'large', bold: true },
    B1: { color: 'red', size: 'large' },
    A2: { color: 'red', size: 'large' },
    B2: { color: 'red', size: 'large' },
  })
  await expect(host(page)).toHaveAttribute('data-events', '[]')

  // Ctrl/⌘+B: bold unless every cell already is.
  await cell(page, 'A1').click()
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('ControlOrMeta+b')
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getStyle('A1')?.bold, element.getStyle('B1')?.bold])).toEqual([true, true])
  await expect(host(page)).toHaveAttribute(
    'data-events',
    JSON.stringify([{ changes: [{ ref: 'B1', style: { color: 'red', size: 'large', bold: true }, previous: { color: 'red', size: 'large' } }] }]),
  )
  await page.keyboard.press('ControlOrMeta+b')
  await expect(cell(page, 'A1')).not.toHaveClass(/bold/)
  await page.keyboard.press('ControlOrMeta+z')
  await expect(cell(page, 'A1')).toHaveClass(/bold/)

  // A copied range pastes its styles; one undo takes back the values and the styles.
  await clipboardEvent(grid(page), 'copy')
  await cell(page, 'A4').click()
  await clipboardEvent(grid(page), 'paste', 'a\tb')
  expect(await host(page).evaluate((element: Spreadsheet) => element.getStyle('B4'))).toEqual({ color: 'red', size: 'large', bold: true })
  await page.keyboard.press('ControlOrMeta+z')
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getInput('A4'), element.getStyle('A4')])).toEqual(['', undefined])

  // Inserting a row moves the styles down with their cells.
  await host(page).evaluate((element: Spreadsheet) => element.insertRows(0))
  expect(Object.keys(await host(page).evaluate((element: Spreadsheet) => element.styles)).sort()).toEqual(['A2', 'A3', 'B2', 'B3'])
})

test('typing a formula suggests functions, hints their arguments, previews the result and points at cells', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  const help = page.locator('c2-spreadsheet .help')
  const options = page.locator('c2-spreadsheet .help-option')
  const editor = page.locator('c2-spreadsheet .editor')
  await cell(page, 'B5').click()
  await page.keyboard.type('=')
  await expect(options.first()).toContainText('SUM(value1, [value2, …])')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.type('su')
  await expect(options).toHaveText([/SUM\(value1/, /SUMIF\(range, condition/])
  await expect(editor).toHaveAttribute('aria-activedescendant', 'function-0')
  await page.keyboard.press('ArrowDown')
  await expect(editor).toHaveAttribute('aria-activedescendant', 'function-1')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Tab')
  await expect(editor).toHaveValue('=SUM(')
  await expect(help.locator('.current')).toHaveText('value1')
  await expect(help).toContainText('Click or drag over cells to add them')

  // A click then a drag put a range in the formula; the result shows before Enter, which closes the call.
  await cell(page, 'B1').hover()
  await page.mouse.down()
  await cell(page, 'B2').hover()
  await page.mouse.up()
  await expect(editor).toHaveValue('=SUM(B1:B2')
  await expect(help.locator('.result')).toHaveText('Result 5')
  await page.keyboard.type(',')
  await expect(help.locator('.current')).toHaveText('[value2, …]')
  await page.keyboard.press('Backspace')
  await page.keyboard.press('Enter')
  expect(await host(page).evaluate((element: Spreadsheet) => element.getInput('B5'))).toBe('=SUM(B1:B2)')
  await expect(cell(page, 'B5')).toHaveText('5')

  // Escape closes the list first, then cancels.
  await cell(page, 'C5').click()
  await page.keyboard.type('=a')
  await expect(options).toHaveText([/AVERAGE/, /ABS/, /AND/])
  await page.keyboard.press('Escape')
  await expect(help).toHaveCount(0)
  await expect(editor).toHaveValue('=a')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
})

test('editing text keeps the cell font, a formula switches to the code font', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await cell(page, 'A1').dblclick()
  const editor = page.locator('c2-spreadsheet .editor')
  const font = await cell(page, 'A2').evaluate((element) => [getComputedStyle(element).fontFamily, getComputedStyle(element).fontSize])
  expect(await editor.evaluate((element) => [getComputedStyle(element).fontFamily, getComputedStyle(element).fontSize])).toEqual(font)
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('=1')
  await expect(editor).toHaveCSS('font-family', /monospace/)
})

test('fx lists every function and starts a formula in the current cell', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet ', '<c2-spreadsheet formula-bar '))
  await cell(page, 'B5').click()
  await page.locator('c2-spreadsheet button.fx').click()
  const input = page.locator('c2-spreadsheet .formula-input')
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('=')
  await expect(page.locator('c2-spreadsheet .help-option')).toHaveCount(20)
  await page.locator('c2-spreadsheet .help-option', { hasText: 'TODAY' }).click()
  await expect(input).toHaveValue('=TODAY()')
  await expect(input).toBeFocused()
})

test('the totals bar writes its total as a formula under the range', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet ', '<c2-spreadsheet summary '))
  await watch(host(page), 'cell-change')
  await cell(page, 'B1').click()
  await page.keyboard.press('Shift+ArrowDown')
  const sum = page.locator('c2-spreadsheet .total', { hasText: 'Sum' })
  await expect(sum).toHaveAttribute('title', 'Insert =SUM(B1:B2) in B3')
  await sum.click()
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getInput('B3'), element.selection])).toEqual(['=SUM(B1:B2)', 'B3'])
  await expect(cell(page, 'B3')).toHaveText('5')

  // B3 is taken now: a row goes in for the next total. A one-row range gets its total after it.
  await cell(page, 'B1').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.locator('c2-spreadsheet .total', { hasText: 'Average' }).click()
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getInput('B3'), element.getInput('B4'), element.rows])).toEqual([
    '=AVERAGE(B1:B2)',
    '=SUM(B1:B2)',
    7,
  ])
  expect(await host(page).evaluate((element: Spreadsheet) => element.insertTotal('MAX', 'B1:C1'))).toBe('D1')
  // D1 was taken: a column went in, and its formula moved over to E1.
  expect(await host(page).evaluate((element: Spreadsheet) => [element.getInput('D1'), element.getInput('E1')])).toEqual(['=MAX(B1:C1)', '=B1*C1'])
})

test('focus() hands the keyboard to the current cell', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await host(page).evaluate(async (element: Spreadsheet) => {
    element.select('B2')
    await element.updateComplete
    element.focus()
  })
  await expect(grid(page)).toBeFocused()
  await page.keyboard.type('7')
  await page.keyboard.press('Enter')
  expect(await host(page).evaluate((element: Spreadsheet) => element.getInput('B2'))).toBe('7')
})

test('methods write, select and export cells', async ({ page, renderScenario }) => {
  await renderScenario(budget)
  await host(page).evaluate(async (element: Spreadsheet) => {
    element.setInput('c1', 50)
    element.select('B1:D2')
    await element.updateComplete
  })
  await expect(cell(page, 'D3')).toHaveText('$400.00')
  await expect(cell(page, 'C2')).toHaveClass(/selected/)
  expect(await host(page).evaluate((element: Spreadsheet) => element.toTSV().split('\n')[0])).toBe('Flights\t2\t50\t100')
  await host(page).evaluate(async (element: Spreadsheet) => {
    element.undo()
    await element.updateComplete
  })
  await expect(cell(page, 'D3')).toHaveText('$900.00')
})

test('app functions and new data reload the sheet', async ({ page, renderScenario }) => {
  await renderScenario('<c2-spreadsheet columns="3"></c2-spreadsheet>')
  await host(page).evaluate(async (element: Spreadsheet) => {
    element.functions = { double: ([value]) => (typeof value === 'number' ? value * 2 : 0) }
    element.data = [[21, '=DOUBLE(A1)']]
    await element.updateComplete
  })
  await expect(cell(page, 'B1')).toHaveText('42')
  await expect(page.locator('c2-spreadsheet [role="columnheader"]')).toHaveCount(4)
  await props(host(page), { data: [[1, 2, 3, 4]] })
  await expect(cell(page, 'D1')).toHaveText('4')
  await expect(cell(page, 'B1')).toHaveText('2')
})

test('is accessible and writes no attributes on its host', async ({ page, renderScenario }) => {
  await renderScenario(budget.replace('<c2-spreadsheet', '<c2-spreadsheet formula-bar summary'))
  const before = await host(page).evaluate((element: Spreadsheet) => element.getAttributeNames().sort())
  await cell(page, 'B1').click()
  await page.keyboard.type('4')
  await page.keyboard.press('Enter')
  expect(await host(page).evaluate((element: Spreadsheet) => element.getAttributeNames().sort())).toEqual(before)
  await expect(grid(page)).toHaveAttribute('aria-label', 'Budget')
  await accessible(page)
  await cell(page, 'B2').click()
  await page.keyboard.press('Enter')
  await accessible(page)
})
