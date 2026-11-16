import { test, expect, props, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const bar = (page: Page) => page.locator('c2-navigation-progress')

/** The bar's width as a share of the track's. */
const fill = (page: Page) =>
  bar(page)
    .locator('[part="track"]')
    .evaluate((track) => {
      const indicator = track.querySelector('[part="indicator"]') as HTMLElement
      return indicator.getBoundingClientRect().width / track.getBoundingClientRect().width
    })

const call = (page: Page, method: 'start' | 'done') => bar(page).evaluate((el, name) => (el as HTMLElement & Record<string, () => void>)[name](), method)

test('takes no room and shows nothing until a run starts', async ({ page, renderScenario }) => {
  await renderScenario('<p>Before</p><c2-navigation-progress></c2-navigation-progress><p>After</p>')
  await expect(bar(page).locator('[part="track"]')).toBeHidden()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
  expect(await bar(page).evaluate((el) => getComputedStyle(el).display)).toBe('contents')
})

test('start() shows the bar across the top of the viewport in the top layer, and trickles it forward', async ({ page, renderScenario }) => {
  await renderScenario('<c2-navigation-progress></c2-navigation-progress>')
  await call(page, 'start')
  const track = bar(page).locator('[part="track"]')
  await expect(page.getByRole('progressbar', { name: 'Loading page' })).toBeVisible()
  await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow')
  expect(await track.evaluate((el) => el.matches(':popover-open'))).toBe(true)
  const box = await track.boundingBox()
  expect(box).toMatchObject({ x: 0, y: 0, width: page.viewportSize()!.width, height: 3 })
  const first = await fill(page)
  await expect.poll(() => fill(page)).toBeGreaterThan(first + 0.1)
  // Trickling never fills the bar on its own.
  expect(await fill(page)).toBeLessThan(1)
  await accessible(page)
})

test('done() fills the bar, fades it out and hides it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-navigation-progress></c2-navigation-progress>')
  await call(page, 'start')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await call(page, 'done')
  const track = bar(page).locator('[part="track"]')
  await expect(track).toHaveClass(/is-done/)
  await expect(track).toBeHidden()
  expect(await track.evaluate((el) => el.matches(':popover-open'))).toBe(false)
  // Done again does nothing.
  await call(page, 'done')
  await expect(track).toBeHidden()
})

test('a finished animation the page adds to the bar does not hold the run open', async ({ page, renderScenario }) => {
  await renderScenario(
    '<style>@keyframes flash { from { filter: brightness(2) } } c2-navigation-progress::part(indicator) { animation: flash 50ms both }</style><c2-navigation-progress></c2-navigation-progress>',
  )
  await call(page, 'start')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await call(page, 'done')
  await expect(bar(page).locator('[part="track"]')).toBeHidden()
})

test('the hidden attribute hides a running bar', async ({ page, renderScenario }) => {
  await renderScenario('<c2-navigation-progress active hidden></c2-navigation-progress>')
  await expect(bar(page).locator('[part="track"]')).toBeHidden()
  await expect(page.getByRole('progressbar')).toHaveCount(0)
})

test('the active property runs the bar for a framework binding', async ({ page, renderScenario }) => {
  await renderScenario('<c2-navigation-progress active></c2-navigation-progress>')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await props(bar(page), { active: false })
  await expect(bar(page).locator('[part="track"]')).toBeHidden()
})

test('starting while the bar fades out begins a new run from the start', async ({ page, renderScenario }) => {
  await renderScenario('<c2-navigation-progress style="--c2-navigation-progress--fade-duration: 2s"></c2-navigation-progress>')
  await call(page, 'start')
  await expect(page.getByRole('progressbar')).toBeVisible()
  await call(page, 'done')
  await expect.poll(() => fill(page)).toBe(1)
  await call(page, 'start')
  // A fresh bar, not the full one shrinking back.
  expect(await fill(page)).toBeLessThan(0.3)
  await expect(bar(page).locator('[part="track"]')).toHaveCSS('opacity', '1')
  await expect(page.getByRole('progressbar')).toBeVisible()
})

test('shows above an open modal dialog', async ({ page, renderScenario }) => {
  await renderScenario('<dialog>Edit</dialog><c2-navigation-progress></c2-navigation-progress>')
  await page.locator('dialog').evaluate((dialog: HTMLDialogElement) => dialog.showModal())
  await call(page, 'start')
  // The bar entered the top layer after the dialog, so it is drawn above it and its backdrop.
  expect(
    await bar(page)
      .locator('[part="track"]')
      .evaluate((el) => el.matches(':popover-open')),
  ).toBe(true)
  await expect(bar(page).locator('[part="track"]')).toBeVisible()
})

test('contained draws the bar at the top of its positioned container instead of the viewport', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div id="panel" style="position:relative;margin-top:40px;margin-left:20px;width:300px;height:120px"><c2-navigation-progress contained active></c2-navigation-progress></div>',
  )
  const track = bar(page).locator('[part="track"]')
  await expect(track).toBeVisible()
  expect(await track.getAttribute('popover')).toBeNull()
  const [panel, box] = await Promise.all([page.locator('#panel').boundingBox(), track.boundingBox()])
  expect(box).toMatchObject({ x: panel!.x, y: panel!.y, width: 300, height: 3 })
})

test('is named in the nearest lang, and the label wins', async ({ page, renderScenario }) => {
  await renderScenario('<div lang="fr"><c2-navigation-progress active></c2-navigation-progress></div>')
  await expect(page.getByRole('progressbar', { name: 'Chargement de la page' })).toBeVisible()
  await props(bar(page), { label: 'Opening the invoice' })
  await expect(page.getByRole('progressbar', { name: 'Opening the invoice' })).toBeVisible()
})

test('the variables restyle the bar', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-navigation-progress active style="--c2-navigation-progress--height: 5px; --c2-navigation-progress__indicator--background-color: rgb(220, 38, 38)"></c2-navigation-progress>',
  )
  await expect(bar(page).locator('[part="track"]')).toHaveCSS('height', '5px')
  await expect(bar(page).locator('[part="indicator"]')).toHaveCSS('background-color', 'rgb(220, 38, 38)')
})

test('a bar taken out of the page mid-run carries on when it comes back', async ({ page, renderScenario }) => {
  await renderScenario('<div id="a"></div><c2-navigation-progress active></c2-navigation-progress>')
  await bar(page).evaluate((el) => {
    el.remove()
    document.querySelector('#a')!.append(el)
  })
  const first = await fill(page)
  await expect.poll(() => fill(page)).toBeGreaterThan(first)
  await expect(bar(page).locator('[part="track"]')).toBeVisible()
})
