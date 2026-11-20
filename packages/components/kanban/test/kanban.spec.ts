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

test("an empty lane stretched to a full neighbour's height keeps its hint under the header", async ({ page, renderScenario }) => {
  const many = Array.from({ length: 8 }, (_, index) => ({ id: `t${index}`, column: 'todo', title: `Task ${index}` }))
  await renderScenario(`
    <c2-kanban aria-label="Board" items='${JSON.stringify(many)}'>
      <c2-kanban-column column-id="todo" label="To do"></c2-kanban-column>
      <c2-kanban-column column-id="done" label="Done"></c2-kanban-column>
    </c2-kanban>`)
  const done = column(page, 'done')
  const lane = (await done.boundingBox())!
  const header = (await done.locator('.header').boundingBox())!
  const empty = (await done.locator('[part="empty"]').boundingBox())!
  // The lane does stretch, so the hint used to sit at its bottom, a full column of cards away from the header.
  expect(lane.height).toBeGreaterThan(300)
  expect(empty.y - (header.y + header.height)).toBeLessThan(24)
})

test('the dragged card stays under the pointer inside a transformed ancestor', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="transform: translateX(0); margin: 40px 0 0 120px">${board()}</div>`)
  const source = await card(page, 'Alpha').boundingBox()
  const done = await column(page, 'done').boundingBox()
  const grab = { x: source!.x + 20, y: source!.y + 15 }
  await page.mouse.move(grab.x, grab.y)
  await page.mouse.down()
  const to = { x: done!.x + 60, y: done!.y + 90 }
  await page.mouse.move(to.x, to.y, { steps: 10 })
  const dragged = page.locator('c2-kanban-column [part="card"].card--dragging')
  // The card keeps the grab offset, give or take its 2° tilt.
  await expect
    .poll(async () => {
      const box = await dragged.boundingBox()
      return box ? Math.abs(box.x + 20 - to.x) < 8 && Math.abs(box.y + 15 - to.y) < 8 : false
    })
    .toBe(true)
  await page.mouse.up()
})

// ---- drops of cards from outside the board (another board, another list in the page, another window) ----

/**
 * Synthesises a drag of an item payload onto `selector`, near its bottom edge: dragenter and dragover, then the drop
 * (or a dragleave when `drop` is false). Returns how the board was lit while the drag was over it.
 */
async function dropPayload(page: Page, selector: string, type: string, payload: unknown, drop = true): Promise<string> {
  return page.evaluate(
    async ({ selector, type, payload, drop }) => {
      const target = document.querySelector<HTMLElement>(selector)!
      const box = target.getBoundingClientRect()
      const transfer = new DataTransfer()
      transfer.setData(type, JSON.stringify(payload))
      const init = { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true, clientX: box.left + box.width / 2, clientY: box.bottom - 4 }
      target.dispatchEvent(new DragEvent('dragenter', init))
      target.dispatchEvent(new DragEvent('dragover', init))
      const host = document.querySelector('c2-kanban') as HTMLElement & { updateComplete: Promise<unknown> }
      // A refusal shows once the event has passed every zone around this one.
      await new Promise((resolve) => setTimeout(resolve))
      await host.updateComplete
      const board = host.shadowRoot!.querySelector('.board')!
      const lit = board.classList.contains('board--drop-refused') ? 'refused' : board.classList.contains('board--drop-target') ? 'target' : 'none'
      target.dispatchEvent(new DragEvent(drop ? 'drop' : 'dragleave', init))
      return lit
    },
    { selector, type, payload, drop },
  )
}

const dropBoard = (attributes = 'editable drop-kind="kanban-card"') => `
  <c2-kanban ${attributes} aria-label="Sprint board" items='${JSON.stringify(items)}'>
    <c2-kanban-column column-id="todo" label="To do"></c2-kanban-column>
    <c2-kanban-column column-id="doing" label="In progress"></c2-kanban-column>
    <c2-kanban-column column-id="done" label="Done"></c2-kanban-column>
  </c2-kanban>
`
const CARD_TYPE = 'application/x-c2n-kanban-card+json'
const DONE = 'c2-kanban-column[column-id="done"]'

test('takes cards dropped from outside under its drop-kind, lights up and announces them', async ({ page, renderScenario }) => {
  await renderScenario(dropBoard())
  const host = page.locator('c2-kanban')
  await host.evaluate((element) => {
    const drops: unknown[] = []
    ;(window as Window & { drops?: unknown[] }).drops = drops
    element.addEventListener('item-drop', (event) => {
      const { added, refused, toColumn, toIndex, kind, items } = (event as CustomEvent).detail
      drops.push({ added: added.map((item: { id: string }) => item.id), refused: refused.length, toColumn, toIndex, kind, count: items.length })
    })
  })
  const lit = await dropPayload(page, DONE, CARD_TYPE, [
    { id: 'n1', column: 'elsewhere', title: 'New one' },
    { id: 'a', column: 'todo', title: 'Alpha twin' },
  ])
  expect(lit).toBe('target')
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: ['New one'] })
  expect((await itemColumns(host)).n1).toBe('done')
  expect(await page.evaluate(() => (window as Window & { drops?: unknown[] }).drops)).toEqual([
    { added: ['n1'], refused: 1, toColumn: 'done', toIndex: 0, kind: 'kanban-card', count: 5 },
  ])
  await expect(host.getByRole('status')).toHaveText('1 item added. 1 item not added')
  // A second card dropped near the bottom of the column lands after the first.
  await dropPayload(page, DONE, CARD_TYPE, [{ id: 'n2', title: 'Newer one' }])
  expect((await layout(page)).done).toEqual(['New one', 'Newer one'])
})

test('refuses another kind of payload and a canceled item-drop, and ignores drops without drop-kind', async ({ page, renderScenario }) => {
  await renderScenario(dropBoard())
  const host = page.locator('c2-kanban')
  expect(await dropPayload(page, DONE, 'application/x-c2n-tree-node+json', [{ value: 'x' }])).toBe('refused')
  expect(await dropPayload(page, DONE, CARD_TYPE, [{ id: 'n1' }], false)).toBe('target')
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })

  await host.evaluate((element) => element.addEventListener('item-drop', (event) => event.preventDefault()))
  await dropPayload(page, DONE, CARD_TYPE, [{ id: 'n1', title: 'New one' }])
  expect(await layout(page)).toEqual({ todo: ['Alpha', 'Bravo'], doing: ['Charlie'], done: [] })
  await expect(host.getByRole('status')).toHaveText('1 item not added')

  // Without drop-kind, or read-only, the board takes nothing and stays unlit.
  for (const attributes of ['editable', 'drop-kind="kanban-card"']) {
    await renderScenario(dropBoard(attributes))
    expect(await dropPayload(page, DONE, CARD_TYPE, [{ id: 'n1', title: 'New one' }])).toBe('none')
    expect((await layout(page)).done).toEqual([])
  }
})

test('the built-in text of a column follows the language of the page', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-kanban editable aria-label="Tableau" items='[]'><c2-kanban-column column-id="todo" label="À faire"></c2-kanban-column></c2-kanban></div>`,
  )
  const column = page.locator('c2-kanban-column')
  await expect(column.locator('[part="empty"]')).toHaveText('Aucune carte')
  await expect(column.locator('p.visually-hidden')).toHaveText(/^\s*Appuyez sur Espace pour prendre une carte\./)
})

test("the board's move announcements follow the language of the page", async ({ page, renderScenario, tab }) => {
  await renderScenario(`<div lang="fr">${board()}</div>`)
  const host = page.locator('c2-kanban')
  await tab()
  await expect(card(page, 'Alpha')).toBeFocused()
  await page.keyboard.press('Space')
  await expect(host.getByRole('status')).toContainText('Alpha prise dans To do, position 1 sur 2')
})

// ---- cards leaving the board (drag-kind) ----

const twoBoards = (backlogAttributes = 'editable drag-kind="kanban-card"') => `
  <c2-kanban id="backlog" ${backlogAttributes} aria-label="Backlog" items='${JSON.stringify(items.slice(0, 3))}'>
    <c2-kanban-column column-id="todo" label="To do"></c2-kanban-column>
    <c2-kanban-column column-id="doing" label="In progress"></c2-kanban-column>
  </c2-kanban>
  <div style="height:40px"></div>
  <c2-kanban id="sprint" editable drop-kind="kanban-card" aria-label="Sprint" items='${JSON.stringify([{ id: 's', column: 'todo', title: 'Sierra' }])}'>
    <c2-kanban-column column-id="todo" label="To do"></c2-kanban-column>
    <c2-kanban-column column-id="doing" label="In progress"></c2-kanban-column>
  </c2-kanban>
`
const boardIds = (page: Page, id: string) =>
  page.locator(`#${id}`).evaluate((element) => (element as HTMLElement & { items: { id: string }[] }).items.map((item) => item.id))
const sprintColumn = (page: Page, id: string) => page.locator(`#sprint c2-kanban-column[column-id="${id}"]`)

async function recordMoveOut(page: Page, cancel = false): Promise<void> {
  await page.locator('#backlog').evaluate((element, prevent) => {
    const out: unknown[] = []
    ;(window as Window & { out?: unknown[] }).out = out
    element.addEventListener('item-move-out', (event) => {
      const { removed, target, items } = (event as CustomEvent).detail
      out.push({ removed: removed.map((item: { id: string }) => item.id), target: (target as Element | null)?.id ?? null, left: items.length })
      if (prevent) event.preventDefault()
    })
  }, cancel)
}
const movedOut = (page: Page) => page.evaluate(() => (window as Window & { out?: unknown[] }).out)

test('a pointer drag carried off the board drops the card on the board under the pointer, and it leaves', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await recordMoveOut(page)
  const target = (await sprintColumn(page, 'doing').boundingBox())!
  await dragTo(page, card(page, 'Bravo').first(), target.x + target.width / 2, target.y + target.height - 10)
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['a', 'c'])
  await expect.poll(() => boardIds(page, 'sprint')).toEqual(['s', 'b'])
  expect(await page.locator('#sprint').evaluate((element) => (element as HTMLElement & { items: { id: string; column: string }[] }).items[1].column)).toBe(
    'doing',
  )
  expect(await movedOut(page)).toEqual([{ removed: ['b'], target: 'sprint', left: 2 }])
  await expect(page.locator('#backlog').getByRole('status')).toHaveText('Bravo moved off the board.')
  await expect(page.locator('#sprint').getByRole('status')).toHaveText('1 item added')
})

test('the board under a card carried off its own lights up, and a drop on no board returns the card', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const source = (await card(page, 'Bravo').first().boundingBox())!
  const target = (await sprintColumn(page, 'todo').boundingBox())!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await expect(page.locator('#sprint').locator('.board--drop-target')).toHaveCount(1)
  // Off every board: nothing takes it.
  await page.mouse.move(target.x + target.width / 2, target.y + target.height + 300, { steps: 6 })
  await expect(page.locator('#sprint').locator('.board--drop-target')).toHaveCount(0)
  await page.mouse.up()
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['a', 'b', 'c'])
  expect(await boardIds(page, 'sprint')).toEqual(['s'])
})

test('without drag-kind a card carried off the board returns', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards('editable'))
  await expect(page.locator('#backlog [part="drag-handle"]')).toHaveCount(0)
  const target = (await sprintColumn(page, 'doing').boundingBox())!
  await dragTo(page, card(page, 'Bravo').first(), target.x + target.width / 2, target.y + target.height - 10)
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['a', 'b', 'c'])
  expect(await boardIds(page, 'sprint')).toEqual(['s'])
})

test('moveItemTo moves a card to the end of its column on another board, the keyboard path', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await recordMoveOut(page)
  const moved = await page
    .locator('#backlog')
    .evaluate((element) => (element as HTMLElement & { moveItemTo(target: Element, key: string): boolean }).moveItemTo(document.getElementById('sprint')!, 'c'))
  expect(moved).toBe(true)
  expect(await boardIds(page, 'backlog')).toEqual(['a', 'b'])
  expect(
    await page
      .locator('#sprint')
      .evaluate((element) => (element as HTMLElement & { items: { id: string; column: string }[] }).items.map((item) => `${item.id}:${item.column}`)),
  ).toEqual(['s:todo', 'c:doing'])
  expect(await movedOut(page)).toEqual([{ removed: ['c'], target: 'sprint', left: 2 }])
  // A target that takes no such card, or a card the target already holds, moves nothing.
  const refused = await page.locator('#backlog').evaluate((element) => {
    const board = element as HTMLElement & { moveItemTo(target: Element, key: string): boolean }
    return [board.moveItemTo(document.body, 'a'), board.moveItemTo(document.getElementById('backlog')!, 'a')]
  })
  expect(refused).toEqual([false, false])
})

test('cancelling item-move-out keeps the card, which makes the move a copy', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await recordMoveOut(page, true)
  await page
    .locator('#backlog')
    .evaluate((element) => (element as HTMLElement & { moveItemTo(target: Element, key: string): boolean }).moveItemTo(document.getElementById('sprint')!, 'a'))
  expect(await boardIds(page, 'backlog')).toEqual(['a', 'b', 'c'])
  expect(await boardIds(page, 'sprint')).toEqual(['s', 'a'])
})

test("a card's drag handle carries it to another board as a browser drag, and it leaves", async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await recordMoveOut(page)
  const handle = card(page, 'Alpha').first().locator('[part="drag-handle"]')
  await expect(handle).toHaveAttribute('draggable', 'true')
  await handle.dragTo(sprintColumn(page, 'doing'))
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['b', 'c'])
  await expect.poll(() => boardIds(page, 'sprint')).toEqual(['s', 'a'])
  expect(await movedOut(page)).toEqual([{ removed: ['a'], target: 'sprint', left: 2 }])
})

test('a drag handle dropped back on its own board moves the card there, lighting nothing and leaving nothing', async ({ page, renderScenario }) => {
  await renderScenario(`${twoBoards().replace('editable drag-kind="kanban-card"', 'editable drag-kind="kanban-card" drop-kind="kanban-card"')}`)
  await recordMoveOut(page)
  const handle = card(page, 'Alpha').first().locator('[part="drag-handle"]')
  await handle.dragTo(column(page, 'doing').first())
  await expect
    .poll(() =>
      page
        .locator('#backlog')
        .evaluate((element) => (element as HTMLElement & { items: { id: string; column: string }[] }).items.find((item) => item.id === 'a')?.column),
    )
    .toBe('doing')
  expect(await boardIds(page, 'backlog')).toHaveLength(3)
  expect(await movedOut(page)).toEqual([])
  await expect(page.locator('#backlog').locator('.board--drop-target, .board--drop-refused')).toHaveCount(0)
  // The drag is over with the drop, though the card's handle was redrawn away before its `dragend`.
  expect(await page.evaluate(() => (globalThis as unknown as Record<symbol, { drag: unknown }>)[Symbol.for('c2n.item-drag')].drag)).toBeNull()
})

test('moveItemTo leaves a drag in flight elsewhere in the page alone', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const kept = await page.locator('#backlog').evaluate((element) => {
    const registry = (globalThis as unknown as Record<symbol, { drag: unknown }>)[Symbol.for('c2n.item-drag')]
    const other = { kind: 'other', items: [], source: document.body }
    registry.drag = other
    ;(element as HTMLElement & { moveItemTo(target: Element, key: string): boolean }).moveItemTo(document.getElementById('sprint')!, 'a')
    return registry.drag === other
  })
  expect(kept).toBe(true)
})

test('a drag handle dropped on a drop area outside c2n leaves the card where it was: that area took a copy', async ({ page, renderScenario }) => {
  await renderScenario(`${twoBoards()}<div id="foreign" style="height:120px">Drop here</div>`)
  await recordMoveOut(page)
  await page.locator('#foreign').evaluate((element) => {
    ;(window as Window & { dropped?: string }).dropped = ''
    element.addEventListener('dragover', (event) => event.preventDefault())
    element.addEventListener('drop', (event) => {
      event.preventDefault()
      ;(window as Window & { dropped?: string }).dropped = (event as DragEvent).dataTransfer?.getData('text/plain') ?? ''
    })
  })
  await card(page, 'Alpha').first().locator('[part="drag-handle"]').dragTo(page.locator('#foreign'))
  await expect.poll(() => page.evaluate(() => (window as Window & { dropped?: string }).dropped)).toContain('Alpha')
  expect(await boardIds(page, 'backlog')).toEqual(['a', 'b', 'c'])
  expect(await movedOut(page)).toEqual([])
})

test('a board drawn within the drop margin of the source takes a card carried onto its near edge', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards().replace('height:40px', 'height:8px'))
  const target = (await page.locator('#sprint').boundingBox())!
  // The boards are 8px apart, inside the margin that still counts as a drop on the source board.
  await dragTo(page, card(page, 'Bravo').first(), target.x + target.width / 4, target.y + 4)
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['a', 'c'])
  expect(await boardIds(page, 'sprint')).toEqual(['s', 'b'])
})

test('a target that stops taking cards before the release takes nothing, and the card stays', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const source = (await card(page, 'Bravo').first().boundingBox())!
  const target = (await sprintColumn(page, 'todo').boundingBox())!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await expect(page.locator('#sprint').locator('.board--drop-target')).toHaveCount(1)
  await page.locator('#sprint').evaluate((element) => element.setAttribute('drop-kind', 'other'))
  await page.mouse.up()
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['a', 'b', 'c'])
  expect(await boardIds(page, 'sprint')).toEqual(['s'])
})

test('a drag handle whose dragstart another listener cancels leaves no drag behind', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await page.evaluate(() => document.addEventListener('dragstart', (event) => event.preventDefault()))
  const handle = card(page, 'Alpha').first().locator('[part="drag-handle"]')
  await handle.evaluate((element) =>
    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() })),
  )
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as Record<symbol, { drag: unknown }>)[Symbol.for('c2n.item-drag')]?.drag ?? null))
    .toBeNull()
})

test('a board does not refuse a drag of its own card under another kind, and the dragged card keeps its grip', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards().replace('editable drag-kind="kanban-card"', 'editable drag-kind="kanban-card" drop-kind="note"'))
  // Pointer drag: the card following the pointer is drawn with its handle, like the one it stands for.
  const source = (await card(page, 'Bravo').first().boundingBox())!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + source.width / 2 + 30, source.y + source.height / 2 + 30, { steps: 6 })
  await expect(page.locator('#backlog .card--dragging [part="drag-handle"]')).toHaveCount(1)
  await page.mouse.up()
  // Handle drag over its own board: no refused outline.
  const handle = card(page, 'Alpha').first().locator('[part="drag-handle"]')
  const box = (await handle.boundingBox())!
  const over = (await column(page, 'doing').first().boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(over.x + over.width / 2, over.y + over.height / 2, { steps: 8 })
  await expect(page.locator('#backlog').locator('.board--drop-refused')).toHaveCount(0)
  await page.mouse.up()
})

test('a handle drag whose dragend never reaches the board ends at the next pointer press', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const handle = card(page, 'Alpha').first().locator('[part="drag-handle"]')
  await handle.evaluate((element) =>
    element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() })),
  )
  const drag = () => page.evaluate(() => (globalThis as unknown as Record<symbol, { drag: unknown }>)[Symbol.for('c2n.item-drag')]?.drag ?? null)
  await page.waitForTimeout(50)
  expect(await drag()).not.toBeNull()
  await page.mouse.click(5, 5)
  expect(await drag()).toBeNull()
})

test('a handle drag whose dragend is lost still moves a card another board took, unless the board turned read-only', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await recordMoveOut(page)
  const start = (key: string) =>
    card(page, key)
      .first()
      .locator('[part="drag-handle"]')
      .evaluate((element) => {
        element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() }))
        // What a c2n zone that took the drop records.
        const registry = (globalThis as unknown as Record<symbol, { drag: { target?: Element } | null }>)[Symbol.for('c2n.item-drag')]
        registry.drag!.target = document.getElementById('sprint')!
      })
  await start('Alpha')
  await page.mouse.click(5, 5)
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['b', 'c'])
  // Read-only by the time the drag ends: the card stays, the move is a copy.
  await start('Bravo')
  await page.locator('#backlog').evaluate((element) => ((element as HTMLElement & { editable: boolean }).editable = false))
  await page.mouse.click(5, 5)
  expect(await boardIds(page, 'backlog')).toEqual(['b', 'c'])
})

test('a board nested in a card drags its own cards by their handles', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await page.locator('#backlog').evaluate((element) => {
    const inner = document.createElement('c2-kanban') as HTMLElement & { items: unknown[] }
    inner.id = 'inner'
    inner.setAttribute('editable', '')
    inner.setAttribute('drag-kind', 'kanban-card')
    inner.setAttribute('aria-label', 'Inner')
    inner.innerHTML = '<c2-kanban-column column-id="todo" label="Inner"></c2-kanban-column>'
    // The same key as a card of the outer board.
    inner.items = [{ id: 'a', column: 'todo', title: 'Inner card' }]
    const board = element as HTMLElement & { renderItem: (context: { item: { id: string; title: string } }) => unknown }
    board.renderItem = ({ item }) => (item.id === 'b' ? inner : item.title)
  })
  const grip = page.locator('#inner').locator('[part="drag-handle"]').first()
  await expect(grip).toHaveCount(1)
  const started = await grip.evaluate((element) => {
    const event = new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() })
    element.dispatchEvent(event)
    const registry = (globalThis as unknown as Record<symbol, { drag: { source: Element } | null }>)[Symbol.for('c2n.item-drag')]
    return { cancelled: event.defaultPrevented, source: registry.drag?.source.id }
  })
  expect(started).toEqual({ cancelled: false, source: 'inner' })
})

test('a command in a card that moves it away hands focus to its neighbour in the column', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await page.locator('#backlog').evaluate((element) => {
    const board = element as HTMLElement & {
      renderItem: (context: { item: { id: string; title: string } }) => unknown
      moveItemTo(target: Element, key: string): boolean
    }
    // One button per card across renders, as a template would keep it.
    const buttons = new Map<string, HTMLButtonElement>()
    board.renderItem = ({ item }) => {
      let button = buttons.get(item.id)
      if (!button) {
        button = document.createElement('button')
        button.textContent = `Move ${item.title}`
        button.addEventListener('click', () => board.moveItemTo(document.getElementById('sprint')!, item.id))
        buttons.set(item.id, button)
      }
      return button
    }
  })
  const first = page.locator('#backlog').getByRole('button', { name: 'Move Alpha' })
  await first.focus()
  // The command runs with focus in the card (a key the board itself does not take, or a click from a menu).
  await first.evaluate((button) => (button as HTMLButtonElement).click())
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['b', 'c'])
  await expect.poll(() => page.locator('#backlog').evaluate((element) => element.matches(':focus-within'))).toBe(true)
})

test('a zone drawn over the board takes a card dropped on it', async ({ page, renderScenario }) => {
  await renderScenario(`${twoBoards()}<div id="drawer" style="position:fixed;top:0;right:0;width:160px;height:100vh;background:#eee"></div>`)
  await page.evaluate(() => {
    const registry = (globalThis as unknown as Record<symbol, { targets: Set<unknown> }>)[Symbol.for('c2n.item-drag')]
    ;(window as Window & { taken?: unknown[] }).taken = []
    registry.targets.add({
      host: document.getElementById('drawer'),
      accepts: (drag: { kind: string }) => drag.kind === 'kanban-card',
      hover: () => {},
      take: (drag: { items: unknown[] }) => (window as Window & { taken?: unknown[] }).taken!.push(...drag.items),
    })
  })
  const board = (await page.locator('#backlog').boundingBox())!
  const drawer = (await page.locator('#drawer').boundingBox())!
  expect(drawer.x).toBeLessThan(board.x + board.width)
  await dragTo(page, card(page, 'Bravo').first(), drawer.x + 40, board.y + 40)
  await expect.poll(() => boardIds(page, 'backlog')).toEqual(['a', 'c'])
  expect(await page.evaluate(() => (window as Window & { taken?: { id: string }[] }).taken!.map((item) => item.id))).toEqual(['b'])
})

test('the target of a move names the kind in its own spelling', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards().replace('editable drag-kind="kanban-card"', 'editable drag-kind="KANBAN-CARD"'))
  await page
    .locator('#sprint')
    .evaluate((element) => element.addEventListener('item-drop', (event) => ((window as Window & { kind?: string }).kind = (event as CustomEvent).detail.kind)))
  await page
    .locator('#backlog')
    .evaluate((element) => (element as HTMLElement & { moveItemTo(target: Element, key: string): boolean }).moveItemTo(document.getElementById('sprint')!, 'a'))
  expect(await page.evaluate(() => (window as Window & { kind?: string }).kind)).toBe('kanban-card')
})

test('a keyless card moved by its handle leaves even when items were replaced mid-drag', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards().replace('editable drag-kind="kanban-card"', 'editable drag-kind="kanban-card" item-key="ref"'))
  await card(page, 'Alpha')
    .first()
    .locator('[part="drag-handle"]')
    .evaluate((element) => {
      element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() }))
      const registry = (globalThis as unknown as Record<symbol, { drag: { target?: Element } | null }>)[Symbol.for('c2n.item-drag')]
      registry.drag!.target = document.getElementById('sprint')!
      // An immutable update while the browser carries the card: the same cards, new objects.
      const board = document.getElementById('backlog') as HTMLElement & { items: object[] }
      board.items = board.items.map((item) => ({ ...item }))
    })
  await page.mouse.click(5, 5)
  await expect
    .poll(() => page.locator('#backlog').evaluate((element) => (element as HTMLElement & { items: { title: string }[] }).items.map((item) => item.title)))
    .toEqual(['Bravo', 'Charlie'])
})

test('moveItemTo says the card moved when the application already took it out of the source while the target added it', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const moved = await page.evaluate(() => {
    type Board = HTMLElement & { items: { id: string }[]; moveItemTo(target: Element, key: string): boolean }
    const backlog = document.getElementById('backlog') as Board
    document.getElementById('sprint')!.addEventListener('item-drop', () => (backlog.items = backlog.items.filter((item) => item.id !== 'c')))
    return backlog.moveItemTo(document.getElementById('sprint')!, 'c')
  })
  expect(moved).toBe(true)
  expect(await boardIds(page, 'backlog')).toEqual(['a', 'b'])
  expect(await boardIds(page, 'sprint')).toEqual(['s', 'c'])
})

test('of two keyless cards alike, neither leaves when items were replaced mid-drag: the move becomes a copy', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards().replace('editable drag-kind="kanban-card"', 'editable drag-kind="kanban-card" item-key="ref"'))
  await page.locator('#backlog').evaluate((element) => {
    const board = element as HTMLElement & { items: object[] }
    board.items = [
      { id: 'x', column: 'todo', title: 'Same' },
      { id: 'x', column: 'todo', title: 'Same' },
    ]
  })
  await card(page, 'Same')
    .nth(1)
    .locator('[part="drag-handle"]')
    .evaluate((element) => {
      element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() }))
      const registry = (globalThis as unknown as Record<symbol, { drag: { target?: Element } | null }>)[Symbol.for('c2n.item-drag')]
      registry.drag!.target = document.getElementById('sprint')!
      const board = document.getElementById('backlog') as HTMLElement & { items: object[] }
      board.items = board.items.map((item) => ({ ...item }))
    })
  await page.mouse.click(5, 5)
  await page.waitForTimeout(100)
  expect(await page.locator('#backlog').evaluate((element) => (element as HTMLElement & { items: unknown[] }).items.length)).toBe(2)
})

test('a second finger does not end a handle drag, a board moved mid-drag keeps it, and one removed ends it', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const states = await card(page, 'Alpha')
    .first()
    .locator('[part="drag-handle"]')
    .evaluate(async (element) => {
      const registry = (globalThis as unknown as Record<symbol, { drag: unknown }>)[Symbol.for('c2n.item-drag')]
      element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() }))
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: false, pointerType: 'touch' }))
      const afterSecondFinger = registry.drag !== null
      const board = document.getElementById('backlog')!
      const parent = board.parentElement!
      // Moved within the page (taken out and put back in one task): still the same drag.
      board.remove()
      parent.prepend(board)
      await new Promise((resolve) => setTimeout(resolve, 20))
      const afterMove = registry.drag !== null
      board.remove()
      await new Promise((resolve) => setTimeout(resolve, 20))
      return [afterSecondFinger, afterMove, registry.drag !== null]
    })
  expect(states).toEqual([true, true, false])
})

test('a keyless card edited mid-drag stays on its board: the move becomes a copy', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards().replace('editable drag-kind="kanban-card"', 'editable drag-kind="kanban-card" item-key="ref"'))
  await card(page, 'Alpha')
    .first()
    .locator('[part="drag-handle"]')
    .evaluate((element) => {
      element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() }))
      const registry = (globalThis as unknown as Record<symbol, { drag: { target?: Element } | null }>)[Symbol.for('c2n.item-drag')]
      registry.drag!.target = document.getElementById('sprint')!
      const board = document.getElementById('backlog') as HTMLElement & { items: { title: string }[] }
      board.items = board.items.map((item) => ({ ...item, title: `${item.title}!` }))
    })
  await page.mouse.click(5, 5)
  await page.waitForTimeout(100)
  expect(
    await page.locator('#backlog').evaluate((element) => (element as HTMLElement & { items: { title: string }[] }).items.map((item) => item.title)),
  ).toEqual(['Alpha!', 'Bravo!', 'Charlie!'])
  await expect(page.locator('#backlog').getByRole('status')).not.toHaveText(/moved/i)
})

test('a drop of the same kind from elsewhere is not a handle drag whose dragend was lost: its card stays', async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  await page.evaluate(() => {
    const backlog = document.getElementById('backlog')!
    const handle = [...backlog.querySelectorAll('c2-kanban-column')].flatMap((column) => [...column.shadowRoot!.querySelectorAll('[part="drag-handle"]')])[0]
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() }))
    // No dragend, no press: then a card of the same kind comes in from another window.
    const foreign = new DataTransfer()
    foreign.setData('application/x-c2n-kanban-card+json', JSON.stringify([{ id: 'w', column: 'todo', title: 'Whiskey' }]))
    const box = document.getElementById('sprint')!.getBoundingClientRect()
    const [x, y] = [box.x + 40, box.y + box.height / 2]
    const over = document.elementFromPoint(x, y)!
    for (const kind of ['dragenter', 'dragover', 'drop'])
      over.dispatchEvent(new DragEvent(kind, { dataTransfer: foreign, bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y }))
  })
  await expect.poll(() => boardIds(page, 'sprint')).toContain('w')
  await page.mouse.click(5, 5)
  await page.waitForTimeout(100)
  expect(await boardIds(page, 'backlog')).toEqual(['a', 'b', 'c'])
})

test("a finger on a card's grip starts the board's own drag, as a mouse on the card does", async ({ page, renderScenario }) => {
  await renderScenario(twoBoards())
  const armed = await card(page, 'Alpha')
    .first()
    .locator('[part="drag-handle"]')
    .evaluate((handle) => {
      const box = handle.getBoundingClientRect()
      const init = { bubbles: true, composed: true, cancelable: true, isPrimary: true, pointerId: 7, button: 0, clientX: box.x + 4, clientY: box.y + 4 }
      const board = document.getElementById('backlog') as HTMLElement & { session?: { phase: string } | null }
      handle.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'mouse' }))
      const byMouse = board.session?.phase ?? null
      board.dispatchEvent(new PointerEvent('pointercancel', { ...init, pointerType: 'mouse' }))
      handle.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'touch' }))
      const byFinger = board.session?.phase ?? null
      board.dispatchEvent(new PointerEvent('pointercancel', { ...init, pointerType: 'touch' }))
      handle.dispatchEvent(new PointerEvent('pointerdown', { ...init, pointerType: 'pen' }))
      return [byMouse, byFinger, board.session?.phase ?? null]
    })
  // The mouse keeps the browser's drag on the grip; a finger or a pen gets the board's.
  expect(armed).toEqual([null, 'armed', 'armed'])
})
