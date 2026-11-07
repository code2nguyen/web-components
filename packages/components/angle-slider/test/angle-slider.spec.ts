import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { AngleSlider } from '../src/angle-slider'

const slider = (page: Page) => page.locator('c2-angle-slider').first()
const handle = (page: Page) => page.getByRole('slider').first()
const events = async (page: Page) => JSON.parse((await slider(page).getAttribute('data-events')) ?? '[]') as unknown[]
const value = (page: Page) => slider(page).evaluate((element: AngleSlider) => element.value)

/** Presses the dial at `degrees` clockwise from the top, `reach` of the way from the centre to the edge. */
async function pointAt(page: Page, degrees: number, reach = 0.8) {
  const box = (await slider(page).locator('[part="dial"]').boundingBox())!
  const radians = (degrees * Math.PI) / 180
  const radius = (box.width / 2) * reach
  return { x: box.x + box.width / 2 + radius * Math.sin(radians), y: box.y + box.height / 2 - radius * Math.cos(radians) }
}

async function press(page: Page, degrees: number) {
  const point = await pointAt(page, degrees)
  await page.mouse.click(point.x, point.y)
}

test('an angle slider is a named slider at 0 degrees that shows its value in the middle', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider></c2-angle-slider>')
  await expect(handle(page)).toHaveAccessibleName('Angle')
  await expect(handle(page)).toHaveAttribute('aria-valuenow', '0')
  await expect(handle(page)).toHaveAttribute('aria-valuetext', '0 degrees')
  await expect(slider(page).locator('[part="value"]')).toHaveText('0°')
  await expect(slider(page).locator('[part="needle"]')).toHaveCount(1)
  await expect(slider(page).locator('[part="fill"]')).toHaveCount(0)
  await accessible(page)
})

test('a press on the dial points it there, and a drag follows the pointer with input events and one change', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider></c2-angle-slider>')
  await watch(slider(page), 'change')
  await press(page, 90)
  expect(await value(page)).toBe(90)
  await press(page, 180)
  expect(await value(page)).toBe(180)
  expect(await events(page)).toHaveLength(2)
  await expect(handle(page)).toBeFocused()

  await watch(slider(page), 'input')
  const start = await pointAt(page, 270)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  for (const degrees of [280, 300, 320]) {
    const point = await pointAt(page, degrees)
    await page.mouse.move(point.x, point.y)
  }
  expect(await value(page)).toBe(320)
  expect((await events(page)).length).toBeGreaterThanOrEqual(4)
  await watch(slider(page), 'change')
  await page.mouse.up()
  expect(await events(page)).toHaveLength(1)
})

test('the keys step, page and jump, and wrap round the circle', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider value="10" step="5"></c2-angle-slider>')
  await handle(page).focus()
  await page.keyboard.press('ArrowRight')
  expect(await value(page)).toBe(15)
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown')
  expect(await value(page)).toBe(355)
  await page.keyboard.press('ArrowUp')
  expect(await value(page)).toBe(0)
  await page.keyboard.press('PageUp')
  expect(await value(page)).toBe(35)
  await page.keyboard.press('End')
  expect(await value(page)).toBe(355)
  await page.keyboard.press('Home')
  expect(await value(page)).toBe(0)
  // 360 is the same direction as 0.
  await props(slider(page), { value: 360 })
  expect(await value(page)).toBe(0)
  await props(slider(page), { value: -90 })
  expect(await value(page)).toBe(270)
})

test('End goes to the last step a full turn reaches, which is also what assistive technology hears as the maximum', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider step="7"></c2-angle-slider>')
  await expect(handle(page)).toHaveAttribute('aria-valuemax', '357')
  await handle(page).focus()
  await page.keyboard.press('End')
  expect(await value(page)).toBe(357)
  await page.keyboard.press('ArrowRight')
  expect(await value(page)).toBe(0)
})

test('an arc maps min to max along it, fills up to the handle, takes the nearer end in the gap and stops at its ends', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider mode="arc" min="10" max="30" step="0.5" label="Temperature"></c2-angle-slider>')
  await expect(handle(page)).toHaveAccessibleName('Temperature')
  await expect(slider(page).locator('[part="fill"]')).toHaveCount(1)
  await expect(slider(page).locator('[part="needle"]')).toHaveCount(0)
  expect(await value(page)).toBe(10)
  // The top is the middle of the 270° arc.
  await press(page, 0)
  expect(await value(page)).toBe(20)
  await press(page, 90)
  expect(await value(page)).toBe(26.5)
  // In the gap at the bottom: just right of the middle is nearer the end, just left of it nearer the start.
  await press(page, 170)
  expect(await value(page)).toBe(30)
  await press(page, 190)
  expect(await value(page)).toBe(10)
  await expect(slider(page).locator('[part="value"]')).toHaveText('10')

  await handle(page).focus()
  await page.keyboard.press('ArrowLeft')
  expect(await value(page)).toBe(10)
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowRight')
  expect(await value(page)).toBe(30)
  await page.keyboard.press('PageDown')
  expect(await value(page)).toBe(28)
  await accessible(page)
})

test('the sweep variable reshapes the arc and the values it maps to', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider mode="arc" min="0" max="100" style="--c2-angle-slider__arc--sweep: 180"></c2-angle-slider>')
  await press(page, 90)
  expect(await value(page)).toBe(100)
  await press(page, 315)
  expect(await value(page)).toBe(25)
})

test('formatValue names the value for the middle and for assistive technology; the default slot replaces the middle', async ({ page, renderScenario }) => {
  await renderScenario('<c2-angle-slider mode="arc" min="16" max="28" value="21"></c2-angle-slider><c2-angle-slider id="icon"><span>N</span></c2-angle-slider>')
  await slider(page).evaluate(async (element: AngleSlider) => {
    element.formatValue = (v) => `${v} °C`
    await element.updateComplete
  })
  await expect(slider(page).locator('[part="value"]')).toHaveText('21 °C')
  await expect(handle(page)).toHaveAttribute('aria-valuetext', '21 °C')
  // The middle draws the slotted content in place of the value.
  await expect(page.locator('#icon > span')).toBeVisible()
  expect(await page.locator('#icon [part="value"] slot').evaluate((slot: HTMLSlotElement) => slot.assignedElements().length)).toBe(1)
})

test('it is a form control: submits under its name, resets, and a disabled one neither moves nor submits', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-angle-slider name="heading" value="45"></c2-angle-slider></form>')
  const data = () => page.locator('form').evaluate((form: HTMLFormElement) => Object.fromEntries(new FormData(form)))
  expect(await data()).toEqual({ heading: '45' })
  await press(page, 90)
  expect(await data()).toEqual({ heading: '90' })
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  expect(await value(page)).toBe(45)

  await slider(page).evaluate((element: AngleSlider) => element.toggleAttribute('disabled', true))
  await expect(handle(page)).toHaveAttribute('aria-disabled', 'true')
  await press(page, 180)
  expect(await value(page)).toBe(45)
  expect(await data()).toEqual({})
})

test('takes its text from the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-angle-slider value="30"></c2-angle-slider><c2-angle-slider mode="arc"></c2-angle-slider></div>')
  await expect(handle(page)).toHaveAttribute('aria-valuetext', '30 degrés')
  await expect(page.getByRole('slider').nth(1)).toHaveAccessibleName('Valeur')
})

test('in forced colours the dial paints itself in system colours', async ({ page, renderScenario }) => {
  await page.emulateMedia({ forcedColors: 'active' })
  await renderScenario('<c2-angle-slider mode="arc" value="180"></c2-angle-slider>')
  const fill = await slider(page)
    .locator('[part="fill"]')
    .evaluate((element) => getComputedStyle(element).backgroundImage)
  expect(fill).toContain('conic-gradient')
  expect(
    await slider(page)
      .locator('[part="dial"]')
      .evaluate((element) => getComputedStyle(element).forcedColorAdjust),
  ).toBe('none')
})

test('removing its own disabled inside a disabled fieldset keeps it disabled', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset disabled><c2-angle-slider name="heading" disabled></c2-angle-slider></fieldset></form>')
  await slider(page).evaluate((element: AngleSlider) => element.removeAttribute('disabled'))
  await expect(handle(page)).toHaveAttribute('aria-disabled', 'true')
})
