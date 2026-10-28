import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Book = HTMLElement & { applyDelta(delta: { bids?: [number, number][]; asks?: [number, number][] }): void; group: number; lastPrice?: number }

const BOOK = `bids='[[100.5, 1], [100, 2], [99.5, 0.5]]' asks='[["101", "1.5"], {"price": 101.5, "size": 1}, [102, 3]]'`

const book = (page: Page) => page.locator('c2-order-book')

/** Each drawn row's cells, top to bottom, with its side. */
const rows = (page: Page) =>
  book(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.row')].map((row) => [
      row.classList.contains('row--bid') ? 'bid' : 'ask',
      ...[...row.querySelectorAll('[role=rowheader], [role=cell]')].map((cell) => cell.textContent!.trim()),
    ]),
  )

test('stacks the asks over the bids, best prices at the spread, with cumulative totals and depth bars', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-order-book ${BOOK} base="BTC" quote="USD" size-precision="2"></c2-order-book>`)
  expect(await rows(page)).toEqual([
    ['ask', '102.0', '3.00', '5.50'],
    ['ask', '101.5', '1.00', '2.50'],
    ['ask', '101.0', '1.50', '1.50'],
    ['bid', '100.5', '1.00', '1.00'],
    ['bid', '100.0', '2.00', '3.00'],
    ['bid', '99.5', '0.50', '3.50'],
  ])
  await expect(book(page)).toHaveHostAria('role', 'region')
  await expect(book(page)).toHaveHostAria('aria-label', 'Order book')
  await expect(book(page).getByRole('table', { name: 'Asks' }).getByRole('columnheader')).toHaveText(['Price (USD)', 'Size (BTC)', 'Total'])
  await expect(book(page).getByRole('table', { name: 'Bids' })).toBeAttached()
  await expect(book(page).locator('.spread')).toHaveText(/Mid price\s*100\.75\s*Spread 0\.5 \(0\.496%\)/)
  // The deepest level drawn fills its row; the others are a share of it.
  const depth = await book(page).evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll<HTMLElement>('.row')].map((row) => row.style.getPropertyValue('--_depth')),
  )
  expect(depth).toEqual(['1.0000', '0.4545', '0.2727', '0.1818', '0.5455', '0.6364'])
  await accessible(page)
})

test('applyDelta sets and removes levels, and flashes the ones that changed', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-order-book ${BOOK} size-precision="1"></c2-order-book>`)
  await book(page).evaluate(async (element: Book) => {
    element.applyDelta({ bids: [[100, 5]], asks: [[102, 0]] })
    element.applyDelta({ bids: [[99, 1]], asks: [[101, 0.5]] })
    await (element as unknown as { updateComplete: Promise<boolean> }).updateComplete
  })
  expect(await rows(page)).toEqual([
    ['ask', '101.5', '1.0', '1.5'],
    ['ask', '101.0', '0.5', '0.5'],
    ['bid', '100.5', '1.0', '1.0'],
    ['bid', '100.0', '5.0', '6.0'],
    ['bid', '99.5', '0.5', '6.5'],
    ['bid', '99.0', '1.0', '7.5'],
  ])
  await expect(book(page).locator('.row[data-key="bid:100"]')).toHaveClass(/flash-up-1/)
  await expect(book(page).locator('.row[data-key="ask:101"]')).toHaveClass(/flash-down-1/)
  await expect(book(page).locator('.row[data-key="bid:100.5"]')).not.toHaveClass(/flash/)
  // A second change to the same level switches the animation's name, so it plays again.
  await book(page).evaluate((element: Book) => element.applyDelta({ bids: [[100, 4]] }))
  await expect(book(page).locator('.row[data-key="bid:100"]')).toHaveClass(/flash-down-0/)
})

test('picking a price step merges levels: bids round down, asks round up', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-order-book ${BOOK} groups="0.5;1;5" group="0.5" size-precision="1"></c2-order-book>`)
  const changes = await page.evaluate(() => {
    const seen: number[] = []
    document.querySelector('c2-order-book')!.addEventListener('group-change', (event) => seen.push((event as CustomEvent<{ group: number }>).detail.group))
    ;(window as unknown as { seen: number[] }).seen = seen
    return seen.length
  })
  expect(changes).toBe(0)
  await book(page).getByRole('button', { name: 'Price grouping' }).click()
  await book(page).locator('c2-list-item', { hasText: '1' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: number[] }).seen)).toEqual([1])
  expect(await rows(page)).toEqual([
    ['ask', '102', '4.0', '5.5'],
    ['ask', '101', '1.5', '1.5'],
    ['bid', '100', '3.0', '3.0'],
    ['bid', '99', '0.5', '3.5'],
  ])
  // Regrouping is not trading: nothing flashes.
  await expect(book(page).locator('.row[class*=flash]')).toHaveCount(0)
})

test('one tab stop for the rows; arrows move, Enter and a click pick a price without bubbling', async ({ page, renderScenario }) => {
  await renderScenario(`<button>before</button><c2-order-book ${BOOK}></c2-order-book><button>after</button>`)
  await page.evaluate(() => {
    const picks: unknown[] = []
    ;(window as unknown as { picks: unknown[] }).picks = picks
    document.querySelector('c2-order-book')!.addEventListener('price-select', (event) => picks.push((event as CustomEvent).detail))
    document.querySelector('main')!.addEventListener('price-select', () => picks.push('bubbled'))
  })
  await page.getByRole('button', { name: 'before' }).focus()
  await page.keyboard.press('Tab')
  await expect(book(page).locator('.row[data-key="ask:102"]')).toBeFocused()
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowDown')
  await expect(book(page).locator('.row[data-key="bid:100.5"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await book(page).locator('.row[data-key="ask:101.5"]').click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'after' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  // The tab stop stays on the last row used.
  await expect(book(page).locator('.row[data-key="ask:101.5"]')).toBeFocused()
  expect(await page.evaluate(() => (window as unknown as { picks: unknown[] }).picks)).toEqual([
    { side: 'bid', price: 100.5, size: 1, total: 1 },
    { side: 'ask', price: 101.5, size: 1, total: 2.5 },
  ])
})

test('side by side: bids end on their price; own orders are dotted; the last price points up or down', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-order-book ${BOOK} layout="split" base="BTC" own-prices="100;101.5" last-price="100.8" size-precision="1"></c2-order-book>`)
  await expect(book(page).getByRole('table', { name: 'Bids' }).getByRole('columnheader')).toHaveText(['Total', 'Size (BTC)', 'Bid'])
  await expect(book(page).getByRole('table', { name: 'Asks' }).getByRole('columnheader')).toHaveText(['Ask', 'Size (BTC)', 'Total'])
  // Cells in reading order: the bid's price is its last column.
  expect((await rows(page))[0]).toEqual(['bid', '1.0', '1.0', '100.5'])
  await expect(book(page).getByRole('rowheader', { name: /^100\.0\s*, your order$/ })).toBeVisible()
  await expect(book(page).getByRole('rowheader', { name: /^101\.5\s*, your order$/ })).toBeVisible()
  await expect(book(page).locator('.spread__price')).toHaveText(/Last price\s*100\.8$/)
  await book(page).evaluate((element: Book) => (element.lastPrice = 100.6))
  await expect(book(page).locator('.spread__price')).toHaveText(/100\.6\s*↓/)
  await expect(book(page).locator('.spread__price')).toHaveClass(/spread__price--down/)
  await book(page).evaluate((element: Book) => (element.lastPrice = 101))
  await expect(book(page).locator('.spread__price')).toHaveText(/101\.0\s*↑/)
  await accessible(page)
})

test('an empty book says it is waiting or empty; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-order-book loading></c2-order-book><div lang="fr"><c2-order-book id="fr" loading></c2-order-book></div>`)
  await expect(book(page).first().getByRole('status')).toHaveText('Waiting for the book…')
  await expect(page.locator('#fr').getByRole('status')).toHaveText('En attente du carnet…')
  await expect(page.locator('#fr')).toHaveHostAria('aria-label', 'Carnet d’ordres')
  await expect(book(page).first().locator('c2-spinner')).toBeVisible()
  await book(page)
    .first()
    .evaluate((element: HTMLElement & { loading: boolean }) => (element.loading = false))
  await expect(book(page).first().getByRole('status')).toHaveText('No orders')
  await expect(book(page).first().locator('c2-spinner')).toHaveCount(0)
  await accessible(page)
})

test('deltas sent in the same task as a snapshot land on it; a removed last price is the mid again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-order-book last-price="100.8" size-precision="1"></c2-order-book>`)
  await book(page).evaluate(async (element: Book & { bids: unknown; asks: unknown; updateComplete: Promise<boolean> }) => {
    element.bids = [[100, 1]]
    element.asks = [[101, 1]]
    element.applyDelta({ bids: [[99, 2]], asks: [[101, 3]] })
    await element.updateComplete
  })
  expect(await rows(page)).toEqual([
    ['ask', '101', '3.0', '3.0'],
    ['bid', '100', '1.0', '1.0'],
    ['bid', '99', '2.0', '3.0'],
  ])
  await book(page).evaluate((element: HTMLElement) => element.removeAttribute('last-price'))
  await expect(book(page).locator('.spread__price')).toHaveText(/^Mid price\s*100\.5$/)
  await expect(book(page).locator('.spread__price')).not.toHaveClass(/spread__price--/)
})
