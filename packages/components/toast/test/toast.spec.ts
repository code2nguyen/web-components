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
