import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

// Rows state their role and aria-* through ElementInternals, which getByRole cannot see, so they are found by value.
const row = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)

test('item description presence reconciles initially and after later mutations', async ({ page, renderScenario }) => {
  const description = page.locator('c2-menu-item').locator('.description')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-menu-item value="save"><span slot="description" data-slot-presence-probe>Writes changes</span></c2-menu-item>',
    host: 'c2-menu-item',
    slot: 'description',
    assertPresent: async (present) => (present ? expect(description).toBeVisible() : expect(description).toBeHidden()),
  })
})

const trigger = '<button class="trigger" slot="trigger">Actions</button>'

test('initial trigger and item discovery do not schedule a second Lit update', async ({ page, renderScenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('c2-menu scheduled an update')) warnings.push(message.text())
  })
  await renderScenario(`<c2-menu>${trigger}<c2-menu-item>Open</c2-menu-item></c2-menu>`)
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible()
  expect(warnings).toEqual([])
})

test('consumer-owned trigger, command, submenu, and adornment slots remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-menu><button class="slot-probe" slot="trigger">Open</button><c2-menu-item><span class="slot-probe">Command</span><span class="slot-probe" slot="description">Description</span><span class="slot-probe" slot="prefix-icon">P</span><span class="slot-probe" slot="shortcut">⌘K</span><span class="slot-probe" slot="suffix-icon">S</span><c2-menu class="slot-probe" slot="submenu"></c2-menu></c2-menu-item></c2-menu>',
  )
  await page.locator('.slot-probe').evaluateAll((nodes) => nodes.forEach((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)')))
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.color)))
    .toEqual(Array(7).fill('rgb(1, 2, 3)'))
})

const commands = `<c2-menu aria-label="File actions">
  ${trigger}
  <h3>File</h3>
  <c2-menu-item value="new">New file</c2-menu-item>
  <c2-menu-item value="open">Open</c2-menu-item>
  <c2-menu-item value="save" disabled>Save</c2-menu-item>
  <hr />
  <c2-menu-item value="delete" destructive>Delete</c2-menu-item>
</c2-menu>`

test('the trigger opens the menu and a row reports its value and closes it', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')

  await expect(page.getByRole('button', { name: 'Actions' })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Actions' }).click()
  await expect(page.getByRole('menu', { name: 'File actions' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Actions' })).toHaveAttribute('aria-expanded', 'true')

  await expect(row(page, 'open')).toHaveHostAria('role', 'menuitem')
  await row(page, 'open').click()
  await expect(page.getByRole('menu', { name: 'File actions' })).not.toBeVisible()
  await expect(host).toHaveJSProperty('open', false)
  await expect(host).toHaveAttribute('data-events', '[{"value":"open","checked":false}]')
})

test('a second press on the trigger closes the open menu', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  const button = page.getByRole('button', { name: 'Actions' })
  await button.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await button.click()
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(page.locator('c2-menu')).toHaveJSProperty('open', false)
})

test('placement and offsets are forwarded to the positioning overlay', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu placement="right-end" offset="20" cross-offset="-6" aria-label="Positioned">
    ${trigger}
    <c2-menu-item value="one">First row</c2-menu-item>
  </c2-menu>`)

  const positioning = await page.locator('c2-menu').evaluate((element) => {
    const overlay = element.shadowRoot?.querySelector('c2-overlay') as HTMLElement & {
      placement?: string
      offset?: number
      crossOffset?: number
    }
    return { placement: overlay.placement, offset: overlay.offset, crossOffset: overlay.crossOffset }
  })

  expect(positioning).toEqual({ placement: 'right-end', offset: 20, crossOffset: -6 })
})

test('a click outside dismisses the menu', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(page.getByRole('menu')).not.toBeVisible()
  // The press landed on nothing focusable, so the trigger keeps the user's place.
  await expect(page.getByRole('button', { name: 'Actions' })).toBeFocused()
})

test('the keyboard opens, walks the enabled rows and activates one', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')

  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(row(page, 'new')).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'open')).toBeFocused()

  // Save is disabled, so ArrowDown skips it and lands on the last row; ArrowDown again wraps to the first.
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'delete')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'new')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 'delete')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(row(page, 'new')).toBeFocused()
  await page.keyboard.press('End')
  await expect(row(page, 'delete')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"delete","checked":false}]')
})

test('ArrowUp opens the menu on the last row', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowUp')
  await expect(row(page, 'delete')).toBeFocused()
})

test('Escape closes the menu and returns focus to the trigger', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Actions' })).toBeFocused()
})

test('Tab closes the menu instead of walking into it', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).press('Enter')
  await expect(row(page, 'new')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Actions' })).toBeFocused()
})

test('typing a letter jumps to the matching row', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(row(page, 'new')).toBeFocused()
  await page.keyboard.press('d')
  await expect(row(page, 'delete')).toBeFocused()
})

test('typing a second letter narrows the match instead of starting over', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Sort">
    ${trigger}
    <c2-menu-item value="open">Open</c2-menu-item>
    <c2-menu-item value="order">Order by</c2-menu-item>
  </c2-menu>`)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(row(page, 'open')).toBeFocused()
  await page.keyboard.press('o')
  await expect(row(page, 'order')).toBeFocused()
  // Still inside the typeahead window, so the presses accumulate into "or" rather than cycling on "r".
  await page.keyboard.press('r')
  await expect(row(page, 'order')).toBeFocused()
})

test('a disabled row reports nothing and leaves the menu open', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')
  await page.getByRole('button', { name: 'Actions' }).click()
  await row(page, 'save').click({ force: true })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[]')
  await expect(row(page, 'save')).toHaveHostAria('aria-disabled', 'true')
})

test('separators and headings stay out of the menu semantics', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).click()
  const rows = page.locator('c2-menu-item')
  await expect(rows).toHaveCount(4)
  for (const item of await rows.all()) await expect(item).toHaveHostAria('role', 'menuitem')
  await expect(page.locator('c2-menu h3')).toHaveAttribute('role', 'presentation')
  await expect(page.getByRole('separator')).toHaveCount(1)
  await accessible(page)
})

const checkables = `<c2-menu aria-label="View" keep-open>
  ${trigger}
  <c2-menu-item type="checkbox" value="sidebar" checked>Sidebar</c2-menu-item>
  <c2-menu-item type="checkbox" value="terminal">Terminal</c2-menu-item>
  <hr />
  <c2-menu-item type="radio" name="density" value="comfortable" checked>Comfortable</c2-menu-item>
  <c2-menu-item type="radio" name="density" value="compact">Compact</c2-menu-item>
</c2-menu>`

test('checkbox rows toggle and keep-open leaves the menu up', async ({ page, renderScenario }) => {
  await renderScenario(checkables)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')
  await page.getByRole('button', { name: 'Actions' }).click()

  const sidebar = row(page, 'sidebar')
  const terminal = row(page, 'terminal')
  await expect(sidebar).toHaveHostAria('role', 'menuitemcheckbox')
  await expect(terminal).toHaveHostAria('role', 'menuitemcheckbox')
  await expect(sidebar).toHaveHostAria('aria-checked', 'true')
  await expect(terminal).toHaveHostAria('aria-checked', 'false')

  await terminal.click()
  await expect(terminal).toHaveHostAria('aria-checked', 'true')
  await sidebar.click()
  await expect(sidebar).toHaveHostAria('aria-checked', 'false')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"terminal","checked":true},{"value":"sidebar","checked":false}]')
  await accessible(page)
})

test('picking a radio row unchecks the rest of its group', async ({ page, renderScenario }) => {
  await renderScenario(checkables)
  await page.getByRole('button', { name: 'Actions' }).click()
  const comfortable = row(page, 'comfortable')
  const compact = row(page, 'compact')

  await expect(comfortable).toHaveHostAria('role', 'menuitemradio')
  await expect(compact).toHaveHostAria('role', 'menuitemradio')
  await compact.click()
  await expect(compact).toHaveHostAria('aria-checked', 'true')
  await expect(comfortable).toHaveHostAria('aria-checked', 'false')

  // Picking the row again keeps it checked rather than clearing the group.
  await compact.click()
  await expect(compact).toHaveHostAria('aria-checked', 'true')
})

const submenu = `<c2-menu aria-label="Share">
  ${trigger}
  <c2-menu-item value="copy-link">Copy link</c2-menu-item>
  <c2-menu-item value="invite">
    Invite people
    <c2-menu slot="submenu" aria-label="Invite">
      <c2-menu-item value="email">By email</c2-menu-item>
      <c2-menu-item value="slack">By Slack</c2-menu-item>
    </c2-menu>
  </c2-menu-item>
</c2-menu>`

test('hovering a row with a submenu opens it, and picking a nested row closes both menus', async ({ page, renderScenario }) => {
  await renderScenario(submenu)
  const host = page.locator('c2-menu[aria-label="Share"]')
  await watch(host, 'menu-select')
  await page.getByRole('button', { name: 'Actions' }).click()

  const parentRow = row(page, 'invite')
  await expect(parentRow).toHaveHostAria('aria-haspopup', 'menu')
  await expect(parentRow).toHaveHostAria('aria-expanded', 'false')

  await parentRow.hover()
  await expect(page.getByRole('menu', { name: 'Invite' })).toBeVisible()
  await expect(parentRow).toHaveHostAria('aria-expanded', 'true')
  await accessible(page)

  await row(page, 'slack').click()
  await expect(page.getByRole('menu', { name: 'Invite' })).not.toBeVisible()
  await expect(page.getByRole('menu', { name: 'Share' })).not.toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"slack","checked":false}]')
})

test('hovering another row closes an open submenu', async ({ page, renderScenario }) => {
  await renderScenario(submenu)
  await page.getByRole('button', { name: 'Actions' }).click()
  await row(page, 'invite').hover()
  await expect(page.getByRole('menu', { name: 'Invite' })).toBeVisible()
  await row(page, 'copy-link').hover()
  await expect(page.getByRole('menu', { name: 'Invite' })).not.toBeVisible()
  await expect(row(page, 'invite')).toHaveHostAria('aria-expanded', 'false')
})

test('ArrowRight enters a submenu and ArrowLeft returns to its row', async ({ page, renderScenario }) => {
  await renderScenario(submenu)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(row(page, 'copy-link')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'invite')).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'email')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'slack')).toBeFocused()

  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('menu', { name: 'Invite' })).not.toBeVisible()
  await expect(row(page, 'invite')).toBeFocused()
  await expect(page.getByRole('menu', { name: 'Share' })).toBeVisible()
})

test('an element elsewhere on the page can be the anchor', async ({ page, renderScenario }) => {
  await renderScenario(`<button class="trigger" id="remote">Open</button>
    <c2-menu anchor="remote" aria-label="Remote">
      <c2-menu-item value="one">One</c2-menu-item>
      <c2-menu-item value="two">Two</c2-menu-item>
    </c2-menu>`)
  const menu = page.getByRole('menu', { name: 'Remote' })
  await expect(menu).not.toBeVisible()

  await page.locator('c2-menu').evaluate(async (element) => {
    const menu = element as unknown as { show: () => void; updateComplete: Promise<boolean> }
    menu.show()
    await menu.updateComplete
  })
  await expect(menu).toBeVisible()

  const anchor = await page.locator('#remote').boundingBox()
  const surface = await menu.boundingBox()
  if (!anchor || !surface) throw new Error('Expected both the anchor and the surface to be laid out')
  expect(surface.y).toBeGreaterThan(anchor.y)
})

test('a link row navigates and still reports its value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Help">
    ${trigger}
    <c2-menu-item value="docs" href="#docs">Documentation</c2-menu-item>
  </c2-menu>`)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(row(page, 'docs')).toBeFocused()
  await expect(row(page, 'docs')).toHaveHostAria('role', 'menuitem')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#docs$/)
  await expect(host).toHaveAttribute('data-events', '[{"value":"docs","checked":false}]')
})

test('a c2-button trigger carries the popup semantics on the control inside it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Row actions">
    <c2-button slot="trigger">Actions</c2-button>
    <c2-menu-item value="edit">Edit</c2-menu-item>
    <c2-menu-item value="remove" destructive>Remove</c2-menu-item>
  </c2-menu>`)
  const button = page.getByRole('button', { name: 'Actions' })
  await expect(button).toHaveAttribute('aria-haspopup', 'menu')
  await expect(button).toHaveAttribute('aria-expanded', 'false')

  await button.click()
  await expect(page.getByRole('menu', { name: 'Row actions' })).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await accessible(page)

  await row(page, 'remove').click()
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(button).toBeFocused()
})

test('disabled never opens', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Off" disabled>
    ${trigger}
    <c2-menu-item value="one">One</c2-menu-item>
  </c2-menu>`)
  await page.getByRole('button', { name: 'Actions' }).click({ force: true })
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(page.locator('c2-menu')).toHaveJSProperty('open', false)
})

test('menu items state their semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Mixed" keep-open>
    ${trigger}
    <c2-menu-item value="copy">Copy</c2-menu-item>
    <c2-menu-item value="off" disabled>Off</c2-menu-item>
    <c2-menu-item type="checkbox" value="wrap">Wrap lines</c2-menu-item>
    <c2-menu-item value="more">
      More
      <c2-menu slot="submenu" aria-label="More">
        <c2-menu-item value="nested">Nested</c2-menu-item>
      </c2-menu>
    </c2-menu-item>
  </c2-menu>`)
  // Every attribute on each row must be one the markup above already carried.
  const written = () =>
    page
      .locator('c2-menu-item')
      .evaluateAll((items) => items.flatMap((item) => item.getAttributeNames().filter((name) => name === 'role' || name.startsWith('aria-'))))
  expect(await written()).toEqual([])

  await expect(row(page, 'copy')).toHaveHostAria('role', 'menuitem')
  await expect(row(page, 'copy')).toHaveHostAria('aria-checked', null)
  await expect(row(page, 'off')).toHaveHostAria('aria-disabled', 'true')
  await expect(row(page, 'wrap')).toHaveHostAria('role', 'menuitemcheckbox')
  await expect(row(page, 'wrap')).toHaveHostAria('aria-checked', 'false')
  await expect(row(page, 'more')).toHaveHostAria('aria-haspopup', 'menu')
  await expect(row(page, 'more')).toHaveHostAria('aria-expanded', 'false')

  await page.getByRole('button', { name: 'Actions' }).click()
  await row(page, 'wrap').click()
  await expect(row(page, 'wrap')).toHaveHostAria('aria-checked', 'true')
  await row(page, 'more').hover()
  await expect(page.getByRole('menu', { name: 'More' })).toBeVisible()
  await expect(row(page, 'more')).toHaveHostAria('aria-expanded', 'true')
  await expect(row(page, 'nested')).toHaveHostAria('role', 'menuitem')
  expect(await written()).toEqual([])
  await accessible(page)
})

// The menu settles its trigger, its rows and its submenus while the page upgrades, which is before React (or any
// framework) hydrates: an attribute written then is one the server never rendered. So `has-trigger` is a custom
// state, a submenu's `right-start` default is applied without writing `placement`, and `reserveIndicator` is not
// reflected onto the rows.
test('upgrading writes no attribute on the menus or their rows', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Share">
    ${trigger}
    <c2-menu-item type="checkbox" value="pin">Pin</c2-menu-item>
    <c2-menu-item value="invite">
      Invite people
      <c2-menu slot="submenu" aria-label="Invite"><c2-menu-item value="email">By email</c2-menu-item></c2-menu>
    </c2-menu-item>
  </c2-menu>
  <c2-menu aria-label="Detached" anchor="elsewhere"><c2-menu-item value="x">X</c2-menu-item></c2-menu>`)
  const root = page.locator('c2-menu[aria-label="Share"]')
  const nested = page.locator('c2-menu[aria-label="Invite"]')
  const detached = page.locator('c2-menu[aria-label="Detached"]')
  await expect.poll(() => root.evaluate((el) => el.matches(':state(has-trigger)'))).toBe(true)
  await expect(root).toHaveCSS('display', 'inline-flex')
  expect(await nested.evaluate((el) => el.matches(':state(has-trigger)'))).toBe(false)
  await expect(nested).toHaveCSS('display', 'contents')
  await expect(detached).toHaveCSS('display', 'contents')
  await expect.poll(() => row(page, 'invite').evaluate((el) => (el as HTMLElement & { reserveIndicator: boolean }).reserveIndicator)).toBe(true)

  const unauthored = await page.locator('c2-menu, c2-menu-item').evaluateAll((els) =>
    els.flatMap((el) =>
      el
        .getAttributeNames()
        .filter((name) => !['aria-label', 'slot', 'value', 'type', 'anchor', 'tabindex'].includes(name))
        .map((name) => `${el.localName}[${name}]`),
    ),
  )
  expect(unauthored).toEqual([])
  const placement = await nested.evaluate((el) => (el.shadowRoot?.querySelector('c2-overlay') as HTMLElement & { placement?: string }).placement)
  expect(placement).toBe('right-start')
})

const swatch = (value: string, label: string, checked = false) =>
  `<c2-menu-item type="radio" name="color" value="${value}" label="${label}"${checked ? ' checked' : ''}><span slot="prefix-icon" class="dot"></span></c2-menu-item>`

const withRows = `<c2-menu aria-label="Box">
  ${trigger}
  <h6>Colour</h6>
  <c2-menu-row aria-label="Colour">${swatch('red', 'Red', true)}${swatch('green', 'Green')}${swatch('blue', 'Blue')}</c2-menu-row>
  <h6>Size</h6>
  <c2-menu-row aria-label="Size">${swatch('s', 'Small').replaceAll('color', 'size')}${swatch('l', 'Large').replaceAll('color', 'size')}</c2-menu-row>
  <hr />
  <c2-menu-item value="delete">Delete</c2-menu-item>
</c2-menu>`

test('a c2-menu-row lays its choices side by side, named by their label, ringed when checked', async ({ page, renderScenario }) => {
  await renderScenario(withRows)
  await page.getByRole('button', { name: 'Actions' }).click()
  const colours = page.locator('c2-menu-row').first()
  await expect(colours).toBeVisible()
  await expect(colours).toHaveHostAria('role', 'group')
  await expect(colours).toHaveAttribute('aria-label', 'Colour')

  const [red, green] = [await row(page, 'red').boundingBox(), await row(page, 'green').boundingBox()]
  expect(Math.abs(red!.y - green!.y)).toBeLessThan(1)
  expect(green!.x).toBeGreaterThan(red!.x + red!.width - 1)

  await expect(row(page, 'green')).toHaveHostAria('label', 'Green')
  await expect(row(page, 'green')).toHaveHostAria('role', 'menuitemradio')
  // The label is the name, not text on screen; the checked choice has a ring, not a tick.
  await expect(row(page, 'green').locator('.text')).toHaveCSS('clip-path', 'inset(50%)')
  await expect(row(page, 'red').locator('.indicator')).toHaveCount(0)
  await expect(row(page, 'red').locator('.c2-menu-item')).not.toHaveCSS('outline-style', 'none')
  // Radio choices in a row do not push the labels of the plain rows along.
  await expect(row(page, 'delete').locator('.indicator')).toHaveCount(0)
})

test('the arrow keys move along a row with Left and Right, and between lines with Up and Down', async ({ page, renderScenario }) => {
  await renderScenario(withRows)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')
  await page.getByRole('button', { name: 'Actions' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'red')).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'green')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'blue')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 's')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'delete')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 's')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 'red')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'red')).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(host).toHaveAttribute('data-events', '[{"value":"green","checked":true}]')
  await expect(row(page, 'green')).toHaveJSProperty('checked', true)
  await expect(row(page, 'red')).toHaveJSProperty('checked', false)
})

test('in a menu that is one row, ArrowUp and ArrowDown step through its choices', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-menu aria-label="Colour">${trigger}<c2-menu-row aria-label="Colour">${swatch('red', 'Red')}${swatch('green', 'Green')}${swatch('blue', 'Blue')}</c2-menu-row></c2-menu>`,
  )
  await page.getByRole('button', { name: 'Actions' }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'red')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'green')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'blue')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 'green')).toBeFocused()
})
