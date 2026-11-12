import AxeBuilder from '@axe-core/playwright'
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixture'

for (const scenarioName of ['gauge', 'scatter', 'candlestick']) {
  test(`${scenarioName} has no automated accessibility violations`, async ({ page, scenario }) => {
    await scenario(scenarioName)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

/** What the shared text alternative exposes: the plot's role and name, and the hidden table's headers and first row. */
async function textAlternative(chart: Locator): Promise<{ role: string | null; name: string; headers: string[]; rows: number; firstRow: string[] }> {
  return chart.evaluate((element) => {
    const root = element.shadowRoot
    const plot = root?.querySelector('.plot')
    const table = root?.querySelector('.a11y-root table')
    const text = (node: Element) => node.textContent?.trim() ?? ''
    return {
      role: plot?.getAttribute('role') ?? null,
      name: plot?.getAttribute('aria-label') ?? '',
      headers: [...(table?.querySelectorAll('thead th') ?? [])].map(text),
      rows: table?.querySelectorAll('tbody tr').length ?? 0,
      firstRow: [...(table?.querySelector('tbody tr')?.children ?? [])].map(text),
    }
  })
}

const cases: { tag: string; scenario: string; kind: string; firstRow?: string[] }[] = [
  { tag: 'c2-line-chart', scenario: 'two-series', kind: 'Line chart of First, Second' },
  { tag: 'c2-area-chart', scenario: 'family', kind: 'Area chart' },
  { tag: 'c2-bar-chart', scenario: 'bar', kind: 'Bar chart of Shipped', firstRow: ['Core', '18'] },
  { tag: 'c2-sparkline', scenario: 'sparkline', kind: 'Sparkline' },
  { tag: 'c2-pie-chart', scenario: 'pie', kind: 'Pie chart', firstRow: ['Direct', '4,200'] },
  { tag: 'c2-scatter-chart', scenario: 'scatter', kind: 'Scatter chart of Portfolio' },
  { tag: 'c2-radar-chart', scenario: 'radar', kind: 'Radar chart of Current, Target', firstRow: ['Quality', '82', '90'] },
  { tag: 'c2-gauge-chart', scenario: 'gauge', kind: 'Gauge of Attainment', firstRow: ['Target', '78'] },
  { tag: 'c2-candlestick-chart', scenario: 'candlestick', kind: 'Candlestick chart', firstRow: ['Mon', '182', '187', '180', '189'] },
  { tag: 'c2-butterfly-chart', scenario: 'butterfly', kind: 'Butterfly chart of Men, Women' },
  { tag: 'c2-pyramid-chart', scenario: 'pyramid', kind: 'Pyramid chart of Accounts' },
  { tag: 'c2-radial-bar-chart', scenario: 'radial', kind: 'Radial bar chart of Today' },
]

for (const item of cases) {
  test(`${item.tag} exposes its plot as a named image backed by a data table`, async ({ page, scenario }) => {
    await scenario(item.scenario)
    const chart = page.locator(item.tag).first()
    await expect.poll(async () => (await textAlternative(chart)).rows).toBeGreaterThan(0)
    const view = await textAlternative(chart)
    expect(view.role).toBe('img')
    expect(view.name).toContain(item.kind)
    expect(view.headers.length).toBeGreaterThan(1)
    if (item.firstRow) expect(view.firstRow).toEqual(item.firstRow)
  })
}

async function openBubble(page: Page): Promise<void> {
  await page.goto('/packages/components/chart/test/bubble-scenarios.html?scenario=wide')
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
}

test('c2-bubble-chart exposes its plot as a named image backed by a data table', async ({ page }) => {
  await openBubble(page)
  const chart = page.locator('c2-bubble-chart')
  await expect.poll(async () => (await textAlternative(chart)).rows).toBeGreaterThan(0)
  const view = await textAlternative(chart)
  expect(view.role).toBe('img')
  expect(view.name).toContain('Bubble chart of Bonds, Equity')
  expect(view.headers).toEqual(['risk', 'Bonds', 'Equity'])
})

test('the author aria-label names the plot, and the table lists at most 100 rows', async ({ page, scenario }) => {
  await scenario('two-series')
  const chart = page.locator('c2-line-chart')
  await chart.evaluate(async (element) => {
    element.setAttribute('aria-label', 'Weekly signups')
    const rows = Array.from({ length: 150 }, (_item, index) => ({ t: index, s0: index, s1: index * 2 }))
    ;(element as unknown as { data: unknown }).data = rows
    await (element as unknown as { updateComplete: Promise<boolean> }).updateComplete
  })
  await expect.poll(async () => (await textAlternative(chart)).rows).toBe(100)
  const view = await textAlternative(chart)
  expect(view.name).toBe('Weekly signups')
  const caption = await chart.evaluate((element) => element.shadowRoot?.querySelector('.a11y-root caption')?.textContent?.trim())
  expect(caption).toBe('Weekly signups. The table lists the first 100 of 150 rows.')
})

// `aria-label` is not a reactive property of the chart: the host observes it, so renaming a rendered chart renames
// its plot with no other change to trigger a render.
test('changing the aria-label after the first render renames the plot', async ({ page, scenario }) => {
  await scenario('two-series')
  const chart = page.locator('c2-line-chart')
  await expect(chart).toHaveState('ready')
  await expect.poll(async () => (await textAlternative(chart)).name).toContain('Line chart of First, Second')

  await chart.evaluate((element) => element.setAttribute('aria-label', 'Weekly signups'))
  await expect.poll(async () => (await textAlternative(chart)).name).toBe('Weekly signups')
  await chart.evaluate((element) => element.setAttribute('aria-label', 'Monthly signups'))
  await expect.poll(async () => (await textAlternative(chart)).name).toBe('Monthly signups')
  expect((await textAlternative(chart)).role).toBe('img')
  await chart.evaluate((element) => element.removeAttribute('aria-label'))
  await expect.poll(async () => (await textAlternative(chart)).name).toContain('Line chart of First, Second')
})

test('a chart that describes itself keeps its own table and gets no second one', async ({ page, scenario }) => {
  await scenario('treemap')
  const chart = page.locator('c2-treemap-chart')
  await expect(chart).toHaveState('ready')
  expect(await chart.evaluate((element) => element.shadowRoot?.querySelectorAll('.a11y-root').length)).toBe(0)
})

for (const scenarioName of ['two-series', 'pie']) {
  test(`${scenarioName} with its text alternative has no automated accessibility violations`, async ({ page, scenario }) => {
    await scenario(scenarioName)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
