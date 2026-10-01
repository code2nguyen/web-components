import { test, expect, props, watch, accessible } from '../../../../tests/component-fixture'

const items = '<c2-button value="a">Left</c2-button><c2-button value="b">Right</c2-button><c2-button value="c" disabled>Locked</c2-button>'

test('consumer-owned grouped buttons remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario('<c2-button-group><c2-button class="slot-probe">Choice</c2-button></c2-button-group>')
  await page.locator('.slot-probe').evaluate((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)'))
  await expect(page.locator('.slot-probe')).toHaveCSS('color', 'rgb(1, 2, 3)')
})
test('single selection updates pressed state and emits one change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group selection="single" aria-label="Alignment">${items}</c2-button-group>`)
  const host = page.locator('c2-button-group')
  await watch(host, 'change')
  await page.getByRole('button', { name: 'Left', exact: true }).click()
  await page.getByRole('button', { name: 'Right', exact: true }).click()
  await expect(host).toHaveJSProperty('value', 'b')
  await expect(page.getByRole('button', { name: 'Left', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(host).toHaveAttribute('data-events', '[{"value":"a"},{"value":"b"}]')
  await accessible(page)
})
test('multiple selection toggles independently', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group selection="multiple">${items}</c2-button-group>`)
  await page.getByRole('button', { name: 'Left', exact: true }).click()
  await page.getByRole('button', { name: 'Right', exact: true }).click()
  await expect(page.locator('c2-button-group')).toHaveJSProperty('value', 'a,b')
  await page.getByRole('button', { name: 'Left', exact: true }).click()
  await expect(page.locator('c2-button-group')).toHaveJSProperty('value', 'b')
})
test('reenabling the group preserves author-disabled children', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group disabled>${items}</c2-button-group>`)
  for (const button of await page.getByRole('button').all()) await expect(button).toBeDisabled()
  await props(page.locator('c2-button-group'), { disabled: false })
  await expect(page.getByRole('button', { name: 'Left', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Locked' })).toBeDisabled()
})

test('segmented appearance selects the first enabled item by default', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group appearance="segmented" aria-label="View">${items}</c2-button-group>`)
  const host = page.locator('c2-button-group')
  await expect(host).toHaveJSProperty('value', 'a')
  await expect(page.getByRole('button', { name: 'Left', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(host.locator('.indicator')).toHaveCSS('display', 'block')
  await accessible(page)
})

test('segmented surface is not overridden by app-wide button presentation variables', async ({ page, renderScenario }) => {
  await renderScenario(`<style>
      c2-button { --c2-button__container--background-color: rgb(200, 10, 10); --c2-button__container--color: rgb(0, 0, 0); }
    </style>
    <c2-button-group appearance="segmented" aria-label="View">${items}</c2-button-group>`)
  const left = page.getByRole('button', { name: 'Left', exact: true })
  await expect(left).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(left).toHaveCSS('color', 'rgb(24, 24, 27)')
})

test('single selection supports arrow, Home and End keys and skips disabled items', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group appearance="segmented" value="a" aria-label="View">${items}</c2-button-group>`)
  const host = page.locator('c2-button-group')
  await watch(host, 'change')
  const left = page.getByRole('button', { name: 'Left', exact: true })
  await left.focus()
  await page.keyboard.press('ArrowRight')
  await expect(host).toHaveJSProperty('value', 'b')
  await page.keyboard.press('ArrowRight')
  await expect(host).toHaveJSProperty('value', 'a')
  await page.keyboard.press('End')
  await expect(host).toHaveJSProperty('value', 'b')
  await expect(host).toHaveAttribute('data-events', '[{"value":"b"},{"value":"a"},{"value":"b"}]')
})

test('vertical segmented groups stack their items and use Up and Down keys', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-button-group appearance="segmented" orientation="vertical" value="a" aria-label="View">${items}</c2-button-group>`)
  const host = page.locator('c2-button-group')
  const indicator = host.locator('.indicator')
  const left = page.getByRole('button', { name: 'Left', exact: true })
  await expect(host).toHaveCSS('flex-direction', 'column')
  const initialTransform = await indicator.evaluate((element) => getComputedStyle(element).transform)
  await left.focus()
  await page.keyboard.press('ArrowRight')
  await expect(host).toHaveJSProperty('value', 'a')
  await page.keyboard.press('ArrowDown')
  await expect(host).toHaveJSProperty('value', 'b')
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transform)).not.toBe(initialTransform)
  await page.keyboard.press('ArrowDown')
  await expect(host).toHaveJSProperty('value', 'a')
  await page.keyboard.press('ArrowUp')
  await expect(host).toHaveJSProperty('value', 'b')
})

test('vertical segmented icon buttons move the indicator on pointer selection', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-button-group appearance="segmented" orientation="vertical" value="list" aria-label="View layout">
      <c2-icon-button value="list" aria-label="List view"><svg viewBox="0 0 24 24"><path d="M4 6h16"></path></svg></c2-icon-button>
      <c2-icon-button value="grid" aria-label="Grid view"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6"></rect></svg></c2-icon-button>
    </c2-button-group>`)
  const host = page.locator('c2-button-group')
  const indicator = host.locator('.indicator')
  const initialTransform = await indicator.evaluate((element) => getComputedStyle(element).transform)

  await page.getByRole('button', { name: 'Grid view' }).click()

  await expect(host).toHaveJSProperty('value', 'grid')
  await expect(page.locator('c2-icon-button[value="grid"]')).toHaveAttribute('selected', '')
  await expect.poll(() => indicator.evaluate((element) => getComputedStyle(element).transform)).not.toBe(initialTransform)
})

/** Id of the element that has focus, looking through shadow roots to the light-DOM host that holds it. */
async function focusedId(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.activeElement?.id ?? null)
}

test('a single-selection group is one Tab stop, on the pressed item', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-button id="before">Before</c2-button>
    <c2-button-group selection="single" value="b" aria-label="Alignment">
      <c2-button id="a" value="a">Left</c2-button><c2-button id="b" value="b">Centre</c2-button><c2-button id="c" value="c">Right</c2-button>
    </c2-button-group>
    <c2-button id="after">After</c2-button>`)
  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await expect.poll(() => focusedId(page)).toBe('b')
  await page.keyboard.press('Tab')
  await expect.poll(() => focusedId(page)).toBe('after')

  // The Tab stop follows the selection.
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('c2-button-group')).toHaveJSProperty('value', 'c')
  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await expect.poll(() => focusedId(page)).toBe('c')

  // Leaving single selection gives every item its own Tab stop back.
  await props(page.locator('c2-button-group'), { selection: 'none' })
  await expect(page.locator('#a')).not.toHaveAttribute('tabindex')
  await expect(page.locator('#b')).not.toHaveAttribute('tabindex')
})

test('a toolbar moves focus across mixed controls without selecting, and keeps one Tab stop', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-button id="before">Before</c2-button>
    <c2-button-group toolbar selection="single" value="left" aria-label="Formatting" style="--c2-button-group--gap: 8px">
      <c2-button id="left" value="left">Left</c2-button>
      <c2-button id="right" value="right">Right</c2-button>
      <c2-select id="font" aria-label="Font" value="sans"><c2-list-item value="sans">Sans</c2-list-item><c2-list-item value="serif">Serif</c2-list-item></c2-select>
      <c2-text-field id="search" aria-label="Find" value="abc"></c2-text-field>
      <c2-button id="locked" value="locked" disabled>Locked</c2-button>
    </c2-button-group>
    <c2-button id="after">After</c2-button>`)
  const host = page.locator('c2-button-group')
  await expect(host).toHaveHostAria('role', 'toolbar')
  await expect(host).toHaveHostAria('aria-orientation', 'horizontal')
  await watch(host, 'change')

  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await expect.poll(() => focusedId(page)).toBe('left')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focusedId(page)).toBe('right')
  // Focus moves, the selection does not.
  await expect(host).toHaveJSProperty('value', 'left')
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => focusedId(page)).toBe('font')
  await page.keyboard.press('End')
  await expect.poll(() => focusedId(page)).toBe('search')

  // In a text field the arrow keys move the caret, so focus stays put.
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => focusedId(page)).toBe('search')

  // The Tab stop is where focus last was, and Tab leaves the toolbar in one step.
  await page.keyboard.press('Tab')
  await expect.poll(() => focusedId(page)).toBe('after')
  await page.keyboard.press('Shift+Tab')
  await expect.poll(() => focusedId(page)).toBe('search')

  // Home, like the arrows, is a caret key in the text field, so it stays there.
  await page.keyboard.press('Home')
  await expect.poll(() => focusedId(page)).toBe('search')

  // Space still selects the focused button.
  await page.locator('#left').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Space')
  await expect(host).toHaveJSProperty('value', 'right')
  await expect(host).toHaveAttribute('data-events', '[{"value":"right"}]')
  await accessible(page)
})

test('a named group submits its pressed values, resets with its form and follows a disabled fieldset', async ({ page, renderScenario }) => {
  await renderScenario(`
    <form>
      <fieldset>
        <c2-button-group name="view" appearance="segmented" value="grid" aria-label="View">
          <c2-button value="list">List</c2-button><c2-button value="grid">Grid</c2-button>
        </c2-button-group>
        <c2-button-group name="tags" selection="multiple" value="a,c" aria-label="Tags">
          <c2-button value="a">A</c2-button><c2-button value="b">B</c2-button><c2-button value="c">C</c2-button>
        </c2-button-group>
      </fieldset>
    </form>`)
  const entries = () => page.evaluate(() => [...new FormData(document.querySelector('form')!).entries()].map(([key, value]) => `${key}=${value}`))
  await expect.poll(entries).toEqual(['view=grid', 'tags=a', 'tags=c'])

  const view = page.locator('c2-button-group[name="view"]')
  await watch(view, 'input')
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(view).toHaveAttribute('data-events', '[null]')
  await expect.poll(entries).toEqual(['view=list', 'tags=a', 'tags=c'])

  await page.evaluate(() => document.querySelector('form')!.reset())
  await expect(view).toHaveJSProperty('value', 'grid')

  await page.evaluate(() => (document.querySelector('fieldset')!.disabled = true))
  await expect(page.getByRole('button', { name: 'List', exact: true })).toBeDisabled()
  await page.evaluate(() => (document.querySelector('fieldset')!.disabled = false))
  await expect(page.getByRole('button', { name: 'List', exact: true })).toBeEnabled()
})
