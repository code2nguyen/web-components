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

test('quick repeated moves in a data-driven tree each take one step', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Steps" reorderable></c2-tree>')
  const host = page.locator('c2-tree')
  await props(host, { items: ['a', 'b', 'c', 'd'].map((value) => ({ value, label: value })) })
  await ready(page)
  const events: unknown[] = []
  await page.exposeFunction('recordMove', (detail: unknown) => events.push(detail))
  await host.evaluate((element) =>
    element.addEventListener('item-move', (event) =>
      (window as unknown as { recordMove: (d: unknown) => void }).recordMove((event as CustomEvent).detail.previousIndex),
    ),
  )

  await itemOf(page, 'a').focus()
  // Two presses inside one task: the second must not read the rows the first has not re-rendered yet.
  await host.evaluate((element) => {
    const row = element.shadowRoot!.querySelector('c2-tree-item[value="a"]')!
    for (let i = 0; i < 2; i += 1) row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, composed: true }))
  })
  await page.keyboard.press('Alt+ArrowDown')
  await expect.poll(() => host.evaluate((element: Tree) => element.items.map((node: TreeNode) => node.value).join(''))).toBe('bcad')
  expect(events).toEqual([0, 1])
})

test('a lazily loaded branch whose last child moves out becomes a leaf, and a rem indent still drags by level', async ({ page, renderScenario }) => {
  await renderScenario('<c2-tree aria-label="Files" reorderable style="--c2-tree-item__row--indent: 2rem"></c2-tree>')
  const host = page.locator('c2-tree')
  await props(host, {
    items: [
      { value: 'remote', label: 'Remote', hasChildren: true, children: [{ value: 'only', label: 'Only' }] },
      { value: 'local', label: 'Local' },
    ],
    expandedItems: ['remote'],
  })
  await ready(page)
  await itemOf(page, 'only').focus()
  await page.keyboard.press('Alt+ArrowLeft')
  await expect
    .poll(() => host.evaluate((element: Tree) => JSON.stringify(element.items.map((node: TreeNode) => [node.value, node.hasChildren ?? false]))))
    .toBe(
      JSON.stringify([
        ['remote', false],
        ['only', false],
        ['local', false],
      ]),
    )

  // 2rem is 32px: 40px to the right of the press is one level, under `only`.
  const local = (await rowOf(page, 'local').boundingBox())!
  await page.mouse.move(local.x + 30, local.y + local.height / 2)
  await page.mouse.down()
  await page.mouse.move(local.x + 34, local.y + local.height / 2, { steps: 2 })
  await page.mouse.move(local.x + 70, local.y + local.height / 2 - 2, { steps: 4 })
  await page.mouse.up()
  await expect
    .poll(() =>
      host.evaluate((element: Tree) => JSON.stringify(element.items.map((node: TreeNode) => [node.value, node.children?.map((child) => child.value)]))),
    )
    .toBe(
      JSON.stringify([
        ['remote', []],
        ['only', ['local']],
      ]),
    )
})

test('Alt with an arrow inside a row action stays with that control', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable>
    <c2-tree-item value="one" label="One"></c2-tree-item>
    <c2-tree-item value="two" label="Two"><button slot="actions">More</button></c2-tree-item>
  </c2-tree>`)
  await ready(page)
  await page.getByRole('button', { name: 'More' }).focus()
  await page.keyboard.press('Alt+ArrowUp')
  expect(await shape(page)).toBe('/one /two')
})

// ---- drops of nodes from outside the tree (another tree, another window) ----

const NODE_TYPE = 'application/x-c2n-tree-node+json'

/**
 * Synthesises a drag of an item payload onto the row of `value` at `fraction` of its height (0 is its top edge):
 * dragenter and dragover, then the drop (or a dragleave when `drop` is false). Returns how the tree was lit meanwhile.
 */
async function dropPayload(page: Page, value: string, fraction: number, type: string, payload: unknown, drop = true): Promise<string> {
  return page.evaluate(
    async ({ value, fraction, type, payload, drop }) => {
      const host = document.querySelector('c2-tree') as HTMLElement & { updateComplete: Promise<unknown> }
      const item = host.querySelector(`c2-tree-item[value="${value}"]`) ?? host.shadowRoot!.querySelector(`c2-tree-item[value="${value}"]`)!
      const row = item.shadowRoot!.querySelector<HTMLElement>('.row')!
      const box = row.getBoundingClientRect()
      const transfer = new DataTransfer()
      transfer.setData(type, JSON.stringify(payload))
      const init = { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true, clientX: box.left + 20, clientY: box.top + box.height * fraction }
      row.dispatchEvent(new DragEvent('dragenter', init))
      row.dispatchEvent(new DragEvent('dragover', init))
      // A refusal shows once the event has passed every zone around this one.
      await new Promise((resolve) => setTimeout(resolve))
      await host.updateComplete
      const container = host.shadowRoot!.querySelector('.c2-tree')!
      const lit = container.classList.contains('drop-refused') ? 'refused' : container.classList.contains('drop-target') ? 'target' : 'none'
      row.dispatchEvent(new DragEvent(drop ? 'drop' : 'dragleave', init))
      return lit
    },
    { value, fraction, type, payload, drop },
  )
}

const dropStatus = (page: Page) => page.locator('c2-tree').locator('.drop-status')

test('a data tree takes nodes dropped from outside under its drop-kind, into, before or after the row under the pointer', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable drop-kind="tree-node"></c2-tree>`)
  const host = page.locator('c2-tree')
  await host.evaluate((element) => {
    ;(element as Tree).items = [
      { value: 'src', label: 'src', children: [{ value: 'app', label: 'app.ts' }] },
      { value: 'docs', label: 'docs', children: [] },
    ]
    const drops: unknown[] = []
    ;(window as Window & { drops?: unknown[] }).drops = drops
    element.addEventListener('item-drop', (event) => {
      const { kind, items, refused, parent, index } = (event as CustomEvent).detail
      drops.push({ kind, items: items.map((node: TreeNode) => node.value), refused: refused.length, parent: parent?.value ?? null, index })
    })
  })
  // The middle of a row nests the nodes under it; a node whose value the tree holds is refused.
  expect(
    await dropPayload(page, 'docs', 0.5, NODE_TYPE, [
      { value: 'guide', label: 'guide.md' },
      { value: 'app', label: 'app twin' },
    ]),
  ).toBe('target')
  await expect
    .poll(() => host.evaluate((element) => JSON.stringify((element as Tree).items.map((node) => [node.value, node.children?.map((child) => child.value)]))))
    .toBe(
      JSON.stringify([
        ['src', ['app']],
        ['docs', ['guide']],
      ]),
    )
  await expect(dropStatus(page)).toHaveText('1 item added. 1 item not added')
  // The top edge of a row puts the nodes before it, among its siblings.
  await dropPayload(page, 'docs', 0.1, NODE_TYPE, [{ value: 'notes', label: 'notes' }])
  await expect.poll(() => host.evaluate((element) => (element as Tree).items.map((node) => node.value).join(' '))).toBe('src notes docs')
  expect(await page.evaluate(() => (window as Window & { drops?: unknown[] }).drops)).toEqual([
    { kind: 'tree-node', items: ['guide'], refused: 1, parent: 'docs', index: 0 },
    { kind: 'tree-node', items: ['notes'], refused: 0, parent: null, index: 1 },
  ])
})

test('a tree in markup hands the dropped nodes to the application, with the element to insert them in', async ({ page, renderScenario }) => {
  await renderScenario(tree('drop-kind="tree-node"'))
  await page.locator('c2-tree').evaluate((element) =>
    element.addEventListener('item-drop', (event) => {
      const { items, parentElement, before } = (event as CustomEvent).detail
      for (const node of items as TreeNode[]) {
        const row = document.createElement('c2-tree-item')
        row.setAttribute('value', node.value)
        row.setAttribute('label', node.label ?? node.value)
        ;(parentElement as Element).insertBefore(row, before)
      }
    }),
  )
  // The bottom edge of a row puts the nodes after it.
  await dropPayload(page, 'docs', 0.9, NODE_TYPE, [{ value: 'new', label: 'new.md' }])
  await expect.poll(() => shape(page)).toBe('/src src/app src/main /docs /new /readme')
  await expect(dropStatus(page)).toHaveText('1 item added')
})

test('refuses another kind of payload and a canceled item-drop, and ignores drops without drop-kind or reorderable', async ({ page, renderScenario }) => {
  await renderScenario(tree('drop-kind="tree-node"'))
  // What an application does for a tree in markup with a `drop-kind`: read `detail.items` on `item-drop` to add them.
  await page.locator('c2-tree').evaluate((element) => element.addEventListener('item-drop', (event) => void (event as CustomEvent).detail.items))
  expect(await dropPayload(page, 'docs', 0.5, 'application/x-c2n-kanban-card+json', [{ id: 'x' }])).toBe('refused')
  expect(await dropPayload(page, 'docs', 0.5, NODE_TYPE, [{ value: 'x' }], false)).toBe('target')
  await page.locator('c2-tree').evaluate((element) => element.addEventListener('item-drop', (event) => event.preventDefault()))
  await dropPayload(page, 'docs', 0.5, NODE_TYPE, [{ value: 'x' }])
  await expect(dropStatus(page)).toHaveText('1 item not added')
  expect(await shape(page)).toBe('/src src/app src/main /docs /readme')

  for (const markup of [tree(), `<c2-tree aria-label="Files" drop-kind="tree-node">${files}</c2-tree>`]) {
    await renderScenario(markup)
    expect(await dropPayload(page, 'docs', 0.5, NODE_TYPE, [{ value: 'x' }])).toBe('none')
  }
})

test('an empty data tree with authored empty content shows it, and takes a drop into items', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable drop-kind="tree-node" items="[]"><p slot="empty">Drop files here</p></c2-tree>`)
  const host = page.locator('c2-tree')
  await expect(host.locator('p[slot="empty"]')).toBeVisible()
  await page.evaluate(async (type) => {
    const host = document.querySelector('c2-tree')!
    const zone = host.shadowRoot!.querySelector<HTMLElement>('.c2-tree')!
    const box = zone.getBoundingClientRect()
    const transfer = new DataTransfer()
    transfer.setData(type, JSON.stringify([{ value: 'guide', label: 'guide.md' }]))
    const init = { dataTransfer: transfer, bubbles: true, composed: true, cancelable: true, clientX: box.left + 20, clientY: box.top + 10 }
    for (const type of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, init))
  }, NODE_TYPE)
  await expect.poll(() => host.evaluate((element) => (element as Tree).items.map((node) => node.value))).toEqual(['guide'])
  await expect(dropStatus(page)).toHaveText('1 item added')
})

test('a dropped node whose child the tree already holds is refused', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable drop-kind="tree-node"></c2-tree>`)
  const host = page.locator('c2-tree')
  await host.evaluate((element) => {
    ;(element as Tree).items = [{ value: 'src', label: 'src', children: [{ value: 'app', label: 'app.ts' }] }]
  })
  await dropPayload(page, 'src', 0.9, NODE_TYPE, [{ value: 'lib', label: 'lib', children: [{ value: 'app', label: 'app twin' }] }])
  await expect(dropStatus(page)).toHaveText('1 item not added')
  expect(await host.evaluate((element) => (element as Tree).items.map((node) => node.value))).toEqual(['src'])
})

test("a reorderable tree keeps the browser's drag off its rows, but not off a handle the app made draggable", async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree aria-label="Files" reorderable drop-kind="tree-node">
      <c2-tree-item value="readme"><span slot="label"><a href="#readme">README.md</a> <span class="handle" draggable="true">⠿</span></span></c2-tree-item>
    </c2-tree>
  `)
  // The reorder module loads on demand: wait for it, as a user's first drag comes long after.
  await expect(page.locator('c2-tree').locator('.drop-indicator')).toHaveCount(1)
  const cancelled = await page.evaluate(() => {
    const fire = (target: Element) => {
      const event = new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }
    return { link: fire(document.querySelector('a')!), handle: fire(document.querySelector('.handle')!) }
  })
  expect(cancelled).toEqual({ link: true, handle: false })
})

test('a drop on the bottom edge of an open folder lands at the top of it, not after its last child', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable drop-kind="tree-node" expanded-items="src"></c2-tree>`)
  const host = page.locator('c2-tree')
  await host.evaluate((element) => {
    ;(element as Tree).items = [
      {
        value: 'src',
        label: 'src',
        children: [
          { value: 'app', label: 'app.ts' },
          { value: 'main', label: 'main.ts' },
        ],
      },
      { value: 'docs', label: 'docs' },
    ]
  })
  await expect(host.locator('c2-tree-item[value="main"]')).toHaveCount(1)
  await dropPayload(page, 'src', 0.9, NODE_TYPE, [{ value: 'guide', label: 'guide.md' }])
  await expect
    .poll(() => host.evaluate((element) => JSON.stringify((element as Tree).items.map((node) => [node.value, node.children?.map((child) => child.value)]))))
    .toBe(
      JSON.stringify([
        ['src', ['guide', 'app', 'main']],
        ['docs', undefined],
      ]),
    )
})

test('a drop in the gap between two rows of an open folder stays in that folder', async ({ page, renderScenario }) => {
  await renderScenario(`
    <style>c2-tree-item { display: block; margin-block: 10px; }</style>
    <c2-tree aria-label="Files" reorderable drop-kind="tree-node" expanded-items="src">
      <c2-tree-item value="src" label="src">
        <c2-tree-item value="app" label="app.ts"></c2-tree-item>
        <c2-tree-item value="main" label="main.ts"></c2-tree-item>
      </c2-tree-item>
      <c2-tree-item value="docs" label="docs"></c2-tree-item>
    </c2-tree>
  `)
  const host = page.locator('c2-tree')
  await host.evaluate((element) => {
    ;(window as Window & { drop?: unknown }).drop = undefined
    element.addEventListener('item-drop', (event) => {
      const { parent, before } = (event as CustomEvent).detail
      ;(window as Window & { drop?: unknown }).drop = { parent: parent?.value ?? null, before: (before as Element | null)?.getAttribute('value') ?? null }
    })
  })
  // Below the `app` row's box, in the margin above `main`.
  await dropPayload(page, 'app', 1.3, NODE_TYPE, [{ value: 'guide', label: 'guide.md' }])
  expect(await page.evaluate(() => (window as Window & { drop?: unknown }).drop)).toEqual({ parent: 'src', before: 'main' })
})

test('a reorderable tree inside a draggable ancestor still keeps the browser drag off its rows', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div draggable="true"><c2-tree aria-label="Files" reorderable><c2-tree-item value="readme" label="README.md"></c2-tree-item></c2-tree></div>`,
  )
  // The reorder module loads on demand: wait for it, as a user's first drag comes long after.
  await expect(page.locator('c2-tree').locator('.drop-indicator')).toHaveCount(1)
  const cancelled = await page.evaluate(() => {
    const row = document.querySelector('c2-tree-item')!
    const event = new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: new DataTransfer() })
    row.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(cancelled).toBe(true)
})

test('a drop that would nest deeper than max-depth is refused', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable max-depth="1" drop-kind="tree-node"></c2-tree>`)
  const host = page.locator('c2-tree')
  await host.evaluate((element) => {
    ;(element as Tree).items = [{ value: 'src', label: 'src', children: [] }]
  })
  // Into `src` (level 1), a node with a child (level 2): past the limit.
  await dropPayload(page, 'src', 0.5, NODE_TYPE, [{ value: 'lib', label: 'lib', children: [{ value: 'deep', label: 'deep.ts' }] }])
  await expect(dropStatus(page)).toHaveText('1 item not added')
  // A leaf fits at level 1.
  await dropPayload(page, 'src', 0.5, NODE_TYPE, [{ value: 'leaf', label: 'leaf.ts' }])
  await expect(dropStatus(page)).toHaveText('1 item added')
})

test('a row in a layout wrapper gets the wrapper as before, so the app can insert next to it', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-tree aria-label="Files" reorderable drop-kind="tree-node"><div><c2-tree-item value="a" label="a.md"></c2-tree-item><c2-tree-item value="b" label="b.md"></c2-tree-item></div></c2-tree>`,
  )
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.locator('c2-tree').evaluate((element) =>
    element.addEventListener('item-drop', (event) => {
      const { items, parentElement, before } = (event as CustomEvent).detail
      for (const node of items as TreeNode[]) {
        const row = document.createElement('c2-tree-item')
        row.setAttribute('value', node.value)
        row.setAttribute('label', node.label ?? node.value)
        ;(parentElement as Element).insertBefore(row, before)
      }
    }),
  )
  await dropPayload(page, 'a', 0.1, NODE_TYPE, [{ value: 'new', label: 'new.md' }])
  await expect(dropStatus(page)).toHaveText('1 item added')
  expect(errors).toEqual([])
  expect(await page.locator('c2-tree').evaluate((element) => [...element.children].map((child) => child.localName))).toEqual(['c2-tree-item', 'div'])
})

test('a dropped node whose children are not a list is refused', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable drop-kind="tree-node"></c2-tree>`)
  await page.locator('c2-tree').evaluate((element) => ((element as Tree).items = [{ value: 'src', label: 'src' }]))
  await dropPayload(page, 'src', 0.9, NODE_TYPE, [
    { value: 'bad', children: 5 },
    { value: 'ok', label: 'ok.ts' },
  ])
  await expect(dropStatus(page)).toHaveText('1 item added. 1 item not added')
})

test('a payload too deep to read reports no move, so the source keeps it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree aria-label="Files" reorderable drop-kind="tree-node"></c2-tree>`)
  await page.locator('c2-tree').evaluate((element) => ((element as Tree).items = [{ value: 'src', label: 'src' }]))
  // The zone's error reaches the page: handled there, as an app's error reporting would.
  await page.evaluate(() => window.addEventListener('error', (event) => event.preventDefault()))
  const effects = await page.evaluate((type) => {
    const depth = 200_000
    const json = `[${'{"value":"n","children":['.repeat(depth)}${']}'.repeat(depth)}]`
    const row = document.querySelector('c2-tree')!.shadowRoot!.querySelector('c2-tree-item')!
    const box = row.getBoundingClientRect()
    const transfer = new DataTransfer()
    transfer.setData(type, json)
    const effects: string[] = []
    Object.defineProperty(transfer, 'dropEffect', { configurable: true, get: () => effects.at(-1) ?? 'none', set: (value: string) => effects.push(value) })
    Object.defineProperty(transfer, 'effectAllowed', { configurable: true, get: () => 'move' })
    const init = {
      dataTransfer: transfer,
      bubbles: true,
      composed: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height * 0.9,
    }
    for (const kind of ['dragenter', 'dragover', 'drop']) row.dispatchEvent(new DragEvent(kind, init))
    return effects
  }, NODE_TYPE)
  expect(effects.at(-1)).toBe('none')
})

// ---- rows leaving the tree (drag-kind) ----

const twoTrees = (sourceAttributes = 'drag-kind="tree-node"') => `
  <c2-tree id="left" aria-label="Left" reorderable ${sourceAttributes}>${files}</c2-tree>
  <div style="height:40px"></div>
  <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
`
const rightValues = (page: Page) =>
  page.locator('#right').evaluate((element) => {
    const walk = (nodes: TreeNode[]): string[] => nodes.flatMap((node) => [node.value, ...walk(node.children ?? [])])
    return walk((element as Tree).items)
  })
const leftValues = (page: Page) => page.locator('#left c2-tree-item').evaluateAll((rows) => rows.map((row) => row.getAttribute('value')))

async function setUpRight(page: Page): Promise<void> {
  await expect(page.locator('#left').locator('.drop-indicator')).toHaveCount(1)
  await page.locator('#right').evaluate((element) => ((element as Tree).items = [{ value: 'notes', label: 'notes' }]))
  await page.locator('#left').evaluate((element) =>
    element.addEventListener('item-move-out', (event) => {
      const { rows, target } = (event as CustomEvent).detail
      ;(window as Window & { out?: unknown[] }).out = [...((window as Window & { out?: unknown[] }).out ?? []), (target as Element | null)?.id ?? null]
      for (const row of rows as Element[]) row.remove()
    }),
  )
}

test('a pointer drag carried off the tree drops the row with its subtree on the tree under the pointer', async ({ page, renderScenario }) => {
  await renderScenario(twoTrees())
  await setUpRight(page)
  // On the label: the handle and the toggle at the start of the row have drags of their own.
  const source = (await itemOf(page, 'src').locator('[part="label"]').first().boundingBox())!
  const target = (await page.locator('#right').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 20, source.y + source.height / 2 + 10, { steps: 3 })
  await page.mouse.move(target.x + 40, target.y + target.height - 4, { steps: 10 })
  await page.mouse.up()
  await expect.poll(() => rightValues(page)).toEqual(['notes', 'src', 'app', 'main'])
  expect(await leftValues(page)).toEqual(['docs', 'readme'])
  expect(await page.evaluate(() => (window as Window & { out?: unknown[] }).out)).toEqual(['right'])
})

test('moveItemTo moves a row to the end of another tree; a data-driven source takes it out of items itself', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node"></c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  await page.locator('#left').evaluate((element) => {
    ;(element as Tree).items = [
      { value: 'a', label: 'a', children: [{ value: 'a1', label: 'a1' }] },
      { value: 'b', label: 'b' },
    ]
  })
  await page.locator('#right').evaluate((element) => ((element as Tree).items = [{ value: 'r', label: 'r' }]))
  const moved = await page.locator('#left').evaluate((element) => {
    const source = element as Tree & { moveItemTo(target: Element, value: string): boolean }
    return [source.moveItemTo(document.getElementById('right')!, 'a1'), source.moveItemTo(document.body, 'b')]
  })
  expect(moved).toEqual([true, false])
  expect(await page.locator('#left').evaluate((element) => JSON.stringify((element as Tree).items))).toBe(
    JSON.stringify([
      { value: 'a', label: 'a', children: [] },
      { value: 'b', label: 'b' },
    ]),
  )
  expect(await rightValues(page)).toEqual(['r', 'a1'])
})

test("a row's drag handle carries it to another tree as a browser drag", async ({ page, renderScenario }) => {
  await renderScenario(twoTrees())
  await setUpRight(page)
  const handle = itemOf(page, 'readme').locator('[part="drag-handle"]')
  await expect(handle).toHaveAttribute('draggable', 'true')
  await handle.dragTo(page.locator('#right'), { targetPosition: { x: 40, y: 24 } })
  await expect.poll(() => rightValues(page)).toContain('readme')
  expect(await leftValues(page)).toEqual(['src', 'app', 'main', 'docs'])
})

test('without drag-kind a row carried off the tree goes nowhere and shows no handle', async ({ page, renderScenario }) => {
  await renderScenario(twoTrees(''))
  await setUpRight(page)
  await expect(page.locator('#left [part="drag-handle"]')).toHaveCount(0)
  const source = (await itemOf(page, 'docs').locator('[part="label"]').boundingBox())!
  const target = (await page.locator('#right').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + 40, target.y + target.height - 4, { steps: 10 })
  await page.mouse.up()
  expect(await rightValues(page)).toEqual(['notes'])
  expect(await page.evaluate(() => (window as Window & { out?: unknown[] }).out)).toBeUndefined()
})

test('a data-driven tree forgets the selection and expansion of a node that left, and reports the new selection', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node"></c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  await page.locator('#left').evaluate((element) => {
    const tree = element as Tree
    tree.items = [
      { value: 'a', label: 'a', children: [{ value: 'a1', label: 'a1' }] },
      { value: 'b', label: 'b' },
    ]
    tree.value = ['a1', 'b']
    tree.expandedItems = ['a']
    tree.addEventListener('selection-change', (event) => ((window as Window & { picked?: unknown }).picked = (event as CustomEvent).detail.value))
  })
  await page
    .locator('#left')
    .evaluate((element) => (element as Tree & { moveItemTo(target: Element, value: string): boolean }).moveItemTo(document.getElementById('right')!, 'a'))
  expect(await page.locator('#left').evaluate((element) => [(element as Tree).value, (element as Tree).expandedItems])).toEqual([['b'], []])
  expect(await page.evaluate(() => (window as Window & { picked?: unknown }).picked)).toEqual(['b'])
})

test('a row carried off the tree onto no target is announced as cancelled, and moveItemTo waits for the drag', async ({ page, renderScenario }) => {
  await renderScenario(twoTrees())
  await setUpRight(page)
  const source = (await itemOf(page, 'docs').locator('[part="label"]').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 20, source.y + source.height / 2 + 10, { steps: 3 })
  await page.mouse.move(source.x + 600, source.y + 400, { steps: 10 })
  // Mid-drag, a command may not move the dragged row away.
  const moved = await page
    .locator('#left')
    .evaluate((element) => (element as Tree & { moveItemTo(target: Element, value: string): boolean }).moveItemTo(document.getElementById('right')!, 'docs'))
  expect(moved).toBe(false)
  await page.mouse.up()
  await expect(page.locator('#left').locator('.live')).toHaveText('Move of docs cancelled.')
  expect(await leftValues(page)).toEqual(['src', 'app', 'main', 'docs', 'readme'])
})

test('a node that cannot be copied is not taken, and a click on the drag handle neither selects nor expands', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node" expand-on-click></c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  const moved = await page.locator('#left').evaluate((element) => {
    const data: Record<string, unknown> = {}
    data.self = data
    ;(element as Tree).items = [
      { value: 'a', label: 'a', data },
      { value: 'b', label: 'b', children: [{ value: 'b1', label: 'b1' }] },
    ]
    return (element as Tree & { moveItemTo(target: Element, value: string): boolean }).moveItemTo(document.getElementById('right')!, 'a')
  })
  expect(moved).toBe(false)
  expect(await rightValues(page)).toEqual([])
  await itemOf(page, 'b').locator('[part="drag-handle"]').first().click()
  expect(await page.locator('#left').evaluate((element) => [(element as Tree).value, (element as Tree).expandedItems])).toEqual([[], []])
})

test('a branch crossed on the way off the tree does not open once the row is off it', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="padding-top:120px">${twoTrees()}</div>`)
  await setUpRight(page)
  await page.locator('#left').evaluate((element) => ((element as Tree).expandedItems = []))
  const source = (await itemOf(page, 'readme').locator('[part="label"]').boundingBox())!
  const branch = (await itemOf(page, 'src').locator('[part="label"]').first().boundingBox())!
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(branch.x + 20, branch.y + branch.height / 2, { steps: 6 })
  // Straight off the top edge of the tree, past the margin that is still the tree's, crossing no other row.
  const top = (await page.locator('#left').boundingBox())!.y
  await page.mouse.move(branch.x + 20, top - 80, { steps: 2 })
  await page.waitForTimeout(1000)
  expect(await page.locator('#left').evaluate((element) => (element as Tree).expandedItems)).toEqual([])
  await page.mouse.up()
})

test('a tree taken out of the page mid-drag gives nothing away', async ({ page, renderScenario }) => {
  await renderScenario(twoTrees())
  await setUpRight(page)
  const source = (await itemOf(page, 'docs').locator('[part="label"]').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 20, source.y + source.height / 2 + 10, { steps: 3 })
  // Detached in place: the right tree stays where it was.
  await page.locator('#left').evaluate((element) => {
    const box = element.getBoundingClientRect()
    const spacer = document.createElement('div')
    spacer.style.height = `${box.height}px`
    element.replaceWith(spacer)
  })
  const target = (await page.locator('#right').boundingBox())!
  await page.mouse.move(target.x + 40, target.y + target.height - 4, { steps: 10 })
  await page.mouse.up()
  expect(await rightValues(page)).toEqual(['notes'])
})

test('a tree nested in a row drags its own rows by their handles, and a zone around a source takes nothing dropped back on it', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`
    <c2-tree id="outer" aria-label="Outer" reorderable drag-kind="tree-node" drop-kind="tree-node">
      <c2-tree-item value="holder"><span slot="label">Holder
        <c2-tree id="inner" aria-label="Inner" reorderable drag-kind="tree-node">
          <c2-tree-item value="leaf" label="leaf"></c2-tree-item>
        </c2-tree>
      </span></c2-tree-item>
    </c2-tree>
  `)
  await expect(page.locator('#inner').locator('.drop-indicator')).toHaveCount(1)
  const source = await itemOf(page, 'leaf')
    .locator('[part="drag-handle"]')
    .evaluate((element) => {
      const transfer = new DataTransfer()
      ;(window as Window & { transfer?: DataTransfer }).transfer = transfer
      const event = new DragEvent('dragstart', { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer })
      element.dispatchEvent(event)
      const registry = (globalThis as unknown as Record<symbol, { drag: { source: Element } | null }>)[Symbol.for('c2n.item-drag')]
      return { cancelled: event.defaultPrevented, source: registry.drag?.source.id }
    })
  expect(source).toEqual({ cancelled: false, source: 'inner' })
  // Back over the inner tree, which takes nothing back itself: the outer one claims it as its source's own and stays dark.
  const claimed = await page.locator('#inner').evaluate((element) => {
    // The drag's own transfer, as the browser carries it.
    const transfer = (window as Window & { transfer?: DataTransfer }).transfer!
    const event = new DragEvent('dragover', { bubbles: true, composed: true, cancelable: true, dataTransfer: transfer })
    element.dispatchEvent(event)
    return transfer.dropEffect
  })
  expect(claimed).toBe('none')
})

test('an unloaded branch keeps its expander where it lands, and a move from code is announced before the reorder module loads', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
    <div id="slot"></div>
  `)
  await page.locator('#right').evaluate((element) => ((element as Tree).items = [{ value: 'r', label: 'r' }]))
  const moved = await page.evaluate(() => {
    const left = document.createElement('c2-tree') as Tree & { moveItemTo(target: Element, value: string): boolean }
    left.id = 'left'
    left.setAttribute('aria-label', 'Left')
    left.setAttribute('reorderable', '')
    left.setAttribute('drag-kind', 'tree-node')
    left.innerHTML = '<c2-tree-item value="docs" label="docs" has-children></c2-tree-item><c2-tree-item value="b" label="b"></c2-tree-item>'
    left.addEventListener('item-move-out', (event) => (event as CustomEvent).detail.rows.forEach((row: Element) => row.remove()))
    document.getElementById('slot')!.append(left)
    return left.updateComplete.then(() => left.moveItemTo(document.getElementById('right')!, 'docs'))
  })
  expect(moved).toBe(true)
  expect(await page.locator('#right').evaluate((element) => (element as Tree).items.map((node) => [node.value, !!node.hasChildren]))).toEqual([
    ['r', false],
    ['docs', true],
  ])
  await expect(page.locator('#left').locator('.live')).toHaveText('docs moved out of the tree.')
})

test("a row's drag handle dropped back on its own tree moves the row there", async ({ page, renderScenario }) => {
  await renderScenario(twoTrees())
  await setUpRight(page)
  const readme = (await itemOf(page, 'readme').locator('[part="label"]').boundingBox())!
  const tree = (await page.locator('#left').boundingBox())!
  // Onto the top quarter of the first row: before `src`, at the root.
  const src = (await itemOf(page, 'src').locator('.row').first().boundingBox())!
  await itemOf(page, 'readme')
    .locator('[part="drag-handle"]')
    .dragTo(page.locator('#left'), { targetPosition: { x: readme.x - tree.x + 10, y: src.y - tree.y + 2 } })
  await expect.poll(() => leftValues(page)).toEqual(['readme', 'src', 'app', 'main', 'docs'])
  expect(await page.evaluate(() => (window as Window & { out?: unknown[] }).out)).toBeUndefined()
})

test('a row named by its label slot leaves with that label, and a closed target takes nothing', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node">
      <c2-tree-item value="a1"><span slot="label">Quarterly report</span></c2-tree-item>
      <c2-tree-item value="b" label="b"></c2-tree-item>
    </c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  const moved = await page.evaluate(() => {
    const left = document.getElementById('left') as HTMLElement & { moveItemTo(target: Element, value: string): boolean }
    // Rows in markup leave when the application removes them.
    left.addEventListener('item-move-out', (event) => (event as CustomEvent).detail.rows.forEach((row: Element) => row.remove()))
    const right = document.getElementById('right')!
    const parent = right.parentElement!
    // A target taken out of the page takes nothing.
    right.remove()
    const detached = left.moveItemTo(right, 'b')
    parent.append(right)
    return [detached, left.moveItemTo(right, 'a1')]
  })
  expect(moved).toEqual([false, true])
  expect(await page.locator('#right').evaluate((element) => (element as Tree).items.map((node) => node.label))).toEqual(['Quarterly report'])
})

test('a command in a row that moves it away hands focus to the next row', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node"></c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  await page.locator('#left').evaluate((element) => {
    const tree = element as Tree & { renderActions: (context: { node: TreeNode }) => unknown; moveItemTo(target: Element, value: string): boolean }
    tree.renderActions = ({ node }) => {
      const button = document.createElement('button')
      button.textContent = `Move ${node.value}`
      button.addEventListener('click', () => tree.moveItemTo(document.getElementById('right')!, node.value))
      return button
    }
    tree.items = [
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ]
  })
  const button = page.locator('#left').getByRole('button', { name: 'Move a' })
  await button.focus()
  await button.evaluate((element) => (element as HTMLButtonElement).click())
  await expect.poll(() => rightValues(page)).toEqual(['a'])
  await expect.poll(() => page.locator('#left').evaluate((element) => element.matches(':focus-within'))).toBe(true)
})

test('a drag just past the edge of a tree with a drag-kind is still a move within it', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="padding-top:120px">${twoTrees()}</div>`)
  await setUpRight(page)
  const source = (await itemOf(page, 'docs').locator('[part="label"]').boundingBox())!
  const top = (await page.locator('#left').boundingBox())!.y
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 20, source.y + source.height / 2 - 10, { steps: 3 })
  await page.mouse.move(source.x + 10, top - 10, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => leftValues(page)).toEqual(['docs', 'src', 'app', 'main', 'readme'])
})

test('moving the last row out keeps focus in the tree', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node"></c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  await page.locator('#left').evaluate((element) => {
    const tree = element as Tree & { renderActions: (context: { node: TreeNode }) => unknown; moveItemTo(target: Element, value: string): boolean }
    tree.renderActions = ({ node }) => {
      const button = document.createElement('button')
      button.textContent = `Move ${node.value}`
      button.addEventListener('click', () => tree.moveItemTo(document.getElementById('right')!, node.value))
      return button
    }
    tree.items = [{ value: 'only', label: 'only' }]
  })
  const button = page.locator('#left').getByRole('button', { name: 'Move only' })
  await button.focus()
  await button.evaluate((element) => (element as HTMLButtonElement).click())
  await expect.poll(() => rightValues(page)).toEqual(['only'])
  await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('left')
  expect(await page.locator('#left').evaluate((element) => [element.hasAttribute('tabindex'), element.shadowRoot!.activeElement?.className])).toEqual([
    false,
    'empty',
  ])
})

test('a command in a markup row that the app removes hands focus to the next row; a grip dropped on its own row says nothing', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node">
      <c2-tree-item value="a" label="a"><button slot="actions">Move a</button></c2-tree-item>
      <c2-tree-item value="b" label="b"></c2-tree-item>
    </c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  await expect(page.locator('#left').locator('.drop-indicator')).toHaveCount(1)
  // A grip dropped on the middle of its own row: no move, and no "cannot move there".
  await itemOf(page, 'b').locator('[part="drag-handle"]').dragTo(itemOf(page, 'b').locator('[part="label"]'))
  await page.waitForTimeout(200)
  await expect(page.locator('#left').locator('.live')).not.toHaveText(/cannot/)
  await page.evaluate(() => {
    const left = document.getElementById('left') as HTMLElement & { moveItemTo(target: Element, value: string): boolean }
    left.addEventListener('item-move-out', (event) => (event as CustomEvent).detail.rows.forEach((row: Element) => row.remove()))
    left.querySelector('button')!.addEventListener('click', () => left.moveItemTo(document.getElementById('right')!, 'a'))
  })
  const button = page.getByRole('button', { name: 'Move a' })
  await button.focus()
  await button.evaluate((element) => (element as HTMLButtonElement).click())
  await expect.poll(() => rightValues(page)).toEqual(['a'])
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('value'))).toBe('b')
})

test('a row the app itself moves into the target tree stays there: the source does not take it back out', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node">
      <c2-tree-item value="a" label="a"></c2-tree-item>
      <c2-tree-item value="b" label="b"></c2-tree-item>
    </c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node">
      <c2-tree-item value="r" label="r"></c2-tree-item>
    </c2-tree>
  `)
  const result = await page.evaluate(() => {
    const left = document.getElementById('left') as HTMLElement & { moveItemTo(target: Element, value: string): boolean }
    const right = document.getElementById('right')!
    let movedOut = 0
    // The application moves the element itself rather than building a copy.
    right.addEventListener('item-drop', (event) => {
      const { items, parentElement, before } = (event as CustomEvent).detail
      for (const node of items as { value: string }[]) (parentElement as Element).insertBefore(left.querySelector(`[value="${node.value}"]`)!, before)
    })
    left.addEventListener('item-move-out', () => movedOut++)
    return { moved: left.moveItemTo(right, 'a'), movedOut }
  })
  expect(result).toEqual({ moved: true, movedOut: 0 })
  expect(await page.locator('#right c2-tree-item').evaluateAll((rows) => rows.map((row) => row.getAttribute('value')))).toEqual(['r', 'a'])
  expect(await leftValues(page)).toEqual(['b'])
})

test('a row that can no longer leave, released off the tree, moves nowhere', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree id="left" aria-label="Left" reorderable style="width:240px">${files}</c2-tree>`)
  await expect(page.locator('#left').locator('.drop-indicator')).toHaveCount(1)
  const before = await leftValues(page)
  const source = (await itemOf(page, 'readme').locator('[part="label"]').first().boundingBox())!
  const tree = (await page.locator('#left').boundingBox())!
  await page.mouse.move(source.x + 10, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(source.x + 20, tree.y + 4, { steps: 6 })
  // A drag-kind given mid-drag to a tree that lets no row leave just then; the pointer then goes far off it.
  await page.locator('#left').evaluate((element) => {
    element.setAttribute('drag-kind', 'tree-node')
    ;(element as Tree).disabled = true
  })
  await page.mouse.move(tree.x + tree.width + 200, tree.y + 4, { steps: 6 })
  await page.locator('#left').evaluate((element) => ((element as Tree).disabled = false))
  await page.mouse.up()
  await page.waitForTimeout(100)
  expect(await leftValues(page)).toEqual(before)
})

test('a tree in markup that nobody handles item-drop on refuses a drop, so the row stays in its source', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node"></c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node">
      <c2-tree-item value="r" label="r"></c2-tree-item>
    </c2-tree>
  `)
  await page.locator('#left').evaluate((element) => ((element as Tree).items = [{ value: 'a', label: 'a' }]))
  const moved = await page
    .locator('#left')
    .evaluate((element) => (element as Tree & { moveItemTo(target: Element, value: string): boolean }).moveItemTo(document.getElementById('right')!, 'a'))
  expect(moved).toBe(false)
  expect(await page.locator('#left').evaluate((element) => (element as Tree).items.map((node) => node.value))).toEqual(['a'])
})

test('rows in markup that nobody removes on item-move-out stay, and moveItemTo says they did not move', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tree id="left" aria-label="Left" reorderable drag-kind="tree-node">
      <c2-tree-item value="a" label="a"></c2-tree-item>
    </c2-tree>
    <c2-tree id="right" aria-label="Right" reorderable drop-kind="tree-node"></c2-tree>
  `)
  await page.locator('#right').evaluate((element) => ((element as Tree).items = [{ value: 'r', label: 'r' }]))
  const moved = await page
    .locator('#left')
    .evaluate((element) => (element as Tree & { moveItemTo(target: Element, value: string): boolean }).moveItemTo(document.getElementById('right')!, 'a'))
  expect(moved).toBe(false)
  expect(await leftValues(page)).toEqual(['a'])
})

test("a finger held on a row's grip starts the tree's own drag", async ({ page, renderScenario }) => {
  await renderScenario(twoTrees())
  await expect(page.locator('#left').locator('.drop-indicator')).toHaveCount(1)
  const handle = itemOf(page, 'readme').locator('[part="drag-handle"]')
  const grip = (await handle.boundingBox())!
  const src = (await itemOf(page, 'src').locator('.row').first().boundingBox())!
  await handle.evaluate(
    async (element, { grip, top }) => {
      const at = (x: number, y: number) => ({
        bubbles: true,
        composed: true,
        cancelable: true,
        isPrimary: true,
        pointerId: 9,
        button: 0,
        pointerType: 'touch',
        clientX: x,
        clientY: y,
      })
      const [x, y] = [grip.x + grip.width / 2, grip.y + grip.height / 2]
      element.dispatchEvent(new PointerEvent('pointerdown', at(x, y)))
      // Held, then moved up onto the top edge of the first row.
      await new Promise((resolve) => setTimeout(resolve, 700))
      for (let step = 1; step <= 8; step++) document.dispatchEvent(new PointerEvent('pointermove', at(x, y + ((top - y) * step) / 8)))
      document.dispatchEvent(new PointerEvent('pointerup', at(x, top)))
    },
    { grip, top: src.y + 2 },
  )
  await expect.poll(() => leftValues(page)).toEqual(['readme', 'src', 'app', 'main', 'docs'])
})
