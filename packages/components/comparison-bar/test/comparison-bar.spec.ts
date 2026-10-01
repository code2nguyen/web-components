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

const widthOf = async (page: import('@playwright/test').Page, part: string) => {
  const box = await page.locator(`[part="${part}"]`).boundingBox()
  if (!box) throw new Error(`Expected a visible ${part}`)
  return box
}

test('a middle value adds a third segment and centres its share under it', async ({ page, scenario }) => {
  await scenario('three')
  await expect(page.locator('[part="start-value"]')).toHaveText('45.00%')
  await expect(page.locator('[part="middle-value"]')).toHaveText('20.00%')
  await expect(page.locator('[part="end-value"]')).toHaveText('35.00%')
  await expect(page.getByRole('img', { name: 'Win 45.00%, Draw 20.00%, Loss 35.00%' })).toBeVisible()
  const track = await widthOf(page, 'track')
  const middle = await widthOf(page, 'middle-segment')
  expect(Math.round((middle.width / track.width) * 100)).toBeGreaterThanOrEqual(19)
  expect(Math.round((middle.width / track.width) * 100)).toBeLessThanOrEqual(20)
  // The legend cell spans the same width as the middle segment, so its text is centred under it.
  const text = await widthOf(page, 'middle-value')
  expect(Math.abs(text.x + text.width / 2 - (middle.x + middle.width / 2))).toBeLessThan(2)
  // The edge shares stay level with the track, not with the track plus the legend row.
  const start = await widthOf(page, 'start-value')
  expect(Math.abs(start.y + start.height / 2 - (track.y + track.height / 2))).toBeLessThan(2)
  await accessible(page)
})

test('three shares are rounded so they still add up to 100', async ({ page, scenario }) => {
  await scenario('thirds')
  await expect(page.locator('[part="start-value"]')).toHaveText('33.34%')
  await expect(page.locator('[part="middle-value"]')).toHaveText('33.33%')
  await expect(page.locator('[part="end-value"]')).toHaveText('33.33%')
})

test('removing the middle value returns to two segments', async ({ page, scenario }) => {
  await scenario('three')
  await props(page.locator('c2-comparison-bar'), { middleValue: undefined })
  await expect(page.locator('[part="middle-segment"]')).toHaveCount(0)
  await expect(page.locator('[part="middle-value"]')).toHaveCount(0)
  await expect(page.locator('[part="start-value"]')).toHaveText('56.25%')
})

test('slotted middle text shows without show-value', async ({ page, scenario }) => {
  await scenario('middle-slot')
  await expect(page.locator('[part="middle-value"]')).toBeVisible()
  await expect(page.locator('[part="start-value"]')).toBeHidden()
  await expect(page.getByRole('img', { name: '50.00%, 20.00%, 30.00%' })).toBeVisible()
  await accessible(page)
})
