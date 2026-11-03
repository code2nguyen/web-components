import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Picker = HTMLElement & { value: string[] }

const picker = (page: Page) => page.locator('c2-wheel-picker')
const value = (page: Page) => picker(page).evaluate((element: Picker) => element.value)
const events = async (page: Page) => JSON.parse((await picker(page).getAttribute('data-events'))!)

const HEIGHT = JSON.stringify([
  { label: 'Feet', suffix: 'ft', options: ['4', '5', '6', '7'] },
  { label: 'Inches', suffix: 'in', options: Array.from({ length: 12 }, (_, at) => String(at)) },
])

test('each wheel is a spin button with its value and suffix; a wheel without a value starts on its first row', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-wheel-picker label="Height" columns='${HEIGHT}' value="5"></c2-wheel-picker>`)
  await expect(picker(page)).toHaveHostAria('role', 'group')
  await expect(picker(page)).toHaveHostAria('aria-label', 'Height')
  await expect(page.getByRole('spinbutton', { name: 'Feet' })).toHaveAttribute('aria-valuetext', '5 ft')
  await expect(page.getByRole('spinbutton', { name: 'Inches' })).toHaveAttribute('aria-valuetext', '0 in')
  expect(await value(page)).toEqual(['5', '0'])
  await accessible(page)
})

test('the keys step rows, skip disabled ones, and fire input then change', async ({ page, renderScenario }) => {
  const options = JSON.stringify(['XS', 'S', { value: 'M', disabled: true }, 'L', 'XL', 'XXL', '3XL', '4XL'])
  await renderScenario(`<c2-wheel-picker label="Size" options='${options}' value="S"></c2-wheel-picker>`)
  await watch(picker(page), 'change')
  const wheel = page.getByRole('spinbutton', { name: 'Size' })
  await wheel.focus()
  await page.keyboard.press('ArrowDown')
  expect(await value(page)).toEqual(['L'])
  await page.keyboard.press('ArrowUp')
  expect(await value(page)).toEqual(['S'])
  await page.keyboard.press('PageDown')
  expect(await value(page)).toEqual(['3XL'])
  await page.keyboard.press('End')
  await expect(wheel).toHaveAttribute('aria-valuetext', '4XL')
  await page.keyboard.press('Home')
  expect(await events(page)).toEqual([{ value: ['L'] }, { value: ['S'] }, { value: ['3XL'] }, { value: ['4XL'] }, { value: ['XS'] }])
})

test('scrolling a wheel picks the row it settles on; clicking a row picks it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-wheel-picker columns='${HEIGHT}'></c2-wheel-picker>`)
  await watch(picker(page), 'change')
  const inches = picker(page).locator('.track').nth(1)
  const row = await inches
    .locator('.row')
    .first()
    .evaluate((element: HTMLElement) => element.offsetHeight)
  await inches.evaluate((track: HTMLElement, top) => track.scrollTo({ top, behavior: 'instant' as ScrollBehavior }), row * 7)
  await expect.poll(() => value(page)).toEqual(['4', '7'])
  await picker(page).locator('.track').first().locator('.row', { hasText: '6' }).click()
  await expect.poll(() => value(page)).toEqual(['6', '7'])
  expect((await events(page)).at(-1)).toEqual({ value: ['6', '7'] })
})

test('setting the value turns the wheels without events; the form receives the values; a reset restores them', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-wheel-picker name="height" columns='${HEIGHT}' value="5;10"></c2-wheel-picker></form>`)
  await watch(picker(page), 'change')
  const form = page.locator('form')
  expect(await form.evaluate((element: HTMLFormElement) => new FormData(element).get('height'))).toBe('5;10')
  await picker(page).evaluate((element: Picker) => (element.value = ['7', '2']))
  await expect(page.getByRole('spinbutton', { name: 'Feet' })).toHaveAttribute('aria-valuetext', '7 ft')
  await expect
    .poll(() =>
      picker(page)
        .locator('.track')
        .first()
        .evaluate((track: HTMLElement) => Math.round(track.scrollTop / track.querySelector<HTMLElement>('.row')!.offsetHeight)),
    )
    .toBe(3)
  await page.waitForTimeout(300)
  expect(await events(page)).toEqual([])
  await form.evaluate((element: HTMLFormElement) => element.reset())
  expect(await value(page)).toEqual(['5', '10'])
})

test('a disabled picker is out of the tab order; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-wheel-picker disabled columns='[{"options":["1","2"]},{"options":["a","b"]}]'></c2-wheel-picker></div>`)
  await expect(page.getByRole('spinbutton', { name: 'Roue 1 sur 2' })).toHaveAttribute('tabindex', '-1')
  await expect(picker(page)).toHaveHostAria('aria-label', 'Choisir une valeur')
})

test('a picker rendered hidden turns to its value once shown; it writes no value attribute; Page Down stops before a disabled end', async ({
  page,
  renderScenario,
}) => {
  const options = JSON.stringify(['a', 'b', 'c', 'd', 'e', 'f', 'g', { value: 'h', disabled: true }])
  await renderScenario(`<div id="box" hidden><c2-wheel-picker label="Letter" value="f" options='${options}'></c2-wheel-picker></div>`)
  await page.locator('#box').evaluate((box: HTMLElement) => (box.hidden = false))
  await expect
    .poll(() =>
      picker(page)
        .locator('.track')
        .evaluate((track: HTMLElement) => Math.round(track.scrollTop / track.querySelector<HTMLElement>('.row')!.offsetHeight)),
    )
    .toBe(5)
  expect(await picker(page).getAttribute('value')).toBe('f')
  await page.getByRole('spinbutton', { name: 'Letter' }).focus()
  await page.keyboard.press('PageDown')
  expect(await value(page)).toEqual(['g'])
})

test('a picker without a value writes none on its host', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-wheel-picker options="S;M;L"></c2-wheel-picker>`)
  expect(await value(page)).toEqual(['S'])
  expect(await picker(page).getAttribute('value')).toBeNull()
})
