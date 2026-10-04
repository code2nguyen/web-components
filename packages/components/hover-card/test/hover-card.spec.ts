import { test, expect, accessible, watch } from '../../../../tests/component-fixture'

const card = (attributes = 'open-delay="0" close-delay="0"') => `
  <p>Reviewed by
    <c2-hover-card ${attributes}>
      <a slot="trigger" href="#ada">@ada</a>
      <strong>Ada Lovelace</strong>
      <a href="#follow">Follow</a>
    </c2-hover-card>
  </p>
  <button>After</button>`

const panel = (page: import('@playwright/test').Page) => page.locator('c2-hover-card .c2-hover-card')

test('hovering the trigger opens the card and leaving closes it', async ({ page, renderScenario }) => {
  await renderScenario(card())
  await watch(page.locator('c2-hover-card'), 'show')
  await expect(panel(page)).toBeHidden()
  await page.getByRole('link', { name: '@ada' }).hover()
  await expect(panel(page)).toBeVisible()
  await expect(page.getByText('Ada Lovelace')).toBeVisible()
  await expect(page.locator('c2-hover-card')).toHaveAttribute('open', '')
  await expect(page.locator('c2-hover-card')).toHaveAttribute('data-events', '[null]')
  await page.mouse.move(1, 1)
  await expect(panel(page)).toBeHidden()
  await expect(page.locator('c2-hover-card')).not.toHaveAttribute('open')
})

test('the pointer can travel from the trigger into the card and use it', async ({ page, renderScenario }) => {
  await renderScenario(card('open-delay="0" close-delay="300"'))
  await page.getByRole('link', { name: '@ada' }).hover()
  await expect(panel(page)).toBeVisible()
  await page.getByRole('link', { name: 'Follow' }).hover()
  await expect(panel(page)).toBeVisible()
  await page.getByRole('link', { name: 'Follow' }).click()
  await expect(page).toHaveURL(/#follow$/)
})

test('the card waits for open-delay before opening', async ({ page, renderScenario }) => {
  await renderScenario(card('open-delay="400" close-delay="0"'))
  await page.getByRole('link', { name: '@ada' }).hover()
  await expect(panel(page)).toBeHidden({ timeout: 200 })
  await expect(panel(page)).toBeVisible()
})

test('leaving before open-delay elapses never opens the card', async ({ page, renderScenario }) => {
  await renderScenario(card('open-delay="300" close-delay="0"'))
  await watch(page.locator('c2-hover-card'), 'show')
  await page.getByRole('link', { name: '@ada' }).hover()
  await page.mouse.move(1, 1)
  await page.waitForFunction(() => new Promise((resolve) => setTimeout(() => resolve(true), 400)))
  await expect(panel(page)).toBeHidden()
  await expect(page.locator('c2-hover-card')).toHaveAttribute('data-events', '[]')
})

test('keyboard focus opens the card, Tab reaches its content and leaving closes it', async ({ page, renderScenario, tab }) => {
  await renderScenario(card())
  await page.getByRole('link', { name: '@ada' }).focus()
  await expect(panel(page)).toBeVisible()
  await tab()
  await expect(page.getByRole('link', { name: 'Follow' })).toBeFocused()
  await expect(panel(page)).toBeVisible()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await expect(panel(page)).toBeHidden()
})

test('Escape closes the card and returns focus from its content to the trigger', async ({ page, renderScenario, tab }) => {
  await renderScenario(card())
  await page.getByRole('link', { name: '@ada' }).focus()
  await expect(panel(page)).toBeVisible()
  await tab()
  await expect(page.getByRole('link', { name: 'Follow' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(page.getByRole('link', { name: '@ada' })).toBeFocused()
})

test('disabled cards do not open on hover or focus', async ({ page, renderScenario }) => {
  await renderScenario(card('open-delay="0" close-delay="0" disabled'))
  await page.getByRole('link', { name: '@ada' }).hover()
  await page.getByRole('link', { name: '@ada' }).focus()
  await page.waitForFunction(() => new Promise((resolve) => setTimeout(() => resolve(true), 100)))
  await expect(panel(page)).toBeHidden()
})

test('the card is placed on the preferred side and never clipped by its container', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div style="overflow: hidden; width: 120px; height: 40px; margin-top: 240px">
      <c2-hover-card placement="top" open><a slot="trigger" href="#x">Trigger</a>A card much wider than the box</c2-hover-card>
    </div>`)
  await expect(panel(page)).toBeVisible()
  await expect(panel(page)).toHaveAttribute('data-placement', 'top')
  const trigger = await page.getByRole('link', { name: 'Trigger' }).boundingBox()
  await expect.poll(async () => (await panel(page).boundingBox())!.y + (await panel(page).boundingBox())!.height).toBeLessThanOrEqual(trigger!.y)
  const box = (await panel(page).boundingBox())!
  expect(box.width).toBeGreaterThan(200)
})

test('flips to the other side when there is no room', async ({ page, renderScenario }) => {
  await renderScenario('<c2-hover-card placement="top" open><a slot="trigger" href="#x">Trigger</a>Card</c2-hover-card>')
  await expect(panel(page)).toHaveAttribute('data-placement', 'bottom')
})

test('writes no attribute of its own on the host, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario(card())
  const host = page.locator('c2-hover-card')
  expect(await host.evaluate((element) => element.getAttributeNames().sort())).toEqual(['close-delay', 'open-delay'])
})

test('closed and open cards have no axe violations', async ({ page, renderScenario }) => {
  await renderScenario(card())
  await accessible(page)
  await page.getByRole('link', { name: '@ada' }).hover()
  await expect(panel(page)).toBeVisible()
  await accessible(page)
})

test('the open card follows its trigger when the page scrolls', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="height:300px"></div>${card()}<div style="height:2000px"></div>`)
  const trigger = page.getByRole('link', { name: '@ada' })
  await trigger.focus()
  await expect(panel(page)).toBeVisible()
  const gap = async () => (await panel(page).boundingBox())!.y - (await trigger.boundingBox())!.y
  const before = await gap()
  await page.evaluate(() => window.scrollBy(0, 150))
  await expect.poll(gap).toBeCloseTo(before, -1)
  await expect(panel(page)).toBeVisible()
})

test('an offset set on the open card moves it without a resize or scroll', async ({ page, renderScenario }) => {
  await renderScenario(card())
  const host = page.locator('c2-hover-card')
  await page.getByRole('link', { name: '@ada' }).hover()
  await expect(panel(page)).toBeVisible()
  const gap = async () => (await panel(page).boundingBox())!.y - ((await host.boundingBox())!.y + (await host.boundingBox())!.height)
  await expect.poll(gap).toBeCloseTo(8, 0)
  await host.evaluate((element) => element.style.setProperty('--c2-hover-card--offset', '40px'))
  await expect.poll(gap).toBeCloseTo(40, 0)
  await expect(panel(page)).toBeVisible()
})
