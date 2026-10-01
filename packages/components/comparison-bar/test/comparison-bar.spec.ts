import { test, expect } from './fixture'
import { accessible, props } from '../../../../tests/component-fixture'

const segmentShare = (page: import('@playwright/test').Page) => async () => {
  const track = await page.locator('[part="track"]').boundingBox()
  const start = await page.locator('[part="start-segment"]').boundingBox()
  if (!track || !start) throw new Error('Expected a visible track and start segment')
  return Math.round((start.width / track.width) * 100)
}

test('splits the track and prints shares that add up to 100', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('[part="start-value"]')).toHaveText('22.43%')
  await expect(page.locator('[part="end-value"]')).toHaveText('77.57%')
  await expect.poll(segmentShare(page)).toBe(22)
  await expect(page.getByRole('img', { name: 'Bid 22.43%, Ask 77.57%' })).toBeVisible()
  await accessible(page)
})

test('resizes when a value changes', async ({ page, scenario }) => {
  await scenario()
  await props(page.locator('c2-comparison-bar'), { startValue: 3, endValue: 1 })
  await expect(page.locator('[part="start-value"]')).toHaveText('75.00%')
  await expect.poll(segmentShare(page)).toBe(74)
})

test('percentages are hidden unless show-value is set, but still announced', async ({ page, scenario }) => {
  await scenario('bare')
  await expect(page.locator('[part="start-value"]')).toBeHidden()
  await expect(page.locator('[part="end-value"]')).toBeHidden()
  await expect(page.getByRole('img', { name: '25.00%, 75.00%' })).toBeVisible()
  await accessible(page)
})

test('splits evenly while neither side has an amount', async ({ page, scenario }) => {
  await scenario('empty')
  await expect(page.locator('[part="start-value"]')).toHaveText('50.00%')
  await expect(page.locator('[part="end-value"]')).toHaveText('50.00%')
})

test('a side with no share disappears from the track', async ({ page, scenario }) => {
  await scenario('one-sided')
  await expect(page.locator('[part="start-segment"]')).toBeHidden()
  await expect(page.locator('[part="start-value"]')).toHaveText('0.00%')
  await expect(page.locator('[part="end-value"]')).toHaveText('100.00%')
})

test('formats the shares for the given locale and precision', async ({ page, scenario }) => {
  await scenario('locale')
  await expect(page.locator('[part="start-value"]')).toHaveText(/^\s*33,3\s?%\s*$/)
  await expect(page.locator('[part="end-value"]')).toHaveText(/^\s*66,7\s?%\s*$/)
})

test('slotted text replaces the percentages and shows without show-value', async ({ page, scenario }) => {
  await scenario('slotted')
  await expect(page.locator('[part="start-value"]')).toBeVisible()
  await expect(page.locator('c2-comparison-bar > [slot="start"]')).toHaveText('Yes 12')
  await expect(page.locator('c2-comparison-bar > [slot="end"]')).toBeVisible()
  await expect(page.getByRole('img', { name: '60.00%, 40.00%' })).toBeVisible()
  await accessible(page)
})
