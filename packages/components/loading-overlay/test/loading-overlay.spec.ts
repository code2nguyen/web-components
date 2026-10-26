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
  await expect(overlay(page)).toHaveHostAria('aria-busy', null)
  await accessible(page)
})

test('loading covers the content, blocks pointer and keyboard, and marks the region busy', async ({ page, renderScenario, tab }) => {
  await renderScenario(card('loading'))
  await expect(scrim(page)).toBeVisible()
  const [box, cover] = await Promise.all([overlay(page).boundingBox(), scrim(page).boundingBox()])
  expect(cover).toEqual(box)
  await expect(overlay(page)).toHaveHostAria('aria-busy', 'true')
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
