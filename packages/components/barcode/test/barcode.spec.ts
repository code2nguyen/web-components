import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

const barcode = (page: Page, selector = 'c2-barcode') => page.locator(selector)
const events = async (locator: Locator) => JSON.parse((await locator.getAttribute('data-events')) ?? '[]')

/** The modules the bars path draws, as a string of 1 (bar) and 0 (space). */
const drawn = (locator: Locator) =>
  locator.locator('[part="bars"] path').evaluate((path) => {
    const svg = path.closest('svg')!
    const width = Number(svg.getAttribute('viewBox')!.split(' ')[2])
    const bits = new Array<number>(width).fill(0)
    for (const [, x, run] of (path.getAttribute('d') ?? '').matchAll(/M(\d+) \d+h(\d+)/g)) bits.fill(1, Number(x), Number(x) + Number(run))
    return bits.join('')
  })

// Module patterns checked against ZXing's decoder when the encoders were written.
const EAN13 = '10100011010100111010111101111010001001011001101010100001010000101000010111010010000101100110101'
const CODE128 =
  '110100100001101110100011000101000110001000101110111011010011011100101110111101100100111011100100110101111011101001101110010011101100101110111101001000110010011100110110011100101100011101011'
const CODE39 = '1000101110111010111011101000101010111000101011101010111010001110100010111011101'
// "123456" as a 10 × 10 Data Matrix, as ZXing's writer draws it.
const MATRIX_123456 = [
  '#.#.#.#.#.',
  '##..#.##.#',
  '##.....#..',
  '##...###.#',
  '##....#...',
  '#.....####',
  '###.##....',
  '####.##..#',
  '#..###.#..',
  '##########',
]

test('an EAN-13 is drawn bar for bar, with its check digit, the standard text split and an image name', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-barcode format="ean13" value="400638133393"></c2-barcode>`)
  expect(await drawn(barcode(page))).toBe(EAN13)
  await expect(barcode(page).locator('[part="text"]')).toHaveText(['4', '006381', '333931'])
  await expect(barcode(page)).toHaveHostAria('role', 'img')
  await expect(barcode(page)).toHaveHostAria('aria-label', 'Barcode, EAN-13: 4006381333931')
  expect(await barcode(page).evaluate((element) => (element as HTMLElement & { encoded: string }).encoded)).toBe('4006381333931')
  // The guards run down into the text line.
  await expect(barcode(page).locator('.guards path')).toHaveAttribute('d', /M0 0h1v1/)
  await accessible(page)
})

test('Code 128 and Code 39 draw their patterns; hide-text drops the line; an aria-label replaces the name', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-barcode id="a" value="SHIP-2026-00417"></c2-barcode><c2-barcode id="b" format="code39" value="c2n" hide-text aria-label="Asset tag"></c2-barcode>`,
  )
  expect(await drawn(barcode(page, '#a'))).toBe(CODE128)
  await expect(barcode(page, '#a').locator('[part="text"]')).toHaveText('SHIP-2026-00417')
  expect(await drawn(barcode(page, '#b'))).toBe(CODE39)
  await expect(barcode(page, '#b').locator('[part="text"]')).toHaveCount(0)
  await expect(barcode(page, '#b')).toHaveHostAria('aria-label', 'Asset tag')
})

test('a Data Matrix is a square of cells with its finder, and has no text line', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-barcode format="datamatrix" value="123456" style="--c2-barcode__module--size: 5px"></c2-barcode>`)
  const rows = await barcode(page)
    .locator('[part="bars"] path')
    .evaluate((path) => {
      const grid = Array.from({ length: 10 }, () => new Array<string>(10).fill('.'))
      for (const [, x, y, run] of (path.getAttribute('d') ?? '').matchAll(/M(\d+) (\d+)h(\d+)/g)) {
        for (let index = 0; index < Number(run); index += 1) grid[Number(y)][Number(x) + index] = '#'
      }
      return grid.map((row) => row.join(''))
    })
  expect(rows).toEqual(MATRIX_123456)
  await expect(barcode(page).locator('[part="text"]')).toHaveCount(0)
  // 10 cells and a quiet zone of 2 on each side, 5px each.
  const box = (await barcode(page).locator('[part="code"]').boundingBox())!
  expect(Math.round(box.width)).toBe(70)
  expect(Math.round(box.height)).toBe(70)
})

test('the size comes from the variables, the format quiet zone is a minimum, and a narrow host shrinks the code', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-barcode id="a" value="12" style="--c2-barcode__module--width: 1px; --c2-barcode--height: 40px; --c2-barcode--quiet-zone: 12; --c2-barcode--padding-block: 0px" hide-text></c2-barcode>
     <c2-barcode id="b" format="ean13" value="400638133393" style="--c2-barcode__module--width: 1px; --c2-barcode--quiet-zone: 0"></c2-barcode>
     <div style="width: 120px"><c2-barcode id="c" value="SHIP-2026-00417"></c2-barcode></div>`,
  )
  // "12": start C, 12, check, stop = 3 × 11 + 13 modules, plus 12 + 12 quiet.
  const a = (await barcode(page, '#a').locator('[part="code"]').boundingBox())!
  expect(Math.round(a.width)).toBe(46 + 24)
  expect(Math.round(a.height)).toBe(40)
  // EAN-13 keeps 11 modules left and 7 right however small the asked quiet zone.
  expect(Math.round((await barcode(page, '#b').locator('[part="code"]').boundingBox())!.width)).toBe(95 + 18)
  expect(Math.round((await barcode(page, '#c').locator('[part="code"]').boundingBox())!.width)).toBe(120)
})

test('a value the format cannot take draws the frame and says why; fixing it draws the code', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-barcode format="ean13"></c2-barcode>`)
  await expect(barcode(page).locator('[part="placeholder"]')).toHaveText('No value')
  await expect(barcode(page)).toHaveHostAria('aria-label', 'Barcode')
  await watch(barcode(page), 'barcode-error')
  await props(barcode(page), { value: '4006381333930' })
  await expect(barcode(page).locator('[part="placeholder"]')).toHaveText("Can't encode this value")
  await expect.poll(async () => (await events(barcode(page))).length).toBe(1)
  await props(barcode(page), { value: '40063813339A' })
  await expect.poll(async () => (await events(barcode(page))).length).toBe(2)
  await props(barcode(page), { value: '4006381333931' })
  await expect(barcode(page).locator('[part="bars"]')).toBeVisible()
  await props(barcode(page), { format: 'ean8' })
  await expect(barcode(page).locator('[part="placeholder"]')).toBeVisible()
  await props(barcode(page), { value: 'é', format: 'code128' })
  await expect.poll(async () => (await events(barcode(page))).length).toBe(4)
})

test('its text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-barcode id="a" format="upca" value="03600029145"></c2-barcode><c2-barcode id="b" format="ean8" value="1"></c2-barcode></div>`,
  )
  await expect(barcode(page, '#a')).toHaveHostAria('aria-label', 'Code-barres, UPC-A : 036000291452')
  await expect(barcode(page, '#b').locator('[part="placeholder"]')).toHaveText('Impossible de coder cette valeur')
})

test('regression: right to left, the bars and the digits under them do not mirror', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-barcode id="ltr" format="ean13" value="400638133393"></c2-barcode><div dir="rtl"><c2-barcode id="rtl" format="ean13" value="400638133393"></c2-barcode></div>`,
  )
  const offsets = (selector: string) =>
    barcode(page, selector).evaluate((element) => {
      const code = element.shadowRoot!.querySelector('[part="code"]')!.getBoundingClientRect()
      return [...element.shadowRoot!.querySelectorAll('[part="text"]')].map((text) => Math.round(text.getBoundingClientRect().left - code.left))
    })
  expect(await offsets('#rtl')).toEqual(await offsets('#ltr'))
})
