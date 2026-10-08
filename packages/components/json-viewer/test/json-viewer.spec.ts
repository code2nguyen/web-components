import { test, expect, props, watch, accessible, clipboard } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const user = {
  name: 'Ada',
  age: 36,
  admin: true,
  manager: null,
  'first name': 'Ada',
  address: { city: 'London', zip: 'NW1' },
  roles: ['admin', 'editor'],
}

const viewer = (attributes = '', data: unknown = user) => `<c2-json-viewer label="User" data='${JSON.stringify(data)}' ${attributes}></c2-json-viewer>`

const line = (page: Page, key: string) => page.getByRole('treeitem').filter({ has: page.locator('[part="key"]', { hasText: new RegExp(`^${key}$`) }) })

test('shows the top-level entries with their types and opens the second level', async ({ page, renderScenario }) => {
  await renderScenario(viewer())
  await expect(page.getByRole('tree', { name: 'User' })).toBeVisible()
  await expect(line(page, 'name')).toContainText('"Ada"')
  await expect(line(page, 'age')).toContainText('36')
  await expect(line(page, 'admin')).toContainText('true')
  await expect(line(page, 'manager')).toContainText('null')
  await expect(line(page, 'address')).toHaveAttribute('aria-expanded', 'true')
  await expect(line(page, 'city')).toHaveAttribute('aria-level', '2')
  await expect(line(page, 'roles')).toContainText('2 items')
  await expect(line(page, 'name')).not.toHaveAttribute('aria-expanded')
  await accessible(page)
})

test('expand-depth sets how many levels start open; expandAll and collapseAll reset every branch', async ({ page, renderScenario }) => {
  await renderScenario(viewer('expand-depth="1"', { a: { b: { c: 1 } } }))
  await expect(line(page, 'a')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('treeitem')).toHaveCount(1)
  await page.locator('c2-json-viewer').evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  await expect(line(page, 'c')).toBeVisible()
  await page.locator('c2-json-viewer').evaluate((element) => (element as HTMLElement & { collapseAll(): void }).collapseAll())
  await expect(page.getByRole('treeitem')).toHaveCount(1)
})

test('clicking a branch toggles it and reports the change', async ({ page, renderScenario }) => {
  await renderScenario(viewer())
  const host = page.locator('c2-json-viewer')
  await watch(host, 'expansion-change')
  await line(page, 'address').click()
  await expect(line(page, 'address')).toHaveAttribute('aria-expanded', 'false')
  await expect(line(page, 'city')).toHaveCount(0)
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ path: '$.address', segments: ['address'], expanded: false }]))
})

test('arrow keys walk, open and close the lines', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button>${viewer()}<button>After</button>`)
  await tab()
  await expect(page.getByRole('button', { name: 'Before' })).toBeFocused()
  await tab()
  await expect(line(page, 'name')).toBeFocused()
  await expect(line(page, 'name')).toHaveAttribute('tabindex', '0')
  await page.keyboard.press('End')
  await expect(line(page, '1')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(line(page, 'roles')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(line(page, 'roles')).toHaveAttribute('aria-expanded', 'false')
  await expect(line(page, '1')).toHaveCount(0)
  await page.keyboard.press('ArrowRight')
  await expect(line(page, 'roles')).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowRight')
  await expect(line(page, '0')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(line(page, 'roles')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(line(page, 'zip')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(line(page, 'name')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(line(page, 'name')).toBeFocused()
  // The viewer is a single tab stop: the focused line, and nothing else inside it (in Firefox a scroll container
  // would otherwise be one too).
  await page.keyboard.press('ArrowDown')
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await tab(true)
  await expect(line(page, 'age')).toBeFocused()
  await tab(true)
  await expect(page.getByRole('button', { name: 'Before' })).toBeFocused()
})

test('copies a path from the line button and a value from the keyboard', async ({ page, renderScenario }) => {
  await renderScenario(viewer())
  await clipboard(page)
  const host = page.locator('c2-json-viewer')
  await watch(host, 'copied')
  await line(page, 'first name').hover()
  await line(page, 'first name').locator('[data-action="path"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '$["first name"]')
  await line(page, 'address').hover()
  await line(page, 'address').locator('[data-action="value"]').click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', JSON.stringify(user.address, null, 2))
  await line(page, 'city').focus()
  await page.keyboard.press('c')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', 'London')
  await page.keyboard.press('p')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '$.address.city')
  await expect(host).toHaveAttribute(
    'data-events',
    JSON.stringify([
      { text: '$["first name"]', kind: 'path', path: ['first name'] },
      { text: JSON.stringify(user.address, null, 2), kind: 'value', path: ['address'] },
      { text: 'London', kind: 'value', path: ['address', 'city'] },
      { text: '$.address.city', kind: 'path', path: ['address', 'city'] },
    ]),
  )
})

test('path-format="pointer" writes JSON Pointer paths', async ({ page, renderScenario }) => {
  await renderScenario(viewer('path-format="pointer"', { 'a/b': [{ 'c~d': 1 }] }))
  await clipboard(page)
  await page.locator('c2-json-viewer').evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  await line(page, 'c~d').focus()
  await page.keyboard.press('p')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '/a~1b/0/c~0d')
})

test('a failed clipboard write reports an error and claims no copy', async ({ page, renderScenario }) => {
  await renderScenario(viewer())
  await clipboard(page, true)
  const host = page.locator('c2-json-viewer')
  await watch(host, 'copy-error')
  await line(page, 'name').focus()
  await page.keyboard.press('c')
  await expect.poll(async () => JSON.parse((await host.getAttribute('data-events')) ?? '[]').length).toBe(1)
  await expect(line(page, 'name').locator('.action.copied')).toHaveCount(0)
})

test('search highlights matches and opens the branches leading to them', async ({ page, renderScenario }) => {
  await renderScenario(viewer('expand-depth="1"', { team: { lead: { name: 'Grace' } }, other: 'grace notes', skip: 1 }))
  const host = page.locator('c2-json-viewer')
  await props(host, { search: 'GRACE' })
  await expect(line(page, 'name')).toBeVisible()
  await expect(page.locator('mark')).toHaveText(['Grace', 'grace'])
  await expect(line(page, 'skip')).toBeVisible()
  await expect(host).toHaveJSProperty('searchMatches', ['$.team.lead.name', '$.other'])
  await line(page, 'lead').click()
  await expect(line(page, 'name')).toHaveCount(0)
  await line(page, 'lead').click()
  await props(host, { filter: true })
  await expect(line(page, 'skip')).toHaveCount(0)
  await expect(page.getByRole('treeitem')).toHaveCount(4)
  await props(host, { search: 'nothing here' })
  await expect(page.getByRole('treeitem')).toHaveCount(0)
  await expect(host.locator('.empty')).toHaveText('No match')
  await props(host, { search: '' })
  await expect(line(page, 'team')).toHaveAttribute('aria-expanded', 'false')
})

test('a long branch shows a page of children and reveals the rest on demand', async ({ page, renderScenario }) => {
  await renderScenario(viewer('page-size="3"', { items: Array.from({ length: 8 }, (_, i) => i * 10) }))
  const more = page.getByRole('treeitem', { name: 'Show 3 more of 5' })
  await expect(line(page, '2')).toBeVisible()
  await expect(line(page, '3')).toHaveCount(0)
  await expect(more).toHaveAttribute('aria-posinset', '4')
  await more.click()
  await expect(line(page, '5')).toBeVisible()
  await page.getByRole('treeitem', { name: 'Show 2 more of 2' }).focus()
  await page.keyboard.press('Enter')
  await expect(line(page, '7')).toContainText('70')
  await expect(page.getByRole('treeitem', { name: /Show/ })).toHaveCount(0)
})

test('search reaches a match past the page', async ({ page, renderScenario }) => {
  await renderScenario(viewer('page-size="2" search="needle"', { items: ['a', 'b', 'c', 'needle'] }))
  await expect(line(page, '3')).toContainText('needle')
})

test('primitive, empty, circular and missing data', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-viewer data="42"></c2-json-viewer>')
  await expect(page.getByRole('treeitem')).toHaveText('42')
  await renderScenario(`<c2-json-viewer data='[]'></c2-json-viewer>`)
  await expect(page.locator('c2-json-viewer').locator('.empty')).toHaveText('[]')
  await renderScenario('<c2-json-viewer><span slot="empty">Nothing loaded</span></c2-json-viewer>')
  await expect(page.getByText('Nothing loaded')).toBeVisible()
  await renderScenario('<c2-json-viewer expand-depth="5"></c2-json-viewer>')
  await page.locator('c2-json-viewer').evaluate((element) => {
    const node: Record<string, unknown> = { id: 1 }
    node.self = node
    ;(element as HTMLElement & { data: unknown }).data = node
  })
  await expect(line(page, 'self')).toContainText('[Circular]')
})

test('sort-keys orders object keys alphabetically', async ({ page, renderScenario }) => {
  await renderScenario(viewer('sort-keys', { b: 1, c: 2, a: 3 }))
  await expect(page.locator('[part="key"]')).toHaveText(['a', 'b', 'c'])
})

test('takes its width from its content in a shrink-to-fit container', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="display: inline-flex">${viewer()}</div>`)
  const width = await page.locator('c2-json-viewer').evaluate((element) => element.getBoundingClientRect().width)
  expect(width).toBeGreaterThan(150)
  await expect(line(page, 'first name')).toContainText('"Ada"')
})

test('a key with characters JSONPath shorthand does not allow is written in brackets', async ({ page, renderScenario }) => {
  await renderScenario(viewer('', { cash$tag: 1, _ok: 2 }))
  await clipboard(page)
  await line(page, 'cash\\$tag').focus()
  await page.keyboard.press('p')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '$["cash$tag"]')
  await line(page, '_ok').focus()
  await page.keyboard.press('p')
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '$._ok')
})

test('a real "#more" key does not collide with the show-more line', async ({ page, renderScenario }) => {
  await renderScenario(viewer('page-size="2"', { a: 1, '#more': 2, b: 3, c: 4 }))
  await expect(line(page, '#more')).toContainText('2')
  await page.getByRole('treeitem', { name: 'Show 2 more of 2' }).click()
  await expect(line(page, 'c')).toContainText('4')
  await expect(page.getByRole('treeitem')).toHaveCount(4)
})

test('page-size below one still pages forward', async ({ page, renderScenario }) => {
  await renderScenario(viewer('page-size="0" style="--c2-json-viewer--max-height: 300px"', { items: Array.from({ length: 150 }, (_, i) => i) }))
  await line(page, 'items').focus()
  await page.keyboard.press('End')
  const more = page.getByRole('treeitem', { name: 'Show 50 more of 50' })
  await expect(more).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(line(page, '100')).toBeFocused()
  await page.keyboard.press('End')
  await expect(line(page, '149')).toBeFocused()
})

test('a filtered primitive root that does not match shows no line', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-viewer data="42" search="7" filter></c2-json-viewer>')
  await expect(page.getByRole('treeitem')).toHaveCount(0)
  await expect(page.locator('c2-json-viewer').locator('.empty')).toHaveText('No match')
})

test('expandAll reopens branches closed during a search', async ({ page, renderScenario }) => {
  await renderScenario(viewer('search="city"'))
  await line(page, 'address').click()
  await expect(line(page, 'city')).toHaveCount(0)
  await page.locator('c2-json-viewer').evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  await expect(line(page, 'city')).toBeVisible()
})
