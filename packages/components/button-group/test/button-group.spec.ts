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
