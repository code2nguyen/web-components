import { test, expect, props, watch, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'
import type {} from './scenario-api'

test('toolbar presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const toolbar = page.locator('c2-virtual-list').locator('[part="search"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-virtual-list items="[]"><span slot="toolbar" data-slot-presence-probe>Tools</span></c2-virtual-list>',
    host: 'c2-virtual-list',
    slot: 'toolbar',
    assertPresent: async (present) => (present ? expect(toolbar).toBeVisible() : expect(toolbar).toBeHidden()),
  })
})

const PEOPLE = [
  { id: 'a', name: 'Ada Lovelace', team: 'Analytics' },
  { id: 'g', name: 'Grace Hopper', team: 'Compilers' },
  { id: 't', name: 'Alan Turing', team: 'Analytics' },
  { id: 'k', name: 'Katherine Johnson', team: 'Flight' },
]

const items = JSON.stringify(PEOPLE).replace(/'/g, '&#39;')

const list = (attributes = '') =>
  `<c2-virtual-list aria-label="People" item-key="id" label-field="name" description-field="team" items='${items}' ${attributes}></c2-virtual-list>`

test('renders one option per item, with its label and description', async ({ page, renderScenario }) => {
  await renderScenario(list())
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(4)
  await expect(page.getByRole('option').first()).toContainText('Ada Lovelace')
  await expect(page.getByRole('option').first()).toContainText('Analytics')
  await accessible(page)
})

test('falls back to a conventional label field, so a list of plain objects needs no configuration', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-virtual-list aria-label="Fruit" items='[{"name":"Apple"},{"name":"Pear"}]'></c2-virtual-list>`)
  await expect(page.getByRole('option').first()).toContainText('Apple')
  await expect(page.getByRole('option').last()).toContainText('Pear')
})

test('renders a list of bare strings', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-virtual-list aria-label="Fruit" items='["Apple","Pear"]'></c2-virtual-list>`)
  await expect(page.getByRole('option').first()).toContainText('Apple')
  await expect(page.getByRole('option').last()).toContainText('Pear')
})

test('windows a long list: the DOM stays small and the scrollbar spans everything', async ({ page, renderScenario }) => {
  await renderScenario(list())
  await props(page.locator('c2-virtual-list'), { itemKey: '', labelField: 'name' })
  await page.evaluate(() => window.virtualListScenario.fill(50_000))

  const before = await page.evaluate(() => window.virtualListScenario.stats())
  expect(before.renderedItems).toBeLessThan(60)
  expect(before.scrollHeight).toBeGreaterThan(50_000 * 30)
  expect(before.firstIndex).toBe(0)

  await page.evaluate(() => window.virtualListScenario.scrollTo(36_000))
  const after = await page.evaluate(() => window.virtualListScenario.stats())
  expect(after.renderedItems).toBeLessThan(60)
  expect(after.firstIndex).toBeGreaterThan(900)
  expect(after.scrollHeight).toBe(before.scrollHeight)
})

test('single selection replaces, multiple selection toggles and extends with shift', async ({ page, renderScenario }) => {
  await renderScenario(list('selection="single"'))
  const host = page.locator('c2-virtual-list')
  await watch(host, 'selection-change')

  await page.getByRole('option', { name: /Grace Hopper/ }).click()
  await expect(host).toHaveJSProperty('value', ['g'])
  await page.getByRole('option', { name: /Alan Turing/ }).click()
  await expect(host).toHaveJSProperty('value', ['t'])
  await expect(host).toHaveAttribute(
    'data-events',
    JSON.stringify([
      { value: ['g'], items: [PEOPLE[1]] },
      { value: ['t'], items: [PEOPLE[2]] },
    ]),
  )

  await props(host, { selection: 'multiple', value: [] })
  await page.getByRole('option', { name: /Ada Lovelace/ }).click()
  await page.getByRole('option', { name: /Katherine Johnson/ }).click({ modifiers: ['Shift'] })
  await expect(host).toHaveJSProperty('value', ['a', 'g', 't', 'k'])

  await page.getByRole('option', { name: /Grace Hopper/ }).click({ modifiers: [process.platform === 'darwin' ? 'Meta' : 'Control'] })
  await expect(host).toHaveJSProperty('value', ['a', 't', 'k'])
})

test('a disabled item cannot be selected', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-virtual-list aria-label="People" selection="single" item-key="id" label-field="name" disabled-field="blocked"
       items='[{"id":"a","name":"Ada"},{"id":"b","name":"Blocked","blocked":true}]'></c2-virtual-list>`,
  )
  const host = page.locator('c2-virtual-list')
  // `force`, because Playwright refuses to click an element the list has already marked `aria-disabled`.
  await page.getByRole('option', { name: 'Blocked' }).click({ force: true })
  await expect(host).toHaveJSProperty('value', [])
})

test('the keyboard walks the list and Enter selects', async ({ page, renderScenario }) => {
  await renderScenario(list('selection="single"'))
  const host = page.locator('c2-virtual-list')

  await page.getByRole('option').first().focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', ['t'])

  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', ['k'])

  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('value', ['a'])
})

test('the keyboard reaches an item far outside the rendered window', async ({ page, renderScenario }) => {
  await renderScenario(list())
  await page.evaluate(() => window.virtualListScenario.fill(50_000))
  await page.getByRole('option').first().focus()
  await page.keyboard.press('End')
  await page.evaluate(() => window.virtualListScenario.settle())

  const stats = await page.evaluate(() => window.virtualListScenario.stats())
  expect(stats.lastIndex).toBe(49_999)
  await expect(page.locator('c2-virtual-list')).toHaveJSProperty('focusedIndex', 49_999)
})

test('the search property narrows the list and reports how many matched', async ({ page, renderScenario }) => {
  await renderScenario(list())
  const host = page.locator('c2-virtual-list')
  await watch(host, 'search-change')

  // `an` is in both Analytics teams and in Alan, but in no other name or team.
  await props(host, { search: 'an' })
  await expect(page.getByRole('option')).toHaveCount(2)

  await props(host, { search: 'grace' })
  await expect(page.getByRole('option')).toHaveText([/Grace Hopper/])
  await expect(host).toHaveAttribute(
    'data-events',
    JSON.stringify([
      { search: 'an', matchCount: 2 },
      { search: 'grace', matchCount: 1 },
    ]),
  )

  await props(host, { search: '' })
  await expect(page.getByRole('option')).toHaveCount(4)
})

test('typing in the built-in search field filters, highlights, and shows a no-results message', async ({ page, renderScenario }) => {
  await renderScenario(list('searchable highlight search-debounce="0"'))
  await page.getByRole('searchbox').fill('lovelace')
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(page.locator('c2-virtual-list').locator('mark')).toHaveText('Lovelace')

  await page.getByRole('searchbox').fill('nobody')
  await expect(page.getByRole('option')).toHaveCount(0)
  await expect(page.locator('c2-virtual-list')).toContainText('No matches')
  await accessible(page)
})

test('search-fields limits what a query is matched against', async ({ page, renderScenario }) => {
  await renderScenario(list('search-fields="team"'))
  await props(page.locator('c2-virtual-list'), { search: 'analytics' })
  await expect(page.getByRole('option')).toHaveCount(2)

  await props(page.locator('c2-virtual-list'), { search: 'ada' })
  await expect(page.getByRole('option')).toHaveCount(0)
})

test('a matcher replaces the built-in field matching', async ({ page, renderScenario }) => {
  await renderScenario(list())
  await page.locator('c2-virtual-list').evaluate(async (element) => {
    const list = element as HTMLElement & { matcher: unknown; search: string; updateComplete: Promise<boolean> }
    list.matcher = (item: { id: string }, query: string) => item.id === query
    list.search = 'k'
    await list.updateComplete
  })
  await expect(page.getByRole('option')).toHaveText([/Katherine Johnson/])
})

test('sort orders the list, and the attribute form parses field:direction', async ({ page, renderScenario }) => {
  await renderScenario(list('sort="name:desc"'))
  await expect(page.getByRole('option').first()).toContainText('Katherine Johnson')

  await props(page.locator('c2-virtual-list'), { sort: { field: 'name', direction: 'asc' } })
  await expect(page.getByRole('option').first()).toContainText('Ada Lovelace')
})

test('empty, loading and error states each replace the list', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-virtual-list aria-label="People" items="[]"></c2-virtual-list>`)
  const host = page.locator('c2-virtual-list')
  await expect(host).toContainText('No items')

  await props(host, { loading: true })
  await expect(host.locator('c2-spinner')).toBeVisible()

  await props(host, { loading: false, error: 'Could not load' })
  await expect(host).toContainText('Could not load')
})

test('stable search, footer, and shared state parts coexist with assigned-only slots', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-virtual-list searchable items="[]"><span class="slot-probe" slot="toolbar">Tools</span><span slot="footer">Footer</span><span slot="empty">Empty</span><span slot="loading">Loading</span><span slot="error">Error</span><span class="slot-probe" slot="no-results">None</span></c2-virtual-list>',
  )
  await page.addStyleTag({
    content:
      'c2-virtual-list::part(search){background:rgb(1,2,3)}c2-virtual-list::part(footer){background:rgb(4,5,6)}c2-virtual-list::part(state){background:rgb(7,8,9)}',
  })
  const host = page.locator('c2-virtual-list')
  await expect(host.locator('[part="search"]')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('[part="footer"]')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  for (const state of [
    { loading: false, error: '' },
    { loading: true, error: '' },
    { loading: false, error: 'Failed' },
  ]) {
    await props(host, state)
    await expect(host.locator('[part="state"]')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  }
  await page.locator('.slot-probe').evaluateAll((nodes) => nodes.forEach((node) => ((node as HTMLElement).style.color = 'rgb(10, 11, 12)')))
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.color)))
    .toEqual(Array(2).fill('rgb(10, 11, 12)'))
})

test('a data source is asked only for the blocks the window needs, and search goes to the server', async ({ page, renderScenario }) => {
  await renderScenario(list('block-size="100"'))
  await page.evaluate(() => window.virtualListScenario.useDataSource(10_000))

  await expect(page.locator('c2-virtual-list')).toHaveJSProperty('itemCount', 10_000)
  expect(await page.evaluate(() => window.virtualListScenario.requestCount())).toBeLessThan(4)
  await expect(page.getByRole('option').first()).toContainText('Ada Lovelace 1')

  await props(page.locator('c2-virtual-list'), { search: 'Ada Lovelace 1' })
  await page.evaluate(() => window.virtualListScenario.settle())
  // 1, 15, 22, … every name containing the string — far fewer than the 10 000 it started with.
  await expect(page.locator('c2-virtual-list')).not.toHaveJSProperty('itemCount', 10_000)
  await expect(page.getByRole('option').first()).toContainText('Ada Lovelace 1')
})

test('rows a data source has not delivered yet render as skeletons, not as gaps', async ({ page, renderScenario }) => {
  await renderScenario(list('block-size="50"'))
  await page.evaluate(() => window.virtualListScenario.useDataSource(5_000))
  await page.evaluate(() => window.virtualListScenario.hold())
  await page.evaluate(() => window.virtualListScenario.scrollTo(60_000))

  await expect(page.locator('c2-virtual-list').locator('css=.skeleton').first()).toBeVisible()
  await page.evaluate(() => window.virtualListScenario.release())
  await expect(page.locator('c2-virtual-list').locator('css=.skeleton')).toHaveCount(0)
})

test('scrollToIndex brings a far item into view', async ({ page, renderScenario }) => {
  await renderScenario(list())
  await page.evaluate(() => window.virtualListScenario.fill(50_000))
  await page.locator('c2-virtual-list').evaluate((element) => (element as HTMLElement & { scrollToIndex(index: number): void }).scrollToIndex(30_000))
  await page.evaluate(() => window.virtualListScenario.settle())

  const stats = await page.evaluate(() => window.virtualListScenario.stats())
  expect(stats.firstIndex).toBeLessThanOrEqual(30_000)
  expect(stats.lastIndex).toBeGreaterThanOrEqual(30_000)
})

test('virtual="never" renders every row', async ({ page, renderScenario }) => {
  await renderScenario(list('virtual="never"'))
  await page.evaluate(() => window.virtualListScenario.fill(300))
  await expect(page.getByRole('option')).toHaveCount(300)
})

test('refresh picks up an items array that was mutated in place', async ({ page, renderScenario }) => {
  await renderScenario(list())
  await expect(page.getByRole('option')).toHaveCount(4)

  await page.locator('c2-virtual-list').evaluate(async (element) => {
    const host = element as HTMLElement & { items: unknown[]; refresh(): void; updateComplete: Promise<boolean> }
    host.items.push({ id: 'r', name: 'Radia Perlman', team: 'Networks' })
    host.refresh()
    await host.updateComplete
  })
  await expect(page.getByRole('option')).toHaveCount(5)
})

test('a run of adjacent selected rows squares the corners between them', async ({ page, renderScenario }) => {
  await renderScenario(list('selection="multiple" value="g;t"'))
  const joins = () =>
    page
      .locator('c2-virtual-list')
      .evaluate((element) =>
        [...element.shadowRoot!.querySelectorAll('.item')].map(
          (row) => `${row.hasAttribute('joined-before') ? 'b' : ''}${row.hasAttribute('joined-after') ? 'a' : ''}` || '-',
        ),
      )

  // Grace and Alan are neighbours: the first squares its bottom, the second its top, and the run reads as one block.
  expect(await joins()).toEqual(['-', 'a', 'b', '-'])

  // The attributes have to actually reach `c2-list-item`'s rule, or the run still renders as two pills.
  const radii = await page.locator('c2-virtual-list').evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll('.item')]
      .slice(1, 3)
      .map((row) => getComputedStyle(row.shadowRoot!.querySelector('.c2-list-item')!))
      .map((style) => [style.borderTopLeftRadius, style.borderBottomLeftRadius]),
  )
  expect(radii).toEqual([
    ['6px', '0px'],
    ['0px', '6px'],
  ])

  // A gap in the selection joins nothing.
  await props(page.locator('c2-virtual-list'), { value: ['a', 't'] })
  expect(await joins()).toEqual(['-', '-', '-', '-'])
})

test('a selected run stays joined across the edge of the rendered window', async ({ page, renderScenario }) => {
  await renderScenario(list('selection="multiple"'))
  await page.evaluate(() => window.virtualListScenario.fill(4_000))
  // Keys fall back to the row index when no item-key resolves, so this selects a solid run of 40 rows.
  await props(page.locator('c2-virtual-list'), { itemKey: '', value: Array.from({ length: 40 }, (_, index) => String(index + 980)) })
  await page.evaluate(() => window.virtualListScenario.scrollTo(36_000))

  const rendered = await page.locator('c2-virtual-list').evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll('.item')]
      .map((row) => ({
        index: Number((row as HTMLElement).dataset.index),
        before: row.hasAttribute('joined-before'),
        after: row.hasAttribute('joined-after'),
      }))
      .filter((row) => row.index >= 981 && row.index <= 1018),
  )
  // Every interior row of the run is joined on both sides, including the ones at the window boundary.
  expect(rendered.length).toBeGreaterThan(0)
  expect(rendered.every((row) => row.before && row.after)).toBe(true)
})
