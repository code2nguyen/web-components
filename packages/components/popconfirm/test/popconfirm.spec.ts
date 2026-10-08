import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const markup = (attributes = '') => `
  <button>Before</button>
  <c2-popconfirm heading="Delete this task?" confirm-label="Delete" ${attributes}>
    <button slot="trigger">Delete task</button>
    This cannot be undone.
  </c2-popconfirm>
  <button>After</button>`

const host = (page: Page) => page.locator('c2-popconfirm')
const panel = (page: Page) => page.locator('c2-popconfirm .panel')
const trigger = (page: Page) => page.getByRole('button', { name: 'Delete task' })

/** Records the confirm / cancel / show / hide events the host fires, in order. */
async function record(page: Page) {
  await host(page).evaluate((element) => {
    const log: string[] = []
    ;(window as unknown as { popconfirmLog: string[] }).popconfirmLog = log
    for (const name of ['confirm', 'cancel', 'show', 'hide']) element.addEventListener(name, () => log.push(name))
  })
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { popconfirmLog: string[] }).popconfirmLog)

test('clicking the trigger opens the popup with focus on Cancel', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await expect(panel(page)).toBeHidden()
  await trigger(page).click()
  const dialog = page.getByRole('alertdialog', { name: 'Delete this task?' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await expect(host(page)).toHaveAttribute('open', '')
  expect(await events(page)).toEqual(['show'])
})

test('OK fires confirm, closes and returns focus to the trigger', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await trigger(page).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(panel(page)).toBeHidden()
  await expect(trigger(page)).toBeFocused()
  expect(await events(page)).toEqual(['show', 'confirm', 'hide'])
})

test('Cancel and Escape fire cancel and return focus to the trigger', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await trigger(page).click()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(panel(page)).toBeHidden()
  await expect(trigger(page)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(trigger(page)).toBeFocused()
  expect(await events(page)).toEqual(['show', 'cancel', 'hide', 'show', 'cancel', 'hide'])
})

test('Enter on the opened popup cancels, so a double Enter never confirms', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await trigger(page).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).not.toContain('confirm')
})

test('a click outside cancels without moving focus back', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  await page.getByRole('button', { name: 'After' }).click()
  await expect(panel(page)).toBeHidden()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  expect(await events(page)).toEqual(['show', 'cancel', 'hide'])
})

test('clicking the trigger again closes the popup as a cancel', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  await trigger(page).click()
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'cancel', 'hide'])
})

test('Tab moves between the buttons, and tabbing out of the popup cancels it', async ({ page, renderScenario, tab }) => {
  await renderScenario(markup())
  await record(page)
  await trigger(page).click()
  await tab()
  await expect(page.getByRole('button', { name: 'Delete', exact: true })).toBeFocused()
  await tab()
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'cancel', 'hide'])
})

test('a prevented confirm keeps the popup open while pending, then closes from code', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await host(page).evaluate((element) =>
    element.addEventListener('confirm', (event) => {
      event.preventDefault()
      ;(element as HTMLElement & { pending: boolean }).pending = true
    }),
  )
  await trigger(page).click()
  const ok = page.getByRole('button', { name: 'Delete', exact: true })
  await ok.click()
  await expect(panel(page)).toBeVisible()
  await expect(ok).toHaveAttribute('aria-busy', 'true')
  await ok.press('Enter')
  await expect(panel(page)).toBeVisible()
  await host(page).evaluate((element) => Object.assign(element, { open: false, pending: false }))
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'confirm', 'hide'])
})

test('disabled keeps the trigger from opening the popup', async ({ page, renderScenario }) => {
  await renderScenario(markup('disabled'))
  await trigger(page).click()
  await page.waitForFunction(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))))
  await expect(panel(page)).toBeHidden()
})

test('the trigger announces the popup and its state once it has been opened', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await expect(trigger(page)).not.toHaveAttribute('aria-expanded')
  await trigger(page).click()
  await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
})

test('a heading slot labels the popup and an empty icon slot removes the icon', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-popconfirm open>
      <button slot="trigger">Revoke</button>
      <strong slot="heading">Revoke the API key?</strong>
      <span slot="icon"></span>
    </c2-popconfirm>`)
  await expect(page.getByRole('alertdialog', { name: 'Revoke the API key?' })).toBeVisible()
  await expect(page.locator('c2-popconfirm .description')).toBeHidden()
})

test('the popup sits above the trigger and is never clipped by its container', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div style="overflow: hidden; width: 120px; height: 40px; margin-top: 240px">
      <c2-popconfirm heading="Discard the draft and every attachment?" open><button slot="trigger">Discard</button></c2-popconfirm>
    </div>`)
  await expect(panel(page)).toHaveAttribute('data-placement', 'top')
  const box = (await page.getByRole('button', { name: 'Discard' }).boundingBox())!
  await expect.poll(async () => (await panel(page).boundingBox())!.y + (await panel(page).boundingBox())!.height).toBeLessThanOrEqual(box.y)
  expect((await panel(page).boundingBox())!.width).toBeGreaterThan(120)
})

test('flips below the trigger when there is no room above', async ({ page, renderScenario }) => {
  await renderScenario('<c2-popconfirm heading="Sure?" open><button slot="trigger">Go</button></c2-popconfirm>')
  await expect(panel(page)).toHaveAttribute('data-placement', 'bottom')
})

test('writes no attribute of its own on the host or the trigger before it opens', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  expect(await host(page).evaluate((element) => element.getAttributeNames().sort())).toEqual(['confirm-label', 'heading'])
  expect(await trigger(page).evaluate((element) => element.getAttributeNames())).toEqual(['slot'])
})

test('closed and open popups have no axe violations', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await accessible(page)
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  await accessible(page)
})

test('the arrow sits on the edge facing the trigger and points at its centre', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div style="margin: 200px 0 0 240px">
      <c2-popconfirm heading="Discard the draft and every attachment?" open><button slot="trigger">Discard</button></c2-popconfirm>
    </div>`)
  const arrow = page.locator('c2-popconfirm .arrow')
  const trigger = (await page.getByRole('button', { name: 'Discard' }).boundingBox())!
  await expect
    .poll(async () => {
      const box = (await arrow.boundingBox())!
      return Math.abs(box.x + box.width / 2 - (trigger.x + trigger.width / 2))
    })
    .toBeLessThan(2)
  const box = (await arrow.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(trigger.y)
  expect(box.y + box.height).toBeGreaterThan(trigger.y - 12)
})

test('a zero arrow size removes the arrow', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div style="margin-top: 200px"><c2-popconfirm heading="Sure?" open style="--c2-popconfirm__arrow--size: 0px"><button slot="trigger">Go</button></c2-popconfirm></div>',
  )
  await expect(panel(page)).toBeVisible()
  expect((await page.locator('c2-popconfirm .arrow').boundingBox())?.width ?? 0).toBe(0)
})
