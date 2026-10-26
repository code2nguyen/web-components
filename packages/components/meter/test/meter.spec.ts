import { test, expect, accessible } from '../../../../tests/component-fixture'

const track = (page: import('@playwright/test').Page) => page.locator('c2-meter').locator('[part="track"]')
const fill = (page: import('@playwright/test').Page) => page.locator('c2-meter').locator('[part="indicator"]')

async function widthRatio(page: import('@playwright/test').Page, part: string, index = 0) {
  const [outer, inner] = await Promise.all([track(page).boundingBox(), page.locator('c2-meter').locator(`[part="${part}"]`).nth(index).boundingBox()])
  return inner!.width / outer!.width
}

test('exposes a labelled meter with its range and value, and fills its share of the track', async ({ page, renderScenario }) => {
  await renderScenario('<c2-meter value="30" max="200">Storage</c2-meter>')
  const meter = page.getByRole('meter', { name: 'Storage' })
  await expect(meter).toHaveAttribute('aria-valuenow', '30')
  await expect(meter).toHaveAttribute('aria-valuemin', '0')
  await expect(meter).toHaveAttribute('aria-valuemax', '200')
  await expect(page.locator('c2-meter').locator('[part="value"]')).toHaveText('15%')
  await expect.poll(() => widthRatio(page, 'indicator')).toBeCloseTo(0.15, 2)
  await accessible(page)
})

test('clamps the value to the range and handles a range that does not start at zero', async ({ page, renderScenario }) => {
  await renderScenario('<c2-meter label="Temperature" min="-20" max="20" value="35"></c2-meter>')
  const meter = page.getByRole('meter', { name: 'Temperature' })
  await expect(meter).toHaveAttribute('aria-valuenow', '20')
  await expect(page.locator('c2-meter').locator('[part="value"]')).toHaveText('100%')
  await page.locator('c2-meter').evaluate((el) => ((el as HTMLElement & { value: number }).value = 0))
  await expect(meter).toHaveAttribute('aria-valuenow', '0')
  await expect(page.locator('c2-meter').locator('[part="value"]')).toHaveText('50%')
})

test('value-text replaces the percentage, shown and announced; the value slot replaces only what is shown', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-meter id="a" value="12.4" max="15" value-text="12.4 GB of 15 GB">Storage</c2-meter>
    <c2-meter id="b" value="3" max="5" value-text="3 seats used">Seats<span slot="value">3 / 5</span></c2-meter>
  `)
  await expect(page.getByRole('meter', { name: 'Storage' })).toHaveAttribute('aria-valuetext', '12.4 GB of 15 GB')
  await expect(page.locator('#a').locator('[part="value"]')).toHaveText('12.4 GB of 15 GB')
  await expect(page.getByRole('meter', { name: 'Seats' })).toHaveAttribute('aria-valuetext', '3 seats used')
  await expect(page.locator('#b [slot="value"]')).toBeVisible()
})

for (const [scenario, markup, tone] of [
  ['no thresholds', '<c2-meter value="95">Usage</c2-meter>', 'optimum'],
  ['optimum low, value low', '<c2-meter low="60" high="85" optimum="0" value="40">Usage</c2-meter>', 'optimum'],
  ['optimum low, value between', '<c2-meter low="60" high="85" optimum="0" value="70">Usage</c2-meter>', 'suboptimum'],
  ['optimum low, value high', '<c2-meter low="60" high="85" optimum="0" value="90">Usage</c2-meter>', 'critical'],
  ['optimum high, value low', '<c2-meter low="20" high="80" optimum="100" value="10">Battery</c2-meter>', 'critical'],
  ['optimum high, value high', '<c2-meter low="20" high="80" optimum="100" value="90">Battery</c2-meter>', 'optimum'],
  ['optimum middle, value outside', '<c2-meter low="40" high="60" value="80">Balance</c2-meter>', 'suboptimum'],
] as const) {
  test(`judges the value like the native meter: ${scenario}`, async ({ page, renderScenario }) => {
    await renderScenario(markup)
    const meter = page.locator('c2-meter')
    await expect.poll(() => meter.evaluate((el, t) => el.matches(`:state(${t})`), tone)).toBe(true)
    await expect.poll(() => meter.evaluate((el: Element & { tone?: string }) => el.tone)).toBe(tone)
  })
}

test('colours the fill by tone', async ({ page, renderScenario }) => {
  await renderScenario('<c2-meter low="60" high="85" optimum="0" value="90">Usage</c2-meter>')
  await expect(fill(page)).toHaveCSS('background-color', 'rgb(220, 38, 38)')
  await page.locator('c2-meter').evaluate((el) => ((el as HTMLElement & { value: number }).value = 70))
  await expect(fill(page)).toHaveCSS('background-color', 'rgb(217, 119, 6)')
  await page.locator('c2-meter').evaluate((el) => ((el as HTMLElement & { value: number }).value = 10))
  await expect(fill(page)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
})

const storage = JSON.stringify([
  { label: 'Photos', value: 6 },
  { label: 'Documents', value: 3 },
  { label: 'Mail', value: 1.5, color: 'rgb(0, 128, 0)' },
])

test('segments split the bar, add a legend and announce each part with the total', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-meter max="15" segments='${storage}'>Storage</c2-meter>`)
  const meter = page.getByRole('meter', { name: 'Storage' })
  await expect(meter).toHaveAttribute('aria-valuenow', '10.5')
  await expect(meter).toHaveAttribute('aria-valuetext', 'Photos: 6, Documents: 3, Mail: 1.5, 10.5 of 15')
  await expect(page.locator('c2-meter').locator('[part="value"]')).toHaveText('10.5 of 15')
  const segments = page.locator('c2-meter').locator('[part="segment"]')
  await expect(segments).toHaveCount(3)
  await expect.poll(() => widthRatio(page, 'segment', 0)).toBeCloseTo(6 / 15, 1)
  await expect(segments.nth(0)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await expect(segments.nth(1)).toHaveCSS('background-color', 'rgb(15, 118, 110)')
  await expect(segments.nth(2)).toHaveCSS('background-color', 'rgb(0, 128, 0)')
  const legend = page.locator('c2-meter').locator('[part="legend-item"]')
  await expect(legend).toHaveText([/Photos\s*6/, /Documents\s*3/, /Mail\s*1.5/])
  await expect(page.locator('c2-meter').locator('[part="swatch"]').nth(2)).toHaveCSS('background-color', 'rgb(0, 128, 0)')
  await accessible(page)
})

test('segments past the maximum are cut at the end of the track', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-meter max="10" segments='[{"label":"A","value":8},{"label":"B","value":5},{"label":"C","value":2}]'>Quota</c2-meter>`)
  await expect(page.getByRole('meter', { name: 'Quota' })).toHaveAttribute('aria-valuenow', '10')
  await expect.poll(() => widthRatio(page, 'segment', 1)).toBeCloseTo(0.2, 1)
  await expect(page.locator('c2-meter').locator('[part="segment"]').nth(2)).toBeHidden()
})

test('without a label it still has a translatable name, and numbers follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-meter id="en" value="40"></c2-meter>
    <div lang="fr"><c2-meter id="fr" max="15" segments='[{"label":"Photos","value":6.5}]'></c2-meter></div>
  `)
  await expect(page.getByRole('meter', { name: 'Meter' })).toHaveAttribute('aria-valuenow', '40')
  const french = page.getByRole('meter', { name: 'Jauge' })
  await expect(french).toHaveAttribute('aria-valuetext', 'Photos : 6,5, 6,5 sur 15')
  await expect(page.locator('#fr').locator('[part="value"]')).toHaveText('6,5 sur 15')
})

test('the shown value can be hidden through its variable and is still announced', async ({ page, renderScenario }) => {
  await renderScenario('<c2-meter value="12" max="15" value-text="12 of 15" style="--c2-meter__value--display: none">Seats</c2-meter>')
  await expect(page.locator('c2-meter').locator('[part="value"]')).toBeHidden()
  await expect(page.getByRole('meter', { name: 'Seats' })).toHaveAttribute('aria-valuetext', '12 of 15')
})
