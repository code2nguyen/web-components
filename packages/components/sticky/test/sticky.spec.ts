import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { test, expect } from './fixture'

const hasState = (page: Page, state: string) => page.locator('c2-sticky').evaluate((el, name) => el.matches(`:state(${name})`), state)

async function wheel(page: Page, deltaY: number, target = '.scroller') {
  await page.locator(target).first().hover()
  await page.mouse.wheel(0, deltaY)
}

/**
 * Moves the scroll box in one step. Engines handle a wheel differently (WebKit animates it over several frames, Firefox
 * caps its distance), so tests that depend on where one scroll lands set the position directly.
 */
async function scrollTo(page: Page, top: number | 'end') {
  await page.locator('.scroller').evaluate((scroller, to) => {
    scroller.scrollTo({ top: to === 'end' ? scroller.scrollHeight : to, behavior: 'instant' })
  }, top)
}

test('is not stuck while it rests in the flow, and sticks once content scrolls beneath it', async ({ page, scenario }) => {
  await scenario()
  const sticky = page.locator('c2-sticky')
  await expect(sticky).toHaveCSS('position', 'sticky')
  expect(await hasState(page, 'stuck')).toBe(false)

  await wheel(page, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'true')
  await expect(page.locator('[part="surface"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  expect(await sticky.evaluate((el: HTMLElementTagNameMap['c2-sticky']) => el.stuck)).toBe(true)
  // Pinned to the top of the scroll container.
  const [box, scroller] = await Promise.all([sticky.boundingBox(), page.locator('.scroller').boundingBox()])
  expect(Math.abs(box!.y - scroller!.y - 1)).toBeLessThanOrEqual(1)

  await wheel(page, -2000)
  await expect.poll(() => hasState(page, 'stuck')).toBe(false)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'false')
})

test('keeps the offset from the edge', async ({ page, scenario }) => {
  await scenario('offset')
  await wheel(page, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  const [box, scroller] = await Promise.all([page.locator('c2-sticky').boundingBox(), page.locator('.scroller').boundingBox()])
  expect(Math.abs(box!.y - scroller!.y - 1 - 24)).toBeLessThanOrEqual(1)
})

test('sticks to the bottom edge until the end of the content is reached', async ({ page, scenario }) => {
  await scenario('bottom')
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await scrollTo(page, 'end')
  await expect.poll(() => hasState(page, 'stuck')).toBe(false)
  await scrollTo(page, 200)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
})

test('is never stuck when stickiness is turned off through CSS', async ({ page, scenario }) => {
  await scenario('static')
  await expect(page.locator('c2-sticky')).toHaveCSS('position', 'static')
  await wheel(page, 400)
  await expect(page.getByText('Body paragraph 1.', { exact: false })).toBeVisible()
  expect(await hasState(page, 'stuck')).toBe(false)
  await expect(page.locator('#log')).not.toHaveAttribute('data-stuck')
})

test('hide-on-scroll retracts while scrolling down and returns on the way up', async ({ page, scenario }) => {
  await scenario('hide')
  await wheel(page, 300)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await wheel(page, 100)
  await expect.poll(() => hasState(page, 'retracted')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-retracted', 'true')
  await expect(page.getByRole('button', { name: 'Bold' })).not.toBeInViewport()

  await wheel(page, -60)
  await expect.poll(() => hasState(page, 'retracted')).toBe(false)
  await expect(page.locator('#log')).toHaveAttribute('data-retracted', 'false')
  await expect(page.getByRole('button', { name: 'Bold' })).toBeInViewport()
})

test('hide-on-scroll brings the content back when focus moves into it', async ({ page, scenario, tab }) => {
  await scenario('hide')
  await wheel(page, 300)
  await wheel(page, 100)
  await expect.poll(() => hasState(page, 'retracted')).toBe(true)
  await page.locator('.scroller').focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Bold' })).toBeFocused()
  await expect.poll(() => hasState(page, 'retracted')).toBe(false)
})

test('a single fast scroll that pins the content does not also hide it', async ({ page, scenario }) => {
  await scenario('hide')
  await scrollTo(page, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  expect(await hasState(page, 'retracted')).toBe(false)
  await expect(page.getByRole('button', { name: 'Bold' })).toBeInViewport()
})

test('sticks within a scroll box that a parent renders in its shadow root after the content connects', async ({ page, scenario }) => {
  await scenario('shadow')
  await wheel(page, 400, 'scenario-panel')
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
})

test('sticks when the body is the scroller', async ({ page, scenario }) => {
  await scenario('body')
  await page.mouse.move(200, 200)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
})

test('notices content that arrives without a scroll', async ({ page, scenario }) => {
  await scenario('grow')
  expect(await hasState(page, 'stuck')).toBe(false)
  await page.getByRole('button', { name: 'Load more' }).click()
  await expect.poll(() => hasState(page, 'stuck')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'true')
})

test.describe('show-when-hidden', () => {
  const barButton = (page: Page) => page.getByRole('button', { name: 'Buy from the bar' })

  test('stays out of view while the watched element is on screen, and slides in once it scrolls away', async ({ page, scenario }) => {
    await scenario('cta')
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
    await expect(page.locator('[part="surface"]')).toHaveCSS('visibility', 'hidden')
    await expect(barButton(page)).toBeHidden()

    await scrollTo(page, 400)
    await expect.poll(() => hasState(page, 'concealed')).toBe(false)
    await expect(page.locator('#log')).toHaveAttribute('data-concealed', 'false')
    await expect(barButton(page)).toBeInViewport()
    expect(await page.locator('c2-sticky').evaluate((el: HTMLElementTagNameMap['c2-sticky']) => el.concealed)).toBe(false)

    await scrollTo(page, 0)
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
    await expect(page.locator('#log')).toHaveAttribute('data-concealed', 'true')
    await expect(page.locator('[part="surface"]')).toHaveCSS('visibility', 'hidden')
  })

  test('is skipped by Tab while concealed', async ({ page, scenario, tab }) => {
    await scenario('cta')
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
    await expect(page.locator('[part="surface"]')).toHaveCSS('visibility', 'hidden')
    await page.getByRole('button', { name: 'Buy now' }).focus()
    await tab()
    await expect(page.locator('c2-sticky button')).not.toBeFocused()
    expect(await page.evaluate(() => document.activeElement?.textContent)).not.toBe('Buy from the bar')
  })

  test('keeps the focused stand-in in view until focus leaves it', async ({ page, scenario }) => {
    await scenario('cta')
    await scrollTo(page, 400)
    await expect.poll(() => hasState(page, 'concealed')).toBe(false)
    // Shift+Tab from the document reaches the bar, the last control, without scrolling the main button into view.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Shift+Tab')
    await expect(barButton(page)).toBeFocused()

    await scrollTo(page, 0)
    await expect(page.getByRole('button', { name: 'Buy now' })).toBeInViewport()
    // Give the observer a frame to report the watched element: the focused bar must not hide.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(await hasState(page, 'concealed')).toBe(false)

    await page.getByRole('button', { name: 'Buy now' }).focus()
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
  })

  test('a click does not hold the stand-in in view once the watched element returns', async ({ page, scenario }) => {
    await scenario('cta')
    await scrollTo(page, 400)
    await expect.poll(() => hasState(page, 'concealed')).toBe(false)
    await barButton(page).click()
    await scrollTo(page, 0)
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
  })

  test('adds no scrollable overflow while concealed', async ({ page, scenario }) => {
    await scenario('cta-short')
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
    // Let the slide finish: a translated surface would make the box scrollable.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('c2-sticky')!.shadowRoot!.querySelector('.surface')!).visibility === 'hidden')
    expect(await page.locator('.scroller').evaluate((scroller) => scroller.scrollHeight - scroller.clientHeight)).toBe(0)
  })

  test('watches an element given as a reference', async ({ page, scenario }) => {
    await scenario('cta-element')
    await expect.poll(() => hasState(page, 'concealed')).toBe(true)
    await scrollTo(page, 400)
    await expect.poll(() => hasState(page, 'concealed')).toBe(false)
  })

  test('an id that matches nothing leaves the content in view', async ({ page, scenario }) => {
    await scenario('cta-missing')
    await expect(barButton(page)).toBeInViewport()
    expect(await hasState(page, 'concealed')).toBe(false)
  })

  test('slides without motion when the reader prefers reduced motion', async ({ page, scenario }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await scenario('cta')
    await expect(page.locator('[part="surface"]')).toHaveCSS('transition-duration', /^0s/)
  })

  test('creates no observer and loads no watcher when nothing is watched', async ({ page, scenario }) => {
    const watcherRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('sticky-watch')) watcherRequests.push(request.url())
    })
    await page.addInitScript(() => {
      const Native = window.IntersectionObserver
      ;(window as unknown as { observers: number }).observers = 0
      window.IntersectionObserver = class extends Native {
        constructor(...args: ConstructorParameters<typeof IntersectionObserver>) {
          super(...args)
          ;(window as unknown as { observers: number }).observers++
        }
      }
    })
    await scenario()
    await wheel(page, 400)
    await expect.poll(() => hasState(page, 'stuck')).toBe(true)
    expect(await page.evaluate(() => (window as unknown as { observers: number }).observers)).toBe(0)
    expect(watcherRequests).toEqual([])
    expect(await hasState(page, 'concealed')).toBe(false)
  })

  for (const top of [0, 400]) {
    test(`has no axe violations ${top ? 'while shown' : 'while concealed'}`, async ({ page, scenario }) => {
      await scenario('cta')
      await scrollTo(page, top)
      await expect.poll(() => hasState(page, 'concealed')).toBe(top === 0)
      const results = await new AxeBuilder({ page }).include('main').analyze()
      expect(results.violations).toEqual([])
    })
  }
})

for (const state of ['default', 'hide']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    await wheel(page, 400)
    const results = await new AxeBuilder({ page }).include('main').analyze()
    expect(results.violations).toEqual([])
  })
}
