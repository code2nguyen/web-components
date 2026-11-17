import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, clipboard } from '../../../../tests/component-fixture'

// The RFC 6238 test secrets ("12345678901234567890" repeated to the hash's key length), in base32.
const SHA1 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
const SHA256 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA'
const SHA512 = `${SHA1}${SHA1}${SHA1}GEZDGNA`

type Totp = HTMLElement & { value: string; secret: string }

const code = (page: Page) => page.locator('c2-totp-code').locator('[part="value"]')
const groups = (page: Page) => page.locator('c2-totp-code').locator('[part="group"]')
const countdown = (page: Page) => page.locator('c2-totp-code').locator('[part="countdown"]')
const valueOf = (page: Page) => page.locator('c2-totp-code').evaluate((el: Totp) => el.value)

/** Freezes the clock `seconds` after the epoch; timers then run only through `page.clock.runFor`. */
const at = async (page: Page, seconds: number) => {
  await page.clock.install({ time: seconds * 1000 - 1000 })
  await page.clock.pauseAt(seconds * 1000)
}

test('computes the RFC 6238 codes with Web Crypto, for each hash', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" digits="8" revealed></c2-totp-code>`)
  await expect(groups(page)).toHaveText(['9428', '7082'])
  expect(await valueOf(page)).toBe('94287082')

  await renderScenario(`<c2-totp-code label="Account" secret="${SHA256}" digits="8" algorithm="SHA-256" revealed></c2-totp-code>`)
  await expect(groups(page)).toHaveText(['4611', '9246'])

  // An otpauth URI carries its own parameters, which win over the attributes.
  await renderScenario(
    `<c2-totp-code label="Account" secret="otpauth://totp/Acme:ada?secret=${SHA512}&amp;algorithm=SHA512&amp;digits=8" revealed></c2-totp-code>`,
  )
  await expect(groups(page)).toHaveText(['9069', '3936'])
})

test('six digits by default, in two groups, with a countdown ring', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<c2-totp-code label="GitHub" secret="${SHA1}" revealed></c2-totp-code>`)
  await expect(groups(page)).toHaveText(['287', '082'])
  await expect(countdown(page)).toBeVisible()
  await expect(countdown(page).locator('.sr-only')).toHaveText('New code every 30 seconds')
  await expect(page.getByRole('group', { name: 'GitHub' })).toBeVisible()
  // axe waits on timers, which the paused clock holds.
  await page.clock.resume()
  await accessible(page)
})

test('a new code on the period boundary, with code-change', async ({ page, renderScenario }) => {
  await at(page, 1111111100)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" digits="8" revealed></c2-totp-code>`)
  await expect(groups(page)).toHaveText(['0708', '1804'])
  const host = page.locator('c2-totp-code')
  await watch(host, 'code-change')
  await page.clock.runFor(5_000)
  await expect(groups(page)).toHaveText(['0708', '1804'])
  await page.clock.runFor(6_000)
  await expect(host).toHaveAttribute('data-events', '[null]')
  await expect(groups(page)).not.toHaveText(['0708', '1804'])
  expect(await valueOf(page)).toMatch(/^\d{8}$/)
})

test('the ring and the code turn to the warning colour in the last seconds', async ({ page, renderScenario }) => {
  await at(page, 31)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" revealed></c2-totp-code>`)
  await expect(countdown(page)).not.toHaveClass(/is-warning/)
  await page.clock.runFor(23_000)
  await expect(countdown(page)).not.toHaveClass(/is-warning/)
  await page.clock.runFor(2_000)
  await expect(countdown(page)).toHaveClass(/is-warning/)
  await expect(code(page)).toHaveClass(/is-warning/)
  await expect(code(page)).toHaveCSS('color', 'rgb(220, 38, 38)')
  // The next period starts calm again.
  await page.clock.runFor(5_000)
  await expect(countdown(page)).not.toHaveClass(/is-warning/)
})

test('warning-time moves the warning', async ({ page, renderScenario }) => {
  await at(page, 45)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" warning-time="20" revealed></c2-totp-code>`)
  await expect(countdown(page)).toHaveClass(/is-warning/)
})

test('masked by default, and copy still copies the current code', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}"></c2-totp-code>`)
  await clipboard(page)
  await expect(code(page)).toContainText('•'.repeat(12))
  await expect(code(page)).not.toContainText('287')
  await expect(countdown(page)).toHaveCount(0)
  const host = page.locator('c2-totp-code')
  await watch(host, 'copied')
  await page.getByRole('button', { name: 'Copy code' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-clipboard', '287082')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await page.getByRole('button', { name: 'Show code' }).click()
  await expect(groups(page)).toHaveText(['287', '082'])
})

test('an unreadable secret says the code is unavailable, with nothing to show or copy', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-totp-code label="Account" secret="not base32!" revealed></c2-totp-code>`)
  await expect(code(page)).toHaveText('Code unavailable')
  await expect(page.getByRole('button', { name: 'Copy code' })).toBeDisabled()
  await renderScenario(`<c2-totp-code label="Account" secret="otpauth://hotp/Acme?secret=${SHA1}" revealed></c2-totp-code>`)
  await expect(code(page)).toHaveText('Code unavailable')
})

test('changing the secret recomputes the code', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<c2-totp-code label="Account" digits="8" revealed></c2-totp-code>`)
  await expect(page.locator('c2-totp-code').locator('.sr-only').first()).toHaveText('No code')
  await page.locator('c2-totp-code').evaluate((el: Totp, secret) => (el.secret = secret), SHA1)
  await expect(groups(page)).toHaveText(['9428', '7082'])
  await page.locator('c2-totp-code').evaluate((el: Totp) => (el.secret = ''))
  await expect(groups(page)).toHaveCount(0)
  expect(await valueOf(page)).toBe('')
})

test('costs nothing without a secret: the HMAC module never loads', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-secret-field label="Key" value="acme_live_123456789"></c2-secret-field><c2-totp-code label="Account"></c2-totp-code>`)
  const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').some((entry) => /\/src\/totp\.ts/.test(entry.name)))
  expect(await loaded()).toBe(false)
  await page.locator('c2-totp-code').evaluate((el: Totp, secret) => (el.secret = secret), SHA1)
  await expect.poll(loaded).toBe(true)
})

test('stops its timer when removed', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" revealed></c2-totp-code>`)
  await expect(groups(page)).toHaveText(['287', '082'])
  const host = page.locator('c2-totp-code')
  await watch(host, 'code-change')
  const element = await host.elementHandle()
  await host.evaluate((el) => el.remove())
  await page.clock.runFor(60_000)
  expect(await element!.evaluate((el) => el.getAttribute('data-events'))).toBe('[]')
})

test('built-in text follows the language', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<div lang="fr"><c2-totp-code label="Compte" secret="${SHA1}" revealed></c2-totp-code></div>`)
  await expect(page.getByRole('button', { name: 'Afficher le code' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copier le code' })).toBeVisible()
  await expect(countdown(page).locator('.sr-only')).toHaveText('Nouveau code toutes les 30 secondes')
})

test('a hidden code of 8 digits shows none of them', async ({ page, renderScenario }) => {
  await at(page, 59)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" digits="8"></c2-totp-code>`)
  await expect.poll(() => valueOf(page)).toBe('94287082')
  await expect(code(page)).not.toContainText('7082')
  await expect(code(page).locator('.sr-only')).toHaveText('Hidden')
})

test('the value attribute is not read: the element owns the code', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-totp-code label="Account" value="123456" revealed></c2-totp-code>`)
  expect(await valueOf(page)).toBe('')
})

test('a warning-time that is not a number does not spin the timer', async ({ page, renderScenario }) => {
  await at(page, 31)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" warning-time="soon" revealed></c2-totp-code>`)
  await expect(groups(page)).toHaveCount(2)
  const host = page.locator('c2-totp-code')
  await watch(host, 'code-change')
  // A loop would run thousands of zero-delay timers here; one boundary passes, one event.
  await page.clock.runFor(30_000)
  await expect(host).toHaveAttribute('data-events', '[null]')
})

test('off screen the clock sleeps, and catches up when scrolled back', async ({ page, renderScenario }) => {
  await at(page, 31)
  await renderScenario(`<c2-totp-code label="Account" secret="${SHA1}" revealed></c2-totp-code><div style="height: 3000px"></div>`)
  const host = page.locator('c2-totp-code')
  await expect.poll(() => valueOf(page)).toMatch(/^\d{6}$/)
  const first = await valueOf(page)
  await watch(host, 'code-change')
  await page.evaluate(() => window.scrollTo(0, 2500))
  await expect.poll(() => host.evaluate((el) => el.shadowRoot!.querySelector('.ring')!.getAnimations()[0].playState)).toBe('paused')
  await page.clock.runFor(60_000)
  await expect(host).toHaveAttribute('data-events', '[]')
  await host.scrollIntoViewIfNeeded()
  await expect(host).toHaveAttribute('data-events', '[null]')
  expect(await valueOf(page)).not.toBe(first)
})

test('keyboard: Tab reaches show then copy, and Space shows the code', async ({ page, renderScenario, tab }) => {
  await at(page, 59)
  await renderScenario(`<button id="before">Before</button><c2-totp-code label="Account" secret="${SHA1}"></c2-totp-code>`)
  await page.locator('#before').focus()
  await tab()
  await page.keyboard.press('Space')
  await expect(groups(page)).toHaveText(['287', '082'])
  await tab()
  await expect(page.locator('c2-totp-code').locator('c2-copy-button')).toBeFocused()
})
