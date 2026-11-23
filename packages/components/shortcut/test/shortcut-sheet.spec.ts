import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'
import { isApple } from '../../../../tests/component-fixture'

type Page = import('@playwright/test').Page

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' })
const rows = (page: Page) => page.locator('c2-shortcut-sheet').getByRole('listitem')
const log = (page: Page) => page.locator('#log')

test('loads nothing but the element until it opens', async ({ page, sheetScenario }) => {
  await sheetScenario()
  expect(await page.evaluate(() => [!!customElements.get('c2-modal'), !!customElements.get('c2-kbd'), !!customElements.get('c2-text-field')])).toEqual([
    false,
    false,
    false,
  ])
  await expect(dialog(page)).toHaveCount(0)
})

test('its own keys open it, focus the search field and Escape closes it', async ({ page, sheetScenario }) => {
  await sheetScenario()
  await page.keyboard.press('Alt+/')
  await expect(dialog(page)).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search shortcuts' })).toBeFocused()
  await expect(log(page)).toHaveText('open')
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toBeHidden()
  await expect(page.locator('c2-shortcut-sheet')).not.toHaveAttribute('open')
  await expect(log(page)).toHaveText('open close')
  await page.keyboard.press('Alt+/')
  await expect(dialog(page)).toBeVisible()
  await page.keyboard.press('Alt+/')
  await expect(dialog(page)).toBeHidden()
})

test('lists described bindings by group, then its own keys and `shortcuts`', async ({ page, sheetScenario }) => {
  await sheetScenario()
  await page.getByRole('button', { name: 'Show shortcuts' }).click()
  await expect(dialog(page)).toBeVisible()
  const apple = await isApple(page)
  await expect(page.locator('c2-shortcut-sheet').getByRole('heading', { level: 3 })).toHaveText(['General', 'Navigation', 'Editing'])
  await expect(rows(page)).toHaveText([
    apple ? 'Open search⌘Kor⌘/' : 'Open searchCtrl+KorCtrl+/',
    apple ? 'Show keyboard shortcuts⌥/' : 'Show keyboard shortcutsAlt+/',
    apple ? 'Go to dashboard⌥Gthen⌥D' : 'Go to dashboardAlt+GthenAlt+D',
    apple ? 'Go to inbox⌥Gthen⌥I' : 'Go to inboxAlt+GthenAlt+I',
    'Next itemJ',
    apple ? 'Bold⌘B' : 'BoldCtrl+B',
  ])
})

test('the search field filters the rows and announces the count', async ({ page, sheetScenario }) => {
  await sheetScenario()
  await page.getByRole('button', { name: 'Show shortcuts' }).click()
  const search = page.getByRole('searchbox', { name: 'Search shortcuts' })
  await search.fill('go to')
  await expect(rows(page)).toHaveCount(2)
  await expect(page.locator('c2-shortcut-sheet').getByRole('status')).toHaveText('2 shortcuts')
  await search.fill('navigation inbox')
  await expect(rows(page)).toHaveText([/Go to inbox/])
  await expect(page.locator('c2-shortcut-sheet').getByRole('status')).toHaveText('1 shortcut')
  await search.fill('nothing like it')
  await expect(rows(page)).toHaveCount(0)
  await expect(page.locator('c2-shortcut-sheet')).toContainText('No shortcuts match “nothing like it”')
})

test('the search starts empty each time it opens', async ({ page, sheetScenario }) => {
  await sheetScenario()
  await page.keyboard.press('Alt+/')
  await page.getByRole('searchbox', { name: 'Search shortcuts' }).fill('bold')
  await expect(rows(page)).toHaveCount(1)
  await page.keyboard.press('Alt+/')
  await page.keyboard.press('Alt+/')
  await expect(page.getByRole('searchbox', { name: 'Search shortcuts' })).toHaveValue('')
  await expect(rows(page)).toHaveCount(6)
})

test('a command button toggles it, and methods open and close it', async ({ page, sheetScenario }) => {
  await sheetScenario()
  await page.getByRole('button', { name: 'Toggle shortcuts' }).click()
  await expect(dialog(page)).toBeVisible()
  await page.locator('c2-shortcut-sheet').evaluate((sheet: HTMLElementTagNameMap['c2-shortcut-sheet']) => sheet.hide())
  await expect(dialog(page)).toBeHidden()
  await page.locator('c2-shortcut-sheet').evaluate((sheet: HTMLElementTagNameMap['c2-shortcut-sheet']) => sheet.show())
  await expect(dialog(page)).toBeVisible()
})

test('inline, it lists the `for` sources in the page without a dialog', async ({ page, sheetScenario }) => {
  await sheetScenario('inline')
  await expect(dialog(page)).toHaveCount(0)
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page)).toContainText(['Bold'])
  // The list's styles arrive with the lazily loaded view.
  await expect(page.locator('c2-shortcut-sheet').getByRole('heading', { name: 'Editing' })).toHaveCSS('text-transform', 'uppercase')
  // An inline sheet has no binding of its own.
  await page.keyboard.press('Alt+/')
  await expect(dialog(page)).toHaveCount(0)
})

test('reads the bindings again on refresh()', async ({ page, sheetScenario }) => {
  await sheetScenario('inline')
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElementTagNameMap['c2-shortcut']>('#editor')!
    editor.bindings = [...editor.bindings, { keys: 'mod+i', description: 'Italic', group: 'Editing' }]
    document.querySelector('c2-shortcut-sheet')!.refresh()
  })
  await expect(rows(page)).toHaveCount(2)
})

test('shows the empty text, the footer and no search field when asked', async ({ page, sheetScenario }) => {
  await sheetScenario('empty')
  await expect(page.locator('c2-shortcut-sheet')).toContainText('No keyboard shortcuts')
  await expect(page.locator('c2-shortcut-sheet').locator('[part="footer"]')).toBeHidden()

  await sheetScenario('footer')
  await expect(page.getByRole('link', { name: 'Customize shortcuts' })).toBeVisible()

  await sheetScenario('no-search')
  await expect(rows(page)).toHaveCount(1)
  await expect(page.getByRole('searchbox')).toHaveCount(0)
})

test('no-bindings lists `shortcuts` alone, ungrouped ones first', async ({ page, sheetScenario }) => {
  await sheetScenario('no-bindings')
  await expect(page.locator('c2-shortcut-sheet').getByRole('heading', { level: 3 })).toHaveText(['General', 'Lists'])
  await expect(rows(page)).toHaveText([/Help(⇧|Shift\+)\?/, 'NextJ'])
})

test('does not list its own keys when they cannot be bound', async ({ page, sheetScenario }) => {
  await sheetScenario('bare-keys')
  await page.locator('c2-shortcut-sheet').evaluate((sheet: HTMLElementTagNameMap['c2-shortcut-sheet']) => sheet.show())
  await expect(dialog(page)).toBeVisible()
  await expect(rows(page)).toHaveText(['NextJ'])
})

test('a nested overlay closing does not close the sheet', async ({ page, sheetScenario }) => {
  await sheetScenario()
  await page.keyboard.press('Alt+/')
  await expect(dialog(page)).toBeVisible()
  await page
    .locator('c2-shortcut-sheet')
    .evaluate((sheet) => sheet.shadowRoot!.querySelector('c2-text-field')!.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true })))
  await expect(dialog(page)).toBeVisible()
  await expect(page.locator('c2-shortcut-sheet')).toHaveAttribute('open')
})

test('renderItem draws the content of each row', async ({ page, sheetScenario }) => {
  await sheetScenario('render-item')
  const apple = await isApple(page)
  await expect(rows(page)).toHaveText([apple ? '1. Bold: ⌘B' : '1. Bold: Ctrl+B'])
})

test('follows the nearest lang', async ({ page, sheetScenario }) => {
  await sheetScenario('french')
  await expect(page.locator('c2-shortcut-sheet').getByRole('heading', { level: 3 })).toHaveText(['Général', 'Navigation'])
  await expect(page.getByRole('searchbox', { name: 'Rechercher un raccourci' })).toBeVisible()
  await expect(rows(page).nth(1)).toContainText('puis')
  await page.getByRole('searchbox').fill('zzz')
  await expect(page.locator('c2-shortcut-sheet')).toContainText('Aucun raccourci ne correspond à « zzz »')
})

for (const state of ['default', 'inline']) {
  test(`${state} has no axe violations`, async ({ page, sheetScenario }) => {
    await sheetScenario(state)
    if (state === 'default') {
      await page.keyboard.press('Alt+/')
      await expect(dialog(page)).toBeVisible()
    } else await expect(rows(page)).toHaveCount(1)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}
