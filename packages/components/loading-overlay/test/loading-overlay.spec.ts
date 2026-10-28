import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const card = (attrs = '') => `
  <button id="before">Before</button>
  <c2-loading-overlay ${attrs}>
    <div class="card">
      <label>Name <input id="name" /></label>
      <button id="save">Save</button>
    </div>
  </c2-loading-overlay>
  <button id="after">After</button>
`

const overlay = (page: Page) => page.locator('c2-loading-overlay')
const scrim = (page: Page) => overlay(page).locator('[part="scrim"]')
const setLoading = (page: Page, loading: boolean) =>
  overlay(page).evaluate(async (el: HTMLElement & { loading: boolean; updateComplete: Promise<unknown> }, value) => {
    el.loading = value
    await el.updateComplete
  }, loading)

test('without loading, the content is usable and nothing covers it', async ({ page, renderScenario }) => {
  await renderScenario(card())
  await expect(scrim(page)).toBeHidden()
  await page.locator('#save').click()
  await page.locator('#name').fill('Ada')
  await expect(overlay(page).locator('.content')).toHaveAttribute('aria-busy', 'false')
  await accessible(page)
})

test('loading covers the content, blocks pointer and keyboard, and marks the region busy', async ({ page, renderScenario, tab }) => {
  await renderScenario(card('loading'))
  await expect(scrim(page)).toBeVisible()
  const [box, cover] = await Promise.all([overlay(page).boundingBox(), scrim(page).boundingBox()])
  expect(cover).toEqual(box)
  // Busy is the content, not the host: the live region beside it must not sit inside a busy subtree.
  await expect(overlay(page).locator('.content')).toHaveAttribute('aria-busy', 'true')
  await expect(overlay(page)).toHaveHostAria('aria-busy', null)
  // Inert content is skipped by Tab and ignores clicks.
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#after')).toBeFocused()
  await expect(page.locator('#name')).not.toBeFocused()
  await page.locator('#name').click({ force: true })
  await expect(page.locator('#name')).not.toBeFocused()
  await accessible(page)
})

test('announces the label politely while loading, and nothing after', async ({ page, renderScenario }) => {
  await renderScenario(card())
  const status = overlay(page).locator('[role="status"]')
  await expect(status).toHaveText('')
  await setLoading(page, true)
  await expect(status).toHaveText('Loading')
  await setLoading(page, false)
  await expect(status).toHaveText('')
  await expect(scrim(page)).toBeHidden()
  await page.locator('#name').fill('back')
  await expect(page.locator('#name')).toHaveValue('back')
})

test('the label slot is shown under the spinner and announced; the label attribute wins for the announcement', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-loading-overlay loading><p>Body</p><span slot="label">Saving changes…</span></c2-loading-overlay>`)
  await expect(page.locator('[slot="label"]')).toBeVisible()
  await expect(overlay(page).locator('[role="status"]')).toHaveText('Saving changes…')
  await renderScenario(`<c2-loading-overlay loading label="Refreshing the chart"><p>Body</p></c2-loading-overlay>`)
  await expect(overlay(page).locator('[role="status"]')).toHaveText('Refreshing the chart')
  await expect(overlay(page).locator('.indicator > .label')).toBeHidden()
})

test('the spinner is hidden from assistive technology so the region is announced once', async ({ page, renderScenario }) => {
  await renderScenario(card('loading'))
  await expect(overlay(page).locator('c2-spinner')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})

test('the indicator slot replaces the spinner', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-loading-overlay loading><p>Body</p><span slot="indicator" id="custom">⏳</span></c2-loading-overlay>`)
  await expect(page.locator('#custom')).toBeVisible()
  await expect(overlay(page).locator('c2-spinner')).toBeHidden()
})

test('the announcement follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-loading-overlay loading><p>Contenu</p></c2-loading-overlay></div>`)
  await expect(overlay(page).locator('[role="status"]')).toHaveText('Chargement')
})

test('the scrim follows the host radius and the delay variable holds it back', async ({ page, renderScenario }) => {
  await renderScenario(card('loading style="border-radius: 12px; --c2-loading-overlay--delay: 400ms"'))
  await expect(scrim(page)).toHaveCSS('border-radius', '12px')
  await expect(scrim(page)).toHaveCSS('transition-delay', /0\.4s/)
})

test('an overlay that starts loading exposes its live region empty, then fills it', async ({ page, renderScenario }) => {
  await renderScenario('<div id="slot-here"></div>')
  const seen = await page.evaluate(async () => {
    const host = document.createElement('c2-loading-overlay') as HTMLElement & { loading: boolean; updateComplete: Promise<unknown> }
    host.loading = true
    host.innerHTML = '<p>Body</p>'
    document.querySelector('#slot-here')!.append(host)
    await host.updateComplete
    const region = host.shadowRoot!.querySelector('[role="status"]')!
    const first = region.textContent
    await new Promise((done) => setTimeout(done, 100))
    return [first, region.textContent]
  })
  expect(seen).toEqual(['', 'Loading'])
})

test('the delay holds the announcement as well as the scrim', async ({ page, renderScenario }) => {
  await renderScenario(card('style="--c2-loading-overlay--delay: 600ms"'))
  const status = overlay(page).locator('[role="status"]')
  await setLoading(page, true)
  await page.waitForTimeout(200)
  await expect(status).toHaveText('')
  await expect(status).toHaveText('Loading')
  // A load that ends inside the delay is never announced.
  await setLoading(page, false)
  await setLoading(page, true)
  await page.waitForTimeout(100)
  await setLoading(page, false)
  await page.waitForTimeout(700)
  await expect(status).toHaveText('')
})

test('label text changed inside the slotted element is picked up', async ({ page, renderScenario }) => {
  await renderScenario('<c2-loading-overlay loading><p>Body</p><span slot="label" id="msg"></span></c2-loading-overlay>')
  await expect(overlay(page).locator('.indicator > .label')).toBeHidden()
  await page.locator('#msg').evaluate((el) => (el.textContent = 'Uploading 40%'))
  await expect(overlay(page).locator('.indicator > .label')).toBeVisible()
  await expect(overlay(page).locator('[role="status"]')).toHaveText('Uploading 40%')
})

test('content with its own z-index stays under the scrim', async ({ page, renderScenario }) => {
  await renderScenario('<c2-loading-overlay loading><div style="position: relative; z-index: 50; height: 80px" id="raised">Sticky</div></c2-loading-overlay>')
  const box = (await page.locator('#raised').boundingBox())!
  const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.localName, { x: box.x + 5, y: box.y + 5 })
  expect(top).toBe('c2-loading-overlay')
})
