import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from '../../../../tests/component-fixture'
import { test } from '../../../../tests/fixture'
// Pulls in the `window.bulletScenario` declaration the scenario page installs.
import './bullet-scenario-api'

async function open(page: Page, scenario = 'scorecard', query = ''): Promise<void> {
  await page.goto(`/packages/components/chart/test/bullet-scenarios.html?scenario=${scenario}${query}`)
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

/** Page errors and console errors, collected for the whole test. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) errors.push(message.text())
  })
  return errors
}

interface Element2 {
  type: string
  silent?: boolean
  shape?: { x?: number; y?: number; width?: number; height?: number; x1?: number; y1?: number; x2?: number; y2?: number; r?: number }
  style?: { fill?: string; stroke?: string; text?: string; opacity?: number }
  emphasis?: { style?: { fill?: string } }
  enterFrom?: { shape?: Record<string, number> }
}

/** The members of the element the specs read; all of them are protected or internal on the class. */
interface BulletInternals extends HTMLElement {
  data: unknown
  highlighted: string | null
  updateComplete: Promise<boolean>
  rows: {
    label: string
    value: number | null
    target: number | null
    min: number
    max: number
    band: number
    bands: { from: number; to: number; quality: number }[]
  }[]
  buildContext(): { width: number; height: number }
  buildOptions(context: unknown): { animation: boolean; animationDuration: number; series: { type: string }[] }
  renderRow(index: number, width: number, height: number): { children: Element2[] } | null
  handleEngineClick(detail: { index: number; seriesIndex: number }): void
}

/** What `renderRow` draws for each row, sorted into its parts. */
async function drawn(page: Page): Promise<{ bands: Element2[]; bar?: Element2; target?: Element2; texts: string[]; backdrop: Element2 }[]> {
  return page.locator('c2-bullet-chart').evaluate((element) => {
    const chart = element as unknown as BulletInternals
    const { width, height } = chart.buildContext()
    return chart.rows.map((row, index) => {
      const children = chart.renderRow(index, width, height)?.children ?? []
      const rects = children.filter((child) => child.type === 'rect')
      const [backdrop, ...marks] = rects
      const bands = marks.slice(0, Math.max(1, row.bands.length))
      const rest = marks.slice(bands.length)
      const bar = row.value === null ? undefined : rest.shift()
      // The target is a halo and a tick: the tick is the second.
      const target = rest[1]
      const texts = children.filter((child) => child.type === 'text').map((child) => child.style?.text ?? '')
      return { bands, bar, target, texts, backdrop }
    })
  })
}

test.describe('band and scale logic', () => {
  test('reads band boundaries from arrays, JSON and comma lists, sorted, at most five', async ({ page }) => {
    await open(page, 'empty')
    const result = await page.evaluate(() => {
      const { bandBoundaries } = window.bulletScenario.model
      return [
        bandBoundaries([300, 150, 225]),
        bandBoundaries('[20, 25, 30]'),
        bandBoundaries('1, 2, x, 3'),
        bandBoundaries([1, 1, 2]),
        bandBoundaries([1, 2, 3, 4, 5, 6, 7]),
        bandBoundaries(undefined),
        bandBoundaries('nonsense'),
      ]
    })
    // Not capped here: which five a row draws depends on its scale.
    expect(result).toEqual([[150, 225, 300], [20, 25, 30], [1, 2, 3], [1, 2], [1, 2, 3, 4, 5, 6, 7], [], []])
  })

  test('regression: boundaries under the scale start do not use up the five bands; the band reaching the end is the last', async ({ page }) => {
    await open(page, 'empty')
    const result = await page.evaluate(() => {
      const { buildBulletRows, visibleBoundaries } = window.bulletScenario.model
      const [row] = buildBulletRows([{ label: 'A', description: '', value: 65, target: 68, bands: [10, 20, 30, 40, 60, 70], max: null }], {
        min: 50,
        scale: 'row',
        better: 'higher',
      })
      return {
        bands: row.bands,
        capped: visibleBoundaries([1, 2, 3, 4, 5, 6, 7], 0, 10),
        ended: visibleBoundaries([10, 20, 30], 0, 15),
      }
    })
    expect(result.bands).toEqual([
      { from: 50, to: 60, quality: 0 },
      { from: 60, to: 70, quality: 1 },
    ])
    expect(result.capped).toEqual([1, 2, 3, 4, 5])
    expect(result.ended).toEqual([10, 20])
  })

  test('scales end at the largest of the last band, the value and the target, unless overridden; shared takes the widest', async ({ page }) => {
    await open(page, 'empty')
    const result = await page.evaluate(() => {
      const { buildBulletRows } = window.bulletScenario.model
      const inputs = [
        { label: 'A', description: '', value: 270, target: 250, bands: [150, 225, 300], max: null },
        { label: 'B', description: '', value: 340, target: 250, bands: [150, 225, 300], max: null },
        { label: 'C', description: '', value: 10, target: 40, bands: [20], max: null },
        { label: 'D', description: '', value: 5, target: null, bands: [], max: 12 },
      ]
      const own = buildBulletRows(inputs, { min: 0, scale: 'row', better: 'higher' })
      const shared = buildBulletRows(inputs, { min: 0, scale: 'shared', better: 'higher' })
      const fixed = buildBulletRows(inputs, { min: 0, max: 500, scale: 'row', better: 'higher' })
      return {
        own: own.map((row) => [row.min, row.max]),
        shared: shared.map((row) => row.max),
        fixed: fixed.map((row) => row.max),
        // The last band reaches the scale end, past the last boundary or cut at it.
        lastBand: [
          own[1],
          fixed[0],
          buildBulletRows([{ ...inputs[0], value: 5, target: 5, bands: [10, 20, 30] }], { min: 0, max: 15, scale: 'row', better: 'higher' })[0],
        ].map((row) => row.bands.map((band) => [band.from, band.to, band.quality])),
        bands: own[0].bands,
        band: own.map((row) => row.band),
        attainment: own.map((row) => (row.attainment === null ? null : Number(row.attainment.toFixed(3)))),
        onTarget: own.map((row) => row.onTarget),
      }
    })
    expect(result.own).toEqual([
      [0, 300],
      [0, 340],
      [0, 40],
      [0, 12],
    ])
    expect(result.shared).toEqual([340, 340, 340, 340])
    // `max-field` beats `max`.
    expect(result.fixed).toEqual([500, 500, 500, 12])
    expect(result.lastBand).toEqual([
      [
        [0, 150, 0],
        [150, 225, 1],
        [225, 340, 2],
      ],
      [
        [0, 150, 0],
        [150, 225, 1],
        [225, 500, 2],
      ],
      [
        [0, 10, 0],
        [10, 15, 1],
      ],
    ])
    expect(result.bands).toEqual([
      { from: 0, to: 150, quality: 0 },
      { from: 150, to: 225, quality: 1 },
      { from: 225, to: 300, quality: 2 },
    ])
    // A value past the last band is in it; no bands, no band.
    expect(result.band).toEqual([2, 2, 0, -1])
    expect(result.attainment).toEqual([1.08, 1.36, 0.25, null])
    expect(result.onTarget).toEqual([true, true, false, null])
  })

  test('better="lower" turns the band quality round and meets the target from below; a start above zero drops the bands under it', async ({ page }) => {
    await open(page, 'empty')
    const result = await page.evaluate(() => {
      const { buildBulletRows, bulletTicks } = window.bulletScenario.model
      const [cost] = buildBulletRows([{ label: 'Cost', description: '', value: 46, target: 40, bands: [35, 50, 70], max: null }], {
        min: 0,
        scale: 'row',
        better: 'lower',
      })
      const [uptime] = buildBulletRows([{ label: 'Uptime', description: '', value: 99.95, target: 99.9, bands: [98, 99.5, 99.9, 100], max: null }], {
        min: 99,
        scale: 'row',
        better: 'higher',
      })
      return {
        quality: cost.bands.map((band) => band.quality),
        onTarget: cost.onTarget,
        uptime: uptime.bands,
        ticks: [bulletTicks(0, 300), bulletTicks(0, 2500), bulletTicks(99, 100), bulletTicks(0, 70), bulletTicks(0, 5, 2)],
      }
    })
    expect(result.quality).toEqual([2, 1, 0])
    expect(result.onTarget).toBe(false)
    expect(result.uptime).toEqual([
      { from: 99, to: 99.5, quality: 0 },
      { from: 99.5, to: 99.9, quality: 1 },
      { from: 99.9, to: 100, quality: 2 },
    ])
    expect(result.ticks).toEqual([
      [0, 100, 200, 300],
      [0, 500, 1000, 1500, 2000, 2500],
      [99, 99.2, 99.4, 99.6, 99.8, 100],
      [0, 20, 40, 60],
      [0, 2, 4],
    ])
  })
})

test('a scorecard draws one bullet per row: grey bands poor to good, the bar, the target, the name, the value and a tick axis', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, 'scorecard', '&renderer=svg')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const rows = await drawn(page)
  expect(rows).toHaveLength(4)
  for (const row of rows) {
    // The grey ramp from the poor end to the good end, with the middle band mixed between them.
    expect(row.bands.map((band) => band.style?.fill)).toEqual(['rgb(212, 212, 216)', 'rgb(228, 228, 230)', 'rgb(244, 244, 245)'])
    expect(row.bar?.style?.fill).toBe('rgb(2, 101, 220)')
    expect(row.target?.style?.fill).toBe('rgb(24, 24, 27)')
    // The bar is a third of the band height and centred on it; the target 70%.
    const band = row.bands[0].shape!
    expect(row.bar!.shape!.height).toBeCloseTo(band.height! / 3, 3)
    expect(row.bar!.shape!.y! + row.bar!.shape!.height! / 2).toBeCloseTo(band.y! + band.height! / 2, 3)
    expect(row.target!.shape!.height).toBeCloseTo(band.height! * 0.7, 3)
    expect(row.target!.shape!.width).toBe(3)
    // Every mark but the backdrop keeps its colour under hover; the backdrop lights up.
    expect(row.backdrop.silent).toBeFalsy()
    expect(row.backdrop.emphasis?.style?.fill).toMatch(/^rgba\(24, 24, 27, 0\.06\)$/)
    expect(row.bands.every((mark) => mark.silent && mark.emphasis?.style?.fill === 'inherit')).toBe(true)
  }
  // Each on its own scale: Revenue's 270 of 300 against Profit's 22.5 of 30.
  const revenue = rows[0]
  const span = (row: (typeof rows)[number]) => row.bands[2].shape!.x! + row.bands[2].shape!.width! - row.bands[0].shape!.x!
  expect(revenue.bar!.shape!.width! / span(revenue)).toBeCloseTo(270 / 300, 3)
  expect(rows[1].bar!.shape!.width! / span(rows[1])).toBeCloseTo(22.5 / 30, 3)
  expect(revenue.texts).toEqual(['0', '100', '200', '300', 'Revenue', 'US$, thousands', '270'])
  expect(rows[2].texts).toEqual(['0', '500', '1K', '1.5K', '2K', '2.5K', 'New customers', 'count', '1,650'])
  // The rows start at one edge whatever their scale, and the value column follows them.
  expect(new Set(rows.map((row) => row.bands[0].shape!.x)).size).toBe(1)

  // The engine drew them: four backdrops, twelve bands, four bars and four targets with their halos, as paths.
  const paths = await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('.plot svg path').length ?? 0)
  expect(paths).toBeGreaterThanOrEqual(4 * (1 + 3 + 1 + 2))
  // The chart sizes itself: four 44px rows and three 12px gaps, plus the padding and border.
  expect((await chart.boundingBox())!.height).toBeCloseTo(4 * 44 + 3 * 12 + 24 + 2, 0)
  expect(errors).toEqual([])
})

test('names the figure, lists every row in a hidden table and passes axe; nothing is written on the host', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const plot = chart.locator('[part="plot"]')
  await expect(plot).toHaveAttribute('role', 'img')
  await expect(plot).toHaveAttribute('tabindex', '0')
  await expect(plot).toHaveAttribute('aria-label', 'Bullet chart, 4 measures, 2 on target')
  const table = chart.locator('table.bullet-a11y')
  await expect(table.locator('caption')).toHaveText('Bullet chart, 4 measures, 2 on target')
  await expect(table.locator('thead th')).toHaveText(['Measure', 'Actual', 'Target', '% of target', 'Band'])
  await expect(table.locator('tbody tr').nth(1).locator('th, td')).toHaveText(['Profit (% of revenue)', '22.5', '27', '83%', 'Satisfactory, 20–25'])
  await expect(table.locator('tbody tr').nth(0).locator('td').nth(2)).toHaveText('108%')
  await expect(table.locator('tbody tr').nth(3).locator('td').nth(3)).toHaveText('Good, 4.25–5')
  // Only what the page wrote: no role, label, tabindex or state attribute on the host.
  expect(await chart.evaluate((element) => element.getAttributeNames().sort())).toEqual(['bands-field', 'description-field', 'label-field', 'target-field'])
  const results = await new AxeBuilder({ page }).include('c2-bullet-chart').analyze()
  expect(results.violations).toEqual([])
})

test('the tooltip gives the actual, the target with the share reached and the band the value falls in', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  await page.evaluate(() => window.bulletScenario.hover({ index: 1, seriesIndex: 0, px: 300, py: 70 }))
  const tooltip = chart.locator('[part="tooltip"]')
  await expect(tooltip.locator('.tooltip-title')).toHaveText('Profit · % of revenue')
  await expect(tooltip.locator('.tooltip-row')).toHaveText([/Actual\s*22\.5/, /Target\s*27 · 83% reached/, /Band\s*Satisfactory, 20–25/])
  // The band swatch is the band's colour, the actual's the bar's.
  const swatches = await tooltip.locator('.tooltip-marker').evaluateAll((markers) => markers.map((marker) => getComputedStyle(marker).backgroundColor))
  expect(swatches).toEqual(['rgb(2, 101, 220)', 'rgb(228, 228, 230)'])
  // The target marker is the target's own colour, `--c2-chart__target--color`.
  await expect(tooltip.locator('.bullet-tick-marker')).toHaveCSS('background-color', 'rgb(24, 24, 27)')
  const events = await page.evaluate(() => window.bulletScenario.events.filter((event) => event.type === 'point-hover'))
  expect(events.at(-1)?.detail).toMatchObject({ index: 1, seriesIndex: 0, y: 22.5, label: 'Profit' })
  await page.evaluate(() => window.bulletScenario.hover(null))
  await expect(tooltip).toBeHidden()
})

test('a real pointer anywhere on a row hovers it, across its bands and bar without leaving it', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const [, profit] = await drawn(page)
  const plot = (await chart.locator('[part="plot"]').boundingBox())!
  const band = profit.bands[2].shape!
  const bar = profit.bar!.shape!
  // Over the good band, then the bar, then the name column: one row all along.
  await page.mouse.move(plot.x + band.x! + band.width! / 2, plot.y + band.y! + 2)
  await expect(chart.locator('[part="tooltip"] .tooltip-title')).toHaveText('Profit · % of revenue')
  await page.mouse.move(plot.x + bar.x! + bar.width! / 2, plot.y + bar.y! + bar.height! / 2, { steps: 4 })
  await page.mouse.move(plot.x + 20, plot.y + band.y! + band.height! / 2, { steps: 4 })
  await expect(chart.locator('[part="tooltip"] .tooltip-title')).toHaveText('Profit · % of revenue')
  const hovers = await page.evaluate(() =>
    window.bulletScenario.events.filter((event) => event.type === 'point-hover').map((event) => (event.detail as { label?: string } | null)?.label ?? null),
  )
  expect(new Set(hovers)).toEqual(new Set(['Profit']))
  await page.mouse.move(plot.x + plot.width / 2, plot.y + plot.height + 40)
  await expect(chart.locator('[part="tooltip"]')).toBeHidden()
})

test('the keyboard walks the rows: the tooltip and the backdrop follow, a live region reads the row, Enter highlights and Escape clears', async ({ page }) => {
  await open(page, 'scorecard', '&renderer=svg')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  await chart.locator('[part="plot"]').focus()
  const live = chart.locator('.bullet-a11y[aria-live="polite"]')
  const tooltip = chart.locator('[part="tooltip"] .tooltip-title')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('Revenue: 270, 108% of the 250 target, Good')
  await expect(tooltip).toHaveText('Revenue · US$, thousands')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText('Profit: 22.5, 83% of the 27 target, Satisfactory')
  await expect(tooltip).toHaveText('Profit · % of revenue')
  // The focused row's backdrop is lit through the engine's emphasis, and nothing else changes colour.
  // (The previous row fades out over the engine's state transition.)
  const lit = () =>
    chart.evaluate((element) =>
      Array.from(element.shadowRoot?.querySelectorAll('.plot svg path') ?? [])
        .filter((path) => Number(path.getAttribute('fill-opacity') ?? '1') > 0 && Number(path.getAttribute('fill-opacity') ?? '1') < 0.2)
        .map((path) => path.getAttribute('d')?.split(' ')[1]),
    )
  await expect.poll(lit).toEqual(['50L608'])
  const poor = await chart.evaluate(
    (element) =>
      Array.from(element.shadowRoot?.querySelectorAll('.plot svg path') ?? []).filter((path) => path.getAttribute('fill') === 'rgb(212, 212, 216)').length,
  )
  expect(poor).toBe(4)
  await page.keyboard.press('End')
  await expect(live).toHaveText('Satisfaction: 4.6, 110% of the 4.2 target, Good')
  await page.keyboard.press('ArrowDown')
  await expect(live).toHaveText(/^Satisfaction/)
  await page.keyboard.press('Home')
  await expect(live).toHaveText(/^Revenue/)
  await page.keyboard.press('Enter')
  await expect.poll(() => chart.evaluate((element) => (element as unknown as BulletInternals).highlighted)).toBe('Revenue')
  const clicks = await page.evaluate(() =>
    window.bulletScenario.events.filter((event) => event.type === 'point-click').map((event) => (event.detail as { label: string }).label),
  )
  expect(clicks).toEqual(['Revenue'])
  await page.keyboard.press('Escape')
  await expect.poll(() => chart.evaluate((element) => (element as unknown as BulletInternals).highlighted)).toBeNull()
  await expect(live).toHaveText('')
  // Leaving the chart hides the tooltip.
  await page.keyboard.press('ArrowDown')
  await expect(chart.locator('[part="tooltip"]')).toBeVisible()
  await chart.locator('[part="plot"]').blur()
  await expect(chart.locator('[part="tooltip"]')).toBeHidden()
})

test('a click highlights a row and dims the others, and a second click clears it', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  await page.evaluate(() => window.bulletScenario.click({ index: 2, seriesIndex: 0 }))
  await expect.poll(() => chart.evaluate((element) => (element as unknown as BulletInternals).highlighted)).toBe('New customers')
  const opacities = (await drawn(page)).map((row) => row.bar?.style?.opacity)
  expect(opacities).toEqual([0.25, 0.25, 1, 0.25])
  const texts = await chart.evaluate((element) => {
    const bullet = element as unknown as BulletInternals
    const { width, height } = bullet.buildContext()
    return bullet
      .renderRow(0, width, height)
      ?.children.filter((child) => child.type === 'text')
      .every((child) => child.style?.opacity === 0.25)
  })
  expect(texts).toBe(true)
  await page.evaluate(() => window.bulletScenario.click({ index: 2, seriesIndex: 0 }))
  await expect.poll(() => chart.evaluate((element) => (element as unknown as BulletInternals).highlighted)).toBeNull()
  const events = await page.evaluate(() => window.bulletScenario.events.filter((event) => event.type === 'series-highlight').map((event) => event.detail))
  expect(events).toEqual([{ key: 'New customers' }, { key: null }])
})

test('better="lower" puts the good band near zero, and the target reads as a share of it', async ({ page }) => {
  await open(page, 'lower')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const rows = await drawn(page)
  // The ramp runs the other way: the light, good band first.
  expect(rows[0].bands.map((band) => band.style?.fill)).toEqual(['rgb(244, 244, 245)', 'rgb(228, 228, 230)', 'rgb(212, 212, 216)'])
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Bullet chart, 2 measures, 1 on target')
  await page.evaluate(() => window.bulletScenario.hover({ index: 0, seriesIndex: 0, px: 300, py: 20 }))
  await expect(chart.locator('[part="tooltip"] .tooltip-row')).toHaveText([/Actual\s*46/, /Target\s*40 · 115% of target/, /Band\s*Satisfactory, 35–50/])
  // Churn's 2.1 is past the good band next to zero (0–2), in the middle one.
  await expect(chart.locator('table.bullet-a11y tbody tr').nth(1).locator('td').nth(3)).toHaveText('Satisfactory, 2–3')
})

test('scale="shared" puts every row on one scale; band-labels renames the bands', async ({ page }) => {
  await open(page, 'shared')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const rows = await chart.evaluate((element) => (element as unknown as BulletInternals).rows.map((row) => [row.min, row.max]))
  expect(rows).toEqual([
    [0, 450],
    [0, 450],
    [0, 450],
    [0, 450],
  ])
  const bars = (await drawn(page)).map((row) => Math.round(row.bar!.shape!.width!))
  // One scale: the bars compare directly.
  expect(bars[0] / bars[3]).toBeCloseTo(412 / 196, 1)
  await chart.evaluate(async (element) => {
    element.setAttribute('band-labels', 'Behind, On track, Ahead')
    await (element as unknown as BulletInternals).updateComplete
  })
  await page.evaluate(() => window.bulletScenario.hover({ index: 0, seriesIndex: 0, px: 300, py: 20 }))
  await expect(chart.locator('[part="tooltip"] .tooltip-row').nth(0)).toHaveText(/Q3 sales\s*412/)
  await expect(chart.locator('[part="tooltip"] .tooltip-row').nth(2)).toHaveText(/Band\s*Ahead, 300–450/)
})

test('orientation="vertical" turns the rows into columns: value above, name below, ticks to the left; the arrows still walk them', async ({ page }) => {
  await open(page, 'vertical')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const rows = await drawn(page)
  for (const row of rows) {
    const band = row.bands[0].shape!
    // Bands stand up: thin and tall, the poor band at the bottom.
    expect(band.height!).toBeGreaterThan(band.width!)
    expect(row.bands[2].shape!.y!).toBeLessThan(band.y!)
    expect(row.bar!.shape!.width).toBeCloseTo(band.width! / 3, 3)
    expect(row.bar!.enterFrom?.shape).toEqual({ y: band.y! + band.height!, height: 0 })
  }
  const lefts = rows.map((row) => row.bands[0].shape!.x!)
  expect(lefts).toEqual([...lefts].sort((a, b) => a - b))
  const children = await chart.evaluate((element) => {
    const bullet = element as unknown as BulletInternals
    const { width, height } = bullet.buildContext()
    return bullet.renderRow(0, width, height)?.children.filter((child) => child.type === 'text') ?? []
  })
  const at = (text: string) => (children.find((child) => child.style?.text === text)?.style as { y: number }).y
  expect(at('270')).toBeLessThan(at('Revenue'))
  expect(at('Revenue')).toBeLessThan(at('US$, thousands'))
  await chart.locator('[part="plot"]').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('.bullet-a11y[aria-live="polite"]')).toHaveText(/^Profit/)
  await page.keyboard.press('ArrowLeft')
  await expect(chart.locator('.bullet-a11y[aria-live="polite"]')).toHaveText(/^Revenue/)
})

test('theming: status tints replace the ramp by position, the target and row variables take effect', async ({ page }) => {
  await open(page, 'status')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  let [row] = await drawn(page)
  expect(row.bands.map((band) => band.style?.fill)).toEqual(['rgb(254, 202, 202)', 'rgb(253, 230, 138)', 'rgb(187, 247, 208)'])
  expect(row.target!.shape!.width).toBe(5)
  expect(row.texts).toContain('99.95%')
  expect(row.texts.slice(0, 6)).toEqual(['99', '99.2', '99.4', '99.6', '99.8', '100'])

  const before = (await chart.boundingBox())!.height
  await chart.evaluate(async (element) => {
    element.style.setProperty('--c2-chart__band-2--color', '')
    element.style.setProperty('--c2-chart__band-start--color', '#000000')
    element.style.setProperty('--c2-chart__band-end--color', '#ffffff')
    element.classList.remove('status')
    element.style.setProperty('--c2-chart__target--color', 'rgb(255, 0, 0)')
    element.style.setProperty('--c2-chart__bar--border-radius', '0.5')
    element.style.setProperty('--c2-chart__description--color', 'rgb(0, 128, 0)')
    element.style.setProperty('--c2-chart__row--height', '64px')
    // A variable change reaches the engine with the next option build, which a theme change starts.
    window.dispatchEvent(new Event('c2n-theme-change'))
    await (element as unknown as BulletInternals).updateComplete
  })
  ;[row] = await drawn(page)
  // Unset, the ramp: black, the mix and white.
  expect(row.bands[0].style?.fill).toBe('rgb(0, 0, 0)')
  expect(row.bands[2].style?.fill).toBe('rgb(255, 255, 255)')
  expect(row.target!.style?.fill).toBe('rgb(255, 0, 0)')
  expect(row.bar!.shape!.r).toBeCloseTo(row.bar!.shape!.height! / 2, 3)
  // A taller row: the host grows by the difference, and the band thickens up to the row less its axis.
  expect((await chart.boundingBox())!.height).toBeCloseTo(before + 20, 0)
  expect(row.bands[0].shape!.height).toBe(44)
})

test('compact: no names, values or axis, sized by --c2-chart--height alone', async ({ page }) => {
  await open(page, 'compact')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  expect((await chart.boundingBox())!.height).toBe(16)
  const [row] = await drawn(page)
  expect(row.texts).toEqual([])
  expect(row.bands[0].shape).toMatchObject({ x: 0, y: 0, height: 16 })
  const width = await chart.evaluate((element) => element.clientWidth)
  expect(row.bands[2].shape!.x! + row.bands[2].shape!.width!).toBeCloseTo(width, 3)
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Bullet chart, 1 measure, 1 on target')
})

test('a row without a value draws no bar, one without a target no tick, one without bands a single track; no data shows the empty state', async ({ page }) => {
  await open(page, 'gaps')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const rows = await drawn(page)
  expect(rows[0].bar).toBeUndefined()
  expect(rows[0].texts.at(-1)).toBe('—')
  expect(rows[1].bar).toBeDefined()
  expect(rows[1].target).toBeUndefined()
  expect(rows[2].bands).toHaveLength(1)
  expect(rows[2].bands[0].style?.fill).toBe('rgb(244, 244, 245)')
  // Only the rows with a target count towards the summary.
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Bullet chart, 3 measures, 0 on target')
  await page.evaluate(() => window.bulletScenario.hover({ index: 0, seriesIndex: 0, px: 300, py: 20 }))
  await expect(chart.locator('[part="tooltip"] .tooltip-row')).toHaveText([/Actual\s*—/, /Target\s*50/])
  await chart.locator('[part="plot"]').focus()
  await page.keyboard.press('ArrowDown')
  await expect(chart.locator('.bullet-a11y[aria-live="polite"]')).toHaveText('No value: no value')

  await open(page, 'empty')
  const empty = page.locator('c2-bullet-chart')
  await expect(empty.locator('[part="state"]')).toHaveText('No data')
  await expect(empty.locator('table.bullet-a11y')).toHaveCount(0)
})

test('the bar grows from the scale start on first draw, and stands still under reduced motion', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const animated = await chart.evaluate((element) => {
    const bullet = element as unknown as BulletInternals
    return bullet.buildOptions(bullet.buildContext()).animation
  })
  expect(animated).toBe(true)
  const [row] = await drawn(page)
  expect(row.bar!.enterFrom).toEqual({ shape: { x: row.bands[0].shape!.x, width: 0 } })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page)
  const still = await page.locator('c2-bullet-chart').evaluate((element) => {
    const bullet = element as unknown as BulletInternals
    const options = bullet.buildOptions(bullet.buildContext())
    return [options.animation, options.animationDuration]
  })
  expect(still).toEqual([false, 0])
})

test('regression: new data with another row count resizes the chart and redraws the table', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const before = (await chart.boundingBox())!.height
  await chart.evaluate(async (element) => {
    const bullet = element as unknown as BulletInternals
    bullet.data = [{ kpi: 'Only', unit: 'one', actual: 3, target: 4, bands: [2, 4, 6] }]
    await bullet.updateComplete
  })
  await expect(chart.locator('table.bullet-a11y tbody tr')).toHaveCount(1)
  await expect(chart.locator('[part="plot"]')).toHaveAttribute('aria-label', 'Bullet chart, 1 measure, 0 on target')
  await expect.poll(async () => (await chart.boundingBox())!.height).toBeCloseTo(before - 3 * 56, 0)
})

test('a chart rendered before its engine loads already has its height and table, and its first render throws nothing', async ({ page }) => {
  const errors = watchErrors(page)
  await open(page, 'empty')
  const result = await page.evaluate(async () => {
    const chart = document.createElement('c2-bullet-chart')
    chart.setAttribute('label-field', 'kpi')
    chart.setAttribute('target', '5')
    chart.setAttribute('bands', '[2, 4, 6]')
    chart.setAttribute('lazy-render', '')
    chart.setAttribute(
      'data',
      JSON.stringify([
        { kpi: 'A', v: 3 },
        { kpi: 'B', v: 6 },
      ]),
    )
    chart.style.width = '400px'
    document.querySelector('main')?.append(chart)
    await chart.updateComplete
    return {
      height: chart.getBoundingClientRect().height,
      rows: chart.shadowRoot?.querySelectorAll('table.bullet-a11y tbody tr').length,
      attributes: chart.getAttributeNames().sort(),
    }
  })
  expect(result.height).toBeCloseTo(2 * 44 + 12 + 24 + 2, 0)
  expect(result.rows).toBe(2)
  expect(result.attributes).toEqual(['bands', 'data', 'label-field', 'lazy-render', 'style', 'target'])
  expect(errors).toEqual([])
})

test('regression: band names are one message each per band count, so a language names them its own way; band-labels may be a JSON array', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate(async (element) => {
    window.bulletScenario.addTranslations({ fr: { 'bullet-chart': { band1Of3: 'Faible', band2Of3: 'Correct, sans plus', band3Of3: 'Bon' } } })
    element.setAttribute('lang', 'fr')
    await (element as unknown as BulletInternals).updateComplete
  })
  const bands = chart.locator('table.bullet-a11y tbody tr td:nth-of-type(4)')
  await expect(bands.nth(1)).toHaveText(/^\s*Correct, sans plus, 20/)
  await expect(bands.nth(0)).toHaveText(/^\s*Bon, 225/)
  await chart.evaluate(async (element) => {
    element.setAttribute('band-labels', '["Behind", "Close, but not yet", "Ahead"]')
    await (element as unknown as BulletInternals).updateComplete
  })
  await expect(bands.nth(1)).toHaveText(/^\s*Close, but not yet, 20/)
  await expect(bands.nth(0)).toHaveText(/^\s*Ahead, 225/)
})

test('regression: a measure whose series field is "target" or "band" keeps the bar swatch; the markers follow what an entry is', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  for (const field of ['target', 'band']) {
    await chart.evaluate(async (element, name) => {
      const bullet = element as unknown as BulletInternals
      element.setAttribute('target-field', 'goal')
      element.querySelector('c2-chart-series')?.setAttribute('field', name)
      bullet.data = [{ kpi: 'Revenue', [name]: 270, goal: 250, bands: [150, 225, 300] }]
      await bullet.updateComplete
    }, field)
    await page.evaluate(() => window.bulletScenario.hover({ index: 0, seriesIndex: 0, px: 300, py: 20 }))
    const rows = chart.locator('[part="tooltip"] .tooltip-row')
    await expect(rows).toHaveText([/Actual\s*270/, /Target\s*250/, /Band\s*Good/])
    await expect(rows.nth(0).locator('.tooltip-marker:not(.bullet-band-marker)')).toHaveCSS('background-color', 'rgb(2, 101, 220)')
    await expect(rows.nth(1).locator('.bullet-tick-marker')).toHaveCount(1)
    await expect(rows.nth(2).locator('.bullet-band-marker')).toHaveCount(1)
    await page.evaluate(() => window.bulletScenario.hover(null))
  }
})

test('regression: a huge offset over a tiny span gives its two ends at once rather than stepping forever', async ({ page }) => {
  await open(page, 'empty')
  const result = await page.evaluate(() => {
    const { bulletTicks } = window.bulletScenario.model
    const started = performance.now()
    const ticks = [bulletTicks(1e12, 1e12 + 1e-3), bulletTicks(-1e15, -1e15 + 0.5), bulletTicks(0, 1e300, 1e9)]
    return { ticks, elapsed: performance.now() - started }
  })
  expect(result.ticks[0]).toEqual([1e12, 1e12 + 1e-3])
  expect(result.ticks[1]).toEqual([-1e15, -1e15 + 0.5])
  expect(result.ticks[2].length).toBeLessThanOrEqual(12)
  expect(result.elapsed).toBeLessThan(100)
})

test('regression: a scale end past the last boundary is covered by the last band on the plot', async ({ page }) => {
  await open(page)
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  await chart.evaluate(async (element) => {
    const bullet = element as unknown as BulletInternals
    element.setAttribute('max', '400')
    bullet.data = [{ kpi: 'Revenue', actual: 270, target: 350, bands: [150, 225, 300] }]
    await bullet.updateComplete
  })
  const [row] = await drawn(page)
  const last = row.bands[2].shape!
  // The good band runs to the end of the scale, where the 400 tick sits.
  expect(last.x! + last.width!).toBeCloseTo(row.bands[0].shape!.x! + (row.bands[0].shape!.width! * 400) / 150, 3)
  expect(row.bands[2].style?.fill).toBe('rgb(244, 244, 245)')
})

test('regression: a lang change redraws the engine, so the values and ticks on the canvas follow the language', async ({ page }) => {
  await open(page, 'scorecard', '&renderer=svg')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  const texts = () => chart.evaluate((element) => Array.from(element.shadowRoot?.querySelectorAll('.plot svg text') ?? []).map((text) => text.textContent))
  expect(await texts()).toContain('1,650')
  await chart.evaluate((element) => element.setAttribute('lang', 'de'))
  await expect.poll(texts).toContain('1.650')
  expect(await texts()).toContain('22,5')
})

test('an unknown scenario draws the scorecard with its rows', async ({ page }) => {
  await open(page, 'no-such-scenario')
  const chart = page.locator('c2-bullet-chart')
  await expect(chart).toHaveState('ready')
  await expect(chart.locator('table.bullet-a11y tbody tr')).toHaveCount(4)
})
