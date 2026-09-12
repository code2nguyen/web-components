import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const trigger = '<button class="trigger" slot="trigger">Actions</button>'

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

  await page.getByRole('menuitem', { name: 'Open' }).click()
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
  await expect(page.getByRole('menuitem', { name: 'New file' })).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Open' })).toBeFocused()

  // Save is disabled, so ArrowDown skips it and lands on the last row; ArrowDown again wraps to the first.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'New file' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('menuitem', { name: 'New file' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"delete","checked":false}]')
})

test('ArrowUp opens the menu on the last row', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowUp')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
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
  await expect(page.getByRole('menuitem', { name: 'New file' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('menu')).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Actions' })).toBeFocused()
})

test('typing a letter jumps to the matching row', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'New file' })).toBeFocused()
  await page.keyboard.press('d')
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused()
})

test('typing a second letter narrows the match instead of starting over', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menu aria-label="Sort">
    ${trigger}
    <c2-menu-item value="open">Open</c2-menu-item>
    <c2-menu-item value="order">Order by</c2-menu-item>
  </c2-menu>`)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Open' })).toBeFocused()
  await page.keyboard.press('o')
  await expect(page.getByRole('menuitem', { name: 'Order by' })).toBeFocused()
  // Still inside the typeahead window, so the presses accumulate into "or" rather than cycling on "r".
  await page.keyboard.press('r')
  await expect(page.getByRole('menuitem', { name: 'Order by' })).toBeFocused()
})

test('a disabled row reports nothing and leaves the menu open', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  const host = page.locator('c2-menu')
  await watch(host, 'menu-select')
  await page.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Save' }).click({ force: true })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[]')
  await expect(page.getByRole('menuitem', { name: 'Save' })).toHaveAttribute('aria-disabled', 'true')
})

test('separators and headings stay out of the menu semantics', async ({ page, renderScenario }) => {
  await renderScenario(commands)
  await page.getByRole('button', { name: 'Actions' }).click()
  await expect(page.getByRole('menuitem')).toHaveCount(4)
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

  const sidebar = page.getByRole('menuitemcheckbox', { name: 'Sidebar' })
  const terminal = page.getByRole('menuitemcheckbox', { name: 'Terminal' })
  await expect(sidebar).toHaveAttribute('aria-checked', 'true')
  await expect(terminal).toHaveAttribute('aria-checked', 'false')

  await terminal.click()
  await expect(terminal).toHaveAttribute('aria-checked', 'true')
  await sidebar.click()
  await expect(sidebar).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"terminal","checked":true},{"value":"sidebar","checked":false}]')
  await accessible(page)
})

test('picking a radio row unchecks the rest of its group', async ({ page, renderScenario }) => {
  await renderScenario(checkables)
  await page.getByRole('button', { name: 'Actions' }).click()
  const comfortable = page.getByRole('menuitemradio', { name: 'Comfortable' })
  const compact = page.getByRole('menuitemradio', { name: 'Compact' })

  await compact.click()
  await expect(compact).toHaveAttribute('aria-checked', 'true')
  await expect(comfortable).toHaveAttribute('aria-checked', 'false')

  // Picking the row again keeps it checked rather than clearing the group.
  await compact.click()
  await expect(compact).toHaveAttribute('aria-checked', 'true')
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

  const parentRow = page.getByRole('menuitem', { name: 'Invite people' })
  await expect(parentRow).toHaveAttribute('aria-haspopup', 'menu')
  await expect(parentRow).toHaveAttribute('aria-expanded', 'false')

  await parentRow.hover()
  await expect(page.getByRole('menu', { name: 'Invite' })).toBeVisible()
  await expect(parentRow).toHaveAttribute('aria-expanded', 'true')
  await accessible(page)

  await page.getByRole('menuitem', { name: 'By Slack' }).click()
  await expect(page.getByRole('menu', { name: 'Invite' })).not.toBeVisible()
  await expect(page.getByRole('menu', { name: 'Share' })).not.toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"slack","checked":false}]')
})

test('hovering another row closes an open submenu', async ({ page, renderScenario }) => {
  await renderScenario(submenu)
  await page.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('menuitem', { name: 'Invite people' }).hover()
  await expect(page.getByRole('menu', { name: 'Invite' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Copy link' }).hover()
  await expect(page.getByRole('menu', { name: 'Invite' })).not.toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Invite people' })).toHaveAttribute('aria-expanded', 'false')
})

test('ArrowRight enters a submenu and ArrowLeft returns to its row', async ({ page, renderScenario }) => {
  await renderScenario(submenu)
  await page.getByRole('button', { name: 'Actions' }).press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Copy link' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'Invite people' })).toBeFocused()

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('menuitem', { name: 'By email' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitem', { name: 'By Slack' })).toBeFocused()

  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('menu', { name: 'Invite' })).not.toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Invite people' })).toBeFocused()
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
  await expect(page.getByRole('menuitem', { name: 'Documentation' })).toBeFocused()
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

  await page.getByRole('menuitem', { name: 'Remove' }).click()
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
