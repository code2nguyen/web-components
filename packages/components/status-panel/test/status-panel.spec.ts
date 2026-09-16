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
