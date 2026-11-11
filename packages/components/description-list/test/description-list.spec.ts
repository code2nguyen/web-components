import AxeBuilder from '@axe-core/playwright'
import type { Locator } from '@playwright/test'
import { test, expect } from './fixture'

const tops = (locator: Locator) => locator.evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))
const columnCount = async (locator: Locator) => {
  const all = await tops(locator)
  return all.filter((top) => top === all[0]).length
}

test('shows each label with its value, as a list of terms and definitions', async ({ page, scenario }) => {
  await scenario()
  const list = page.locator('c2-description-list')
  const items = page.locator('c2-description-item')
  await expect(list).toHaveHostAria('role', 'list')
  await expect(items).toHaveCount(6)
  await expect(items.first()).toHaveHostAria('role', 'listitem')
  await expect(items.first().locator('[part="label"]')).toHaveText('Name')
  await expect(items.first().locator('[part="label"]')).toHaveAttribute('role', 'term')
  await expect(items.first().locator('[part="value"]')).toHaveAttribute('role', 'definition')
  await expect(items.first()).toContainText('Ada Lovelace')
  await expect(page.getByRole('term').first()).toHaveText('Name')
})

test('an empty value shows a dash until it gets content', async ({ page, scenario }) => {
  await scenario()
  const phone = page.locator('c2-description-item[label="Phone"]')
  await expect(phone.locator('[part="empty"]')).toHaveText('—')
  await expect(phone.locator('[part="empty"]')).toBeVisible()
  await expect(page.locator('c2-description-item[label="Name"] [part="empty"]')).toBeHidden()
  await phone.evaluate((item) => (item.textContent = '+44 20 7946 0000'))
  await expect(phone.locator('[part="empty"]')).toBeHidden()
  await expect(phone).toContainText('+44 20 7946 0000')
  // A framework that rewrites the text node in place fires no slotchange.
  await phone.evaluate((item) => (item.firstChild!.textContent = ' '))
  await expect(phone.locator('[part="empty"]')).toHaveText('—')
})

test('empty-text replaces the dash, and an empty string shows nothing', async ({ page, scenario }) => {
  await scenario('rich-label')
  await expect(page.locator('c2-description-item[label="Empty"] [part="empty"]')).toHaveText('Not set')
  await expect(page.locator('c2-description-item[label="Blank"] [part="empty"]')).toBeHidden()
})

test('the label slot replaces the label attribute, and actions sit after the value', async ({ page, scenario }) => {
  await scenario('rich-label')
  const item = page.locator('c2-description-item[label="Plain"]')
  // The slotted label is shown and the attribute's fallback text is not.
  await expect(item.getByText('Status')).toBeVisible()
  expect(await item.locator('[part="label"] slot').evaluate((slot: HTMLSlotElement) => slot.assignedElements().length)).toBe(1)
  await expect(item.locator('[part="empty"]')).toBeHidden()
  const copy = page.getByRole('button', { name: 'Copy' })
  await expect(copy).toBeVisible()
  const value = await item.locator('strong').boundingBox()
  const action = await copy.boundingBox()
  expect(action!.x).toBeGreaterThan(value!.x + value!.width)
  await expect(page.locator('c2-description-item[label="Empty"] [part="actions"]')).toBeHidden()
})

test('items flow into up to three columns and wrap to fewer as the width shrinks', async ({ page, scenario }) => {
  const items = page.locator('c2-description-item')
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario()
  expect(await columnCount(items)).toBe(3)
  await page.setViewportSize({ width: 560, height: 800 })
  await expect.poll(() => columnCount(items)).toBe(2)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect.poll(() => columnCount(items)).toBe(1)
})

test('an item spans the full row through its grid-column variable', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('full-row')
  const grid = await page.locator('c2-description-list [part="grid"]').boundingBox()
  const wide = await page.locator('#wide').boundingBox()
  expect(Math.round(wide!.width)).toBe(Math.round(grid!.width))
})

test('the header is hidden until a heading or actions are slotted', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-description-list [part="header"]')).toBeHidden()
  await scenario('header')
  await expect(page.locator('c2-description-list [part="header"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Customer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()
})

test('a label width puts the label beside its value, which wraps under it when narrow', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('horizontal')
  const item = page.locator('c2-description-item').first()
  const label = () => item.locator('[part="label"]').boundingBox()
  const value = () => item.locator('[part="value"]').boundingBox()
  expect(Math.round((await value())!.y)).toBe(Math.round((await label())!.y))
  expect(Math.round((await label())!.width)).toBe(160)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect.poll(async () => (await value())!.y > (await label())!.y).toBe(true)
})

test('labels beside values work in two columns, which fold to one when narrow', async ({ page, scenario }) => {
  const items = page.locator('c2-description-item')
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('two-column-horizontal')
  expect(await columnCount(items)).toBe(2)
  const first = items.first()
  const label = await first.locator('[part="label"]').boundingBox()
  const value = await first.locator('[part="value"]').boundingBox()
  expect(Math.round(value!.y)).toBe(Math.round(label!.y))
  expect(value!.x).toBeGreaterThan(label!.x + label!.width)
  await page.setViewportSize({ width: 600, height: 800 })
  await expect.poll(() => columnCount(items)).toBe(1)
})

for (const name of ['groups', 'groups-wrapped'])
  test(`several values line up in columns under the value-labels header: ${name}`, async ({ page, scenario }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await scenario(name)
    const value = page.locator('c2-description-value')
    await expect(value.first()).toHaveHostAria('role', 'definition')
    await expect(page.locator('c2-description-item').first().locator('[part="value"]')).toHaveAttribute('role', 'none')
    const header = page.locator('c2-description-list [part="value-header"]')
    await expect(header).toBeVisible()
    await expect(header).toContainText('Feature')
    const cells = header.locator('.value-header__cell')
    await expect(cells).toHaveText(['Starter', 'Pro', 'Enterprise'])
    const price = page.locator('c2-description-item[label="Price"] c2-description-value')
    const seats = page.locator('c2-description-item[label="Seats"] c2-description-value')
    const label = await page.locator('c2-description-item[label="Price"] [part="label"]').boundingBox()
    for (let column = 0; column < 3; column++) {
      const cell = (await cells.nth(column).boundingBox())!
      const first = (await price.nth(column).boundingBox())!
      const second = (await seats.nth(column).boundingBox())!
      expect(Math.round(first.x)).toBe(Math.round(cell.x))
      expect(Math.round(second.x)).toBe(Math.round(cell.x))
      expect(Math.round(first.width)).toBe(Math.round(cell.width))
      expect(Math.round(first.y)).toBe(Math.round(label!.y))
    }
    // The column name is read with each value but only shown when the values stack.
    const caption = price.first().locator('[part="caption"]')
    await expect(caption).toHaveText('Starter')
    expect((await caption.boundingBox())!.width).toBeLessThanOrEqual(1)
  })

for (const name of ['groups', 'groups-wrapped'])
  test(`value columns move under the label, then stack with captions, as the width shrinks: ${name}`, async ({ page, scenario }) => {
    await page.setViewportSize({ width: 1200, height: 800 })
    await scenario(name)
    const price = page.locator('c2-description-item[label="Price"] c2-description-value')
    const label = page.locator('c2-description-item[label="Price"] [part="label"]')
    const header = page.locator('c2-description-list [part="value-header"]')
    const top = async (locator: Locator) => Math.round((await locator.boundingBox())!.y)

    // 450px: too narrow for the 160px label beside three 120px columns, wide enough for the columns.
    await page.setViewportSize({ width: 498, height: 800 })
    await expect.poll(async () => (await top(price.first())) > (await top(label))).toBe(true)
    expect(await top(price.nth(2))).toBe(await top(price.first()))
    await expect(header).toBeVisible()
    await expect(price.first().locator('[part="caption"]')).toHaveClass(/is-hidden/)

    // 312px: the columns no longer fit, so every value takes a row and names its column.
    await page.setViewportSize({ width: 360, height: 800 })
    await expect.poll(async () => (await top(price.nth(1))) > (await top(price.first()))).toBe(true)
    await expect(price.first().locator('[part="caption"]')).not.toHaveClass(/is-hidden/)
    await expect(price.nth(1).locator('[part="caption"]')).toBeVisible()
    await expect(price.nth(1).locator('[part="caption"]')).toHaveText('Pro')
    await expect(header).toBeHidden()

    // And back.
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(header).toBeVisible()
    await expect(price.first().locator('[part="caption"]')).toHaveClass(/is-hidden/)
  })

test('the column names are bold by default and stacked captions are too', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('groups')
  await expect(page.locator('c2-description-list [part="value-header"]')).toHaveCSS('font-weight', '600')
  await page.setViewportSize({ width: 360, height: 800 })
  const caption = page.locator('c2-description-value').first().locator('[part="caption"]')
  await expect(caption).toBeVisible()
  await expect(caption).toHaveCSS('font-weight', '600')
})

test('the header row can be removed while stacked values keep their column names', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('groups-no-header')
  await expect(page.locator('c2-description-list [part="value-header"]')).toBeHidden()
  const values = page.locator('c2-description-value')
  await expect.poll(async () => (await values.nth(2).boundingBox())!.y).toBe((await values.first().boundingBox())!.y)
  await page.setViewportSize({ width: 360, height: 800 })
  await expect(values.nth(1).locator('[part="caption"]')).toBeVisible()
  await expect(values.nth(1).locator('[part="caption"]')).toHaveText('Pro')
})

test('stacked values can drop their column names', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await scenario('groups-no-caption')
  const values = page.locator('c2-description-value')
  await expect.poll(async () => (await values.nth(1).boundingBox())!.y > (await values.first().boundingBox())!.y).toBe(true)
  await expect(values.first().locator('[part="caption"]')).toBeHidden()
  const content = await values.first().locator('[part="content"]').boundingBox()
  const value = await values.first().boundingBox()
  expect(Math.round(content!.x)).toBe(Math.round(value!.x))
})

const states = (locator: Locator, name: string) => locator.evaluateAll((els, state) => els.map((el) => el.matches(`:state(${state})`)), name)

test('highlight marks the best value of each item, and an item can ask for the lowest', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('compare')
  const values = (label: string) => page.locator(`c2-description-item[label="${label}"] c2-description-value`)
  // Price overrides the list's max with min; text that holds no number takes no part.
  await expect.poll(() => states(values('Price'), 'highlighted')).toEqual([true, false, false])
  // A tie marks every best value.
  await expect.poll(() => states(values('Seats'), 'highlighted')).toEqual([false, true, true])
  // `value` is compared instead of the text.
  await expect.poll(() => states(values('Storage'), 'highlighted')).toEqual([false, false, true])
  // Equal values (whitespace aside) mark nothing and the item is not `different`.
  await expect.poll(() => states(values('Support'), 'highlighted')).toEqual([false, false, false])
  expect(await states(page.locator('c2-description-item'), 'different')).toEqual([true, true, true, false, false])
  await expect(values('Price').first().locator('[part="content"]')).toHaveCSS('font-weight', '600')
  await expect(values('Price').nth(1).locator('[part="content"]')).toHaveCSS('font-weight', '500')

  // A new comparison value lays the item out again.
  await values('Storage')
    .first()
    .evaluate((value: HTMLElement & { value?: string }) => (value.value = '4096'))
  await expect.poll(() => states(values('Storage'), 'highlighted')).toEqual([true, false, false])
  await page.locator('c2-description-list').evaluate((list) => list.setAttribute('highlight', 'min'))
  await expect.poll(() => states(values('Seats'), 'highlighted')).toEqual([true, false, false])
})

test('differences-only hides the items whose values are all equal', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('diff')
  const items = page.locator('c2-description-item')
  await expect(items.nth(0)).toBeVisible()
  await expect(items.nth(1)).toBeHidden()
  await expect(items.nth(2)).toBeVisible()
  // A single value has nothing to differ from, so it always shows.
  await expect(items.nth(3)).toBeVisible()
  // `different` marks what changed: the After column, never the baseline.
  await expect.poll(() => states(page.locator('c2-description-item[label="Status"] c2-description-value'), 'highlighted')).toEqual([false, true])
  // A value edited to match shows the item no more; turning the filter off shows every item.
  await page
    .locator('c2-description-item[label="Amount"] c2-description-value')
    .nth(1)
    .evaluate((value) => (value.textContent = '€1,200.00'))
  await expect(items.nth(2)).toBeHidden()
  await page.locator('c2-description-list').evaluate((list) => list.removeAttribute('differences-only'))
  await expect(items).toHaveCount(4)
  for (let index = 0; index < 4; index++) await expect(items.nth(index)).toBeVisible()
})

test('column-selectable turns the column names into toggle buttons that select a column', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('compare')
  const list = page.locator('c2-description-list')
  await list.evaluate((el) => {
    ;(window as unknown as { events: unknown[] }).events = []
    el.addEventListener('selection-change', (event) => (window as unknown as { events: unknown[] }).events.push((event as CustomEvent).detail))
  })
  const events = () => page.evaluate(() => (window as unknown as { events: unknown[] }).events)
  const pro = page.getByRole('button', { name: 'Pro' })
  await expect(page.getByRole('button', { name: 'Starter' })).toHaveAttribute('aria-pressed', 'false')
  await pro.click()
  await expect(pro).toHaveAttribute('aria-pressed', 'true')
  expect(await list.evaluate((el) => el.selectedColumn)).toBe(1)
  expect(await events()).toEqual([{ column: 1 }])
  await expect.poll(() => states(page.locator('c2-description-item[label="Price"] c2-description-value'), 'selected')).toEqual([false, true, false])

  // Keyboard: Tab moves between the names, Space and Enter toggle.
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Enterprise' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(pro).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Enterprise' })).toHaveAttribute('aria-pressed', 'false')
  expect(await events()).toEqual([{ column: 1 }, { column: 2 }, { column: null }])
  await expect.poll(() => states(page.locator('c2-description-value'), 'selected')).toEqual(Array(12).fill(false))
})

test('the comparison costs nothing when unset: no buttons, no marks, every item shown', async ({ page, scenario }) => {
  await page.setViewportSize({ width: 1200, height: 800 })
  await scenario('groups')
  await expect(page.locator('c2-description-list [part="value-header"]')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('c2-description-list .value-header__button')).toHaveCount(0)
  await expect(page.locator('c2-description-item')).toHaveCount(2)
  for (const item of await page.locator('c2-description-item').all()) await expect(item).toBeVisible()
  expect(await states(page.locator('c2-description-value'), 'highlighted')).toEqual(Array(6).fill(false))
  expect(await states(page.locator('c2-description-value'), 'selected')).toEqual(Array(6).fill(false))
})

for (const name of ['default', 'header', 'rich-label', 'groups', 'groups-no-header', 'compare', 'diff']) {
  test(`has no detectable accessibility violations: ${name}`, async ({ page, scenario }) => {
    await scenario(name)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
  })
}
