import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Sheet = HTMLElement & { open: boolean; share(): Promise<void> }

const sheet = (page: Page) => page.locator('c2-share-sheet')
const events = async (page: Page) => JSON.parse((await sheet(page).getAttribute('data-events'))!)
const URL = 'https://trips.example/t/123?ref=a&b=c'

const scenario = (attributes = '') => `<c2-share-sheet heading="Trip to Lisbon" text="Look at this" url="${URL}" ${attributes}></c2-share-sheet>`

test('opens as a dialog named by its heading, with the link and the targets as encoded links', async ({ page, renderScenario }) => {
  await renderScenario(scenario('open qr'))
  const dialog = page.getByRole('dialog', { name: 'Share “Trip to Lisbon”' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Link' })).toHaveValue(URL)
  const linkedin = page.getByRole('link', { name: 'Share on LinkedIn' })
  await expect(linkedin).toHaveAttribute('href', `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(URL)}`)
  await expect(linkedin).toHaveAttribute('target', '_blank')
  await expect(linkedin).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(page.getByRole('link', { name: 'Share by email' })).toHaveAttribute(
    'href',
    `mailto:?subject=${encodeURIComponent('Trip to Lisbon')}&body=${encodeURIComponent(`Look at this ${URL}`)}`,
  )
  await expect(page.getByRole('link', { name: 'Share on X' })).toHaveAttribute(
    'href',
    `https://x.com/intent/post?url=${encodeURIComponent(URL)}&text=Look%20at%20this`,
  )
  await expect(sheet(page).locator('c2-qr-code')).toHaveAttribute('aria-label', `QR code for ${URL}`)
  await accessible(page)
})

test('a target fires a cancelable share; targets follows the list; a non-http link offers no target', async ({ page, renderScenario }) => {
  await renderScenario(scenario('open targets="reddit;telegram;nope"'))
  await watch(sheet(page), 'share')
  await sheet(page).evaluate((element: Sheet) => element.addEventListener('share', (event) => event.preventDefault()))
  await expect(page.getByRole('list', { name: 'Share to' }).getByRole('link')).toHaveCount(2)
  await page.getByRole('link', { name: 'Share on Reddit' }).click()
  expect(await events(page)).toEqual([{ target: 'reddit', url: URL }])
  await expect(page).toHaveURL(/scenarios/)
  await sheet(page).evaluate((element: Sheet) => element.setAttribute('url', 'javascript:alert(1)'))
  await expect(page.getByRole('list', { name: 'Share to' })).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Link' })).toHaveValue('')
})

test('Escape closes it and fires close; share() opens it where the device has no share sheet', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }))
  await watch(sheet(page), 'close')
  await sheet(page).evaluate((element: Sheet) => element.share())
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  expect(await sheet(page).evaluate((element: Sheet) => element.open)).toBe(false)
  expect(await events(page)).toHaveLength(1)
})

test('with a device share sheet, share() uses it and More appears; text follows the language', async ({ page, renderScenario }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: ShareData) => {
        ;(window as unknown as { shared: ShareData[] }).shared = [...((window as unknown as { shared?: ShareData[] }).shared ?? []), data]
        return Promise.resolve()
      },
    })
  })
  await renderScenario(`<div lang="fr">${scenario()}</div>`)
  await sheet(page).evaluate((element: Sheet) => element.share())
  expect(await page.evaluate(() => (window as unknown as { shared: ShareData[] }).shared)).toEqual([
    { title: 'Trip to Lisbon', text: 'Look at this', url: URL },
  ])
  await expect(page.getByRole('dialog')).toBeHidden()
  await sheet(page).evaluate((element: Sheet) => (element.open = true))
  await expect(page.getByRole('dialog', { name: 'Partager « Trip to Lisbon »' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plus d’options de partage' })).toBeVisible()
})

test('open fires once the dialog is shown; the QR code takes the sheet size', async ({ page, renderScenario }) => {
  await renderScenario(scenario('qr'))
  await sheet(page).evaluate((element: Sheet) => {
    element.addEventListener('open', () => {
      const dialog = element.shadowRoot!.querySelector('c2-sheet')!.shadowRoot!.querySelector('dialog')!
      element.dataset.openSeen = String(dialog.open)
    })
    element.open = true
  })
  await expect(sheet(page)).toHaveAttribute('data-open-seen', 'true')
  const box = await sheet(page).locator('c2-qr-code').boundingBox()
  expect(Math.round(box!.width)).toBe(160)
})
