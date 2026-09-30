import type { Locator, Page } from '@playwright/test'
import type { ContextMenu } from '../src/context-menu'
import type { Table } from '../../table/src/table'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const item = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)

const staticMenu = `<c2-context-menu>
  <div class="area" tabindex="0">Canvas</div>
  <c2-menu slot="menu" aria-label="Canvas actions">
    <c2-menu-item value="zoom-in">Zoom in</c2-menu-item>
    <c2-menu-item value="zoom-out">Zoom out</c2-menu-item>
    <hr />
    <c2-menu-item value="reset">Reset view</c2-menu-item>
  </c2-menu>
</c2-context-menu>
<button class="outside">Outside</button>`

async function rightClick(locator: Locator, offset = { x: 40, y: 30 }) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible target')
  const x = box.x + offset.x
  const y = box.y + offset.y
  await locator.page().mouse.click(x, y, { button: 'right' })
  return { x, y }
}

/** Records whether the page's own `contextmenu` listener saw the browser menu suppressed. */
async function watchNativeMenu(page: Page) {
  await page.evaluate(() => {
    document.documentElement.dataset.nativeMenus = '0'
    window.addEventListener('contextmenu', (event) => {
      if (!event.defaultPrevented) document.documentElement.dataset.nativeMenus = String(Number(document.documentElement.dataset.nativeMenus) + 1)
    })
  })
}

/** Fires the pointer sequence of a finger resting on `locator`; Playwright's touchscreen can only tap. */
async function touchDown(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible target')
  const x = box.x + 40
  const y = box.y + 30
  await locator.evaluate(
    (element, point) => {
      const init = { bubbles: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y }
      element.dispatchEvent(new PointerEvent('pointerdown', init))
    },
    { x, y },
  )
  return { x, y }
}

async function touchEvent(page: Page, type: string, point: { x: number; y: number }) {
  await page.evaluate(
    ({ type, point }) => {
      const init = { bubbles: true, composed: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: point.x, clientY: point.y }
      document.querySelector('.area')!.dispatchEvent(new PointerEvent(type, init))
    },
    { type, point },
  )
}

test('a right click on the content opens the slotted menu at the pointer and a row reports its value with the context', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  await watchNativeMenu(page)
  const host = page.locator('c2-context-menu')
  await watch(host, 'context-menu-select')

  const point = await rightClick(page.locator('.area'))
  const menu = page.getByRole('menu', { name: 'Canvas actions' })
  await expect(menu).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-native-menus', '0')
  await expect(item(page, 'zoom-in')).toBeFocused()

  const box = (await menu.boundingBox())!
  expect(Math.abs(box.x - point.x)).toBeLessThanOrEqual(2)
  expect(Math.abs(box.y - point.y)).toBeLessThanOrEqual(2)
  await expect.poll(() => host.evaluate((element: ContextMenu) => element.open)).toBe(true)

  await item(page, 'zoom-out').click()
  await expect(menu).toBeHidden()
  await expect.poll(() => host.evaluate((element: ContextMenu) => element.open)).toBe(false)
  const events = JSON.parse((await host.getAttribute('data-events'))!)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ value: 'zoom-out', checked: false, context: { trigger: 'pointer', x: point.x, y: point.y } })
})

test('a second right click moves the open menu to the new point', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  await rightClick(page.locator('.area'), { x: 20, y: 20 })
  const menu = page.getByRole('menu', { name: 'Canvas actions' })
  await expect(menu).toBeVisible()

  const point = await rightClick(page.locator('.area'), { x: 200, y: 100 })
  await expect.poll(async () => Math.round((await menu.boundingBox())?.x ?? 0)).toBe(Math.round(point.x))
  await expect(menu).toBeVisible()
  await expect.poll(async () => Math.round((await menu.boundingBox())?.y ?? 0)).toBe(Math.round(point.y))
})

test('only the slotted content opens the menu; the menu and the rest of the page keep their own behaviour', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  await watchNativeMenu(page)

  await rightClick(page.locator('.outside'), { x: 4, y: 4 })
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeHidden()
  await expect(page.locator('html')).toHaveAttribute('data-native-menus', '1')

  await rightClick(page.locator('.area'))
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeVisible()
  // A right click on the open menu gets no browser menu on top of it and does not move it.
  await rightClick(item(page, 'reset'), { x: 10, y: 10 })
  await expect(page.locator('html')).toHaveAttribute('data-native-menus', '1')
})

test('renderContextMenu builds the rows for the element that was clicked', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-context-menu menu-label="File actions">
    <ul class="area">
      <li data-file="report.pdf">report.pdf</li>
      <li data-file="notes.txt">notes.txt</li>
    </ul>
  </c2-context-menu>`)
  const host = page.locator('c2-context-menu')
  await host.evaluate((element: ContextMenu) => {
    element.renderContextMenu = ({ target }) => {
      const file = (target.closest('[data-file]') as HTMLElement | null)?.dataset.file
      if (!file) return null
      const row = (value: string, label: string) => Object.assign(document.createElement('c2-menu-item'), { value, label })
      return [row('open', `Open ${file}`), row('delete', `Delete ${file}`)]
    }
  })
  await watch(host, 'context-menu-select')

  await rightClick(page.getByText('notes.txt'), { x: 10, y: 8 })
  await expect(page.getByRole('menu', { name: 'File actions' })).toBeVisible()
  await expect(item(page, 'open')).toHaveText('Open notes.txt')

  await rightClick(page.getByText('report.pdf'), { x: 10, y: 8 })
  await expect(item(page, 'open')).toHaveText('Open report.pdf')
  await item(page, 'delete').click()
  await expect(page.getByRole('menu', { name: 'File actions' })).toBeHidden()
  expect(JSON.parse((await host.getAttribute('data-events'))!)).toMatchObject([{ value: 'delete' }])
})

test('an empty render falls back to the slotted menu, and with neither the browser menu shows', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  await watchNativeMenu(page)
  const host = page.locator('c2-context-menu')
  await host.evaluate((element: ContextMenu) => (element.renderContextMenu = () => null))

  await rightClick(page.locator('.area'))
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeHidden()

  await page.locator('c2-menu[slot="menu"]').evaluate((menu) => menu.remove())
  await rightClick(page.locator('.area'))
  await expect(page.locator('html')).toHaveAttribute('data-native-menus', '1')
})

test('a wrapped table hands the right-clicked cell to renderContextMenu', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-context-menu menu-label="Cell actions">
    <c2-table row-key="symbol" aria-label="Quotes">
      <c2-table-column field="symbol" header="Symbol"></c2-table-column>
      <c2-table-column field="price" header="Price"></c2-table-column>
    </c2-table>
  </c2-context-menu>`)
  const host = page.locator('c2-context-menu')
  await page.locator('c2-table').evaluate(async (table: Table) => {
    table.rows = [
      { symbol: 'AAPL', price: 190 },
      { symbol: 'MSFT', price: 410 },
    ]
    await table.updateComplete
  })
  await host.evaluate((element: ContextMenu) => {
    element.renderContextMenu = ({ data, source }) => {
      if (source?.localName !== 'c2-table') return null
      const cell = data as { key: string; value: unknown; column: { field: string } }
      return Object.assign(document.createElement('c2-menu-item'), { value: 'copy', label: `Copy ${cell.column.field} of ${cell.key}: ${cell.value}` })
    }
  })
  await host.evaluate((element: ContextMenu) =>
    element.addEventListener('context-menu-select', ({ detail }) => {
      const { key, value, rowIndex } = detail.context.data as { key: string; value: unknown; rowIndex: number }
      element.dataset.selected = JSON.stringify({ value: detail.value, key, cell: value, rowIndex, source: detail.context.source?.localName })
    }),
  )

  await rightClick(page.getByRole('gridcell', { name: '410' }), { x: 8, y: 8 })
  await expect(item(page, 'copy')).toHaveText('Copy price of MSFT: 410')
  await expect(item(page, 'copy')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu', { name: 'Cell actions' })).toBeHidden()
  expect(JSON.parse((await host.getAttribute('data-selected'))!)).toEqual({ value: 'copy', key: 'MSFT', cell: 410, rowIndex: 1, source: 'c2-table' })
  // Focus returns to the cell the menu was opened on.
  await expect(page.getByRole('gridcell', { name: '410' })).toBeFocused()
})

test('Shift+F10 opens the menu under the focused element and Escape returns focus to it', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  const host = page.locator('c2-context-menu')
  await watch(host, 'context-menu-open')
  await page.locator('.area').focus()

  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu', { name: 'Canvas actions' })
  await expect(menu).toBeVisible()
  await expect(item(page, 'zoom-in')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(item(page, 'zoom-out')).toBeFocused()
  const area = (await page.locator('.area').boundingBox())!
  const box = (await menu.boundingBox())!
  expect(Math.abs(box.y - (area.y + area.height))).toBeLessThanOrEqual(2)
  expect(JSON.parse((await host.getAttribute('data-events'))!)).toMatchObject([{ trigger: 'keyboard' }])

  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(page.locator('.area')).toBeFocused()
})

test('a long press opens the menu and swallows the click the lifted finger produces', async ({ page, renderScenario }) => {
  await page.clock.install()
  await renderScenario(staticMenu)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const host = page.locator('c2-context-menu')
  await watch(host, 'context-menu-open')
  await page.locator('.area').evaluate((area) => {
    area.dataset.clicks = '0'
    area.addEventListener('click', () => (area.dataset.clicks = String(Number(area.dataset.clicks) + 1)))
  })

  const point = await touchDown(page.locator('.area'))
  await page.clock.runFor(499)
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeHidden()
  await page.clock.runFor(1)
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeVisible()
  await touchEvent(page, 'pointerup', point)
  await page.locator('.area').evaluate((area) => area.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true })))
  await expect(page.locator('.area')).toHaveAttribute('data-clicks', '0')
  expect(JSON.parse((await host.getAttribute('data-events'))!)).toMatchObject([{ trigger: 'touch', x: point.x, y: point.y }])

  // The browser also reports the long press as a `contextmenu`: it is the same gesture, not a second opening.
  await page
    .locator('.area')
    .evaluate(
      (area, p) => area.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: p.x + 50, clientY: p.y })),
      point,
    )
  expect(JSON.parse((await host.getAttribute('data-events'))!)).toHaveLength(1)
})

test('a finger that moves or lifts early is a scroll or a tap, not a long press', async ({ page, renderScenario }) => {
  await page.clock.install()
  await renderScenario(staticMenu)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000))
  const host = page.locator('c2-context-menu')
  await watch(host, 'context-menu-open')

  const point = await touchDown(page.locator('.area'))
  await touchEvent(page, 'pointermove', { x: point.x, y: point.y + 30 })
  const second = await touchDown(page.locator('.area'))
  await touchEvent(page, 'pointerup', second)
  await page.clock.runFor(1000)
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeHidden()
  await expect(host).toHaveAttribute('data-events', '[]')
})

test('disabled, cancelled or already-handled requests let the browser menu through', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  await watchNativeMenu(page)
  const host = page.locator('c2-context-menu')
  const menu = page.getByRole('menu', { name: 'Canvas actions' })

  await host.evaluate((element: ContextMenu) => (element.disabled = true))
  await rightClick(page.locator('.area'))
  await expect(page.locator('html')).toHaveAttribute('data-native-menus', '1')
  await expect(menu).toBeHidden()

  await host.evaluate((element: ContextMenu) => {
    element.disabled = false
    element.addEventListener('context-menu-open', (event) => event.preventDefault(), { once: true })
  })
  await rightClick(page.locator('.area'))
  await expect(page.locator('html')).toHaveAttribute('data-native-menus', '2')
  await expect(menu).toBeHidden()

  await rightClick(page.locator('.area'))
  await expect(menu).toBeVisible()
})

test('a nested context menu wins over the one around it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-context-menu class="outer">
    <div class="panel">
      <c2-context-menu class="inner">
        <div class="area">Chart</div>
        <c2-menu slot="menu" aria-label="Chart actions"><c2-menu-item value="export">Export</c2-menu-item></c2-menu>
      </c2-context-menu>
    </div>
    <c2-menu slot="menu" aria-label="Panel actions"><c2-menu-item value="close">Close</c2-menu-item></c2-menu>
  </c2-context-menu>`)
  await rightClick(page.locator('.area'))
  await expect(page.getByRole('menu', { name: 'Chart actions' })).toBeVisible()
  await expect(page.getByRole('menu', { name: 'Panel actions' })).toBeHidden()
})

test('show() opens the menu from code', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  const opened = await page.locator('c2-context-menu').evaluate((element: ContextMenu) => element.show(120, 90))
  expect(opened).toBe(true)
  const menu = page.getByRole('menu', { name: 'Canvas actions' })
  await expect(menu).toBeVisible()
  await expect.poll(async () => Math.round((await menu.boundingBox())?.x ?? 0)).toBe(120)
  await page.locator('c2-context-menu').evaluate((element: ContextMenu) => element.hide())
  await expect(menu).toBeHidden()
})

test('the open menu has no accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario(staticMenu)
  await rightClick(page.locator('.area'))
  await expect(page.getByRole('menu', { name: 'Canvas actions' })).toBeVisible()
  await accessible(page)
})
