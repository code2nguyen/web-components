import { test, expect } from './fixture'

type Group = { key: string; outgoing: number; incoming: number; total: number; share: number }
type Ribbon = { source: string; target: string; value: number; reverse: number; share: number }

interface ChordElement extends HTMLElement {
  groups: Group[]
  flows: Ribbon[]
  highlighted: string | null
  layout: string
  updateComplete: Promise<boolean>
  buildContext(): unknown
  seriesOption(index: number, context: unknown): Record<string, unknown>
  projectData(frame: unknown, context: unknown): { name: string; itemStyle: { color: string; opacity?: number } }[][]
  handleEngineClick(detail: { index: number; seriesIndex: number; dataType?: string }): void
}

test('sums the rows into one flow per pair and leaves out rows that cannot be a ribbon', async ({ page, scenario }) => {
  await scenario('chord')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const { groups, flows } = await chart.evaluate((element) => {
    const chord = element as ChordElement
    return { groups: chord.groups.map((group) => [group.key, group.outgoing, group.incoming]), flows: chord.flows }
  })
  // JPY only appears in a zero-value row and a row without a target, and GBP → GBP is a loop: none of them draw.
  expect(groups).toEqual([
    ['EUR', 62, 30],
    ['USD', 30, 52],
    ['GBP', 10, 20],
  ])
  expect(flows.map((flow) => [flow.source, flow.target, flow.value, flow.reverse])).toEqual([
    ['EUR', 'USD', 42, 30],
    ['USD', 'EUR', 30, 42],
    ['EUR', 'GBP', 20, 0],
    ['GBP', 'USD', 10, 0],
  ])
  expect(flows[0].share).toBeCloseTo(42 / 102)
})

test('hands the engine one chord series with a node per group and a link per flow', async ({ page, scenario }) => {
  await scenario('chord')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const option = await chart.evaluate((element) => {
    const chord = element as ChordElement
    const context = chord.buildContext()
    const series = chord.seriesOption(0, context) as { type: string; links: { source: string; target: string; value: number }[]; lineStyle: { color: string } }
    const nodes = chord.projectData(undefined, context)[0]
    return {
      type: series.type,
      color: series.lineStyle.color,
      links: series.links.map((link) => `${link.source}>${link.target}:${link.value}`),
      nodes: nodes.map((node) => node.name),
    }
  })
  expect(option).toEqual({ type: 'chord', color: 'source', links: ['EUR>USD:42', 'USD>EUR:30', 'EUR>GBP:20', 'GBP>USD:10'], nodes: ['EUR', 'USD', 'GBP'] })
})

test('puts the senders on the right and the receivers, reversed, on the left in a bipartite layout', async ({ page, scenario }) => {
  await scenario('chord-bipartite')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const layout = await chart.evaluate((element) => {
    const chord = element as ChordElement
    const series = chord.seriesOption(0, chord.buildContext()) as { startAngle: number }
    return { order: chord.groups.map((group) => group.key), startAngle: series.startAngle }
  })
  // Every flow counts once at each end, so the senders take exactly half the circle, centred on three o'clock.
  expect(layout).toEqual({ order: ['Q1', 'Q2', 'Q3', 'Canada', 'Japan', 'France'], startAngle: 90 })
})

test('describes a hovered arc or ribbon in the tooltip and the hover events', async ({ page, scenario }) => {
  await scenario('chord')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const events = await chart.evaluate((element) => {
    const seen: string[] = []
    for (const name of ['group-hover', 'ribbon-hover', 'tooltip-change']) {
      element.addEventListener(name, (event) => {
        const detail = (event as CustomEvent).detail as { key?: string; source?: string; target?: string; formattedX?: string } | null
        seen.push(`${name}:${detail ? (detail.key ?? detail.formattedX ?? `${detail.source}>${detail.target}`) : 'null'}`)
      })
    }
    window.chartScenario.hover({ index: 1, seriesIndex: 0, px: 40, py: 40, dataType: 'node' })
    window.chartScenario.hover({ index: 0, seriesIndex: 0, px: 60, py: 60, dataType: 'edge' })
    window.chartScenario.hover(null)
    return seen
  })
  expect(events).toEqual([
    'tooltip-change:USD',
    'group-hover:USD',
    'group-hover:null',
    'tooltip-change:EUR → USD',
    'ribbon-hover:EUR>USD',
    'ribbon-hover:null',
    'tooltip-change:null',
  ])
})

test('highlights a clicked group and dims what it does not touch', async ({ page, scenario }) => {
  await scenario('chord')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const result = await chart.evaluate(async (element) => {
    const chord = element as ChordElement
    const keys: (string | null)[] = []
    chord.addEventListener('series-highlight', (event) => keys.push((event as CustomEvent<{ key: string | null }>).detail.key))
    // GBP is index 2; it touches EUR and USD, so every group stays lit but the EUR ⇄ USD ribbons fade.
    chord.handleEngineClick({ index: 2, seriesIndex: 0, dataType: 'node' })
    await chord.updateComplete
    const series = chord.seriesOption(0, chord.buildContext()) as { links: { source: string; target: string; lineStyle?: { opacity: number } }[] }
    const dimmed = series.links.filter((link) => link.lineStyle).map((link) => `${link.source}>${link.target}`)
    chord.handleEngineClick({ index: 2, seriesIndex: 0, dataType: 'node' })
    await chord.updateComplete
    return { keys, dimmed, after: chord.highlighted }
  })
  expect(result).toEqual({ keys: ['GBP', null], dimmed: ['EUR>USD', 'USD>EUR'], after: null })
})

test('keeps the highlight when group-click is cancelled', async ({ page, scenario }) => {
  await scenario('chord')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const highlighted = await chart.evaluate(async (element) => {
    const chord = element as ChordElement
    chord.addEventListener('group-click', (event) => event.preventDefault())
    chord.handleEngineClick({ index: 0, seriesIndex: 0, dataType: 'node' })
    await chord.updateComplete
    return chord.highlighted
  })
  expect(highlighted).toBeNull()
})

test('hides a group and its flows from a toggle legend, but keeps the colours', async ({ page, scenario }) => {
  await scenario('chord-bipartite')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const before = await chart.evaluate((element) => {
    const chord = element as ChordElement
    return chord.projectData(undefined, chord.buildContext())[0].find((node) => node.name === 'Q2')?.itemStyle.color
  })
  await chart.evaluate((element) => (element.shadowRoot?.querySelector('.legend-item') as HTMLElement | null)?.click())
  await expect
    .poll(() => chart.evaluate((element) => (element as ChordElement).groups.map((group) => group.key)))
    .toEqual(['Q2', 'Q3', 'Canada', 'Japan', 'France'])
  const after = await chart.evaluate((element) => {
    const chord = element as ChordElement
    return chord.projectData(undefined, chord.buildContext())[0].find((node) => node.name === 'Q2')?.itemStyle.color
  })
  expect(after).toBe(before)
})

test('walks the groups from the keyboard and lists every flow for screen readers', async ({ page, scenario }) => {
  await scenario('chord')
  const chart = page.locator('c2-chord-chart')
  await expect(chart).toHaveState('ready')

  const plot = chart.locator('.plot')
  await expect(plot).toHaveAttribute('aria-label', 'Chord diagram of EUR, USD, GBP')
  await expect(chart.locator('table.chord-a11y tbody tr')).toHaveCount(4)

  await plot.focus()
  await page.keyboard.press('ArrowRight')
  await expect(chart.locator('[aria-live]')).toHaveText('EUR: outgoing 62, incoming 30')
  await page.keyboard.press('ArrowLeft')
  await expect(chart.locator('[aria-live]')).toHaveText('GBP: outgoing 10, incoming 20')
  await page.keyboard.press('Enter')
  await expect.poll(() => chart.evaluate((element) => (element as ChordElement).highlighted)).toBe('GBP')
  await page.keyboard.press('Escape')
  await expect.poll(() => chart.evaluate((element) => (element as ChordElement).highlighted)).toBeNull()
})
