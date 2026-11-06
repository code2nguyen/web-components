import type { Locator, Page } from '@playwright/test'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

type Rect = { x: number; y: number; width: number; height: number }

const chat = (attributes = '', body = '<p>Hello</p>', title = 'Support chat') =>
  `<c2-floating-panel open ${attributes}><span slot="title">${title}</span>${body}</c2-floating-panel>`

const host = (page: Page, nth = 0) => page.locator('c2-floating-panel').nth(nth)
const panel = (page: Page, nth = 0) => host(page, nth).locator('section.panel')
const handle = (page: Page, nth = 0) => host(page, nth).locator('.handle')

async function box(locator: Locator): Promise<Rect> {
  const rect = await locator.boundingBox()
  if (!rect) throw new Error('Expected a visible element')
  return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
}

async function events(locator: Locator): Promise<unknown[]> {
  return JSON.parse((await locator.getAttribute('data-events')) ?? '[]') as unknown[]
}

/** Presses at the centre of `from`, moves by dx/dy in steps, and releases. */
async function drag(page: Page, from: Locator, dx: number, dy: number, options: { at?: 'center' | 'right' | 'left' | 'bottom-right' } = {}) {
  const rect = (await from.boundingBox())!
  const at = options.at ?? 'center'
  const x = at === 'right' ? rect.x + rect.width - 2 : at === 'left' ? rect.x + 2 : at === 'bottom-right' ? rect.x + rect.width - 2 : rect.x + rect.width / 2
  const y = at === 'bottom-right' ? rect.y + rect.height - 2 : rect.y + rect.height / 2
  // The pointer stays inside the window, as a real one does: Firefox reports a synthetic move outside it at (0, 0).
  // Every edge the tests drag past is inside the window, so the clamp does not change what they check.
  const viewport = page.viewportSize()!
  const inside = (value: number, size: number) => Math.min(Math.max(value, 0), size - 1)
  const endX = inside(x + dx, viewport.width)
  const endY = inside(y + dy, viewport.height)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move((x + endX) / 2, (y + endY) / 2, { steps: 4 })
  await page.mouse.move(endX, endY, { steps: 4 })
  await page.mouse.up()
}

test.beforeEach(async ({ page }) => {
  // Minimise, maximise and keyboard moves animate; the geometry assertions read the settled place.
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test.describe('place and size', () => {
  test('first appears at its CSS place: the bottom-right corner of the window, 360px wide', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    const viewport = page.viewportSize()!
    const rect = await box(panel(page))
    expect(rect.width).toBe(360)
    expect(rect.x + rect.width).toBe(viewport.width - 24)
    expect(rect.y + rect.height).toBe(viewport.height - 24)
    await expect(host(page)).toHaveJSProperty('rect', null)
  })

  test('the CSS variables set the first place and size', async ({ page, renderScenario }) => {
    await renderScenario(chat('style="--c2-floating-panel--inset: 20px auto auto 30px; --c2-floating-panel--width: 300px; --c2-floating-panel--height: 200px"'))
    expect(await box(panel(page))).toEqual({ x: 30, y: 20, width: 300, height: 200 })
  })

  test('a rect attribute places the panel, and one too large for the window is pulled inside', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":50,"width":320,"height":240}'`))
    expect(await box(panel(page))).toEqual({ x: 100, y: 50, width: 320, height: 240 })
    await watch(host(page), 'rect-change')
    await props(host(page), { rect: { x: 5000, y: 5000, width: 320, height: 240 } })
    const viewport = page.viewportSize()!
    await expect.poll(() => box(panel(page))).toEqual({ x: viewport.width - 320, y: viewport.height - 240, width: 320, height: 240 })
    expect(await events(host(page))).toEqual([{ rect: { x: viewport.width - 320, y: viewport.height - 240, width: 320, height: 240 }, reason: 'boundary' }])
  })

  test('a window resize pulls a placed panel back inside and reports it as a boundary change', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":800,"y":400,"width":320,"height":240}'`))
    await watch(host(page), 'rect-change')
    await page.setViewportSize({ width: 900, height: 500 })
    await expect.poll(() => box(panel(page))).toEqual({ x: 580, y: 260, width: 320, height: 240 })
    expect(await events(host(page))).toContainEqual({ rect: { x: 580, y: 260, width: 320, height: 240 }, reason: 'boundary' })
  })
})

test.describe('a boundary smaller than the CSS place', () => {
  const narrow = (attributes: string) =>
    `<div class="area" style="width: 200px; height: 300px">${chat(`boundary="parent" ${attributes}`)}</div><div style="height: 2px"></div>`

  async function inside(page: Page) {
    const area = await page.locator('.area').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: rect.x + element.clientLeft, y: rect.y + element.clientTop, width: element.clientWidth, height: element.clientHeight }
    })
    const rect = (await panel(page).boundingBox())!
    return {
      x: Math.round(rect.x - area.x),
      y: Math.round(rect.y - area.y),
      right: Math.round(area.x + area.width - (rect.x + rect.width)),
      bottom: Math.round(area.y + area.height - (rect.y + rect.height)),
      width: Math.round(rect.width),
    }
  }

  test('a 320px panel in a 200px parent stays inside it, at its CSS place, without a rect', async ({ page, renderScenario }) => {
    await renderScenario(narrow('style="--c2-floating-panel--width: 320px"'))
    await watch(host(page), 'rect-change')
    await expect.poll(async () => (await inside(page)).x).toBeGreaterThanOrEqual(0)
    const place = await inside(page)
    expect(place.width).toBeLessThanOrEqual(200)
    expect(place.right).toBeGreaterThanOrEqual(0)
    expect(place.bottom).toBeGreaterThanOrEqual(0)
    await expect(host(page)).toHaveJSProperty('rect', null)
    expect(await events(host(page))).toEqual([])
  })

  test('an inset that puts the panel outside is pulled in, and follows the parent when it grows', async ({ page, renderScenario }) => {
    await renderScenario(
      narrow('style="--c2-floating-panel--inset: 20px auto auto 150px; --c2-floating-panel--width: 180px; --c2-floating-panel--min-width: 100px"'),
    )
    await expect.poll(() => inside(page)).toMatchObject({ x: 20, y: 20, right: 0, width: 180 })
    await page.locator('.area').evaluate((element) => ((element as HTMLElement).style.width = '500px'))
    await expect.poll(async () => (await inside(page)).x).toBe(150)
    await expect(host(page)).toHaveJSProperty('rect', null)
  })

  test('a drag starts from the fitted place', async ({ page, renderScenario }) => {
    await renderScenario(
      narrow('style="--c2-floating-panel--inset: 20px auto auto 150px; --c2-floating-panel--width: 180px; --c2-floating-panel--min-width: 100px"'),
    )
    await expect.poll(async () => (await inside(page)).x).toBe(20)
    await drag(page, handle(page), 0, 40)
    await expect(host(page)).toHaveJSProperty('rect', {
      x: 20,
      y: 60,
      width: 180,
      height: await panel(page).evaluate((element) => Math.round(element.getBoundingClientRect().height)),
    })
  })
})

test.describe('drag', () => {
  test('the title bar drags the panel and reports the new rect once, at the end', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":200,"y":150,"width":320,"height":240}'`))
    await watch(host(page), 'rect-change')
    await drag(page, handle(page), -120, -60)
    expect(await box(panel(page))).toEqual({ x: 80, y: 90, width: 320, height: 240 })
    await expect(host(page)).toHaveJSProperty('rect', { x: 80, y: 90, width: 320, height: 240 })
    expect(await events(host(page))).toEqual([{ rect: { x: 80, y: 90, width: 320, height: 240 }, reason: 'drag' }])
  })

  test('a drag from the CSS place starts where the panel is', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    const before = await box(panel(page))
    await drag(page, handle(page), -100, -50)
    expect(await box(panel(page))).toEqual({ ...before, x: before.x - 100, y: before.y - 50 })
  })

  test('the window holds the panel: dragging past an edge stops at it', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    await drag(page, handle(page), -400, -400)
    expect(await box(panel(page))).toEqual({ x: 0, y: 0, width: 320, height: 240 })
    const viewport = page.viewportSize()!
    await drag(page, handle(page), 2000, 2000)
    expect(await box(panel(page))).toEqual({ x: viewport.width - 320, y: viewport.height - 240, width: 320, height: 240 })
  })

  test('boundary="parent" keeps the panel inside its positioned parent, in the parent\'s pixels', async ({ page, renderScenario }) => {
    await renderScenario(`<div class="area">${chat(`boundary="parent" rect='{"x":20,"y":20,"width":260,"height":180}'`)}</div>`)
    const area = page.locator('.area')
    const inner = await area.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { x: Math.round(rect.x + element.clientLeft), y: Math.round(rect.y + element.clientTop) }
    })
    expect(await box(panel(page))).toEqual({ x: inner.x + 20, y: inner.y + 20, width: 260, height: 180 })
    await drag(page, handle(page), 1000, 1000)
    await expect(host(page)).toHaveJSProperty('rect', { x: 600 - 260, y: 400 - 180, width: 260, height: 180 })
    expect(await box(panel(page))).toEqual({ x: inner.x + 340, y: inner.y + 220, width: 260, height: 180 })
    await drag(page, handle(page), -1000, -1000)
    await expect(host(page)).toHaveJSProperty('rect', { x: 0, y: 0, width: 260, height: 180 })
  })

  test('a parent that shrinks pulls the panel back inside', async ({ page, renderScenario }) => {
    await renderScenario(`<div class="area">${chat(`boundary="parent" rect='{"x":300,"y":200,"width":260,"height":180}'`)}</div>`)
    await watch(host(page), 'rect-change')
    await page.locator('.area').evaluate((element) => ((element as HTMLElement).style.width = '400px'))
    await expect(host(page)).toHaveJSProperty('rect', { x: 140, y: 200, width: 260, height: 180 })
    expect(await events(host(page))).toEqual([{ rect: { x: 140, y: 200, width: 260, height: 180 }, reason: 'boundary' }])
  })

  test('the window buttons still click, and a press without a move is not a drag', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    await watch(host(page), 'rect-change')
    await handle(page).click()
    expect(await events(host(page))).toEqual([])
    await page.getByRole('button', { name: 'Maximise' }).click()
    await expect(host(page)).toHaveJSProperty('state', 'maximized')
  })

  test('no-drag keeps the title bar still and drops the move handle', async ({ page, renderScenario }) => {
    await renderScenario(chat(`no-drag rect='{"x":100,"y":100,"width":320,"height":240}'`))
    await drag(page, handle(page), 100, 100)
    expect(await box(panel(page))).toEqual({ x: 100, y: 100, width: 320, height: 240 })
    await expect(page.getByRole('button', { name: 'Move Support chat' })).toHaveCount(0)
  })
})

test.describe('resize', () => {
  test('the right edge resizes the width and reports a resize', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    await watch(host(page), 'rect-change')
    await drag(page, host(page).locator('.edge-e'), 80, 0)
    expect(await box(panel(page))).toEqual({ x: 100, y: 100, width: 400, height: 240 })
    expect(await events(host(page))).toEqual([{ rect: { x: 100, y: 100, width: 400, height: 240 }, reason: 'resize' }])
  })

  test('the top-left corner resizes both ways and keeps the opposite corner still', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":200,"y":200,"width":320,"height":240}'`))
    await drag(page, host(page).locator('.edge-nw'), -50, -30)
    expect(await box(panel(page))).toEqual({ x: 150, y: 170, width: 370, height: 270 })
  })

  test('a resize stops at the minimum size, and the left edge keeps the right edge still', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":200,"y":200,"width":320,"height":240}'`))
    await drag(page, host(page).locator('.edge-w'), 300, 0)
    expect(await box(panel(page))).toEqual({ x: 280, y: 200, width: 240, height: 240 })
    await drag(page, host(page).locator('.edge-s'), 0, -300)
    expect(await box(panel(page))).toEqual({ x: 280, y: 200, width: 240, height: 160 })
  })

  test('a resize stops at the boundary', async ({ page, renderScenario }) => {
    await renderScenario(`<div class="area">${chat(`boundary="parent" rect='{"x":300,"y":100,"width":260,"height":180}'`)}</div>`)
    await drag(page, host(page).locator('.grip'), 500, 500)
    await expect(host(page)).toHaveJSProperty('rect', { x: 300, y: 100, width: 300, height: 300 })
  })

  test('the CSS minimum is the floor', async ({ page, renderScenario }) => {
    await renderScenario(chat(`style="--c2-floating-panel--min-width: 300px" rect='{"x":200,"y":200,"width":320,"height":240}'`))
    await drag(page, host(page).locator('.edge-e'), -200, 0)
    expect((await box(panel(page))).width).toBe(300)
  })

  test('no-resize removes the edges and the grip', async ({ page, renderScenario }) => {
    await renderScenario(chat('no-resize'))
    await expect(host(page).locator('.edge')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Resize Support chat' })).toHaveCount(0)
  })
})

test.describe('keyboard', () => {
  test('the title-bar handle moves the panel 10px per arrow, 50px with Shift, and Home puts it back', async ({ page, renderScenario, tab }) => {
    await renderScenario(`${chat()}<button>After</button>`)
    const start = await box(panel(page))
    await watch(host(page), 'rect-change')
    await tab()
    const move = page.getByRole('button', { name: 'Move Support chat' })
    await expect(move).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('Shift+ArrowUp')
    expect(await box(panel(page))).toEqual({ ...start, x: start.x - 10, y: start.y - 50 })
    await page.keyboard.press('Home')
    expect(await box(panel(page))).toEqual(start)
    await expect(host(page)).toHaveJSProperty('rect', null)
    const reported = await events(host(page))
    expect(reported.map((event) => (event as { reason: string }).reason)).toEqual(['keyboard', 'keyboard', 'keyboard'])
    expect(reported[2]).toEqual({ rect: null, reason: 'keyboard' })
    await expect(move).toBeFocused()
  })

  test('the keys stop at the boundary', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":20,"y":20,"width":320,"height":240}'`))
    await handle(page).focus()
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(host(page)).toHaveJSProperty('rect', { x: 0, y: 20, width: 320, height: 240 })
  })

  test('the corner grip resizes by the same steps', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    const grip = page.getByRole('button', { name: 'Resize Support chat' })
    await grip.focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    await page.keyboard.press('Shift+ArrowLeft')
    await page.keyboard.press('Shift+ArrowLeft')
    expect(await box(panel(page))).toEqual({ x: 100, y: 100, width: 240, height: 290 })
  })

  test('moves and resizes are announced once the keys stop', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    const live = host(page).locator('[role="status"]')
    await handle(page).focus()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await expect(live).toHaveText('Moved to 120, 100')
    await host(page).locator('.grip').focus()
    await page.keyboard.press('ArrowDown')
    await expect(live).toHaveText('Resized to 320 by 250')
  })

  test('Escape restores a maximised panel and leaves a normal one alone', async ({ page, renderScenario }) => {
    await renderScenario(chat('', '<input aria-label="Message" />'))
    await page.getByRole('textbox', { name: 'Message' }).focus()
    await page.keyboard.press('Escape')
    await expect(host(page)).toHaveJSProperty('state', 'normal')
    await expect(host(page)).toHaveJSProperty('open', true)
    await props(host(page), { state: 'maximized' })
    await page.keyboard.press('Escape')
    await expect(host(page)).toHaveJSProperty('state', 'normal')
  })
})

test.describe('minimise, maximise, restore and close', () => {
  test('Minimise docks the panel to the bottom edge with only Restore and Close, its body inert', async ({ page, renderScenario }) => {
    await renderScenario(chat('', '<button>Inside</button>'))
    await watch(host(page), 'state-change')
    await page.getByRole('button', { name: 'Minimise' }).click()
    const viewport = page.viewportSize()!
    const docked = await box(panel(page))
    expect(docked.width).toBe(240)
    expect(docked.x + docked.width).toBe(viewport.width - 16)
    expect(docked.y + docked.height).toBe(viewport.height)
    await expect(host(page)).toHaveState('minimized')
    await expect(host(page).locator('.body')).toBeHidden()
    expect(
      await host(page)
        .locator('.body')
        .evaluate((body) => (body as HTMLElement).inert),
    ).toBe(true)
    await expect(page.getByRole('button', { name: 'Inside' })).toBeHidden()
    const buttons = host(page).locator('.buttons button')
    await expect(buttons).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'Restore' })).toBeFocused()
    await expect(host(page).locator('[role="status"]')).toHaveText('Support chat minimised')
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(host(page)).not.toHaveState('minimized')
    await expect(page.getByRole('button', { name: 'Inside' })).toBeVisible()
    expect(await events(host(page))).toEqual([
      { state: 'minimized', previous: 'normal' },
      { state: 'normal', previous: 'minimized' },
    ])
  })

  test('docked panels line up from the right', async ({ page, renderScenario }) => {
    await renderScenario(`${chat('state="minimized"')}${chat('state="minimized"', '<p>Notes</p>', 'Meeting notes')}`)
    const first = await box(panel(page, 0))
    const second = await box(panel(page, 1))
    expect(second.y).toBe(first.y)
    expect(first.x - second.x).toBe(240 + 8)
    await host(page, 0).evaluate((element) => (element as HTMLElement & { restore(): void }).restore())
    await expect.poll(async () => (await box(panel(page, 1))).x).toBe(first.x)
  })

  const dockArea = async (page: Page) =>
    page.locator('.area').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const left = rect.x + element.clientLeft
      const top = rect.y + element.clientTop
      return { left, top, right: left + element.clientWidth, bottom: top + element.clientHeight }
    })
  const docked = (count: number, attributes = '') =>
    Array.from({ length: count }, (_, index) => chat(`boundary="parent" state="minimized" ${attributes}`, '<p>Body</p>', `Panel number ${index + 1}`)).join('')

  // Each case: boundary width, panel count, the shared width each bar gets, and how many bars fit on a line. The
  // inset is the default 16px from the right, so a line has the boundary less 2 × 16px; the gap is 8px.
  for (const [width, count, barWidth, perLine] of [
    [800, 2, 240, 2], // room 768: both at full width
    [600, 3, 184, 3], // room 568: (568 - 16) / 3 = 184, above the 120px floor
    [400, 3, 180, 2], // room 368: 117 is below the floor, so two per line at (368 - 8) / 2
    [260, 2, 228, 1], // room 228: 110 is below the floor and two 120px bars do not fit, so one per line
    [260, 3, 228, 1],
  ] as const) {
    test(`${count} docked panels in a ${width}px boundary are ${barWidth}px wide, ${perLine} per line, all inside`, async ({ page, renderScenario }) => {
      await renderScenario(`<div class="area" style="width: ${width}px; height: 300px">${docked(count)}</div>`)
      const area = await dockArea(page)
      await expect.poll(async () => (await box(panel(page, count - 1))).width).toBe(barWidth)
      const first = await box(panel(page, 0))
      expect(first.x + first.width).toBe(Math.round(area.right - 16))
      expect(first.y + first.height).toBe(Math.round(area.bottom))
      for (let index = 0; index < count; index++) {
        const rect = await box(panel(page, index))
        const column = index % perLine
        const line = Math.floor(index / perLine)
        expect(rect, `bar ${index + 1}`).toEqual({
          x: first.x - column * (barWidth + 8),
          y: first.y - line * (first.height + 8),
          width: barWidth,
          height: first.height,
        })
        expect(rect.x).toBeGreaterThanOrEqual(Math.floor(area.left))
        expect(rect.y).toBeGreaterThanOrEqual(Math.floor(area.top))
      }
    })
  }

  test('a left-anchored dock lines up to the right and keeps every bar inside', async ({ page, renderScenario }) => {
    await renderScenario(`<div class="area" style="width: 400px; height: 300px; --c2-floating-panel__docked--inset: auto auto 0 16px">${docked(3)}</div>`)
    const area = await dockArea(page)
    await expect.poll(async () => (await box(panel(page, 2))).width).toBe(180)
    const first = await box(panel(page, 0))
    expect(first.x).toBe(Math.round(area.left + 16))
    expect(await box(panel(page, 1))).toEqual({ ...first, x: first.x + 188 })
    expect(await box(panel(page, 2))).toEqual({ ...first, y: first.y - first.height - 8 })
    for (let index = 0; index < 3; index++) expect((await box(panel(page, index))).x + 180).toBeLessThanOrEqual(Math.ceil(area.right))
  })

  test('a top-anchored dock wraps downward', async ({ page, renderScenario }) => {
    await renderScenario(`<div class="area" style="width: 260px; height: 300px; --c2-floating-panel__docked--inset: 0 16px auto auto">${docked(2)}</div>`)
    const area = await dockArea(page)
    await expect.poll(async () => (await box(panel(page, 1))).width).toBe(228)
    const first = await box(panel(page, 0))
    expect(first.y).toBe(Math.round(area.top))
    expect(await box(panel(page, 1))).toEqual({ ...first, y: first.y + first.height + 8 })
  })

  test('minimize="collapse" folds the panel to its title bar where it is', async ({ page, renderScenario }) => {
    await renderScenario(chat(`minimize="collapse" rect='{"x":100,"y":100,"width":320,"height":240}'`))
    await page.getByRole('button', { name: 'Minimise' }).click()
    const folded = await box(panel(page))
    expect({ x: folded.x, y: folded.y, width: folded.width }).toEqual({ x: 100, y: 100, width: 320 })
    expect(folded.height).toBeLessThan(60)
    await expect(host(page).locator('.body')).toBeHidden()
    // A collapsed panel still moves by its title bar.
    await drag(page, handle(page), 50, 0)
    expect((await box(panel(page))).x).toBe(150)
    await page.getByRole('button', { name: 'Restore' }).click()
    expect(await box(panel(page))).toEqual({ x: 150, y: 100, width: 320, height: 240 })
  })

  test('a collapse at the CSS place folds where the panel is', async ({ page, renderScenario }) => {
    await renderScenario(chat('minimize="collapse" style="--c2-floating-panel--height: 300px"'))
    const before = await box(panel(page))
    await page.getByRole('button', { name: 'Minimise' }).click()
    const folded = await box(panel(page))
    expect({ x: folded.x, y: folded.y }).toEqual({ x: before.x, y: before.y })
    await page.getByRole('button', { name: 'Restore' }).click()
    expect(await box(panel(page))).toEqual(before)
    await expect(host(page)).toHaveJSProperty('rect', null)
  })

  test('Maximise fills the window less 8px, and Restore returns to the last rect', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    await watch(host(page), 'state-change')
    await page.getByRole('button', { name: 'Maximise' }).click()
    const viewport = page.viewportSize()!
    expect(await box(panel(page))).toEqual({ x: 8, y: 8, width: viewport.width - 16, height: viewport.height - 16 })
    await expect(host(page)).toHaveState('maximized')
    await expect(page.getByRole('button', { name: 'Restore' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Move Support chat' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Restore' }).click()
    expect(await box(panel(page))).toEqual({ x: 100, y: 100, width: 320, height: 240 })
    expect(await events(host(page))).toEqual([
      { state: 'maximized', previous: 'normal' },
      { state: 'normal', previous: 'maximized' },
    ])
  })

  test('a double-click on the title bar maximises and restores', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    await handle(page).dblclick()
    await expect(host(page)).toHaveJSProperty('state', 'maximized')
    await handle(page).dblclick()
    await expect(host(page)).toHaveJSProperty('state', 'normal')
  })

  test('a panel minimised while maximised restores to maximised', async ({ page, renderScenario }) => {
    await renderScenario(chat('state="maximized"'))
    await page.getByRole('button', { name: 'Minimise' }).click()
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(host(page)).toHaveJSProperty('state', 'maximized')
  })

  test('no-maximize keeps Restore on a panel that is already maximised', async ({ page, renderScenario }) => {
    await renderScenario(chat('no-maximize state="maximized"'))
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(host(page)).toHaveJSProperty('state', 'normal')
    await expect(page.getByRole('button', { name: 'Maximise' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Restore' })).toHaveCount(0)
  })

  test('the opt-outs hide their buttons', async ({ page, renderScenario }) => {
    await renderScenario(chat('no-minimize no-maximize no-close'))
    await expect(host(page).locator('.buttons button')).toHaveCount(0)
    await handle(page).dblclick()
    await expect(host(page)).toHaveJSProperty('state', 'normal')
  })

  test('Close asks before-close, which can keep the panel open, then closes it', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    await watch(host(page), 'close')
    await host(page).evaluate((element) => element.addEventListener('before-close', (event) => (element as HTMLElement).dataset.keep && event.preventDefault()))
    await host(page).evaluate((element) => ((element as HTMLElement).dataset.keep = 'yes'))
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog', { name: 'Support chat' })).toBeVisible()
    expect(await events(host(page))).toEqual([])
    await host(page).evaluate((element) => delete (element as HTMLElement).dataset.keep)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('dialog')).toBeHidden()
    await expect(host(page)).toHaveJSProperty('open', false)
    expect(await events(host(page))).toEqual([null])
  })

  test('show() fires open, focuses the first field, and close() returns focus to the opener', async ({ page, renderScenario }) => {
    await renderScenario(
      `<button id="opener">Open chat</button>${chat('', '<p>Hi</p><input aria-label="Message" />').replace(' open ', ' ')}<button>After</button>`,
    )
    await watch(host(page), 'open')
    await page
      .locator('#opener')
      .evaluate((button) => button.addEventListener('click', () => (document.querySelector('c2-floating-panel') as HTMLElement & { show(): void }).show()))
    await page.getByRole('button', { name: 'Open chat' }).click()
    await expect(page.getByRole('textbox', { name: 'Message' })).toBeFocused()
    expect(await events(host(page))).toEqual([null])
    await host(page).evaluate((element) => (element as HTMLElement & { close(): void }).close())
    await expect(page.getByRole('button', { name: 'Open chat' })).toBeFocused()
  })

  test('show() focuses the title-bar handle when the body has nothing focusable', async ({ page, renderScenario }) => {
    await renderScenario(chat().replace(' open ', ' '))
    await host(page).evaluate((element) => (element as HTMLElement & { show(): void }).show())
    await expect(page.getByRole('button', { name: 'Move Support chat' })).toBeFocused()
  })

  test('the window buttons follow the title bar in the tab order', async ({ page, renderScenario, tab }) => {
    await renderScenario(`${chat('', '<button>Inside</button>')}<button>After</button>`)
    await tab()
    await expect(page.getByRole('button', { name: 'Move Support chat' })).toBeFocused()
    await tab()
    await expect(page.getByRole('button', { name: 'Minimise' })).toBeFocused()
    await tab()
    await expect(page.getByRole('button', { name: 'Maximise' })).toBeFocused()
    await tab()
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused()
    await tab()
    await expect(page.getByRole('button', { name: 'Inside' })).toBeFocused()
  })
})

test.describe('stacking', () => {
  const two = () =>
    `${chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`, '<button>Layers body</button>', 'Layers')}${chat(
      `rect='{"x":200,"y":150,"width":320,"height":240}'`,
      '<button>Properties body</button>',
      'Properties',
    )}`

  const zIndex = (page: Page, nth: number) => panel(page, nth).evaluate((element) => Number(getComputedStyle(element).zIndex))

  test('the last panel opened is in front; a press on another brings it to the front', async ({ page, renderScenario }) => {
    await renderScenario(two())
    await expect(host(page, 1)).toHaveState('active')
    await expect(host(page, 0)).not.toHaveState('active')
    expect(await zIndex(page, 1)).toBeGreaterThan(await zIndex(page, 0))
    expect(await zIndex(page, 0)).toBe(100)
    // The back panel's visible corner, outside the front one.
    await page.mouse.click(120, 200)
    await expect(host(page, 0)).toHaveState('active')
    await expect(host(page, 1)).not.toHaveState('active')
    expect(await zIndex(page, 0)).toBeGreaterThan(await zIndex(page, 1))
  })

  test('focus brings a panel to the front, and the back one mutes its title', async ({ page, renderScenario }) => {
    await renderScenario(two())
    await page.getByRole('button', { name: 'Layers body' }).focus()
    await expect(host(page, 0)).toHaveState('active')
    await expect(panel(page, 1)).toHaveClass(/inactive/)
    await expect(host(page, 1).locator('.title')).toHaveCSS('color', 'rgb(113, 113, 122)')
  })

  test('a closed panel leaves the stack, and the one behind comes to the front', async ({ page, renderScenario }) => {
    await renderScenario(two())
    await props(host(page, 1), { open: false })
    await expect(host(page, 0)).toHaveState('active')
    expect(await zIndex(page, 0)).toBe(100)
  })

  test('the z-index base is a CSS variable', async ({ page, renderScenario }) => {
    await renderScenario(`<div style="--c2-floating-panel--z-index: 40">${two()}</div>`)
    expect(await zIndex(page, 0)).toBe(40)
    expect(await zIndex(page, 1)).toBe(41)
  })
})

test.describe('storage-key', () => {
  test("restores the saved rect and state, and saves the user's changes", async ({ page, renderScenario }) => {
    await renderScenario('')
    await page.evaluate(() => localStorage.setItem('chat-place', JSON.stringify({ rect: { x: 60, y: 70, width: 300, height: 220 }, state: 'normal' })))
    await renderScenario(chat('storage-key="chat-place"'))
    expect(await box(panel(page))).toEqual({ x: 60, y: 70, width: 300, height: 220 })
    await drag(page, handle(page), 40, 30)
    await page.getByRole('button', { name: 'Minimise' }).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chat-place')!))).toEqual({
      rect: { x: 100, y: 100, width: 300, height: 220 },
      state: 'minimized',
      restore: 'normal',
    })
    await renderScenario(chat('storage-key="chat-place"'))
    await expect(host(page)).toHaveState('minimized')
    await expect(host(page)).toHaveJSProperty('rect', { x: 100, y: 100, width: 300, height: 220 })
  })

  test('a panel minimised from maximised still restores to maximised after a reload', async ({ page, renderScenario }) => {
    await renderScenario('')
    await page.evaluate(() => localStorage.removeItem('chat-place'))
    await renderScenario(chat('storage-key="chat-place" state="maximized"'))
    await page.getByRole('button', { name: 'Minimise' }).click()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chat-place')!))).toEqual({ rect: null, state: 'minimized', restore: 'maximized' })
    await renderScenario(chat('storage-key="chat-place"'))
    await expect(host(page)).toHaveState('minimized')
    await page.getByRole('button', { name: 'Restore' }).click()
    await expect(host(page)).toHaveJSProperty('state', 'maximized')
  })

  test('ignores a value it did not write', async ({ page, renderScenario }) => {
    await renderScenario('')
    await page.evaluate(() => localStorage.setItem('chat-place', '{not json'))
    await renderScenario(chat('storage-key="chat-place"'))
    await expect(host(page)).toHaveJSProperty('rect', null)
    await expect(host(page)).toHaveJSProperty('state', 'normal')
  })

  test('the first render is the CSS place, as a server renders it; the saved place applies after', async ({ page, renderScenario }) => {
    await renderScenario('')
    const renders = await page.evaluate(async () => {
      localStorage.setItem('chat-place', JSON.stringify({ rect: { x: 60, y: 70, width: 300, height: 220 }, state: 'maximized' }))
      const element = document.createElement('c2-floating-panel') as HTMLElement & { updateComplete: Promise<boolean> }
      const seen: string[] = []
      const proto = Object.getPrototypeOf(element) as { updated?: (changed: unknown) => void }
      const updated = proto.updated!
      Object.defineProperty(element, 'updated', {
        value(this: HTMLElement, changed: unknown) {
          const section = this.shadowRoot!.querySelector('section')!
          seen.push(`${section.className.trim()}|${section.style.left}`)
          updated.call(this, changed)
        },
      })
      element.setAttribute('open', '')
      element.setAttribute('storage-key', 'chat-place')
      element.innerHTML = '<span slot="title">Support chat</span>'
      document.querySelector('main')!.append(element)
      await element.updateComplete
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await element.updateComplete
      return seen
    })
    expect(renders[0]).toBe('panel|')
    expect(renders.at(-1)).toContain('maximized')
  })
})

test.describe('semantics', () => {
  test('a non-modal dialog named by its title, with a named, described move handle and grip', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    const dialog = page.getByRole('dialog', { name: 'Support chat' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveAttribute('aria-modal', 'false')
    await expect(page.getByRole('button', { name: 'Move Support chat' })).toHaveAccessibleDescription('Arrow keys move the panel')
    await expect(page.getByRole('button', { name: 'Resize Support chat' })).toHaveAccessibleDescription('Arrow keys resize the panel')
    for (const name of ['Minimise', 'Maximise', 'Close']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await accessible(page)
  })

  test('label names the panel and shows as its title when the title slot is empty', async ({ page, renderScenario }) => {
    await renderScenario('<c2-floating-panel open label="Layers"><p>Body</p></c2-floating-panel>')
    await expect(page.getByRole('dialog', { name: 'Layers' })).toBeVisible()
    await expect(host(page).locator('.title')).toHaveText('Layers')
    await expect(page.getByRole('button', { name: 'Move Layers' })).toBeVisible()
  })

  test('the handle follows a title that changes', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    await host(page)
      .locator('[slot="title"]')
      .evaluate((title) => (title.textContent = 'Billing'))
    await expect(page.getByRole('button', { name: 'Move Billing' })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Billing' })).toBeVisible()
  })

  test('minimised and maximised panels have no axe violations', async ({ page, renderScenario }) => {
    await renderScenario(`${chat('', '<input aria-label="Message" />')}${chat('state="maximized"', '<p>Notes</p>', 'Notes')}`)
    await accessible(page)
    await host(page, 0).evaluate((element) => (element as HTMLElement & { minimize(): void }).minimize())
    await accessible(page)
  })

  test('custom states follow the panel: active, minimized, maximized and dragging', async ({ page, renderScenario }) => {
    await renderScenario(chat(`rect='{"x":100,"y":100,"width":320,"height":240}'`))
    const element = host(page)
    await expect(element).toHaveState('active')
    const rect = (await handle(page).boundingBox())!
    await page.mouse.move(rect.x + 20, rect.y + rect.height / 2)
    await page.mouse.down()
    await page.mouse.move(rect.x + 60, rect.y + rect.height / 2, { steps: 4 })
    await expect(element).toHaveState('dragging')
    await page.mouse.up()
    await expect(element).not.toHaveState('dragging')
    await props(element, { state: 'maximized' })
    await expect(element).toHaveState('maximized')
    await props(element, { state: 'minimized' })
    await expect(element).toHaveState('minimized')
    await expect(element).not.toHaveState('maximized')
    await props(element, { open: false })
    await expect(element).not.toHaveState('active')
  })

  test('writes no attribute on the host, whatever the user does', async ({ page, renderScenario }) => {
    await renderScenario(chat())
    const element = host(page)
    await drag(page, handle(page), -40, -40)
    await page.getByRole('button', { name: 'Maximise' }).click()
    await page.getByRole('button', { name: 'Minimise' }).click()
    await page.getByRole('button', { name: 'Restore' }).click()
    await page.getByRole('button', { name: 'Close' }).click()
    expect(await element.evaluate((node) => node.getAttributeNames())).toEqual(['open'])
    await expect(element).toHaveCSS('display', 'contents')
  })

  test('button names, the handle and the announcements follow lang', async ({ page, renderScenario }) => {
    await renderScenario(`<div lang="fr">${chat()}</div>`)
    await expect(page.getByRole('button', { name: 'Déplacer Support chat' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Redimensionner Support chat' })).toBeVisible()
    for (const name of ['Réduire', 'Agrandir', 'Fermer']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Réduire' }).click()
    await expect(host(page).locator('[role="status"]')).toHaveText('Support chat réduit')
    await page.locator('div[lang]').evaluate((element) => element.setAttribute('lang', 'en'))
    await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible()
  })
})

test('animates minimise and maximise unless reduced motion is asked for', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await renderScenario(chat())
  // Count the animations the panel starts, rather than catch a 180ms one still running on a slow machine.
  await panel(page).evaluate((element) => {
    const animate = element.animate.bind(element)
    element.dataset.animations = '0'
    element.animate = (...args: Parameters<Element['animate']>) => {
      element.dataset.animations = String(Number(element.dataset.animations) + 1)
      return animate(...args)
    }
  })
  await page.getByRole('button', { name: 'Maximise' }).click()
  await expect(panel(page)).toHaveAttribute('data-animations', '1')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Restore' }).click()
  await expect(host(page)).toHaveJSProperty('state', 'normal')
  await expect(panel(page)).toHaveAttribute('data-animations', '1')
})
