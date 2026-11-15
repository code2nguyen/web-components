import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const rows = [
  { id: 'high', label: 'High' },
  { id: 'medium', label: 'Medium' },
  { id: 'low', label: 'Low' },
]
const columns = ['Low', 'Medium', 'High'].map((label) => ({ id: label.toLowerCase(), label }))
const cells = [
  { row: 'high', column: 'high', label: 'Star', band: 1 },
  { row: 'low', column: 'low', label: 'Risk', band: 5 },
  { row: 'medium', column: 'medium', band: 3 },
]
const items = [
  { id: 'a', row: 'high', column: 'high', title: 'Ana' },
  { id: 'b', row: 'high', column: 'high', title: 'Ben' },
  { id: 'c', row: 'low', column: 'low', title: 'Cy' },
  { id: 'd', row: 'medium', column: 'high', title: 'Dee' },
  { id: 'x', row: 'nowhere', column: 'low', title: 'Orphan' },
]

const json = (value: unknown) => JSON.stringify(value).replaceAll("'", '&#39;')

const board = (attributes = 'editable', lang = '') => `
  <div ${lang ? `lang="${lang}"` : ''}>
    <c2-matrix-board ${attributes} aria-label="Talent review" row-title="Potential" column-title="Performance"
      rows='${json(rows)}' columns='${json(columns)}' cells='${json(cells)}' items='${json(items)}'>
      <p>Legend: green is a star</p>
    </c2-matrix-board>
  </div>
`

const host = (page: Page) => page.locator('c2-matrix-board')
const cell = (page: Page, row: string, column: string) => page.locator(`c2-matrix-board c2-kanban-column[column-id='${JSON.stringify([row, column])}']`)
const card = (page: Page, title: string) => page.locator('c2-matrix-board [part="card"]:not(.card--dragging)', { hasText: title })

/** Card titles per cell (`row/column`), in the order the board shows them; empty cells are left out. */
async function layout(page: Page): Promise<Record<string, string[]>> {
  return host(page).evaluate((element) => {
    const result: Record<string, string[]> = {}
    for (const cellElement of element.shadowRoot!.querySelectorAll('c2-kanban-column')) {
      const titles = [...cellElement.shadowRoot!.querySelectorAll('.cards > .card')].map((wrapper) => wrapper.querySelector('.card__title')?.textContent ?? '')
      if (titles.length) result[(JSON.parse(cellElement.getAttribute('column-id')!) as string[]).join('/')] = titles
    }
    return result
  })
}

async function recordMoves(locator: Locator): Promise<void> {
  await locator.evaluate((element) => {
    const moves: unknown[] = []
    ;(window as Window & { moves?: unknown[] }).moves = moves
    element.addEventListener('card-move', (event) => {
      const { item, items: all, ...rest } = (event as CustomEvent).detail
      moves.push({ ...rest, item: item.id, count: all.length })
    })
  })
}

const moves = (page: Page) => page.evaluate(() => (window as Window & { moves?: unknown[] }).moves)

const itemPlaces = (locator: Locator) =>
  locator.evaluate((element) =>
    Object.fromEntries(
      (element as HTMLElement & { items: { id: string; row: string; column: string }[] }).items.map((item) => [item.id, `${item.row}/${item.column}`]),
    ),
  )

test('lays out items in a grid of cells with axis labels, names, counts and bands', async ({ page, renderScenario }) => {
  await renderScenario(board())
  expect(await layout(page)).toEqual({ 'high/high': ['Ana', 'Ben'], 'medium/high': ['Dee'], 'low/low': ['Cy'] })
  await expect(page.getByText('Orphan')).toHaveCount(0)
  await expect(host(page).locator('[part="row-label"]')).toHaveText(['High', 'Medium', 'Low'])
  await expect(host(page).locator('[part="column-label"]')).toHaveText(['Low', 'Medium', 'High'])
  await expect(host(page).locator('[part="row-title"]')).toHaveText('Potential')
  await expect(host(page).locator('[part="column-title"]')).toHaveText('Performance')
  await expect(cell(page, 'high', 'high').locator('[part="cell-label"]')).toHaveText('Star')
  await expect(cell(page, 'high', 'high').locator('[part="cell-count"]')).toHaveText('2')
  await expect(cell(page, 'medium', 'low').locator('[part="cell-count"]')).toHaveText('0')
  await expect(cell(page, 'medium', 'low').locator('[part="cell-label"]')).toHaveCount(0)
  await expect(cell(page, 'high', 'high')).toHaveClass(/band-1/)
  await expect(cell(page, 'medium', 'medium')).toHaveClass(/band-3/)
  await expect(cell(page, 'medium', 'low')).not.toHaveClass(/band-/)
  // Rows run top to bottom and columns left to right.
  const topRight = (await cell(page, 'high', 'high').boundingBox())!
  const bottomLeft = (await cell(page, 'low', 'low').boundingBox())!
  expect(topRight.x).toBeGreaterThan(bottomLeft.x)
  expect(topRight.y).toBeLessThan(bottomLeft.y)
  await expect(page.getByRole('list', { name: 'Star (Potential: High, Performance: High)' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Potential: Medium, Performance: Low' })).toBeAttached()
  await expect(page.getByText('Legend: green is a star')).toBeVisible()
  await expect(host(page).locator('.matrix ~ .footer')).toBeVisible()
  await accessible(page)
})

test('drags a card into a cell of another row and column', async ({ page, renderScenario }) => {
  await renderScenario(board())
  await recordMoves(host(page))
  const source = (await card(page, 'Cy').boundingBox())!
  const target = (await cell(page, 'high', 'medium').boundingBox())!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 6, { steps: 3 })
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await expect(cell(page, 'high', 'medium').locator('[part="column"]')).toHaveClass(/column--target/)
  await expect(cell(page, 'high', 'medium').locator('[part="cell-count"]')).toHaveText('1')
  await page.mouse.up()
  expect(await layout(page)).toEqual({ 'high/medium': ['Cy'], 'high/high': ['Ana', 'Ben'], 'medium/high': ['Dee'] })
  expect(await moves(page)).toEqual([
    { key: 'c', item: 'c', count: 5, fromRow: 'low', toRow: 'high', fromColumn: 'low', toColumn: 'medium', fromIndex: 0, toIndex: 0, inputMethod: 'mouse' },
  ])
  expect(await itemPlaces(host(page))).toMatchObject({ c: 'high/medium', a: 'high/high' })
  await expect(cell(page, 'low', 'low').locator('[part="cell-count"]')).toHaveText('0')
})

test('a drop in the gap between cells lands in the nearest cell', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="--c2-matrix-board--gap: 40px">${board()}</div>`)
  const source = (await card(page, 'Cy').boundingBox())!
  const left = (await cell(page, 'low', 'low').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + 10)
  await page.mouse.down()
  await page.mouse.move(left.x + left.width + 30, left.y + 20, { steps: 10 })
  await page.mouse.up()
  expect(await layout(page)).toMatchObject({ 'low/medium': ['Cy'] })
})

test('moves a card with the keyboard between rows and columns', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  await recordMoves(host(page))
  const status = host(page).getByRole('status')
  await tab()
  await expect(card(page, 'Ana')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Ben')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(status).toContainText('Ben picked up in Star (Potential: High, Performance: High), position 2 of 2')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(status).toContainText('Ben is already in the top row.')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(status).toContainText('Ben moved to Potential: Medium, Performance: High, position 1 of 2.')
  await page.keyboard.press('ArrowRight')
  await expect(status).toContainText('Ben is already in the last column.')
  await page.keyboard.press('ArrowLeft')
  await expect(status).toContainText('moved to Potential: Medium, Performance: Medium, position 1 of 1.')
  await expect(cell(page, 'medium', 'medium').locator('[part="cell-count"]')).toHaveText('1')
  expect(await moves(page)).toEqual([])
  await page.keyboard.press('Space')
  await expect(status).toContainText('Ben dropped in Potential: Medium, Performance: Medium, position 1 of 1.')
  expect(await moves(page)).toEqual([
    {
      key: 'b',
      item: 'b',
      count: 5,
      fromRow: 'high',
      toRow: 'medium',
      fromColumn: 'high',
      toColumn: 'medium',
      fromIndex: 1,
      toIndex: 0,
      inputMethod: 'keyboard',
    },
  ])
  expect(await itemPlaces(host(page))).toMatchObject({ b: 'medium/medium' })
  await expect(card(page, 'Ben')).toBeFocused()
})

test('Up from the top of a cell lands at the bottom of the cell above; Escape puts the card back', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  await tab()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Dee')).toBeFocused()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowUp')
  expect(await layout(page)).toEqual({ 'high/high': ['Ana', 'Ben', 'Dee'], 'low/low': ['Cy'] })
  await page.keyboard.press('Escape')
  expect(await layout(page)).toEqual({ 'high/high': ['Ana', 'Ben'], 'medium/high': ['Dee'], 'low/low': ['Cy'] })
  await expect(host(page).getByRole('status')).toContainText('Dee returned to Potential: Medium, Performance: High, position 1.')
  await expect(card(page, 'Dee')).toBeFocused()
})

test('arrow keys move focus across cells, skipping empty ones, with one tab stop', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  await tab()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Dee')).toBeFocused()
  // Nothing below Dee in the High column: focus stays.
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Dee')).toBeFocused()
  // Medium/Medium and Medium/Low are empty: Left finds no card in the row.
  await page.keyboard.press('ArrowLeft')
  await expect(card(page, 'Dee')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(card(page, 'Ben')).toBeFocused()
  await expect(page.locator('c2-matrix-board [part="card"][tabindex="0"]')).toHaveCount(1)
})

test('read-only boards do not move cards or add tab stops', async ({ page, renderScenario }) => {
  await renderScenario(board(''))
  const source = (await card(page, 'Cy').boundingBox())!
  const target = (await cell(page, 'high', 'low').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + 10)
  await page.mouse.down()
  await page.mouse.move(target.x + 20, target.y + 40, { steps: 10 })
  await page.mouse.up()
  expect(await layout(page)).toMatchObject({ 'low/low': ['Cy'] })
  await expect(page.locator('c2-matrix-board [part="card"][tabindex]')).toHaveCount(0)
})

test('plain axis values, numeric fields and a new grid from the application', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-matrix-board aria-label="Risks" row-field="likelihood" column-field="impact"
    rows='[3, 2, 1]' columns='[1, 2, 3]' items='[{"id":"r1","likelihood":3,"impact":1,"title":"Outage"}]'></c2-matrix-board>`)
  expect(await layout(page)).toEqual({ '3/1': ['Outage'] })
  await expect(host(page).locator('[part="row-title"]')).toHaveCount(0)
  await expect(host(page).locator('.matrix ~ .footer')).toBeHidden()
  await expect(page.getByRole('list', { name: '3, 1' })).toBeVisible()
  await host(page).evaluate((element) => {
    ;(element as HTMLElement & { rows: unknown[] }).rows = [2, 1]
  })
  await expect.poll(() => layout(page)).toEqual({})
  await expect(host(page).locator('c2-kanban-column')).toHaveCount(6)
})

test('moves write the axis ids back with their type', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<c2-matrix-board editable aria-label="Risks" row-field="likelihood" column-field="impact"
    rows='[2, 1]' columns='[1, 2]' items='[{"id":"r1","likelihood":2,"impact":1,"title":"Outage"}]'></c2-matrix-board>`)
  await tab()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Space')
  expect(await host(page).evaluate((element) => (element as HTMLElement & { items: unknown[] }).items)).toEqual([
    { id: 'r1', likelihood: 1, impact: 2, title: 'Outage' },
  ])
})

test('speaks the language of the page', async ({ page, renderScenario, tab }) => {
  await renderScenario(board('editable', 'fr'))
  await expect(page.getByRole('list', { name: 'Star (Potential : High, Performance : High)' })).toBeVisible()
  await tab()
  await page.keyboard.press('Space')
  await expect(host(page).getByRole('status')).toContainText('Ana prise dans Star (Potential : High, Performance : High), position 1 sur 2')
  await page.keyboard.press('ArrowUp')
  await expect(host(page).getByRole('status')).toContainText('Ana est déjà sur la première ligne.')
  await page.keyboard.press('Escape')
  await expect(cell(page, 'high', 'high').locator('.visually-hidden').first()).toContainText('Appuyez sur Espace')
})
