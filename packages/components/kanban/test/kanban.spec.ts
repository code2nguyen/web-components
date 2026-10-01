import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const board = (editable = true) => `
  <c2-kanban ${editable ? 'editable' : ''} aria-label="Sprint board">
    <c2-kanban-column column-id="todo" label="To do"></c2-kanban-column>
    <c2-kanban-column column-id="doing" label="In progress" limit="1"></c2-kanban-column>
    <c2-kanban-column column-id="done" label="Done"><span slot="empty">Nothing shipped yet</span></c2-kanban-column>
    <div class="task" id="a" data-column="todo" data-kanban-key="A">Alpha</div>
    <div class="task" id="b" data-column="todo" data-kanban-key="B">Bravo <button type="button">Open</button></div>
    <div class="task" id="c" data-column="doing" data-kanban-key="C">Charlie</div>
    <div class="task" id="orphan" data-column="nowhere">Orphan</div>
  </c2-kanban>
`

/** Card ids per column, in the order the board shows them. */
async function layout(host: Locator): Promise<Record<string, string[]>> {
  return host.evaluate((element) => {
    const result: Record<string, string[]> = {}
    for (const column of element.shadowRoot!.querySelectorAll<HTMLElement>('.column')) {
      result[column.dataset.columnId!] = [...column.querySelectorAll<HTMLElement>('.cards .card')].map(
        (wrapper) => (wrapper.querySelector('slot') as HTMLSlotElement).assignedElements()[0]?.id ?? '',
      )
    }
    return result
  })
}

async function recordMoves(host: Locator): Promise<void> {
  await host.evaluate((element) => {
    const moves: unknown[] = []
    ;(window as Window & { moves?: unknown[] }).moves = moves
    element.addEventListener('card-move', (event) => {
      const { card, ...rest } = (event as CustomEvent).detail
      moves.push({ ...rest, card: card.id })
    })
  })
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

test('places cards in their columns and shows counts, limits and empty hints', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  expect(await layout(host)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] })
  await expect(page.locator('#orphan')).toBeHidden()
  await expect(page.locator('c2-kanban-column[column-id="todo"]').locator('[part="count"]')).toHaveText('2')
  await expect(page.locator('c2-kanban-column[column-id="doing"]').locator('[part="count"]')).toHaveText('1 / 1')
  await expect(page.getByText('Nothing shipped yet')).toBeVisible()
  await expect(page.locator('c2-kanban-column[column-id="todo"]').locator('[part="empty"]')).toBeHidden()
  await expect(host.getByRole('list', { name: 'To do' })).toBeVisible()
  await accessible(page)
})

test('drags a card into another column', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host)
  const done = await host.locator('.column[data-column-id="done"] .cards').boundingBox()
  await dragTo(page, page.locator('#a'), done!.x + done!.width / 2, done!.y + 10)
  expect(await layout(host)).toEqual({ todo: ['b'], doing: ['c'], done: ['a'] })
  expect(await moves(page)).toEqual([{ key: 'A', card: 'a', fromColumn: 'todo', toColumn: 'done', fromIndex: 0, toIndex: 0, inputMethod: 'mouse' }])
  await expect(page.getByText('Nothing shipped yet')).toBeHidden()
  await expect(host.locator('[part="placeholder"]')).toHaveCount(0)
})

test('drags a card within its column', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host)
  const bravo = await page.locator('#b').boundingBox()
  await dragTo(page, page.locator('#a'), bravo!.x + bravo!.width / 2, bravo!.y + bravo!.height - 2)
  expect(await layout(host)).toEqual({ todo: ['b', 'a'], doing: ['c'], done: [] })
  expect(await moves(page)).toMatchObject([{ fromColumn: 'todo', toColumn: 'todo', fromIndex: 0, toIndex: 1 }])
})

test('accepts a drop past the column limit and marks the column', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  const doing = await host.locator('.column[data-column-id="doing"] .cards').boundingBox()
  await dragTo(page, page.locator('#a'), doing!.x + doing!.width / 2, doing!.y + doing!.height + 20)
  expect(await layout(host)).toEqual({ todo: ['b'], doing: ['c', 'a'], done: [] })
  await expect(page.locator('c2-kanban-column[column-id="doing"]').locator('[part="count"]')).toHaveText('2 / 1')
  await expect(host.locator('.column[data-column-id="doing"]')).toHaveClass(/column--over/)
})

test('Escape cancels a pointer drag', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host)
  const source = await page.locator('#a').boundingBox()
  const done = await host.locator('.column[data-column-id="done"]').boundingBox()
  await page.mouse.move(source!.x + 10, source!.y + 10)
  await page.mouse.down()
  await page.mouse.move(done!.x + 20, done!.y + 40, { steps: 10 })
  await expect(host.locator('[part="placeholder"]')).toHaveCount(1)
  await expect(host.locator('.column[data-column-id="done"]')).toHaveClass(/column--target/)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  expect(await layout(host)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] })
  expect(await moves(page)).toEqual([])
})

test('a press on a control inside a card does not start a drag', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  const done = await host.locator('.column[data-column-id="done"]').boundingBox()
  await dragTo(page, page.getByRole('button', { name: 'Open' }), done!.x + 20, done!.y + 40)
  expect(await layout(host)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] })
})

test('moves a card with the keyboard across columns and within one', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await recordMoves(host)
  await tab()
  await expect(host.locator('.card:focus')).toHaveCount(1)
  await page.keyboard.press('Space')
  await expect(host.getByRole('status')).toContainText('Alpha picked up in To do, position 1 of 2')
  await page.keyboard.press('ArrowRight')
  await expect(host.getByRole('status')).toContainText('moved to In progress, position 1 of 2')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  expect(await layout(host)).toEqual({ todo: ['b'], doing: ['c'], done: ['a'] })
  expect(await moves(page)).toEqual([])
  await page.keyboard.press('Space')
  await expect(host.getByRole('status')).toContainText('Alpha dropped in Done, position 1 of 1')
  expect(await moves(page)).toEqual([{ key: 'A', card: 'a', fromColumn: 'todo', toColumn: 'done', fromIndex: 0, toIndex: 0, inputMethod: 'keyboard' }])
  // Focus stays on the moved card.
  await expect(host.locator('.column[data-column-id="done"] .card')).toBeFocused()
})

test('Escape returns a keyboard-picked card to where it was', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await tab()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  expect(await layout(host)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] })
  await expect(host.getByRole('status')).toContainText('returned to To do, position 1')
  await expect(host.locator('.column[data-column-id="todo"] .card').first()).toBeFocused()
})

test('arrow keys move focus between cards with one tab stop', async ({ page, renderScenario, tab }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await tab()
  await page.keyboard.press('ArrowDown')
  await expect(host.locator('.column[data-column-id="todo"] .card').nth(1)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(host.locator('.column[data-column-id="doing"] .card')).toBeFocused()
  await expect(host.locator('.card[tabindex="0"]')).toHaveCount(1)
})

test('read-only boards do not move cards or add tab stops', async ({ page, renderScenario }) => {
  await renderScenario(board(false))
  const host = page.locator('c2-kanban')
  const done = await host.locator('.column[data-column-id="done"]').boundingBox()
  await dragTo(page, page.locator('#a'), done!.x + 20, done!.y + 40)
  expect(await layout(host)).toEqual({ todo: ['a', 'b'], doing: ['c'], done: [] })
  await expect(host.locator('.card[tabindex]')).toHaveCount(0)
})

test('keeps a user move when the app saves it, and follows the DOM when cards change', async ({ page, renderScenario }) => {
  await renderScenario(board())
  const host = page.locator('c2-kanban')
  await host.evaluate((element) =>
    element.addEventListener('card-move', (event) => ((event as CustomEvent).detail.card.dataset.column = (event as CustomEvent).detail.toColumn)),
  )
  const bravo = await page.locator('#b').boundingBox()
  await dragTo(page, page.locator('#a'), bravo!.x + bravo!.width / 2, bravo!.y + bravo!.height - 2)
  const done = await host.locator('.column[data-column-id="done"] .cards').boundingBox()
  await dragTo(page, page.locator('#c'), done!.x + done!.width / 2, done!.y + 10)
  expect(await layout(host)).toEqual({ todo: ['b', 'a'], doing: [], done: ['c'] })

  await host.evaluate((element) => {
    const card = document.createElement('div')
    card.id = 'd'
    card.className = 'task'
    card.dataset.column = 'doing'
    card.textContent = 'Delta'
    element.append(card)
  })
  await expect.poll(() => layout(host)).toEqual({ todo: ['b', 'a'], doing: ['d'], done: ['c'] })
  await page.locator('#a').evaluate((card) => (card.dataset.column = 'done'))
  // Membership changed, so the board falls back to DOM order.
  await expect.poll(() => layout(host)).toEqual({ todo: ['b'], doing: ['d'], done: ['a', 'c'] })
})
