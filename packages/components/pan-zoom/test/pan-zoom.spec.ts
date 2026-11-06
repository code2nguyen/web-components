import type { Locator, Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { PanZoom, PanZoomView } from '../src/pan-zoom'

// The scenario page sizes every pan-zoom to 600 × 400 with no border and no animation (see scenarios.html), so the
// viewport is exactly 600 × 400 and a move lands at once. The plan is 1600 × 1000, the fit padding the default 24px.
const PLAN = `<div class="plan">
  <button id="start" style="left: 40px; top: 40px">Start</button>
  <button id="far" style="left: 1500px; top: 900px">Far corner</button>
</div>`
const CONTAIN = 552 / 1600

const subject = (page: Page) => page.locator('c2-pan-zoom').first()
const viewportOf = (page: Page) => page.locator('c2-pan-zoom [part="viewport"]').first()
const viewOf = (locator: Locator) => locator.evaluate((element: PanZoom) => element.view)

/** Two frames: the resize observer's first measurement and the render it asks for. */
const frames = (page: Page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

async function render(page: Page, renderScenario: (html: string) => Promise<void>, markup: string) {
  await renderScenario(markup)
  await frames(page)
}

/** Where content point (x, y) is drawn, in page coordinates. */
async function pagePoint(page: Page, x: number, y: number) {
  const box = await viewportOf(page).boundingBox()
  const view = await viewOf(subject(page))
  if (!box) throw new Error('No viewport')
  return { x: box.x + (x - view.x) * view.zoom, y: box.y + (y - view.y) * view.zoom }
}

/** Records the pan-zoom's events on the page, for `events()`. */
async function record(locator: Locator) {
  await locator.evaluate((element) => {
    const log: { type: string; bubbles: boolean; reason: string; zoom: number }[] = []
    ;(window as unknown as { panZoomEvents: typeof log }).panZoomEvents = log
    for (const type of ['view-change', 'view-settle']) {
      element.addEventListener(type, (event) => {
        const detail = (event as CustomEvent<PanZoomView & { reason: string }>).detail
        log.push({ type, bubbles: event.bubbles, reason: detail.reason, zoom: detail.zoom })
      })
    }
  })
}

const events = (page: Page) =>
  page.evaluate(() => (window as unknown as { panZoomEvents: { type: string; bubbles: boolean; reason: string; zoom: number }[] }).panZoomEvents)
const count = async (page: Page, type: string) => (await events(page)).filter((event) => event.type === type).length

async function drag(page: Page, from: { x: number; y: number }, by: { x: number; y: number }, options: { button?: 'left' | 'middle'; steps?: number } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: options.button ?? 'left' })
  await page.mouse.move(from.x + by.x, from.y + by.y, { steps: options.steps ?? 8 })
  await page.mouse.up({ button: options.button ?? 'left' })
}

/** A quick drag to the left, one move a frame, released while moving: what a flick is, independent of the machine's load. */
async function flick(page: Page) {
  await viewportOf(page).evaluate(async (viewport) => {
    const rect = viewport.getBoundingClientRect()
    const y = rect.top + rect.height / 2
    const fire = (type: string, x: number) =>
      viewport.dispatchEvent(
        new PointerEvent(type, { pointerId: 7, pointerType: 'mouse', isPrimary: true, button: 0, clientX: x, clientY: y, bubbles: true, composed: true }),
      )
    let x = rect.left + 400
    fire('pointerdown', x)
    for (let step = 0; step < 5; step++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      x -= 30
      fire('pointermove', x)
    }
    fire('pointerup', x)
  })
}

async function viewportCentre(page: Page) {
  const box = await viewportOf(page).boundingBox()
  if (!box) throw new Error('No viewport')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// ---------------------------------------------------------------------------------------------------------------
// Fit

test('fits the whole content by default, centred inside the fit padding', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom label="Plan">${PLAN}</c2-pan-zoom>`)
  const view = await viewOf(subject(page))
  expect(view.zoom).toBeCloseTo(CONTAIN, 4)
  expect((800 - view.x) * view.zoom).toBeCloseTo(300, 1)
  expect((500 - view.y) * view.zoom).toBeCloseTo(200, 1)
  const plan = await page.locator('.plan').boundingBox()
  expect(plan?.width).toBeCloseTo(552, 0)
})

test('cover fills the box, width starts at the top and none shows 100% in the centre', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="cover">${PLAN}</c2-pan-zoom>`)
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(0.4, 4)

  await render(page, renderScenario, `<c2-pan-zoom fit="width"><div class="plan" style="width: 800px; height: 2000px"></div></c2-pan-zoom>`)
  const width = await viewOf(subject(page))
  expect(width.zoom).toBeCloseTo(552 / 800, 4)
  expect(-width.y * width.zoom).toBeCloseTo(24, 1)

  await render(page, renderScenario, `<c2-pan-zoom fit="none">${PLAN}</c2-pan-zoom>`)
  expect(await viewOf(subject(page))).toEqual({ x: 500, y: 300, zoom: 1 })
})

test('a fitted view never zooms past 100%', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom><div class="plan" style="width: 200px; height: 100px"></div></c2-pan-zoom>`)
  expect((await viewOf(subject(page))).zoom).toBe(1)
})

test('refits when the content grows, until the view is moved', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom min-zoom="0.1">${PLAN}</c2-pan-zoom>`)
  await page.locator('.plan').evaluate((plan: HTMLElement) => (plan.style.width = '3200px'))
  await expect.poll(async () => (await viewOf(subject(page))).zoom).toBeCloseTo(552 / 3200, 4)
  await subject(page).evaluate((element: PanZoom) => element.zoomTo(1))
  await page.locator('.plan').evaluate((plan: HTMLElement) => (plan.style.width = '1600px'))
  await frames(page)
  expect((await viewOf(subject(page))).zoom).toBe(1)
})

// ---------------------------------------------------------------------------------------------------------------
// Zoom

test('zoom is held to min-zoom and max-zoom, and min-zoom="fit" stops at the fitted view', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom min-zoom="0.5" max-zoom="2">${PLAN}</c2-pan-zoom>`)
  // The fit itself respects the least zoom.
  expect((await viewOf(subject(page))).zoom).toBe(0.5)
  await subject(page).evaluate((element: PanZoom) => element.zoomTo(10))
  expect((await viewOf(subject(page))).zoom).toBe(2)
  await subject(page).evaluate((element: PanZoom) => element.zoomTo(0.01))
  expect((await viewOf(subject(page))).zoom).toBe(0.5)

  await render(page, renderScenario, `<c2-pan-zoom min-zoom="fit">${PLAN}</c2-pan-zoom>`)
  await subject(page).evaluate((element: PanZoom) => element.zoomOut())
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(CONTAIN, 4)
})

test('Ctrl + wheel zooms around the pointer', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom>${PLAN}</c2-pan-zoom>`)
  const point = await pagePoint(page, 400, 300)
  await page.mouse.move(point.x, point.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -200)
  await page.keyboard.up('Control')
  await expect.poll(async () => (await viewOf(subject(page))).zoom).toBeGreaterThan(CONTAIN * 1.2)
  const after = await subject(page).evaluate((element: PanZoom, at) => element.toContentPoint(at.x, at.y), point)
  expect(after.x).toBeCloseTo(400, 0)
  expect(after.y).toBeCloseTo(300, 0)
})

test('a double-click zooms in one step at that point, unless no-double-click-zoom', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom>${PLAN}</c2-pan-zoom>`)
  const point = await pagePoint(page, 1200, 300)
  await page.mouse.dblclick(point.x, point.y)
  await expect.poll(async () => (await viewOf(subject(page))).zoom).toBeCloseTo(CONTAIN * 1.2, 4)
  const after = await subject(page).evaluate((element: PanZoom, at) => element.toContentPoint(at.x, at.y), point)
  expect(after.x).toBeCloseTo(1200, 0)

  await render(page, renderScenario, `<c2-pan-zoom no-double-click-zoom>${PLAN}</c2-pan-zoom>`)
  const centre = await viewportCentre(page)
  await page.mouse.dblclick(centre.x, centre.y)
  await frames(page)
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(CONTAIN, 4)
})

test('a two-finger pinch zooms around the fingers', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom>${PLAN}</c2-pan-zoom>`)
  const before = await viewOf(subject(page))
  const anchor = { x: before.x + 300 / before.zoom, y: before.y + 200 / before.zoom }
  await viewportOf(page).evaluate((viewport) => {
    const rect = viewport.getBoundingClientRect()
    const fire = (type: string, pointerId: number, x: number, y: number) =>
      viewport.dispatchEvent(
        new PointerEvent(type, {
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 1,
          clientX: rect.left + x,
          clientY: rect.top + y,
          bubbles: true,
          composed: true,
        }),
      )
    fire('pointerdown', 1, 250, 200)
    fire('pointerdown', 2, 350, 200)
    fire('pointermove', 2, 450, 200)
    fire('pointermove', 1, 150, 200)
    fire('pointerup', 1, 150, 200)
    fire('pointerup', 2, 450, 200)
  })
  const after = await viewOf(subject(page))
  expect(after.zoom).toBeCloseTo(before.zoom * 3, 3)
  expect(after.x + 300 / after.zoom).toBeCloseTo(anchor.x, 1)
  expect(after.y + 200 / after.zoom).toBeCloseTo(anchor.y, 1)
})

// ---------------------------------------------------------------------------------------------------------------
// Wheel modes

test('cooperative: a plain wheel scrolls the page and shows the hint', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom>${PLAN}</c2-pan-zoom><div style="height: 2000px"></div>`)
  const before = await viewOf(subject(page))
  const centre = await viewportCentre(page)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
  const hint = page.locator('c2-pan-zoom [part="hint"]')
  await expect(hint).toHaveClass(/shown/)
  await expect(hint).toHaveText(/Use (Ctrl|⌘) \+ scroll to zoom/)
  expect(await viewOf(subject(page))).toEqual(before)
  // It goes away on its own after a moment.
  await expect(hint).not.toHaveClass(/shown/, { timeout: 3000 })
})

test('gestures="pan" pans with the wheel, "zoom" zooms with it and "none" ignores it', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom gestures="pan" fit="none">${PLAN}</c2-pan-zoom>`)
  let centre = await viewportCentre(page)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, 100)
  await expect.poll(async () => (await viewOf(subject(page))).y).toBeCloseTo(400, 0)
  expect((await viewOf(subject(page))).zoom).toBe(1)

  await render(page, renderScenario, `<c2-pan-zoom gestures="zoom">${PLAN}</c2-pan-zoom>`)
  centre = await viewportCentre(page)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, -100)
  await expect.poll(async () => (await viewOf(subject(page))).zoom).toBeGreaterThan(CONTAIN)

  await render(page, renderScenario, `<c2-pan-zoom gestures="none" fit="none">${PLAN}</c2-pan-zoom><div style="height: 2000px"></div>`)
  centre = await viewportCentre(page)
  await page.mouse.move(centre.x, centre.y)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await drag(page, centre, { x: -100, y: 0 })
  await frames(page)
  expect(await viewOf(subject(page))).toEqual({ x: 500, y: 300, zoom: 1 })
})

// ---------------------------------------------------------------------------------------------------------------
// Drag

test('a drag pans, and a drag from a button is left to it', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="none" no-inertia>${PLAN}</c2-pan-zoom>`)
  const centre = await viewportCentre(page)
  await drag(page, centre, { x: -100, y: -50 })
  expect(await viewOf(subject(page))).toEqual({ x: 600, y: 350, zoom: 1 })
  await subject(page).evaluate((element: PanZoom) => element.centerOn({ x: 100, y: 100 }, { animate: false }))
  const start = page.locator('#start')
  const box = await start.boundingBox()
  if (!box) throw new Error('No button')
  const before = await viewOf(subject(page))
  await drag(page, { x: box.x + 10, y: box.y + 10 }, { x: 80, y: 0 })
  expect(await viewOf(subject(page))).toEqual(before)
})

test('Space + drag and a middle-button drag pan even from a button; the click after a drag is swallowed', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="none" bounds="none" no-inertia>${PLAN}</c2-pan-zoom>`)
  await subject(page).evaluate((element: PanZoom) => element.centerOn({ x: 100, y: 100 }, { animate: false }))
  const clicks = await page.locator('#start').evaluate((button) => {
    const log = { count: 0 }
    button.addEventListener('click', () => log.count++)
    ;(window as unknown as { clicks: typeof log }).clicks = log
    return log.count
  })
  expect(clicks).toBe(0)
  const box = await page.locator('#start').boundingBox()
  if (!box) throw new Error('No button')
  const before = await viewOf(subject(page))
  await viewportOf(page).focus()
  await page.keyboard.down(' ')
  await drag(page, { x: box.x + 10, y: box.y + 10 }, { x: 60, y: 0 })
  await page.keyboard.up(' ')
  expect((await viewOf(subject(page))).x).toBeCloseTo(before.x - 60, 1)

  const middle = await page.locator('#start').boundingBox()
  if (!middle) throw new Error('No button')
  await drag(page, { x: middle.x + 10, y: middle.y + 10 }, { x: 0, y: 40 }, { button: 'middle' })
  expect((await viewOf(subject(page))).y).toBeCloseTo(before.y - 40, 1)

  // A plain drag across the content, released on the button: not a click on it.
  const target = await page.locator('#start').boundingBox()
  if (!target) throw new Error('No button')
  await drag(page, { x: target.x + 150, y: target.y + 10 }, { x: -140, y: 0 })
  expect(await page.evaluate(() => (window as unknown as { clicks: { count: number } }).clicks.count)).toBe(0)
})

test('a released drag glides and settles once; no-inertia stops at once', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="none">${PLAN}</c2-pan-zoom>`)
  await record(subject(page))
  await flick(page)
  const released = (await viewOf(subject(page))).x
  await expect.poll(async () => (await viewOf(subject(page))).x).toBeGreaterThan(released + 5)
  await expect.poll(() => count(page, 'view-settle')).toBe(1)
  await page.waitForTimeout(300)
  expect(await count(page, 'view-settle')).toBe(1)

  await render(page, renderScenario, `<c2-pan-zoom fit="none" no-inertia>${PLAN}</c2-pan-zoom>`)
  await flick(page)
  const stopped = await viewOf(subject(page))
  await frames(page)
  expect(await viewOf(subject(page))).toEqual(stopped)
})

test('bounds="content" keeps the content in view; bounds="none" lets it go', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="none" no-inertia>${PLAN}</c2-pan-zoom>`)
  const centre = await viewportCentre(page)
  await drag(page, { x: centre.x - 250, y: centre.y }, { x: 560, y: 0 })
  // The content's left edge stops one fit padding inside the viewport.
  expect((await viewOf(subject(page))).x).toBeCloseTo(-24, 1)

  await render(page, renderScenario, `<c2-pan-zoom fit="none" bounds="none" no-inertia>${PLAN}</c2-pan-zoom>`)
  await drag(page, { x: centre.x - 250, y: centre.y }, { x: 560, y: 0 })
  expect((await viewOf(subject(page))).x).toBeCloseTo(-60, 1)
})

// ---------------------------------------------------------------------------------------------------------------
// Keyboard and focus

test('the viewport is one tab stop: arrows pan, + and - zoom, 0 fits and 1 goes to 100%', async ({ page, renderScenario, tab }) => {
  await render(page, renderScenario, `<button>Before</button><c2-pan-zoom label="Plan" fit="none">${PLAN}</c2-pan-zoom>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(viewportOf(page)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  expect(await viewOf(subject(page))).toEqual({ x: 548, y: 300, zoom: 1 })
  await page.keyboard.press('Shift+ArrowDown')
  expect((await viewOf(subject(page))).y).toBe(400)
  await page.keyboard.press('+')
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(1.2, 5)
  await page.keyboard.press('-')
  await page.keyboard.press('-')
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(1 / 1.2, 5)
  await page.keyboard.press('Control+=')
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(1, 5)
  await page.keyboard.press('0')
  expect(await viewOf(subject(page))).toEqual({ x: 500, y: 300, zoom: 1 })
  await subject(page).evaluate((element: PanZoom) => (element.fitMode = 'contain'))
  await page.keyboard.press('0')
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(CONTAIN, 4)
  await page.keyboard.press('1')
  expect((await viewOf(subject(page))).zoom).toBe(1)
})

test('keys pressed inside the content are left to it, and no-keyboard drops the tab stop and the role', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="none">${PLAN}</c2-pan-zoom>`)
  const before = await viewOf(subject(page))
  await page.locator('#far').focus()
  const revealed = await viewOf(subject(page))
  expect(revealed).not.toEqual(before)
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('+')
  expect(await viewOf(subject(page))).toEqual(revealed)

  await expect(viewportOf(page)).toHaveAttribute('tabindex', '0')
  await expect(viewportOf(page)).toHaveAttribute('role', 'group')
  await expect(viewportOf(page)).toHaveAttribute('aria-roledescription', 'zoomable view')
  await render(page, renderScenario, `<c2-pan-zoom no-keyboard>${PLAN}</c2-pan-zoom>`)
  await expect(viewportOf(page)).not.toHaveAttribute('tabindex')
  await expect(viewportOf(page)).not.toHaveAttribute('role')
})

test('focus moving to content out of view pans it into view', async ({ page, renderScenario, tab }) => {
  await render(page, renderScenario, `<button>Before</button><c2-pan-zoom fit="none" label="Plan">${PLAN}</c2-pan-zoom><button>After</button>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await tab()
  await expect(page.locator('#start')).toBeFocused()
  const view = await viewOf(subject(page))
  expect(view.zoom).toBe(1)
  expect(view.x).toBeCloseTo(16, 0)
  expect(view.y).toBeCloseTo(16, 0)
  const viewport = await viewportOf(page).boundingBox()
  const button = await page.locator('#start').boundingBox()
  if (!viewport || !button) throw new Error('No boxes')
  expect(button.x).toBeGreaterThanOrEqual(viewport.x)
  expect(button.y).toBeGreaterThanOrEqual(viewport.y)
  // The browser's own scroll to the focused element is folded into the view, never left on the viewport.
  expect(await viewportOf(page).evaluate((element) => element.scrollLeft + element.scrollTop)).toBe(0)

  await tab()
  await expect(page.locator('#far')).toBeFocused()
  const far = await page.locator('#far').boundingBox()
  if (!far) throw new Error('No box')
  expect(far.x + far.width).toBeLessThanOrEqual(viewport.x + viewport.width)
  expect(far.y + far.height).toBeLessThanOrEqual(viewport.y + viewport.height)
})

// ---------------------------------------------------------------------------------------------------------------
// Toolbar

test('the toolbar zooms, reads the zoom and fits', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom controls max-zoom="1.4" fit="none">${PLAN}</c2-pan-zoom>`)
  const toolbar = page.getByRole('toolbar', { name: 'Zoom controls' })
  await expect(toolbar).toBeVisible()
  const readout = toolbar.getByRole('button', { name: 'Zoom 100%, reset to 100%' })
  await expect(readout).toHaveText('100%')
  await toolbar.getByRole('button', { name: 'Zoom in' }).click()
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(1.2, 5)
  await expect(toolbar.getByRole('button', { name: 'Zoom 120%, reset to 100%' })).toHaveText('120%')
  await toolbar.getByRole('button', { name: 'Zoom in' }).click()
  expect((await viewOf(subject(page))).zoom).toBe(1.4)
  await expect(toolbar.getByRole('button', { name: 'Zoom in' })).toHaveAttribute('aria-disabled', 'true')
  // Still focusable at the limit, and a press does nothing.
  await toolbar.getByRole('button', { name: 'Zoom in' }).click({ force: true })
  expect((await viewOf(subject(page))).zoom).toBe(1.4)
  await toolbar.getByRole('button', { name: /^Zoom 140%/ }).click()
  expect((await viewOf(subject(page))).zoom).toBe(1)
  await toolbar.getByRole('button', { name: 'Zoom out' }).click()
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(1 / 1.2, 5)
  await toolbar.getByRole('button', { name: 'Fit to view' }).click()
  expect(await viewOf(subject(page))).toEqual({ x: 500, y: 300, zoom: 1 })
  // A settled zoom is announced.
  await toolbar.getByRole('button', { name: 'Zoom in' }).click()
  await expect(page.locator('c2-pan-zoom [role="status"]')).toHaveText('Zoom 120%')
})

test('the toolbar is one tab stop moved by the arrow keys, and takes extra buttons', async ({ page, renderScenario, tab }) => {
  await render(page, renderScenario, `<button>Before</button><c2-pan-zoom controls no-keyboard>${PLAN}<button slot="controls">Rotate</button></c2-pan-zoom>`)
  await page.getByRole('button', { name: 'Before' }).focus()
  // The content's buttons come first, then the toolbar.
  await tab()
  await tab()
  await tab()
  await expect(page.getByRole('button', { name: 'Zoom out' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: /^Zoom \d+%, reset/ })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: 'Fit to view' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'Rotate' })).toBeFocused()
  // Slotted into the toolbar, after the fit button.
  const toolbar = await page.getByRole('toolbar').boundingBox()
  const rotate = await page.getByRole('button', { name: 'Rotate' }).boundingBox()
  const fit = await page.getByRole('button', { name: 'Fit to view' }).boundingBox()
  if (!toolbar || !rotate || !fit) throw new Error('No boxes')
  expect(rotate.x).toBeGreaterThan(fit.x)
  expect(rotate.x + rotate.width).toBeLessThanOrEqual(toolbar.x + toolbar.width)
  expect(rotate.y).toBeGreaterThanOrEqual(toolbar.y)
})

// ---------------------------------------------------------------------------------------------------------------
// Minimap

test('the minimap shows while the content overflows, frames the view and moves it on click', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom minimap>${PLAN}</c2-pan-zoom>`)
  const minimap = page.locator('c2-pan-zoom [part="minimap"]')
  // Fitted: nothing overflows.
  await expect(minimap).toBeHidden()
  await subject(page).evaluate((element: PanZoom) => element.zoomTo(1))
  await expect(minimap).toBeVisible()
  await expect(minimap).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('c2-pan-zoom .art-rect')).toBeAttached()
  const box = await minimap.boundingBox()
  const frame = await page.locator('c2-pan-zoom [part="minimap-frame"]').boundingBox()
  if (!box || !frame) throw new Error('No minimap')
  // 160 × 100 inside a 1px border.
  expect(box.width).toBeCloseTo(162, 0)
  expect(box.height).toBeCloseTo(102, 0)
  expect(frame.width / box.width).toBeCloseTo(600 / 1600, 1)
  // A quarter across and half down the drawing (inside the 1px border): content point (400, 500) is centred.
  await page.mouse.click(box.x + 1 + 40, box.y + 1 + 50)
  const view = await viewOf(subject(page))
  expect(view.x + 300).toBeCloseTo(400, 0)
  expect(view.y + 200).toBeCloseTo(500, 0)
})

test('the minimap copies a single image or SVG, takes its slot, and never clones custom elements', async ({ page, renderScenario }) => {
  const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><rect width="1600" height="1000" fill="teal"/></svg>')}`
  await render(page, renderScenario, `<c2-pan-zoom minimap fit="none"><img src="${image}" alt="" width="1600" height="1000" /></c2-pan-zoom>`)
  await expect(page.locator('c2-pan-zoom .art img')).toHaveAttribute('src', image)

  await render(
    page,
    renderScenario,
    `<style>.wall { stroke: rgb(1, 2, 3); }</style><c2-pan-zoom minimap fit="none"><svg width="1600" height="1000"><rect class="room wall" width="800" height="500" fill="pink"/><foreignObject><button>x</button></foreignObject></svg></c2-pan-zoom>`,
  )
  const room = page.locator('c2-pan-zoom .art-svg svg rect.room')
  await expect(room).toBeAttached()
  // Looked for through a display: contents wrapper, such as an island's.
  await render(
    page,
    renderScenario,
    `<c2-pan-zoom minimap fit="none"><span style="display: contents"><svg width="1600" height="1000"><rect class="through" width="800" height="500" /></svg></span></c2-pan-zoom>`,
  )
  await expect(page.locator('c2-pan-zoom .art-svg svg rect.through')).toBeAttached()
  await render(
    page,
    renderScenario,
    `<style>.wall { stroke: rgb(1, 2, 3); }</style><c2-pan-zoom minimap fit="none"><svg width="1600" height="1000"><rect class="room wall" width="800" height="500" fill="pink"/><foreignObject><button>x</button></foreignObject></svg></c2-pan-zoom>`,
  )
  await expect(room).toBeAttached()
  // The page's style sheet does not reach the copy, so its computed look is carried along.
  await expect(room).toHaveCSS('stroke', 'rgb(1, 2, 3)')
  await expect(page.locator('c2-pan-zoom .art-svg foreignObject')).toHaveCount(0)

  await render(page, renderScenario, `<c2-pan-zoom minimap fit="none"><c2-pan-zoom style="width: 1600px"></c2-pan-zoom></c2-pan-zoom>`)
  await expect(page.locator('c2-pan-zoom .art-rect').first()).toBeAttached()
  expect(await subject(page).evaluate((element) => element.shadowRoot?.querySelectorAll('.art c2-pan-zoom').length)).toBe(0)

  await render(page, renderScenario, `<c2-pan-zoom minimap fit="none">${PLAN}<div slot="minimap" id="custom-map">Map</div></c2-pan-zoom>`)
  await expect(page.locator('#custom-map')).toBeVisible()
})

// ---------------------------------------------------------------------------------------------------------------
// Events

test('view-change fires at most once per frame and view-settle once, neither bubbling', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom>${PLAN}</c2-pan-zoom>`)
  await record(subject(page))
  await viewportOf(page).evaluate((viewport) => {
    const rect = viewport.getBoundingClientRect()
    for (let index = 0; index < 5; index++) {
      viewport.dispatchEvent(
        new WheelEvent('wheel', {
          deltaY: -20,
          ctrlKey: true,
          clientX: rect.left + 100,
          clientY: rect.top + 100,
          bubbles: true,
          cancelable: true,
          composed: true,
        }),
      )
    }
  })
  await expect.poll(() => count(page, 'view-settle')).toBe(1)
  const log = await events(page)
  expect(log.map((event) => event.type)).toEqual(['view-change', 'view-settle'])
  expect(log.every((event) => !event.bubbles && event.reason === 'wheel')).toBe(true)
  expect(log[1].zoom).toBeCloseTo(CONTAIN * Math.exp(0.0022 * 100), 4)
})

test('setting view or zoom moves the view without an event; methods report the api reason', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom>${PLAN}</c2-pan-zoom>`)
  await record(subject(page))
  await subject(page).evaluate((element: PanZoom) => {
    element.view = { x: 100, y: 100, zoom: 1 }
  })
  expect(await viewOf(subject(page))).toEqual({ x: 100, y: 100, zoom: 1 })
  await subject(page).evaluate((element: PanZoom) => (element.zoom = 2))
  expect((await viewOf(subject(page))).zoom).toBe(2)
  await frames(page)
  expect(await events(page)).toEqual([])
  await subject(page).evaluate((element: PanZoom) => element.panBy(10, 0))
  await expect
    .poll(() => events(page))
    .toEqual([
      { type: 'view-change', bubbles: false, reason: 'api', zoom: 2 },
      { type: 'view-settle', bubbles: false, reason: 'api', zoom: 2 },
    ])
})

// ---------------------------------------------------------------------------------------------------------------
// Motion

test('animated moves ease, and jump under prefers-reduced-motion', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom fit="none" style="--c2-pan-zoom--transition-duration: 300ms">${PLAN}</c2-pan-zoom>`)
  await record(subject(page))
  expect(await subject(page).evaluate((element: PanZoom) => (element.zoomIn(), element.zoom))).toBe(1)
  await expect.poll(async () => (await viewOf(subject(page))).zoom).toBe(1.2)
  const changes = (await events(page)).filter((event) => event.type === 'view-change')
  expect(changes.length).toBeGreaterThan(2)
  expect(changes.some((event) => event.zoom > 1 && event.zoom < 1.2)).toBe(true)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await subject(page).evaluate((element: PanZoom) => (element.zoomIn(), element.zoom))).toBeCloseTo(1.44, 5)
  await render(page, renderScenario, `<c2-pan-zoom fit="none">${PLAN}</c2-pan-zoom>`)
  await record(subject(page))
  await flick(page)
  const released = await viewOf(subject(page))
  await expect.poll(() => count(page, 'view-settle')).toBe(1)
  expect(await viewOf(subject(page))).toEqual(released)
})

// ---------------------------------------------------------------------------------------------------------------
// First render

test('before it can measure, the content is centred at its natural size; the fit lands on the first frame', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="holder" style="display: none"><c2-pan-zoom>${PLAN}</c2-pan-zoom></div>`)
  const content = page.locator('c2-pan-zoom [part="content"]')
  await expect(content).toHaveAttribute('style', 'left: 50%; top: 50%; transform: translate(-50%, -50%)')
  await record(subject(page))
  await page.locator('#holder').evaluate((holder: HTMLElement) => (holder.style.display = 'block'))
  await frames(page)
  expect((await viewOf(subject(page))).zoom).toBeCloseTo(CONTAIN, 4)
  await expect
    .poll(() => events(page))
    .toEqual([
      { type: 'view-change', bubbles: false, reason: 'fit', zoom: CONTAIN },
      { type: 'view-settle', bubbles: false, reason: 'fit', zoom: CONTAIN },
    ])
})

test('reveal() called before the first measurement reads the element where the view will be', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="holder" style="display: none"><c2-pan-zoom fit="none" min-zoom="1">${PLAN}</c2-pan-zoom></div>`)
  await subject(page).evaluate((element: PanZoom) => element.reveal(element.querySelector('#far')!))
  await page.locator('#holder').evaluate((holder: HTMLElement) => (holder.style.display = 'block'))
  await frames(page)
  const viewport = await viewportOf(page).boundingBox()
  const far = await page.locator('#far').boundingBox()
  if (!viewport || !far) throw new Error('No boxes')
  expect(far.x + far.width).toBeCloseTo(viewport.x + viewport.width - 24, 0)
  expect(far.y + far.height).toBeCloseTo(viewport.y + viewport.height - 24, 0)
})

test('a call made before the first measurement waits for it', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="holder" style="display: none"><c2-pan-zoom>${PLAN}</c2-pan-zoom></div>`)
  await subject(page).evaluate((element: PanZoom) => element.centerOn({ x: 400, y: 300 }, { zoom: 2 }))
  await page.locator('#holder').evaluate((holder: HTMLElement) => (holder.style.display = 'block'))
  await frames(page)
  expect(await viewOf(subject(page))).toEqual({ x: 250, y: 200, zoom: 2 })
  await expect(page.locator('c2-pan-zoom [part="content"]')).toHaveAttribute('style', 'transform: translate(-500px, -400px) scale(2)')
})

test('a zoom or view written in markup is the first view, with no jump', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="holder" style="display: none"><c2-pan-zoom zoom="2">${PLAN}</c2-pan-zoom></div>`)
  await expect(page.locator('c2-pan-zoom [part="content"]')).toHaveAttribute('style', 'left: 50%; top: 50%; transform: scale(2) translate(-50%, -50%)')
  await page.locator('#holder').evaluate((holder: HTMLElement) => (holder.style.display = 'block'))
  await frames(page)
  expect(await viewOf(subject(page))).toEqual({ x: 650, y: 400, zoom: 2 })

  await render(page, renderScenario, `<c2-pan-zoom view='{"x": 120, "y": 80, "zoom": 1.5}'>${PLAN}</c2-pan-zoom>`)
  expect(await viewOf(subject(page))).toEqual({ x: 120, y: 80, zoom: 1.5 })
  await expect(page.locator('c2-pan-zoom [part="content"]')).toHaveAttribute('style', 'transform: translate(-180px, -120px) scale(1.5)')
})

// ---------------------------------------------------------------------------------------------------------------
// Inside another component's shadow root

test('works inside another component’s shadow root: reveal, centerOn, follow focus and the wheel', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<test-shadow-board></test-shadow-board>`)
  const board = page.locator('test-shadow-board c2-pan-zoom')
  await expect(page.locator('test-shadow-board [part="viewport"]')).not.toHaveAttribute('tabindex')
  const viewport = await page.locator('test-shadow-board [part="viewport"]').boundingBox()
  if (!viewport) throw new Error('No viewport')
  const inView = async (id: string) => {
    const box = await page.locator(`test-shadow-board #${id}`).boundingBox()
    if (!box) return false
    return (
      box.x >= viewport.x - 0.5 &&
      box.y >= viewport.y - 0.5 &&
      box.x + box.width <= viewport.x + viewport.width + 0.5 &&
      box.y + box.height <= viewport.y + viewport.height + 0.5
    )
  }
  await board.evaluate((element: PanZoom) => element.zoomTo(1, { animate: false }))
  expect(await inView('far')).toBe(false)
  await board.evaluate((element: PanZoom) => element.reveal(element.querySelector('#far')!))
  await frames(page)
  expect(await inView('far')).toBe(true)
  expect((await viewOf(board)).zoom).toBe(1)

  await board.evaluate((element: PanZoom) => element.centerOn({ x: 100, y: 60 }))
  await frames(page)
  expect(await viewOf(board)).toEqual({ x: -200, y: -140, zoom: 1 })
  expect(await inView('far')).toBe(false)
  await page.locator('test-shadow-board #far').focus()
  await frames(page)
  expect(await inView('far')).toBe(true)

  // gestures="pan": the wheel pans.
  const before = await viewOf(board)
  await page.mouse.move(viewport.x + 300, viewport.y + 200)
  await page.mouse.wheel(0, -100)
  await expect.poll(async () => (await viewOf(board)).y).toBeCloseTo(before.y - 100, 0)

  // toContentPoint maps a pointer position to the board.
  const near = await page.locator('test-shadow-board #near').boundingBox()
  await board.evaluate((element: PanZoom) => element.centerOn({ x: 100, y: 60 }, { animate: false }))
  await frames(page)
  const nearBox = await page.locator('test-shadow-board #near').boundingBox()
  if (!near || !nearBox) throw new Error('No topic')
  const point = await board.evaluate((element: PanZoom, at) => element.toContentPoint(at.x, at.y), { x: nearBox.x, y: nearBox.y })
  expect(point.x).toBeCloseTo(40, 0)
  expect(point.y).toBeCloseTo(40, 0)
})

// ---------------------------------------------------------------------------------------------------------------
// Accessibility, host and language

test('passes axe with the toolbar and the minimap, and names the viewport', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom label="Office floor plan" controls minimap>${PLAN}</c2-pan-zoom>`)
  await subject(page).evaluate((element: PanZoom) => element.zoomTo(1))
  await expect(page.getByRole('group', { name: 'Office floor plan' })).toBeVisible()
  await expect(viewportOf(page)).toHaveAttribute('aria-describedby', 'key-help')
  await expect(page.locator('c2-pan-zoom #key-help')).toHaveText('Arrow keys to pan, plus and minus to zoom, 0 to fit.')
  await accessible(page)
})

test('writes no attribute on the host', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<c2-pan-zoom label="Plan" controls minimap>${PLAN}</c2-pan-zoom>`)
  const attributes = () => subject(page).evaluate((element) => element.getAttributeNames().sort())
  const authored = await attributes()
  expect(authored).toEqual(['controls', 'label', 'minimap'])
  await viewportOf(page).focus()
  await page.keyboard.press('+')
  await page.keyboard.press('ArrowLeft')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await drag(page, await viewportCentre(page), { x: 40, y: 40 })
  await frames(page)
  expect(await attributes()).toEqual(authored)
})

test('its interface text follows the nearest lang', async ({ page, renderScenario }) => {
  await render(page, renderScenario, `<div lang="fr"><c2-pan-zoom controls fit="none">${PLAN}</c2-pan-zoom></div>`)
  await expect(page.getByRole('toolbar', { name: 'Commandes de zoom' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom avant' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom arrière' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ajuster à la vue' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Zoom 100\s?%, revenir à 100\s?%$/ })).toBeVisible()
  await expect(viewportOf(page)).toHaveAttribute('aria-roledescription', 'vue zoomable')
  const centre = await viewportCentre(page)
  await page.mouse.move(centre.x, centre.y)
  await page.mouse.wheel(0, 100)
  await expect(page.locator('c2-pan-zoom [part="hint"]')).toHaveText(/Utilisez (Ctrl|⌘) \+ défilement pour zoomer/)
})
