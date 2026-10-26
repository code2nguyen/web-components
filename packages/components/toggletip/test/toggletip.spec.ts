import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const help = `
  <label for="vat">VAT number</label>
  <c2-toggletip>
    <p>Your EU VAT number, starting with the country code.</p>
    <a href="#docs">Where to find it</a>
  </c2-toggletip>
  <input id="vat" />
  <button id="after">After</button>
`

const button = (page: Page) => page.getByRole('button', { name: 'More information' })
const panel = (page: Page) => page.locator('c2-toggletip').locator('[part="panel"]')

test('a press opens the bubble, announces its content and marks the button expanded', async ({ page, renderScenario }) => {
  await renderScenario(help)
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(panel(page)).toBeHidden()
  // The live region is empty while closed, so nothing is read before the user asks.
  await expect(page.locator('c2-toggletip').locator('[part="content"]')).toHaveText('')
  await button(page).click()
  await expect(button(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(panel(page)).toBeVisible()
  await expect(page.getByText('Your EU VAT number')).toBeVisible()
  // The content is rendered through a slot inside the live region, which is what a screen reader announces.
  const announced = await page.locator('c2-toggletip p').evaluate((p) => p.assignedSlot?.closest('[role="status"]') !== null && p.assignedSlot !== null)
  expect(announced).toBe(true)
  await expect(page.getByRole('link', { name: 'Where to find it' })).toBeVisible()
  await expect(button(page)).toBeFocused()
  await accessible(page)
  await button(page).click()
  await expect(panel(page)).toBeHidden()
  await expect(button(page)).toHaveAttribute('aria-expanded', 'false')
})

test('opens from the keyboard, Tab continues into a link inside, and leaving it closes the bubble', async ({ page, renderScenario, tab }) => {
  await renderScenario(help)
  await page.locator('label').click()
  await tab(true)
  await expect(button(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeVisible()
  await tab()
  await expect(page.getByRole('link', { name: 'Where to find it' })).toBeFocused()
  await tab()
  await expect(page.locator('#vat')).toBeFocused()
  await expect(panel(page)).toBeHidden()
})

test('Escape closes and returns focus to the button, from the button or from inside the bubble', async ({ page, renderScenario, tab }) => {
  await renderScenario(help)
  await button(page).click()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(button(page)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(panel(page)).toBeVisible()
  await tab()
  await expect(page.getByRole('link', { name: 'Where to find it' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(button(page)).toBeFocused()
})

test('a press outside closes it; a press inside does not', async ({ page, renderScenario }) => {
  await renderScenario(help)
  await button(page).click()
  await page.getByText('Your EU VAT number').click()
  await expect(panel(page)).toBeVisible()
  await page.locator('#after').click()
  await expect(panel(page)).toBeHidden()
})

test('a tap opens it on touch', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 700 } })
  const page = await context.newPage()
  const base = test.info().project.use.baseURL
  await page.goto(`${base}/packages/components/toggletip/test/scenarios.html`)
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.modulesReady)).toBe('true')
  await page.locator('main').evaluate((main, markup) => (main.innerHTML = markup), help)
  await page.waitForFunction(() => customElements.get('c2-toggletip'))
  await button(page).tap()
  await expect(panel(page)).toBeVisible()
  await context.close()
})

test('fires show and hide, and opens from code', async ({ page, renderScenario }) => {
  await renderScenario(help)
  const events = await page.locator('c2-toggletip').evaluate(async (el: HTMLElement & { open: boolean; updateComplete: Promise<unknown> }) => {
    const seen: string[] = []
    el.addEventListener('show', () => seen.push('show'))
    el.addEventListener('hide', () => seen.push('hide'))
    el.open = true
    await el.updateComplete
    el.open = false
    await el.updateComplete
    return seen
  })
  expect(events).toEqual(['show', 'hide'])
})

test('sits beside the button with its arrow, and flips when there is no room above', async ({ page, renderScenario }) => {
  await renderScenario('<div style="position: fixed; top: 4px; left: 120px"><c2-toggletip>Near the top edge</c2-toggletip></div>')
  await button(page).click()
  await expect(panel(page)).toHaveAttribute('data-placement', /^bottom/)
  const [b, p] = await Promise.all([button(page).boundingBox(), panel(page).boundingBox()])
  expect(p!.y).toBeGreaterThan(b!.y + b!.height)
  await expect(page.locator('c2-toggletip').locator('[part="arrow"]')).toBeVisible()
})

test('label names the button; words in the icon slot name it themselves; the default name is translatable', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-toggletip id="a" label="About billing periods">Monthly or yearly.</c2-toggletip>
    <c2-toggletip id="b"><span slot="icon">What's this?</span>Explained.</c2-toggletip>
    <div lang="fr"><c2-toggletip id="c">Aide.</c2-toggletip></div>
  `)
  await expect(page.getByRole('button', { name: 'About billing periods' })).toBeVisible()
  await expect(page.getByRole('button', { name: "What's this?" })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plus d’informations' })).toBeVisible()
})
