import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { Tour } from '../src/tour'

const markup = (attributes = '') => `
  <button id="launch">Take the tour</button>
  <div style="display: flex; gap: 24px; margin-top: 160px">
    <button id="search">Search</button>
    <button id="filters">Filters</button>
  </div>
  <c2-tour ${attributes}>
    <c2-tour-step heading="Welcome">A quick look around.</c2-tour-step>
    <c2-tour-step target="#search" heading="Search">Find anything here.</c2-tour-step>
    <c2-tour-step target="#filters" heading="Filters" placement="right">Narrow the results.</c2-tour-step>
  </c2-tour>`

const host = (page: Page) => page.locator('c2-tour')
const panel = (page: Page) => page.locator('c2-tour .panel')
const spotlight = (page: Page) => page.locator('c2-tour .spotlight')
const dialog = (page: Page, name: string) => page.getByRole('dialog', { name })
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** Records the tour's events, in order, with their detail. */
async function record(page: Page) {
  await host(page).evaluate((element) => {
    const log: string[] = []
    ;(window as unknown as { tourLog: string[] }).tourLog = log
    for (const name of ['step-change', 'finish', 'skip', 'show', 'hide'])
      element.addEventListener(name, (event) => log.push(event instanceof CustomEvent ? `${name}:${JSON.stringify(event.detail)}` : name))
  })
}
const events = (page: Page) => page.evaluate(() => (window as unknown as { tourLog: string[] }).tourLog)

/** Opens the tour the way an app does: a button whose click calls `start()`. */
async function launch(page: Page, index = 0) {
  await page.locator('#launch').evaluate((element, start) => {
    element.addEventListener('click', () => document.querySelector('c2-tour')!.start(start))
  }, index)
  await page.locator('#launch').click()
}

test('is hidden until started, then shows the first step with focus on Next', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await expect(panel(page)).toBeHidden()
  await launch(page)
  const welcome = dialog(page, 'Welcome')
  await expect(welcome).toBeVisible()
  await expect(welcome).toHaveAccessibleDescription('A quick look around.')
  await expect(button(page, 'Next')).toBeFocused()
  await expect(button(page, 'Back')).toBeHidden()
  await expect(page.locator('c2-tour .progress')).toHaveText('1 of 3')
  await expect(host(page)).toHaveAttribute('open', '')
  expect(await events(page)).toEqual(['show'])
})

test('a step without a target shows centred over the dimmed page', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await expect(panel(page)).toHaveAttribute('data-placement', 'center')
  const box = (await panel(page).boundingBox())!
  const viewport = page.viewportSize()!
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(2)
})

test('Next moves through the steps, spotlighting each target and placing the panel beside it', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page)
  await button(page, 'Next').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await expect(page.locator('c2-tour .progress')).toHaveText('2 of 3')
  await expect(panel(page)).toHaveAttribute('data-placement', 'bottom')
  // The spotlight wraps the target with its padding, once it has finished moving.
  const target = (await page.locator('#search').boundingBox())!
  await expect
    .poll(async () => {
      const box = (await spotlight(page).boundingBox())!
      return [Math.round(box.x - target.x), Math.round(box.y - target.y), Math.round(box.width - target.width)]
    })
    .toEqual([-8, -8, 16])
  const panelBox = (await panel(page).boundingBox())!
  expect(panelBox.y).toBeGreaterThan(target.y + target.height)

  await button(page, 'Next').click()
  await expect(dialog(page, 'Filters')).toBeVisible()
  await expect(panel(page)).toHaveAttribute('data-placement', 'right')
  await expect(button(page, 'Done')).toBeFocused()
  expect(await events(page)).toEqual(['show', 'step-change:{"index":1,"previous":0}', 'step-change:{"index":2,"previous":1}'])
})

test('Back returns to the previous step and keeps focus in the panel on the first', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page, 1)
  await expect(dialog(page, 'Search')).toBeVisible()
  await button(page, 'Back').click()
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await expect(button(page, 'Back')).toBeHidden()
  await expect(button(page, 'Next')).toBeFocused()
})

test('Done on the last step fires finish, closes and returns focus', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page, 2)
  await button(page, 'Done').click()
  await expect(panel(page)).toBeHidden()
  await expect(spotlight(page)).toBeHidden()
  await expect(page.locator('#launch')).toBeFocused()
  await expect(host(page)).not.toHaveAttribute('open')
  expect(await events(page)).toEqual(['show', 'finish', 'hide'])
})

test('Escape and the close button skip the tour on the current step', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page)
  await page.keyboard.press('ArrowRight')
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(page.locator('#launch')).toBeFocused()

  await page.keyboard.press('Enter')
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await button(page, 'Close tour').click()
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'step-change:{"index":1,"previous":0}', 'skip:{"index":1}', 'hide', 'show', 'skip:{"index":0}', 'hide'])
})

test('the arrow keys move between steps', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(dialog(page, 'Filters')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(dialog(page, 'Search')).toBeVisible()
})

test('the page stays interactive around the spotlight', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await watch(page.locator('#filters'), 'click')
  await launch(page, 1)
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.locator('#filters').click()
  await expect(page.locator('#filters')).toHaveAttribute('data-events', '[null]')
  await expect(dialog(page, 'Search')).toBeVisible()
})

test('setting open and current from code fires show and hide only', async ({ page, renderScenario }) => {
  await renderScenario(markup('current="1"'))
  await record(page)
  await host(page).evaluate((element) => element.setAttribute('open', ''))
  await expect(dialog(page, 'Search')).toBeVisible()
  await host(page).evaluate((element) => element.setAttribute('current', '2'))
  await expect(dialog(page, 'Filters')).toBeVisible()
  await host(page).evaluate((element) => element.removeAttribute('open'))
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'hide'])
})

test('a step whose target is missing shows centred', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tour open><c2-tour-step target="#nowhere" heading="Gone">Not on this page.</c2-tour-step></c2-tour>`)
  await expect(dialog(page, 'Gone')).toBeVisible()
  await expect(panel(page)).toHaveAttribute('data-placement', 'center')
  await expect(page.locator('c2-tour .progress')).toHaveText('')
  await expect(button(page, 'Done')).toBeVisible()
})

test('the panel follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${markup()}</div>`)
  await launch(page)
  await expect(button(page, 'Suivant')).toBeVisible()
  await expect(button(page, 'Fermer la visite')).toBeVisible()
  await expect(page.locator('c2-tour .progress')).toHaveText('1 sur 3')
})

test('is accessible on a centred and on an anchored step', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await launch(page)
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await accessible(page)
  await button(page, 'Next').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await accessible(page)
})

test('a button in the trigger slot starts the tour from its first step', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-tour current="1">
      <button slot="trigger">Show me around</button>
      <c2-tour-step heading="First">One.</c2-tour-step>
      <c2-tour-step heading="Second">Two.</c2-tour-step>
    </c2-tour>`)
  await expect(button(page, 'Show me around')).toBeVisible()
  await expect(page.locator('c2-tour-step').first()).toBeHidden()
  await button(page, 'Show me around').click()
  await expect(dialog(page, 'First')).toBeVisible()
  await button(page, 'Next').click()
  await expect(dialog(page, 'Second')).toBeVisible()
})

test('Skip ends the tour early and is hidden on the last step', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page)
  await button(page, 'Next').click()
  await button(page, 'Skip').click()
  await expect(panel(page)).toBeHidden()
  await launch(page, 2)
  await expect(button(page, 'Done')).toBeVisible()
  await expect(button(page, 'Skip')).toBeHidden()
  expect(await events(page)).toEqual(['show', 'step-change:{"index":1,"previous":0}', 'skip:{"index":1}', 'hide', 'show'])
})

test('--c2-tour__skip--display: none removes the Skip button', async ({ page, renderScenario }) => {
  await renderScenario(`<style>.no-skip { --c2-tour__skip--display: none }</style>${markup('class="no-skip"')}`)
  await launch(page)
  await expect(button(page, 'Next')).toBeVisible()
  await expect(button(page, 'Skip')).toBeHidden()
})

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('demo-tour') ?? 'null'))

test('storage-key remembers the step and how the tour ended', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.removeItem('demo-tour'))
  await renderScenario(markup('storage-key="demo-tour"'))
  expect(await stored(page)).toBeNull()
  await expect.poll(() => host(page).evaluate((element: Tour) => element.progress)).toEqual({ status: 'new', step: 0, skips: 0 })
  await launch(page)
  await expect.poll(() => stored(page)).toMatchObject({ status: 'in-progress', step: 0, skips: 0 })
  await button(page, 'Next').click()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'in-progress', step: 1, skips: 0 })
  await page.keyboard.press('Escape')
  await expect.poll(() => stored(page)).toMatchObject({ status: 'skipped', step: 1, skips: 1 })

  // Replaying a skipped tour keeps it marked as skipped until it is finished.
  await launch(page, 2)
  await expect.poll(() => stored(page)).toMatchObject({ status: 'skipped', step: 1, skips: 1 })
  await button(page, 'Done').click()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'finished', step: 2, skips: 1 })

  await host(page).evaluate((element: Tour) => element.reset())
  expect(await stored(page)).toBeNull()
})

test('autostart opens on the first visit, resumes the stored step and stays closed once ended', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.removeItem('demo-tour'))
  const autostart = markup('storage-key="demo-tour" autostart')

  await renderScenario(autostart)
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await button(page, 'Next').click()
  await expect(dialog(page, 'Search')).toBeVisible()

  // A reload resumes where the user left off.
  await renderScenario(autostart)
  await expect(dialog(page, 'Search')).toBeVisible()
  await button(page, 'Skip').click()

  await renderScenario(autostart)
  await expect(panel(page)).toBeHidden()
  await expect(host(page)).not.toHaveAttribute('open')

  await page.evaluate(() => localStorage.setItem('demo-tour', JSON.stringify({ status: 'finished', step: 2 })))
  await renderScenario(autostart)
  await expect(panel(page)).toBeHidden()
})

test('storage that throws leaves the tour working', async ({ page, renderScenario }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
  })
  await renderScenario(markup('storage-key="demo-tour" autostart'))
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await button(page, 'Skip').click()
  await expect(panel(page)).toBeHidden()
})

test('below skip-limit a skipped tour autostarts again from its first step, then stops', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.removeItem('demo-tour'))
  const autostart = markup('storage-key="demo-tour" autostart skip-limit="2"')

  await renderScenario(autostart)
  await button(page, 'Next').click()
  await expect(dialog(page, 'Search')).toBeVisible()
  await button(page, 'Skip').click()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'skipped', step: 1, skips: 1 })

  // One skip of two: the next load opens it again, from the start.
  await renderScenario(autostart)
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'in-progress', step: 0, skips: 1 })
  await page.keyboard.press('Escape')
  await expect.poll(() => stored(page)).toMatchObject({ status: 'skipped', step: 0, skips: 2 })

  // The second skip reaches the limit.
  await renderScenario(autostart)
  await expect(panel(page)).toBeHidden()

  // Replaying it from code keeps it settled.
  await host(page).evaluate((element: Tour) => element.start())
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'skipped', step: 0, skips: 2 })
})

test('skip-limit="0" keeps autostarting until the tour is finished', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.setItem('demo-tour', JSON.stringify({ status: 'skipped', step: 1, skips: 5 })))
  const autostart = markup('storage-key="demo-tour" autostart skip-limit="0"')

  await renderScenario(autostart)
  await expect(dialog(page, 'Welcome')).toBeVisible()
  await host(page).evaluate((element: Tour) => element.goTo(2))
  await button(page, 'Done').click()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'finished', step: 2, skips: 5 })

  await renderScenario(autostart)
  await expect(panel(page)).toBeHidden()
})

test('progress stored before skips were counted reads a skipped tour as skipped once', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.setItem('demo-tour', JSON.stringify({ status: 'skipped', step: 1 })))
  await renderScenario(markup('storage-key="demo-tour" autostart'))
  await expect(panel(page)).toBeHidden()
  await expect.poll(() => host(page).evaluate((element: Tour) => element.progress)).toEqual({ status: 'skipped', step: 1, skips: 1 })
})

test('skip-delay keeps a skipped tour closed until the delay has passed', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.removeItem('demo-tour'))
  const autostart = markup('storage-key="demo-tour" autostart skip-limit="3" skip-delay="7d"')

  await renderScenario(autostart)
  const before = Date.now()
  await button(page, 'Skip').click()
  await expect.poll(() => stored(page)).toMatchObject({ status: 'skipped', skips: 1 })
  const { skippedAt } = await stored(page)
  expect(skippedAt).toBeGreaterThanOrEqual(before - 1000)

  // Within the week: stays closed.
  await renderScenario(autostart)
  await expect(panel(page)).toBeHidden()

  // Six days later, still closed; eight days later it opens from the first step.
  const skipped = (daysAgo: number) =>
    page.evaluate(
      (ago) => localStorage.setItem('demo-tour', JSON.stringify({ status: 'skipped', step: 1, skips: 1, skippedAt: Date.now() - ago * 86_400_000 })),
      daysAgo,
    )
  await skipped(6)
  await renderScenario(autostart)
  await expect(panel(page)).toBeHidden()
  await skipped(8)
  await renderScenario(autostart)
  await expect(dialog(page, 'Welcome')).toBeVisible()
  // Reopening keeps the time of the last skip.
  await expect.poll(() => stored(page)).toMatchObject({ status: 'in-progress', step: 0, skips: 1 })
  expect((await stored(page)).skippedAt).toBeLessThan(Date.now() - 7 * 86_400_000)
})

test('skip-delay reads minutes, hours, weeks and bare days', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  const cases: [string, number, boolean][] = [
    ['30m', 20 * 60_000, false],
    ['30m', 40 * 60_000, true],
    ['12h', 11 * 3_600_000, false],
    ['2w', 13 * 86_400_000, false],
    ['2w', 15 * 86_400_000, true],
    ['3', 2 * 86_400_000, false],
    ['3', 4 * 86_400_000, true],
    ['soon', 0, true],
  ]
  for (const [delay, ago, opens] of cases) {
    await page.evaluate((age) => localStorage.setItem('demo-tour', JSON.stringify({ status: 'skipped', step: 0, skips: 1, skippedAt: Date.now() - age })), ago)
    await renderScenario(markup(`storage-key="demo-tour" autostart skip-limit="0" skip-delay="${delay}"`))
    if (opens) await expect(dialog(page, 'Welcome'), `${delay} after ${ago}ms`).toBeVisible()
    else await expect(panel(page), `${delay} after ${ago}ms`).toBeHidden()
  }
})

test('an arrow key on the last step does not finish the tour', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page, 2)
  await page.keyboard.press('ArrowRight')
  await expect(dialog(page, 'Filters')).toBeVisible()
  expect(await events(page)).toEqual(['show'])
})

test('Escape skips the tour while focus is on the page', async ({ page, renderScenario }) => {
  await renderScenario(markup())
  await record(page)
  await launch(page, 1)
  await page.locator('#filters').click()
  await expect(page.locator('#filters')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  expect(await events(page)).toEqual(['show', 'skip:{"index":1}', 'hide'])
})

test('skipping a replay of a finished tour keeps it finished', async ({ page, renderScenario }) => {
  await page.goto('/packages/components/tour/test/scenarios.html')
  await page.evaluate(() => localStorage.setItem('demo-tour', JSON.stringify({ status: 'finished', step: 2, skips: 0 })))
  await renderScenario(markup('storage-key="demo-tour" autostart skip-limit="3"'))
  await expect(panel(page)).toBeHidden()
  await launch(page)
  await button(page, 'Skip').click()
  await expect.poll(() => stored(page)).toEqual({ status: 'finished', step: 2, skips: 0 })
})

test('length variables in any unit place the spotlight and the panel', async ({ page, renderScenario }) => {
  await renderScenario(`<style>c2-tour { --c2-tour__spotlight--padding: 0.75rem; --c2-tour--offset: calc(10px + 0.5rem) }</style>${markup()}`)
  await launch(page, 1)
  await expect(dialog(page, 'Search')).toBeVisible()
  const target = (await page.locator('#search').boundingBox())!
  await expect
    .poll(async () => {
      const box = (await spotlight(page).boundingBox())!
      return [Math.round(box.x - target.x), Math.round(box.width - target.width)]
    })
    .toEqual([-12, 24])
  // Panel below the spotlight: 12px padding + 18px offset + half the 10px arrow.
  const panelBox = (await panel(page).boundingBox())!
  expect(Math.round(panelBox.y - (target.y + target.height))).toBe(12 + 18 + 5)
})

test('an open tour that is moved in the page shows again', async ({ page, renderScenario }) => {
  await renderScenario(`<section id="elsewhere"></section>${markup()}`)
  await launch(page, 1)
  await expect(dialog(page, 'Search')).toBeVisible()
  await host(page).evaluate((element) => document.querySelector('#elsewhere')!.append(element))
  await expect(dialog(page, 'Search')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
})
