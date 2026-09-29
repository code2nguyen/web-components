import { test, expect } from './fixture'

type Page = import('@playwright/test').Page

const log = (page: Page) => page.getByRole('status')

/**
 * The page's own reading of the platform, as `isApplePlatform()` does it. A device preset can report a platform other
 * than the host's (`Desktop Chrome` claims Windows on a Mac), so `ControlOrMeta`, which follows the host, would press
 * the wrong modifier.
 */
const isApple = (page: Page) =>
  page.evaluate(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''
    return /mac|iphone|ipad|ipod/i.test(platform)
  })
const mod = async (page: Page, key: string) => `${(await isApple(page)) ? 'Meta' : 'Control'}+${key}`

test('fires the matching action and prevents the browser default', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press(await mod(page, 'k'))
  await expect(log(page)).toHaveText('search')
  await expect(log(page)).toHaveAttribute('data-prevented', 'true')
  await page.keyboard.press(await mod(page, '/'))
  await expect(log(page)).toHaveText('search search')
})

test('reads bindings from a JSON attribute', async ({ page, scenario }) => {
  await scenario('attribute')
  await page.keyboard.press(await mod(page, 'k'))
  await expect(log(page)).toHaveText('from-attribute')
})

test('rejects bindings whose keys carry no Ctrl, ⌘ or Alt, except Escape and function keys', async ({ page, scenario }) => {
  const warnings: string[] = []
  page.on('console', (message) => message.type() === 'warning' && warnings.push(message.text()))
  await scenario()
  await page.keyboard.press('b')
  await page.keyboard.press('g')
  await page.keyboard.press('d')
  await page.keyboard.press('Shift+B')
  await expect(log(page)).toBeEmpty()
  await page.keyboard.press('F2')
  await expect(log(page)).toHaveText('function-key')
  expect(warnings.filter((text) => text.includes('[c2-shortcut]'))).toHaveLength(3)
  const labels = await page.locator('c2-shortcut').evaluate((element) => (element as HTMLElementTagNameMap['c2-shortcut']).entries.map((entry) => entry.label))
  expect(labels).toContain('')
})

test('ignores Escape while typing but fires modifier chords', async ({ page, scenario }) => {
  await scenario()
  const field = page.getByLabel('Field')
  await field.click()
  await page.keyboard.type('/gd')
  await page.keyboard.press('Escape')
  await expect(field).toHaveValue('/gd')
  await expect(log(page)).toBeEmpty()
  await page.keyboard.press(await mod(page, 's'))
  await expect(log(page)).toHaveText('save')
})

test('completes a sequence instead of a single-key binding', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('Alt+g')
  await page.keyboard.press('Alt+d')
  await expect(log(page)).toHaveText('go')
  await page.keyboard.press('Alt+d')
  await expect(log(page)).toHaveText('go lone-d')
})

test('drops an unfinished sequence after the timeout', async ({ page, scenario }) => {
  await page.clock.install()
  await scenario()
  await page.keyboard.press('Alt+g')
  await page.clock.runFor(1100)
  await page.keyboard.press('Alt+d')
  await expect(log(page)).toHaveText('lone-d')
})

test('prefers the most narrowly scoped binding', async ({ page, scenario }) => {
  await scenario()
  await page.getByRole('button', { name: 'Target' }).focus()
  await page.keyboard.press('Escape')
  await expect(log(page)).toHaveText('close-global')
  await page.getByRole('button', { name: 'Inside' }).focus()
  await page.keyboard.press('Escape')
  await expect(log(page)).toHaveText('close-global close-panel')
})

test('clicks a `for` target, focuses a `for` field and announces the shortcut', async ({ page, scenario }) => {
  await scenario()
  const target = page.getByRole('button', { name: 'Target' })
  await expect(target).toHaveAttribute('aria-keyshortcuts', 'Alt+T')
  await page.keyboard.press('Alt+t')
  await expect(log(page)).toHaveText('open clicked')
  await page.keyboard.press('Alt+f')
  await expect(page.getByLabel('Field')).toBeFocused()
  await expect(page.getByLabel('Field')).toHaveValue('')
})

test('clicks the control inside a custom element `for` target', async ({ page, scenario }) => {
  await scenario()
  const control = page.getByRole('switch', { name: 'Switch' })
  await page.keyboard.press('Alt+w')
  await expect(control).toBeChecked()
  await page.keyboard.press('Alt+w')
  await expect(control).not.toBeChecked()
})

test('runs a handler', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('Alt+j')
  await expect(log(page)).toHaveText('(alt+j) handled')
})

test('a cancelled shortcut event skips the `for` target', async ({ page, scenario }) => {
  await scenario('cancel')
  await page.keyboard.press('Alt+t')
  await page.keyboard.press(await mod(page, 's'))
  await expect(log(page)).toHaveText('open save')
})

test('disabled element and disabled bindings stay silent', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('Alt+x')
  await page.keyboard.press(await mod(page, 's'))
  await expect(log(page)).toHaveText('save')

  await scenario('disabled')
  await page.keyboard.press(await mod(page, 's'))
  await page.keyboard.press('Alt+t')
  await expect(log(page)).toBeEmpty()
  await expect(page.getByRole('button', { name: 'Target' })).not.toHaveAttribute('aria-keyshortcuts')
})

test('ignores auto-repeat unless the binding opts in', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.down('Alt')
  await page.keyboard.down('h')
  await page.keyboard.down('h')
  await page.keyboard.up('h')
  await page.keyboard.down('r')
  await page.keyboard.down('r')
  await page.keyboard.up('r')
  await page.keyboard.up('Alt')
  await expect(log(page)).toHaveText('held repeat repeat')
})

test('leaves a key a component already handled', async ({ page, scenario }) => {
  await scenario()
  await page.getByLabel('Claimer').focus()
  await page.keyboard.press('Alt+q')
  await page.getByRole('button', { name: 'Target' }).focus()
  await page.keyboard.press('Alt+q')
  await expect(log(page)).toHaveText('claimed')
})

test('stops listening once removed', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-shortcut').evaluate((element) => element.remove())
  await page.keyboard.press(await mod(page, 's'))
  await expect(log(page)).toBeEmpty()
  await expect(page.getByRole('button', { name: 'Target' })).not.toHaveAttribute('aria-keyshortcuts')
})

test('lists platform-aware labels', async ({ page, scenario }) => {
  await scenario()
  const entries = await page.locator('c2-shortcut').evaluate((element) => (element as HTMLElementTagNameMap['c2-shortcut']).entries.map((entry) => entry.label))
  const apple = await isApple(page)
  expect(entries[0]).toBe(apple ? '⌘K, ⌘/' : 'Ctrl+K, Ctrl+/')
  expect(entries[2]).toBe(apple ? '⌥G ⌥D' : 'Alt+G Alt+D')
  expect(entries[6]).toBe(apple ? '⌥T' : 'Alt+T')
})
