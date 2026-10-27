import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const citation = (page: Page, selector = 'c2-citation') => page.locator(selector)
const marker = (page: Page, selector?: string) => citation(page, selector).locator('[part="marker"]')
const card = (page: Page, selector?: string) => citation(page, selector).locator('c2-hover-card')
const panel = (page: Page, selector?: string) => card(page, selector).locator('[popover]')

const SOURCE = `<p>Lit renders on the server<c2-citation index="1" href="https://www.lit.dev/docs/ssr/overview/" source-title="Server-side rendering – Lit"
  snippet="Lit's SSR renders components to static HTML in Node, then hydrates them in the browser." favicon="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"></c2-citation> and hydrates.</p>`

test('the marker is a numbered link to the source, named by its number and title', async ({ page, renderScenario }) => {
  await renderScenario(SOURCE)
  const link = page.getByRole('link', { name: 'Source 1: Server-side rendering – Lit' })
  await expect(link).toHaveText('1')
  await expect(link).toHaveAttribute('href', 'https://www.lit.dev/docs/ssr/overview/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await accessible(page)
})

test('hovering the marker opens a preview of the source: site, title, snippet and address', async ({ page, renderScenario }) => {
  await renderScenario(SOURCE)
  await expect(panel(page)).toBeHidden()
  await marker(page).hover()
  await expect(panel(page)).toBeVisible()
  await expect(citation(page).locator('[part="site"]')).toHaveText('lit.dev')
  await expect(citation(page).locator('[part="title"]')).toHaveText('Server-side rendering – Lit')
  await expect(citation(page).locator('[part="snippet"]')).toContainText('static HTML in Node')
  await expect(citation(page).locator('[part="url"]')).toHaveText('https://www.lit.dev/docs/ssr/overview/')
  await expect(citation(page).locator('[part="favicon"]')).toHaveAttribute('alt', '')
  // The card is the width the citation sets, bridged onto the hover card.
  expect(Math.abs((await panel(page).boundingBox())!.width - 300)).toBeLessThan(2)
  await accessible(page)
})

test('keyboard focus opens the preview and Escape closes it', async ({ page, renderScenario }) => {
  await renderScenario(SOURCE)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: /^Source 1/ })).toBeFocused()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
})

test('an address that is not http(s) never becomes a link, and its icon is not loaded', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-citation index="2" href="javascript:alert(1)" source-title="Untrusted" favicon="javascript:alert(2)" snippet="From model output."></c2-citation>`,
  )
  await expect(page.getByRole('link')).toHaveCount(0)
  const button = page.getByRole('button', { name: 'Source 2: Untrusted' })
  await expect(button).toHaveText('2')
  await button.focus()
  await expect(panel(page)).toBeVisible()
  await expect(citation(page).locator('[part="url"]')).toHaveCount(0)
  await expect(citation(page).locator('[part="favicon"]')).toHaveCount(0)
})

test('relative addresses stay links, and the slots replace the marker text and the card', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-citation href="/docs/ssr" source-title="SSR guide" site="Docs">docs<div slot="preview"><strong>Custom</strong> card</div></c2-citation>`,
  )
  const link = page.getByRole('link', { name: 'Source: SSR guide' })
  await expect(link).toHaveAttribute('href', '/docs/ssr')
  // Slotted text belongs to the light DOM; the marker's slot is what shows it.
  const shown = await marker(page)
    .locator('slot')
    .evaluate((slot) =>
      (slot as HTMLSlotElement)
        .assignedNodes()
        .map((node) => node.textContent)
        .join('')
        .trim(),
    )
  expect(shown).toBe('docs')
  const custom = citation(page).locator('[slot="preview"]')
  await expect(custom).toBeHidden()
  await link.hover()
  await expect(custom).toBeVisible()
  await expect(custom).toHaveText('Custom card')
  // The default card is the slot's fallback: still in the tree, never shown.
  await expect(citation(page).locator('[part="title"]')).toBeHidden()
})

test('the marker is named in the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-citation index="3" href="https://example.com" source-title="Exemple"></c2-citation></div>`)
  await expect(page.getByRole('link', { name: 'Source 3 : Exemple' })).toBeVisible()
})

test('a scheme hidden by tabs, line breaks or control characters is still caught, and any new-window target gets rel', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-citation id="tab" index="1" href="java&#9;script:alert(1)"></c2-citation><c2-citation id="nl" index="2" href="javas&#10;cript:alert(1)"></c2-citation><c2-citation id="ctl" index="4" source-title="x"></c2-citation><c2-citation id="named" index="3" href="https://example.com" target="sources"></c2-citation>`,
  )
  await expect(page.getByRole('link')).toHaveCount(1)
  await expect(marker(page, '#named')).toHaveAttribute('rel', 'noopener noreferrer')
  await citation(page, '#ctl').evaluate((element) => {
    element.href = '\u0001javascript:alert(1)'
    element.favicon = 'da\nta:image/gif;base64,R0lGODlhAQABAAAAACw='
  })
  await expect(page.getByRole('link')).toHaveCount(1)
  await expect(citation(page, '#ctl').locator('[part="favicon"]')).toHaveAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACw=')
})

test('Escape from a link inside a slotted preview closes the card and returns focus to the marker', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-citation index="1" href="https://example.com" source-title="Example"><div slot="preview"><a href="#more">More</a></div></c2-citation>`,
  )
  await page.keyboard.press('Tab')
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'More' })).toBeFocused()
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(page.getByRole('link', { name: /^Source 1/ })).toBeFocused()
})
