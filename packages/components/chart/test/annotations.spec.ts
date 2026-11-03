import { test, expect } from './fixture'
import type { ChartAnnotation } from '../src/chart-types'

type Box = { hidden: boolean; left: number; width: number; top: number; height: number; marker: { x: number; y: number } | null }

/** Each annotation box's place relative to the plot, in CSS pixels, read from the layout. */
async function boxes(page: import('@playwright/test').Page): Promise<{ plot: { left: number; top: number; width: number; height: number }; boxes: Box[] }> {
  return page.locator('#chart').evaluate((element) => {
    const root = element.shadowRoot as ShadowRoot
    // The plotting box inside the axes: uPlot's overlay, or the whole plot for ECharts (asserted separately).
    const over = (root.querySelector('.u-over') ?? root.querySelector('.plot')) as HTMLElement
    const plot = over.getBoundingClientRect()
    return {
      plot: { left: plot.left, top: plot.top, width: plot.width, height: plot.height },
      boxes: Array.from(root.querySelectorAll<HTMLElement>('.annotation')).map((box) => {
        const rect = box.getBoundingClientRect()
        const marker = box.querySelector<HTMLElement>('.annotation-marker')
        const dot = marker && !marker.hidden ? marker.getBoundingClientRect() : null
        return {
          hidden: box.hidden !== false,
          left: rect.left - plot.left,
          width: rect.width,
          top: rect.top - plot.top,
          height: rect.height,
          marker: dot ? { x: dot.left + dot.width / 2 - plot.left, y: dot.top + dot.height / 2 - plot.top } : null,
        }
      }),
    }
  })
}

async function annotate(page: import('@playwright/test').Page, annotations: ChartAnnotation[]): Promise<void> {
  await page.locator('#chart').evaluate(async (element, value) => {
    const chart = element as HTMLElement & { annotations?: unknown; updateComplete: Promise<boolean> }
    chart.annotations = value
    await chart.updateComplete
  }, annotations)
}

test('a marker and a range sit where the x scale puts their values, and span the plot height', async ({ page, scenario }) => {
  await scenario('two-series')
  // `two-series` plots x = 0…39 across the whole plot width.
  await annotate(page, [
    { x: 10, label: 'Deploy', tone: 'warning' },
    { x: 30, x2: 20, label: 'Incident', tone: 'danger' },
  ])

  const {
    plot,
    boxes: [marker, range],
  } = await boxes(page)
  const at = (x: number) => (x / 39) * plot.width
  expect(marker.hidden).toBe(false)
  expect(marker.left).toBeCloseTo(at(10), 0)
  expect(marker.width).toBeCloseTo(0, 0)
  expect(marker.height).toBeCloseTo(plot.height, 0)
  expect(marker.marker?.x).toBeCloseTo(at(10), 0)

  // The pair is given backwards; the box runs from the lower value, and the marker stays on `x`.
  expect(range.left).toBeCloseTo(at(20), 0)
  expect(range.width).toBeCloseTo(at(30) - at(20), 0)
  expect(range.marker?.x).toBeCloseTo(at(30), 0)

  const colors = await page.locator('#chart').evaluate((element) => {
    element.style.setProperty('--c2-chart__annotation__danger--color', 'rgb(1, 2, 3)')
    const dot = element.shadowRoot?.querySelectorAll('.annotation-marker')[1] as HTMLElement
    return getComputedStyle(dot).backgroundColor
  })
  expect(colors).toBe('rgb(1, 2, 3)')
})

test('annotations follow the scale when the data moves it, and hide outside the visible x window', async ({ page, scenario }) => {
  await scenario('two-series')
  await annotate(page, [
    { x: 10, label: 'Inside' },
    { x: 60, label: 'Later' },
    { x: 5, x2: 60, label: 'Crosses the edge' },
  ])
  let state = await boxes(page)
  expect(state.boxes.map((box) => box.hidden)).toEqual([false, true, false])
  // Clipped to the plot's right edge, and the marker at x = 5 is still drawn.
  expect(state.boxes[2].left + state.boxes[2].width).toBeCloseTo(state.plot.width, 0)

  // A wider data range is a data-only update, which skips Lit entirely: the engine's draw is what moves them.
  await page.locator('#chart').evaluate((element) => {
    const chart = element as HTMLElement & { data: unknown }
    chart.data = Array.from({ length: 80 }, (_item, index) => ({ t: index, s0: index, s1: index * 2 }))
  })
  await expect.poll(async () => (await boxes(page)).boxes[1].hidden).toBe(false)
  state = await boxes(page)
  expect(state.boxes[0].left).toBeCloseTo((10 / 79) * state.plot.width, 0)
  expect(state.boxes[1].left).toBeCloseTo((60 / 79) * state.plot.width, 0)
})

test('markers are buttons named by label and x, reachable from the keyboard, and fire annotation-click', async ({ page, scenario }) => {
  await scenario('intraday')
  const start = Date.UTC(2024, 0, 1, 9)
  await page.locator('#chart').evaluate((element, from) => {
    const chart = element as HTMLElement & { data: unknown; locale: string }
    chart.locale = 'en-US'
    chart.data = Array.from({ length: 12 }, (_item, index) => ({ at: from + index * 600_000, v: index }))
  }, start)
  await annotate(page, [{ x: start + 1_800_000, label: 'Error surge', tone: 'danger', id: 'surge' }])

  const group = page.getByRole('group', { name: 'Annotations' })
  const marker = group.getByRole('button', { name: /^Error surge, / })
  await expect(marker).toHaveCount(1)
  await expect(marker).toHaveAttribute('title', 'Error surge')

  // The listener must be in place before the key is pressed: an evaluate left pending can still be resolving its
  // locator when Enter lands, and the event then goes unheard. It is wrapped in an object because a handle to the
  // promise itself would wait for it.
  const clicked = await page.locator('#chart').evaluateHandle((element) => ({
    detail: new Promise<unknown>((resolve) => element.addEventListener('annotation-click', (event) => resolve((event as CustomEvent).detail), { once: true })),
  }))
  await marker.focus()
  await page.keyboard.press('Enter')
  expect(await clicked.evaluate((listener) => listener.detail)).toEqual({
    annotation: { x: start + 1_800_000, label: 'Error surge', tone: 'danger', id: 'surge' },
    index: 0,
  })
})

test('a marker on a labelled row is named by the row label, as the axis names it', async ({ page, scenario }) => {
  // `bar` has `label-field="team"` and no `x-field`, so x is the row index and row 1 is "Web".
  await scenario('bar')
  await annotate(page, [
    { x: 1, label: 'Reorg' },
    { x: 0, x2: 2, label: 'Quarter' },
  ])
  await expect(page.getByRole('button', { name: 'Reorg, Web' })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Quarter, Core to Infra' })).toHaveCount(1)
})

test('a horizontal bar chart draws the rule across the plot at the category', async ({ page, scenario }) => {
  await scenario('horizontal-bars')
  await annotate(page, [{ x: 1, label: 'Target quarter' }])
  const {
    plot,
    boxes: [box],
  } = await boxes(page)
  expect(box.hidden).toBe(false)
  expect(box.width).toBeCloseTo(plot.width, 0)
  expect(box.height).toBeCloseTo(0, 0)
  expect(box.top).toBeGreaterThan(0)
  expect(box.top).toBeLessThan(plot.height)
  await expect(page.getByRole('button', { name: /^Target quarter, / })).toHaveCount(1)
})

test('an ECharts cartesian chart places annotations inside its grid', async ({ page, scenario }) => {
  await scenario('scatter')
  const extent = await page.locator('#chart').evaluate((element) => {
    const chart = element as HTMLElement & { frame?: { x: ArrayLike<number>; length: number } }
    const xs = Array.from({ length: chart.frame?.length ?? 0 }, (_item, index) => chart.frame?.x[index] ?? 0)
    return { min: Math.min(...xs), max: Math.max(...xs) }
  })
  await annotate(page, [{ x: (extent.min + extent.max) / 2, label: 'Middle' }])
  await expect.poll(async () => (await boxes(page)).boxes[0]?.hidden).toBe(false)
  const {
    plot,
    boxes: [box],
  } = await boxes(page)
  // The grid is inset from the container by the axes; the rule spans the grid, not the whole plot.
  expect(box.top).toBeGreaterThan(0)
  expect(box.top + box.height).toBeLessThan(plot.height)
  expect(box.left).toBeGreaterThan(0)
  expect(box.left).toBeLessThan(plot.width)
})

test('charts without an x axis ignore annotations', async ({ page, scenario }) => {
  await scenario('pie')
  await annotate(page, [{ x: 0, label: 'Nothing to mark' }])
  await expect(page.locator('#chart').locator('.annotation')).toHaveCount(0)
})

test('names follow a data-only update that relabels the row', async ({ page, scenario }) => {
  await scenario('bar')
  await annotate(page, [{ x: 1, label: 'Reorg' }])
  await expect(page.getByRole('button', { name: 'Reorg, Web' })).toHaveCount(1)
  await page.locator('#chart').evaluate((element) => {
    ;(element as HTMLElement & { data: unknown }).data = [
      { team: 'Core', shipped: 18 },
      { team: 'Mobile', shipped: 9 },
      { team: 'Infra', shipped: 11 },
    ]
  })
  await expect(page.getByRole('button', { name: 'Reorg, Mobile' })).toHaveCount(1)
})

test('a range whose start is outside the window keeps its marker at the visible edge', async ({ page, scenario }) => {
  await scenario('two-series')
  await annotate(page, [{ x: -10, x2: 10, label: 'Started before the data' }])
  const {
    boxes: [box],
  } = await boxes(page)
  expect(box.hidden).toBe(false)
  expect(box.left).toBeCloseTo(0, 0)
  expect(box.marker?.x).toBeCloseTo(0, 0)
  await expect(page.getByRole('button', { name: /^Started before the data, / })).toHaveCount(1)
})

test('a null x2 from JSON is a single marker, and the marker is drawn inside the plot area', async ({ page, scenario }) => {
  await scenario('sparkline')
  await page.locator('#chart').evaluate(async (element) => {
    element.setAttribute('annotations', '[{"x":2,"x2":null,"label":"Spike"}]')
    await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
  const result = await page.locator('#chart').evaluate((element) => {
    const root = element.shadowRoot as ShadowRoot
    const area = (root.querySelector('.plot-area') as HTMLElement).getBoundingClientRect()
    const dot = (root.querySelector('.annotation-marker') as HTMLElement).getBoundingClientRect()
    return { ranges: root.querySelectorAll('.annotation-range').length, inside: dot.top >= area.top && dot.bottom <= area.bottom }
  })
  expect(result).toEqual({ ranges: 0, inside: true })
  await expect(page.getByRole('button', { name: /^Spike, / })).toHaveCount(1)
})

test('changing annotations does not report a legend change', async ({ page, scenario }) => {
  await scenario('two-series')
  const fired = await page.locator('#chart').evaluate(async (element) => {
    let count = 0
    element.addEventListener('legend-change', () => (count += 1))
    const chart = element as HTMLElement & { annotations?: unknown; updateComplete: Promise<boolean> }
    chart.annotations = [{ x: 3, label: 'One' }]
    await chart.updateComplete
    return count
  })
  expect(fired).toBe(0)
})
