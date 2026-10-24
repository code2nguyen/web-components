import { test, expect, props, watch, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('footer presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const footer = page.locator('c2-sheet').locator('[part="footer"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-sheet label="Settings" open><button slot="footer" data-slot-presence-probe>Save</button></c2-sheet>',
    host: 'c2-sheet',
    slot: 'footer',
    assertPresent: async (present) => (present ? expect(footer).toBeVisible() : expect(footer).toBeHidden()),
  })
})

/** Settled geometry of the panel, after the slide transition has finished. */
async function panel(page: import('@playwright/test').Page) {
  const box = page.locator('[part="panel"]')
  await box.evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})))
  })
  const rect = (await box.boundingBox())!
  const viewport = page.viewportSize()!
  return { ...rect, viewport }
}

test('show opens a named sheet and Escape closes it with focus restoration', async ({ page, renderScenario, tab }) => {
  await renderScenario('<button id="launch">Filters</button><c2-sheet label="Filters"><input aria-label="Query" /></c2-sheet>')
  const host = page.locator('c2-sheet')
  await page.locator('#launch').evaluate((el) =>
    el.addEventListener('click', () => {
      const sheet = document.querySelector('c2-sheet') as HTMLElement & { show(): void }
      sheet.show()
    }),
  )
  await tab()
  await page.getByRole('button', { name: 'Filters' }).press('Enter')
  await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden')
  await accessible(page)
  await page.keyboard.press('Escape')
  await expect(host).toHaveJSProperty('open', false)
  await expect(page.getByRole('button', { name: 'Filters' })).toBeFocused()
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
})

test('a right sheet is pinned to the right edge and spans the full height', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet label="Details" open>Content</c2-sheet>')
  const { x, y, width, height, viewport } = await panel(page)
  expect(Math.round(width)).toBe(380)
  expect(Math.round(x + width)).toBe(viewport.width)
  expect(Math.round(y)).toBe(0)
  expect(Math.round(height)).toBe(viewport.height)
})

test('each side pins the panel to its own edge', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet label="Details" open side="left">Content</c2-sheet>')
  const host = page.locator('c2-sheet')
  const left = await panel(page)
  expect(Math.round(left.x)).toBe(0)
  expect(Math.round(left.width)).toBe(380)
  expect(Math.round(left.height)).toBe(left.viewport.height)

  await props(host, { side: 'top' })
  const top = await panel(page)
  expect(Math.round(top.y)).toBe(0)
  expect(Math.round(top.height)).toBe(380)
  expect(Math.round(top.width)).toBe(top.viewport.width)

  await props(host, { side: 'bottom' })
  const bottom = await panel(page)
  expect(Math.round(bottom.y + bottom.height)).toBe(bottom.viewport.height)
  expect(Math.round(bottom.height)).toBe(380)
  expect(Math.round(bottom.width)).toBe(bottom.viewport.width)
})

test('size sets the depth of the sheet on whichever axis it occupies', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet label="Details" open style="--c2-sheet--size: 240px">Content</c2-sheet>')
  expect(Math.round((await panel(page)).width)).toBe(240)
  await props(page.locator('c2-sheet'), { side: 'bottom' })
  expect(Math.round((await panel(page)).height)).toBe(240)
})

test('no-escape and no-backdrop-close preserve the sheet until explicit close', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet label="Filters" open no-escape no-backdrop-close>Content</c2-sheet>')
  await page.keyboard.press('Escape')
  // A left-edge click lands on the backdrop, since the panel sits on the right.
  await page.mouse.click(1, 1)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('a backdrop click closes the sheet but a click inside it does not', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet label="Filters" open>Content</c2-sheet>')
  const box = await panel(page)
  await page.mouse.click(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.mouse.click(1, 1)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('close returns a value and disconnect releases the scroll lock', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet label="Filters" open>Content</c2-sheet>')
  const host = page.locator('c2-sheet')
  await watch(host, 'close')
  await host.evaluate((el) => (el as HTMLElement & { close(value: string): void }).close('applied'))
  await expect(host).toHaveAttribute('data-events', '[{"returnValue":"applied"}]')
  await props(host, { open: true })
  await host.evaluate((el) => el.remove())
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
})

test('the title slot names the sheet and the footer only appears when filled', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet open><h2 slot="title">Edit record</h2>Body</c2-sheet>')
  await expect(page.getByRole('dialog', { name: 'Edit record' })).toBeVisible()
  await expect(page.locator('[part="footer"]')).toBeHidden()
  await accessible(page)
  await page.locator('c2-sheet').evaluate((el) => {
    const button = document.createElement('button')
    button.slot = 'footer'
    button.textContent = 'Save'
    el.append(button)
  })
  await expect(page.locator('[part="footer"]')).toBeVisible()
})

test('a sheet holding a modal keeps the page locked until both have closed', async ({ page, renderScenario }) => {
  // The scroll lock is shared through @c2n/core, so the inner overlay closing must not hand the page back.
  await renderScenario('<c2-sheet label="Filters" open><c2-modal label="Confirm" open>Sure?</c2-modal></c2-sheet>')
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden')
  await page.locator('c2-modal').evaluate((el) => (el as HTMLElement & { close(): void }).close())
  await expect(page.locator('c2-modal')).toHaveJSProperty('open', false)
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden')
  await page.locator('c2-sheet').evaluate((el) => (el as HTMLElement & { close(): void }).close())
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
})

test('the close button is named in the nearest lang and follows a lang change', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-sheet label="Filtres" open>Bonjour</c2-sheet></div>')
  await expect(page.getByRole('button', { name: 'Fermer', exact: true })).toBeVisible()
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'vi'))
  await expect(page.getByRole('button', { name: 'Đóng', exact: true })).toBeVisible()
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'de'))
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
})

test("the body takes the scrollbar variables, a page's own scrollbar styles not reaching into the shadow root", async ({
  page,
  renderScenario,
  browserName,
}) => {
  await renderScenario('<c2-sheet label="Long" open><div style="height: 3000px">Long content</div></c2-sheet>')
  const body = page.locator('c2-sheet .c2-sheet__body')
  // Playwright's Firefox hides every scrollbar (scrollbar-width computes to none even inline), so only the other browsers check the width.
  const width = (expected: string) => (browserName === 'firefox' ? 'none' : expected)
  const scrollbar = () =>
    body.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.getPropertyValue('scrollbar-width'), color: style.getPropertyValue('scrollbar-color') }
    })
  expect((await scrollbar()).width).toBe(width('thin'))
  await page.locator('c2-sheet').evaluate((element) => {
    element.style.setProperty('--c2-sheet__body__scrollbar--width', 'auto')
    element.style.setProperty('--c2-sheet__body__scrollbar__thumb--color', 'rgb(255, 0, 0)')
    element.style.setProperty('--c2-sheet__body__scrollbar__thumb__hover--color', 'rgb(0, 128, 0)')
    element.style.setProperty('--c2-sheet__body__scrollbar__track--color', 'rgb(0, 0, 255)')
  })
  expect(await scrollbar()).toEqual({ width: width('auto'), color: 'rgb(255, 0, 0) rgb(0, 0, 255)' })
  await body.hover()
  expect((await scrollbar()).color).toBe('rgb(0, 128, 0) rgb(0, 0, 255)')
})

/** Presses at `from` and drags by `dy` (then `back`) in steps, the way a finger or a mouse would. */
async function drag(page: import('@playwright/test').Page, from: { x: number; y: number }, dy: number, back = 0) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, from.y + dy, { steps: 8 })
  if (back) await page.mouse.move(from.x, from.y + dy - back, { steps: 4 })
  await page.mouse.up()
}

async function center(locator: import('@playwright/test').Locator) {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('swipe-close: dragging a bottom sheet down by its header closes it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet side="bottom" swipe-close open style="--c2-sheet--size: 300px"><h2 slot="title">Share</h2>Body</c2-sheet>')
  const host = page.locator('c2-sheet')
  await watch(host, 'close')
  await panel(page)
  await drag(page, await center(page.locator('[part="header"]')), 160)
  await expect(host).toHaveJSProperty('open', false)
  await expect(host).toHaveAttribute('data-events', '[{"returnValue":""}]')
})

test('swipe-close: a short drag that is pulled back springs the sheet back into place', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet side="bottom" swipe-close open style="--c2-sheet--size: 300px"><h2 slot="title">Share</h2>Body</c2-sheet>')
  const before = await panel(page)
  await drag(page, await center(page.locator('[part="header"]')), 80, 20)
  await expect(page.locator('c2-sheet')).toHaveJSProperty('open', true)
  const after = await panel(page)
  expect(Math.round(after.y)).toBe(Math.round(before.y))
})

test('swipe-close: the body does not drag, and a sheet without it ignores the header', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet side="bottom" swipe-close open style="--c2-sheet--size: 300px"><h2 slot="title">Share</h2><p id="body">Body</p></c2-sheet>')
  const host = page.locator('c2-sheet')
  await panel(page)
  await drag(page, await center(page.locator('#body')), 200)
  await expect(host).toHaveJSProperty('open', true)
  await props(host, { swipeClose: false })
  await drag(page, await center(page.locator('[part="header"]')), 200)
  await expect(host).toHaveJSProperty('open', true)
})

test('swipe-close: a right sheet drags toward the right edge', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet swipe-close open><h2 slot="title">Details</h2>Body</c2-sheet>')
  await panel(page)
  const start = await center(page.locator('[part="header"]'))
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  // 150px is past 35% of the 380px panel and keeps the pointer inside the viewport, which Firefox needs to deliver it.
  await page.mouse.move(start.x + 150, start.y, { steps: 8 })
  await page.mouse.up()
  await expect(page.locator('c2-sheet')).toHaveJSProperty('open', false)
})

test('swipe-close: buttons in the header keep their press and never start a drag', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-sheet side="bottom" swipe-close open style="--c2-sheet--size: 300px"><span slot="title">Share <button id="pin">Pin</button></span>Body</c2-sheet>',
  )
  const host = page.locator('c2-sheet')
  await page.locator('#pin').evaluate((el) => el.addEventListener('click', () => el.setAttribute('data-clicked', String(Number(el.dataset.clicked ?? 0) + 1))))
  await panel(page)
  await page.locator('#pin').click()
  await expect(page.locator('#pin')).toHaveAttribute('data-clicked', '1')
  await expect(host).toHaveJSProperty('open', true)
  // Neither a title button nor the close button is a grab area, so a drag from either leaves the sheet in place.
  await drag(page, await center(page.locator('#pin')), 200)
  await drag(page, await center(page.locator('[part="close"]')), 200)
  await expect(host).toHaveJSProperty('open', true)
  await expect(page.locator('#pin')).toHaveAttribute('data-clicked', '1')
})

test('swipe-close shows a grab handle on top and bottom sheets only, and the handle drags too', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet side="bottom" swipe-close hide-close open label="Share" style="--c2-sheet--size: 300px">Body</c2-sheet>')
  const host = page.locator('c2-sheet')
  const handle = page.locator('[part="handle"]')
  await expect(handle).toBeVisible()
  await accessible(page)
  await props(host, { side: 'right' })
  await expect(handle).toHaveCount(0)
  await props(host, { side: 'top' })
  await expect(handle).toBeVisible()
  await props(host, { side: 'bottom', swipeClose: false })
  await expect(handle).toHaveCount(0)
  await props(host, { swipeClose: true })
  await panel(page)
  await drag(page, await center(handle), 200)
  await expect(host).toHaveJSProperty('open', false)
})

test('size auto fits a bottom sheet to its content, up to max-size, past which the body scrolls', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-sheet side="bottom" open label="Actions" style="--c2-sheet--size: auto"><div id="content" style="height: 100px">Short</div></c2-sheet>',
  )
  const short = await panel(page)
  expect(short.height).toBeLessThan(250)
  expect(short.height).toBeGreaterThan(100)
  expect(Math.round(short.y + short.height)).toBe(short.viewport.height)

  await page.locator('#content').evaluate((el) => (el.style.height = '3000px'))
  const tall = await panel(page)
  expect(Math.round(tall.height)).toBe(tall.viewport.height)
  const body = page.locator('c2-sheet .c2-sheet__body')
  expect(await body.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)

  await page.locator('c2-sheet').evaluate((el) => el.style.setProperty('--c2-sheet--max-size', '50dvh'))
  const capped = await panel(page)
  expect(Math.round(capped.height)).toBe(Math.round(capped.viewport.height / 2))
  expect(Math.round(capped.y + capped.height)).toBe(capped.viewport.height)
})

test("swipe-close: a part named header inside the body is not the sheet's header", async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-sheet side="bottom" swipe-close open style="--c2-sheet--size: 300px"><h2 slot="title">Share</h2><div id="card" part="header">Card header</div></c2-sheet>',
  )
  await panel(page)
  await drag(page, await center(page.locator('#card')), 200)
  await expect(page.locator('c2-sheet')).toHaveJSProperty('open', true)
})

test('swipe-close: the handle never covers the footer of a top sheet or the body of a headerless bottom sheet', async ({ page, renderScenario }) => {
  await renderScenario('<c2-sheet side="top" swipe-close open label="Notice" style="--c2-sheet--size: 300px">Body<button slot="footer">OK</button></c2-sheet>')
  const handle = page.locator('[part="handle"]')
  await panel(page)
  const footer = (await page.locator('[part="footer"]').boundingBox())!
  expect((await handle.boundingBox())!.y).toBeGreaterThanOrEqual(footer.y + footer.height - 1)

  await props(page.locator('c2-sheet'), { side: 'bottom', hideClose: true })
  await panel(page)
  const body = (await page.locator('[part="body"]').boundingBox())!
  const box = (await handle.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(body.y + 1)
})
