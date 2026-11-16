import type { Page } from '@playwright/test'
import { test, expect, watch, accessible, props } from '../../../../tests/component-fixture'

const bar = (page: Page) => page.locator('c2-action-bar')
// The surface inside the shadow root: the host is a zero-height strip, so visibility is read off the bar itself.
const surface = (page: Page) => bar(page).locator('.bar')
const clearButton = (page: Page) => page.getByRole('button', { name: 'Clear selection' })

const actions = '<c2-button id="archive">Archive</c2-button><c2-button id="delete">Delete</c2-button>'
// An app that owns the selection: clearing it sets the count back to 0.
// `clear` has no `onclear` handler attribute, so the listener is added from script, as an app would.
const ownSelection = (page: Page) =>
  bar(page).evaluate((element) => element.addEventListener('clear', () => ((element as HTMLElement & { count: number }).count = 0)))
const owned = (count: number) =>
  `<button id="before">Before</button><c2-action-bar count="${count}">${actions}</c2-action-bar><button id="after">After</button>`

test('stays hidden and out of the Tab order while nothing is selected', async ({ page, renderScenario, tab }) => {
  await renderScenario(owned(0))
  await expect(surface(page)).toBeHidden()
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#after')).toBeFocused()
})

test('shows the count, the actions and a clear button once something is selected', async ({ page, renderScenario, tab }) => {
  await renderScenario(owned(0))
  await props(bar(page), { count: 3 })
  await expect(surface(page)).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('3 selected')
  await expect(bar(page)).toHaveHostAria('role', 'group')
  await expect(bar(page)).toHaveHostAria('aria-label', 'Selection actions')

  // The actions, then the clear button, in document order.
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('#archive')).toBeFocused()
  await tab()
  await expect(page.locator('#delete')).toBeFocused()
  await tab()
  await expect(clearButton(page)).toBeFocused()
  await accessible(page)
})

test('the clear button and Escape fire clear, and the app hides the bar by emptying its selection', async ({ page, renderScenario }) => {
  await renderScenario(owned(2))
  await ownSelection(page)
  await watch(bar(page), 'clear')
  await clearButton(page).click()
  await expect(bar(page)).toHaveAttribute('data-events', '[null]')
  await expect(surface(page)).toBeHidden()

  await props(bar(page), { count: 1 })
  await expect(surface(page)).toBeVisible()
  await page.locator('#archive').focus()
  await page.keyboard.press('Escape')
  await expect(bar(page)).toHaveAttribute('data-events', '[null,null]')
  await expect(surface(page)).toBeHidden()
})

test('the count line keeps the last count while the bar hides, rather than reading "0 selected"', async ({ page, renderScenario }) => {
  await renderScenario(owned(4))
  await props(bar(page), { count: 0 })
  await expect(bar(page).locator('.bar > span.label')).toHaveText('4 selected')
  // And the live region says nothing rather than "0 selected".
  await expect(page.getByRole('status')).toHaveText('')
})

test('Escape in a select inside the bar closes the select and keeps the selection', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-action-bar count="2"><c2-select placeholder="Move to" aria-label="Move to"><c2-list-item value="a">Archive</c2-list-item><c2-list-item value="b">Backlog</c2-list-item></c2-select></c2-action-bar>`,
  )
  await watch(bar(page), 'clear')
  await page.getByRole('button', { name: 'Move to' }).press('ArrowDown')
  await expect(page.locator('c2-select')).toHaveJSProperty('open', true)
  await page.keyboard.press('Escape')
  await expect(page.locator('c2-select')).toHaveJSProperty('open', false)
  await expect(bar(page)).toHaveAttribute('data-events', '[]')
  await expect(surface(page)).toBeVisible()
})

test('the label slot replaces the count text', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-action-bar count="3"><span slot="label">3 orders selected</span>${actions}</c2-action-bar>`)
  // The status span's own text is the slot's fallback; what renders is the slotted label.
  await expect(page.getByText('3 orders selected')).toBeVisible()
  await expect(bar(page).locator('.bar > span.label').getByText('3 selected', { exact: true })).toBeHidden()
  // The announcement keeps the built-in wording.
  await expect(page.getByRole('status')).toHaveText('3 selected')
})

test('sticks to the bottom of its scroll container, over the content', async ({ page, renderScenario }) => {
  await renderScenario(`<div class="scroller"><div class="rows"></div><c2-action-bar count="1">${actions}</c2-action-bar></div>`)
  const scroller = await page.locator('.scroller').boundingBox()
  const box = await surface(page).boundingBox()
  expect(scroller && box).toBeTruthy()
  // 16px above the container's bottom edge although the bar comes after 900px of rows.
  expect(Math.round(scroller!.y + scroller!.height - (box!.y + box!.height))).toBe(17)
  expect(await bar(page).evaluate((element) => element.getBoundingClientRect().height)).toBe(0)
})

test('gives no scrollbar to a container its content just fills, open or closed', async ({ page, renderScenario }) => {
  // The content ends at the container's bottom edge, where the bar's zero-height host then sits (a list that fills
  // its pane): anything of the bar reaching below the host would scroll the container.
  await renderScenario(`<div class="scroller"><div style="height: 100%"></div><c2-action-bar count="0">${actions}</c2-action-bar></div>`)
  const overflow = () => page.locator('.scroller').evaluate((element) => element.scrollHeight - element.clientHeight)
  // Neither the hidden live region nor the closed bar reaches past the end of the container.
  expect(await overflow()).toBe(0)
  await props(bar(page), { count: 2 })
  await expect(surface(page)).toBeVisible()
  await expect.poll(() => surface(page).evaluate((element) => element.getAnimations().length)).toBe(0)
  expect(await overflow()).toBe(0)
  await props(bar(page), { count: 0 })
  await expect(surface(page)).toBeHidden()
  await expect.poll(() => surface(page).evaluate((element) => element.getAnimations().length)).toBe(0)
  expect(await overflow()).toBe(0)
})

/**
 * Counts the slides the bar starts from now on. Reading `getAnimations()` right after an update raced the 150ms slide
 * on a loaded machine (WebKit had finished it already); counting the `animate()` calls does not depend on timing.
 */
const countSlides = (page: Page) =>
  surface(page).evaluate((element) => {
    const counted = element as HTMLElement & { slides: number }
    counted.slides = 0
    const animate = element.animate.bind(element)
    element.animate = (...args: Parameters<Element['animate']>) => {
      counted.slides++
      return animate(...args)
    }
  })
const slides = (page: Page) => surface(page).evaluate((element) => (element as HTMLElement & { slides: number }).slides)

test('slides as it shows and hides, but not when it first renders open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-action-bar count="1">${actions}</c2-action-bar>`)
  expect(await surface(page).evaluate((element) => element.getAnimations().filter((a) => !('transitionProperty' in a)).length)).toBe(0)
  await countSlides(page)
  await props(bar(page), { count: 0 })
  expect(await slides(page)).toBe(1)
  await expect(surface(page)).toBeHidden()
  await props(bar(page), { count: 3 })
  expect(await slides(page)).toBe(2)
})

test('the built-in text follows the nearest lang, with plurals', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-action-bar count="1">${actions}</c2-action-bar></div>`)
  await expect(page.getByRole('status')).toHaveText('1 sélectionné')
  await props(bar(page), { count: 5 })
  await expect(page.getByRole('status')).toHaveText('5 sélectionnés')
  await expect(page.getByRole('button', { name: 'Effacer la sélection' })).toBeVisible()
  await expect(bar(page)).toHaveHostAria('aria-label', 'Actions sur la sélection')
})

test('the count is announced from a live region that is not hidden with the bar', async ({ page, renderScenario }) => {
  await renderScenario(owned(0))
  const status = page.getByRole('status')
  await expect(status).toHaveText('')
  // Present in the accessibility tree before the first selection, so its first text is announced.
  expect(await status.evaluate((element) => getComputedStyle(element).visibility)).toBe('visible')
  await props(bar(page), { count: 2 })
  await expect(status).toHaveText('2 selected')
})

test('with position: fixed the bar centres in the viewport', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-action-bar count="1" style="--c2-action-bar--position: fixed">${actions}</c2-action-bar>`)
  const viewport = page.viewportSize()!
  const box = (await surface(page).boundingBox())!
  expect(box.width).toBeGreaterThan(150)
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(2)
  expect(Math.round(viewport.height - (box.y + box.height))).toBe(16)
})

const narrowBar = (actions: string) =>
  `<div style="position: relative; height: 200px"><c2-action-bar count="12" style="--c2-action-bar--position: absolute"><span slot="label">12 orders selected</span>${actions}</c2-action-bar></div>`
const top = (box: { y: number } | null) => Math.round(box!.y)

test('on a wide screen the count, the actions and the clear button share one row', async ({ page, renderScenario }) => {
  await renderScenario(narrowBar('<c2-button>Mark paid</c2-button><c2-button>Export CSV</c2-button>'))
  const label = await bar(page).locator('.bar > span.label').boundingBox()
  const button = await page.locator('c2-button').first().boundingBox()
  expect(Math.abs(label!.y + label!.height / 2 - (button!.y + button!.height / 2))).toBeLessThan(2)
})

test('on a phone the actions get a full-width row of their own, under the count and the clear button', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 420, height: 640 })
  await renderScenario(narrowBar('<c2-button>Mark paid</c2-button><c2-button>Export CSV</c2-button><c2-button>Refund</c2-button>'))
  const label = await bar(page).locator('.bar > span.label').boundingBox()
  const clear = await clearButton(page).boundingBox()
  const tops = await page.locator('c2-button').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  // One line of actions, below the row that holds the count and the clear button.
  expect(new Set(tops).size).toBe(1)
  expect(tops[0]).toBeGreaterThan(top(label) + label!.height - 1)
  expect(Math.abs(top(clear) + clear!.height / 2 - (top(label) + label!.height / 2))).toBeLessThan(2)
  expect(Math.round(clear!.width)).toBe(28)
  // All three show in full.
  const actions = bar(page).locator('.actions')
  expect(await actions.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expect(actions).not.toHaveClass(/fade-/)
})

test('actions that still do not fit scroll sideways, fading the edge that has more past it', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await renderScenario(narrowBar(['Mark paid', 'Export CSV', 'Refund', 'Print labels', 'Archive'].map((name) => `<c2-button>${name}</c2-button>`).join('')))
  const tops = await page.locator('c2-button').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
  const actions = bar(page).locator('.actions')
  await expect(actions).toHaveClass(/fade-end/)
  await expect(actions).not.toHaveClass(/fade-start/)
  await actions.evaluate((element) => element.scrollTo({ left: element.scrollWidth }))
  await expect(actions).toHaveClass(/fade-start/)
  await expect(actions).not.toHaveClass(/fade-end/)
})

test('actions that fit are not faded', async ({ page, renderScenario }) => {
  await renderScenario(owned(2))
  await expect(bar(page).locator('.actions')).not.toHaveClass(/fade-/)
})

test.describe('open, as a floating toolbar', () => {
  const toolbar = `<button id="before">Before</button><c2-action-bar open>${actions}</c2-action-bar><button id="after">After</button>`

  test('shows the actions alone, with no count, divider or clear button, and needs no selection', async ({ page, renderScenario, tab }) => {
    await renderScenario(toolbar)
    await expect(surface(page)).toBeVisible()
    await expect(bar(page)).toHaveState('open')
    await expect(bar(page).locator('.bar > .label, .bar > .divider, .bar > .clear')).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveText('')
    await expect(bar(page)).toHaveHostAria('role', 'group')
    await expect(bar(page)).toHaveHostAria('aria-label', 'Actions')
    await page.locator('#before').focus()
    await tab()
    await expect(page.locator('#archive')).toBeFocused()
    await tab()
    await expect(page.locator('#delete')).toBeFocused()
    await tab()
    await expect(page.locator('#after')).toBeFocused()
    await accessible(page)
  })

  test('pads the actions evenly', async ({ page, renderScenario }) => {
    await renderScenario(toolbar)
    const box = (await surface(page).boundingBox())!
    const first = (await page.locator('#archive').boundingBox())!
    const last = (await page.locator('#delete').boundingBox())!
    // 6px of padding inside the 1px border, at either end.
    expect(Math.round(first.x - box.x)).toBe(7)
    expect(Math.round(box.x + box.width - (last.x + last.width))).toBe(7)
  })

  test('switches to the selection layout while something is selected, and back', async ({ page, renderScenario }) => {
    await renderScenario(toolbar)
    await ownSelection(page)
    await props(bar(page), { count: 2 })
    await expect(page.getByRole('status')).toHaveText('2 selected')
    await expect(bar(page)).toHaveHostAria('aria-label', 'Selection actions')
    await expect(clearButton(page)).toBeVisible()
    await page.locator('#archive').focus()
    await page.keyboard.press('Escape')
    // The app empties the selection; the toolbar stays.
    await expect(bar(page).locator('.bar > .clear')).toHaveCount(0)
    await expect(surface(page)).toBeVisible()
    await expect(bar(page)).toHaveHostAria('aria-label', 'Actions')
  })

  test('Escape does nothing while nothing is selected', async ({ page, renderScenario }) => {
    await renderScenario(toolbar)
    await watch(bar(page), 'clear')
    await page.locator('#archive').focus()
    await page.keyboard.press('Escape')
    await expect(bar(page)).toHaveAttribute('data-events', '[]')
    await expect(surface(page)).toBeVisible()
  })

  test('closing slides it away, and a toolbar that first renders open does not slide in', async ({ page, renderScenario }) => {
    await renderScenario(toolbar)
    expect(await surface(page).evaluate((element) => element.getAnimations().filter((a) => !('transitionProperty' in a)).length)).toBe(0)
    await countSlides(page)
    await props(bar(page), { open: false })
    await expect(surface(page)).toBeHidden()
    expect(await slides(page)).toBe(1)
  })

  test('closing keeps the toolbar layout while it fades out', async ({ page, renderScenario }) => {
    await renderScenario(toolbar)
    await props(bar(page), { open: false })
    await expect(bar(page).locator('.bar > .label, .bar > .clear')).toHaveCount(0)
    await expect(surface(page)).toBeHidden()
  })

  test('emptying the selection from the clear button leaves focus on the first action', async ({ page, renderScenario }) => {
    await renderScenario(toolbar)
    await ownSelection(page)
    await props(bar(page), { count: 2 })
    await clearButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(bar(page).locator('.bar > .clear')).toHaveCount(0)
    await expect(page.locator('#archive')).toBeFocused()
  })

  test('a c2-button-group toolbar inside gives one Tab stop and arrow keys', async ({ page, renderScenario, tab }) => {
    await renderScenario(
      `<button id="before">Before</button><c2-action-bar open><c2-button-group toolbar aria-label="Formatting"><c2-button id="bold">Bold</c2-button><c2-button id="italic">Italic</c2-button></c2-button-group></c2-action-bar><button id="after">After</button>`,
    )
    await page.locator('#before').focus()
    await tab()
    await expect(page.locator('#bold')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('#italic')).toBeFocused()
    await tab()
    await expect(page.locator('#after')).toBeFocused()
  })

  test('on a phone it keeps one row and scrolls its actions sideways', async ({ page, renderScenario }) => {
    await page.setViewportSize({ width: 360, height: 640 })
    const buttons = ['Bold', 'Italic', 'Underline', 'Strike', 'Link', 'Quote', 'Code'].map((name) => `<c2-button>${name}</c2-button>`).join('')
    await renderScenario(
      `<div style="position: relative; height: 200px"><c2-action-bar open style="--c2-action-bar--position: absolute">${buttons}</c2-action-bar></div>`,
    )
    const tops = await page.locator('c2-button').evaluateAll((elements) => elements.map((element) => Math.round(element.getBoundingClientRect().top)))
    expect(new Set(tops).size).toBe(1)
    await expect(bar(page).locator('.actions')).toHaveClass(/fade-end/)
  })

  test('the toolbar name follows the nearest lang', async ({ page, renderScenario }) => {
    await renderScenario(`<div lang="fr"><c2-action-bar open>${actions}</c2-action-bar></div>`)
    await expect(bar(page)).toHaveHostAria('aria-label', 'Actions')
    await props(bar(page), { count: 1 })
    await expect(bar(page)).toHaveHostAria('aria-label', 'Actions sur la sélection')
  })
})

test.describe('hide-on-scroll', () => {
  const scroller = (attributes: string) =>
    `<div class="scroller"><div class="rows"></div><c2-action-bar ${attributes}>${actions}</c2-action-bar></div><button id="after">After</button>`
  const scrollBy = (page: Page, top: number) => page.locator('.scroller').evaluate((element, top) => element.scrollBy({ top }), top)
  /**
   * Keeps every scroll "under way" by stopping `scrollend` before it reaches the bar's listener on the document, so a
   * test can look at the hidden bar without racing the end of the scroll. Skips in an engine without `scrollend`, where
   * a timer ends the scroll (covered by its own test).
   */
  const holdScroll = async (page: Page) => {
    const native = await page.evaluate(() => {
      const held = window as Window & { held?: boolean }
      held.held = true
      window.addEventListener('scrollend', (event) => held.held && event.stopImmediatePropagation(), { capture: true })
      return 'onscrollend' in window
    })
    test.skip(!native, 'no scrollend in this engine')
  }
  /** Lets the held scroll end, as the browser would. */
  const endScroll = (page: Page) =>
    page.locator('.scroller').evaluate((element) => {
      ;(window as Window & { held?: boolean }).held = false
      element.dispatchEvent(new Event('scrollend'))
    })

  test('hides while its scroll container scrolls and comes back when the scroll ends', async ({ page, renderScenario }) => {
    await renderScenario(scroller('open hide-on-scroll'))
    await expect(surface(page)).toBeVisible()
    await countSlides(page)
    await page.locator('.scroller').hover()
    await page.mouse.wheel(0, 200)
    await page.waitForFunction(() => document.querySelector('.scroller')!.scrollTop > 0)
    // It slid away, and as the wheel scroll ended on its own, back: two slides. An engine that delivers no
    // `scrollend` for the wheel scroll (Firefox) brings it back after the bar's 3s fallback.
    await expect.poll(() => slides(page), { timeout: 10_000 }).toBe(2)
    await expect(surface(page)).toBeVisible()
    await expect(bar(page)).toHaveState('open')
  })

  test('a scroll hides it, slid and faded away, until the scroll ends', async ({ page, renderScenario }) => {
    await renderScenario(scroller('open hide-on-scroll'))
    await holdScroll(page)
    await countSlides(page)
    await scrollBy(page, 200)
    await expect(bar(page)).not.toHaveState('open')
    await expect(surface(page)).toBeHidden()
    expect(await slides(page)).toBe(1)
    await endScroll(page)
    await expect(bar(page)).toHaveState('open')
    expect(await slides(page)).toBe(2)
  })

  test('a selection bar hides as well, keeping its count', async ({ page, renderScenario }) => {
    await renderScenario(scroller('count="3" hide-on-scroll'))
    await holdScroll(page)
    await scrollBy(page, 200)
    await expect(bar(page)).not.toHaveState('open')
    await expect(bar(page).locator('.bar > span.label')).toHaveText('3 selected')
    await expect(page.getByRole('status')).toHaveText('3 selected')
  })

  test('stays while focus is in the bar', async ({ page, renderScenario }) => {
    await renderScenario(scroller('open hide-on-scroll'))
    await holdScroll(page)
    await page.locator('#archive').focus()
    await scrollBy(page, 200)
    await page.waitForFunction(() => document.querySelector('.scroller')!.scrollTop > 0)
    await expect(bar(page)).toHaveState('open')
  })

  test('focus coming into a hiding bar brings it back', async ({ page, renderScenario }) => {
    await renderScenario(scroller('open hide-on-scroll'))
    await holdScroll(page)
    await countSlides(page)
    // Focus lands on an action as the bar starts to hide, while it is still fading out and so still focusable.
    await page.locator('.scroller').evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          element.addEventListener('scroll', () => queueMicrotask(() => (document.querySelector('#archive') as HTMLElement).focus()), { once: true })
          element.addEventListener('scroll', () => setTimeout(resolve), { once: true })
          element.scrollBy({ top: 200 })
        }),
    )
    await expect(page.locator('#archive')).toBeFocused()
    await expect(bar(page)).toHaveState('open')
    expect(await slides(page)).toBe(2)
  })

  test('hears a scroll container in the shadow root of a component it is slotted into', async ({ page, renderScenario }) => {
    // Defined before the bar connects, as a real component's module would be.
    await page.addInitScript(() => {
      customElements.define(
        'test-pane',
        class extends HTMLElement {
          constructor() {
            super()
            const root = this.attachShadow({ mode: 'open' })
            const body = document.createElement('div')
            body.className = 'body'
            body.style.cssText = 'height: 200px; overflow: auto'
            body.append(document.createElement('slot'))
            root.append(body)
          }
        },
      )
    })
    await renderScenario(`<test-pane><div style="height: 900px"></div><c2-action-bar open hide-on-scroll>${actions}</c2-action-bar></test-pane>`)
    await countSlides(page)
    await page.locator('test-pane').evaluate((element) => element.shadowRoot!.querySelector('.body')!.scrollBy({ top: 200 }))
    // The scroll, and its end, are heard in the pane's shadow root, where the window cannot hold the end back: it hid
    // and came back.
    await expect.poll(() => slides(page)).toBe(2)
  })

  test('ignores scrolls of an element the bar is not in', async ({ page, renderScenario }) => {
    await renderScenario(`<div class="other scroller"><div class="rows"></div></div><c2-action-bar open hide-on-scroll>${actions}</c2-action-bar>`)
    await holdScroll(page)
    await page.locator('.other').evaluate((element) => element.scrollBy({ top: 200 }))
    await page.waitForFunction(() => document.querySelector('.other')!.scrollTop > 0)
    await expect(bar(page)).toHaveState('open')
  })

  test('without the attribute, scrolling leaves the bar alone', async ({ page, renderScenario }) => {
    await renderScenario(scroller('open'))
    await holdScroll(page)
    await scrollBy(page, 200)
    await page.waitForFunction(() => document.querySelector('.scroller')!.scrollTop > 0)
    await expect(bar(page)).toHaveState('open')
  })

  test('removing the attribute shows a bar a scroll had hidden, and stops listening', async ({ page, renderScenario }) => {
    await renderScenario(scroller('open hide-on-scroll'))
    await holdScroll(page)
    await scrollBy(page, 200)
    await expect(bar(page)).not.toHaveState('open')
    await props(bar(page), { hideOnScroll: false })
    await expect(bar(page)).toHaveState('open')
    await scrollBy(page, 200)
    await page.waitForFunction(() => document.querySelector('.scroller')!.scrollTop > 200)
    await expect(bar(page)).toHaveState('open')
  })

  test('with reduced motion it fades without sliding', async ({ page, renderScenario }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await renderScenario(scroller('open hide-on-scroll'))
    await holdScroll(page)
    await countSlides(page)
    await scrollBy(page, 200)
    await expect(surface(page)).toBeHidden()
    expect(await slides(page)).toBe(0)
  })

  test('without scrollend, it comes back once the scroll has been still for a moment', async ({ page, renderScenario }) => {
    // An engine without `scrollend`: the bar falls back to a timer.
    await page.addInitScript(() => {
      delete (Window.prototype as { onscrollend?: unknown }).onscrollend
      delete (window as { onscrollend?: unknown }).onscrollend
    })
    await renderScenario(scroller('open hide-on-scroll'))
    expect(await page.evaluate(() => 'onscrollend' in window)).toBe(false)
    await countSlides(page)
    await scrollBy(page, 200)
    // It slid away and back: counting the slides does not race the 150ms the bar stays hidden.
    await expect.poll(() => slides(page)).toBe(2)
    await expect(bar(page)).toHaveState('open')
  })
})
