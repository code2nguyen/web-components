import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, clipboard } from '../../../../tests/component-fixture'

const KEY = 'acme_live_51HxQabcdefghijklmnopqrstuvwxyz4242'
const field = `<c2-secret-field label="Secret key" value="${KEY}" reveal-start="10"></c2-secret-field>`

const value = (page: Page) => page.locator('c2-secret-field').locator('[part="value"]')
const show = (page: Page) => page.getByRole('button', { name: 'Show secret' })

test('masks the secret, keeping the prefix and the last four, with a fixed-length mask', async ({ page, renderScenario }) => {
  await renderScenario(field)
  await expect(value(page)).toContainText(`acme_live_${'•'.repeat(12)}4242`)
  await expect(value(page)).not.toContainText('51HxQ')
  await expect(page.getByRole('group', { name: 'Secret key' })).toBeVisible()
  await expect(page.locator('c2-secret-field').locator('.sr-only')).toHaveText('Starts with acme_live_, hidden, ends with 4242')
  await accessible(page)
})

test('the show button reveals and hides the secret, with its pressed state', async ({ page, renderScenario }) => {
  await renderScenario(field)
  const host = page.locator('c2-secret-field')
  await watch(host, 'reveal-change')
  await expect(show(page)).toHaveAttribute('aria-pressed', 'false')
  await show(page).click()
  await expect(value(page)).toHaveText(KEY)
  await expect(show(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(host).toHaveAttribute('revealed', '')
  await show(page).click()
  await expect(value(page)).not.toContainText('51HxQ')
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await accessible(page)
})

test('copy copies the whole secret while it is masked, and announces it', async ({ page, renderScenario }) => {
  await renderScenario(field)
  await clipboard(page)
  const host = page.locator('c2-secret-field')
  await watch(host, 'copied')
  // A listener on the document must not receive the secret through the copy button's own event.
  await page.evaluate(() => {
    const w = window as unknown as { leaked: unknown[] }
    w.leaked = []
    document.addEventListener('copied', (event) => w.leaked.push((event as CustomEvent).detail ?? null))
  })
  await page.getByRole('button', { name: 'Copy secret' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', KEY)
  await expect(value(page)).not.toContainText('51HxQ')
  await expect(host).toHaveAttribute('data-events', '[null]')
  // The field's own `copied` does not bubble and the copy button's never leaves the shadow root: nothing arrives.
  expect(await page.evaluate(() => (window as unknown as { leaked: unknown[] }).leaked)).toEqual([])
})

test('regenerate fires an event only when the field is regenerable', async ({ page, renderScenario }) => {
  await renderScenario(field)
  await expect(page.getByRole('button', { name: 'Regenerate secret' })).toHaveCount(0)
  await renderScenario(`<c2-secret-field label="Signing secret" value="acme_hook_abc123" regenerable></c2-secret-field>`)
  const host = page.locator('c2-secret-field')
  await watch(host, 'regenerate')
  await page.getByRole('button', { name: 'Regenerate secret' }).click()
  await expect(host).toHaveAttribute('data-events', '[null]')
  // The app sets the new secret, shown once.
  await host.evaluate((el: HTMLElement & { value: string; revealed: boolean }) => {
    el.value = 'acme_hook_new999'
    el.revealed = true
  })
  await expect(value(page)).toHaveText('acme_hook_new999')
})

test('a secret too short to keep its ends is masked entirely', async ({ page, renderScenario }) => {
  await renderScenario('<c2-secret-field label="PIN" value="1234"></c2-secret-field>')
  await expect(value(page)).toContainText('•'.repeat(12))
  await expect(value(page)).not.toContainText('1234')
  await expect(page.locator('c2-secret-field').locator('.sr-only')).toHaveText('Hidden')
})

test('hide-reveal leaves only copy; help text describes the field', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-secret-field label="Recovery code" value="ABCD-EFGH-IJKL" hide-reveal><span slot="help">Store it somewhere safe.</span></c2-secret-field>`,
  )
  await expect(show(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Copy secret' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Recovery code' })).toHaveAccessibleDescription('Store it somewhere safe.')
})

test('keyboard: Tab reaches show then copy, and Space toggles', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button id="before">Before</button>${field}`)
  await page.locator('#before').focus()
  await tab()
  await page.keyboard.press('Space')
  await expect(value(page)).toHaveText(KEY)
  await tab()
  await expect(page.locator('c2-secret-field').locator('c2-copy-button')).toBeFocused()
})

test('built-in text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-secret-field label="Clé secrète" value="${KEY}" regenerable></c2-secret-field></div>`)
  await expect(page.getByRole('button', { name: 'Afficher le secret' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copier le secret' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Régénérer le secret' })).toBeVisible()
  await expect(page.locator('c2-secret-field').locator('.sr-only')).toHaveText('Masqué, se termine par 4242')
})

test('every button draws its icon, including the hide icon once the secret is shown', async ({ page, renderScenario }) => {
  await renderScenario(field.replace('reveal-start="10"', 'reveal-start="10" regenerable'))
  const drawn = () =>
    page
      .locator('c2-secret-field c2-icon-button svg')
      .evaluateAll((icons) =>
        icons.map(
          (el) => el instanceof SVGSVGElement && [...el.children].every((shape) => shape instanceof SVGElement) && el.getBoundingClientRect().width > 0,
        ),
      )
  expect(await drawn()).toEqual([true, true])
  await show(page).click()
  await expect(value(page)).toHaveText(KEY)
  expect(await drawn()).toEqual([true, true])
})

test('in a narrow field only the bullets give way; both visible ends stay whole', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-secret-field style="width: 200px" label="Secret key" value="${KEY}" reveal-start="10"></c2-secret-field>`)
  const ends = page.locator('c2-secret-field').locator('.end')
  for (const end of await ends.all()) {
    const fits = await end.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().width > 0)
    expect(fits).toBe(true)
  }
  // The last characters end before the buttons start, so none of them is hidden behind one.
  const [actions, last] = await Promise.all([page.locator('c2-secret-field').locator('[part="actions"]').boundingBox(), ends.last().boundingBox()])
  expect(last!.x + last!.width).toBeLessThanOrEqual(actions!.x)
})

test('in a field too narrow for anything, the value is clipped before the buttons', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-secret-field style="width: 150px" label="Secret key" value="${KEY}" reveal-start="10" regenerable></c2-secret-field>`)
  const host = page.locator('c2-secret-field')
  const [value, actions] = await Promise.all([host.locator('[part="value"]').boundingBox(), host.locator('[part="actions"]').boundingBox()])
  expect(value!.x + value!.width).toBeLessThanOrEqual(actions!.x)
  await expect(host.locator('[part="value"]')).toHaveCSS('overflow', 'hidden')
})

test('a mask never shows more than half of the secret', async ({ page, renderScenario }) => {
  // 13 characters with 10 + 4 kept would hide nothing worth hiding: mask it all.
  await renderScenario('<c2-secret-field label="Hook" value="acme_hook_abc" reveal-start="10"></c2-secret-field>')
  await expect(value(page)).not.toContainText('acme')
  await expect(page.locator('c2-secret-field').locator('.sr-only')).toHaveText('Hidden')
})

test('without a value it says so, and has nothing to show or copy', async ({ page, renderScenario }) => {
  await renderScenario('<c2-secret-field label="Secret key"></c2-secret-field>')
  await expect(value(page)).not.toContainText('•')
  await expect(page.locator('c2-secret-field').locator('.sr-only')).toHaveText('No secret')
  await expect(show(page)).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Copy secret' })).toBeDisabled()
})
