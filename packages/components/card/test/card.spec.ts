import { test, expect, props, watch, accessible, pointerClick, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('default-slot presence follows assignment, text, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const body = page.locator('c2-card').locator('[part="body"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-card><span data-slot-presence-probe>Body</span></c2-card>',
    host: 'c2-card',
    text: true,
    assertPresent: async (present) => (present ? expect(body).toBeVisible() : expect(body).toBeHidden()),
  })
})

test('slotted sections appear and empty sections collapse', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card><h2 slot="header">Title</h2><p>Body</p><button slot="footer">Action</button></c2-card>')
  await expect(page.getByRole('heading', { name: 'Title' })).toBeVisible()
  await expect(page.getByText('Body', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Action' })).toBeVisible()
  await expect(page.locator('.c2-card-media')).not.toBeVisible()
  await accessible(page)
})
test('interactive cards activate once on Enter and disabled cards suppress clicks', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card interactive>Open project</c2-card>')
  const host = page.locator('c2-card')
  await watch(host, 'click')
  await page.getByRole('button', { name: 'Open project' }).press('Enter')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await props(host, { disabled: true })
  await pointerClick(host)
  await expect(host).toHaveAttribute('data-events', '[null]')
})
test('link cards navigate to their destination', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card href="#project">Open project</c2-card>')
  await page.getByRole('link', { name: 'Open project' }).click()
  await expect(page).toHaveURL(/#project$/)
})

test('public parts style every slotted region without changing assignment', async ({ page, renderScenario }) => {
  await renderScenario('<c2-card><img slot="media" alt="Cover"><h2 slot="header">Title</h2><p>Body</p><button slot="footer">Action</button></c2-card>')
  await page.addStyleTag({
    content: `
      c2-card::part(media) { background: rgb(1, 2, 3); }
      c2-card::part(header) { background: rgb(4, 5, 6); }
      c2-card::part(body) { background: rgb(7, 8, 9); }
      c2-card::part(footer) { background: rgb(10, 11, 12); }
    `,
  })
  const host = page.locator('c2-card')
  await expect(host.locator('.c2-card-media')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.c2-card-header')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-card-content')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  await expect(host.locator('.c2-card-footer')).toHaveCSS('background-color', 'rgb(10, 11, 12)')
  await expect(host.locator('[slot="media"]')).toBeVisible()
  await expect(host.getByRole('heading', { name: 'Title' })).toBeVisible()
  await expect(host.getByText('Body', { exact: true })).toBeVisible()
  await expect(host.getByRole('button', { name: 'Action' })).toBeVisible()
})
