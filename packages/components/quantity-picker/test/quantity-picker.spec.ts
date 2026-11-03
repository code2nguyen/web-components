import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const picker = (page: Page) => page.locator('c2-quantity-picker')
const events = async (page: Page) => JSON.parse((await picker(page).first().getAttribute('data-events')) ?? '[]')
const GUESTS = `<c2-quantity name="adults" value="2" min="1" singular="adult" plural="adults">Adults<span slot="hint">Ages 13 or above</span></c2-quantity>
  <c2-quantity name="children" value="1" singular="child" plural="children">Children<span slot="hint">Ages 2–12</span></c2-quantity>
  <c2-quantity name="infants" singular="infant" plural="infants">Infants</c2-quantity>`

test('the trigger sums up; the panel opens on the first counter, steps with the keys, and Done closes with one change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quantity-picker label="Guests">${GUESTS}</c2-quantity-picker>`)
  const trigger = page.getByRole('button', { name: 'Guests: 2 adults, 1 child' })
  await expect(trigger).toBeVisible()
  await accessible(page)
  await watch(picker(page), 'change')
  await trigger.click()
  await expect(page.getByRole('dialog', { name: 'Guests' })).toBeVisible()
  await expect(page.getByRole('spinbutton', { name: 'Adults' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('spinbutton', { name: 'Adults' })).toHaveAttribute('aria-valuenow', '3')
  await expect(picker(page).locator('.trigger .text')).toHaveText('3 adults, 1 child')
  await page.getByRole('button', { name: 'Increase Infants' }).click()
  await expect(picker(page).locator('.trigger .text')).toHaveText('3 adults, 1 child, 1 infant')
  await expect(page.getByRole('dialog').locator('[aria-live]')).toHaveText('Now 3 adults, 1 child, 1 infant')
  await accessible(page)
  expect(await events(page)).toEqual([])
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(picker(page).locator('.trigger')).toBeFocused()
  await expect.poll(() => events(page)).toEqual([{ values: { adults: 3, children: 1, infants: 1 }, total: 5 }])
})

test('limits: min stops −, max-total stops every +, and End goes no further than the room left', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quantity-picker label="Guests" max-total="4" inline>${GUESTS}</c2-quantity-picker>`)
  await expect(page.getByRole('button', { name: 'Decrease Infants' })).toBeDisabled()
  await expect(picker(page).locator('.note')).toHaveText('Up to 4')
  await page.getByRole('spinbutton', { name: 'Children' }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('spinbutton', { name: 'Children' })).toHaveAttribute('aria-valuenow', '2')
  await expect(picker(page).locator('.note')).toHaveText('4 of 4, the most allowed')
  for (const name of ['Increase Adults', 'Increase Children', 'Increase Infants']) await expect(page.getByRole('button', { name })).toBeDisabled()
  await page.getByRole('spinbutton', { name: 'Adults' }).focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('spinbutton', { name: 'Adults' })).toHaveAttribute('aria-valuenow', '1')
  await expect(page.getByRole('button', { name: 'Decrease Adults' })).toBeDisabled()
  await accessible(page)
})

test('inline fires change on every step; a counter set by the app updates the summary; placeholder and summary', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quantity-picker inline>${GUESTS}</c2-quantity-picker>
    <c2-quantity-picker id="rooms" label="Rooms" placeholder="Any"><c2-quantity name="rooms">Rooms</c2-quantity></c2-quantity-picker>`)
  await watch(picker(page).first(), 'change')
  await expect(page.getByRole('button', { name: /Guests/ })).toHaveCount(0)
  await page.getByRole('button', { name: 'Increase Children' }).click()
  await expect.poll(() => events(page)).toEqual([{ values: { adults: 2, children: 2, infants: 0 }, total: 4 }])
  await expect(page.getByRole('button', { name: 'Rooms: Any' })).toBeVisible()
  await page.locator('#rooms c2-quantity').evaluate((element: HTMLElement & { value: number }) => (element.value = 2))
  await expect(page.getByRole('button', { name: 'Rooms: 2 rooms' })).toBeVisible()
  await page.locator('#rooms').evaluate((element: HTMLElement & { summary: (counters: { value: number }[]) => string }) => {
    element.summary = (counters) => `${counters[0].value} × 🛏`
  })
  await expect(page.getByRole('button', { name: 'Rooms: 2 × 🛏' })).toBeVisible()
})

test('Escape closes and returns focus; disabled locks the trigger and the counters; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quantity-picker label="Guests">${GUESTS}</c2-quantity-picker>
    <div lang="fr"><c2-quantity-picker id="fr" label="Voyageurs" inline max-total="6"><c2-quantity value="1" singular="adulte" plural="adultes">Adultes</c2-quantity></c2-quantity-picker></div>`)
  await page.getByRole('button', { name: 'Guests: 2 adults, 1 child' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Adults' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Guests' })).toBeHidden()
  await expect(picker(page).first().locator('.trigger')).toBeFocused()
  await expect(page.locator('#fr').getByRole('button', { name: 'Augmenter Adultes' })).toBeVisible()
  await expect(page.locator('#fr .note')).toHaveText('Jusqu’à 6')
  await props(page.locator('#fr'), { disabled: true })
  await expect(page.locator('#fr').getByRole('button', { name: 'Augmenter Adultes' })).toBeDisabled()
  await expect(page.locator('#fr c2-quantity')).not.toHaveAttribute('disabled')
  await props(picker(page).first(), { disabled: true })
  await expect(picker(page).first().locator('.trigger')).toBeDisabled()
})

test('End without an upper limit stays; counters after the first draw a divider; a click elsewhere keeps its focus', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-quantity-picker inline><c2-quantity value="3" singular="seat" plural="seats">Seats</c2-quantity><c2-quantity>Bags</c2-quantity></c2-quantity-picker>
    <c2-quantity-picker id="popover" label="Guests">${GUESTS}</c2-quantity-picker><input aria-label="Elsewhere" />`)
  await page.getByRole('spinbutton', { name: 'Seats' }).focus()
  await page.keyboard.press('End')
  await expect(page.getByRole('spinbutton', { name: 'Seats' })).toHaveAttribute('aria-valuenow', '3')
  const divided = (name: string) =>
    page
      .locator('c2-quantity', { hasText: name })
      .evaluate((element) => element.shadowRoot!.querySelector('.quantity')!.classList.contains('quantity--divided'))
  expect(await divided('Seats')).toBe(false)
  expect(await divided('Bags')).toBe(true)
  await page.getByRole('button', { name: 'Guests: 2 adults, 1 child' }).click()
  await expect(page.getByRole('dialog', { name: 'Guests' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Elsewhere' }).click()
  await expect(page.getByRole('dialog', { name: 'Guests' })).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Elsewhere' })).toBeFocused()
})
