import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const items = [
  { id: 'a', column: 'todo', title: 'Alpha', description: 'First task' },
  { id: 'b', column: 'todo', title: 'Bravo' },
  { id: 'c', column: 'doing', title: 'Charlie' },
  { id: 'x', column: 'nowhere', title: 'Orphan' },
]

const board = (editable = true) => `
  <c2-kanban ${editable ? 'editable' : ''} aria-label="Sprint board" items='${JSON.stringify(items)}'>
    <c2-kanban-column column-id="todo" label="To do"></c2-kanban-column>
    <c2-kanban-column column-id="doing" label="In progress" limit="1">
      <button slot="footer" type="button">Add card</button>
    </c2-kanban-column>
    <c2-kanban-column column-id="done" label="Done"><span slot="empty">Nothing shipped yet</span></c2-kanban-column>
  </c2-kanban>
`

const column = (page: Page, id: string) => page.locator(`c2-kanban-column[column-id="${id}"]`)
const card = (page: Page, title: string) => page.locator('c2-kanban-column [part="card"]:not(.card--dragging)', { hasText: title })

/** Card titles per column, in the order the board shows them. */
async function layout(page: Page): Promise<Record<string, string[]>> {
  return page
    .locator('c2-kanban-column')
    .evaluateAll((columns) =>
      Object.fromEntries(
        columns.map((element) => [
          element.getAttribute('column-id'),
          [...element.shadowRoot!.querySelectorAll<HTMLElement>('.cards > .card')].map(
            (wrapper) => wrapper.querySelector('.card__title')?.textContent ?? wrapper.textContent!.trim(),
          ),
        ]),
      ),
    )
}

/** Item ids per column, read from the board's `items`. */
async function itemColumns(host: Locator): Promise<Record<string, string>> {
  return host.evaluate((element) =>
    Object.fromEntries((element as HTMLElement & { items: { id: string; column: string }[] }).items.map((item) => [item.id, item.column])),
  )
}

async function recordMoves(host: Locator, cancel = false): Promise<void> {
  await host.evaluate((element, prevent) => {
    const moves: unknown[] = []
    ;(window as Window & { moves?: unknown[] }).moves = moves
    element.addEventListener('card-move', (event) => {
      const { item, items, ...rest } = (event as CustomEvent).detail
      moves.push({ ...rest, item: item.id, count: items.length })
      if (prevent) event.preventDefault()
    })
  }, cancel)
}

const moves = (page: Page) => page.evaluate(() => (window as Window & { moves?: unknown[] }).moves)

async function dragTo(page: Page, from: Locator, x: number, y: number): Promise<void> {
  const source = await from.boundingBox()
  if (!source) throw new Error('Missing drag source')
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 12, source.y + source.height / 2 + 6, { steps: 3 })
  await page.mouse.move(x, y, { steps: 10 })
  await page.mouse.up()
}

async function dragIntoColumn(page: Page, from: Locator, id: string): Promise<void> {
  const box = await column(page, id).boundingBox()
  await dragTo(page, from, box!.x + box!.width / 2, box!.y + box!.height - 20)
}

test('lays out items in their columns with counts, limits, empty hints and footers', async ({ page, renderScenario }) => {
  await renderScenario(board())
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })
  await expect(page.getByText('Orphan')).toHaveCount(0)
  await expect(card(page, 'Alpha')).toContainText('First task')
  await expect(column(page, 'todo').locator('[part="count"]')).toHaveText('2')
  await expect(column(page, 'doing').locator('[part="count"]')).toHaveText('1 / 1')
  await expect(page.getByText('Nothing shipped yet')).toBeVisible()
  await expect(column(page, 'todo').locator('[part="empty"]')).toBeHidden()
  await expect(column(page, 'doing').locator('[part="footer"]')).toBeVisible()
  await expect(column(page, 'todo').locator('[part="footer"]')).toBeHidden()
  await expect(page.getByRole('list', { name: 'To do' })).toBeVisible()
  await accessible(page)
})

test('renderItem draws the card content and a header slot replaces the default header', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-kanban aria-label="Board" items='${JSON.stringify(items)}'>
      <c2-kanban-column column-id="todo" label="To do"><strong slot="header">Backlog lane</strong></c2-kanban-column>
    </c2-kanban>
  `)
  await page.locator('c2-kanban').evaluate((element) => {
    const html = (window as unknown as { kanbanHtml: (strings: TemplateStringsArray, ...values: unknown[]) => unknown }).kanbanHtml
    ;(element as HTMLElement & { renderItem: unknown }).renderItem = ({ item, index }: { item: { id: string; title: string }; index: number }) =>
      html`<span class="custom">#${index + 1} ${item.title} (${item.id})</span>`
  })
  await expect(card(page, 'Alpha')).toHaveText('#1 Alpha (a)')
  await expect(card(page, 'Bravo')).toHaveText('#2 Bravo (b)')
  await expect(page.getByText('Backlog lane')).toBeVisible()
  await expect(column(page, 'todo').locator('[part="label"]')).toBeHidden()
})

test('drags a card into another column and updates items', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host)
  await dragIntoColumn(page, card(page, 'Alpha'), 'done')
  expect(await layout(page)).toEqual({ todo: ['Bravo'], doing: ['Charlie'], done: ['Alpha'] })
  expect(await moves(page)).toEqual([{ key: 'a', item: 'a', count: 4, fromColumn: 'todo', toColumn: 'done', fromIndex: 0, toIndex: 0, inputMethod: 'mouse' }])
  expect(await itemColumns(host)).toEqual({ a: 'done', b: 'todo', c: 'doing', x: 'nowhere' })
  await expect(page.getByText('Nothing shipped yet')).toBeHidden()
  await expect(page.locator('c2-kanban-column [part="placeholder"]')).toHaveCount(0)
})

test('drags a card within its column', async ({ page, renderScenario }) => {
  await renderScenario(board())
  await recordMoves(page.locator('c2-kanban'))
  const bravo = await card(page, 'Bravo').boundingBox()
  await dragTo(page, card(page, 'Alpha'), bravo!.x + bravo!.width / 2, bravo!.y + bravo!.height - 2)
  expect(await layout(page)).toEqual({ todo: ['Bravo', 'Alpha'], doing: ['Charlie'], done: [] })
  expect(await moves(page)).toMatchObject([{ fromColumn: 'todo', toColumn: 'todo', fromIndex: 0, toIndex: 1 }])
})

test('accepts a drop past the column limit and marks the column', async ({ page, renderScenario }) => {
  await renderScenario(board())
  await dragIntoColumn(page, card(page, 'Alpha'), 'doing')
  expect(await layout(page)).toEqual({ todo: ['Bravo'], doing: ['Charlie', 'Alpha'], done: [] })
  await expect(column(page, 'doing').locator('[part="count"]')).toHaveText('2 / 1')
  await expect(column(page, 'doing').locator('[part="column"]')).toHaveClass(/column--over/)
})

test('a cancelled card-move keeps the card where it was', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host, true)
  await dragIntoColumn(page, card(page, 'Alpha'), 'done')
  expect(await moves(page)).toHaveLength(1)
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })
  expect(await itemColumns(host)).toMatchObject({ a: 'todo' })
})

test('Escape cancels a pointer drag', async ({ page, renderScenario }) => {
  await renderScenario(board())
  await recordMoves(page.locator('c2-kanban'))
  const source = await card(page, 'Alpha').boundingBox()
  const done = await column(page, 'done').boundingBox()
  await page.mouse.move(source!.x + 10, source!.y + 10)
  await page.mouse.down()
  await page.mouse.move(done!.x + 20, done!.y + 60, { steps: 10 })
  await expect(page.locator('c2-kanban-column [part="placeholder"]')).toHaveCount(1)
  await expect(column(page, 'done').locator('[part="column"]')).toHaveClass(/column--target/)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })
  expect(await moves(page)).toEqual([])
})

test('a press on a control inside a card does not start a drag', async ({ page, renderScenario }) => {
  await renderScenario(board())
  await page.locator('c2-kanban').evaluate((element) => {
    const html = (window as unknown as { kanbanHtml: (strings: TemplateStringsArray, ...values: unknown[]) => unknown }).kanbanHtml
    ;(element as HTMLElement & { renderItem: unknown }).renderItem = ({ item }: { item: { title: string } }) =>
      html`${item.title} <button type="button">Open</button>`
  })
  await dragIntoColumn(page, card(page, 'Alpha').getByRole('button', { name: 'Open' }), 'done')
  expect(await layout(page)).toEqual({ todo: ['Alpha Open', 'Bravo Open'], doing: ['Charlie Open'], done: [] })
})

test('moves a card with the keyboard across columns and within one', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host)
  await tab()
  await expect(card(page, 'Alpha')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(host.getByRole('status')).toContainText('Alpha picked up in To do, position 1 of 2')
  await page.keyboard.press('ArrowRight')
  await expect(host.getByRole('status')).toContainText('moved to In progress, position 1 of 2')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  expect(await layout(page)).toEqual({ todo: ['Bravo'], doing: ['Charlie'], done: ['Alpha'] })
  expect(await moves(page)).toEqual([])
  await page.keyboard.press('Space')
  await expect(host.getByRole('status')).toContainText('Alpha dropped in Done, position 1 of 1')
  expect(await moves(page)).toEqual([
    { key: 'a', item: 'a', count: 4, fromColumn: 'todo', toColumn: 'done', fromIndex: 0, toIndex: 0, inputMethod: 'keyboard' },
  ])
  await expect(card(page, 'Alpha')).toBeFocused()
})

test('Escape returns a keyboard-picked card to where it was', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await tab()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })
  await expect(host.getByRole('status')).toContainText('returned to To do, position 1')
  await expect(card(page, 'Alpha')).toBeFocused()
})

test('arrow keys move focus between cards with one tab stop', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  await tab()
  await page.keyboard.press('ArrowDown')
  await expect(card(page, 'Bravo')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(card(page, 'Charlie')).toBeFocused()
  await expect(page.locator('c2-kanban-column [part="card"][tabindex="0"]')).toHaveCount(1)
})

test('read-only boards do not move cards or add tab stops', async ({ page, renderScenario }) => {
  await renderScenario(board(false))
  await dragIntoColumn(page, card(page, 'Alpha'), 'done')
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })
  await expect(page.locator('c2-kanban-column [part="card"][tabindex]')).toHaveCount(0)
})

test('follows a new items array from the application', async ({ page, renderScenario }) => {
  await renderScenario(board())
  await page.locator('c2-kanban').evaluate((element) => {
    ;(element as HTMLElement & { items: unknown[] }).items = [
      { id: 'c', column: 'done', title: 'Charlie' },
      { id: 'd', column: 'todo', title: 'Delta' },
    ]
  })
  await expect.poll(() => layout(page)).toEqual({ todo: ['Delta'], doing: [], done: ['Charlie'] })
  await expect(column(page, 'doing').locator('[part="empty"]')).toBeVisible()
})
