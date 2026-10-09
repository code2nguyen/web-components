import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const spans = [
  { id: 'a1', name: 'POST /checkout', service: 'web', start: 0, duration: 800 },
  { id: 'b1', parentId: 'a1', name: 'auth.verify', service: 'auth', start: 10, duration: 40 },
  { id: 'b2', parentId: 'a1', name: 'cart.load', service: 'cart', start: 60, duration: 140 },
  { id: 'c1', parentId: 'b2', name: 'SELECT cart_items', service: 'postgres', start: 70, duration: 70 },
  { id: 'b3', parentId: 'a1', name: 'payments.charge', service: 'payments', start: 200, duration: 400, status: 'error' },
  { id: 'b4', parentId: 'a1', name: 'orders.create', service: 'orders', start: 600, duration: 200 },
  { id: 'c2', parentId: 'b4', name: 'INSERT orders', service: 'postgres', start: 620, duration: 40 },
]

const waterfall = (attributes = '', data: unknown = spans) =>
  `<c2-trace-waterfall label="Checkout" spans='${JSON.stringify(data)}' ${attributes}></c2-trace-waterfall>`

const span = (page: Page, name: string) => page.getByRole('treeitem').filter({ has: page.locator('.label', { hasText: new RegExp(`^${name}$`) }) })

const box = async (page: Page, name: string, part: string) => (await span(page, name).locator(`[part="${part}"]`).boundingBox())!

test('draws the span tree with every bar placed on one time axis', async ({ page, renderScenario }) => {
  await renderScenario(waterfall())
  await expect(page.getByRole('tree', { name: 'Checkout' })).toBeVisible()
  await expect(page.getByRole('treeitem')).toHaveCount(7)
  // Children follow their parent, in start order.
  await expect(page.locator('.label')).toHaveText([
    'POST /checkout',
    'auth.verify',
    'cart.load',
    'SELECT cart_items',
    'payments.charge',
    'orders.create',
    'INSERT orders',
  ])
  await expect(span(page, 'POST /checkout')).toHaveAttribute('aria-expanded', 'true')
  await expect(span(page, 'SELECT cart_items')).toHaveAttribute('aria-level', '3')
  await expect(span(page, 'auth.verify')).not.toHaveAttribute('aria-expanded')
  await expect(span(page, 'payments.charge')).toContainText('400ms at 200ms')
  await expect(page.locator('[part="header"]')).toContainText('7 spans')
  await expect(page.locator('.tick')).toHaveText(['0ms', '200ms', '400ms', '600ms', '800ms'])

  // The root spans the whole axis; payments.charge starts a quarter in and covers half of it.
  const root = await box(page, 'POST /checkout', 'bar')
  const charge = await box(page, 'payments.charge', 'bar')
  expect(charge.x - root.x).toBeCloseTo(root.width / 4, 0)
  expect(charge.width).toBeCloseTo(root.width / 2, 0)
  // A bar ending near the axis end puts its label before it.
  const create = await box(page, 'orders.create', 'bar')
  expect((await box(page, 'orders.create', 'duration')).x).toBeLessThan(create.x)
  expect((await box(page, 'auth.verify', 'duration')).x).toBeGreaterThan((await box(page, 'auth.verify', 'bar')).x)
  // A bar spanning the whole axis has no room on either side, so its label sits over its end, inside the timeline.
  const rootLabel = await box(page, 'POST /checkout', 'duration')
  expect(rootLabel.x + rootLabel.width).toBeLessThanOrEqual(root.x + root.width)
  expect(rootLabel.x).toBeGreaterThan(root.x)
  await accessible(page)
})

test('colours bars by service and marks failed spans', async ({ page, renderScenario }) => {
  await renderScenario(waterfall())
  const colour = (name: string) =>
    span(page, name)
      .locator('[part="bar"]')
      .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(await colour('POST /checkout')).toBe('rgb(2, 101, 220)')
  expect(await colour('auth.verify')).toBe('rgb(234, 88, 12)')
  // Spans of one service share a colour.
  expect(await colour('INSERT orders')).toBe(await colour('SELECT cart_items'))
  expect(await colour('payments.charge')).toBe('rgb(220, 38, 38)')
  await expect(span(page, 'payments.charge').getByRole('img', { name: 'Error' })).toBeVisible()
})

test('clicking a span selects it; the toggle opens and closes its children', async ({ page, renderScenario }) => {
  await renderScenario(waterfall())
  const host = page.locator('c2-trace-waterfall')
  await watch(host, 'selection-change')
  await span(page, 'cart.load').locator('[part="bar"]').click()
  await expect(span(page, 'cart.load')).toHaveAttribute('aria-selected', 'true')
  await expect(span(page, 'POST /checkout')).toHaveAttribute('aria-selected', 'false')
  expect(JSON.parse((await host.getAttribute('data-events'))!)).toEqual([{ id: 'b2', span: spans[2] }])
  expect(await host.evaluate((element) => (element as HTMLElement & { selected: string }).selected)).toBe('b2')

  await watch(host, 'expansion-change')
  await span(page, 'cart.load').locator('.twisty').click()
  await expect(span(page, 'cart.load')).toHaveAttribute('aria-expanded', 'false')
  await expect(span(page, 'SELECT cart_items')).toHaveCount(0)
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ id: 'b2', expanded: false }]))
})

test('selected sets the selection from outside', async ({ page, renderScenario }) => {
  await renderScenario(waterfall('selected="c2"'))
  await expect(span(page, 'INSERT orders')).toHaveAttribute('aria-selected', 'true')
  await props(page.locator('c2-trace-waterfall'), { selected: 'b1' })
  await expect(span(page, 'auth.verify')).toHaveAttribute('aria-selected', 'true')
  await expect(span(page, 'INSERT orders')).toHaveAttribute('aria-selected', 'false')
})

test('arrow keys walk, open and close the spans; Enter selects', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button>${waterfall()}<button>After</button>`)
  const host = page.locator('c2-trace-waterfall')
  await watch(host, 'selection-change')
  await tab()
  await tab()
  await expect(span(page, 'POST /checkout')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(span(page, 'cart.load')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(span(page, 'cart.load')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('ArrowRight')
  await expect(span(page, 'cart.load')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(span(page, 'SELECT cart_items')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(span(page, 'cart.load')).toBeFocused()
  await page.keyboard.press('End')
  await expect(span(page, 'INSERT orders')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(span(page, 'INSERT orders')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(span(page, 'POST /checkout')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await page.keyboard.press('*')
  await expect(page.getByRole('treeitem')).toHaveCount(7)
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ id: 'c2', span: spans[6] }]))
  // The waterfall is a single tab stop.
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('collapseAll and expandAll reset every span', async ({ page, renderScenario }) => {
  await renderScenario(waterfall())
  const host = page.locator('c2-trace-waterfall')
  await host.evaluate((element) => (element as HTMLElement & { collapseAll(): void }).collapseAll())
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await host.evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  await expect(page.getByRole('treeitem')).toHaveCount(7)
})

test('search highlights matches, dims the rest and opens the spans above them', async ({ page, renderScenario }) => {
  await renderScenario(waterfall())
  const host = page.locator('c2-trace-waterfall')
  await host.evaluate((element) => (element as HTMLElement & { collapseAll(): void }).collapseAll())
  await props(host, { search: 'postgres' })
  await expect(page.getByRole('treeitem')).toHaveCount(7)
  await expect(page.locator('mark')).toHaveText(['postgres', 'postgres'])
  await expect(span(page, 'SELECT cart_items')).not.toHaveClass(/dimmed/)
  await expect(span(page, 'cart.load')).toHaveClass(/dimmed/)
  // Clearing the search brings back the collapsed state.
  await props(host, { search: '' })
  await expect(page.getByRole('treeitem')).toHaveCount(1)
})

test('reads absolute nanosecond times, end times and partial traces', async ({ page, renderScenario }) => {
  const base = 1_760_000_000_000_000_000n
  const ns = (ms: number) => String(base + BigInt(ms * 1_000_000))
  const otel = [
    { id: 'r', name: 'root', start: ns(0), end: ns(1500) },
    { id: 'x', parentId: 'r', name: 'child', start: ns(500), end: ns(1500) },
    // Its parent is not in the trace, so it is drawn as a root.
    { id: 'o', parentId: 'missing', name: 'orphan', start: ns(250), duration: 250_000 },
  ]
  await renderScenario(waterfall('time-unit="ns"', otel))
  await expect(page.locator('.label')).toHaveText(['root', 'child', 'orphan'])
  await expect(span(page, 'root')).toContainText('1.5s')
  await expect(span(page, 'child')).toContainText('1s at 500ms')
  await expect(span(page, 'orphan')).toContainText('250µs at 250ms')
  await expect(span(page, 'orphan')).toHaveAttribute('aria-level', '1')
})

test('a parent loop is broken rather than hiding its spans', async ({ page, renderScenario }) => {
  await renderScenario(
    waterfall('', [
      { id: 'a', parentId: 'b', name: 'first', start: 0, duration: 10 },
      { id: 'b', parentId: 'a', name: 'second', start: 5, duration: 5 },
    ]),
  )
  await expect(page.locator('.label')).toHaveText(['first', 'second'])
  await expect(span(page, 'second')).toHaveAttribute('aria-level', '2')
})

test('shows the empty slot without spans', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-trace-waterfall><span slot="empty">No trace selected</span></c2-trace-waterfall>`)
  await expect(page.getByText('No trace selected')).toBeVisible()
  await expect(page.getByRole('tree')).toHaveCount(0)
})
