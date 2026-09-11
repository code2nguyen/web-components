import { test, expect, props } from '../../../../tests/component-fixture'

const markup = '<button id="anchor" popovertarget="menu">Open menu</button><c2-overlay id="menu" fit-anchor><button>Action</button></c2-overlay>'
test('native trigger opens an anchored popover and Escape closes it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(host).toHaveJSProperty('open', true)
  await expect(host).toHaveAttribute('current-placement', /bottom/)
  const anchor = await page.locator('#anchor').boundingBox()
  await expect(host).toHaveCSS('width', `${Math.round(anchor!.width)}px`)
  await page.keyboard.press('Escape')
  await expect(host).not.toBeVisible()
  await expect(host).toHaveJSProperty('open', false)
})
test('open property and light dismissal stay synchronized', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  await props(page.locator('c2-overlay'), { open: true })
  await expect(page.getByRole('button', { name: 'Action', exact: true })).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(page.locator('c2-overlay')).toHaveJSProperty('open', false)
})
