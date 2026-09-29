import { test, expect } from '../../../../tests/component-fixture'

const markup = '<button id="target">Help</button><c2-tooltip for="target" delay="0">More information</c2-tooltip>'
test('hover reveals a description and leaving hides it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const tooltip = page.locator('c2-tooltip')
  await page.getByRole('button', { name: 'Help' }).hover()
  await expect(tooltip).toHaveText('More information')
  await expect(tooltip).toHaveHostAria('role', 'tooltip')
  await expect(page.getByRole('button', { name: 'Help' })).toHaveAccessibleDescription('More information')
  await page.mouse.move(1, 1)
  await expect(tooltip).not.toBeVisible()
})
test('keyboard focus reveals the tooltip and Escape dismisses it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const tooltip = page.locator('c2-tooltip')
  await page.getByRole('button', { name: 'Help' }).focus()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveHostAria('role', 'tooltip')
  await page.keyboard.press('Escape')
  await expect(tooltip).not.toBeVisible()
})
test('removing the tooltip restores existing descriptions', async ({ page, renderScenario }) => {
  await renderScenario(
    '<span id="existing">Existing help</span><button id="target" aria-describedby="existing">Help</button><c2-tooltip for="target">More</c2-tooltip>',
  )
  await page.locator('c2-tooltip').evaluate((el) => el.remove())
  await expect(page.getByRole('button')).toHaveAttribute('aria-describedby', 'existing')
})

test('changing the public offset while open repositions the tooltip', async ({ page, renderScenario }) => {
  await renderScenario('<button id="target" style="margin-top: 200px">Help</button><c2-tooltip for="target">More information</c2-tooltip>')
  const tooltip = page.locator('c2-tooltip')
  await tooltip.evaluate((element) => element.setAttribute('open', ''))
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveAttribute('current-placement', 'top')
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const originalTop = await tooltip.evaluate((element) => Number.parseFloat(getComputedStyle(element).top))

  await tooltip.evaluate((element) => (element as HTMLElement).style.setProperty('--c2-tooltip--offset', '48px'))
  await expect.poll(() => tooltip.evaluate((element) => Number.parseFloat(getComputedStyle(element).top))).toBeLessThan(originalTop - 30)

  await tooltip.evaluate((element) => (element as HTMLElement).style.removeProperty('--c2-tooltip--offset'))
  await expect.poll(() => tooltip.evaluate((element) => Number.parseFloat(getComputedStyle(element).top))).toBeGreaterThan(originalTop - 2)
})

// React hydrates server markup against what the element looks like after it upgrades, and reports every attribute
// the element wrote on itself as a mismatch. The tooltip role therefore lives on ElementInternals; the description
// link is written on the target, which is the one place ARIA can express it.
test('states its semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const tooltip = page.locator('c2-tooltip')
  const hostSemantics = () => tooltip.evaluate((element) => element.getAttributeNames().filter((name) => name === 'role' || name.startsWith('aria-')))

  await expect(tooltip).toHaveHostAria('role', 'tooltip')
  expect(await hostSemantics()).toEqual([])

  await page.getByRole('button', { name: 'Help' }).focus()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toHaveHostAria('role', 'tooltip')
  expect(await hostSemantics()).toEqual([])

  await page.keyboard.press('Escape')
  await expect(tooltip).not.toBeVisible()
  expect(await hostSemantics()).toEqual([])
})
