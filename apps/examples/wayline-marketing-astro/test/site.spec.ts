import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Fails the test on any page error or console error, which is how a broken upgrade usually shows. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

const defined = (page: Page, tag: string) => page.evaluate((name) => customElements.get(name) !== undefined, tag)

test('the hero upgrades straight away and the page loads without errors', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('./')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Automate the busywork between your')
  await expect.poll(() => defined(page, 'c2-text-effect')).toBe(true)
  await expect.poll(() => defined(page, 'c2-device-frame')).toBe(true)
  await expect(page.locator('c2-device-frame.hero-frame').locator('[part="address"]')).toHaveText('app.wayline.example/workflows')
  await expect(page.getByRole('table', { name: 'Example workflows in the Wayline dashboard' })).toBeVisible()
  expect(errors).toEqual([])
})

test('below-the-fold components load when their section comes near', async ({ page }) => {
  await page.goto('./')
  // The FAQ is far below the first screen at any viewport size, so its modules have not loaded yet.
  expect(await defined(page, 'c2-accordion')).toBe(false)

  await page.locator('#integrations').scrollIntoViewIfNeeded()
  await expect.poll(() => defined(page, 'c2-beam')).toBe(true)
  // Six connections into and out of the hub, each drawn as a line once the beam has measured its two nodes.
  await expect(page.locator('c2-beam').locator('[part="track"]')).toHaveCount(6)

  await page.locator('#faq').scrollIntoViewIfNeeded()
  await expect.poll(() => defined(page, 'c2-accordion')).toBe(true)
})

test('the billing toggle switches every price', async ({ page }) => {
  await page.goto('./#pricing')
  await expect.poll(() => defined(page, 'c2-button-group')).toBe(true)
  const team = page.locator('.plan', { has: page.getByRole('heading', { name: 'Team', exact: true }) }).locator('.plan__amount')
  await expect(team).toHaveText('$24')

  await page.getByRole('button', { name: 'Yearly · save 20%' }).click()
  await expect(team).toHaveText('$19')
  await expect(page.locator('[data-billing-note]')).toContainText('Billed yearly')

  await page.getByRole('button', { name: 'Monthly' }).click()
  await expect(team).toHaveText('$24')
})

test('signing up checks the email, then confirms with a toast', async ({ page }) => {
  await page.goto('./')
  await page.locator('c2-header').getByRole('button', { name: 'Start free' }).click()
  await expect(page.getByRole('dialog', { name: 'Start your free trial' })).toBeVisible()
  // The form is the modal's slotted content: inside the dialog on screen, but not a DOM descendant of the dialog
  // element in its shadow root, so it is found from the modal host.
  const modal = page.locator('c2-modal#signup')

  await modal.getByRole('button', { name: 'Create workspace' }).click()
  // The field renders the matching message itself; the slotted copies are its source text.
  await expect(modal.getByText('Enter your work email.', { exact: true }).filter({ visible: true })).toHaveCount(1)

  await modal.getByRole('textbox', { name: 'Work email' }).fill('ana@example.com')
  await modal.getByRole('button', { name: 'Create workspace' }).click()
  await expect(page.getByRole('dialog', { name: 'Start your free trial' })).toBeHidden()
  await expect(page.getByText('We sent a sign-in link to ana@example.com.')).toBeVisible()
  // In the page's own region (bottom right), not a second one created at runtime.
  await expect(page.locator('c2-toast-region')).toHaveCount(1)
})

test('a plan button opens the dialog for that plan', async ({ page }) => {
  await page.goto('./#pricing')
  await page.getByRole('button', { name: 'Try Business free' }).click()
  await expect(page.getByRole('dialog', { name: 'Start your free trial' })).toBeVisible()
  await expect(page.locator('[data-signup-plan]')).toHaveText('Business plan · free for 14 days')
})

test('follows the theme the docs site passes in', async ({ page }) => {
  await page.goto('./?theme=dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(background).not.toBe('rgb(255, 255, 255)')
})

test('reduced motion leaves the marquees still and scrollable by hand', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  const strip = page.locator('c2-marquee.logo-strip')
  await strip.scrollIntoViewIfNeeded()
  await expect.poll(() => defined(page, 'c2-marquee')).toBe(true)
  await expect(strip.locator('.item').first()).toHaveCSS('animation-name', 'none')
})

test('has no automatically detectable accessibility problems', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  // Bring every lazily loaded section in, so the scan sees the upgraded components.
  for (const id of ['integrations', 'features', 'pricing', 'faq']) await page.locator(`#${id}`).scrollIntoViewIfNeeded()
  await expect.poll(() => defined(page, 'c2-accordion')).toBe(true)
  await page.locator('footer').scrollIntoViewIfNeeded()
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([])
})
