import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const glucose = JSON.stringify([
  { label: 'Low', to: 70, tone: 'suboptimum' },
  { label: 'Normal', to: 100, tone: 'optimum' },
  { label: 'Prediabetes', to: 126, tone: 'suboptimum' },
  { label: 'Diabetes', tone: 'critical' },
])

const indicator = (page: Page) => page.locator('c2-range-indicator')

/** Centre of a part, as a fraction of the track's width from its inline start. */
async function along(host: Locator, part: string, index = 0) {
  const [track, box] = await Promise.all([host.locator('[part="track"]').boundingBox(), host.locator(`[part="${part}"]`).nth(index).boundingBox()])
  return (box!.x + box!.width / 2 - track!.x) / track!.width
}

test('is a meter named by its label, valued with the number and the band it falls in', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator min="40" max="160" value="88" value-text="88 mg/dL" bands='${glucose}'>Fasting glucose</c2-range-indicator>`)
  const host = indicator(page)
  await expect(host).toHaveHostAria('role', 'meter')
  await expect(host).toHaveHostAria('aria-label', 'Fasting glucose')
  await expect(host).toHaveHostAria('aria-valuemin', '40')
  await expect(host).toHaveHostAria('aria-valuemax', '160')
  await expect(host).toHaveHostAria('aria-valuenow', '88')
  await expect(host).toHaveHostAria('aria-valuetext', '88 mg/dL, Normal')
  await expect(host.locator('[part="value"]')).toHaveText('88 mg/dL')
  await expect(host.locator('[part="status"]')).toHaveText('Normal')
  await expect(host).toHaveState('optimum')
  expect(await host.evaluate((el) => (el as HTMLElement & { band?: { label: string } }).band?.label)).toBe('Normal')
  await accessible(page)
})

test('draws each band at its place on the scale, coloured by tone, with its label under it and numbers where bands meet', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator min="40" max="160" value="88" bands='${glucose}'>Glucose</c2-range-indicator>`)
  const host = indicator(page)
  const bands = host.locator('[part="band"]')
  await expect(bands).toHaveCount(4)
  await expect(bands.nth(0)).toHaveCSS('background-color', 'rgb(217, 119, 6)')
  await expect(bands.nth(1)).toHaveCSS('background-color', 'rgb(22, 163, 74)')
  await expect(bands.nth(3)).toHaveCSS('background-color', 'rgb(220, 38, 38)')
  // Normal runs from 70 to 100 on a 40–160 scale: its middle is at 85, a quarter... (85 - 40) / 120.
  expect(await along(host, 'band', 1)).toBeCloseTo((85 - 40) / 120, 1)
  await expect(host.locator('[part="band-label"]')).toHaveText(['Low', 'Normal', 'Prediabetes', 'Diabetes'])
  await expect(host.locator('[part="tick"]')).toHaveText(['70', '100', '126'])
  expect(await along(host, 'tick', 1)).toBeCloseTo((100 - 40) / 120, 2)
  expect(await along(host, 'pointer')).toBeCloseTo((88 - 40) / 120, 2)
  // Bands that meet are separated by the gap, carved from the end of the first.
  await expect(bands.nth(0)).toHaveCSS('border-right-width', '2px')
  await expect(bands.nth(3)).toHaveCSS('border-right-width', '0px')
})

test('the value moves the pointer, the band label and the tone state', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator min="40" max="160" value="88" bands='${glucose}'>Glucose</c2-range-indicator>`)
  const host = indicator(page)
  await host.evaluate((el) => ((el as HTMLElement & { value: number }).value = 142))
  await expect(host).toHaveState('critical')
  await expect(host).not.toHaveState('optimum')
  await expect(host.locator('[part="status"]')).toHaveText('Diabetes')
  await expect(host).toHaveHostAria('aria-valuetext', '142, Diabetes')
  // A value on a boundary belongs to the band that starts there.
  await host.evaluate((el) => ((el as HTMLElement & { value: number }).value = 100))
  await expect(host.locator('[part="status"]')).toHaveText('Prediabetes')
  await expect(host).toHaveState('suboptimum')
  // The band that ends at max keeps max.
  await host.evaluate((el) => ((el as HTMLElement & { value: number }).value = 160))
  await expect(host.locator('[part="status"]')).toHaveText('Diabetes')
})

test('a value off the scale pins the pointer to that end as an arrow and counts in the end band', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator min="40" max="160" value="12" bands='${glucose}'>Glucose</c2-range-indicator>`)
  const host = indicator(page)
  await expect(host).toHaveState('below-scale')
  await expect(host).toHaveState('suboptimum')
  await expect(host).toHaveHostAria('aria-valuenow', '40')
  await expect(host).toHaveHostAria('aria-valuetext', '12, Low')
  await expect(host.locator('[part="value"]')).toHaveText('12')
  const track = (await host.locator('[part="track"]').boundingBox())!
  const pointer = host.locator('[part="pointer"]')
  const arrowLeft = await pointer.evaluate((el) => el.getBoundingClientRect().left)
  expect(Math.abs(arrowLeft - track.x)).toBeLessThan(1)
  await expect.poll(() => pointer.evaluate((el) => getComputedStyle(el, '::before').clipPath)).toMatch(/^polygon\(100% 0(px)?, 100% 100%, 0(px)? 50%\)$/)
  await host.evaluate((el) => ((el as HTMLElement & { value: number }).value = 300))
  await expect(host).toHaveState('above-scale')
  await expect(host).not.toHaveState('below-scale')
  await expect(host).toHaveState('critical')
})

test('bands can leave parts of the scale bare: a reference range alone on the track', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator min="2.5" max="6" value="5.6" bands='[{"label":"Reference","from":3.5,"to":5.1}]'>Potassium</c2-range-indicator>`)
  const host = indicator(page)
  await expect(host.locator('[part="band"]')).toHaveCount(1)
  await expect(host.locator('[part="band"]')).toHaveCSS('background-color', 'rgb(161, 161, 170)')
  await expect(host.locator('[part="tick"]')).toHaveText(['3.5', '5.1'])
  // Outside every band: no band label, no tone.
  await expect(host.locator('[part="status"]')).toHaveCount(0)
  await expect(host).toHaveHostAria('aria-valuetext', '5.6')
  await expect(host).not.toHaveState('optimum')
  await expect(host).not.toHaveState('above-scale')
  await accessible(page)
})

test('a band colour, the variables and the value slot restyle it; hidden rows stay announced', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-range-indicator
      value="118000"
      min="90000"
      max="140000"
      style="--c2-range-indicator__ticks--display: none; --c2-range-indicator__status--display: none; --c2-range-indicator__pointer--color: rgb(0, 0, 255)"
      bands='[{"label":"Low","to":105000},{"label":"Mid","to":125000,"color":"rgb(2, 101, 220)"},{"label":"High"}]'
      >Base salary<span slot="value">$118k</span></c2-range-indicator
    >
  `)
  const host = indicator(page)
  await expect(host.locator('[part="band"]').nth(1)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await expect(host.locator('[part="ticks"]')).toBeHidden()
  await expect(host.locator('[part="status"]')).toBeHidden()
  await expect(page.locator('[slot="value"]')).toBeVisible()
  await expect(host).toHaveHostAria('aria-valuetext', '118,000, Mid')
  await expect.poll(() => host.locator('[part="pointer"]').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgb(0, 0, 255)')
})

test('without a label it has a translatable name, and numbers follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-range-indicator id="en" value="4"></c2-range-indicator>
    <div lang="fr"><c2-range-indicator id="fr" min="2.5" max="6" value="5.6" bands='[{"label":"Normal","from":3.5,"to":5.1},{"label":"Élevé"}]'></c2-range-indicator></div>
  `)
  await expect(page.locator('#en')).toHaveHostAria('aria-label', 'Range')
  const french = page.locator('#fr')
  await expect(french).toHaveHostAria('aria-label', 'Plage')
  await expect(french).toHaveHostAria('aria-valuetext', '5,6, Élevé')
  await expect(french.locator('[part="tick"]')).toHaveText(['3,5', '5,1'])
})

test('follows the writing direction', async ({ page, renderScenario }) => {
  await renderScenario(`<div dir="rtl"><c2-range-indicator value="25" bands='[{"label":"A","to":50},{"label":"B"}]'>RTL</c2-range-indicator></div>`)
  const host = indicator(page)
  const [track, pointer] = await Promise.all([host.locator('[part="track"]').boundingBox(), host.locator('[part="pointer"]').boundingBox()])
  // A quarter of the way from the right-hand start.
  expect((track!.x + track!.width - pointer!.x) / track!.width).toBeCloseTo(0.25, 2)
})

test('a slotted label names it and is not announced twice', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator label="Fallback" value="10"><b>PHQ-9</b> score</c2-range-indicator>`)
  const host = indicator(page)
  await expect(host).toHaveHostAria('aria-label', 'PHQ-9 score')
  await expect(host.locator('[part="label"]')).toBeVisible()
  await accessible(page)
})

test('the name follows the label text when it changes in place', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-range-indicator value="10">Sodium<span slot="value">10</span></c2-range-indicator>`)
  const host = indicator(page)
  await expect(host).toHaveHostAria('aria-label', 'Sodium')
  // A framework updating the text node fires no slotchange; the value slot's text is not part of the name.
  await host.evaluate((el) => (el.firstChild!.textContent = 'Potassium'))
  await expect(host).toHaveHostAria('aria-label', 'Potassium')
  // A framework's marker comments are not label text.
  await host.evaluate((el) => el.prepend(document.createComment('?lit$123$')))
  await expect(host).toHaveHostAria('aria-label', 'Potassium')
})

test('a long label and value text in a narrow box wrap instead of overlapping', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-range-indicator style="width: 180px" min="90000" max="140000" value="118000" value-text="$118,000 · 56th percentile" bands='[{"label":"Low","to":105000},{"label":"Mid","to":125000},{"label":"High"}]'>Senior engineer, L5</c2-range-indicator>`,
  )
  const host = indicator(page)
  const [label, value, track] = await Promise.all(['label', 'value', 'track'].map((part) => host.locator(`[part="${part}"]`).boundingBox()))
  expect(label!.y + label!.height <= value!.y + 0.5 || label!.x + label!.width <= value!.x + 0.5).toBe(true)
  expect(value!.x + value!.width).toBeLessThanOrEqual(track!.x + track!.width + 0.5)
})
