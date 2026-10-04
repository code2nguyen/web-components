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
test('positioning variables set on the open overlay move it without a resize or scroll', async ({ page, renderScenario }) => {
  await renderScenario(
    '<button id="anchor" popovertarget="menu" style="margin: 120px 0 0 200px">Open menu</button><c2-overlay id="menu" placement="bottom-start"><button>Action</button></c2-overlay>',
  )
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(host).toHaveJSProperty('open', true)
  const anchor = (await page.locator('#anchor').boundingBox())!
  const gap = async () => (await host.boundingBox())!.y - (anchor.y + anchor.height)
  const shift = async () => (await host.boundingBox())!.x - anchor.x
  await expect.poll(gap).toBeCloseTo(8, 0)
  await expect.poll(shift).toBeCloseTo(0, 0)

  await host.evaluate((element) => element.style.setProperty('--c2-overlay--offset-y', '40px'))
  await expect.poll(gap).toBeCloseTo(40, 0)
  await host.evaluate((element) => element.style.setProperty('--c2-overlay--offset-x', '24px'))
  await expect.poll(shift).toBeCloseTo(24, 0)
})
test('viewport padding keeps the open overlay that far from the viewport edge', async ({ page, renderScenario }) => {
  await renderScenario(
    '<button id="anchor" popovertarget="menu" style="margin: 120px 0 0 4px">Open menu</button><c2-overlay id="menu" placement="bottom-end" free-width disabled-cross-axis><button style="width: 240px">Action</button></c2-overlay>',
  )
  const host = page.locator('c2-overlay')
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(host).toHaveJSProperty('open', true)
  const left = async () => (await host.boundingBox())!.x
  await expect.poll(left).toBeCloseTo(8, 0)
  await host.evaluate((element) => element.style.setProperty('--c2-overlay--viewport-padding', '32px'))
  await expect.poll(left).toBeCloseTo(32, 0)
})
