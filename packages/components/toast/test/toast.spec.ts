import type { Locator, Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

test('standalone action and dismissal emit events and announce the message', async ({ page, renderScenario }) => {
  await renderScenario('<c2-toast message="Saved" dismissible action-label="Undo"></c2-toast>')
  const host = page.locator('c2-toast')
  await watch(host, 'toast-action')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(host).not.toHaveAttribute('data-events', '[]')
  await accessible(page)
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(host).not.toBeVisible()
})
test('a region queues overflow and promotes the next toast after dismissal', async ({ page, renderScenario }) => {
  await renderScenario('<c2-toast-region inline max-visible="1" animation-duration="0"></c2-toast-region>')
  const region = page.locator('c2-toast-region')
  await region.evaluate((el) => {
    const target = el as HTMLElement & { show(options: { id: string; message: string; duration: number; dismissible: boolean }): string }
    target.show({ id: 'first', message: 'First message', duration: 0, dismissible: true })
    target.show({ id: 'second', message: 'Second message', duration: 0, dismissible: true })
  })
  await expect(page.getByText('First message', { exact: true })).toBeVisible()
  await expect(page.getByText('Second message', { exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(page.getByText('Second message', { exact: true })).toBeVisible()
  await expect(page.getByText('First message', { exact: true })).not.toBeVisible()
})
test('a timed toast dismisses using the browser clock', async ({ page, renderScenario }) => {
  await page.clock.install()
  await renderScenario('<c2-toast-region inline animation-duration="0"></c2-toast-region>')
  await page.locator('c2-toast-region').evaluate((el) => {
    ;(el as HTMLElement & { show(options: { message: string; duration: number }): string }).show({ message: 'Temporary', duration: 1000 })
  })
  await expect(page.getByText('Temporary', { exact: true })).toBeVisible()
  await page.clock.fastForward(1100)
  await expect(page.getByText('Temporary', { exact: true })).not.toBeVisible()
})
test('an action placed at the end sits on the message line, before the dismiss button', async ({ page, renderScenario }) => {
  await renderScenario('<c2-toast-region inline animation-duration="0"></c2-toast-region>')
  const region = page.locator('c2-toast-region')
  await region.evaluate((el) => {
    const target = el as HTMLElement & { show(options: object): string }
    target.show({ id: 'pin', message: 'Pinned to the board', duration: 0, dismissible: true, actionLabel: 'Undo', actionPlacement: 'end' })
  })
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible()
  const message = await region.locator('[part="message"]').boundingBox()
  const undo = await page.getByRole('button', { name: 'Undo' }).boundingBox()
  const close = await page.getByRole('button', { name: 'Dismiss notification' }).boundingBox()
  if (!message || !undo || !close) throw new Error('Expected a message, its action and the dismiss button')
  expect(Math.abs(undo.y + undo.height / 2 - (message.y + message.height / 2))).toBeLessThan(3)
  expect(undo.x).toBeGreaterThan(message.x + message.width)
  expect(undo.x + undo.width).toBeLessThanOrEqual(close.x)
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCSS('text-decoration-line', 'none')
  await watch(region, 'toast-action')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(region).not.toHaveAttribute('data-events', '[]')
})

test('the dismiss button and the region are named in the nearest lang and follow a lang change', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-toast-region inline animation-duration="0"></c2-toast-region></div>')
  await page.locator('c2-toast-region').evaluate((el) => {
    const target = el as HTMLElement & { show(options: { message: string; duration: number; dismissible: boolean }): string }
    target.show({ message: 'Enregistré', duration: 0, dismissible: true })
  })
  await expect(page.getByRole('button', { name: 'Fermer la notification', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Notifications', exact: true })).toBeAttached()
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'vi'))
  await expect(page.getByRole('button', { name: 'Đóng thông báo', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Thông báo', exact: true })).toBeAttached()
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'de'))
  await expect(page.getByRole('button', { name: 'Dismiss notification', exact: true })).toBeVisible()
})

/** A few pixels of the toast's own surface, clear of its text, edges and shadow. */
async function surface(page: Page, toast: Locator) {
  const box = (await toast.boundingBox())!
  return page.screenshot({ clip: { x: box.x + box.width * 0.75, y: box.y + 6, width: 4, height: 4 } })
}

/** Waits for every running animation and transition in the page, shadow roots included. */
async function settle(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))))
}

/**
 * Toasts are a manual popover: shown over an open modal they are painted above its backdrop (an element below the top
 * layer would be dimmed by it). A modal still makes the rest of the document inert, the popover included, by spec.
 */
test('a toast shown while a modal is open is painted above its backdrop and dismisses when it closes', async ({ page, renderScenario }) => {
  await renderScenario('<c2-modal label="Settings" open>Body</c2-modal><c2-toast-region animation-duration="0" position="top-center"></c2-toast-region>')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  const region = page.locator('c2-toast-region')
  await region.evaluate((el) =>
    (el as HTMLElement & { show(options: object): string }).show({ id: 'saved', message: 'Saved over the modal', duration: 0, dismissible: true }),
  )
  const toast = region.locator('c2-toast')
  await expect(page.getByText('Saved over the modal', { exact: true })).toBeVisible()
  expect(await region.locator('section').evaluate((el) => el.matches(':popover-open'))).toBe(true)
  await settle(page)
  const overModal = await surface(page, toast)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await settle(page)
  expect(overModal.equals(await surface(page, toast))).toBe(true)

  await region.evaluate((el) => (el as HTMLElement & { clear(): void }).clear())
  await expect(page.getByText('Saved over the modal', { exact: true })).toBeHidden()
  expect(await region.locator('section').evaluate((el) => el.matches(':popover-open'))).toBe(false)
})

test('a modal opened after a toast is shown does not cover it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-modal label="Settings">Body</c2-modal><c2-toast-region animation-duration="0" position="top-center"></c2-toast-region>')
  const region = page.locator('c2-toast-region')
  await region.evaluate((el) =>
    (el as HTMLElement & { show(options: object): string }).show({ id: 'first', message: 'Shown first', duration: 0, dismissible: true }),
  )
  const toast = region.locator('c2-toast')
  await expect(page.getByText('Shown first', { exact: true })).toBeVisible()
  await settle(page)
  const alone = await surface(page, toast)
  await page.locator('c2-modal').evaluate((el) => (el as HTMLElement & { show(): void }).show())
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await settle(page)
  expect(alone.equals(await surface(page, toast))).toBe(true)
})

// `open` bubbles from selects, menus and other popups too: only a modal overlay re-shows the stack above itself.
test('an open event from an element that is not a modal does not re-show the stack', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div id="popup"></div><c2-modal label="Settings">Body</c2-modal><c2-toast-region animation-duration="0" position="top-center"></c2-toast-region>',
  )
  const region = page.locator('c2-toast-region')
  await region.evaluate((el) =>
    (el as HTMLElement & { show(options: object): string }).show({ id: 'first', message: 'Shown first', duration: 0, dismissible: true }),
  )
  await expect(page.getByText('Shown first', { exact: true })).toBeVisible()
  const stack = region.locator('section')
  expect(await stack.evaluate((el) => el.matches(':popover-open'))).toBe(true)
  // `beforetoggle` fires synchronously on every hidePopover/showPopover (`toggle` is coalesced), so it counts each re-show.
  await stack.evaluate((el) => {
    el.dataset.toggles = '0'
    el.addEventListener('beforetoggle', () => (el.dataset.toggles = String(Number(el.dataset.toggles) + 1)))
  })

  await page.locator('#popup').evaluate((el) => el.dispatchEvent(new Event('open', { bubbles: true, composed: true })))
  await settle(page)
  await expect(stack).toHaveAttribute('data-toggles', '0')
  expect(await stack.evaluate((el) => el.matches(':popover-open'))).toBe(true)

  // The spy does see a re-show: a modal opening moves the stack above it.
  await page.locator('c2-modal').evaluate((el) => (el as HTMLElement & { show(): void }).show())
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(stack).not.toHaveAttribute('data-toggles', '0')
})
