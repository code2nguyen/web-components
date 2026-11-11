import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/tree'
import type { TreeNode } from '../src/tree-types'

const files = `
  <c2-tree-item value="src" label="src">
    <c2-tree-item value="app" label="app.ts"></c2-tree-item>
    <c2-tree-item value="main" label="main.ts"></c2-tree-item>
  </c2-tree-item>
  <c2-tree-item value="docs" label="docs"></c2-tree-item>
  <c2-tree-item value="readme" label="README.md"></c2-tree-item>
`

const tree = (attributes = '') => `<c2-tree aria-label="Files" reorderable ${attributes}>${files}</c2-tree>`

const itemOf = (page: Page, value: string) => page.locator(`c2-tree-item[value="${value}"]`)
const rowOf = (page: Page, value: string) => itemOf(page, value).locator('.row').first()

/** Values of the rows in document order, each prefixed with its parent's value, so the shape is one string. */
const shape = (page: Page) =>
  page.locator('c2-tree').evaluate((host) => {
    const rows = [...host.querySelectorAll('c2-tree-item'), ...(host.shadowRoot?.querySelectorAll('c2-tree-item') ?? [])]
    return rows.map((row) => `${row.parentElement?.closest('c2-tree-item')?.getAttribute('value') ?? ''}/${row.getAttribute('value')}`).join(' ')
  })

const announcement = (page: Page) => page.locator('c2-tree').locator('.live')

/** Waits for the reordering module: it loads on first use, then adds the indicator to the shadow root. */
const ready = (page: Page) => expect(page.locator('c2-tree').locator('.drop-indicator')).toHaveCount(1)

test('a tree that is not reorderable never loads the reordering module', async ({ page, renderScenario }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await renderScenario(`<c2-tree aria-label="Files">${files}</c2-tree>`)
  const src = itemOf(page, 'src')
  await src.focus()
  // Alt+Arrow is plain navigation on a read-only tree: the focus moves and nothing is reordered.
  await page.keyboard.press('Alt+ArrowDown')
  await expect(itemOf(page, 'docs')).toBeFocused()
  await expect(page.locator('c2-tree').locator('.drop-indicator')).toHaveCount(0)
  expect(requests.filter((url) => url.includes('tree-reorder'))).toEqual([])
  expect(await shape(page)).toBe('/src src/app src/main /docs /readme')

  await page.locator('c2-tree').evaluate((host) => host.setAttribute('reorderable', ''))
  await ready(page)
  expect(requests.some((url) => url.includes('tree-reorder'))).toBe(true)
})

test('Alt with Arrow Up and Down moves a row among its siblings and keeps the focus on it', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await ready(page)
  const host = page.locator('c2-tree')
  await watch(host, 'item-move')

  await itemOf(page, 'readme').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect.poll(() => shape(page)).toBe('/src src/app src/main /readme /docs')
  await expect(itemOf(page, 'readme')).toBeFocused()
  await expect(itemOf(page, 'readme')).toHaveHostAria('aria-posinset', '2')
  await expect(announcement(page)).toHaveText('README.md moved to position 2 of 3.')
  await expect(host).toHaveAttribute(
    'data-events',
    JSON.stringify([
      {
        node: { value: 'readme', label: 'README.md', disabled: false, hasChildren: false },
        parent: null,
        index: 1,
        previousParent: null,
        previousIndex: 2,
      },
    ]),
  )

  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => shape(page)).toBe('/src src/app src/main /docs /readme')
  await expect(itemOf(page, 'readme')).toBeFocused()

  // At the end of its siblings it stays put and says so.
  await page.keyboard.press('Alt+ArrowDown')
  await expect(announcement(page)).toHaveText('README.md cannot move there.')
  expect(await shape(page)).toBe('/src src/app src/main /docs /readme')
  await accessible(page)
})

test('Alt with Arrow Right nests a row under the one above, Alt with Arrow Left moves it back out', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await ready(page)

  await itemOf(page, 'docs').focus()
  await page.keyboard.press('Alt+ArrowRight')
  // A collapsed branch takes the row last, and opens so the moved row stays visible and focused.
  await expect.poll(() => shape(page)).toBe('/src src/app src/main src/docs /readme')
  await expect(page.locator('c2-tree')).toHaveJSProperty('expandedItems', ['src'])
  await expect(itemOf(page, 'docs')).toBeFocused()
  await expect(itemOf(page, 'docs')).toHaveHostAria('aria-level', '2')
  await expect(announcement(page)).toHaveText('docs moved into src, position 3 of 3.')

  await page.keyboard.press('Alt+ArrowLeft')
  await expect.poll(() => shape(page)).toBe('/src src/app src/main /docs /readme')
  await expect(itemOf(page, 'docs')).toBeFocused()
  await expect(itemOf(page, 'docs')).toHaveHostAria('aria-level', '1')

  // Plain arrows still navigate.
  await page.keyboard.press('ArrowDown')
  await expect(itemOf(page, 'readme')).toBeFocused()
})

test('max-depth keeps a row and its subtree within the allowed levels', async ({ page, renderScenario }) => {
  await renderScenario(tree('max-depth="1" expanded-items="src"'))
  await ready(page)

  // `main` is at level 1; nesting it under `app` would put it at level 2.
  await itemOf(page, 'main').focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(announcement(page)).toHaveText('main.ts cannot move there.')

  // `src` has children, so it may not go under `docs`: its children would land at level 2.
  await itemOf(page, 'docs').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await itemOf(page, 'src').focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(announcement(page)).toHaveText('src cannot move there.')
  expect(await shape(page)).toBe('/docs /src src/app src/main /readme')
})

test('a disabled row neither moves nor takes children, and cancelling item-move keeps the tree as it was', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable>
    <c2-tree-item value="locked" label="Locked" disabled></c2-tree-item>
    <c2-tree-item value="notes" label="Notes"></c2-tree-item>
    <c2-tree-item value="todo" label="Todo"></c2-tree-item>
  </c2-tree>`)
  await ready(page)

  await itemOf(page, 'notes').focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect(announcement(page)).toHaveText('Notes cannot move there.')

  await page.locator('c2-tree').evaluate((host) => host.addEventListener('item-move', (event) => event.preventDefault()))
  await page.keyboard.press('Alt+ArrowDown')
  await expect(itemOf(page, 'notes')).toBeFocused()
  expect(await shape(page)).toBe('/locked /notes /todo')
})

test('a data-driven tree rebuilds items, keeping untouched branches identical', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Files" reorderable></c2-tree>')
  const host = page.locator('c2-tree')
  await props(host, {
    items: [
      { value: 'src', label: 'src', children: [{ value: 'app', label: 'app.ts' }] },
      { value: 'lib', label: 'lib', children: [{ value: 'util', label: 'util.ts' }] },
      { value: 'readme', label: 'README.md' },
    ],
  })
  await ready(page)
  await host.evaluate((element: Tree) => ((window as unknown as { lib: unknown }).lib = element.items[1]))

  await itemOf(page, 'readme').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(itemOf(page, 'readme')).toHaveHostAria('aria-posinset', '2')
  await page.keyboard.press('Alt+ArrowRight')
  await expect
    .poll(() =>
      host.evaluate((element: Tree) => JSON.stringify(element.items.map((node: TreeNode) => [node.value, node.children?.map((child) => child.value)]))),
    )
    .toBe(
      JSON.stringify([
        ['src', ['app', 'readme']],
        ['lib', ['util']],
      ]),
    )
  await expect(itemOf(page, 'readme')).toBeFocused()
  expect(
    await host.evaluate((element: Tree) => element.items.find((node: TreeNode) => node.value === 'lib') === (window as unknown as { lib: unknown }).lib),
  ).toBe(true)
})

test('dragging a row to the right of the row above nests it; dragging left moves it out', async ({ page, renderScenario }) => {
  await renderScenario(tree('expanded-items="src"'))
  await ready(page)
  const host = page.locator('c2-tree')
  await watch(host, 'item-move')

  // Drop `readme` just below `main` (the last child of `src`), pushed one indent to the right: it joins `src`.
  const from = (await rowOf(page, 'readme').boundingBox())!
  const main = (await rowOf(page, 'main').boundingBox())!
  await page.mouse.move(from.x + 40, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 44, from.y + from.height / 2, { steps: 2 })
  await page.mouse.move(from.x + 60, main.y + main.height * 0.9, { steps: 4 })
  await expect(host.locator('.drop-indicator')).toBeVisible()
  await expect(itemOf(page, 'src')).toHaveJSProperty('dropTarget', true)
  await page.mouse.up()
  await expect.poll(() => shape(page)).toBe('/src src/app src/main src/readme /docs')
  await expect(host.locator('.drop-indicator')).toBeHidden()
  await expect(itemOf(page, 'src')).toHaveJSProperty('dropTarget', false)
  // The release does not select the row it ends over.
  await expect(host).toHaveJSProperty('value', [])

  // Back out to the root, after `src`, by dragging left past one indent.
  const moved = (await rowOf(page, 'readme').boundingBox())!
  await page.mouse.move(moved.x + 60, moved.y + moved.height / 2)
  await page.mouse.down()
  await page.mouse.move(moved.x + 50, moved.y + moved.height / 2, { steps: 2 })
  await page.mouse.move(moved.x + 30, moved.y + moved.height * 0.6, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => shape(page)).toBe('/src src/app src/main /readme /docs')
})

test('Escape cancels a drag and a press on the toggle is not a drag', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await ready(page)
  const host = page.locator('c2-tree')

  const readme = (await rowOf(page, 'readme').boundingBox())!
  const src = (await rowOf(page, 'src').boundingBox())!
  await page.mouse.move(readme.x + 40, readme.y + readme.height / 2)
  await page.mouse.down()
  await page.mouse.move(readme.x + 40, src.y + 2, { steps: 5 })
  await expect(itemOf(page, 'readme')).toHaveJSProperty('dragging', true)
  await page.keyboard.press('Escape')
  await expect(itemOf(page, 'readme')).toHaveJSProperty('dragging', false)
  await expect(host.locator('.drop-indicator')).toBeHidden()
  await page.mouse.up()
  await expect(announcement(page)).toHaveText('Move of README.md cancelled.')
  expect(await shape(page)).toBe('/src src/app src/main /docs /readme')

  const toggle = itemOf(page, 'src').locator('.toggle').first()
  const box = (await toggle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, readme.y + readme.height, { steps: 5 })
  await page.mouse.up()
  expect(await shape(page)).toBe('/src src/app src/main /docs /readme')
})

test('announcements follow the language of the page', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${tree()}</div>`)
  await ready(page)
  await itemOf(page, 'readme').focus()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(announcement(page)).toHaveText('README.md déplacé en position 2 sur 3.')
})

test('a dragged row resting on a collapsed branch opens it, and the drop lands inside', async ({ page, renderScenario }) => {
  await renderScenario(tree())
  await ready(page)

  const readme = (await rowOf(page, 'readme').boundingBox())!
  const src = (await rowOf(page, 'src').boundingBox())!
  await page.mouse.move(readme.x + 40, readme.y + readme.height / 2)
  await page.mouse.down()
  await page.mouse.move(readme.x + 44, readme.y + readme.height / 2, { steps: 2 })
  await page.mouse.move(readme.x + 44, src.y + src.height / 2, { steps: 4 })
  await expect(page.locator('c2-tree')).toHaveJSProperty('expandedItems', ['src'])

  // Now open, `src` shows its children: drop between `app` and `main`, one indent right of the root.
  const main = (await rowOf(page, 'main').boundingBox())!
  await page.mouse.move(readme.x + 60, main.y + 2, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => shape(page)).toBe('/src src/app src/readme src/main /docs')
})

test('a drag is clamped to max-depth', async ({ page, renderScenario }) => {
  await renderScenario(tree('expanded-items="src" max-depth="0"'))
  await ready(page)

  // Pushed far right under `main`, the row still lands at the root: depth 0 is the limit.
  const readme = (await rowOf(page, 'readme').boundingBox())!
  const main = (await rowOf(page, 'main').boundingBox())!
  await page.mouse.move(readme.x + 40, readme.y + readme.height / 2)
  await page.mouse.down()
  await page.mouse.move(readme.x + 44, readme.y + readme.height / 2, { steps: 2 })
  await page.mouse.move(readme.x + 120, main.y + main.height * 0.9, { steps: 4 })
  await page.mouse.up()
  await expect.poll(() => shape(page)).toBe('/src src/app src/main /readme /docs')
})
