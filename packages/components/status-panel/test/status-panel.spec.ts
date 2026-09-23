import { accessible } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

test('renders attribute copy and the default icon for a status', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-status-panel')

  await expect(host.getByRole('heading', { name: 'Workspace ready' })).toHaveAttribute('aria-level', '2')
  await expect(host.getByText('You can start inviting teammates.')).toBeVisible()
  await expect(host.locator('.media svg')).toBeVisible()
  await expect(host.locator('.media')).toHaveCSS('color', 'rgb(21, 128, 61)')
})

test('renders every compositional slot and replaces the default media', async ({ page, scenario }) => {
  await scenario('custom')
  const host = page.locator('c2-status-panel')

  await expect(host.locator('[slot="media"]')).toBeVisible()
  await expect(host.locator('.media slot > svg')).toBeHidden()
  await expect(host.getByRole('heading', { name: 'Import failed' })).toBeVisible()
  await expect(host.getByRole('button', { name: 'Review' })).toBeVisible()
  await expect(host.getByText('Row 42')).toBeVisible()
  await expect(host.locator('.container')).toHaveCSS('align-items', 'flex-start')
})

test('responds when optional slotted regions are added dynamically', async ({ page, scenario }) => {
  await scenario('dynamic')
  const host = page.locator('c2-status-panel')
  await expect(host.locator('.actions')).toBeHidden()

  await host.evaluate(async (element) => {
    const button = document.createElement('button')
    button.slot = 'actions'
    button.textContent = 'Continue'
    element.append(button)
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })

  await expect(host.getByRole('button', { name: 'Continue' })).toBeVisible()
  await expect(host.locator('.actions')).toBeVisible()
})

test('supports a custom heading level', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-status-panel')
  await host.evaluate(async (element) => {
    element.setAttribute('heading-level', '3')
    await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
  await expect(host.getByRole('heading', { level: 3, name: 'Workspace ready' })).toBeVisible()
})

test('has no detectable accessibility violations', async ({ page, scenario }) => {
  await scenario('custom')
  await accessible(page)
})

test('exposes loading and empty as distinct semantic states', async ({ page, scenario }) => {
  await scenario('loading')
  const loading = page.locator('c2-status-panel')
  await expect(loading.locator('.container')).toHaveAttribute('role', 'status')
  await expect(loading.locator('.container')).toHaveAttribute('aria-busy', 'true')
  await expect(loading.locator('.loading-icon')).toBeVisible()

  await scenario('empty')
  const empty = page.locator('c2-status-panel')
  await expect(empty.locator('.container')).not.toHaveAttribute('role')
  await expect(empty.getByRole('heading', { name: 'No services' })).toBeVisible()
  await expect(empty.locator('.media svg')).toBeVisible()
})

test('public parts style assigned and fallback slot regions independently', async ({ page, scenario }) => {
  await scenario('custom')
  await page.addStyleTag({
    content: `
      c2-status-panel::part(media) { background: rgb(1, 2, 3); }
      c2-status-panel::part(title) { background: rgb(4, 5, 6); }
      c2-status-panel::part(description) { background: rgb(7, 8, 9); }
      c2-status-panel::part(content) { background: rgb(10, 11, 12); }
      c2-status-panel::part(actions) { background: rgb(13, 14, 15); }
    `,
  })
  const host = page.locator('c2-status-panel')
  await expect(host.locator('.media')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.title')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.description')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
  await expect(host.locator('.content')).toHaveCSS('background-color', 'rgb(10, 11, 12)')
  await expect(host.locator('.actions')).toHaveCSS('background-color', 'rgb(13, 14, 15)')
  await expect(host.locator('[slot="media"]')).toBeVisible()
  await expect(host.getByRole('heading', { name: 'Import failed' })).toBeVisible()

  await host.locator('[slot="media"]').evaluate((element) => element.remove())
  await expect(host.locator('.media svg')).toBeVisible()
  await expect(host.locator('.media')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
})
