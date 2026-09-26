import { test, expect } from './fixture'
import type { LogViewer } from '../src/log-viewer'

async function captureClipboard(page: import('@playwright/test').Page, reject = false) {
  await page.evaluate((fail) => {
    const writes: string[] = []
    Object.assign(window, { logClipboardWrites: writes })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (fail) throw new Error('Clipboard denied')
          writes.push(text)
        },
      },
    })
  }, reject)
}

test('hover copy copies only the original message and provides feedback', async ({ page, scenario }) => {
  await scenario('entries')
  await captureClipboard(page)
  const viewer = page.locator('c2-log-viewer')
  const button = viewer.getByRole('button', { name: 'Copy message 2', exact: true })
  await expect(button).toHaveCSS('opacity', '0')
  await viewer.locator('[data-index="1"][part="entry"]').hover()
  await expect(button).toHaveCSS('opacity', '1')
  await button.click()
  expect(await page.evaluate(() => (window as unknown as { logClipboardWrites: string[] }).logClipboardWrites)).toEqual(['Retry requested\nAttempt 2'])
  await expect(viewer.getByRole('status')).toHaveText('Copied message 2')
  await expect(button).toHaveAttribute('title', 'Copied')
})

test('keyboard copy works in plain mode and copies the full virtualized message', async ({ page, scenario }) => {
  await scenario('tall')
  await captureClipboard(page)
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => {
    ;(element as LogViewer).tabular = false
  })
  const button = viewer.getByRole('button', { name: 'Copy message 1', exact: true })
  await button.focus()
  await expect(button).toHaveCSS('opacity', '1')
  await page.keyboard.press('Enter')
  const copied = await page.evaluate(() => (window as unknown as { logClipboardWrites: string[] }).logClipboardWrites[0])
  expect(copied.split('\n')).toHaveLength(120)
  expect(copied).toContain('long line 0')
  expect(copied).toContain('long line 119')
  expect(await viewer.locator('.plain').first().textContent()).not.toBe(copied)
})

test('copy follows the source entry after filtering and reports clipboard failure', async ({ page, scenario }) => {
  await scenario('entries')
  await captureClipboard(page)
  const viewer = page.locator('c2-log-viewer')
  await viewer.evaluate((element) => (element as LogViewer).setFilter({ attributes: { level: 'error' } }))
  const button = viewer.getByRole('button', { name: 'Copy message 3', exact: true })
  await button.focus()
  await page.keyboard.press('Enter')
  expect(await page.evaluate(() => (window as unknown as { logClipboardWrites: string[] }).logClipboardWrites)).toEqual(['<failed>'])
  await captureClipboard(page, true)
  await page.keyboard.press('Enter')
  await expect(viewer.getByRole('status')).toHaveText('Unable to copy message. Try again.')
})

for (const tabular of [true, false]) {
  test(`scroll hides pointer copy until the pointer moves (${tabular ? 'tabular' : 'plain'})`, async ({ page, scenario }) => {
    await scenario('tall')
    const viewer = page.locator('c2-log-viewer')
    await viewer.evaluate((element, mode) => {
      ;(element as LogViewer).tabular = mode
    }, tabular)
    const button = viewer.getByRole('button', { name: 'Copy message 1', exact: true })
    await viewer.evaluate(async (element) => {
      const log = element as LogViewer
      log.setFilter(null)
      await log.updateComplete
    })
    await viewer.hover({ position: { x: 100, y: 30 } })
    await expect(button).toHaveCSS('opacity', '1')
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    await expect(viewer.locator('.copy-area').first()).toHaveCSS('padding-top', '4px')
    await viewer.locator('[part="viewport"]').evaluate((element) => {
      element.scrollTop += 100
    })
    await expect(button).toHaveCSS('opacity', '0')
    await expect(button).toHaveCSS('pointer-events', 'none')
    const bounds = await viewer.boundingBox()
    await page.mouse.move(bounds!.x + 110, bounds!.y + 40)
    await expect(button).toHaveCSS('opacity', '1')
    await page.mouse.move(0, 0)
    await expect(button).toHaveCSS('opacity', '0')
  })
}
