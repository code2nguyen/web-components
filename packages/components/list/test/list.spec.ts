import type { Page } from '@playwright/test'
import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

// Hosts state their role through ElementInternals, which getByRole cannot see: rows are found by tag and text.
const option = (page: Page, name: string) => page.locator('c2-list-item', { hasText: name })
const rows = '<c2-list-item value="a">Apple</c2-list-item><c2-list-item value="b" disabled>Banana</c2-list-item><c2-list-item value="c">Cherry</c2-list-item>'

test('consumer-owned list rows remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list><c2-list-item class="slot-probe">Row</c2-list-item></c2-list>')
  await page.locator('.slot-probe').evaluate((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)'))
  await expect(page.locator('.slot-probe')).toHaveCSS('color', 'rgb(1, 2, 3)')
})
// c2-list has no renderer: its rows are the author's own light DOM, so a page stylesheet reaches their content as is.
test('a page stylesheet reaches the content of a row', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list><c2-list-item value="a"><span class="status status-failed">Failed</span></c2-list-item></c2-list>')
  await page.addStyleTag({ content: '.status-failed{color:rgb(200, 0, 0)}' })
  await expect(page.locator('.status')).toHaveCSS('color', 'rgb(200, 0, 0)')
})
test('selection updates options and emits consumer data', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-list aria-label="Fruit">${rows}</c2-list>`)
  const host = page.locator('c2-list')
  await watch(host, 'selection-change')
  await option(page, 'Apple').click()
  await expect(host).toHaveJSProperty('value', ['a'])
  await expect(option(page, 'Apple')).toHaveHostAria('aria-selected', 'true')
  await expect(host).toHaveAttribute('data-events', '[{"value":["a"],"data":[null]}]')
  await accessible(page)
})
test('keyboard skips disabled rows and typeahead finds matching options', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-list aria-label="Fruit">${rows}</c2-list>`)
  await option(page, 'Apple').focus()
  await page.keyboard.press('ArrowDown')
  await expect(option(page, 'Cherry')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-list')).toHaveJSProperty('value', ['c'])
  await page.keyboard.press('Home')
  await expect(option(page, 'Apple')).toBeFocused()
  await page.keyboard.press('c')
  await expect(option(page, 'Cherry')).toBeFocused()
})
test('multiple required selection cannot remove the last value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-list aria-label="Fruit" multiple required value="a">${rows}</c2-list>`)
  await option(page, 'Cherry').click()
  await expect(page.locator('c2-list')).toHaveJSProperty('value', ['a', 'c'])
  await option(page, 'Apple').click()
  await option(page, 'Cherry').click()
  await expect(page.locator('c2-list')).toHaveJSProperty('value', ['c'])
})
test('disabling an existing list removes its keyboard tab stop', async ({ page, renderScenario }) => {
  await renderScenario(`<button>Before</button><c2-list aria-label="Fruit">${rows}</c2-list><button>After</button>`)
  await props(page.locator('c2-list'), { disabled: true })
  await expect(option(page, 'Apple')).toHaveAttribute('tabindex', '-1')
  await props(page.locator('c2-list'), { disabled: false })
  await expect(option(page, 'Apple')).toHaveAttribute('tabindex', '0')
})
test('states its semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-list aria-label="Fruit">${rows}</c2-list>`)
  const host = page.locator('c2-list')
  const hostAttributes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('c2-list, c2-list-item')].flatMap((element) =>
        element
          .getAttributeNames()
          .filter((name) => name === 'role' || name.startsWith('aria-'))
          .filter((name) => !(element.localName === 'c2-list' && name === 'aria-label'))
          .map((name) => `${element.localName}[${name}]`),
      ),
    )
  await expect(host).toHaveHostAria('role', 'listbox')
  await expect(host).toHaveHostAria('aria-multiselectable', 'false')
  await expect(option(page, 'Apple')).toHaveHostAria('role', 'option')
  await expect(option(page, 'Apple')).toHaveHostAria('aria-selected', 'false')
  await expect(option(page, 'Banana')).toHaveHostAria('aria-disabled', 'true')
  expect(await hostAttributes()).toEqual([])
  await option(page, 'Apple').click()
  await expect(host).toHaveJSProperty('value', ['a'])
  await expect(option(page, 'Apple')).toHaveHostAria('aria-selected', 'true')
  await expect(option(page, 'Cherry')).toHaveHostAria('aria-selected', 'false')
  expect(await hostAttributes()).toEqual([])
})
