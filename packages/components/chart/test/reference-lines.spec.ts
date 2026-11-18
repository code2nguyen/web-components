import type { Page } from '@playwright/test'
import { expect, test } from './fixture'

/**
 * The line chart's `reference-lines` and per-series `points="only"`, the two pieces a control chart is drawn with.
 * Both are painted on uPlot's canvas, so they are measured by counting the pixels of a contrasting colour.
 */

const ROWS = JSON.stringify(
  Array.from({ length: 12 }, (_item, index) => ({ t: index, a: 10 + ((index * 7) % 13), flag: index === 3 || index === 8 ? 15 : null })),
)

/** Mounts `markup` in the scenario page, waits for its first draw and counts the opaque pixels close to `rgb`. */
async function paint(page: Page, markup: string, rgb: [number, number, number]): Promise<number> {
  return page.evaluate(
    async ({ markup, rgb }) => {
      // Load the reference-line module first, from the same URL the chart imports it from, so its rebuild is not left to a network race.
      if (markup.includes('reference-lines=')) await import(/* @vite-ignore */ '/packages/components/chart/src/reference-lines.ts')
      const main = document.querySelector('main')!
      main.innerHTML = markup
      const chart = main.firstElementChild as HTMLElement
      await new Promise<void>((resolve) => {
        if (chart.matches(':state(ready)')) return resolve()
        chart.addEventListener('chart-ready', () => resolve(), { once: true })
      })
      // The reference lines arrive with a module loaded on first use, which rebuilds the plot once it lands. The page
      // loaded it before mounting (see below), so the chart's own import resolves at once; wait for that rebuild.
      if ((chart as HTMLElement & { referenceLines?: unknown[] }).referenceLines?.length) {
        for (let tick = 0; tick < 3; tick += 1) {
          await new Promise((resolve) => setTimeout(resolve))
          await (chart as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
        }
      }
      for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve))
      let matching = 0
      for (const canvas of chart.shadowRoot!.querySelectorAll('canvas')) {
        const context = canvas.getContext('2d')
        if (!context || !canvas.width || !canvas.height) continue
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        for (let index = 0; index < data.length; index += 4) {
          if (
            data[index + 3] > 200 &&
            Math.abs(data[index] - rgb[0]) <= 24 &&
            Math.abs(data[index + 1] - rgb[1]) <= 24 &&
            Math.abs(data[index + 2] - rgb[2]) <= 24
          )
            matching += 1
        }
      }
      return matching
    },
    { markup, rgb },
  )
}

const RED: [number, number, number] = [255, 0, 0]
const BLUE: [number, number, number] = [0, 0, 255]

const chart = (attributes: string, style = '') =>
  `<c2-line-chart style="width:480px;height:280px;--c2-chart__annotation__danger--color:#ff0000;--c2-chart__annotation__info--color:#0000ff;${style}" x-field="t" legend="none" data='${ROWS}' ${attributes}><c2-chart-series field="a" color="#18181b"></c2-chart-series></c2-line-chart>`

test('a rule is drawn in its tone, and the y scale stretches to a rule the data never reaches', async ({ page, scenario }) => {
  await scenario('empty')
  expect(await paint(page, chart(''), RED)).toBe(0)
  // The data runs from 10 to 22; a limit at 100 is drawn only if the scale reaches it.
  const rule = await paint(page, chart(`reference-lines='[{"value":100,"tone":"danger"}]'`), RED)
  expect(rule).toBeGreaterThan(200)
  // A fixed y-max wins: the rule is above the scale, so nothing is drawn.
  expect(await paint(page, chart(`y-max="30" reference-lines='[{"value":100,"tone":"danger"}]'`), RED)).toBe(0)
  // The rule's width follows the annotation line variable.
  const thick = await paint(
    page,
    chart(`reference-lines='[{"value":100,"tone":"danger"}]'`, '--c2-chart__annotation-line--border-width:4px;--c2-chart__annotation-line--border-style:solid'),
    RED,
  )
  expect(thick).toBeGreaterThan(rule * 3)
})

test('a band shades the range between value and value2 at the range opacity', async ({ page, scenario }) => {
  await scenario('empty')
  const band = (opacity: string) => chart(`reference-lines='[{"value":12,"value2":18,"tone":"info"}]'`, `--c2-chart__annotation-range--opacity:${opacity}`)
  // At the default opacity the fill is a faint tint, never the full colour.
  expect(await paint(page, band('0.12'), BLUE)).toBe(0)
  // Opaque, it covers the plot's width over a third of its height or so.
  expect(await paint(page, band('1'), BLUE)).toBeGreaterThan(400 * 40)
})

test('a series with points="only" draws markers without a line', async ({ page, scenario }) => {
  await scenario('empty')
  const flags = (points: string) =>
    `<c2-line-chart style="width:480px;height:280px" x-field="t" legend="none" data='${ROWS}'><c2-chart-series field="a" color="#18181b"></c2-chart-series><c2-chart-series field="flag" color="#ff0000" ${points}></c2-chart-series></c2-line-chart>`
  // Two isolated values: a line draws nothing for them, the chart's own `points="auto"` shows no marker either.
  expect(await paint(page, flags(''), RED)).toBe(0)
  const markers = await paint(page, flags('points="only"'), RED)
  expect(markers).toBeGreaterThan(40)
  // A series spanning every row draws no segments between its markers: far fewer pixels than its line.
  const full = (points: string) =>
    `<c2-line-chart style="width:480px;height:280px" x-field="t" legend="none" data='[{"t":0,"a":10},{"t":1,"a":10},{"t":2,"a":10},{"t":3,"a":10}]'><c2-chart-series field="a" color="#ff0000" ${points}></c2-chart-series></c2-line-chart>`
  const line = await paint(page, full('points="none"'), RED)
  const dots = await paint(page, full('points="only"'), RED)
  expect(dots).toBeGreaterThan(0)
  expect(dots).toBeLessThan(line / 2)
})

test('labelled rules and bands are read out in the chart’s accessible name, unless the author named it', async ({ page, scenario }) => {
  await scenario('empty')
  const lines = `reference-lines='[{"value":20,"label":"UCL","tone":"danger"},{"value":11,"value2":13,"label":"Zone C"},{"value":15}]'`
  await paint(page, chart(lines), RED)
  const plot = page.locator('main c2-line-chart .plot')
  await expect(plot).toHaveAttribute('aria-label', /\. Reference lines: UCL 20, Zone C 11 to 13$/)

  await paint(page, chart(`aria-label="Diameter" ${lines}`), RED)
  await expect(plot).toHaveAttribute('aria-label', 'Diameter')
})

test('setting reference-lines after the first draw redraws them, and clearing them removes them', async ({ page, scenario }) => {
  await scenario('empty')
  await paint(page, chart(''), RED)
  const count = () =>
    page.locator('main c2-line-chart').evaluate(async (element) => {
      for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve))
      let matching = 0
      for (const canvas of element.shadowRoot!.querySelectorAll('canvas')) {
        const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
        for (let index = 0; index < data.length; index += 4)
          if (data[index + 3] > 200 && data[index] > 230 && data[index + 1] < 30 && data[index + 2] < 30) matching += 1
      }
      return matching
    })
  const set = (value: unknown) =>
    page.locator('main c2-line-chart').evaluate(async (element, lines) => {
      const chart = element as HTMLElement & { referenceLines?: unknown; updateComplete: Promise<boolean> }
      chart.referenceLines = lines
      await chart.updateComplete
    }, value)
  await set([{ value: 18, tone: 'danger' }])
  await expect.poll(count).toBeGreaterThan(100)
  await set(undefined)
  await expect.poll(count).toBe(0)
})

test('a line chart without reference lines never loads their module', async ({ page, scenario }) => {
  await scenario('empty')
  await paint(page, chart(''), RED)
  const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('reference-lines')))
  expect(await loaded()).toBe(false)
  await paint(page, chart(`reference-lines='[{"value":18,"tone":"danger"}]'`), RED)
  expect(await loaded()).toBe(true)
})

test('a y bound removed from markup reads as auto again, so the scale still reaches the rules', async ({ page, scenario }) => {
  await scenario('empty')
  expect(await paint(page, chart(`y-max="30" reference-lines='[{"value":100,"tone":"danger"}]'`), RED)).toBe(0)
  const red = await page.locator('main c2-line-chart').evaluate(async (element) => {
    const chart = element as HTMLElement & { updateComplete: Promise<boolean> }
    chart.removeAttribute('y-max')
    await chart.updateComplete
    for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve))
    let matching = 0
    for (const canvas of chart.shadowRoot!.querySelectorAll('canvas')) {
      const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      for (let index = 0; index < data.length; index += 4)
        if (data[index + 3] > 200 && data[index] > 230 && data[index + 1] < 30 && data[index + 2] < 30) matching += 1
    }
    return matching
  })
  expect(red).toBeGreaterThan(200)
})

test('a marker-only series leaves the tooltip at a row it does not mark', async ({ page, scenario }) => {
  await scenario('empty')
  await paint(
    page,
    `<c2-line-chart style="width:480px;height:280px" x-field="t" legend="none" data='${ROWS}'><c2-chart-series field="a" label="Value"></c2-chart-series><c2-chart-series field="flag" label="Flagged" points="only"></c2-chart-series></c2-line-chart>`,
    RED,
  )
  const labels = (index: number) =>
    page.locator('main c2-line-chart').evaluate((element, index) => {
      const chart = element as unknown as { tooltipContextAt(detail: object): { entries: { series: { label?: string } }[] } }
      return chart.tooltipContextAt({ index, seriesIndex: 0, px: 0, py: 0 }).entries.map((entry) => entry.series.label)
    }, index)
  expect(await labels(2)).toEqual(['Value'])
  expect(await labels(3)).toEqual(['Value', 'Flagged'])
})

test('two labelled rules at the same value both get their label, side by side', async ({ page, scenario }) => {
  await scenario('empty')
  const lines = (...labels: string[]) => chart(`reference-lines='${JSON.stringify(labels.map((label) => ({ value: 16, label, tone: 'danger' })))}'`)
  const rule = await paint(page, lines(''), RED)
  const target = (await paint(page, lines('Target'), RED)) - rule
  const centre = await paint(page, lines('Centre line'), RED)
  const both = await paint(page, lines('Centre line', 'Target'), RED)
  expect(target).toBeGreaterThan(20)
  // Drawn beside "Centre line", the "Target" text adds all of its pixels; drawn over it, it would add few.
  expect(both - centre).toBeGreaterThan(target * 0.8)
})
