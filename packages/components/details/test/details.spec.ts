import { test, expect, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('header-content presence follows assignment, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const region = page.locator('c2-details').locator('[part="header-content"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-details label="Settings"><span slot="header-content" data-slot-presence-probe>Edit</span></c2-details>',
    host: 'c2-details',
    slot: 'header-content',
    assertPresent: async (present) => (present ? expect(region).toBeVisible() : expect(region).toBeHidden()),
  })
})
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import type { Details } from '../src/details'

// Closed content is skipped with `content-visibility: hidden`. Playwright's WebKit visibility check does not ask the
// browser, and its closed-`<details>` lookup stops at the shadow boundary, so ask `checkVisibility()` directly.
const shown = (locator: Locator) => expect.poll(() => locator.evaluate((element) => element.checkVisibility()))

test('click and keyboard expand and collapse content', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  const summary = page.locator('summary')
  await shown(page.getByText('Arrives tomorrow')).toBe(false)
  await summary.click()
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await summary.press('Enter')
  await shown(page.getByText('Arrives tomorrow')).toBe(false)
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  await accessible(page)
})
test('disabled disclosure ignores pointer and keyboard activation', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Locked" disabled>Secret</c2-details>')
  await page.locator('summary').click()
  await page.locator('summary').press('Space')
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})
test('interactive header content does not toggle the panel', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Settings"><button slot="header-content">Edit</button>Panel</c2-details>')
  await page.getByRole('button', { name: 'Edit' }).click()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
})

test('public parts style title, header content and body regions', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details expanded><span slot="title">Title</span><button slot="header-content">Edit</button><p>Body</p></c2-details>')
  await page.addStyleTag({
    content:
      'c2-details::part(title){background:rgb(1,2,3)}c2-details::part(header-content){background:rgb(4,5,6)}c2-details::part(body){background:rgb(7,8,9)}',
  })
  const host = page.locator('c2-details')
  await expect(host.locator('.c2-details-summary-content')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await expect(host.locator('.c2-details-header-content')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
  await expect(host.locator('.c2-details-body')).toHaveCSS('background-color', 'rgb(7, 8, 9)')
})

test('opens on the first activation while restored state is waiting to render', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  await page.locator('c2-details').evaluate((element) => {
    const details = element as Details
    details.expanded = true
    details.shadowRoot?.querySelector('summary')?.click()
  })
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', true)
})

// The generated theme must leave the per-side border variables unset so they fall through to the shorthand.
const THEME_CSS = fileURLToPath(new URL('../../../tools/theme/dist/theme.css', import.meta.url))

test('the border shorthand reaches every side, with and without @c2n/theme, and a per-side variable still wins', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Frame">Body</c2-details>')
  const host = page.locator('c2-details')
  const frame = host.locator('.c2-details')
  const expectSides = async (sides: Record<'top' | 'right' | 'bottom' | 'left', string>) => {
    for (const [side, value] of Object.entries(sides)) {
      const [width, ...color] = value.split(' ')
      await expect(frame).toHaveCSS(`border-${side}-width`, width)
      await expect(frame).toHaveCSS(`border-${side}-color`, color.join(' '))
    }
  }
  const shorthand = '3px rgb(1, 2, 3)'

  await host.evaluate((element) => element.style.setProperty('--c2-details--border', '3px solid rgb(1, 2, 3)'))
  await expectSides({ top: shorthand, right: shorthand, bottom: shorthand, left: shorthand })

  test.skip(!existsSync(THEME_CSS), 'build @c2n/theme first (npm run build -w packages/tools/theme)')
  await page.addStyleTag({ path: THEME_CSS })
  await expectSides({ top: shorthand, right: shorthand, bottom: shorthand, left: shorthand })

  await host.evaluate((element) => element.style.setProperty('--c2-details--border-left', '5px solid rgb(4, 5, 6)'))
  await expectSides({ top: shorthand, right: shorthand, bottom: shorthand, left: '5px rgb(4, 5, 6)' })

  // Unset, the shorthand follows the theme token.
  await host.evaluate((element) => element.removeAttribute('style'))
  await page.addStyleTag({ content: ':root { --c2-theme--border: 2px solid rgb(7, 8, 9) }' })
  const themed = '2px rgb(7, 8, 9)'
  await expectSides({ top: themed, right: themed, bottom: themed, left: themed })
})
test('content rendered on toggle, after the panel began opening, still slides open without a jump', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Lazy" style="--c2-details--transition-duration: 400ms"></c2-details>')
  const heights = await page.locator('c2-details').evaluate(async (host: HTMLElement & { updateComplete: Promise<boolean> }) => {
    // As an app does: the content is rendered only once the panel says it opened.
    const toggled = new Promise<void>((resolve) =>
      host.addEventListener('toggle', () => {
        const block = document.createElement('div')
        block.style.height = '200px'
        block.textContent = 'Rendered on open'
        host.append(block)
        resolve()
      }),
    )
    const content = host.shadowRoot!.querySelector<HTMLElement>('.c2-details-content')!
    const frame = () => new Promise(requestAnimationFrame)
    // From the closed height, so an open that jumps straight to its end fails the steps below.
    // Skipped content (`content-visibility: hidden` while closed) still reports a layout box, but draws nothing.
    const seen: number[] = [content.checkVisibility() ? content.getBoundingClientRect().height : 0]
    host.shadowRoot!.querySelector<HTMLElement>('summary')!.click()
    await host.updateComplete
    // The slide's clock is held still, so a slow runner (a few frames in the whole duration) sees the same open as a
    // fast one: the content arrives on `toggle` while the slide has all its time left, and the resize observer retargets it.
    for (const animation of content.getAnimations()) animation.pause()
    await toggled
    await frame()
    await frame()
    const [slide] = content.getAnimations()
    slide.pause()
    const duration = Number(slide.effect!.getComputedTiming().duration)
    for (let time = 0; time <= duration; time += duration / 20) {
      slide.currentTime = time
      seen.push(content.getBoundingClientRect().height)
    }
    slide.finish()
    await frame()
    seen.push(content.getBoundingClientRect().height)
    return seen
  })
  const steps = heights.slice(1).map((height, index) => height - heights[index])
  const end = heights.at(-1)!
  expect(end).toBeGreaterThan(200)
  // Without following the content, the slide stops at the panel's padding and the content then lands in one frame: no
  // height between the two is ever drawn. Following it, the panel passes part-way open, and never shrinks on the way.
  expect(heights.some((height) => height > end * 0.25 && height < end * 0.75)).toBe(true)
  expect(Math.min(...steps)).toBeGreaterThanOrEqual(-1)
})

test('closed content stays rendered for find-in-page, and a browser-opened details becomes expanded', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  const host = page.locator('c2-details')
  // Not `display: none`, which would drop the content from find-in-page; it is still hidden from sight.
  await expect(host.locator('.c2-details-content')).not.toHaveCSS('display', 'none')
  await shown(page.getByText('Arrives tomorrow')).toBe(false)

  // Find-in-page opens the native details itself; the component follows and re-emits the toggle.
  const newState = await host.evaluate(
    (element) =>
      new Promise<string>((resolve) => {
        element.addEventListener('toggle', (event) => resolve((event as ToggleEvent).newState), { once: true })
        element.shadowRoot!.querySelector('details')!.open = true
      }),
  )
  expect(newState).toBe('open')
  await expect(host).toHaveJSProperty('expanded', true)
  await expect(page.getByText('Arrives tomorrow')).toBeVisible()
})

const COLLAPSE = `
  <button commandfor="filters" command="--toggle" aria-controls="filters" aria-expanded="false">Filters</button>
  <button commandfor="filters" command="--open">Show</button>
  <button commandfor="filters" command="--close">Hide</button>
  <c2-details id="filters" headless><p>Status: open</p></c2-details>`

test('headless draws the content alone: no summary, no frame, no padding', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details headless expanded label="Ignored"><p>Status: open</p></c2-details>')
  const host = page.locator('c2-details')
  await expect(host.locator('summary')).toBeHidden()
  await expect(page.getByText('Status: open')).toBeVisible()
  const frame = host.locator('.c2-details')
  await expect(frame).toHaveCSS('border-top-width', '0px')
  await expect(frame).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const body = host.locator('.c2-details-body')
  await expect(body).toHaveCSS('padding-top', '0px')
  await expect(body).toHaveCSS('padding-left', '0px')
  // The content padding variables still apply.
  await host.evaluate((element) => element.style.setProperty('--c2-details__content--padding-left', '9px'))
  await expect(body).toHaveCSS('padding-left', '9px')
  await accessible(page)
})

test('headless is opt-in: a default panel keeps its summary and carries no headless attribute', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details label="Shipping"><p>Arrives tomorrow</p></c2-details>')
  await expect(page.locator('summary')).toBeVisible()
  await expect(page.locator('c2-details')).not.toHaveAttribute('headless')
})

test('a headless panel opens and closes from expanded and toggle(), and re-emits toggle', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details headless><p>Status: open</p></c2-details>')
  await shown(page.getByText('Status: open')).toBe(false)
  const states = await page.locator('c2-details').evaluate(async (element: Details) => {
    const seen: string[] = []
    const toggled = () => new Promise((resolve) => element.addEventListener('toggle', resolve, { once: true }))
    element.addEventListener('toggle', (event) => seen.push(event.newState))
    let next = toggled()
    element.expanded = true
    await next
    next = toggled()
    element.toggle()
    await next
    return seen
  })
  expect(states).toEqual(['open', 'closed'])
  await shown(page.getByText('Status: open')).toBe(false)
})

test('invoker buttons toggle, open and close a headless panel from the keyboard and keep aria-expanded in step', async ({ page, renderScenario }) => {
  await renderScenario(COLLAPSE)
  const host = page.locator('c2-details')
  const trigger = page.getByRole('button', { name: 'Filters' })

  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('expanded', true)
  await expect(page.getByText('Status: open')).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.keyboard.press('Space')
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await shown(page.getByText('Status: open')).toBe(false)

  const show = page.getByRole('button', { name: 'Show' })
  await show.press('Enter')
  await expect(host).toHaveJSProperty('expanded', true)
  // A trigger that sent a command before follows a change made by another one.
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await show.press('Enter')
  await expect(host).toHaveJSProperty('expanded', true)

  await page.getByRole('button', { name: 'Hide' }).press('Enter')
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await accessible(page)
})

test('unknown commands, a disabled panel and a retargeted trigger are left alone', async ({ page, renderScenario }) => {
  await renderScenario(`${COLLAPSE}<button commandfor="filters" command="--other">Other</button>`)
  const host = page.locator('c2-details')
  const trigger = page.getByRole('button', { name: 'Filters' })

  await page.getByRole('button', { name: 'Other' }).click()
  await expect(host).toHaveJSProperty('expanded', false)

  await host.evaluate((element: Details) => (element.disabled = true))
  await trigger.click()
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await host.evaluate((element: Details) => (element.disabled = false))
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  // Pointed elsewhere, the button no longer reports this panel.
  await trigger.evaluate((button: HTMLButtonElement) => (button.commandForElement = null))
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
})

test('closed headless content stays findable, and a find-in-page reveal opens the panel and its unused trigger', async ({ page, renderScenario }) => {
  await renderScenario(COLLAPSE)
  const host = page.locator('c2-details')
  await expect(host.locator('.c2-details-content')).not.toHaveCSS('display', 'none')
  await shown(page.getByText('Status: open')).toBe(false)
  // Find-in-page opens the native details itself, as here; the panel follows, and so does a trigger never pressed.
  await host.evaluate((element) => {
    element.shadowRoot!.querySelector('details')!.open = true
  })
  await expect(host).toHaveJSProperty('expanded', true)
  await expect(page.getByText('Status: open')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'true')
  // Open and close buttons carry no expanded state.
  await expect(page.getByRole('button', { name: 'Show' })).not.toHaveAttribute('aria-expanded')
})

test('an app cancels a command from a capturing listener', async ({ page, renderScenario }) => {
  await renderScenario(COLLAPSE)
  await page.evaluate(() => document.addEventListener('command', (event) => event.preventDefault(), { capture: true }))
  await page.getByRole('button', { name: 'Filters' }).click()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  await expect(page.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'false')
})

const BUTTON_MODULE = '/packages/components/button/src/button.ts'
const C2_TRIGGERS = `
  <c2-button commandfor="filters" command="--toggle" aria-controls="filters" aria-expanded="false">Filters</c2-button>
  <c2-button commandfor="filters" command="--close">Hide</c2-button>`

test('a c2-button trigger drives a headless panel, and its inner button reports aria-expanded', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details id="filters" headless><p>Status: open</p></c2-details>')
  // The scenario page loads c2-details only: load c2-button, then put the triggers before the panel.
  await page.locator('main').evaluate(
    async (main, { url, markup }) => {
      await import(url)
      main.insertAdjacentHTML('afterbegin', markup)
      await Promise.all([...main.querySelectorAll('c2-button')].map((button) => (button as Element & { updateComplete: Promise<boolean> }).updateComplete))
    },
    { url: BUTTON_MODULE, markup: C2_TRIGGERS },
  )
  const host = page.locator('c2-details')
  const trigger = page.getByRole('button', { name: 'Filters' })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(host).toHaveJSProperty('expanded', true)
  await expect(page.getByText('Status: open')).toBeVisible()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')

  await page.keyboard.press('Space')
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  await trigger.click()
  await expect(host).toHaveJSProperty('expanded', true)
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')

  // A disabled c2-button sends nothing.
  await page
    .locator('c2-button')
    .first()
    .evaluate((element) => element.setAttribute('disabled', ''))
  await page
    .locator('c2-button')
    .first()
    .evaluate((element) => element.shadowRoot!.querySelector('button')!.click())
  await page
    .locator('c2-button')
    .first()
    .evaluate((element) => (element as HTMLElement).click())
  await expect(host).toHaveJSProperty('expanded', false)
  await accessible(page)
})

test('a running c2-button, the submit and untyped buttons of a form and a non-button send nothing', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details id="filters" headless><p>Status: open</p></c2-details>')
  await page.locator('main').evaluate(
    async (main, { url, markup }) => {
      await import(url)
      main.insertAdjacentHTML('afterbegin', markup)
      await Promise.all([...main.querySelectorAll('c2-button')].map((button) => (button as Element & { updateComplete: Promise<boolean> }).updateComplete))
      main.querySelector('form')!.addEventListener('submit', (event) => event.preventDefault())
    },
    {
      url: BUTTON_MODULE,
      markup: `<c2-button running commandfor="filters" command="--toggle">Busy</c2-button>
        <form><c2-button type="submit" commandfor="filters" command="--toggle" aria-expanded="false">Send</c2-button>
          <button commandfor="filters" command="--toggle" aria-expanded="false">Untyped</button></form>
        <input type="button" commandfor="filters" command="--toggle" aria-expanded="false" value="Input">
        <span commandfor="filters" command="--toggle">Text</span>`,
    },
  )
  for (const selector of ['c2-button[running]', 'c2-button[type="submit"]', 'form > button', 'span[commandfor]'])
    await page.locator(selector).evaluate((element) => ((element.shadowRoot?.querySelector('button') ?? element) as HTMLElement).click())
  await page.locator('c2-button[running]').evaluate((element) => (element as HTMLElement).click())
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  // Opened another way: the submit button controls nothing, so its authored state is left as written.
  await page.locator('c2-details').evaluate((element: Details) => (element.expanded = true))
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', true)
  await expect(page.locator('c2-button[type="submit"]')).toHaveAttribute('aria-expanded', 'false')
  expect(await page.locator('c2-button[type="submit"]').evaluate((el) => (el as HTMLElement).ariaExpanded)).toBe('false')
  await expect(page.locator('form > button')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('input[commandfor]')).toHaveAttribute('aria-expanded', 'false')
})

test('headless content may draw past the panel edge, as a focus ring does', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details headless expanded><a href="#x">Link</a></c2-details>')
  await expect(page.locator('c2-details').locator('.c2-details')).toHaveCSS('overflow', 'visible')
})

test('reduced motion opens and closes a headless panel without animating', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario('<c2-details headless><p>Status: open</p></c2-details>')
  const running = await page.locator('c2-details').evaluate(async (element: Details) => {
    const content = element.shadowRoot!.querySelector('.c2-details-content')!
    element.expanded = true
    await element.updateComplete
    const opening = content.getAnimations().length
    element.expanded = false
    await element.updateComplete
    return opening + content.getAnimations().length
  })
  expect(running).toBe(0)
  await shown(page.getByText('Status: open')).toBe(false)
})

const FAQ = `
  <c2-details name="faq" label="Cancel"><p>Cancel answer</p></c2-details>
  <c2-details name="faq" label="Refunds"><p>Refunds answer</p></c2-details>
  <c2-details name="faq" label="Discount"><p>Discount answer</p></c2-details>`

const expandedStates = (page: Page) => page.locator('c2-details').evaluateAll((panels) => panels.map((panel) => (panel as Details).expanded))

test('opening a named panel closes the other panels of its name, each firing toggle', async ({ page, renderScenario }) => {
  await renderScenario(FAQ)
  await page.addStyleTag({ content: 'c2-details { --c2-details--transition-duration: 0ms }' })
  await page.locator('c2-details').evaluateAll((panels) => {
    const log: Record<string, string[]> = {}
    ;(window as unknown as { toggles: Record<string, string[]> }).toggles = log
    for (const panel of panels) {
      const label = panel.getAttribute('label')!
      log[label] = []
      panel.addEventListener('toggle', (event) => log[label].push((event as ToggleEvent).newState))
    }
  })
  // `toggle` is a queued task, and the browser merges an open and a close made before it runs into one event with no
  // change, which the panel does not re-emit. So each step waits for its events, not only for `expanded`.
  const toggles = () => page.evaluate(() => (window as unknown as { toggles: Record<string, string[]> }).toggles)
  const summaries = page.locator('summary')
  await summaries.nth(0).click()
  await expect.poll(() => expandedStates(page)).toEqual([true, false, false])
  await expect.poll(toggles).toEqual({ Cancel: ['open'], Refunds: [], Discount: [] })
  await summaries.nth(1).click()
  await expect.poll(() => expandedStates(page)).toEqual([false, true, false])
  await expect.poll(toggles).toEqual({ Cancel: ['open', 'closed'], Refunds: ['open'], Discount: [] })
  await shown(page.getByText('Cancel answer')).toBe(false)
  await expect(page.getByText('Refunds answer')).toBeVisible()
  // From the keyboard, and from code: `expanded` and `toggle()`.
  await summaries.nth(2).press('Enter')
  await expect.poll(() => expandedStates(page)).toEqual([false, false, true])
  await expect.poll(toggles).toEqual({ Cancel: ['open', 'closed'], Refunds: ['open', 'closed'], Discount: ['open'] })
  await page
    .locator('c2-details')
    .nth(0)
    .evaluate((panel: Details) => (panel.expanded = true))
  await expect.poll(() => expandedStates(page)).toEqual([true, false, false])
  await expect.poll(toggles).toEqual({ Cancel: ['open', 'closed', 'open'], Refunds: ['open', 'closed'], Discount: ['open', 'closed'] })
  await page
    .locator('c2-details')
    .nth(1)
    .evaluate((panel: Details) => panel.toggle(true))
  await expect.poll(() => expandedStates(page)).toEqual([false, true, false])
  // Each closed panel re-emits its own toggle.
  await expect.poll(toggles).toEqual({ Cancel: ['open', 'closed', 'open', 'closed'], Refunds: ['open', 'closed', 'open'], Discount: ['open', 'closed'] })
  // Closing the open one leaves every panel closed, as native `<details name>` allows.
  await summaries.nth(1).click()
  await expect.poll(() => expandedStates(page)).toEqual([false, false, false])
  await accessible(page)
})

test('panels with another name or no name are independent', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-details name="faq" label="A"><p>A</p></c2-details>
    <c2-details name="plans" label="B"><p>B</p></c2-details>
    <c2-details label="C"><p>C</p></c2-details>
    <c2-details label="D"><p>D</p></c2-details>`)
  for (const index of [0, 1, 2, 3]) await page.locator('summary').nth(index).click()
  await expect.poll(() => expandedStates(page)).toEqual([true, true, true, true])
  // Renamed while open into a group that has an open panel: it joins as the open one.
  await page
    .locator('c2-details')
    .nth(1)
    .evaluate((panel: Details) => (panel.name = 'faq'))
  await expect.poll(() => expandedStates(page)).toEqual([false, true, true, true])
})

test('a panel that joins its group open is the open one, and of two opened in one task the last stays open', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-details name="faq" label="A" expanded><p>First answer</p></c2-details>
    <c2-details name="faq" label="B" expanded><p>Second answer</p></c2-details>
    <c2-details name="other" label="C" expanded><p>Third answer</p></c2-details>`)
  // Rendered open in tree order: each one opens after the one before it.
  await expect.poll(() => expandedStates(page)).toEqual([false, true, true])
  await shown(page.getByText('First answer')).toBe(false)
  // Inserted open, or opened in the task that inserts it: it stays open and closes the others.
  await page.locator('main').evaluate(async (main) => {
    const panel = document.createElement('c2-details')
    panel.name = 'faq'
    panel.label = 'D'
    main.append(panel)
    panel.expanded = true
    await panel.updateComplete
  })
  await expect.poll(() => expandedStates(page)).toEqual([false, false, true, true])
  // Moved open into the group: it is the open one.
  await page.locator('main').evaluate((main) => {
    const [, second] = main.querySelectorAll('c2-details')
    second.remove()
    second.expanded = true
    main.append(second)
  })
  await expect.poll(() => expandedStates(page)).toEqual([false, true, false, true])
  // Two panels opened in one task: the last one, as native `open` assignments do, and the other draws no close.
  const animations = await page.locator('main').evaluate(async (main) => {
    const [first, , third] = main.querySelectorAll('c2-details')
    first.expanded = true
    third.expanded = true
    await Promise.all([first.updateComplete, third.updateComplete])
    return first.shadowRoot!.querySelector('.c2-details-content')!.getAnimations().length
  })
  expect(animations).toBe(0)
  await expect.poll(() => expandedStates(page)).toEqual([false, true, true, false])
})

test('of two panels opened with toggle() in one task, the last stays open once the browser reports both', async ({ page, renderScenario }) => {
  await renderScenario(FAQ)
  const toggles = await page.locator('main').evaluate(async (main) => {
    const [first, second] = main.querySelectorAll('c2-details')
    const seen: string[] = []
    for (const panel of [first, second]) panel.addEventListener('toggle', (event) => seen.push(`${panel.label}:${event.newState}`))
    second.toggle(true)
    first.toggle(true)
    // Past the browser's queued toggle tasks.
    await new Promise((resolve) => setTimeout(resolve, 50))
    await Promise.all([first.updateComplete, second.updateComplete])
    return seen
  })
  await expect.poll(() => expandedStates(page)).toEqual([true, false, false])
  expect(toggles).toEqual(['Cancel:open'])
  await shown(page.getByText('Refunds answer')).toBe(false)
})

test('a name groups panels within one document or shadow root, not across them', async ({ page, renderScenario }) => {
  await renderScenario('<c2-details name="faq" label="Outside"><p>Outside</p></c2-details><div id="shadow-host"></div>')
  const states = await page.evaluate(async () => {
    const root = document.querySelector('#shadow-host')!.attachShadow({ mode: 'open' })
    const make = (label: string) => {
      const panel = document.createElement('c2-details')
      panel.name = 'faq'
      panel.label = label
      root.append(panel)
      return panel
    }
    const outside = document.querySelector('c2-details')!
    const inside = [make('Inside 1'), make('Inside 2')]
    const read = async () => {
      await Promise.all([outside, ...inside].map((panel) => panel.updateComplete))
      return [outside, ...inside].map((panel) => panel.expanded)
    }
    await read()
    outside.expanded = true
    await read()
    inside[0].expanded = true
    const first = await read()
    inside[1].toggle()
    const second = await read()
    outside.expanded = false
    await read()
    outside.expanded = true
    const third = await read()
    return [first, second, third]
  })
  expect(states).toEqual([
    [true, true, false],
    [true, false, true],
    [true, false, true],
  ])
})

test('a find-in-page reveal of a closed named panel closes the open one', async ({ page, renderScenario }) => {
  await renderScenario(FAQ)
  await page.locator('summary').nth(0).click()
  await expect.poll(() => expandedStates(page)).toEqual([true, false, false])
  // Find-in-page opens the native details itself, as here.
  await page
    .locator('c2-details')
    .nth(2)
    .evaluate((element) => {
      element.shadowRoot!.querySelector('details')!.open = true
    })
  await expect.poll(() => expandedStates(page)).toEqual([false, false, true])
  await shown(page.getByText('Cancel answer')).toBe(false)
  await expect(page.getByText('Discount answer')).toBeVisible()
})

test('headless named panels opened by invoker commands close each other and keep their triggers in step', async ({ page, renderScenario }) => {
  await renderScenario(`
    <button commandfor="shipping" command="--toggle" aria-controls="shipping" aria-expanded="false">Shipping</button>
    <button commandfor="returns" command="--toggle" aria-controls="returns" aria-expanded="false">Returns</button>
    <c2-details id="shipping" name="policy" headless><p>Ships in two days</p></c2-details>
    <c2-details id="returns" name="policy" headless><p>Returns within 30 days</p></c2-details>`)
  const shipping = page.getByRole('button', { name: 'Shipping' })
  const returns = page.getByRole('button', { name: 'Returns' })
  await shipping.click()
  await expect.poll(() => expandedStates(page)).toEqual([true, false])
  await expect(shipping).toHaveAttribute('aria-expanded', 'true')
  await returns.press('Enter')
  await expect.poll(() => expandedStates(page)).toEqual([false, true])
  await expect(shipping).toHaveAttribute('aria-expanded', 'false')
  await expect(returns).toHaveAttribute('aria-expanded', 'true')
  await shown(page.getByText('Ships in two days')).toBe(false)
  await accessible(page)
})

test('panels of a c2-accordion follow the accordion, not their name', async ({ page }) => {
  // The accordion's own scenario page, so the panels and the accordion share one copy of the details context.
  await page.goto('/packages/components/accordion/test/scenarios.html')
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.modulesReady === 'true')).toBe(true)
  const states = await page.locator('main').evaluate(async (main) => {
    main.innerHTML = `
      <c2-accordion multiple>
        <c2-details name="faq" label="A"><p>A</p></c2-details>
        <c2-details name="faq" label="B"><p>B</p></c2-details>
      </c2-accordion>
      <c2-accordion>
        <c2-details name="faq" label="C"><p>C</p></c2-details>
        <c2-details name="faq" label="D"><p>D</p></c2-details>
      </c2-accordion>
      <c2-details name="faq" label="E"><p>E</p></c2-details>`
    await Promise.all(['c2-accordion', 'c2-details'].map((tag) => customElements.whenDefined(tag)))
    const panels = [...main.querySelectorAll('c2-details')]
    const read = async () => {
      await new Promise(requestAnimationFrame)
      await Promise.all(panels.map((panel) => panel.updateComplete))
      return panels.map((panel) => panel.expanded)
    }
    await read()
    const seen: boolean[][] = []
    for (const index of [0, 1, 2, 3, 4]) {
      panels[index].expanded = true
      seen.push(await read())
    }
    return seen
  })
  expect(states).toEqual([
    // `multiple` keeps both of its panels open whatever their name.
    [true, false, false, false, false],
    [true, true, false, false, false],
    // The exclusive accordion still closes its own sibling, and nothing outside it.
    [true, true, true, false, false],
    [true, true, false, true, false],
    // A standalone panel of the same name leaves the accordions' panels alone.
    [true, true, false, true, true],
  ])
})
