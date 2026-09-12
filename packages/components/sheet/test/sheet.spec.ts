import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

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
