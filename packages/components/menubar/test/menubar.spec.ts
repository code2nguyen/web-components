import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

// Rows state their role through ElementInternals, which getByRole cannot see, so they are found by value.
const row = (page: Page, value: string) => page.locator(`c2-menu-item[value="${value}"]`)
const trigger = (page: Page, label: string) => page.locator(`c2-menubar-menu[label="${label}"]`).locator('.trigger')
const events = async (page: Page) => JSON.parse((await page.locator('c2-menubar').getAttribute('data-events')) ?? '[]')

const bar = `<button>Before</button>
<c2-menubar aria-label="Editor">
  <c2-menubar-menu label="File">
    <c2-menu-item value="new">New file</c2-menu-item>
    <c2-menu-item value="open">Open…</c2-menu-item>
    <c2-menu-item value="recent">
      Open recent
      <c2-menu slot="submenu">
        <c2-menu-item value="report">report.md</c2-menu-item>
        <c2-menu-item value="notes">notes.md</c2-menu-item>
      </c2-menu>
    </c2-menu-item>
    <hr />
    <c2-menu-item value="close">Close</c2-menu-item>
  </c2-menubar-menu>
  <c2-menubar-menu label="Edit">
    <c2-menu-item value="undo">Undo</c2-menu-item>
    <c2-menu-item value="redo">Redo</c2-menu-item>
  </c2-menubar-menu>
  <c2-menubar-menu label="Selection" disabled>
    <c2-menu-item value="all">Select all</c2-menu-item>
  </c2-menubar-menu>
  <c2-menubar-menu label="View">
    <c2-menu-item value="ruler" type="checkbox" checked>Show ruler</c2-menu-item>
    <c2-menu-item value="zoom">Zoom</c2-menu-item>
  </c2-menubar-menu>
</c2-menubar>
<button>After</button>`

test('is one tab stop with menubar semantics and writes nothing on the hosts', async ({ page, renderScenario, tab }) => {
  await renderScenario(bar)
  for (const host of await page.locator('c2-menubar, c2-menubar-menu').all()) {
    const names = await host.evaluate((element) => element.getAttributeNames())
    expect(names.filter((name) => !['aria-label', 'label', 'disabled'].includes(name))).toEqual([])
  }
  await expect(page.getByRole('menubar', { name: 'Editor' })).toBeVisible()
  await expect(page.getByRole('menuitem')).toHaveText(['File', 'Edit', 'Selection', 'View'])
  await expect(page.locator('c2-menubar-menu').first()).toHaveHostAria('role', 'none')
  await expect(trigger(page, 'File')).toHaveAttribute('aria-haspopup', 'menu')
  await expect(trigger(page, 'File')).toHaveAttribute('aria-expanded', 'false')

  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(trigger(page, 'File')).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await accessible(page)
})

test('arrow keys, Home, End and letters move across the bar, skipping disabled menus, and keep the tab stop', async ({ page, renderScenario, tab }) => {
  await renderScenario(bar)
  await trigger(page, 'File').focus()
  await page.keyboard.press('ArrowRight')
  await expect(trigger(page, 'Edit')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(trigger(page, 'View')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(trigger(page, 'File')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(trigger(page, 'View')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(trigger(page, 'File')).toBeFocused()
  await page.keyboard.press('End')
  await expect(trigger(page, 'View')).toBeFocused()
  await page.keyboard.press('e')
  await expect(trigger(page, 'Edit')).toBeFocused()
  await expect(page.locator('c2-menubar-menu[open]')).toHaveCount(0)

  // The tab stop follows the last trigger used.
  await tab()
  await tab(true)
  await expect(trigger(page, 'Edit')).toBeFocused()
})

test('Enter, Space and ArrowDown open on the first row, ArrowUp on the last; Escape returns to the trigger', async ({ page, renderScenario }) => {
  await renderScenario(bar)
  for (const key of ['Enter', 'Space', 'ArrowDown']) {
    await trigger(page, 'Edit').focus()
    await page.keyboard.press(key)
    await expect(row(page, 'undo')).toBeFocused()
    await expect(trigger(page, 'Edit')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('c2-menubar-menu[label="Edit"]')).toHaveState('open')
    await page.keyboard.press('Escape')
    await expect(row(page, 'undo')).toBeHidden()
    await expect(trigger(page, 'Edit')).toBeFocused()
  }
  await page.keyboard.press('ArrowUp')
  await expect(row(page, 'redo')).toBeFocused()
})

test('ArrowRight and ArrowLeft inside a menu move the open menu along the bar', async ({ page, renderScenario }) => {
  await renderScenario(bar)
  await trigger(page, 'File').focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'new')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'undo')).toBeFocused()
  await expect(row(page, 'new')).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'ruler')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'undo')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'new')).toBeFocused()
  await expect(page.locator('c2-menubar-menu[open]')).toHaveCount(1)
})

test('in a submenu ArrowLeft closes it, and ArrowRight on a plain row moves to the next menu', async ({ page, renderScenario }) => {
  await renderScenario(bar)
  await trigger(page, 'File').focus()
  await page.keyboard.press('ArrowDown')
  // The menu takes focus once its popover has opened; a key pressed before that still lands on the trigger.
  await expect(row(page, 'new')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'recent')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'report')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(row(page, 'report')).toBeHidden()
  await expect(row(page, 'recent')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'report')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'undo')).toBeFocused()
  await expect(row(page, 'report')).toBeHidden()
  await expect(row(page, 'new')).toBeHidden()
})

test('a click opens a menu, hovering another trigger switches to it, a second click closes it', async ({ page, renderScenario }) => {
  await renderScenario(bar)
  await trigger(page, 'File').hover()
  await expect(row(page, 'new')).toBeHidden()
  await trigger(page, 'File').click()
  await expect(row(page, 'new')).toBeVisible()
  await trigger(page, 'Edit').hover()
  await expect(row(page, 'undo')).toBeVisible()
  await expect(row(page, 'new')).toBeHidden()
  await expect(trigger(page, 'Edit')).toBeFocused()
  // Disabled menus are passed over.
  await trigger(page, 'Selection').hover({ force: true })
  await expect(row(page, 'all')).toBeHidden()
  await expect(row(page, 'undo')).toBeVisible()
  await trigger(page, 'Edit').click()
  await expect(row(page, 'undo')).toBeHidden()
})

test('picking a row fires menu-select on the bar and closes the menu', async ({ page, renderScenario }) => {
  await renderScenario(bar)
  await watch(page.locator('c2-menubar'), 'menu-select')
  await trigger(page, 'View').click()
  await row(page, 'zoom').click()
  await expect(row(page, 'zoom')).toBeHidden()
  await trigger(page, 'View').click()
  await row(page, 'ruler').click()
  expect((await events(page)).map((detail: { value: string }) => detail.value)).toEqual(['zoom', 'ruler'])
})

test('a disabled menu never opens', async ({ page, renderScenario }) => {
  await renderScenario(bar)
  await expect(trigger(page, 'Selection')).toHaveAttribute('aria-disabled', 'true')
  await page.locator('c2-menubar-menu[label="Selection"]').evaluate((menu: HTMLElement & { show(): void }) => menu.show())
  await expect(row(page, 'all')).toBeHidden()
})

test('right-to-left mirrors the arrow keys', async ({ page, renderScenario }) => {
  await renderScenario(`<div dir="rtl">${bar}</div>`)
  await trigger(page, 'File').focus()
  await page.keyboard.press('ArrowLeft')
  await expect(trigger(page, 'Edit')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(trigger(page, 'File')).toBeFocused()
})

test('start and end slots sit outside the menubar role', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menubar aria-label="App">
    <strong slot="start">Notes</strong>
    <c2-menubar-menu label="File"><c2-menu-item value="new">New</c2-menu-item></c2-menubar-menu>
    <span slot="end">Saved</span>
  </c2-menubar>`)
  // The accessibility tree follows the flat tree, which locators inside the shadow root do not.
  await expect(page.getByRole('menubar', { name: 'App' })).toMatchAriaSnapshot(`
    - menubar "App":
      - menuitem "File"
  `)
  await expect(page.getByText('Saved')).toBeVisible()
  await trigger(page, 'File').click()
  await accessible(page)
})

test('menus wrapped in an element of their own (an Astro island) still share one tab stop and move with the arrows', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-menubar aria-label="Wrapped">
    <span style="display: contents"><c2-menubar-menu label="File"><c2-menu-item value="new">New</c2-menu-item></c2-menubar-menu></span>
    <span style="display: contents"><c2-menubar-menu label="Edit"><c2-menu-item value="undo">Undo</c2-menu-item></c2-menubar-menu></span>
  </c2-menubar>`)
  await expect(trigger(page, 'Edit')).toHaveAttribute('tabindex', '-1')
  await trigger(page, 'File').focus()
  await page.keyboard.press('ArrowRight')
  await expect(trigger(page, 'Edit')).toBeFocused()
})

for (const key of ['ArrowDown', 'Enter', 'ArrowUp']) {
  test(`${key} on the trigger of a menu opened under the pointer moves into its rows`, async ({ page, renderScenario }) => {
    await renderScenario(bar)
    await trigger(page, 'File').click()
    await trigger(page, 'Edit').hover()
    await expect(row(page, 'undo')).toBeVisible()
    await expect(trigger(page, 'Edit')).toBeFocused()
    await page.keyboard.press(key)
    await expect(row(page, key === 'ArrowUp' ? 'redo' : 'undo')).toBeFocused()
  })
}

test('a disabled menu passes its tab stop on, and a bar with every menu disabled stays reachable', async ({ page, renderScenario, tab }) => {
  await renderScenario(bar)
  await trigger(page, 'Edit').focus()
  await page.locator('c2-menubar-menu[label="Edit"]').evaluate((menu: HTMLElement & { disabled: boolean }) => (menu.disabled = true))
  await expect(trigger(page, 'Edit')).toHaveAttribute('tabindex', '-1')
  await expect(trigger(page, 'File')).toHaveAttribute('tabindex', '0')

  await page.locator('c2-menubar-menu').evaluateAll((menus) => menus.forEach((menu) => ((menu as HTMLElement & { disabled: boolean }).disabled = true)))
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(trigger(page, 'File')).toBeFocused()
})

test('right-to-left: inside a menu ArrowRight still goes to the next menu, as it opens a submenu', async ({ page, renderScenario }) => {
  await renderScenario(`<div dir="rtl">${bar}</div>`)
  await trigger(page, 'Edit').focus()
  await page.keyboard.press('ArrowDown')
  await expect(row(page, 'undo')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row(page, 'ruler')).toBeFocused()
})
