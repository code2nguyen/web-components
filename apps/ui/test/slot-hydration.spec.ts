import { expect, test } from '@playwright/test'

test('hard reload keeps the server-rendered pie gallery visible through hydration', async ({ page }) => {
  await page.goto('./components/pie-chart/gallery/')
  await page.reload()

  const charts = page.locator('c2-pie-chart')
  await expect(charts).toHaveCount(7)
  await expect.poll(() => charts.evaluateAll((elements) => elements.every((element) => element.hasAttribute('data-chart-ready')))).toBe(true)
  await expect
    .poll(() =>
      charts.evaluateAll((elements) =>
        elements.every((element) => {
          const chart = element.getBoundingClientRect()
          const canvas = element.shadowRoot?.querySelector('canvas')?.getBoundingClientRect()
          return chart.width > 0 && chart.height > 0 && !!canvas && canvas.width > 0 && canvas.height > 0
        }),
      ),
    )
    .toBe(true)
})

test('scatter chart collects its declarative series before the hydrated chart settles', async ({ page }) => {
  await page.goto('./components/scatter-chart/')
  await page.reload()

  const chart = page.locator('#scatter-investment')
  await expect(chart).toHaveAttribute('data-chart-ready', 'true')
  await expect
    .poll(() => chart.evaluate((element) => (element as HTMLElement & { getLegendItems(): { label: string }[] }).getLegendItems().map((item) => item.label)))
    .toEqual(['Revenue'])

  const legend = page.locator('c2-chart-legend[for="scatter-investment"]')
  await expect.poll(() => legend.evaluate((element) => element.shadowRoot?.querySelectorAll('.item').length ?? 0)).toBe(1)
  await expect(legend.locator('.item')).toContainText('Revenue')
})

test('card conditional regions survive hydration and reconcile later mutations', async ({ page }) => {
  await page.goto('./components/card/gallery/')
  await page.reload()

  const authoredCard = page.locator('c2-card:has(> [slot="media"]):has(> [slot="footer"])').first()
  await authoredCard.evaluate((host) => (host.id = 'hydration-card'))
  const card = page.locator('#hydration-card')
  for (const part of ['media', 'header', 'body', 'footer']) await expect(card.locator(`[part="${part}"]`)).toBeVisible()

  await card.evaluate((host) => {
    for (const child of [...host.children]) child.remove()
  })
  for (const part of ['media', 'header', 'body', 'footer']) await expect(card.locator(`[part="${part}"]`)).toBeHidden()

  await card.evaluate((host) => {
    for (const slot of ['media', 'header', '', 'footer']) {
      const child = document.createElement(slot === 'footer' ? 'button' : 'div')
      if (slot) child.slot = slot
      child.textContent = `${slot || 'body'} restored after hydration`
      host.append(child)
    }
  })
  for (const part of ['media', 'header', 'body', 'footer']) await expect(card.locator(`[part="${part}"]`)).toBeVisible()
})
