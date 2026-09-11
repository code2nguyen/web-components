import { test, expect, watch } from '../../../../tests/component-fixture'

const markup =
  '<c2-side-nav desktop-mode="over"><nav slot="side-nav-content" aria-label="Primary"><button>Drawer action</button></nav><button side-nav-toggle>Open navigation</button><p>Page content</p></c2-side-nav>'
test('toggle opens the overlay, makes content inert, and Escape restores focus', async ({ page, renderScenario, tab }) => {
  await renderScenario(markup)
  const host = page.locator('c2-side-nav')
  await watch(host, 'opened-change')
  await tab()
  await page.getByRole('button', { name: 'Open navigation' }).press('Enter')
  await expect(host).toHaveJSProperty('opened', true)
  await expect(page.getByRole('button', { name: 'Drawer action' })).toBeFocused()
  await expect(page.locator('[part="content"]')).toHaveAttribute('inert', '')
  await page.keyboard.press('Escape')
  await expect(host).toHaveJSProperty('opened', false)
  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeFocused()
  await expect(host).toHaveAttribute('data-events', '[{"opened":true},{"opened":false}]')
})
test('responsive mode collapses on phone and restores desktop preference', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await renderScenario('<c2-side-nav opened><nav slot="side-nav-content">Navigation</nav><p>Content</p></c2-side-nav>')
  await expect(page.locator('c2-side-nav')).toHaveJSProperty('opened', true)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('c2-side-nav')).toHaveJSProperty('opened', false)
  await page.setViewportSize({ width: 1400, height: 900 })
  await expect(page.locator('c2-side-nav')).toHaveJSProperty('opened', true)
})
