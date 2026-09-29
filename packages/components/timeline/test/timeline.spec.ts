import { test, expect } from './fixture'

test('renders a list of entries with their label, timestamp and content', async ({ page, scenario }) => {
  await scenario()
  const list = page.getByRole('list', { name: 'Order history' })
  await expect(list).toBeVisible()
  await expect(list.getByRole('listitem')).toHaveCount(3)
  const first = page.locator('c2-timeline-item').first()
  await expect(first.locator('[part="label"]')).toHaveText('Order placed')
  await expect(first.locator('time')).toHaveAttribute('datetime', '2026-09-12T09:14')
  await expect(first.locator('time')).toHaveText('Sep 12, 09:14')
  await expect(first.locator('[part="content"]')).toBeVisible()
})

test('an entry with no content or datetime renders neither', async ({ page, scenario }) => {
  await scenario()
  const delayed = page.locator('c2-timeline-item[label="Delivery delayed"]')
  await expect(delayed.locator('[part="timestamp"]')).toHaveText('Sep 15, 08:30')
  await expect(delayed.locator('time')).toHaveCount(0)
  await expect(delayed.locator('[part="content"]')).toBeHidden()
})

test('the connector stops at the last entry', async ({ page, scenario }) => {
  await scenario()
  const connectors = page.locator('c2-timeline-item [part="connector"]')
  await expect(connectors.nth(0)).toBeVisible()
  await expect(connectors.nth(1)).toBeVisible()
  await expect(connectors.nth(2)).toBeHidden()
})

test('the connector reaches the next marker', async ({ page, scenario }) => {
  await scenario()
  const connector = await page.locator('c2-timeline-item [part="connector"]').first().boundingBox()
  const nextMarker = await page.locator('c2-timeline-item [part="marker"]').nth(1).boundingBox()
  expect(connector && nextMarker).toBeTruthy()
  const gap = nextMarker!.y - (connector!.y + connector!.height)
  expect(gap).toBeGreaterThanOrEqual(0)
  expect(gap).toBeLessThanOrEqual(8)
})

test('an entry appended later becomes the last one', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Add entry' }).click()
  const connectors = page.locator('c2-timeline-item [part="connector"]')
  await expect(connectors).toHaveCount(4)
  await expect(connectors.nth(2)).toBeVisible()
  await expect(connectors.nth(3)).toBeHidden()
})

test('entries behind a wrapper are still found', async ({ page, scenario }) => {
  await scenario('wrapped')
  const connectors = page.locator('c2-timeline-item [part="connector"]')
  await expect(connectors.nth(1)).toBeVisible()
  await expect(connectors.nth(2)).toBeHidden()
})

test('the split layout puts the timestamp before the rail, level with the label', async ({ page, scenario }) => {
  await scenario('split')
  const item = page.locator('c2-timeline-item').first()
  const timestamp = (await item.locator('[part="timestamp"]').boundingBox())!
  const marker = (await item.locator('[part="marker"]').boundingBox())!
  const label = (await item.locator('[part="label"]').boundingBox())!
  expect(timestamp.x + timestamp.width).toBeLessThanOrEqual(marker.x)
  expect(marker.x + marker.width).toBeLessThanOrEqual(label.x)
  expect(Math.abs(timestamp.y - label.y)).toBeLessThan(1)
})

test('the stacked layout puts the timestamp under the label', async ({ page, scenario }) => {
  await scenario()
  const item = page.locator('c2-timeline-item').first()
  const timestamp = (await item.locator('[part="timestamp"]').boundingBox())!
  const label = (await item.locator('[part="label"]').boundingBox())!
  expect(timestamp.y).toBeGreaterThanOrEqual(label.y + label.height - 1)
  expect(Math.abs(timestamp.x - label.x)).toBeLessThan(1)
})

test('tone colours the marker', async ({ page, scenario }) => {
  await scenario()
  const border = (tone: string) => page.locator(`c2-timeline-item[tone="${tone}"] [part="marker"]`).evaluate((el) => getComputedStyle(el).borderTopColor)
  expect(await border('success')).toBe('rgb(21, 128, 61)')
  expect(await border('primary')).toBe('rgb(2, 101, 220)')
  expect(await border('warning')).toBe('rgb(161, 98, 7)')
})

test('slots replace the label, the timestamp and the marker', async ({ page, scenario }) => {
  await scenario('slots')
  const item = page.locator('c2-timeline-item').first()
  await expect(item.getByRole('link', { name: 'v2.0.0' })).toBeVisible()
  await expect(item.locator('[part="timestamp"]')).toBeVisible()
  await expect(item.getByText('two days ago')).toBeVisible()
  await expect(item.locator('svg[slot="marker"]')).toBeVisible()
  // The second entry has only a label: no empty timestamp or content rows.
  const second = page.locator('c2-timeline-item').nth(1)
  await expect(second.locator('[part="timestamp"]')).toBeHidden()
  await expect(second.locator('[part="content"]')).toBeHidden()
})
