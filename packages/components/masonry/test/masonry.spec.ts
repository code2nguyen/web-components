import { test, expect } from './fixture'
import type { Page } from '@playwright/test'

test('packs twelve mixed tiles within the container without overlap', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-masonry-item')).toHaveCount(12)
  const geometry = await page.locator('c2-masonry').evaluate((container) => {
    const box = container.getBoundingClientRect()
    const tiles = [...container.querySelectorAll('c2-masonry-item')].map((item) => item.getBoundingClientRect())
    return { width: box.width, height: box.height, tiles: tiles.map((rect) => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom })) }
  })
  expect(geometry.height).toBeGreaterThan(0)
  for (const [index, rect] of geometry.tiles.entries()) {
    expect(rect.right).toBeGreaterThan(rect.left)
    for (const other of geometry.tiles.slice(index + 1)) {
      expect(rect.right <= other.left || other.right <= rect.left || rect.bottom <= other.top || other.bottom <= rect.top).toBe(true)
    }
  }
})

test('re-packs after add, removal and span edits without reporting a user change', async ({ page, scenario }) => {
  await scenario('small')
  const before = await page.locator('c2-masonry').boundingBox()
  await page.locator('c2-masonry').evaluate((container) => {
    const item = document.createElement('c2-masonry-item')
    item.setAttribute('item-id', 'added')
    item.setAttribute('rows', '20')
    item.textContent = 'Added card'
    container.append(item)
  })
  await expect(page.locator('c2-masonry-item')).toHaveCount(4)
  await expect.poll(async () => (await page.locator('c2-masonry').boundingBox())?.height).toBeGreaterThan(before!.height)
  await page.locator('c2-masonry').evaluate((container) => {
    container.querySelector('[item-id="added"]')?.remove()
    container.querySelector('c2-masonry-item')?.setAttribute('rows', '12')
  })
  await expect(page.locator('c2-masonry-item')).toHaveCount(3)
  await expect(page.locator('#changes')).toHaveText('0')
})

test('empty layout has no occupied rows', async ({ page, scenario }) => {
  await scenario('empty')
  await expect(page.locator('c2-masonry-item')).toHaveCount(0)
  await expect.poll(async () => (await page.locator('c2-masonry').boundingBox())?.height).toBe(0)
})

test('re-packs by container width without changing one shared order', async ({ page, scenario }) => {
  await scenario('small')
  const control = page.locator('.width-control')
  const item = page.locator('c2-masonry-item').first()
  await control.evaluate((element) => ((element as HTMLElement).style.width = '500px'))
  await expect.poll(() => item.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(450)
  const narrowTop = await page.locator('c2-masonry-item').evaluateAll((items) => items.map((element) => element.getBoundingClientRect().top))
  expect(narrowTop).toEqual([...narrowTop].sort((a, b) => a - b))
  await control.evaluate((element) => ((element as HTMLElement).style.width = '800px'))
  await expect.poll(() => item.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(500)
  await control.evaluate((element) => ((element as HTMLElement).style.width = '1100px'))
  await expect.poll(() => item.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(500)
  await control.evaluate((element) => ((element as HTMLElement).style.width = '1400px'))
  await expect.poll(() => item.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThan(500)
  await expect(page.locator('#changes')).toHaveText('0')
})

test('commits a keyboard move once and cancels another without an event', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  await handle.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
  const first = await page.evaluate(() => window.masonryEvents[0])
  expect(first.action).toBe('move')
  expect(first.layout.items.map((item) => item.id)).toEqual(['tile-2', 'tile-1', 'tile-3'])
  await handle.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  await expect(page.locator('#changes')).toHaveText('1')
})

test('saves a committed layout by default and restores it after reload', async ({ page, scenario }) => {
  await scenario('editing')
  const key = await page.locator('c2-masonry').evaluate((element) => `c2-masonry:${location.pathname}:${element.id}`)
  expect(await page.evaluate((storageKey) => localStorage.getItem(storageKey), key)).toBeNull()
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  await handle.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
  const saved = await page.evaluate(() => window.masonryEvents[0].layout)
  expect(await page.evaluate((storageKey) => JSON.parse(localStorage.getItem(storageKey)!), key)).toEqual(saved)

  await page.reload()
  await expect(page.locator('main')).toHaveAttribute('data-ready', 'true')
  await expect(page.locator('#changes')).toHaveText('0')
  await expect
    .poll(() =>
      page
        .locator('c2-masonry')
        .locator('.tile')
        .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-item-id'))),
    )
    .toEqual(['tile-2', 'tile-1', 'tile-3'])

  await page.locator('c2-masonry').evaluate((element, stored) => {
    const replacement = document.createElement('c2-masonry')
    replacement.id = 'subject'
    replacement.layout = { version: 1, items: [...stored.items].sort((left, right) => left.id.localeCompare(right.id)) }
    for (const child of element.children) replacement.append(child.cloneNode(true))
    element.replaceWith(replacement)
  }, saved)
  await expect
    .poll(() =>
      page
        .locator('c2-masonry')
        .locator('.tile')
        .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-item-id'))),
    )
    .toEqual(['tile-1', 'tile-2', 'tile-3'])
})

test('allows localStorage persistence to be disabled or given a custom key', async ({ page, scenario }) => {
  await scenario('editing')
  const host = page.locator('c2-masonry')
  await host.evaluate((element) => {
    element.setAttribute('save-layout', 'false')
    element.setAttribute('storage-key', 'masonry-test-custom')
  })
  await expect(host).toHaveJSProperty('saveLayout', false)
  const move = host.locator('[part="move-handle"]').first()
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
  expect(await page.evaluate(() => localStorage.getItem('masonry-test-custom'))).toBeNull()

  await host.evaluate((element) => element.setAttribute('save-layout', 'true'))
  await expect(host).toHaveJSProperty('saveLayout', true)
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('2')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('masonry-test-custom')!))).toEqual(await page.evaluate(() => window.masonryEvents[1].layout))

  await host.evaluate((element) => {
    const replacement = document.createElement('c2-masonry')
    replacement.id = 'subject'
    replacement.setAttribute('save-layout', 'false')
    replacement.setAttribute('storage-key', 'masonry-test-custom')
    for (const child of element.children) replacement.append(child.cloneNode(true))
    element.replaceWith(replacement)
  })
  await expect
    .poll(() =>
      page
        .locator('c2-masonry')
        .locator('.tile')
        .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-item-id'))),
    )
    .toEqual(['tile-1', 'tile-2', 'tile-3'])
})

test('ignores malformed stored data and still commits when storage writes fail', async ({ page, scenario }) => {
  await page.addInitScript(() => {
    localStorage.setItem(`c2-masonry:${location.pathname}:subject`, '{not-json')
  })
  await scenario('editing')
  await expect
    .poll(() =>
      page
        .locator('c2-masonry')
        .locator('.tile')
        .evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('data-item-id'))),
    )
    .toEqual(['tile-1', 'tile-2', 'tile-3'])
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error('Storage blocked')
    }
  })
  const move = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
})

test('resizes only the active range and emits one complete snapshot', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="resize-handle"]')
  await handle.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('1')
  const event = await page.evaluate(() => window.masonryEvents[0])
  expect(event.action).toBe('resize')
  expect(event.layout.version).toBe(1)
  expect(event.layout.items[0].rows).toBe(6)
  expect(event.layout.items[0].columns.sm).toBe(2)
  expect(event.layout.items[0].columns.md).toBe(2)
})

test('rejects invalid application snapshots without a user-change event', async ({ page, scenario }) => {
  await scenario('editing')
  await page.locator('c2-masonry').evaluate((element) => {
    ;(element as HTMLElement & { layout: unknown }).layout = { version: 1, items: [{ id: 'tile-1', rows: -1, columns: { xs: 1, sm: 2, md: 2, lg: 2 } }] }
  })
  await expect(page.locator('#changes')).toHaveText('0')
})

test('restores a committed snapshot on a fresh element at every width range', async ({ page, scenario }) => {
  await scenario('editing')
  const move = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  await move.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const resize = page.locator('c2-masonry-item').first().locator('[part="resize-handle"]')
  await resize.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('2')
  const saved = await page.evaluate(() => window.masonryEvents[1].layout)
  await page.locator('.width-control').evaluate((control, layout) => {
    const original = control.querySelector('c2-masonry')!
    const restored = document.createElement('c2-masonry')
    restored.id = 'restored'
    restored.dataset.changeCount = '0'
    restored.addEventListener('layout-change', () => (restored.dataset.changeCount = String(Number(restored.dataset.changeCount) + 1)))
    for (const item of [...original.children]) restored.append(item.cloneNode(true))
    control.replaceChild(restored, original)
    ;(restored as typeof original).layout = layout
  }, saved)
  for (const [width, range, columns] of [
    [500, 'xs', 1],
    [800, 'sm', 6],
    [1100, 'md', 9],
    [1400, 'lg', 12],
  ] as const) {
    await page.locator('.width-control').evaluate((control, value) => ((control as HTMLElement).style.width = `${value}px`), width)
    await expect
      .poll(() =>
        page.locator('#restored').evaluate((host) => {
          const grid = host.shadowRoot!.querySelector<HTMLElement>('[part="grid"]')!
          return getComputedStyle(grid).gridTemplateColumns.split(' ').length
        }),
      )
      .toBe(columns)
    await expect
      .poll(() =>
        page.locator('#restored').evaluate((host) => {
          const tiles = [...host.shadowRoot!.querySelectorAll<HTMLElement>('.tile')]
          return tiles.map((tile) => {
            const slot = tile.querySelector('slot')!.name
            const item = [...host.children].find((child) => child.slot === slot)!
            return { id: item.getAttribute('item-id'), span: Number(getComputedStyle(tile).gridColumnEnd.replace('span ', '')) }
          })
        }),
      )
      .toEqual(saved.items.map((item) => ({ id: item.id, span: item.columns[range] })))
  }
  await expect(page.locator('#changes')).toHaveText('2')
  await expect(page.locator('#restored')).toHaveAttribute('data-change-count', '0')
})

test('authored child reordering repacks unless an application layout owns order', async ({ page, scenario }) => {
  await scenario('small')
  const control = page.locator('.width-control')
  await control.evaluate((element) => ((element as HTMLElement).style.width = '500px'))
  const order = () =>
    page.locator('c2-masonry-item').evaluateAll((items) =>
      items
        .map((item) => ({ id: item.getAttribute('item-id'), top: item.getBoundingClientRect().top }))
        .sort((a, b) => a.top - b.top)
        .map((item) => item.id),
    )
  await expect.poll(order).toEqual(['tile-1', 'tile-2', 'tile-3'])
  await page.locator('c2-masonry').evaluate((host) => host.append(host.firstElementChild!))
  await expect.poll(order).toEqual(['tile-2', 'tile-3', 'tile-1'])
  await page.locator('c2-masonry').evaluate((host) => {
    ;(host as HTMLElement & { layout: unknown }).layout = {
      version: 1,
      items: [
        { id: 'tile-3', rows: 11, columns: { xs: 1, sm: 3, md: 4, lg: 5 } },
        { id: 'tile-1', rows: 5, columns: { xs: 1, sm: 1, md: 2, lg: 3 } },
        { id: 'tile-2', rows: 8, columns: { xs: 1, sm: 2, md: 3, lg: 4 } },
      ],
    }
  })
  await expect.poll(order).toEqual(['tile-3', 'tile-1', 'tile-2'])
  await page.locator('c2-masonry').evaluate((host) => host.prepend(host.lastElementChild!))
  await expect.poll(order).toEqual(['tile-3', 'tile-1', 'tile-2'])
  await expect(page.locator('#changes')).toHaveText('0')
})

test('a bordered container selects breakpoints from content width', async ({ page, scenario }) => {
  await scenario('small')
  const control = page.locator('.width-control')
  await page.locator('c2-masonry').evaluate((host) => ((host as HTMLElement).style.border = '10px solid black'))
  const columns = () =>
    page
      .locator('c2-masonry')
      .evaluate((host) => getComputedStyle(host.shadowRoot!.querySelector<HTMLElement>('[part="grid"]')!).gridTemplateColumns.split(' ').length)
  await control.evaluate((element) => ((element as HTMLElement).style.width = '600px'))
  await expect.poll(columns).toBe(1)
  await control.evaluate((element) => ((element as HTMLElement).style.width = '620px'))
  await expect.poll(columns).toBe(6)
})

test('removing a different tile during an edit cancels the stale candidate', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  await handle.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toBeVisible()
  await page
    .locator('c2-masonry-item')
    .nth(1)
    .evaluate((item) => item.remove())
  await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(page.locator('#changes')).toHaveText('0')
})

for (const mutation of ['add', 'span'] as const) {
  test(`${mutation} of another tile cancels an active edit`, async ({ page, scenario }) => {
    await scenario('editing')
    const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
    await handle.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toBeVisible()
    await page.locator('c2-masonry').evaluate((host, kind) => {
      if (kind === 'add') {
        const item = document.createElement('c2-masonry-item')
        item.setAttribute('item-id', 'added')
        host.append(item)
      } else host.querySelectorAll('c2-masonry-item')[1].setAttribute('rows', '15')
    }, mutation)
    await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page.locator('#changes')).toHaveText('0')
  })
}

test('re-packs a 100-tile dashboard within one second after a span edit', async ({ page, scenario }) => {
  await scenario('small')
  await page.locator('c2-masonry').evaluate((host) => {
    for (let index = 4; index <= 100; index++) {
      const item = document.createElement('c2-masonry-item')
      item.setAttribute('item-id', `tile-${index}`)
      item.setAttribute('rows', String(3 + (index % 4)))
      item.setAttribute('cols', String(1 + (index % 3)))
      item.textContent = `Tile ${index}`
      host.append(item)
    }
  })
  await expect(page.locator('c2-masonry-item')).toHaveCount(100)
  await expect.poll(() => page.locator('c2-masonry').evaluate((host) => host.shadowRoot!.querySelectorAll('.tile').length)).toBe(100)
  const elapsed = await page.locator('c2-masonry').evaluate(async (host) => {
    const item = host.querySelector('c2-masonry-item')!
    const before = item.getBoundingClientRect().height
    const started = performance.now()
    item.setAttribute('rows', '15')
    await new Promise<void>((resolve, reject) => {
      const check = () => {
        if (item.getBoundingClientRect().height > before) resolve()
        else if (performance.now() - started > 1000) reject(new Error('100-tile repack took more than one second'))
        else requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
    return performance.now() - started
  })
  expect(elapsed).toBeLessThan(1000)
})

test('moves a tile with a real pointer drag and reports one commit', async ({ page, scenario }) => {
  await scenario('editing')
  const first = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  const second = page.locator('c2-masonry-item').nth(1)
  const start = await first.boundingBox()
  const target = await second.boundingBox()
  if (!start || !target) throw new Error('Expected visible move handle and target')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('1')
  expect((await page.evaluate(() => window.masonryEvents[0])).inputMethod).toBe('mouse')
})

test('resizes with a pointer and ignores a no-op press', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="resize-handle"]')
  const start = await handle.boundingBox()
  if (!start) throw new Error('Expected resize handle')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('0')
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2 + 150, start.y + start.height / 2 + 16, { steps: 6 })
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('1')
  expect((await page.evaluate(() => window.masonryEvents[0])).action).toBe('resize')
})

for (const { edge, dx, dy, dimension } of [
  { edge: 'right', dx: 120, dy: 0, dimension: 'columns' },
  { edge: 'bottom', dx: 0, dy: 24, dimension: 'rows' },
] as const) {
  test(`resizes from the ${edge} border`, async ({ page, scenario }) => {
    await scenario('editing')
    const border = page.locator('c2-masonry-item').nth(1).locator(`[data-masonry-edge="${edge}"]`)
    const bounds = await border.boundingBox()
    if (!bounds) throw new Error(`Expected ${edge} resize border`)
    const start = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 5 })
    await page.mouse.up()
    await expect(page.locator('#changes')).toHaveText('1')
    const change = await page.evaluate(() => window.masonryEvents[0])
    expect(change.action).toBe('resize')
    const item = change.layout.items.find((entry) => entry.id === 'tile-2')!
    if (dimension === 'rows') expect(item.rows).toBeGreaterThan(8)
    else expect(item.columns.sm).toBeGreaterThan(2)
  })
}

test('cancels a held gesture when the active tile disappears', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  const start = await handle.boundingBox()
  if (!start) throw new Error('Expected move handle')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page
    .locator('c2-masonry-item')
    .first()
    .evaluate((element) => element.remove())
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('0')
  await expect(page.locator('c2-masonry')).toBeFocused()
})

test('cancels an active pointer session on lost capture', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  const start = await handle.boundingBox()
  if (!start) throw new Error('Expected move handle')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await handle.evaluate((button) => {
    const control = button as HTMLButtonElement
    for (let id = 1; id <= 10; id++) if (control.hasPointerCapture(id)) control.releasePointerCapture(id)
  })
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('0')
})

test('cancels a candidate if the container changes range mid-gesture', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  const start = await handle.boundingBox()
  if (!start) throw new Error('Expected move handle')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2 + 30, start.y + start.height / 2 + 30)
  await page.locator('.width-control').evaluate((element) => ((element as HTMLElement).style.width = '500px'))
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('0')
})

test('auto-scrolls an overflow container during a held edge drag', async ({ page, scenario }) => {
  await scenario('editing-long')
  const scroller = page.locator('.width-control')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  const start = await handle.boundingBox()
  const bounds = await scroller.boundingBox()
  if (!start || !bounds) throw new Error('Expected handle and scroll container')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height - 8, { steps: 8 })
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await page.mouse.up()
})

for (const pointerType of ['touch', 'pen'] as const) {
  test(`maps ${pointerType} pointer contracts to the saved input method`, async ({ page, scenario }) => {
    await scenario('editing')
    await page.locator('c2-masonry').evaluate((element, type) => {
      const tiles = [...element.querySelectorAll('c2-masonry-item')]
      const button = tiles[0].shadowRoot!.querySelector<HTMLButtonElement>('[part="move-handle"]')!
      const captured = new Set<number>()
      Object.defineProperties(button, {
        setPointerCapture: { configurable: true, value: (id: number) => captured.add(id) },
        hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
        releasePointerCapture: { configurable: true, value: (id: number) => captured.delete(id) },
      })
      const source = button.getBoundingClientRect()
      const target = tiles[1].getBoundingClientRect()
      const emit = (name: string, x: number, y: number) =>
        button.dispatchEvent(
          new PointerEvent(name, { bubbles: true, composed: true, pointerId: 42, pointerType: type, isPrimary: true, button: 0, clientX: x, clientY: y }),
        )
      emit('pointerdown', source.left + source.width / 2, source.top + source.height / 2)
      emit('pointermove', target.left + target.width / 2, target.top + target.height / 2)
      emit('pointerup', target.left + target.width / 2, target.top + target.height / 2)
    }, pointerType)
    await expect(page.locator('#changes')).toHaveText('1')
    expect((await page.evaluate(() => window.masonryEvents[0])).inputMethod).toBe(pointerType)
  })
}

test('disconnecting during a drag cancels without a commit', async ({ page, scenario }) => {
  await scenario('editing')
  const handle = page.locator('c2-masonry-item').first().locator('[part="move-handle"]')
  const start = await handle.boundingBox()
  if (!start) throw new Error('Expected move handle')
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.locator('c2-masonry').evaluate((element) => element.remove())
  await page.mouse.up()
  await expect(page.locator('#changes')).toHaveText('0')
})

test.describe('touch input', () => {
  test.use({ hasTouch: true })

  test('a real touch tap on an edit handle is a no-op', async ({ page, scenario }) => {
    await scenario('editing')
    await page.locator('c2-masonry-item').first().locator('[part="move-handle"]').tap()
    await expect(page.locator('#changes')).toHaveText('0')
  })
})

async function dispatchTrustedDrag(page: Page, pointerType: 'touch' | 'pen', action: 'move' | 'resize', cancel: boolean): Promise<void> {
  const handle = page.locator('c2-masonry-item').first().locator(`[part="${action}-handle"]`)
  const source = await handle.boundingBox()
  const second = await page.locator('c2-masonry-item').nth(1).boundingBox()
  if (!source || !second) throw new Error('Expected visible masonry input targets')
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 }
  const end = action === 'move' ? { x: second.x + second.width / 2, y: second.y + second.height / 2 } : { x: start.x + 150, y: start.y + 16 }
  const session = await page.context().newCDPSession(page)
  try {
    if (pointerType === 'touch') {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
      for (let step = 1; step <= 6; step++) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: start.x + ((end.x - start.x) * step) / 6, y: start.y + ((end.y - start.y) * step) / 6, id: 1 }],
        })
      }
      if (cancel) await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
      else await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start, pointerType: 'pen' })
      await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' })
      for (let step = 1; step <= 6; step++) {
        await session.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: start.x + ((end.x - start.x) * step) / 6,
          y: start.y + ((end.y - start.y) * step) / 6,
          button: 'left',
          buttons: 1,
          pointerType: 'pen',
        })
      }
      if (cancel) await page.locator('c2-masonry').evaluate((host) => host.removeAttribute('editable'))
      await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...end, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' })
    }
  } finally {
    await session.detach()
  }
}

test.describe('trusted touch and pen gestures', () => {
  test.use({ hasTouch: true })
  test.skip(({ browserName }) => browserName !== 'chromium', 'DevTools input is available only in Chromium')

  for (const pointerType of ['touch', 'pen'] as const) {
    for (const action of ['move', 'resize'] as const) {
      for (const cancel of [false, true]) {
        test(`${pointerType} ${action} ${cancel ? 'cancels' : 'commits'} through trusted browser input`, async ({ page, scenario }) => {
          await scenario('editing')
          await page.locator('c2-masonry').evaluate((host) => {
            host.addEventListener('pointerdown', (event) => {
              host.setAttribute('data-input-witness', `${(event as PointerEvent).pointerType}:${event.isTrusted}`)
            })
          })
          await dispatchTrustedDrag(page, pointerType, action, cancel)
          await expect(page.locator('c2-masonry')).toHaveAttribute('data-input-witness', `${pointerType}:true`)
          await expect(page.locator('#changes')).toHaveText(cancel ? '0' : '1')
          if (!cancel) {
            const change = await page.evaluate(() => window.masonryEvents[0])
            expect(change.action).toBe(action)
            expect(change.inputMethod).toBe(pointerType)
          }
          await expect(page.locator('c2-masonry').locator('[part="placeholder"]')).toHaveCount(0)
        })
      }
    }
  }
})
