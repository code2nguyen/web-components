import { test, expect, props, accessible } from '../../../../tests/component-fixture'

test('count caps at max and zero visibility follows show-zero', async ({ page, renderScenario }) => {
  await renderScenario('<c2-badge count="125" max="99"></c2-badge>')
  const host = page.locator('c2-badge')
  await expect(host.locator('[part="badge"]')).toHaveText('99+')
  await props(host, { count: 0 })
  await expect(host.locator('[part="badge"]')).toHaveCount(0)
  await props(host, { showZero: true })
  await expect(host.locator('[part="badge"]')).toHaveText('0')
  await accessible(page)
})
test('dot mode keeps the anchor visible without count text', async ({ page, renderScenario }) => {
  await renderScenario('<c2-badge dot count="0"><button slot="anchor">Inbox</button></c2-badge>')
  await expect(page.getByRole('button', { name: 'Inbox' })).toBeVisible()
  await expect(page.locator('[part="badge"]')).toBeVisible()
  await expect(page.locator('[part="badge"]')).toHaveText('')
})

test('anchor offsets move an anchored badge, and a circular anchor keeps its inset default until set', async ({ page, renderScenario }) => {
  await renderScenario('<c2-badge count="3"><span slot="anchor" style="display: inline-block; width: 80px; height: 80px">Avatar</span></c2-badge>')
  const host = page.locator('c2-badge')
  const anchor = page.locator('c2-badge [slot="anchor"]')
  const badge = page.locator('c2-badge .c2-badge')
  // The badge is centred on the corner: its centre sits at the anchor's top-right corner, moved inwards by the offsets.
  const centre = async () => {
    const [a, b] = [(await anchor.boundingBox())!, (await badge.boundingBox())!]
    return { x: Math.round(a.x + a.width - (b.x + b.width / 2)), y: Math.round(b.y + b.height / 2 - a.y) }
  }
  await expect.poll(centre).toEqual({ x: 0, y: 0 })
  await host.evaluate((element) => {
    element.style.setProperty('--c2-badge__anchor--offset-x', '10px')
    element.style.setProperty('--c2-badge__anchor--offset-y', '6px')
  })
  await expect.poll(centre).toEqual({ x: 10, y: 6 })

  await host.evaluate((element) => {
    element.style.removeProperty('--c2-badge__anchor--offset-x')
    element.style.removeProperty('--c2-badge__anchor--offset-y')
    element.setAttribute('overlap', 'circular')
  })
  // 14.6% of the 80px anchor.
  await expect.poll(centre).toEqual({ x: 12, y: 12 })
  await host.evaluate((element) => element.style.setProperty('--c2-badge__anchor--offset-x', '2px'))
  await expect.poll(centre).toEqual({ x: 2, y: 12 })
})
