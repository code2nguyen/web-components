import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

// Actions state their role and name through ElementInternals, which getByRole cannot see, so they are found by value.
const action = (page: Page, value: string) => page.locator(`c2-float-button-action[value="${value}"]`)
const events = async (page: Page) => JSON.parse((await page.locator('c2-float-button').getAttribute('data-events')) ?? '[]')
// The detail holds the action element, which does not serialise: record its value and which action it was.
const watchSelect = (page: Page) =>
  page.locator('c2-float-button').evaluate((element) => {
    const seen: unknown[] = []
    element.setAttribute('data-events', '[]')
    element.addEventListener('action-select', (event) => {
      const { value, action } = (event as CustomEvent<{ value: string; action: HTMLElement }>).detail
      seen.push({ value, label: action.getAttribute('label') })
      element.setAttribute('data-events', JSON.stringify(seen))
    })
  })
const trigger = (page: Page) => page.locator('c2-float-button').locator('button.button')

const dial = (attributes = '') => `<button>Before</button>
<c2-float-button label="Create" ${attributes}>
  <c2-float-button-action label="Upload file" value="upload">U</c2-float-button-action>
  <c2-float-button-action label="New note" value="note" disabled>N</c2-float-button-action>
  <c2-float-button-action label="Share link" value="link">L</c2-float-button-action>
</c2-float-button>
<button>After</button>`

test('a plain button fires click, has no menu semantics and writes nothing on the host', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-float-button label="Compose"></c2-float-button>`)
  const host = page.locator('c2-float-button')
  expect(await host.evaluate((element) => element.getAttributeNames())).toEqual(['label'])
  const button = page.getByRole('button', { name: 'Compose' })
  await expect(button).not.toHaveAttribute('aria-haspopup')
  await expect(button).not.toHaveAttribute('aria-expanded')
  await host.evaluate((element) => element.addEventListener('click', () => element.setAttribute('data-clicked', '')))
  await button.click()
  await expect(host).toHaveAttribute('data-clicked', '')
  await expect(host).not.toHaveAttribute('open')
  await accessible(page)
})

test('is fixed to the bottom-right corner of the viewport by default', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-float-button label="Compose"></c2-float-button>`)
  const viewport = page.viewportSize()!
  const box = (await page.locator('c2-float-button').boundingBox())!
  expect(Math.round(viewport.width - box.x - box.width)).toBe(24)
  expect(Math.round(viewport.height - box.y - box.height)).toBe(24)
  expect(Math.round(box.width)).toBe(56)
  expect(Math.round(box.height)).toBe(56)
})

test('falls back to a localised accessible name', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-float-button></c2-float-button>`)
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible()
})

test('a click opens the dial, a second click closes it, and toggle reports both', async ({ page, renderScenario }) => {
  await renderScenario(dial())
  await watch(page.locator('c2-float-button'), 'toggle')
  const button = page.getByRole('button', { name: 'Create' })
  await expect(button).toHaveAttribute('aria-haspopup', 'menu')
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(action(page, 'upload')).toBeHidden()

  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('c2-float-button')).toHaveAttribute('open', '')
  await expect(action(page, 'upload')).toBeVisible()
  await expect(action(page, 'upload')).toHaveHostAria('role', 'menuitem')
  await expect(action(page, 'upload')).toHaveHostAria('aria-label', 'Upload file')
  await expect(page.getByRole('menu', { name: 'Create' })).toBeVisible()
  // A pointer open leaves focus on the button.
  await expect(button).toBeFocused()
  await accessible(page)

  await button.click()
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(action(page, 'upload')).toBeHidden()
  expect(await events(page)).toEqual([null, null])
})

test('the actions fan out above the button, nearest first, centred on its axis', async ({ page, renderScenario }) => {
  await renderScenario(dial('open'))
  const button = (await trigger(page).boundingBox())!
  const first = (await action(page, 'upload').boundingBox())!
  const last = (await action(page, 'link').boundingBox())!
  expect(first.y + first.height).toBeLessThan(button.y)
  expect(last.y).toBeLessThan(first.y)
  expect(Math.round(first.x + first.width / 2)).toBe(Math.round(button.x + button.width / 2))
})

test('direction="left" lays the actions out in a row to the left', async ({ page, renderScenario }) => {
  await renderScenario(dial('open direction="left"'))
  const button = (await trigger(page).boundingBox())!
  const first = (await action(page, 'upload').boundingBox())!
  const last = (await action(page, 'link').boundingBox())!
  expect(first.x + first.width).toBeLessThan(button.x)
  expect(last.x).toBeLessThan(first.x)
  expect(Math.round(first.y + first.height / 2)).toBe(Math.round(button.y + button.height / 2))
})

test('a horizontal dial shows a label chip only for the focused or hovered action', async ({ page, renderScenario }) => {
  await renderScenario(dial('direction="left"'))
  const chip = (value: string) => action(page, value).locator('.label')
  await page.getByRole('button', { name: 'Create' }).focus()
  await page.keyboard.press('Enter')
  await expect(action(page, 'upload')).toBeFocused()
  await expect(chip('upload')).toHaveCSS('opacity', '1')
  await expect(chip('link')).toHaveCSS('opacity', '0')
  await action(page, 'link').hover()
  await expect(chip('link')).toHaveCSS('opacity', '1')
})

test('a vertical dial shows every label chip, and clicking a chip activates its action', async ({ page, renderScenario }) => {
  await renderScenario(dial('open'))
  await watchSelect(page)
  await expect(action(page, 'link').locator('.label')).toHaveCSS('opacity', '1')
  await action(page, 'link').locator('.label').click()
  expect(await events(page)).toEqual([{ value: 'link', label: 'Share link' }])
})

test('clicking an action fires action-select, closes the dial and keeps focus on the button', async ({ page, renderScenario }) => {
  await renderScenario(dial())
  await watchSelect(page)
  await page.getByRole('button', { name: 'Create' }).click()
  await action(page, 'link').click()
  expect(await events(page)).toEqual([{ value: 'link', label: 'Share link' }])
  await expect(page.locator('c2-float-button')).not.toHaveAttribute('open')
  await expect(page.getByRole('button', { name: 'Create' })).toBeFocused()
})

test('finds actions a framework wraps in a display: contents element', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-float-button label="Create" open>
    <span style="display: contents"><c2-float-button-action label="Upload file" value="upload">U</c2-float-button-action></span>
  </c2-float-button>`)
  await expect(page.getByRole('button', { name: 'Create' })).toHaveAttribute('aria-expanded', 'true')
  await expect(action(page, 'upload')).toBeVisible()
  await expect(action(page, 'upload')).toHaveCSS('opacity', '1')
})

test('a disabled action never fires', async ({ page, renderScenario }) => {
  await renderScenario(dial('open'))
  await watchSelect(page)
  await action(page, 'note').click({ force: true })
  expect(await events(page)).toEqual([])
  await expect(action(page, 'note')).toHaveHostAria('aria-disabled', 'true')
})

test('preventDefault on action-select keeps the dial open', async ({ page, renderScenario }) => {
  await renderScenario(dial('open'))
  await page.locator('c2-float-button').evaluate((element) => element.addEventListener('action-select', (event) => event.preventDefault()))
  await action(page, 'upload').click()
  await expect(page.locator('c2-float-button')).toHaveAttribute('open', '')
})

test('keyboard: Enter opens on the first action, arrows skip disabled ones, Escape returns focus', async ({ page, renderScenario }) => {
  await renderScenario(dial())
  await watchSelect(page)
  await page.getByRole('button', { name: 'Before' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'Create' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(action(page, 'upload')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(action(page, 'link')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(action(page, 'link')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(action(page, 'upload')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Create' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(action(page, 'upload')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Create' })).toBeFocused()
  await expect(page.locator('c2-float-button')).not.toHaveAttribute('open')

  await page.keyboard.press('Space')
  await page.keyboard.press('End')
  await expect(action(page, 'link')).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await events(page)).toEqual([{ value: 'link', label: 'Share link' }])
  await expect(page.getByRole('button', { name: 'Create' })).toBeFocused()
})

test('Tab leaves the dial, skipping hidden and visible actions, and closes it', async ({ page, renderScenario }) => {
  await renderScenario(dial())
  await page.getByRole('button', { name: 'Create' }).click()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await expect(page.locator('c2-float-button')).not.toHaveAttribute('open')
})

test('a click outside closes the dial', async ({ page, renderScenario }) => {
  await renderScenario(dial('open'))
  await page.mouse.click(5, 5)
  await expect(page.locator('c2-float-button')).not.toHaveAttribute('open')
})

test('trigger="hover" opens while the mouse is over it and closes after it leaves', async ({ page, renderScenario }) => {
  await renderScenario(dial('trigger="hover"'))
  await trigger(page).hover()
  await expect(page.locator('c2-float-button')).toHaveAttribute('open', '')
  // Moving onto an action, across the gap, keeps it open.
  await action(page, 'link').hover()
  await expect(action(page, 'link')).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(page.locator('c2-float-button')).not.toHaveAttribute('open')
})

test('disabled closes the dial and ignores clicks', async ({ page, renderScenario }) => {
  await renderScenario(dial('open disabled'))
  await expect(page.locator('c2-float-button')).not.toHaveAttribute('open')
  await expect(trigger(page)).toBeDisabled()
})

test('the open-icon slot replaces the icon while open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-float-button label="Help">
    <span slot="icon" id="closed-icon">?</span>
    <span slot="open-icon" id="open-icon">×</span>
    <c2-float-button-action label="Chat" value="chat">C</c2-float-button-action>
  </c2-float-button>`)
  // The icons fade through their wrappers in the shadow root, so ask whether each one is visible through its ancestors.
  const shown = (id: string) => page.locator(`#${id}`).evaluate((icon) => icon.checkVisibility({ opacityProperty: true }))
  expect(await shown('closed-icon')).toBe(true)
  expect(await shown('open-icon')).toBe(false)
  await page.getByRole('button', { name: 'Help' }).click()
  await expect.poll(() => shown('open-icon')).toBe(true)
  await expect.poll(() => shown('closed-icon')).toBe(false)
})
