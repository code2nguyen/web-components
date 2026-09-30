import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

type RegionDetail = { sets: string[]; size: number; total: number; share: number }

interface OverlapElement extends HTMLElement {
  regions: RegionDetail[]
  selected: string[]
  layout: string
  updateComplete: Promise<boolean>
  projectData(frame: unknown, context: unknown): unknown[][]
  buildContext(): unknown
}

test('works out every exclusive region from inclusive totals', async ({ page, scenario }) => {
  await scenario('overlap')
  const regions = await page
    .locator('c2-overlap-chart')
    .evaluate((element) => (element as OverlapElement).regions.map((r) => [r.sets.join('+'), r.size, r.total]))
  expect(regions).toEqual([
    ['web', 10130, 18420],
    ['web+mobile', 6140, 6880],
    ['mobile', 5800, 12960],
    ['api', 1880, 4310],
    ['web+api', 1410, 2150],
    ['web+mobile+api', 740, 740],
    ['mobile+api', 280, 1020],
  ])
})

test('each region outline fills exactly the points inside those circles and no others', async ({ page, scenario }) => {
  await scenario('overlap')
  const mismatches = await page.evaluate(() => {
    const layout = window.chartScenario.overlapLayout
    const rows = [
      { sets: ['a'], size: 18420 },
      { sets: ['b'], size: 12960 },
      { sets: ['c'], size: 4310 },
      { sets: ['a', 'b'], size: 6880 },
      { sets: ['a', 'c'], size: 2150 },
      { sets: ['b', 'c'], size: 1020 },
      { sets: ['a', 'b', 'c'], size: 740 },
    ]
    const context = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D
    const failures: string[] = []
    for (const mode of ['proportional', 'uniform'] as const) {
      for (const keys of [['a'], ['a', 'b'], ['a', 'b', 'c']]) {
        const { regions } = layout.overlapRegions(keys, rows)
        const circles = layout.fitOverlap(layout.solveOverlap(keys, regions, mode), 400, 300, { x: 10, y: 10 })
        for (const region of regions) {
          const data = layout.regionPath(circles, region.mask)
          if (!data) continue
          const path = new Path2D(data)
          for (let x = 2; x < 400; x += 5) {
            for (let y = 2; y < 300; y += 5) {
              // Anti-aliasing makes a point on an edge ambiguous; test only points clearly on one side.
              if (layout.edgeClearance(circles, { x, y }) < 1) continue
              const expected = layout.maskAt(circles, { x, y }) === region.mask
              if (context.isPointInPath(path, x, y, 'nonzero') !== expected) failures.push(`${mode} ${keys.join('')} ${region.mask} @${x},${y}`)
            }
          }
        }
      }
    }
    return failures.slice(0, 10)
  })
  expect(mismatches).toEqual([])
})

test('draws one engine datum per circle and per region', async ({ page, scenario }) => {
  await scenario('overlap')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const lengths = await chart.evaluate((element) => {
    const subject = element as OverlapElement
    return subject.projectData(undefined, subject.buildContext()).map((series) => series.length)
  })
  expect(lengths).toEqual([3, 7, 3])
  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('canvas').length)).toBeGreaterThan(0)
})

test('fires region events instead of point events and describes the region in the tooltip', async ({ page, scenario }) => {
  await scenario('overlap')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const events = await chart.evaluate((element) => {
    const seen: string[] = []
    element.addEventListener('region-hover', (event) => {
      const detail = (event as CustomEvent<RegionDetail | null>).detail
      seen.push(`region-hover:${detail ? detail.sets.join('+') : 'null'}`)
    })
    element.addEventListener('point-hover', () => seen.push('point-hover'))
    // Engine data order is the region masks in order: web, mobile, web+mobile, …
    window.chartScenario.hover({ index: 2, seriesIndex: 1, px: 10, py: 10 })
    return seen
  })
  expect(events).toEqual(['region-hover:web+mobile'])
  const tooltip = chart.locator('.tooltip')
  await expect(tooltip).toContainText('Web app + Mobile app')
  await expect(tooltip).toContainText('Not in Public API')
  await expect(tooltip).toContainText('6,140')
  await expect(tooltip).toContainText('6,880')
})

test('the pointer reaches a region through the transparent hit area', async ({ page, scenario }) => {
  await scenario('overlap')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await chart.evaluate((element) => {
    ;(window as unknown as { hovered: string[] }).hovered = []
    element.addEventListener('region-hover', (event) => {
      const detail = (event as CustomEvent<RegionDetail | null>).detail
      if (detail) (window as unknown as { hovered: string[] }).hovered.push(detail.sets.join('+'))
    })
  })
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('the plot has no box')
  await page.mouse.move(box.x + 5, box.y + 5)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 })
  await expect.poll(() => page.evaluate(() => (window as unknown as { hovered: string[] }).hovered.length)).toBeGreaterThan(0)
})

test('a selectable chart selects a region on click and clears it on a second click', async ({ page, scenario }) => {
  await scenario('overlap-selectable')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const box = await chart.locator('.plot').boundingBox()
  if (!box) throw new Error('the plot has no box')
  const changes = await chart.evaluate((element) => {
    const seen: string[][] = []
    element.addEventListener('selection-change', (event) => seen.push((event as CustomEvent<{ selected: string[] }>).detail.selected))
    ;(window as unknown as { changes: string[][] }).changes = seen
    return seen.length
  })
  expect(changes).toBe(0)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(() => chart.evaluate((element) => (element as OverlapElement).selected.length)).toBeGreaterThan(0)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(() => chart.evaluate((element) => (element as OverlapElement).selected)).toEqual([])
  const seen = await page.evaluate(() => (window as unknown as { changes: string[][] }).changes)
  expect(seen).toHaveLength(2)
  expect(seen[1]).toEqual([])
})

test('the keyboard walks regions from largest to smallest and Enter selects', async ({ page, scenario }) => {
  await scenario('overlap-selectable')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  const plot = chart.locator('.plot')
  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('[aria-live]')).toHaveText('Web app only: 10,130, 38.4%')
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('[aria-live]')).toHaveText('Web app + Mobile app: 6,140, 23.3%')
  await page.keyboard.press('Enter')
  await expect.poll(() => chart.evaluate((element) => (element as OverlapElement).selected)).toEqual(['web', 'mobile'])
  await page.keyboard.press('Escape')
  await expect.poll(() => chart.evaluate((element) => (element as OverlapElement).selected)).toEqual([])
  await expect(chart.locator('[aria-live]')).toHaveText('')
})

test('the legend switches a set off and lays the diagram out without it, keeping the last one on', async ({ page, scenario }) => {
  await scenario('overlap')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await chart.locator('.legend-item', { hasText: 'Public API' }).click()
  await expect.poll(() => chart.evaluate((element) => (element as OverlapElement).regions.length)).toBe(3)
  const regions = await chart.evaluate((element) => (element as OverlapElement).regions.map((r) => [r.sets.join('+'), r.size]))
  expect(regions).toEqual([
    ['web', 11540],
    ['web+mobile', 6880],
    ['mobile', 6080],
  ])
  await chart.locator('.legend-item', { hasText: 'Mobile app' }).click()
  await chart.locator('.legend-item', { hasText: 'Web app' }).click()
  await expect(chart.locator('.legend-item', { hasText: 'Web app' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => chart.evaluate((element) => (element as OverlapElement).regions.length)).toBe(1)
})

test('more than three sets shows the error state instead of a diagram', async ({ page, scenario }) => {
  await scenario('overlap-too-many')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart.locator('.state')).toBeVisible()
  await expect(chart.locator('.state')).toContainText('at most 3 sets; this one has 4')
  await expect(chart.locator('table.overlap-a11y')).toHaveCount(0)
})

test('the uniform layout labels by share and keeps the regions table for assistive technology', async ({ page, scenario }) => {
  await scenario('overlap-uniform')
  const chart = page.locator('c2-overlap-chart')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await expect(chart.locator('table.overlap-a11y tbody tr')).toHaveCount(7)
  await expect(chart.locator('table.overlap-a11y tbody tr').first()).toContainText('Web app only')
  await expect(chart.locator('.plot')).toHaveAttribute('aria-label', 'Venn diagram of Web app, Mobile app, Public API')
})

test('has no automated accessibility violations', async ({ page, scenario }) => {
  await scenario('overlap')
  await expect(page.locator('c2-overlap-chart')).toHaveAttribute('data-chart-ready', 'true')
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(results.violations).toEqual([])
})
