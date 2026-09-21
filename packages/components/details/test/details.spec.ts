import { test, expect, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('header-content presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const region = page.locator('c2-details').locator('[part="header-content"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-details label="Settings"><span slot="header-content" data-slot-presence-probe>Edit</span></c2-details>',
    host: 'c2-details',
    slot: 'header-content',
    assertPresent: async (present) => (present ? expect(region).toBeVisible() : expect(region).toBeHidden()),
  })
})
import type { Details } from '../src/details'

test('click and keyboard expand and collapse content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  const summary = page.locator('summary')
  await expect(page.getByText('Arrives tomorrow')).not.toBeVisible()
  await summary.click()
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await summary.press('Enter')
  await expect(page.getByText('Arrives tomorrow')).not.toBeVisible()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  await accessible(page)
})
test('disabled disclosure ignores pointer and keyboard activation', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Locked" disabled>Secret</c2-details>')
  await page.locator('summary').click()
  await page.locator('summary').press('Space')
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})
test('interactive header content does not toggle the panel', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Settings"><button slot="header-content">Edit</button>Panel</c2-details>')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})

test('public parts style title, header content and body regions', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details expanded><span slot="title">Title</span><button slot="header-content">Edit</button><p>Body</p></c2-details>')
  await page.addStyleTag({
    content:
      'c2-details::part(title){background:rgb(1,2,3)}c2-details::part(header-content){background:rgb(4,5,6)}c2-details::part(body){background:rgb(7,8,9)}',
  })
  const host = page.locator('c2-details')
  await expect(host.locator('.c2-details-summary-content')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.c2-details-header-content')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-details-body')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
})

test('opens on the first activation while restored state is waiting to render', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  await page.locator('c2-details').evaluate((element) => {
    const details = element as Details
    details.expanded = true
    details.shadowRoot?.querySelector('summary')?.click()
  })
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', true)
})
