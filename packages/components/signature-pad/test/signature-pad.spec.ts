import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const pad = (page: Page) => page.locator('c2-signature-pad').first()
const surface = (page: Page) => page.getByRole('img').first()
const paths = (page: Page) => pad(page).locator('[part="ink"] path')
const events = async (page: Page) => JSON.parse((await pad(page).getAttribute('data-events')) ?? '[]') as unknown[]

/** Draws a stroke through `points`, given as fractions of the pad's width and height. */
async function sign(page: Page, points: [number, number][]) {
  const box = (await pad(page).locator('[part="pad"]').boundingBox())!
  const at = ([x, y]: [number, number]) => [box.x + x * box.width, box.y + y * box.height] as const
  await page.mouse.move(...at(points[0]))
  await page.mouse.down()
  for (const point of points.slice(1)) await page.mouse.move(...at(point), { steps: 4 })
  await page.mouse.up()
}

const scribble: [number, number][] = [
  [0.1, 0.6],
  [0.25, 0.3],
  [0.4, 0.7],
  [0.55, 0.35],
]

test('an empty pad is a named image that says it is not signed, with a hint and inactive buttons', async ({ page, renderScenario }) => {
  await renderScenario('<c2-signature-pad></c2-signature-pad>')
  await expect(surface(page)).toHaveAccessibleName('Signature')
  await expect(surface(page)).toHaveAccessibleDescription('Not signed yet')
  await expect(pad(page).locator('[part="placeholder"]')).toHaveText('Sign here')
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('button', { name: 'Clear' })).toHaveAttribute('aria-disabled', 'true')
  expect(await pad(page).evaluate((element) => element.isEmpty)).toBe(true)
  await accessible(page)
})

test('a stroke draws a smooth path, hides the hint and fires input and change once', async ({ page, renderScenario }) => {
  await renderScenario('<c2-signature-pad></c2-signature-pad>')
  await watch(pad(page), 'change')
  await sign(page, scribble)
  await expect(paths(page)).toHaveCount(1)
  await expect(paths(page)).toHaveAttribute('d', /^M[\d.]+ [\d.]+(Q[\d. ]+)+L[\d.]+ [\d.]+$/)
  await expect(pad(page).locator('[part="placeholder"]')).toHaveCount(0)
  await expect(surface(page)).toHaveAccessibleDescription('Signed')
  expect(await events(page)).toHaveLength(1)
  const strokes = await pad(page).evaluate((element) => element.strokes)
  expect(strokes).toHaveLength(1)
  expect(strokes[0].length).toBeGreaterThan(4)

  // A tap is a dot.
  const box = (await pad(page).locator('[part="pad"]').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.5)
  await expect(paths(page)).toHaveCount(2)
  await expect(paths(page).nth(1)).toHaveAttribute('d', /l0\.01 0$/)
  await accessible(page)
})

test('Undo takes the last stroke away and Clear empties the pad, from the keyboard too', async ({ page, renderScenario }) => {
  await renderScenario('<c2-signature-pad></c2-signature-pad>')
  await sign(page, scribble)
  await sign(page, [
    [0.6, 0.6],
    [0.9, 0.4],
  ])
  await expect(paths(page)).toHaveCount(2)
  await watch(pad(page), 'input')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(paths(page)).toHaveCount(1)
  await page.getByRole('button', { name: 'Undo' }).press('Enter')
  await expect(paths(page)).toHaveCount(0)
  // Focus stays on Undo, which is now inactive and does nothing.
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await events(page)).toHaveLength(2)

  await sign(page, scribble)
  await page.getByRole('button', { name: 'Clear' }).click()
  await expect(paths(page)).toHaveCount(0)
  await expect(pad(page).locator('[part="placeholder"]')).toBeVisible()
})

test('strokes set from code show a saved signature, and it exports as SVG, a data URL and a blob', async ({ page, renderScenario }) => {
  // The ink on screen is light, as a dark theme draws it; the export takes the export colour.
  await renderScenario(
    '<c2-signature-pad style="--c2-signature-pad__stroke--color: rgb(240, 240, 240); --c2-signature-pad__export__stroke--color: rgb(10, 20, 30); --c2-signature-pad__stroke--width: 3px"></c2-signature-pad>',
  )
  await props(pad(page), {
    strokes: [
      [
        [10, 10],
        [40, 30],
        [80, 20],
      ],
      [[100, 50]],
    ],
  })
  await expect(paths(page)).toHaveCount(2)
  const svg = await pad(page).evaluate((element) => element.toSVG())
  const width = Math.round((await pad(page).locator('[part="pad"]').boundingBox())!.width)
  expect(svg).toContain(`width="${width}"`)
  expect(svg).toContain('stroke="rgb(10, 20, 30)" stroke-width="3"')
  expect(
    await paths(page)
      .first()
      .evaluate((path) => getComputedStyle(path).stroke),
  ).toBe('rgb(240, 240, 240)')
  expect(svg.match(/<path /g)).toHaveLength(2)
  expect(await pad(page).evaluate((element) => element.toDataURL())).toMatch(/^data:image\/png;base64,/)
  expect(await pad(page).evaluate((element) => element.toDataURL('image/jpeg'))).toMatch(/^data:image\/jpeg;base64,/)
  expect(await pad(page).evaluate(async (element) => (await element.toBlob())?.type)).toBe('image/png')
  // Not a stroke: ignored.
  await pad(page).evaluate(async (element) => {
    element.setAttribute('strokes', '[[[1, 2]], "nope", [[3, "x"]]]')
    await element.updateComplete
  })
  await expect(paths(page)).toHaveCount(1)
})

test('it is a form control: submits SVG under its name, required asks for a signature, reset restores the first drawing', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-signature-pad name="signature" required strokes='[[[20, 20], [60, 40]]]'></c2-signature-pad></form>`)
  const data = () => page.locator('form').evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>)
  const valid = () => pad(page).evaluate((element) => element.checkValidity())
  expect((await data()).signature).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg".*<path d="M20 20L60 40"\/>.*<\/svg>$/)
  expect(await valid()).toBe(true)

  await page.getByRole('button', { name: 'Clear' }).click()
  expect(await data()).toEqual({})
  expect(await valid()).toBe(false)
  expect(await pad(page).evaluate((element) => element.validationMessage)).toBe('Sign in the box.')
  // Reporting it moves focus to the pad's first button, where the browser shows the message.
  await pad(page).evaluate((element) => element.reportValidity())
  await expect(page.getByRole('button', { name: 'Undo' })).toBeFocused()

  await sign(page, scribble)
  expect(await valid()).toBe(true)
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  await expect(paths(page)).toHaveCount(1)
  await expect(paths(page)).toHaveAttribute('d', 'M20 20L60 40')
})

test('readonly shows the signature without buttons and takes no strokes; disabled is not submitted', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-signature-pad name="signature" readonly strokes='[[[20, 20], [60, 40]]]'></c2-signature-pad></form>`)
  await expect(page.getByRole('button')).toHaveCount(0)
  await sign(page, scribble)
  await expect(paths(page)).toHaveCount(1)
  await pad(page).evaluate((element) => element.setAttribute('disabled', ''))
  expect(await page.locator('form').evaluate((form: HTMLFormElement) => [...new FormData(form).keys()])).toEqual([])
})

test('draws in its own pixels under a scaled ancestor', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div style="transform: scale(0.5); transform-origin: 0 0; width: 400px"><c2-signature-pad style="--c2-signature-pad--width: 100%"></c2-signature-pad></div>',
  )
  await sign(page, [
    [0.5, 0.5],
    [0.75, 0.5],
  ])
  const [first] = await pad(page).evaluate((element) => element.strokes[0])
  // The middle of a 400 × 200 pad, whatever its size on screen.
  expect(first[0]).toBeCloseTo(200, -1)
  expect(first[1]).toBeCloseTo(100, -1)
})

test('takes its text from the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-signature-pad></c2-signature-pad></div>')
  await expect(pad(page).locator('[part="placeholder"]')).toHaveText('Signez ici')
  await expect(surface(page)).toHaveAccessibleDescription('Pas encore signé')
  await expect(page.getByRole('button', { name: 'Effacer' })).toHaveCount(1)
})
