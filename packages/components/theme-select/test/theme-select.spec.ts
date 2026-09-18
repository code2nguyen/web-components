import { test, expect } from './fixture'

test('click advances through the modes, wrapping around', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario()
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await subject.click()
  await expect(page.getByRole('button', { name: 'Theme: Light', exact: true })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('1 light light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('2 dark dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Theme: Dark', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('3 system light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('remembers the chosen mode in localStorage and restores it on load', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario()
  await page.getByRole('button', { name: 'Theme: System', exact: true }).click()
  await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('c2n-theme'))).toBe('dark')

  await scenario('restored')
  await expect(page.getByRole('button', { name: 'Theme: Dark', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('follows the OS preference live while the system mode is selected', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  // The first resolution is state, not a change, so it is not reported.
  await expect(page.getByRole('status')).toHaveText('0')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  // The scheme in effect moved without the mode moving; nothing else on the page could see that.
  await expect(page.getByRole('status')).toHaveText('1 system dark')

  // Once an explicit mode is picked the OS preference no longer moves the page or reports anything.
  await page.getByRole('button', { name: 'Theme: System', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('status')).toHaveText('2 light light')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.getByRole('status')).toHaveText('2 light light')
})

test('opens the menu on hover and selecting a row switches to that mode', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario()
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).toHaveAttribute('aria-expanded', 'false')

  await subject.hover()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await expect(subject).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(menu).toBeHidden()
  await expect(page.getByRole('button', { name: 'Theme: Dark', exact: true })).toBeFocused()
  await expect(page.getByRole('status')).toHaveText('1 dark dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('the menu closes when the pointer leaves and when a press lands outside', async ({ page, scenario }) => {
  await scenario()
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await subject.hover()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  await page.getByRole('button', { name: 'After', exact: true }).hover()
  await expect(menu).toBeHidden()

  await subject.hover()
  await expect(menu).toBeVisible()
  await page.mouse.click(5, 300)
  await expect(menu).toBeHidden()
})

test('the menu survives a slow trip across the gap and back onto the trigger', async ({ page, scenario }) => {
  await scenario()
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await subject.hover()
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()

  // Crossing the offset between the trigger and the menu one pixel at a time leaves the component, which is what
  // a real slow hand does; the menu has to still be there when the pointer arrives.
  const row = page.getByRole('menuitemradio', { name: 'Dark' })
  const start = (await subject.boundingBox())!
  const target = (await row.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 24 })
  await page.waitForTimeout(400)
  await expect(menu).toBeVisible()

  // And back the other way: the pointer is on the trigger, so leaving the menu must not close it either.
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2, { steps: 24 })
  await page.waitForTimeout(400)
  await expect(menu).toBeVisible()

  await row.click()
  await expect(page.getByRole('status')).toHaveText('1 dark dark')
})

test('click keeps advancing while the menu is open', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Theme: System', exact: true }).hover()
  await expect(page.getByRole('menu')).toBeVisible()

  await page.getByRole('button', { name: 'Theme: System', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Theme: Light', exact: true })).toBeVisible()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'Light' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveAttribute('aria-checked', 'false')
})

test('two modes are a plain toggle with no menu', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario('two-modes')
  const subject = page.getByRole('button', { name: 'Theme: Light', exact: true })
  await expect(subject).not.toHaveAttribute('aria-haspopup')
  await subject.hover()
  await expect(page.getByRole('menu')).toHaveCount(0)

  await subject.click()
  await expect(page.getByRole('status')).toHaveText('1 dark dark')
  await page.getByRole('button', { name: 'Theme: Dark', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('2 light light')
})

test('menu="always" offers the dropdown for two modes and menu="never" withholds it for three', async ({ page, scenario }) => {
  await scenario('menu-always')
  await page.getByRole('button', { name: 'Theme: Light', exact: true }).hover()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitemradio')).toHaveCount(2)

  await scenario('menu-never')
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).not.toHaveAttribute('aria-haspopup')
  await subject.hover()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await subject.click()
  await expect(page.getByRole('status')).toHaveText('1 light light')
})

test('opens with ArrowDown, walks the rows and returns focus on Escape', async ({ page, scenario, tab }) => {
  await scenario()
  await page.getByRole('button', { name: 'Before', exact: true }).focus()
  await tab()
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'Light' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(subject).toBeFocused()

  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(page.getByRole('status')).toHaveText('1 dark dark')
})

test('keeps the rows out of the tab order and closes on Tab', async ({ page, scenario, tab }) => {
  await scenario()
  await page.getByRole('button', { name: 'Before', exact: true }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Theme: System', exact: true })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After', exact: true })).toBeFocused()

  await page.getByRole('button', { name: 'Theme: System', exact: true }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toBeFocused()
  await tab()
  await expect(page.getByRole('menu')).toBeHidden()
})

test('disabled blocks the click and the menu', async ({ page, scenario }) => {
  await scenario('disabled')
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).toBeDisabled()
  const bounds = await subject.boundingBox()
  if (!bounds) throw new Error('Trigger has no bounds')
  // Real pointer input: locator.click() would wait for a disabled button to enable.
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(page.getByRole('menu')).toBeHidden()
  await expect(page.getByRole('status')).toHaveText('0')
})

test('manual leaves the document and storage alone but still reports the change', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario('manual')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  await page.getByRole('button', { name: 'Theme: System', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('1 light light')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('c2n-theme'))).toBeNull()
})

test('target scopes the scheme to another element', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await scenario('scoped')
  const scoped = page.locator('#scoped')
  await expect(scoped).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/)
  await page.getByRole('button', { name: 'Theme: System', exact: true }).click()
  await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
  await expect(scoped).toHaveAttribute('data-theme', 'dark')
})

test('custom modes carry their own labels and schemes', async ({ page, scenario }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await scenario('custom')
  const subject = page.getByRole('button', { name: 'Theme: Follow system', exact: true })
  await expect(subject).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await subject.hover()
  await expect(page.getByRole('menuitemradio')).toHaveText(['Follow system', 'Daylight', 'Sepia', 'Midnight'])
  await page.getByRole('menuitemradio', { name: 'Sepia' }).click()
  await expect(page.getByRole('status')).toHaveText('1 sepia light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('a slotted per-mode icon shows in the trigger and in its own menu row', async ({ page, scenario }) => {
  await scenario('slotted-icons')
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  // The slot itself is assigned in a hidden source; what is visible in each place is a clone of it.
  await expect(page.locator('[part="trigger"] [data-testid="icon-system"]')).toBeVisible()

  await subject.hover()
  await expect(page.getByRole('menu')).toBeVisible()
  for (const mode of ['system', 'light', 'dark']) {
    await expect(page.locator(`[part="menu-item"] [data-testid="icon-${mode}"]`)).toBeVisible()
  }
  await expect(page.getByRole('menuitemradio')).toHaveText(['System', 'Light', 'Dark'])

  await page.getByRole('menuitemradio', { name: 'Dark' }).click()
  await expect(page.locator('[part="trigger"] [data-testid="icon-dark"]')).toBeVisible()
  await expect(page.locator('[part="trigger"] [data-testid="icon-system"]')).toHaveCount(0)
})

test('every menu row carries the icon of its mode', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Theme: System', exact: true }).hover()
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.locator('[part="menu-item"] [part="icon"] svg')).toHaveCount(3)
})

test('the trigger and the menu take their look from the component variables', async ({ page, scenario }) => {
  await scenario('themed')
  const subject = page.getByRole('button', { name: 'Theme: System', exact: true })
  await expect(subject).toHaveCSS('height', '44px')
  await expect(subject).toHaveCSS('border-radius', '22px')
  await expect(subject).toHaveCSS('background-color', 'rgb(20, 30, 40)')
  await subject.hover()
  await expect(page.getByRole('menu')).toHaveCSS('background-color', 'rgb(20, 30, 40)')
  await expect(page.getByRole('menuitemradio', { name: 'System' })).toHaveCSS('color', 'rgb(120, 200, 255)')
})
