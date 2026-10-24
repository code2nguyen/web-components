import { test, expect, watch, accessible } from '../../../../tests/component-fixture'
import type { Locator } from '@playwright/test'

const shell = (attributes = '', frame = '', extra = '') => `
  <div class="frame ${frame}">
    <c2-app-shell aside-label="Payout details" ${attributes}>
      <p slot="banner">Test mode</p>
      <c2-header slot="header">
        <c2-app-shell-toggle slot="brand"></c2-app-shell-toggle>
        <a slot="brand" href="#home">Ledgerline</a>
      </c2-header>
      <div slot="navigation-header">Acme EU</div>
      <ul slot="navigation">
        <li><a href="#payouts">P<span class="label">ayouts</span></a></li>
        <li><a href="#batches">B<span class="label">atches</span></a></li>
      </ul>
      <button slot="navigation-footer">Settings</button>
      <h1>Payouts</h1>
      <button app-shell-toggle="aside">Show details</button>
      <section slot="aside"><c2-app-shell-toggle for="aside"></c2-app-shell-toggle><p>PO-2291</p></section>
      <p slot="footer">Synced</p>
      ${extra}
    </c2-app-shell>
  </div>`

const columnWidth = (host: Locator, name: 'navigation' | 'aside') =>
  host.evaluate((element, region) => {
    const columns = getComputedStyle(element.shadowRoot!.querySelector('.c2-app-shell')!).gridTemplateColumns.split(' ')
    return Math.round(parseFloat(columns[region === 'navigation' ? 0 : 2]))
  }, name)

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
})

test('slots land in their landmarks and the skip link moves focus to main', async ({ page, renderScenario, tab }) => {
  await renderScenario(shell())
  const host = page.locator('c2-app-shell')
  await expect(host).toHaveState('desktop')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Payout details' })).toBeHidden()
  // The scenario page wraps everything in a <main>, which would hide a banner; the shell keeps its header outside its own.
  await page.evaluate(() => document.body.append(document.querySelector('.frame')!))
  await expect(page.getByRole('banner')).toBeVisible()
  await tab()
  const skip = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skip).toBeFocused()
  await skip.press('Enter')
  await expect(host.locator('[part="main"]')).toBeFocused()
})

test('reads its own width, not the window: side, rail and drawer', async ({ page, renderScenario }) => {
  await renderScenario(shell())
  const host = page.locator('c2-app-shell')
  await watch(host, 'mode-change')
  await expect(host).toHaveState('side')
  await expect(host).toHaveState('navigation-opened')
  await expect.poll(() => columnWidth(host, 'navigation')).toBe(240)

  await page.locator('.frame').evaluate((frame) => frame.classList.add('tablet'))
  await expect(host).toHaveState('rail')
  await expect(host).not.toHaveState('navigation-opened')
  await expect.poll(() => columnWidth(host, 'navigation')).toBe(64)

  await page.locator('.frame').evaluate((frame) => frame.classList.replace('tablet', 'phone'))
  await expect(host).toHaveState('over')
  await expect.poll(() => columnWidth(host, 'navigation')).toBe(0)
  await expect(host).toHaveAttribute('data-events', '[{"breakpoint":"tablet","mode":"rail"},{"breakpoint":"phone","mode":"over"}]')
})

test('the toggle in the slotted header collapses and restores the side navigation', async ({ page, renderScenario }) => {
  await renderScenario(shell())
  const host = page.locator('c2-app-shell')
  await watch(host, 'navigation-opened-change')
  const toggle = page.getByRole('button', { name: 'Close navigation' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(host).not.toHaveState('navigation-opened')
  await expect.poll(() => columnWidth(host, 'navigation')).toBe(0)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  const open = page.getByRole('button', { name: 'Open navigation' })
  await expect(open).toHaveAttribute('aria-expanded', 'false')
  await open.click()
  await expect.poll(() => columnWidth(host, 'navigation')).toBe(240)
  await expect(host).toHaveAttribute('data-events', '[{"opened":false,"mode":"side"},{"opened":true,"mode":"side"}]')
})

test('a rail expands from its icons and labels follow the state', async ({ page, renderScenario }) => {
  await renderScenario(shell('', 'tablet'))
  const host = page.locator('c2-app-shell')
  await expect(host).toHaveState('rail')
  await expect(page.locator('.label').first()).toBeHidden()
  await expect(page.getByRole('link', { name: 'P', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect.poll(() => columnWidth(host, 'navigation')).toBe(240)
  await expect(page.locator('.label').first()).toBeVisible()
})

test('the drawer is modal: focus moves in, the rest is inert, Escape closes it and returns focus', async ({ page, renderScenario, tab }) => {
  await renderScenario(shell('', 'phone'))
  const host = page.locator('c2-app-shell')
  await expect(host).toHaveState('over')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await tab()
  await tab()
  const toggle = page.getByRole('button', { name: 'Open navigation' })
  await expect(toggle).toBeFocused()
  await toggle.press('Enter')
  await expect(host).toHaveState('navigation-opened')
  await expect(page.getByRole('link', { name: 'Payouts' })).toBeFocused()
  await expect(host.locator('[part="main"]')).toHaveAttribute('inert', '')
  await expect(host.locator('div[part="header"]')).toHaveAttribute('inert', '')
  await expect(page.getByRole('dialog', { name: 'Main' })).toBeVisible()
  // Fixed to the viewport even though the host is a size container.
  await expect.poll(() => page.getByRole('dialog', { name: 'Main' }).boundingBox()).toMatchObject({ x: 0, y: 0, height: 800 })
  await page.keyboard.press('Escape')
  await expect(host).not.toHaveState('navigation-opened')
  await expect(toggle).toBeFocused()
  await expect(host.locator('[part="main"]')).not.toHaveAttribute('inert', '')
})

test('the backdrop closes the drawer, and close-on-navigate closes it after a link', async ({ page, renderScenario }) => {
  await renderScenario(shell('close-on-navigate', 'phone'))
  const host = page.locator('c2-app-shell')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(host).toHaveState('navigation-opened')
  await page.mouse.click(460, 400)
  await expect(host).not.toHaveState('navigation-opened')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('link', { name: 'Batches' }).click()
  await expect(host).not.toHaveState('navigation-opened')
  await expect(host.locator('[part="main"]')).toBeFocused()
})

test('an app-shell-toggle attribute opens the aside: a column on desktop, a sheet below', async ({ page, renderScenario }) => {
  await renderScenario(shell())
  const host = page.locator('c2-app-shell')
  await watch(host, 'aside-opened-change')
  await page.getByRole('button', { name: 'Show details' }).first().click()
  await expect(host).toHaveState('aside-opened')
  await expect.poll(() => columnWidth(host, 'aside')).toBe(320)
  await expect(page.getByRole('complementary', { name: 'Payout details' })).toBeVisible()
  await page.getByRole('button', { name: 'Close details' }).click()
  await expect.poll(() => columnWidth(host, 'aside')).toBe(0)
  await expect(host).toHaveAttribute('data-events', '[{"opened":true},{"opened":false}]')

  await page.locator('.frame').evaluate((frame) => frame.classList.add('tablet'))
  await expect(host).toHaveState('tablet')
  await page.getByRole('button', { name: 'Show details' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Payout details' })).toBeVisible()
  await expect.poll(() => columnWidth(host, 'aside')).toBe(0)
  await page.keyboard.press('Escape')
  await expect(host).not.toHaveState('aside-opened')
})

test('setting a property fires no event; nothing is written on the host', async ({ page, renderScenario }) => {
  await renderScenario(shell())
  const host = page.locator('c2-app-shell')
  await watch(host, 'navigation-opened-change')
  const before = await host.evaluate((element) =>
    element
      .getAttributeNames()
      .filter((name) => name !== 'data-events')
      .sort(),
  )
  await host.evaluate(async (element) => {
    ;(element as HTMLElement & { navigationOpened: boolean }).navigationOpened = false
    await (element as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
  await expect(host).not.toHaveState('navigation-opened')
  await expect(host).toHaveAttribute('data-events', '[]')
  expect(
    await host.evaluate((element) =>
      element
        .getAttributeNames()
        .filter((name) => name !== 'data-events')
        .sort(),
    ),
  ).toEqual(before)
})

test('a toggle belongs to the nearest shell', async ({ page, renderScenario }) => {
  const inner =
    '<c2-app-shell slot="aside" id="inner"><button app-shell-toggle slot="header">Inner toggle</button><nav slot="navigation" aria-label="Inner">x</nav></c2-app-shell>'
  await renderScenario(shell('aside-opened', '', inner))
  const outer = page.locator('c2-app-shell').first()
  await expect(outer).toHaveState('navigation-opened')
  await page.getByRole('button', { name: 'Inner toggle' }).click()
  await expect(outer).toHaveState('navigation-opened')
})

test('sticky offset: the header height with the page scrolling, 0 when main scrolls', async ({ page, renderScenario }) => {
  await renderScenario(shell())
  const host = page.locator('c2-app-shell')
  const offset = () => host.evaluate((element) => getComputedStyle(element).getPropertyValue('--c2-app-shell--sticky-offset').trim())
  const header = await host.locator('div[part="header"]').evaluate((element) => Math.round(element.getBoundingClientRect().height))
  await expect.poll(offset).toBe(`${header}px`)
  await host.evaluate((element) => element.setAttribute('scrolling', 'main'))
  await expect.poll(offset).toBe('0px')
})

test('storage-key keeps the side choice across reloads', async ({ page, renderScenario }) => {
  await renderScenario(shell('storage-key="shell-test"'))
  await page.getByRole('button', { name: 'Close navigation' }).click()
  expect(await page.evaluate(() => localStorage.getItem('shell-test'))).toBe('{"side":false,"rail":false}')
  await renderScenario(shell('storage-key="shell-test"'))
  await expect(page.locator('c2-app-shell')).not.toHaveState('navigation-opened')
  await page.evaluate(() => localStorage.removeItem('shell-test'))
})

test('localised names follow lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${shell()}</div>`)
  await page.evaluate(async () => {
    const { addTranslations } = await import('/packages/core/src/localize.ts')
    addTranslations({ fr: { 'app-shell': { navigation: 'Principale', closeNavigation: 'Fermer la navigation' } } })
  })
  await expect(page.getByRole('navigation', { name: 'Principale' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fermer la navigation' })).toBeVisible()
})

test('accessible on desktop and with the drawer open', async ({ page, renderScenario }) => {
  await renderScenario(shell())
  await accessible(page)
  await renderScenario(shell('', 'phone'))
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await expect(page.locator('c2-app-shell')).toHaveState('navigation-opened')
  await accessible(page)
})
