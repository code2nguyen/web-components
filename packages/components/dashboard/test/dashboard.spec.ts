import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixture'

/** Real pointer drag: press on the handle, move in steps, release. */
async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  const box = (await handle.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 12 })
  await page.mouse.up()
}

function width(card: Locator) {
  return card.boundingBox().then((box) => Math.round(box?.width ?? 0))
}

function height(card: Locator) {
  return card.boundingBox().then((box) => Math.round(box?.height ?? 0))
}

test('lays the cards out on the authored tracks', async ({ page, scenario }) => {
  await scenario()
  // 640px of main, one 10px gutter, two equal fr columns.
  await expect.poll(() => width(page.locator('#one'))).toBe(315)
  await expect.poll(() => width(page.locator('#two'))).toBe(315)
})

test('a handle appears only on an edge that has a neighbour', async ({ page, scenario }) => {
  await scenario('grid')
  // Left card spans both rows: a right edge to share, no left and no row edge of its own.
  await expect(page.locator('#one').getByRole('separator')).toHaveCount(1)
  await expect(page.locator('#one').getByRole('separator', { name: 'Resize column' })).toBeVisible()
  // Top right card shares its left edge and its bottom edge.
  await expect(page.locator('#two').getByRole('separator')).toHaveCount(2)
  await expect(page.locator('#three').getByRole('separator')).toHaveCount(2)
})

test('dragging a handle resizes the column and reports the tracks once', async ({ page, scenario }) => {
  await scenario()
  const one = page.locator('#one')
  await drag(page, one.getByRole('separator'), 60, 0)

  await expect.poll(() => width(one)).toBe(375)
  await expect.poll(() => width(page.locator('#two'))).toBe(255)
  // One report, at the end of the gesture, carrying the tracks as they now stand.
  await expect(page.getByRole('status')).toHaveText('1 375px|1fr 1fr')
})

test('dragging a row handle resizes the row', async ({ page, scenario }) => {
  await scenario('grid')
  const two = page.locator('#two')
  const before = await height(two)
  await drag(page, two.getByRole('separator', { name: 'Resize row' }), 0, 40)
  await expect.poll(() => height(two)).toBe(before + 40)
  await expect.poll(() => height(page.locator('#three'))).toBe(before - 40)
})

test('a card cannot be dragged past the minimum its neighbour asks for', async ({ page, scenario }) => {
  await scenario('min-width')
  const one = page.locator('#one')
  // 630px of track for a neighbour that will not go under 240px.
  await drag(page, one.getByRole('separator'), 300, 0)
  await expect.poll(() => width(one)).toBe(390)
  await expect.poll(() => width(page.locator('#two'))).toBe(240)

  // Coming back out of the stop is immediate: the handle did not run ahead of the edge while it was pinned.
  await drag(page, one.getByRole('separator'), -40, 0)
  await expect.poll(() => width(one)).toBe(350)
})

test('with no flexible track left, a drag stops at the free space', async ({ page, scenario }) => {
  await scenario('fixed-tracks')
  const one = page.locator('#one')
  // 640px of host, one 10px gutter, two 200px tracks: 230px is going spare and not a pixel more.
  await drag(page, one.getByRole('separator'), 300, 0)
  await expect.poll(() => width(one)).toBe(430)
  await expect.poll(() => width(page.locator('#two'))).toBe(200)
})

test('the arrow keys resize the focused handle', async ({ page, scenario }) => {
  await scenario()
  const one = page.locator('#one')
  const handle = one.getByRole('separator')
  await handle.focus()

  await page.keyboard.press('ArrowRight')
  await expect.poll(() => width(one)).toBe(325)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => width(one)).toBe(315)
  await page.keyboard.press('Shift+ArrowRight')
  await expect.poll(() => width(one)).toBe(316)
})

test('expanding a card covers the grid and collapsing puts it back', async ({ page, scenario }) => {
  await scenario('grid')
  const one = page.locator('#one')
  const before = await width(one)

  await one.getByRole('button', { name: 'Expand the card' }).click()
  await expect(one).toHaveAttribute('expanded', 'full')
  await expect(page.getByRole('status')).toHaveText('one full')
  await expect.poll(() => width(one)).toBe(640)
  // An expanded card has nothing left to drag.
  await expect(one.getByRole('separator')).toHaveCount(0)

  await one.getByRole('button', { name: 'Collapse the card' }).click()
  await expect(one).toHaveAttribute('expanded', 'none')
  await expect.poll(() => width(one)).toBe(before)
  await expect(one.getByRole('separator')).toHaveCount(1)
})

test('the width and height controls combine into a full expansion', async ({ page, scenario }) => {
  await scenario('grid')
  const two = page.locator('#two')
  await two.getByRole('button', { name: 'Expand to the full width' }).click()
  await expect(two).toHaveAttribute('expanded', 'width')
  await expect.poll(() => width(two)).toBe(640)

  await two.getByRole('button', { name: 'Expand to the full height' }).click()
  await expect(two).toHaveAttribute('expanded', 'full')
  await expect.poll(() => height(two)).toBe(300)

  await two.getByRole('button', { name: 'Collapse to the original width' }).click()
  await expect(two).toHaveAttribute('expanded', 'height')
})

test('a pane composes its own actions, controls, footer and icons around the built-in ones', async ({ page, scenario }) => {
  await scenario('slots')
  const one = page.locator('#one')
  await expect(one.getByRole('button', { name: 'Refresh' })).toBeVisible()
  await expect(one.getByRole('button', { name: 'Close pane' })).toBeVisible()
  await expect(one.getByText('Updated 2 minutes ago')).toBeVisible()

  // The slotted icon replaces the built-in drawing, and swaps with the state the control is in.
  await expect(one.getByTestId('icon-expand')).toBeVisible()
  await expect(one.getByTestId('icon-collapse')).toBeHidden()
  await one.getByRole('button', { name: 'Expand the card' }).click()
  await expect(one.getByTestId('icon-collapse')).toBeVisible()
  await expect(one.getByTestId('icon-expand')).toBeHidden()

  // Own buttons sit before the built-in ones, in the order they were authored.
  const names = await one.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent?.trim()))
  expect(names).toEqual(['Refresh', 'Close pane', 'Collapse the card'])
})

test('resize="none" leaves no handles', async ({ page, scenario }) => {
  await scenario('fixed')
  await expect(page.getByRole('separator')).toHaveCount(0)
})

test('the track sizes survive a reload when a storage key is set', async ({ page, scenario }) => {
  await scenario('storage')
  await drag(page, page.locator('#one').getByRole('separator'), 60, 0)
  await expect.poll(() => width(page.locator('#one'))).toBe(375)

  await scenario('storage-restored')
  await expect.poll(() => width(page.locator('#one'))).toBe(375)

  // Reset drops the stored sizes as well as the current ones.
  await page.locator('#subject').evaluate((element: HTMLElement & { reset(): void }) => element.reset())
  await expect.poll(() => width(page.locator('#one'))).toBe(315)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('c2n-dashboard-test'))).toBeNull()
})

test('the layout record overrides the placement and the visibility', async ({ page, scenario }) => {
  await scenario('layout')
  await expect(page.locator('#two')).toBeHidden()
  // Moved to the second column, which is the last one, so its only handle is on the left.
  await expect
    .poll(() =>
      page
        .locator('#one')
        .boundingBox()
        .then((box) => Math.round(box?.x ?? 0)),
    )
    .toBe(349)
  await expect(page.locator('#one').getByRole('separator')).toHaveCount(1)
})

test('a card added after the grid is alive registers with it', async ({ page, scenario }) => {
  await scenario('late')
  await expect.poll(() => width(page.locator('#two'))).toBe(315)
  await expect(page.locator('#two').getByRole('separator')).toHaveCount(1)
  await drag(page, page.locator('#two').getByRole('separator'), -60, 0)
  await expect.poll(() => width(page.locator('#two'))).toBe(375)
})
