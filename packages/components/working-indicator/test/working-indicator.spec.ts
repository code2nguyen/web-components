import { test, expect, props, accessible, hostAria } from '../../../../tests/component-fixture'
import type { Locator } from '@playwright/test'

const host = (page: import('@playwright/test').Page) => page.locator('c2-working-indicator')
const visibleText = (locator: Locator) => locator.locator('[part="label"]')
const announced = (locator: Locator) => locator.locator('.visually-hidden')

test('a bare indicator is a busy status named "Working"', async ({ page, renderScenario }) => {
  await renderScenario('<c2-working-indicator></c2-working-indicator>')
  const indicator = host(page)
  await expect(indicator).toHaveHostAria('role', 'status')
  await expect(indicator).toHaveHostAria('aria-busy', 'true')
  await expect(visibleText(indicator)).toHaveText('Working')
  await expect(announced(indicator)).toHaveText('Working')
  await expect(indicator.locator('.glyph')).toBeVisible()
  await expect(indicator.locator('[part="ellipsis"]')).toBeVisible()
  // The clean element writes nothing on its host.
  expect(await indicator.evaluate((element) => element.getAttributeNames())).toEqual([])
  await accessible(page)
})

test('each indicator preset renders its own mark', async ({ page, renderScenario }) => {
  await renderScenario(
    ['dots', 'ring', 'pulse', 'orbit', 'none'].map((name) => `<c2-working-indicator indicator="${name}" label="${name}"></c2-working-indicator>`).join(''),
  )
  for (const name of ['dots', 'ring', 'pulse', 'orbit']) {
    await expect(page.locator(`c2-working-indicator[indicator="${name}"]`).locator(`.${name}`)).toBeVisible()
  }
  await expect(page.locator('c2-working-indicator[indicator="none"]').locator('[part="indicator"]')).toHaveCount(0)
})

test('finishing stops the work and keeps the line as a record', async ({ page, renderScenario }) => {
  await renderScenario('<c2-working-indicator label="Scheming" done-label="Schemed for 14s"></c2-working-indicator>')
  const indicator = host(page)
  await props(indicator, { state: 'done' })
  await expect(indicator).toHaveHostAria('aria-busy', 'false')
  await expect(visibleText(indicator)).toHaveText('Schemed for 14s')
  await expect(announced(indicator)).toHaveText('Schemed for 14s')
  await expect(indicator.locator('[part="indicator"] slot[name="done-icon"] svg')).toBeVisible()
  await expect(indicator.locator('[part="ellipsis"]')).toBeHidden()
  await props(indicator, { state: 'error', doneLabel: '' })
  await expect(indicator.locator('[part="indicator"] slot[name="error-icon"] svg')).toBeVisible()
  await expect(visibleText(indicator)).toHaveText('Scheming')
  await accessible(page)
})

test('messages rotate on screen while the announcement stays put', async ({ page, renderScenario }) => {
  await renderScenario(`
    <style>c2-working-indicator { --c2-working-indicator__label--rotate-duration: 150ms }</style>
    <c2-working-indicator label="Thinking" messages='["Scheming","Pondering","Brewing"]'></c2-working-indicator>`)
  const indicator = host(page)
  await expect(visibleText(indicator)).toHaveText('Scheming')
  await expect(visibleText(indicator)).toHaveText('Pondering')
  await expect(visibleText(indicator)).toHaveText('Brewing')
  await expect(visibleText(indicator)).toHaveText('Scheming')
  await expect(announced(indicator)).toHaveText('Thinking')
})

test('reduced motion stops every animation but keeps the messages rotating', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`
    <style>c2-working-indicator { --c2-working-indicator__label--rotate-duration: 150ms }</style>
    <c2-working-indicator effect="wave" messages='["Scheming","Pondering"]'></c2-working-indicator>`)
  const indicator = host(page)
  await expect(visibleText(indicator)).toHaveText('Pondering')
  const names = await indicator.evaluate((element) =>
    [...element.shadowRoot!.querySelectorAll('*')].flatMap((node) => node.getAnimations().map((animation) => (animation as CSSAnimation).animationName)),
  )
  expect(names).toEqual(['c2-working-indicator-hold'])
})

test('the wave effect splits the label into letters', async ({ page, renderScenario }) => {
  await renderScenario('<c2-working-indicator effect="wave" label="Go on"></c2-working-indicator>')
  const chars = host(page).locator('.char')
  await expect(chars).toHaveCount(5)
  await expect(chars.nth(4)).toHaveAttribute('style', /--c2-working-indicator-index: ?4/)
})

test('the elapsed counter runs, pauses and freezes on completion', async ({ page, renderScenario }) => {
  await page.clock.install()
  await renderScenario('<c2-working-indicator elapsed><span slot="meta">esc to interrupt</span></c2-working-indicator>')
  const indicator = host(page)
  const elapsed = indicator.locator('[part="elapsed"]')
  await expect(elapsed).toHaveText('0s')
  await expect(indicator.locator('.has-separator')).toHaveCount(1)
  await page.clock.runFor(5000)
  await expect(elapsed).toHaveText('5s')
  await props(indicator, { state: 'paused' })
  await page.clock.runFor(10_000)
  await expect(elapsed).toHaveText('5s')
  await props(indicator, { state: 'running' })
  await page.clock.runFor(60_000)
  await expect(elapsed).toHaveText('1m 05s')
  await props(indicator, { state: 'done' })
  await page.clock.runFor(10_000)
  await expect(elapsed).toHaveText('1m 05s')
})

test('the counter starts from the given start time', async ({ page, renderScenario }) => {
  await page.clock.install({ time: new Date('2026-01-01T10:00:00Z') })
  const started = new Date('2026-01-01T08:58:00Z').getTime()
  await renderScenario(`<c2-working-indicator elapsed started="${started}"></c2-working-indicator>`)
  await expect(host(page).locator('[part="elapsed"]')).toHaveText('1h 02m')
})

test('a value makes it a progress bar whose label fills to that fraction', async ({ page, renderScenario }) => {
  await renderScenario('<c2-working-indicator label="Uploading" effect="fill" value="25"></c2-working-indicator>')
  const indicator = host(page)
  await expect(indicator).toHaveHostAria('role', 'progressbar')
  await expect(indicator).toHaveHostAria('aria-valuenow', '25')
  await expect(visibleText(indicator)).toHaveCSS('background-position-x', '75%')
  await props(indicator, { value: 200 })
  await expect(indicator).toHaveHostAria('aria-valuenow', '100')
  await props(indicator, { value: undefined })
  await expect(indicator).toHaveHostAria('role', 'status')
  expect(await hostAria(indicator, 'aria-valuenow')).toBeNull()
})

test('slotted label content replaces the text and is exposed as is', async ({ page, renderScenario }) => {
  await renderScenario('<c2-working-indicator label="ignored"><strong>Deploying</strong> to prod</c2-working-indicator>')
  const indicator = host(page)
  await expect(visibleText(indicator)).not.toHaveAttribute('aria-hidden')
  await expect(announced(indicator)).toHaveText('')
  expect(await indicator.evaluate((element) => element.textContent)).toBe('Deploying to prod')
  expect(await indicator.evaluate((element) => element.shadowRoot!.querySelector('[part="label"]')!.textContent!.trim())).toBe('')
  await accessible(page)
})

test('in a narrow box the meta text gives way before the label', async ({ page, renderScenario }) => {
  await renderScenario(`
    <div style="width: 200px">
      <c2-working-indicator label="Scheming" elapsed><span slot="meta">esc to interrupt the current task</span></c2-working-indicator>
    </div>`)
  const indicator = host(page)
  const clipped = (selector: string) =>
    indicator.evaluate((element, part) => {
      const node = element.shadowRoot!.querySelector(part) as HTMLElement
      return node.scrollWidth > node.clientWidth
    }, selector)
  expect(await clipped('[part="label"]')).toBe(false)
  expect(await clipped('.meta-text')).toBe(true)
  expect((await indicator.boundingBox())!.width).toBeLessThanOrEqual(200)
})
