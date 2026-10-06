import type { Locator } from '@playwright/test'
import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const indicator = (host: Locator) => host.locator('[part="indicator"]')

/** Distance from the indicator's centre to the target's top-left corner, rounded to whole pixels. */
async function centre(host: Locator) {
  const [target, mark] = [(await host.locator('.target').boundingBox())!, (await indicator(host).boundingBox())!]
  return { x: Math.round(mark.x + mark.width / 2 - target.x), y: Math.round(mark.y + mark.height / 2 - target.y) }
}

test('without a count or label it is a dot pinned to the top-end corner, and the wrapped element stays usable', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator><button class="target">Inbox</button></c2-indicator>')
  const host = page.locator('c2-indicator')
  await expect(indicator(host)).toBeVisible()
  await expect(indicator(host)).toHaveText('')
  await expect(indicator(host)).toHaveClass(/is-dot/)
  await expect.poll(() => centre(host)).toEqual({ x: 80, y: 0 })

  await page.getByRole('button', { name: 'Inbox' }).click({ position: { x: 76, y: 4 } })
  await expect(page.getByRole('button', { name: 'Inbox' })).toBeFocused()
  await accessible(page)
})

test('count caps at max, and zero hides it unless show-zero is set', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator count="125"><span class="target">Inbox</span></c2-indicator>')
  const host = page.locator('c2-indicator')
  await expect(indicator(host)).toHaveText('99+')
  await props(host, { max: 999 })
  await expect(indicator(host)).toHaveText('125')
  await props(host, { count: 0 })
  await expect(indicator(host)).toBeHidden()
  await props(host, { showZero: true })
  await expect(indicator(host)).toHaveText('0')
  await expect(indicator(host)).toBeVisible()
})

test('invisible hides the indicator and its announcement', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator count="3" accessible-label="{count} unread"><button class="target">Inbox</button></c2-indicator>')
  const host = page.locator('c2-indicator')
  await expect(host.locator('.visually-hidden')).toHaveText('3 unread')
  await props(host, { invisible: true })
  await expect(indicator(host)).toBeHidden()
  await expect(host.locator('.visually-hidden')).toHaveCount(0)
  await props(host, { invisible: false })
  await expect(indicator(host)).toBeVisible()
})

test('accessible-label replaces the visible count in the accessibility tree', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator count="7" accessible-label="{count} unread messages"><button class="target">Inbox</button></c2-indicator>')
  await expect(page.locator('main')).toMatchAriaSnapshot(`
    - main:
      - button "Inbox"
      - text: 7 unread messages
  `)
  await accessible(page)
})

test('the label slot replaces the dot, and a count wins over it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator><span class="target">Tab</span><span slot="label">New</span></c2-indicator>')
  const host = page.locator('c2-indicator')
  await expect(indicator(host)).not.toHaveClass(/is-dot/)
  await expect(host.locator('[slot="label"]')).toBeVisible()
  await props(host, { count: 4 })
  await expect(indicator(host)).toHaveText('4')
  await expect(host.locator('[slot="label"]')).toBeHidden()
  await props(host, { count: undefined })
  await host.locator('[slot="label"]').evaluate((element) => element.remove())
  await expect(indicator(host)).toHaveClass(/is-dot/)
})

test('positions sit on each edge of the target, mirrored in a right-to-left page', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator><span class="target"></span></c2-indicator>')
  const host = page.locator('c2-indicator')
  const expected: Record<string, { x: number; y: number }> = {
    'top-start': { x: 0, y: 0 },
    'top-center': { x: 40, y: 0 },
    'top-end': { x: 80, y: 0 },
    'middle-start': { x: 0, y: 20 },
    'middle-end': { x: 80, y: 20 },
    'bottom-start': { x: 0, y: 40 },
    'bottom-center': { x: 40, y: 40 },
    'bottom-end': { x: 80, y: 40 },
  }
  for (const [position, point] of Object.entries(expected)) {
    await props(host, { position })
    await expect.poll(() => centre(host), position).toEqual(point)
  }

  await page.locator('main').evaluate((main) => main.setAttribute('dir', 'rtl'))
  await props(host, { position: 'top-end' })
  await expect.poll(() => centre(host)).toEqual({ x: 0, y: 0 })
  await props(host, { position: 'middle-start' })
  await expect.poll(() => centre(host)).toEqual({ x: 80, y: 20 })
})

test('offsets move the indicator inwards, and 14.6% puts it on a round target', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator><span class="target" style="width: 80px; height: 80px; border-radius: 50%"></span></c2-indicator>')
  const host = page.locator('c2-indicator')
  await host.evaluate((element) => {
    element.style.setProperty('--c2-indicator--offset-x', '10px')
    element.style.setProperty('--c2-indicator--offset-y', '6px')
  })
  await expect.poll(() => centre(host)).toEqual({ x: 70, y: 6 })
  await host.evaluate((element) => {
    element.style.setProperty('--c2-indicator--offset-x', '14.6%')
    element.style.setProperty('--c2-indicator--offset-y', '14.6%')
  })
  await expect.poll(() => centre(host)).toEqual({ x: 68, y: 12 })
})

test('tone selects the colour pair, and the background variable overrides it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator count="2"><span class="target"></span></c2-indicator>')
  const host = page.locator('c2-indicator')
  await expect(indicator(host)).toHaveCSS('background-color', 'rgb(220, 38, 38)')
  await props(host, { tone: 'primary' })
  await expect(indicator(host)).toHaveCSS('background-color', 'rgb(2, 101, 220)')
  await host.evaluate((element) => element.style.setProperty('--c2-indicator--background', 'rgb(1, 2, 3)'))
  await expect(indicator(host)).toHaveCSS('background-color', 'rgb(1, 2, 3)')
})

test('a negative or non-numeric count hides the indicator instead of showing it verbatim or as a dot', async ({ page, renderScenario }) => {
  await renderScenario('<c2-indicator count="-3" accessible-label="{count} unread"><span class="target">Inbox</span></c2-indicator>')
  const host = page.locator('c2-indicator')
  await expect(indicator(host)).toBeHidden()
  await expect(host.locator('.visually-hidden')).toHaveCount(0)
  await props(host, { count: Number.NaN })
  await expect(indicator(host)).toBeHidden()
  await props(host, { count: 2 })
  await expect(indicator(host)).toHaveText('2')
})
