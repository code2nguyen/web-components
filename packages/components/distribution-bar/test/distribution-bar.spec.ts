import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const LANGUAGES = JSON.stringify([
  { label: 'TypeScript', value: 820 },
  { label: 'SCSS', value: 120 },
  { label: 'Astro', value: 50 },
  { label: 'Shell', value: 10 },
])

const host = (page: Page, selector = 'c2-distribution-bar') => page.locator(selector)
const segments = (page: Page, selector?: string) => host(page, selector).locator('[part="segment"]')
const legend = (page: Page, selector?: string) => host(page, selector).locator('[part="legend-item"]')
const tooltip = (page: Page, selector?: string) => host(page, selector).locator('[part="tooltip"]')

/** Each segment's width as a share of the bar's. */
async function widths(page: Page, selector?: string): Promise<number[]> {
  const bar = await host(page, selector).locator('[part="bar"]').boundingBox()
  const boxes = await segments(page, selector).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().width))
  return boxes.map((width) => width / bar!.width)
}

test('splits the bar by share, lists every part with its percentage, and is one named image', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-distribution-bar items='${LANGUAGES}'>Languages</c2-distribution-bar>`)
  await expect(segments(page)).toHaveCount(4)
  // The 2px gaps take a little of the width; the shares are otherwise exact.
  const shares = await widths(page)
  expect(shares[0]).toBeCloseTo(0.82, 1)
  expect(shares[1]).toBeCloseTo(0.12, 1)
  expect(shares[0] / shares[1]).toBeCloseTo(820 / 120, 0)
  await expect(legend(page)).toHaveText(['TypeScript 82%', 'SCSS 12%', 'Astro 5%', 'Shell 1%'])
  await expect(page.getByRole('img', { name: 'Languages TypeScript 82%, SCSS 12%, Astro 5%, Shell 1%' })).toBeVisible()
  await accessible(page)
})

test('keeps a sliver of a tiny share visible, and reads it as below the precision', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-distribution-bar label="Tags" items='[{"label":"chrome","value":99999},{"label":"lynx","value":1}]'></c2-distribution-bar>`)
  const sliver = (await segments(page).nth(1).boundingBox())!.width
  expect(sliver).toBeGreaterThanOrEqual(2)
  // At one decimal place the sliver reads as below 0.1%, and its neighbour rounds to the whole.
  await expect(legend(page)).toHaveText(['chrome 100%', 'lynx <0.1%'])
})

test('max-items folds the smallest into Other whatever the order, and sort orders the parts largest first', async ({ page, renderScenario }) => {
  const items = JSON.stringify([
    { label: 'Done', value: 3 },
    { label: 'In progress', value: 10 },
    { label: 'Blocked', value: 1 },
    { label: 'Todo', value: 6 },
  ])
  await renderScenario(`
    <c2-distribution-bar id="folded" label="Status" max-items="3" items='${items}'></c2-distribution-bar>
    <c2-distribution-bar id="sorted" label="Status" sort="descending" items='${items}'></c2-distribution-bar>
  `)
  // In progress and Todo are the two largest and keep their place; Done and Blocked become Other, drawn last in grey.
  await expect(legend(page, '#folded')).toHaveText(['In progress 50%', 'Todo 30%', 'Other 20%'])
  await expect(segments(page, '#folded').last()).toHaveCSS('background-color', 'rgb(161, 161, 170)')
  await expect(legend(page, '#sorted')).toHaveText(['In progress 50%', 'Todo 30%', 'Done 15%', 'Blocked 5%'])
})

test('legend-content shows the value or both, and precision sets the decimals', async ({ page, renderScenario }) => {
  const items = JSON.stringify([
    { label: 'Paid', value: 2 },
    { label: 'Free', value: 1 },
  ])
  await renderScenario(`
    <c2-distribution-bar id="value" label="Plans" legend-content="value" items='${items}'></c2-distribution-bar>
    <c2-distribution-bar id="both" label="Plans" legend-content="both" precision="0" items='${items}'></c2-distribution-bar>
  `)
  await expect(legend(page, '#value')).toHaveText(['Paid 2', 'Free 1'])
  await expect(legend(page, '#both')).toHaveText(['Paid 67% · 2', 'Free 33% · 1'])
})

test('colours each part from the palette unless it has its own colour', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-distribution-bar label="Mix" items='[{"label":"A","value":1},{"label":"B","value":1,"color":"rgb(1, 2, 3)"},{"label":"C","value":1}]'></c2-distribution-bar>`,
  )
  await expect(segments(page).nth(0)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await expect(segments(page).nth(1)).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(segments(page).nth(2)).toHaveCSS('background-color', 'rgb(15, 118, 110)')
  await expect(host(page).locator('[part="swatch"]').nth(1)).toHaveCSS('background-color', 'rgb(1, 2, 3)')
})

test('hovering a segment or a legend entry brings that part forward and names it in the bubble', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-distribution-bar items='${LANGUAGES}'>Languages</c2-distribution-bar>`)
  await expect(tooltip(page)).toBeHidden()
  await segments(page).nth(1).hover()
  await expect(tooltip(page)).toBeVisible()
  await expect(tooltip(page)).toHaveText('SCSS 12% · 120')
  await expect(segments(page).nth(0)).toHaveCSS('opacity', '0.35')
  await expect(segments(page).nth(1)).toHaveCSS('opacity', '1')
  await expect(legend(page).nth(0)).toHaveCSS('opacity', '0.35')
  // The bubble stays over the bar, within its width.
  const [bar, bubble] = await Promise.all([host(page).locator('[part="bar"]').boundingBox(), tooltip(page).boundingBox()])
  expect(bubble!.x).toBeGreaterThanOrEqual(bar!.x - 0.5)
  expect(bubble!.x + bubble!.width).toBeLessThanOrEqual(bar!.x + bar!.width + 0.5)
  expect(bubble!.y + bubble!.height).toBeLessThanOrEqual(bar!.y)

  await legend(page).nth(3).hover()
  await expect(tooltip(page)).toHaveText('Shell 1% · 10')
  await page.mouse.move(0, 0)
  await expect(tooltip(page)).toBeHidden()
  await expect(segments(page).nth(0)).toHaveCSS('opacity', '1')
})

test('interactive: legend entries are buttons and segments clickable, both firing item-click', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-distribution-bar interactive max-items="3" items='${LANGUAGES}'>Languages</c2-distribution-bar><button>After</button>`)
  await host(page).evaluate((element) => {
    ;(window as unknown as { clicks: string[] }).clicks = []
    element.addEventListener('item-click', (event) => {
      const detail = (event as CustomEvent<{ key: string; share: number; items: { label: string }[] }>).detail
      ;(window as unknown as { clicks: string[] }).clicks.push(`${detail.key}:${detail.share.toFixed(2)}:${detail.items.map((item) => item.label).join('+')}`)
    })
  })
  const list = page.getByRole('list', { name: 'Languages' })
  const buttons = list.getByRole('button')
  await expect(buttons).toHaveText(['TypeScript 82%', 'SCSS 12%', 'Other 6%'])
  // The legend speaks for the parts, so the bar is not also an image.
  await expect(page.getByRole('img')).toHaveCount(0)

  await page.keyboard.press('Tab')
  await expect(buttons.nth(0)).toBeFocused()
  await expect(tooltip(page)).toHaveText('TypeScript 82% · 820')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await expect(tooltip(page)).toBeHidden()
  await accessible(page)

  await segments(page).nth(2).click()
  const clicks = await page.evaluate(() => (window as unknown as { clicks: string[] }).clicks)
  expect(clicks).toEqual(['SCSS:0.12:', '__other:0.06:Astro+Shell'])
})

test('without interactive, a click fires nothing and nothing takes focus', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-distribution-bar items='${LANGUAGES}'>Languages</c2-distribution-bar><button>After</button>`)
  await host(page).evaluate((element) => element.addEventListener('item-click', () => ((window as unknown as { fired: boolean }).fired = true)))
  await segments(page).nth(0).click()
  expect(await page.evaluate(() => (window as unknown as { fired?: boolean }).fired)).toBeUndefined()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('with no values it draws an empty bar and says so', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-distribution-bar label="Browsers" items='[{"label":"Chrome","value":0}]'></c2-distribution-bar>`)
  await expect(segments(page)).toHaveCount(0)
  await expect(host(page).locator('[part="legend"]')).toHaveText('No data')
  await expect(page.getByRole('img', { name: 'Browsers No data' })).toBeVisible()
  await expect(host(page).locator('[part="bar"]')).toHaveCSS('background-color', 'rgb(228, 228, 231)')
})

test('without a label it still has a translatable name, and numbers follow the language', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-distribution-bar id="en" items='[{"label":"A","value":1},{"label":"B","value":2}]'></c2-distribution-bar>
    <div lang="fr"><c2-distribution-bar id="fr" max-items="2" items='[{"label":"A","value":1.5},{"label":"B","value":2},{"label":"C","value":6.5}]'></c2-distribution-bar></div>
  `)
  await expect(page.getByRole('img', { name: 'Distribution: A 33.3%, B 66.7%' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Répartition : C 65 %, Autres 35 %' })).toBeVisible()
  await expect(legend(page, '#fr')).toHaveText(['C 65 %', 'Autres 35 %'])
})

test('a header-end slot sits at the end of the label row, and a slotted label names the bar', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-distribution-bar items='${LANGUAGES}'><strong>Code</strong> by language<a slot="header-end" href="#all">All</a></c2-distribution-bar>`,
  )
  await expect(page.getByRole('img', { name: /^Code by language TypeScript 82%/ })).toBeVisible()
  const [label, end] = await Promise.all([host(page).locator('[part="label"]').boundingBox(), page.getByRole('link', { name: 'All' }).boundingBox()])
  expect(end!.x).toBeGreaterThan(label!.x + label!.width)
})
