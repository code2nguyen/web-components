import { test, expect, props, watch, accessible, pointerClick } from '../../../../tests/component-fixture'

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
