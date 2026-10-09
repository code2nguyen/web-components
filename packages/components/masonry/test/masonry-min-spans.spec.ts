import { test, expect } from './fixture'
import type { Page } from '@playwright/test'

/** The spans a tile is drawn with: the candidate while an edit is active, the committed layout otherwise. */
function spans(page: Page, id: string) {
  return page.locator('c2-masonry').evaluate((host, itemId) => {
    const tile = host.shadowRoot!.querySelector<HTMLElement>(`.tile[data-item-id="${itemId}"]`)!
    const style = getComputedStyle(tile)
    return { cols: Number(style.gridColumnEnd.replace('span ', '')), rows: Number(style.gridRowEnd.replace('span ', '')) }
  }, id)
}

async function press(page: Page, key: string, times: number): Promise<void> {
  for (let i = 0; i < times; i++) await page.keyboard.press(key)
}

async function startKeyboardResize(page: Page, id: string): Promise<void> {
  await page.locator(`c2-masonry-item[item-id="${id}"]`).locator('[part="resize-handle"]').focus()
  await page.keyboard.press('Enter')
}

async function setWidth(page: Page, width: number, columns: number): Promise<void> {
  await page.locator('.width-control').evaluate((control, value) => ((control as HTMLElement).style.width = `${value}px`), width)
  await expect
    .poll(() =>
      page
        .locator('c2-masonry')
        .evaluate((host) => getComputedStyle(host.shadowRoot!.querySelector<HTMLElement>('[part="grid"]')!).gridTemplateColumns.split(' ').length),
    )
    .toBe(columns)
}

test('keyboard ArrowUp and ArrowLeft stop at min-rows and min-cols', async ({ page, scenario }) => {
  await scenario('min-spans')
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 4, rows: 10 })
  await startKeyboardResize(page, 'tile-1')
  await press(page, 'ArrowUp', 8)
  await press(page, 'ArrowLeft', 4)
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 3, rows: 6 })
  await expect(page.locator('c2-masonry').getByRole('status')).toHaveText('Tile 1: 3 columns, 6 rows. Smallest size reached.')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
  const event = await page.evaluate(() => window.masonryEvents[0])
  const resized = event.layout.items.find((item) => item.id === 'tile-1')!
  expect(resized.rows).toBe(6)
  expect(resized.columns.sm).toBe(3)
  // The snapshot keeps a tile authored below its minimums as it was authored.
  const below = event.layout.items.find((item) => item.id === 'tile-2')!
  expect(below.rows).toBe(3)
  expect(below.columns.sm).toBe(1)
})

test('a keyboard resize can grow a tile again after reaching its minimum', async ({ page, scenario }) => {
  await scenario('min-spans')
  await startKeyboardResize(page, 'tile-1')
  await press(page, 'ArrowUp', 6)
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 4, rows: 7 })
  await expect(page.locator('c2-masonry').getByRole('status')).toHaveText('Tile 1: 4 columns, 7 rows.')
})

test('a pointer resize stops shrinking at min-rows and min-cols while dragging', async ({ page, scenario }) => {
  await scenario('min-spans')
  const corner = page.locator('c2-masonry-item[item-id="tile-1"]').locator('[data-masonry-edge="corner"]')
  const bounds = await corner.boundingBox()
  if (!bounds) throw new Error('Expected resize corner')
  const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 400, start.y - 150, { steps: 8 })
  // The candidate is drawn at the floor while the pointer is still down, never below it.
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 3, rows: 6 })
  await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toBeVisible()
  await page.mouse.move(start.x - 450, start.y - 170, { steps: 2 })
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 3, rows: 6 })
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('1')
  const event = await page.evaluate(() => window.masonryEvents[0])
  expect(event.action).toBe('resize')
  const resized = event.layout.items.find((item) => item.id === 'tile-1')!
  expect(resized.rows).toBe(6)
  expect(resized.columns.sm).toBe(3)
})

for (const edge of ['right', 'bottom'] as const) {
  test(`a pointer resize from the ${edge} border stops at its minimum`, async ({ page, scenario }) => {
    await scenario('min-spans')
    const border = page.locator('c2-masonry-item[item-id="tile-1"]').locator(`[data-masonry-edge="${edge}"]`)
    const bounds = await border.boundingBox()
    if (!bounds) throw new Error(`Expected ${edge} resize border`)
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + (edge === 'right' ? -400 : 0), start.y + (edge === 'bottom' ? -150 : 0), { steps: 8 })
    await expect.poll(() => spans(page, 'tile-1')).toEqual(edge === 'right' ? { cols: 3, rows: 10 } : { cols: 4, rows: 6 })
    await page.mouse.up()
    await expect(page.locator('#changes')).toHaveText('1')
  })
}

test('a tile authored below its minimums keeps its spans and cannot shrink further', async ({ page, scenario }) => {
  await scenario('min-spans')
  await expect.poll(() => spans(page, 'tile-2')).toEqual({ cols: 1, rows: 3 })
  await expect(page.locator('c2-masonry-item[item-id="tile-2"]')).toHaveAttribute('rows', '3')
  await startKeyboardResize(page, 'tile-2')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => spans(page, 'tile-2')).toEqual({ cols: 1, rows: 3 })
  await expect(page.locator('c2-masonry').getByRole('status')).toHaveText('Tile 2: 1 columns, 3 rows. Smallest size reached.')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => spans(page, 'tile-2')).toEqual({ cols: 2, rows: 4 })
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
})

for (const id of ['tile-3', 'tile-4']) {
  test(`invalid min-rows and min-cols on ${id} fall back to 1`, async ({ page, scenario }) => {
    await scenario('min-spans')
    await startKeyboardResize(page, id)
    await press(page, 'ArrowUp', 5)
    await press(page, 'ArrowLeft', 3)
    await expect.poll(() => spans(page, id)).toEqual({ cols: 1, rows: 1 })
    await page.keyboard.press('Enter')
    const event = await page.evaluate(() => window.masonryEvents[0])
    const item = event.layout.items.find((entry) => entry.id === id)!
    expect(item.rows).toBe(1)
    expect(item.columns.sm).toBe(1)
  })
}

test('min-cols is capped by each range column count', async ({ page, scenario }) => {
  await scenario('min-spans')
  // sm: 6 columns. min-cols="20" holds a full-width tile at 6 without growing it; rows still shrink to 1.
  await startKeyboardResize(page, 'tile-5')
  await page.keyboard.press('ArrowLeft')
  await press(page, 'ArrowUp', 5)
  await expect.poll(() => spans(page, 'tile-5')).toEqual({ cols: 6, rows: 1 })
  await page.keyboard.press('Escape')

  // md: 9 columns.
  await setWidth(page, 1100, 9)
  await startKeyboardResize(page, 'tile-5')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => spans(page, 'tile-5')).toEqual({ cols: 9, rows: 4 })
  await page.keyboard.press('Escape')

  // xs: 1 column, so every minimum is 1: min-cols="3" neither widens tile-1 nor blocks its row resize.
  await setWidth(page, 500, 1)
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 1, rows: 10 })
  await startKeyboardResize(page, 'tile-1')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 1, rows: 11 })
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
  const event = await page.evaluate(() => window.masonryEvents[0])
  expect(event.layout.items.find((entry) => entry.id === 'tile-1')!.columns.xs).toBe(1)
})

test('min-rows and min-cols are properties with a default of 1', async ({ page, scenario }) => {
  await scenario('min-spans')
  const item = page.locator('c2-masonry-item[item-id="tile-1"]')
  await expect(item).toHaveJSProperty('minRows', 6)
  await expect(item).toHaveJSProperty('minCols', 3)
  await item.evaluate((element) => {
    ;(element as HTMLElementTagNameMap['c2-masonry-item']).minRows = 9
  })
  await startKeyboardResize(page, 'tile-1')
  await press(page, 'ArrowUp', 4)
  await expect.poll(() => spans(page, 'tile-1')).toEqual({ cols: 4, rows: 9 })
  await page.keyboard.press('Escape')
  const fresh = await page.evaluate(() => {
    const element = document.createElement('c2-masonry-item')
    return { minRows: element.minRows, minCols: element.minCols, attributes: element.getAttributeNames() }
  })
  expect(fresh).toEqual({ minRows: 1, minCols: 1, attributes: [] })
})
