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

const supportsCommands = (page: Page) => page.evaluate(() => 'commandForElement' in HTMLButtonElement.prototype)

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
  test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
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
  test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
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
  test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
  await page.evaluate(() => document.addEventListener('command', (event) => event.preventDefault(), { capture: true }))
  await page.getByRole('button', { name: 'Filters' }).click()
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
  await expect(page.getByRole('button', { name: 'Filters' })).toHaveAttribute('aria-expanded', 'false')
})

test('without invoker commands, the panel runs its triggers on click', async ({ page, renderScenario }) => {
  // Before the component loads: hide the feature, and swallow the events the browser still sends.
  await page.addInitScript(() => {
    delete (HTMLButtonElement.prototype as Partial<HTMLButtonElement>).commandForElement
    window.addEventListener('command', (event) => event.stopImmediatePropagation(), { capture: true })
  })
  await renderScenario(`${COLLAPSE}<button commandfor="filters" command="--toggle" disabled>Off</button>`)
  const host = page.locator('c2-details')
  const trigger = page.getByRole('button', { name: 'Filters' })
  await trigger.press('Enter')
  await expect(host).toHaveJSProperty('expanded', true)
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Hide' }).click()
  await expect(host).toHaveJSProperty('expanded', false)
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: 'Show' }).click()
  await expect(host).toHaveJSProperty('expanded', true)
})

const BUTTON_MODULE = '/packages/components/button/src/button.ts'
const C2_TRIGGERS = `
  <c2-button commandfor="filters" command="--toggle" aria-controls="filters" aria-expanded="false">Filters</c2-button>
  <c2-button commandfor="filters" command="--close">Hide</c2-button>`

for (const mode of ['invoker commands', 'the click fallback']) {
  test(`a c2-button trigger drives a headless panel through ${mode}, and its inner button reports aria-expanded`, async ({ page, renderScenario }) => {
    if (mode === 'the click fallback')
      await page.addInitScript(() => {
        delete (HTMLButtonElement.prototype as Partial<HTMLButtonElement>).commandForElement
        window.addEventListener('command', (event) => event.stopImmediatePropagation(), { capture: true })
      })
    await renderScenario('<c2-details id="filters" headless><p>Status: open</p></c2-details>')
    if (mode === 'invoker commands') test.skip(!(await supportsCommands(page)), 'invoker commands (commandfor) are not supported by this browser')
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
}

test('without invoker commands, a running c2-button, a submit c2-button of a form and a non-button send nothing', async ({ page, renderScenario }) => {
  await page.addInitScript(() => {
    delete (HTMLButtonElement.prototype as Partial<HTMLButtonElement>).commandForElement
    window.addEventListener('command', (event) => event.stopImmediatePropagation(), { capture: true })
  })
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
        <form><c2-button type="submit" commandfor="filters" command="--toggle">Send</c2-button></form>
        <span commandfor="filters" command="--toggle">Text</span>`,
    },
  )
  for (const selector of ['c2-button[running]', 'c2-button[type="submit"]', 'span[commandfor]'])
    await page.locator(selector).evaluate((element) => ((element.shadowRoot?.querySelector('button') ?? element) as HTMLElement).click())
  await page.locator('c2-button[running]').evaluate((element) => (element as HTMLElement).click())
  await expect(page.locator('c2-details')).toHaveJSProperty('expanded', false)
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
