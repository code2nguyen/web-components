import { test, expect } from './fixture'

const log = (page: import('@playwright/test').Page) => page.getByRole('status')

test('fires the matching action and prevents the browser default', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(log(page)).toHaveText('search')
  await expect(log(page)).toHaveAttribute('data-prevented', 'true')
  await page.keyboard.press('/')
  await expect(log(page)).toHaveText('search search')
})

test('reads bindings from a JSON attribute', async ({ page, scenario }) => {
  await scenario('attribute')
  await page.keyboard.press('ControlOrMeta+k')
  await expect(log(page)).toHaveText('from-attribute')
})

test('ignores bare keys while typing but fires modifier chords', async ({ page, scenario }) => {
  await scenario()
  const field = page.getByLabel('Field')
  await field.click()
  await page.keyboard.type('/gd')
  await expect(field).toHaveValue('/gd')
  await expect(log(page)).toBeEmpty()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(log(page)).toHaveText('save')
})

test('completes a sequence instead of a single-key binding', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('g')
  await page.keyboard.press('d')
  await expect(log(page)).toHaveText('go')
  await page.keyboard.press('d')
  await expect(log(page)).toHaveText('go lone-d')
})

test('drops an unfinished sequence after the timeout', async ({ page, scenario }) => {
  await page.clock.install()
  await scenario()
  await page.keyboard.press('g')
  await page.clock.runFor(1100)
  await page.keyboard.press('d')
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
  await page.keyboard.press('f')
  await expect(page.getByLabel('Field')).toBeFocused()
  await expect(page.getByLabel('Field')).toHaveValue('')
})

test('runs a handler', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('j')
  await expect(log(page)).toHaveText('(j) handled')
})

test('a cancelled shortcut event skips the `for` target', async ({ page, scenario }) => {
  await scenario('cancel')
  await page.keyboard.press('Alt+t')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(log(page)).toHaveText('open save')
})

test('disabled element and disabled bindings stay silent', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.press('x')
  await page.keyboard.press('ControlOrMeta+s')
  await expect(log(page)).toHaveText('save')

  await scenario('disabled')
  await page.keyboard.press('ControlOrMeta+s')
  await page.keyboard.press('Alt+t')
  await expect(log(page)).toBeEmpty()
  await expect(page.getByRole('button', { name: 'Target' })).not.toHaveAttribute('aria-keyshortcuts')
})

test('ignores auto-repeat unless the binding opts in', async ({ page, scenario }) => {
  await scenario()
  await page.keyboard.down('h')
  await page.keyboard.down('h')
  await page.keyboard.up('h')
  await page.keyboard.down('r')
  await page.keyboard.down('r')
  await page.keyboard.up('r')
  await expect(log(page)).toHaveText('held repeat repeat')
})

test('leaves a key a component already handled', async ({ page, scenario }) => {
  await scenario()
  await page.getByLabel('Claimer').focus()
  await page.keyboard.press('q')
  await page.getByRole('button', { name: 'Target' }).focus()
  await page.keyboard.press('q')
  await expect(log(page)).toHaveText('claimed')
})

test('stops listening once removed', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-shortcut').evaluate((element) => element.remove())
  await page.keyboard.press('ControlOrMeta+s')
  await expect(log(page)).toBeEmpty()
  await expect(page.getByRole('button', { name: 'Target' })).not.toHaveAttribute('aria-keyshortcuts')
})

test('lists platform-aware labels', async ({ page, scenario }) => {
  await scenario()
  const entries = await page.locator('c2-shortcut').evaluate((element) => (element as HTMLElementTagNameMap['c2-shortcut']).entries.map((entry) => entry.label))
  const apple = await page.evaluate(() => /mac|iphone|ipad/i.test(navigator.platform))
  expect(entries[0]).toBe(apple ? '⌘K, /' : 'Ctrl+K, /')
  expect(entries[2]).toBe('G D')
  expect(entries[6]).toBe(apple ? '⌥T' : 'Alt+T')
})
