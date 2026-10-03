import type { Page } from '@playwright/test'
import { expect, test } from './fixture'

/**
 * The mark variables a chart reads from JavaScript and hands to its engine. Each test mounts the same chart twice,
 * once with a contrasting value, and compares the pixels the engine painted: a variable that only reaches the
 * engine options but changes nothing on the canvas would not pass.
 */

const ROWS = JSON.stringify(Array.from({ length: 12 }, (_item, index) => ({ t: index, a: 10 + ((index * 7) % 13), b: 8 + ((index * 5) % 11) })))

/** RGB channels a pixel must match, each within `tolerance`. */
interface Target {
  rgb: [number, number, number]
  tolerance?: number
}

interface Paint {
  /** Pixels matching the target colour. */
  matching: number
  /** Sum of the alpha channel over the whole canvas. */
  alpha: number
}

/** Mounts `markup` in the scenario page, waits for its first draw and measures its canvases. */
async function paint(page: Page, markup: string, target: Target): Promise<Paint> {
  return page.evaluate(
    async ({ markup, target }) => {
      const main = document.querySelector('main')!
      main.innerHTML = markup
      const chart = main.firstElementChild as HTMLElement
      await new Promise<void>((resolve) => {
        if (chart.hasAttribute('data-chart-ready')) return resolve()
        chart.addEventListener('chart-ready', () => resolve(), { once: true })
      })
      // Both engines may draw once more after the ready signal settles the final size.
      for (let frame = 0; frame < 3; frame += 1) await new Promise((resolve) => requestAnimationFrame(resolve))
      const tolerance = target.tolerance ?? 24
      let matching = 0
      let alpha = 0
      for (const canvas of chart.shadowRoot!.querySelectorAll('canvas')) {
        const context = canvas.getContext('2d')
        if (!context || !canvas.width || !canvas.height) continue
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        for (let index = 0; index < data.length; index += 4) {
          alpha += data[index + 3]
          if (
            data[index + 3] > 200 &&
            Math.abs(data[index] - target.rgb[0]) <= tolerance &&
            Math.abs(data[index + 1] - target.rgb[1]) <= tolerance &&
            Math.abs(data[index + 2] - target.rgb[2]) <= tolerance
          )
            matching += 1
        }
      }
      return { matching, alpha }
    },
    { markup, target },
  )
}

const RED: Target = { rgb: [255, 0, 0] }
const BLUE: Target = { rgb: [0, 0, 255] }

for (const tag of ['c2-line-chart', 'c2-bar-chart'] as const) {
  test(`${tag} draws its grid lines at --c2-chart__grid--width`, async ({ page, scenario }) => {
    await scenario('empty')
    const chart = (width: string) =>
      `<${tag} style="width:480px;height:280px;--c2-chart__grid--color:#ff0000;--c2-chart__grid--width:${width}" x-field="t" legend="none" data='${ROWS}'><c2-chart-series field="a"></c2-chart-series></${tag}>`
    const thin = await paint(page, chart('1px'), RED)
    const thick = await paint(page, chart('5px'), RED)
    expect(thin.matching).toBeGreaterThan(0)
    expect(thick.matching).toBeGreaterThan(thin.matching * 3)
  })
}

for (const tag of ['c2-scatter-chart', 'c2-candlestick-chart'] as const) {
  test(`${tag} draws its split lines at --c2-chart__grid--width`, async ({ page, scenario }) => {
    await scenario('empty')
    const fields = tag === 'c2-candlestick-chart' ? 'label-field="t" open-field="a" close-field="b" low-field="b" high-field="a"' : 'x-field="t"'
    const series = tag === 'c2-candlestick-chart' ? '' : '<c2-chart-series field="a"></c2-chart-series>'
    const chart = (width: string) =>
      `<${tag} style="width:480px;height:280px;--c2-chart__grid--color:#ff0000;--c2-chart__grid--width:${width}" ${fields} legend="none" animation="none" data='${ROWS}'>${series}</${tag}>`
    const thin = await paint(page, chart('1px'), RED)
    const thick = await paint(page, chart('5px'), RED)
    expect(thin.matching).toBeGreaterThan(0)
    expect(thick.matching).toBeGreaterThan(thin.matching * 3)
  })
}

test('the radar web rings follow --c2-chart__grid--width', async ({ page, scenario }) => {
  await scenario('empty')
  const chart = (width: string) =>
    `<c2-radar-chart style="width:400px;height:320px;--c2-chart__grid--color:#ff0000;--c2-chart__grid--width:${width}" label-field="t" legend="none" animation="none" data='${ROWS}'><c2-chart-series field="a"></c2-chart-series></c2-radar-chart>`
  const thin = await paint(page, chart('1px'), RED)
  const thick = await paint(page, chart('5px'), RED)
  expect(thin.matching).toBeGreaterThan(0)
  expect(thick.matching).toBeGreaterThan(thin.matching * 2)
})

test('a uPlot chart strokes its axis ticks in --c2-chart__axis-line--color', async ({ page, scenario }) => {
  await scenario('empty')
  const chart = (style: string) =>
    `<c2-line-chart style="width:480px;height:280px;--c2-chart__grid--color:#e4e4e7;${style}" x-field="t" grid="none" legend="none" data='${ROWS}'><c2-chart-series field="a" color="#18181b"></c2-chart-series></c2-line-chart>`
  const unset = await paint(page, chart(''), BLUE)
  const blue = await paint(page, chart('--c2-chart__axis-line--color:#0000ff'), BLUE)
  expect(unset.matching).toBe(0)
  expect(blue.matching).toBeGreaterThan(20)
})

test('a sparkline strokes its tone in --c2-chart__tone-positive--color, falling back to --c2-chart__positive--color', async ({ page, scenario }) => {
  await scenario('empty')
  const spark = (tone: string, style: string) => `<c2-sparkline style="${style}" tone="${tone}" data="[3, 5, 4, 8, 6, 11]"></c2-sparkline>`
  expect((await paint(page, spark('auto', ''), RED)).matching).toBe(0)
  expect((await paint(page, spark('auto', '--c2-chart__tone-positive--color:#ff0000'), RED)).matching).toBeGreaterThan(20)
  expect((await paint(page, spark('positive', '--c2-chart__positive--color:#ff0000'), RED)).matching).toBeGreaterThan(20)
  // The sparkline's own variable wins over the chart-wide one.
  expect((await paint(page, spark('positive', '--c2-chart__positive--color:#0000ff;--c2-chart__tone-positive--color:#ff0000'), RED)).matching).toBeGreaterThan(
    20,
  )
})

test('a sparkline strokes its negative tone in --c2-chart__tone-negative--color', async ({ page, scenario }) => {
  await scenario('empty')
  const spark = (style: string) => `<c2-sparkline style="${style}" tone="auto" data="[11, 6, 8, 4, 5, 3]"></c2-sparkline>`
  expect((await paint(page, spark(''), BLUE)).matching).toBe(0)
  expect((await paint(page, spark('--c2-chart__tone-negative--color:#0000ff'), BLUE)).matching).toBeGreaterThan(20)
})

test('an area sparkline fills at --c2-chart__area--opacity', async ({ page, scenario }) => {
  await scenario('empty')
  const spark = (style: string) => `<c2-sparkline style="${style}" type="area" data="[3, 5, 4, 8, 6, 11]"></c2-sparkline>`
  const faint = await paint(page, spark('--c2-chart__area--opacity:0.05'), RED)
  const solid = await paint(page, spark('--c2-chart__area--opacity:0.9'), RED)
  expect(solid.alpha).toBeGreaterThan(faint.alpha * 2)
})
