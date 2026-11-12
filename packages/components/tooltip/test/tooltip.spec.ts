import { test, expect } from '../../../../tests/component-fixture'
import type { Locator, Page } from '@playwright/test'

// The tooltip links itself through `ariaDescribedByElements`, which Playwright's own accessible-description
// computation does not read (it follows `aria-describedby` ids only): read the reference instead.
const describedBy = (control: Locator) =>
  control.evaluate((element) => (element.ariaDescribedByElements ?? []).map((other) => other.textContent?.trim()).join(' '))

/** The description Chromium's accessibility tree computes for the button named `name`. */
async function axDescription(page: Page, name: string) {
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = await cdp.send('Accessibility.getFullAXTree')
  return nodes.find((node) => node.role?.value === 'button' && node.name?.value === name)?.description?.value
}

const markup = '<button id="target">Help</button><c2-tooltip for="target" delay="0">More information</c2-tooltip>'
test('hover reveals a description and leaving hides it', async ({ page, renderScenario }) => {
  await renderScenario(markup)
  const tooltip = page.locator('c2-tooltip')
  await page.getByRole('button', { name: 'Help' }).hover()
  await expect(tooltip).toHaveText('More information')
  await expect(tooltip).toHaveHostAria('role', 'tooltip')
  await expect.poll(() => describedBy(page.getByRole('button', { name: 'Help' }))).toBe('More information')
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

test('the open tooltip follows its target when the page scrolls', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="height:400px"></div>${markup}<div style="height:2000px"></div>`)
  const tooltip = page.locator('c2-tooltip')
  const target = page.getByRole('button', { name: 'Help' })
  await target.focus()
  await expect(tooltip).toBeVisible()
  const gap = async () => (await tooltip.boundingBox())!.y - (await target.boundingBox())!.y
  const before = await gap()
  await page.evaluate(() => window.scrollBy(0, 150))
  await expect.poll(gap).toBeCloseTo(before, -1)
  expect((await target.boundingBox())!.y).toBeLessThan(400)
})

// WCAG 1.4.13 hoverable: the pointer can cross onto the bubble to read it without it closing.
test('moving the pointer from the target onto the bubble keeps it open', async ({ page, renderScenario }) => {
  await renderScenario('<button id="target" style="margin-top: 120px">Help</button><c2-tooltip for="target" delay="0">More information</c2-tooltip>')
  const tooltip = page.locator('c2-tooltip')
  await page.getByRole('button', { name: 'Help' }).hover()
  await expect(tooltip).toBeVisible()
  const box = (await tooltip.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 })
  await page.waitForTimeout(400)
  await expect(tooltip).toBeVisible()
  await page.mouse.move(1, 1)
  await expect(tooltip).not.toBeVisible()
})

// WCAG 1.4.13 dismissible: a hover-only user, whose focus is elsewhere, can still close it with Escape.
test('Escape closes the open tooltip wherever focus is', async ({ page, renderScenario }) => {
  await renderScenario(`<input aria-label="Elsewhere">${markup}`)
  const tooltip = page.locator('c2-tooltip')
  await page.getByRole('textbox', { name: 'Elsewhere' }).focus()
  await page.getByRole('button', { name: 'Help' }).hover()
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).not.toBeVisible()
})

test('describes its target by element reference, without writing an id on itself', async ({ page, renderScenario, browserName }) => {
  await renderScenario(markup)
  const button = page.getByRole('button', { name: 'Help' })
  await expect.poll(() => describedBy(button)).toBe('More information')
  await expect(page.locator('c2-tooltip')).not.toHaveAttribute('id')
  if (browserName !== 'chromium') return
  await expect.poll(() => axDescription(page, 'Help')).toBe('More information')
})

test('describes the focusable control inside a custom-element target', async ({ page, renderScenario, browserName }) => {
  await renderScenario('<test-trigger id="target"></test-trigger><c2-tooltip for="target" delay="0">Opens the settings</c2-tooltip>')
  // Defined after the tooltip connected, like a lazily loaded component: the link moves to the inner button.
  await page.evaluate(() =>
    customElements.define(
      'test-trigger',
      class extends HTMLElement {
        constructor() {
          super()
          this.attachShadow({ mode: 'open', delegatesFocus: true }).innerHTML = '<button>Settings</button>'
        }
      },
    ),
  )
  await expect.poll(() => describedBy(page.getByRole('button', { name: 'Settings' }))).toBe('Opens the settings')
  await expect.poll(() => describedBy(page.locator('test-trigger'))).toBe('')
  if (browserName === 'chromium') await expect.poll(() => axDescription(page, 'Settings')).toBe('Opens the settings')
})

// The Escape that closes a tooltip is spent: a modal the tooltip sits in must not close on the same key press.
test('Escape closes a tooltip inside an open modal and leaves the modal open', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-modal label="Settings" open><button id="target">Help</button><c2-tooltip for="target" delay="0">More information</c2-tooltip></c2-modal>',
  )
  const modal = page.locator('c2-modal')
  const tooltip = page.locator('c2-tooltip')
  await page.getByRole('button', { name: 'Help' }).hover()
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).not.toBeVisible()
  await expect.poll(() => modal.evaluate((el) => (el as HTMLElement & { open: boolean }).open)).toBe(true)
  expect(await modal.evaluate((el) => el.shadowRoot!.querySelector('dialog')!.matches(':modal'))).toBe(true)
  await page.keyboard.press('Escape')
  await expect.poll(() => modal.evaluate((el) => (el as HTMLElement & { open: boolean }).open)).toBe(false)
})

/** The text of every element the c2-text-field's inner input is described by, and its own `aria-describedby`. */
const innerDescription = (page: Page) =>
  page.locator('c2-text-field').evaluate((field) => {
    const input = field.shadowRoot!.querySelector('input')!
    return {
      references: (input.ariaDescribedByElements ?? []).map((element) => element.textContent?.trim()),
      attribute: input.getAttribute('aria-describedby'),
    }
  })

// The field's template owns the inner input's `aria-describedby`: a re-render rewrites it and drops the element
// reference the tooltip set on top. The tooltip links again the next time the target is entered.
test('relinks its description after the field re-renders the control aria-describedby', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-form-field label="Name"><c2-text-field id="target"></c2-text-field></c2-form-field><c2-tooltip for="target" delay="0">Your full name</c2-tooltip>',
  )
  await expect.poll(async () => (await innerDescription(page)).references).toContain('Your full name')

  await page.locator('c2-form-field').evaluate((el) => ((el as HTMLElement & { hint: string }).hint = 'As on your passport'))
  await expect.poll(async () => (await innerDescription(page)).attribute).toBe('c2-field-description')
  expect((await innerDescription(page)).references).not.toContain('Your full name')

  await page.locator('c2-text-field').hover()
  await expect(page.locator('c2-tooltip')).toBeVisible()
  await expect.poll(async () => (await innerDescription(page)).references).toEqual(['As on your passport', 'Your full name'])

  await page.locator('c2-tooltip').evaluate((el) => el.remove())
  expect(await innerDescription(page)).toEqual({ references: ['As on your passport'], attribute: 'c2-field-description' })
})

test('removing the tooltip leaves the aria-describedby the field rendered since, not a stale one', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-form-field label="Name" hint="As on your passport"><c2-text-field id="target"></c2-text-field></c2-form-field><c2-tooltip for="target" delay="0">Your full name</c2-tooltip>',
  )
  await expect.poll(async () => (await innerDescription(page)).references).toEqual(['As on your passport', 'Your full name'])

  // The hint goes away: the field stops rendering the attribute, and with it the tooltip's link.
  await page.locator('c2-form-field').evaluate((el) => ((el as HTMLElement & { hint: string }).hint = ''))
  await expect.poll(async () => (await innerDescription(page)).references).toEqual([])

  await page.locator('c2-tooltip').evaluate((el) => el.remove())
  expect(await innerDescription(page)).toEqual({ references: [], attribute: null })
})
