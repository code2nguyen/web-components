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
