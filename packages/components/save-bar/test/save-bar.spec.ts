import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, props } from '../../../../tests/component-fixture'

const bar = (page: Page) => page.locator('c2-save-bar')
// The surface inside the shadow root: the host is a zero-height strip, so visibility is read off the bar itself.
const surface = (page: Page) => bar(page).locator('.bar')
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true })
const discardButton = (page: Page) => page.getByRole('button', { name: 'Discard' })
const around = (attributes = '', content = '') =>
  `<button id="before">Before</button><c2-save-bar ${attributes}>${content}</c2-save-bar><button id="after">After</button>`
// An app that owns the changes: saving or discarding them closes the bar.
const ownChanges = (page: Page) =>
  bar(page).evaluate((element) => {
    const close = () => ((element as HTMLElement & { open: boolean }).open = false)
    element.addEventListener('save', close)
    element.addEventListener('discard', close)
  })

test('stays hidden and out of the Tab order while there is nothing to save', async ({ page, renderScenario, tab }) => {
  await renderScenario(around())
  await expect(surface(page)).toBeHidden()
  await expect(page.getByRole('status')).toHaveText('')
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#after')).toBeFocused()
})

test('shows the message, Discard and Save once open, and announces it', async ({ page, renderScenario, tab }) => {
  await renderScenario(around())
  await props(bar(page), { open: true })
  await expect(surface(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Unsaved changes')
  await expect(bar(page)).toHaveHostAria('role', 'group')
  await expect(bar(page)).toHaveHostAria('aria-label', 'Save changes')

  await page.locator('#before').focus()
  await tab()
  await expect(discardButton(page)).toBeFocused()
  await tab()
  await expect(saveButton(page)).toBeFocused()
  await accessible(page)
})

test('Save and Discard fire their events, and the app closes the bar', async ({ page, renderScenario }) => {
  await renderScenario(around('open'))
  await ownChanges(page)
  await watch(bar(page), 'save')
  await saveButton(page).click()
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
  await expect(surface(page)).toBeHidden()

  await props(bar(page), { open: true })
  await watch(bar(page), 'discard')
  await discardButton(page).click()
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
  await expect(surface(page)).toBeHidden()
})

test('while saving, Save runs a spinner, both buttons stop responding and the message says so', async ({ page, renderScenario }) => {
  await renderScenario(around('open saving'))
  await watch(bar(page), 'save')
  await expect(page.getByRole('status')).toHaveText('Saving…')
  await expect(bar(page).locator('.message')).toHaveText('Saving…')
  await expect(bar(page).locator('c2-button.save')).toHaveJSProperty('running', true)
  await expect(discardButton(page)).toBeDisabled()
  await saveButton(page).click({ force: true })
  await expect(bar(page)).toHaveAttribute('data-events', '[]')
  await accessible(page)
})

test('invalid disables Save and marks the indicator, but still allows Discard', async ({ page, renderScenario }) => {
  await renderScenario(around('open invalid', '<span slot="message">1 field to fix</span>'))
  await watch(bar(page), 'discard')
  await expect(saveButton(page)).toBeDisabled()
  await expect(page.getByText('1 field to fix')).toBeVisible()
  const dot = await bar(page)
    .locator('.indicator')
    .evaluate((element) => getComputedStyle(element).backgroundColor)
  expect(dot).toBe('rgb(220, 38, 38)')
  await discardButton(page).click()
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
})

test('extra actions in the default slot come before Discard', async ({ page, renderScenario, tab }) => {
  await renderScenario(around('open', '<c2-button id="preview">Preview</c2-button>'))
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#preview')).toBeFocused()
  await tab()
  await expect(discardButton(page)).toBeFocused()
})

test('save-label and discard-label replace the button text', async ({ page, renderScenario }) => {
  await renderScenario(around('open save-label="Publish" discard-label="Revert"'))
  await expect(page.getByRole('button', { name: 'Publish' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revert' })).toBeVisible()
})

test('with shortcut, Ctrl+S / Meta+S fires save only while open', async ({ page, renderScenario }) => {
  await renderScenario(around('shortcut'))
  await watch(bar(page), 'save')
  await page.locator('#before').focus()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(bar(page)).toHaveAttribute('data-events', '[]')
  await props(bar(page), { open: true })
  await page.keyboard.press('ControlOrMeta+s')
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
  // While saving the shortcut is swallowed but fires nothing.
  await props(bar(page), { saving: true })
  await page.keyboard.press('ControlOrMeta+s')
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
})

test('without shortcut, Ctrl+S is left to the page', async ({ page, renderScenario }) => {
  await renderScenario(around('open'))
  await watch(bar(page), 'save')
  const prevented = await page.evaluate(() => {
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    document.body.dispatchEvent(event)
    return event.defaultPrevented
  })
  expect(prevented).toBe(false)
  await expect(bar(page)).toHaveAttribute('data-events', '[]')
})

test('warn-on-leave cancels beforeunload only while open', async ({ page, renderScenario }) => {
  await renderScenario(around('warn-on-leave'))
  const unload = () =>
    page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    })
  expect(await unload()).toBe(false)
  await props(bar(page), { open: true })
  expect(await unload()).toBe(true)
})

test('sticks to the bottom of its scroll container, over the content', async ({ page, renderScenario }) => {
  await renderScenario(`<div class="scroller"><div class="rows"></div><c2-save-bar open></c2-save-bar></div>`)
  const scroller = (await page.locator('.scroller').boundingBox())!
  const box = (await surface(page).boundingBox())!
  expect(Math.round(scroller.y + scroller.height - (box.y + box.height))).toBe(17)
  expect(await bar(page).evaluate((element) => element.getBoundingClientRect().height)).toBe(0)
})

test('on a narrow container the buttons share a full-width row under the message', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div style="width: 360px; position: relative; height: 200px"><c2-save-bar open style="--c2-save-bar--position: absolute"></c2-save-bar></div>`,
  )
  const discard = (await bar(page).locator('c2-button.discard').boundingBox())!
  const save = (await bar(page).locator('c2-button.save').boundingBox())!
  const message = (await bar(page).locator('.message').boundingBox())!
  expect(discard.y).toBeGreaterThan(message.y + message.height - 1)
  expect(Math.round(save.y)).toBe(Math.round(discard.y))
  expect(Math.abs(save.width - discard.width)).toBeLessThan(2)
})

test('the built-in text follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-save-bar open></c2-save-bar></div>`)
  await expect(page.getByRole('status')).toHaveText('Modifications non enregistrées')
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Annuler' })).toBeVisible()
  await expect(bar(page)).toHaveHostAria('aria-label', 'Enregistrer les modifications')
})
