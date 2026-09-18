import { accessible } from '../../../../tests/component-fixture'
import type { QrCode } from '../src/qr-code'
import { test, expect } from './fixture'

test('renders an accessible SVG image for its value', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-qr-code')
  const image = page.getByRole('img', { name: 'C2N website QR code' })

  await expect(image).toBeVisible()
  await expect(host.locator('.modules')).toHaveAttribute('d', /M/)
  await expect(host.locator('.container')).toHaveCSS('width', '160px')
})

test('uses the configured quiet zone and error correction level', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-qr-code')
  const initialViewBox = await host.locator('svg').getAttribute('viewBox')

  await host.evaluate(async (element: QrCode) => {
    element.margin = 8
    element.errorCorrection = 'H'
    await element.updateComplete
  })

  await expect(host).toHaveAttribute('margin', '8')
  await expect(host).toHaveAttribute('error-correction', 'H')
  await expect.poll(() => host.locator('svg').getAttribute('viewBox')).not.toBe(initialViewBox)
})

test('renders a useful empty state', async ({ page, scenario }) => {
  await scenario('empty')
  await expect(page.getByRole('img', { name: 'Empty payment code' })).toContainText('No value')
})

test('shows optional center content only when supplied', async ({ page, scenario }) => {
  await scenario('center')
  const host = page.locator('c2-qr-code')

  await expect(host.locator('.center')).toBeVisible()
  await expect(host.getByText('C2')).toBeVisible()
})

test('exports a standalone SVG data URL', async ({ page, scenario }) => {
  await scenario()
  const dataUrl = await page.locator('c2-qr-code').evaluate((element: QrCode) => element.toDataURL('svg'))

  expect(dataUrl).toMatch(/^data:image\/svg\+xml/)
  expect(decodeURIComponent(dataUrl)).toContain('<path')
})

test('reports values that exceed QR capacity', async ({ page, scenario }) => {
  await scenario()
  const host = page.locator('c2-qr-code')

  await host.evaluate(async (element: QrCode) => {
    element.value = 'x'.repeat(10000)
    await element.updateComplete
  })

  await expect(host).toHaveAttribute('data-error', /too|large|capacity|length/i)
  await expect(host.getByText('Unable to generate QR code')).toBeVisible()
})

test('has no detectable accessibility violations', async ({ page, scenario }) => {
  await scenario('center')
  await accessible(page)
})
