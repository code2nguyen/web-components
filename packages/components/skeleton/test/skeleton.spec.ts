import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const blocks = (page: import('@playwright/test').Page) => page.locator('[part="block"]')

test('a plain skeleton is one decorative block', async ({ page, renderScenario }) => {
  await renderScenario('<c2-skeleton></c2-skeleton>')
  await expect(blocks(page)).toHaveCount(1)
  await expect(blocks(page).first()).toBeVisible()
  // Decoration: an empty box has nothing to announce, so it stays out of the accessibility tree.
  await expect(page.getByRole('status')).toHaveCount(0)
  await accessible(page)
})

test('a labelled skeleton announces the wait once', async ({ page, renderScenario }) => {
  await renderScenario('<c2-skeleton label="Loading profile"></c2-skeleton><c2-skeleton></c2-skeleton>')
  // Only the labelled one is announced; the rest of a group stays silent.
  await expect(page.getByRole('status', { name: 'Loading profile' })).toHaveCount(1)
  await accessible(page)
})

test('the text variant draws one block per line with a shorter last one', async ({ page, renderScenario }) => {
  await renderScenario('<div style="width:300px"><c2-skeleton variant="text" lines="3"></c2-skeleton></div>')
  await expect(blocks(page)).toHaveCount(3)
  const width = async (index: number) => Math.round((await blocks(page).nth(index).boundingBox())!.width)
  expect(await width(0)).toBe(300)
  expect(await width(1)).toBe(300)
  // 60% of the host, so a paragraph does not end flush with the margin.
  expect(await width(2)).toBe(180)
})

test('a single text line is not shortened', async ({ page, renderScenario }) => {
  await renderScenario('<div style="width:300px"><c2-skeleton variant="text"></c2-skeleton></div>')
  await expect(blocks(page)).toHaveCount(1)
  expect(Math.round((await blocks(page).first().boundingBox())!.width)).toBe(300)
})

test('a nonsense line count still draws one line', async ({ page, renderScenario }) => {
  await renderScenario('<c2-skeleton variant="text" lines="0"></c2-skeleton>')
  await expect(blocks(page)).toHaveCount(1)
  await props(page.locator('c2-skeleton'), { lines: -4 })
  await expect(blocks(page)).toHaveCount(1)
  await props(page.locator('c2-skeleton'), { lines: 2.7 })
  await expect(blocks(page)).toHaveCount(2)
})

test('lines only apply to the text variant', async ({ page, renderScenario }) => {
  await renderScenario('<c2-skeleton lines="4"></c2-skeleton>')
  await expect(blocks(page)).toHaveCount(1)
  await props(page.locator('c2-skeleton'), { variant: 'text' })
  await expect(blocks(page)).toHaveCount(4)
})

test('the circle variant is square and fully rounded', async ({ page, renderScenario }) => {
  await renderScenario('<div style="width:300px"><c2-skeleton variant="circle"></c2-skeleton></div>')
  const box = (await blocks(page).first().boundingBox())!
  // Sized by its own variable, so a wide container cannot stretch it into an oval.
  expect(Math.round(box.width)).toBe(40)
  expect(Math.round(box.height)).toBe(40)
  await expect(blocks(page).first()).toHaveCSS('border-radius', '999px')
  await props(page.locator('c2-skeleton'), { style: '--c2-skeleton__circle--size: 64px' })
  const resized = (await blocks(page).first().boundingBox())!
  expect(Math.round(resized.width)).toBe(64)
  expect(Math.round(resized.height)).toBe(64)
})

test('the block fills a flex or grid container instead of collapsing to its content', async ({ page, renderScenario }) => {
  // The host has no intrinsic width, so a percentage on an inner box would be indefinite here and resolve to zero.
  await renderScenario('<div style="display:flex;align-items:center;justify-content:center;width:300px"><c2-skeleton></c2-skeleton></div>')
  expect(Math.round((await blocks(page).first().boundingBox())!.width)).toBe(300)
  await props(page.locator('c2-skeleton'), { style: '--c2-skeleton--width: 180px' })
  expect(Math.round((await blocks(page).first().boundingBox())!.width)).toBe(180)
})

test('each animation drives the block and none leaves it still', async ({ page, renderScenario }) => {
  await renderScenario('<c2-skeleton animation="pulse"></c2-skeleton>')
  const running = async () =>
    blocks(page)
      .first()
      .evaluate((block) => block.getAnimations({ subtree: true }).length)
  expect(await running()).toBe(1)
  await props(page.locator('c2-skeleton'), { animation: 'wave' })
  expect(await running()).toBe(1)
  await props(page.locator('c2-skeleton'), { animation: 'none' })
  expect(await running()).toBe(0)
})
