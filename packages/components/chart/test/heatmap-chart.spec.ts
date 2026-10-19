import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '../../../../tests/component-fixture'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.heatmapScenario` declaration the scenario page installs.
import './heatmap-scenario-api'

async function open(page: Page, scenario = 'matrix', query = ''): Promise<void> {
  await page.goto(`/packages/components/chart/test/heatmap-scenarios.html?scenario=${scenario}${query}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

/** Page errors, failed loads and console errors, collected for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  return errors
}

/** The members of the element the specs read; all of them are protected or internal on the class. */
interface HeatmapInternals {
  cells: { x: string; y: string; value: number | null; count: number; date?: string; group?: string }[]
}

for (const scenario of ['matrix', 'calendar', 'months', 'groups', 'hours']) {
  test(`draws the ${scenario} scenario without errors`, async ({ page }) => {
    const errors = watchErrors(page)
    await open(page, scenario, '&renderer=svg')
    const chart = page.locator('c2-heatmap-chart')
    await expect(chart).toHaveState('ready')
    const drawn = await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('.plot svg path, .plot svg rect').length ?? 0)
    expect(drawn).toBeGreaterThan(3)
    expect(errors).toEqual([])
  })
}

/** Fills of the cells the engine drew, and how many of them are dimmed. Needs the SVG renderer. */
async function drawnCells(page: Page): Promise<{ fills: string[]; dimmed: number; texts: string[] }> {
  return page.locator('c2-heatmap-chart').evaluate((element) => {
    const svg = element.shadowRoot?.querySelector('.plot svg')
    // Cells and total bars are filled paths; the group rules are strokes.
    const paths = Array.from(svg?.querySelectorAll('path') ?? []).filter((path) => path.getAttribute('fill') !== 'none')
    return {
      fills: paths.map((path) => path.getAttribute('fill') ?? ''),
      dimmed: paths.filter((path) => path.getAttribute('fill-opacity') === '0.15').length,
      texts: Array.from(svg?.querySelectorAll('text') ?? []).map((text) => text.textContent ?? ''),
    }
  })
}

test('a currency matrix mirrors its axes, hides the diagonal and labels every cell', async ({ page }) => {
  await open(page, 'matrix', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const cells = await chart.evaluate((element) => (element as unknown as HeatmapInternals).cells)
  // Four currencies, sixteen pairs, the four x = x cells blanked.
  expect(cells).toHaveLength(12)
  expect(cells.some((cell) => cell.x === cell.y)).toBe(false)
  expect(cells.find((cell) => cell.y === 'EUR' && cell.x === 'JPY')?.value).toBe(1.27)
  const { texts } = await drawnCells(page)
  // Column heads in data order, the rows mirroring them, and every value written in its cell.
  expect(texts.slice(0, 4)).toEqual(['USD', 'EUR', 'JPY', 'GBP'])
  expect(texts).toContain('1.27%')
  expect(texts).toContain('-1.27%')
})

test('hovering a cell shows its tooltip, marks its value on the key and fires cell-hover', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const index = await chart.evaluate((element) => (element as unknown as HeatmapInternals).cells.findIndex((cell) => cell.y === 'EUR' && cell.x === 'JPY'))
  // The model's cells include none on the diagonal, so the index of EUR/JPY is the same in the engine's data.
  await page.evaluate((cell) => window.heatmapScenario.hover({ index: cell, seriesIndex: 1, px: 10, py: 10 }), index)
  const tooltip = chart.locator('.tooltip')
  await expect(tooltip).toContainText('EUR · JPY')
  await expect(tooltip).toContainText('1.27%')
  await expect(chart.locator('.scale-key__marker')).toBeVisible()
  await expect(chart.locator('.scale-key__hover')).toContainText('1.27%')
  const hover = await page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type === 'cell-hover').map((event) => event.detail))
  expect(hover).toEqual([expect.objectContaining({ x: 'JPY', y: 'EUR', value: 1.27, count: 1, rows: [{ base: 'EUR', quote: 'JPY', change: 1.27 }] })])

  await page.evaluate(() => window.heatmapScenario.hover(null))
  await expect(chart.locator('.scale-key__marker')).toBeHidden()
  await expect(chart.locator('.scale-key__readout')).toBeVisible()
  // Cells are not series points: no point event names one.
  const points = await page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type.startsWith('point-') && event.detail).length)
  expect(points).toBe(0)
})

test('clicking a cell fires cell-click with the rows behind it', async ({ page }) => {
  await open(page, 'calendar')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  // The engine's cells are every weekday of the range in date order: Thursday 1, Friday 2, then Monday 5 January.
  await page.evaluate(() => window.heatmapScenario.click({ index: 2, seriesIndex: 1 }))
  const clicks = await page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type === 'cell-click').map((event) => event.detail))
  expect(clicks).toEqual([
    expect.objectContaining({
      date: '2026-01-05',
      value: -70000,
      count: 2,
      rows: [
        { tradeDate: '2026-01-05', pnl: -30000 },
        { tradeDate: '2026-01-05', pnl: -40000 },
      ],
    }),
  ])
})

test('a trading calendar drops weekends, draws days without rows empty and aggregates fills', async ({ page }) => {
  await open(page, 'calendar', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const cells = await chart.evaluate((element) => (element as unknown as HeatmapInternals).cells)
  // Only the days with rows are reported; Monday 5 January sums its two fills.
  expect(cells.map((cell) => cell.date)).toEqual(['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'])
  expect(cells[1]).toMatchObject({ value: -70000, count: 2, x: '2026-01-05', y: 'mon' })
  const { fills, texts } = await drawnCells(page)
  // The 22 weekdays of January 2026, the 16 without rows in the empty colour.
  expect(fills).toHaveLength(22)
  expect(fills.filter((fill) => fill === 'rgb(244, 244, 245)')).toHaveLength(16)
  expect(texts).toEqual(['Jan', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'])

  await page.evaluate(() => window.heatmapScenario.hover({ index: 0, seriesIndex: 1, px: 0, py: 0 }))
  // 1 January, a Thursday and a holiday: in the range, without rows.
  await expect(chart.locator('.tooltip')).toContainText('Thursday')
  await expect(chart.locator('.tooltip')).toContainText('No data')
})

test('a stepped key counts the days per class and keeps a class on click', async ({ page }) => {
  await open(page, 'calendar', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('.scale-key__readout')).toHaveText('6 days · -120,000 to 150,000 · total 36,000')
  const bands = chart.locator('button.scale-key__band')
  await expect(bands).toHaveCount(7)
  await expect(chart.locator('.scale-key__tick')).toHaveText(['-100K', '-50K', '-10K', '10K', '50K', '100K'])
  await expect(chart.locator('.scale-key__poles')).toHaveText(/loss.*gain/)

  // Hovering previews the class: the other days are dimmed and the readout counts the class.
  await bands.first().hover()
  await expect(chart.locator('.scale-key__readout')).toHaveText('below -100K · 1 of 6 days · total -120,000')
  await expect.poll(async () => (await drawnCells(page)).dimmed).toBe(21)

  await bands.first().click()
  await expect(bands.first()).toHaveAttribute('aria-pressed', 'true')
  const filter = await page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type === 'scale-filter-change').map((event) => event.detail))
  expect(filter).toEqual([{ range: [null, -100000], count: 1, sum: -120000 }])

  // Shift-click extends the kept range to the next class.
  await bands.nth(1).click({ modifiers: ['Shift'] })
  await expect(chart).toHaveJSProperty('scaleFilter', [null, -50000])

  await page.mouse.move(0, 0)
  await chart.getByRole('button', { name: 'Clear filter' }).click()
  await expect(chart).toHaveJSProperty('scaleFilter', null)
  await expect.poll(async () => (await drawnCells(page)).dimmed).toBe(0)
})

test('a continuous key keeps the band clicked, or the range dragged across', async ({ page }) => {
  await open(page, 'matrix', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('.scale-key__readout')).toHaveText('12 cells · -1.27% to 1.27% · total 0%')
  await expect(chart.locator('.scale-key__tick')).toHaveText(['-1.5%', '-1%', '-0.5%', '0%', '0.5%', '1%', '1.5%'])
  const track = chart.locator('.scale-key__track')
  const box = await track.boundingBox()
  if (!box) throw new Error('The key has no box')

  // The last of twenty bands, open at the top: [1.35, ∞).
  await page.mouse.click(box.x + box.width - 2, box.y + box.height - 4)
  await expect(chart).toHaveJSProperty('scaleFilter', [1.35, null])
  // No pair moved that much.
  await expect(chart.locator('.scale-key__readout')).toContainText('0 of 12 cells')

  // A drag over the right half keeps everything from 0 up.
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height - 4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 2, box.y + box.height - 4, { steps: 4 })
  await page.mouse.up()
  await expect(chart).toHaveJSProperty('scaleFilter', [0, null])
  await expect(chart.locator('.scale-key__brush')).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(chart.locator('.scale-key__readout')).toContainText('6 of 12 cells')
  await expect.poll(async () => (await drawnCells(page)).dimmed).toBe(6)

  // Escape on the focused key clears the filter.
  await track.focus()
  await page.keyboard.press('Escape')
  await expect(chart).toHaveJSProperty('scaleFilter', null)
})

test('the key is reachable from the keyboard', async ({ page }) => {
  await open(page, 'matrix')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const track = chart.locator('.scale-key__track')
  await track.focus()
  await page.keyboard.press('End')
  await expect(chart.locator('.scale-key__readout')).toContainText('1.35% and above')
  await page.keyboard.press('Shift+ArrowLeft')
  await page.keyboard.press('Enter')
  await expect(chart).toHaveJSProperty('scaleFilter', [1.2, null])
})

test('a filter set by the application dims the cells without firing an event', async ({ page }) => {
  await open(page, 'matrix', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => element.setAttribute('scale-filter', '[null, 0]'))
  await expect.poll(async () => (await drawnCells(page)).dimmed).toBe(6)
  await expect(chart.locator('.scale-key__readout')).toContainText('below 0% · 6 of 12 cells')
  const events = await page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type === 'scale-filter-change').length)
  expect(events).toBe(0)
})

test('legend-interaction="none" and legend-detail="simple" keep a plain key', async ({ page }) => {
  await open(page, 'calendar')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => {
    element.setAttribute('legend-interaction', 'none')
    element.setAttribute('legend-detail', 'simple')
  })
  await expect(chart.locator('.scale-key--simple')).toBeVisible()
  await expect(chart.locator('button.scale-key__band')).toHaveCount(0)
  await expect(chart.locator('.scale-key__band')).toHaveCount(7)
  await expect(chart.locator('.scale-key__histogram')).toHaveCount(0)
  await expect(chart.locator('.scale-key__readout')).toHaveCount(0)
  // The ticks, the ends and the empty-day swatch stay.
  await expect(chart.locator('.scale-key__tick')).toHaveCount(6)
  await expect(chart.locator('.scale-key__poles')).toBeVisible()
  await expect(chart.locator('.scale-key__no-data')).toBeVisible()
})

test('rows are banded by group and tenors sorted by maturity', async ({ page }) => {
  await open(page, 'groups', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const cells = await chart.evaluate((element) => (element as unknown as HeatmapInternals).cells)
  expect([...new Set(cells.map((cell) => cell.y))]).toEqual(['EURUSD', 'GBPUSD', 'USDBRL'])
  expect([...new Set(cells.map((cell) => cell.x))]).toEqual(['ON', '1M', '1Y'])
  expect(cells.find((cell) => cell.y === 'USDBRL')?.group).toBe('EM')
  const { texts, fills } = await drawnCells(page)
  expect(texts).toEqual(expect.arrayContaining(['G10', 'EM', 'ON', '1M', '1Y', '7.6%', '16%']))
  // Nine positions, GBPUSD ON without a quote.
  expect(fills).toHaveLength(9)
})

test('one timestamp binned twice counts fills per hour and weekday, with total bars', async ({ page }) => {
  await open(page, 'hours', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const cells = await chart.evaluate((element) => (element as unknown as HeatmapInternals).cells)
  expect(cells.map((cell) => `${cell.y} ${cell.x} ${cell.value}`)).toEqual(['mon 08 2', 'tue 14 1'])
  // Two hours, two weekdays: four cells, plus one total bar per column and per row.
  const { fills } = await drawnCells(page)
  expect(fills).toHaveLength(8)
  await page.evaluate(() => window.heatmapScenario.hover({ index: 0, seriesIndex: 2, px: 0, py: 0 }))
  await expect(chart.locator('.tooltip')).toContainText('Total for 08')
  await expect(chart.locator('.tooltip')).toContainText('2')
  // The simple key has no histogram.
  await expect(chart.locator('.scale-key__histogram')).toHaveCount(0)
})

test('month grids carry day numbers', async ({ page }) => {
  await open(page, 'months', '&renderer=svg')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const { texts, fills } = await drawnCells(page)
  expect(texts).toEqual(expect.arrayContaining(['Jan 2026', 'Feb 2026', '31', '28']))
  expect(fills).toHaveLength(31 + 28)
})

test('the plot is one tab stop whose arrow keys move from cell to cell', async ({ page }) => {
  await open(page, 'groups')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const plot = chart.locator('.plot')
  await expect(plot).toHaveAttribute('aria-roledescription', 'heatmap')
  await expect(plot).toHaveAttribute('aria-label', 'ATM vol')
  await plot.focus()
  const last = () => page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type === 'cell-hover').at(-1)?.detail)
  await page.keyboard.press('ArrowRight')
  await expect.poll(last).toMatchObject({ y: 'EURUSD', x: 'ON' })
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await expect.poll(last).toMatchObject({ y: 'GBPUSD', x: '1M' })
  await expect(chart.locator('[aria-live]').last()).toHaveText('GBPUSD · 1M · G10: 7.9%')
  // The empty cell is still a stop: GBPUSD has no overnight quote.
  await page.keyboard.press('Home')
  await expect.poll(last).toMatchObject({ y: 'GBPUSD', x: 'ON', value: null })
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const clicks = await page.evaluate(() => window.heatmapScenario.events.filter((event) => event.type === 'cell-click').map((event) => event.detail))
  expect(clicks).toEqual([expect.objectContaining({ y: 'GBPUSD', x: '1Y', value: 8.3 })])
  await page.keyboard.press('Escape')
  await expect.poll(last).toBeNull()
})

test('a grid without its fields shows why it cannot draw', async ({ page }) => {
  await open(page, 'invalid')
  await expect(page.locator('c2-heatmap-chart').locator('.state')).toHaveText('A heatmap grid needs x-field and y-field.')
})

test('has no detectable accessibility violations, and lists its cells for a screen reader', async ({ page }) => {
  await open(page, 'calendar')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  const results = await new AxeBuilder({ page }).include('c2-heatmap-chart').analyze()
  expect(results.violations).toEqual([])
  await expect(chart.locator('table.data-table tbody tr')).toHaveCount(6)
  await expect(chart.locator('table.data-table tbody tr').first()).toContainText('2026-01-02')
})

test('layout helpers: tenors, ranges and ticks', async ({ page }) => {
  await open(page)
  const result = await page.evaluate(() => {
    const { tenorDays, parseRange, isoDate, niceTicks, orderCategories } = window.heatmapScenario.layout
    const tenors = ['10Y', 'ON', '1Y6M', '3M', 'TN', '1W', 'swap'].map((key) => ({ key, label: key }))
    return {
      days: ['ON', 'TN', '1W', '3M', '1Y6M'].map((tenor) => Math.round(tenorDays(tenor) ?? -1)),
      sorted: orderCategories(tenors, 'tenor', new Map()).map((item) => item.key),
      listed: orderCategories(tenors.slice(0, 2), ['2Y', '10Y'], new Map()).map((item) => item.key),
      year: parseRange('2026')?.map(isoDate),
      span: parseRange('2026-08/2026-10')?.map(isoDate),
      bad: parseRange('2026-10/2026-08') ?? null,
      ticks: niceTicks(4, 22),
    }
  })
  expect(result.days).toEqual([1, 2, 7, 91, 548])
  // A key that is not a tenor keeps its place after the tenors.
  expect(result.sorted).toEqual(['ON', 'TN', '1W', '3M', '1Y6M', '10Y', 'swap'])
  // Listed keys first, a listed key without rows included, the rest after.
  expect(result.listed).toEqual(['2Y', '10Y', 'ON'])
  expect(result.year).toEqual(['2026-01-01', '2026-12-31'])
  expect(result.span).toEqual(['2026-08-01', '2026-10-31'])
  expect(result.bad).toBeNull()
  expect(result.ticks).toEqual([5, 10, 15, 20])
})

test('updateData() reshapes the axes and the key, as assigning data does', async ({ page }) => {
  await open(page, 'groups')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => {
    ;(element as unknown as { updateData(rows: unknown[]): void }).updateData([
      { pair: 'USDJPY', region: 'G10', tenor: '3M', vol: 9.8 },
      { pair: 'USDJPY', region: 'G10', tenor: '1W', vol: 10.4 },
    ])
  })
  await expect
    .poll(() => chart.evaluate((element) => (element as unknown as HeatmapInternals).cells.map((cell) => `${cell.y} ${cell.x}`)))
    .toEqual(['USDJPY 1W', 'USDJPY 3M'])
  await expect(chart.locator('.scale-key__readout')).toContainText('2 cells')
})

test('a key beside the plot stands upright, its low end at the bottom', async ({ page }) => {
  await open(page, 'matrix')
  const chart = page.locator('c2-heatmap-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate((element) => element.setAttribute('legend', 'end'))
  const key = chart.locator('.scale-key--vertical')
  await expect(key).toBeVisible()
  const track = chart.locator('.scale-key__track')
  const box = await track.boundingBox()
  if (!box) throw new Error('The key has no box')
  // Taller than wide, and to the right of the plot.
  expect(box.height).toBeGreaterThan(box.width * 3)
  const plot = await chart.locator('.plot').boundingBox()
  expect(box.x).toBeGreaterThan((plot?.x ?? 0) + (plot?.width ?? 0) - 1)
  // The ends are named above and below the bar, the high one on top.
  await expect(chart.locator('.scale-key__pole')).toHaveText(['↑ base stronger', '↓ base weaker'])

  // The bottom band is the lowest values, open below: [−∞, −1.35).
  await page.mouse.click(box.x + box.width - 4, box.y + box.height - 2)
  await expect(chart).toHaveJSProperty('scaleFilter', [null, -1.35])
  // Up moves towards the high end.
  await track.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowUp')
  await expect(chart.locator('.scale-key__readout')).toContainText('-1.35% to -1.2%')

  // Hovering a cell marks its value from the bottom of the bar.
  await page.evaluate(() => window.heatmapScenario.hover({ index: 0, seriesIndex: 1, px: 0, py: 0 }))
  const marker = await chart.locator('.scale-key__marker').evaluate((element) => (element as HTMLElement).style.insetBlockEnd)
  expect(marker).toMatch(/%$/)

  // Back on top, the key lies flat again.
  await chart.evaluate((element) => element.setAttribute('legend', 'top'))
  await expect(chart.locator('.scale-key--vertical')).toHaveCount(0)
  const flat = await chart.locator('.scale-key__track').boundingBox()
  expect(flat && flat.width > flat.height).toBe(true)
})
