import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixture'
import { slotPresenceMatrix } from '../../../../tests/component-fixture'
import type { Dashboard } from '../src/dashboard'

test('footer presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const footer = page.locator('c2-dash-card').locator('[part="footer"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-dash-card><span slot="footer" data-slot-presence-probe>Footer</span></c2-dash-card>',
    host: 'c2-dash-card',
    slot: 'footer',
    assertPresent: async (present) => (present ? expect(footer).toBeVisible() : expect(footer).toBeHidden()),
  })
})

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

test('dash-card public parts style stable regions while projected actions and icons stay consumer-owned', async ({ page, scenario }) => {
  await scenario('slots')
  await page.addStyleTag({
    content:
      'c2-dash-card::part(body){background:rgb(1,2,3)}c2-dash-card::part(header){background:rgb(4,5,6)}c2-dash-card::part(footer){background:rgb(7,8,9)}c2-dash-card::part(controls){background:rgb(10,11,12)}c2-dash-card > [slot]{color:rgb(13,14,15)}',
  })
  const card = page.locator('#one')
  for (const [part, color] of [
    ['body', 'rgb(1, 2, 3)'],
    ['header', 'rgb(4, 5, 6)'],
    ['footer', 'rgb(7, 8, 9)'],
    ['controls', 'rgb(10, 11, 12)'],
  ] as const) {
    await expect(card.locator(`[part="${part}"]`)).toHaveCSS('background-color', color)
  }
  await expect(card.locator('[slot="actions"]')).toHaveCSS('color', 'rgb(13, 14, 15)')
  await expect(card.locator('[slot="expand-full-icon"]')).toHaveCSS('color', 'rgb(13, 14, 15)')
})

// The rows are toggled with `hidden`; the footer's own `display: flex` used to outrank it and a blank 36px row
// showed under every pane without a footer.
test('a pane without a footer draws no footer row', async ({ page, scenario }) => {
  await scenario('slots')
  const filled = page.locator('#one').locator('[part="footer"]')
  await expect(filled).toBeVisible()
  const empty = page.locator('#two').locator('[part="footer"]')
  await expect(empty).toBeHidden()
  expect(await empty.evaluate((node) => getComputedStyle(node).display)).toBe('none')
  expect(
    await page
      .locator('#two')
      .locator('[part="header"]')
      .evaluate((node) => getComputedStyle(node).display),
  ).toBe('none')
})

// The pane content follows the row track without a `height: 100%` chain: the body is a column flex box and the
// slotted child is a flex item.
test('the slotted content fills the pane', async ({ page, scenario }) => {
  await scenario('slots')
  const two = page.locator('#two')
  // The body is the card minus its 1px border on each side.
  await expect.poll(() => height(two.locator('[part="body"]'))).toBe((await height(two)) - 2)
  await expect.poll(() => height(two.locator('.pane'))).toBe(await height(two.locator('[part="body"]')))
  // With a header and a footer the content takes what is left between them.
  const one = page.locator('#one')
  const header = await height(one.locator('[part="header"]'))
  const footer = await height(one.locator('[part="footer"]'))
  expect(header).toBeGreaterThan(0)
  expect(footer).toBeGreaterThan(0)
  await expect.poll(() => height(one.locator('.pane'))).toBe((await height(one)) - 2 - header - footer)
})

// Each card's handle is centred on its edge and as thick as the gutter, so the two meet in the middle and a drag can
// start anywhere in the gap between the panes.
test('the whole gutter drags', async ({ page, scenario }) => {
  await scenario()
  const one = page.locator('#one')
  const two = page.locator('#two')
  const before = (await one.boundingBox())!
  const next = (await two.boundingBox())!
  const gutter = next.x - (before.x + before.width)
  expect(gutter).toBe(10)
  // The right handle of the first card covers the first half of the gutter, the left handle of the second the rest.
  const first = page.locator('#one [part~="handle-right"]')
  const second = page.locator('#two [part~="handle-left"]')
  const firstBox = (await first.boundingBox())!
  const secondBox = (await second.boundingBox())!
  expect(firstBox.width).toBe(10)
  expect(firstBox.x + firstBox.width).toBeCloseTo(secondBox.x, 1)

  await page.mouse.move(before.x + before.width + 8, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width + 68, before.y + before.height / 2, { steps: 4 })
  await page.mouse.up()
  const after = (await one.boundingBox())!
  expect(Math.round(after.width - before.width)).toBe(60)
})

// A stored layout describes one grid; when the authored tracks change, it is dropped rather than applied to a grid it
// does not fit.
test('a stored track list of another length is ignored', async ({ page, scenario }) => {
  await scenario()
  await page.evaluate(() => localStorage.setItem('c2n-dashboard-test', JSON.stringify({ columns: ['100px', '100px', '1fr'], rows: ['1fr'] })))
  await scenario('storage')
  const subject = page.locator('#subject')
  expect(await subject.evaluate((node) => (node as Dashboard).columnSizes)).toEqual(['1fr', '1fr'])
  await page.evaluate(() => localStorage.removeItem('c2n-dashboard-test'))
})

// The section flags are read from the light DOM before the first render, not from the slots after it, so the first
// paint is right and there is no second render (Lit's change-in-update warning).
test('a card renders once, with no update scheduled after the first one', async ({ page, scenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('scheduled an update')) warnings.push(message.text())
  })
  await scenario('slots')
  await expect(page.locator('#one').getByText('Updated 2 minutes ago')).toBeVisible()
  expect(warnings.filter((warning) => warning.includes('c2-dash-card'))).toEqual([])
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

// `layouts` swaps the tracks and the placements as the viewport crosses a breakpoint, in place: no remount, and each
// breakpoint remembers its own sizes.
test('a matching entry of layouts takes over as the viewport changes, with its own stored sizes', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1000, height: 600 })
  await scenario('responsive')
  const subject = page.locator('#subject')
  const one = page.locator('#one')
  const two = page.locator('#two')
  const columns = () => subject.evaluate((node) => (node as Dashboard).columnSizes)
  expect(await columns()).toEqual(['1fr', '1fr'])
  const wide = (await one.boundingBox())!
  expect((await two.boundingBox())!.x).toBeGreaterThan(wide.x + wide.width)

  // Below the breakpoint the two cards stack; the event reports the switch.
  await page.setViewportSize({ width: 500, height: 600 })
  await expect.poll(columns).toEqual(['1fr'])
  expect(await subject.evaluate((node) => (node as Dashboard).rowSizes)).toEqual(['1fr', '1fr'])
  await expect.poll(() => two.boundingBox().then((box) => Math.round(box?.x ?? 0))).toBe(Math.round((await one.boundingBox())!.x))
  expect((await two.boundingBox())!.y).toBeGreaterThan((await one.boundingBox())!.y + (await one.boundingBox())!.height - 1)
  await expect(page.locator('output')).toHaveText(/^1 1fr 1fr\|1fr$/)

  // A drag on the narrow layout is stored under its own key and leaves the wide one alone.
  await drag(page, page.locator('#one [part~="handle-bottom"]'), 0, 40)
  const stored = await page.evaluate(() => ({
    wide: localStorage.getItem('c2n-dashboard-test'),
    narrow: localStorage.getItem('c2n-dashboard-test@(max-width: 600px)'),
  }))
  expect(stored.wide).toBeNull()
  expect(JSON.parse(stored.narrow!).rows[0]).toMatch(/px$/)

  await page.setViewportSize({ width: 1000, height: 600 })
  await expect.poll(columns).toEqual(['1fr', '1fr'])
  expect(await subject.evaluate((node) => (node as Dashboard).rowSizes)).toEqual(['1fr'])

  // Back down, the dragged row comes back.
  await page.setViewportSize({ width: 500, height: 600 })
  await expect.poll(() => subject.evaluate((node) => (node as Dashboard).rowSizes[0])).toMatch(/px$/)
  await page.evaluate(() => localStorage.removeItem('c2n-dashboard-test@(max-width: 600px)'))
})

// The scenario page stretches the enter animation to 2s so it is still running when the checks run.
const animations = (card: Locator) => card.evaluate((node) => node.shadowRoot!.querySelector('.c2-dash-card')!.getAnimations().length)

test('a card added at runtime animates in; the cards of the initial page do not', async ({ page, scenario }) => {
  await scenario('late')
  expect(await animations(page.locator('#one'))).toBe(0)
  expect(await animations(page.locator('#two'))).toBe(1)
})

test('hiding a card through the layout record plays the leave animation first, and showing it again animates in', async ({ page, scenario }) => {
  await scenario('motion')
  const two = page.locator('#two')
  await expect(two).toBeVisible()
  await page.locator('#hide').click()
  // Still on screen, fading, with its handle already gone.
  await expect.poll(() => animations(two)).toBe(1)
  await expect(two).toBeVisible()
  await expect(two.getByRole('separator')).toHaveCount(0)
  await expect(two).toBeHidden()
  await expect(two).toHaveAttribute('hidden', '')

  await page.locator('#show').click()
  await expect(two).toBeVisible()
  await expect.poll(() => animations(two)).toBe(1)
  await expect(two.getByRole('separator')).toHaveCount(1)
})

test('dismiss() removes the card once the leave animation has played', async ({ page, scenario }) => {
  await scenario('motion')
  const two = page.locator('#two')
  await page.locator('#dismiss').click()
  await expect.poll(() => animations(two)).toBe(1)
  await expect(two).toHaveCount(1)
  await expect(page.locator('output')).toHaveText('dismissed')
  await expect(two).toHaveCount(0)
})

test('a card added after the grid is alive registers with it', async ({ page, scenario }) => {
  await scenario('late')
  await expect.poll(() => width(page.locator('#two'))).toBe(315)
  await expect(page.locator('#two').getByRole('separator')).toHaveCount(1)
  await drag(page, page.locator('#two').getByRole('separator'), -60, 0)
  await expect.poll(() => width(page.locator('#two'))).toBe(375)
})
