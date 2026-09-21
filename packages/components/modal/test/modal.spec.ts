import { test, expect, props, watch, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('footer presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const footer = page.locator('c2-modal').locator('[part="footer"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-modal label="Settings" open><button slot="footer" data-slot-presence-probe>Save</button></c2-modal>',
    host: 'c2-modal',
    slot: 'footer',
    assertPresent: async (present) => (present ? expect(footer).toBeVisible() : expect(footer).toBeHidden()),
  })
})

test('show opens a named dialog and Escape closes it with focus restoration', async ({ page, renderScenario, tab }) => {
  await renderScenario('<button id="launch">Launch</button><c2-modal label="Settings"><input aria-label="Name" /></c2-modal>')
  const host = page.locator('c2-modal')
  await page.locator('#launch').evaluate((el) =>
    el.addEventListener('click', () => {
      const modal = document.querySelector('c2-modal') as HTMLElement & { show(): void }
      modal.show()
    }),
  )
  await tab()
  await page.getByRole('button', { name: 'Launch' }).press('Enter')
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(page.locator('html')).toHaveCSS('overflow', 'hidden')
  await accessible(page)
  await page.keyboard.press('Escape')
  await expect(host).toHaveJSProperty('open', false)
  await expect(page.getByRole('button', { name: 'Launch' })).toBeFocused()
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
})
test('no-escape and no-backdrop-close preserve the dialog until explicit close', async ({ page, renderScenario }) => {
  await renderScenario('<c2-modal label="Confirm" open no-escape no-backdrop-close>Are you sure?</c2-modal>')
  await page.keyboard.press('Escape')
  await page.mouse.click(1, 1)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})
test('close returns a value and disconnect releases the scroll lock', async ({ page, renderScenario }) => {
  await renderScenario('<c2-modal label="Confirm" open>Content</c2-modal>')
  const host = page.locator('c2-modal')
  await watch(host, 'close')
  await host.evaluate((el) => (el as HTMLElement & { close(value: string): void }).close('accepted'))
  await expect(host).toHaveAttribute('data-events', '[{"returnValue":"accepted"}]')
  await props(host, { open: true })
  await host.evaluate((el) => el.remove())
  await expect(page.locator('html')).not.toHaveCSS('overflow', 'hidden')
})

test('public parts style title, body and conditional footer regions', async ({ page, renderScenario }) => {
  await renderScenario('<c2-modal open><h2 slot="title">Review</h2><p>Body</p><button slot="footer">Save</button></c2-modal>')
  await page.addStyleTag({
    content: 'c2-modal::part(title){background:rgb(1,2,3)}c2-modal::part(body){background:rgb(4,5,6)}c2-modal::part(footer){background:rgb(7,8,9)}',
  })
  const host = page.locator('c2-modal')
  await expect(host.locator('.c2-modal__title')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.c2-modal__body')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-modal__footer')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
})
