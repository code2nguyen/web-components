import type { Locator } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const rows = (count: number, from = 1) =>
  Array.from({ length: count }, (_, index) => `<div class="row" data-id="${from + index}">Message ${from + index}</div>`).join('')

const scroller = (list: Locator) => list.getByRole('log')

/** Distance between the bottom of the scrolled content and the bottom of the viewport. */
const distanceFromBottom = (list: Locator) => scroller(list).evaluate((element) => Math.round(element.scrollHeight - element.scrollTop - element.clientHeight))

const append = (list: Locator, markup: string) => list.evaluate((element, html) => element.insertAdjacentHTML('beforeend', html), markup)

const scrollUp = async (list: Locator, pixels = 300) => {
  await scroller(list).hover()
  await list.page().mouse.wheel(0, -pixels)
}

/** Keeps wheeling up until `reached` passes; Firefox moves a few hundred pixels per wheel event whatever the delta. */
const scrollUpUntil = (list: Locator, reached: () => Promise<void>) =>
  expect(async () => {
    await scrollUp(list, 1000)
    await reached()
  }).toPass({ timeout: 5000 })

/** Resolves once a smooth scroll has stopped: WebKit retargets a keyboard scroll pressed mid-animation short of its end. */
const scrollSettled = (list: Locator) =>
  scroller(list).evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        let last = -1
        let still = 0
        const tick = () => {
          still = element.scrollTop === last ? still + 1 : 0
          last = element.scrollTop
          if (still >= 5) resolve()
          else requestAnimationFrame(tick)
        }
        tick()
      }),
  )

test('starts at the latest message and follows appended messages', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-chat-message-list>${rows(20)}</c2-chat-message-list>`)
  const list = page.locator('c2-chat-message-list')
  await expect(scroller(list)).toHaveAccessibleName('Conversation')
  await expect(scroller(list)).toHaveAttribute('aria-live', 'polite')
  await expect.poll(() => distanceFromBottom(list)).toBe(0)
  await expect(page.getByRole('button', { name: /Jump to latest message/ })).toBeHidden()

  await append(list, rows(3, 21))
  await expect.poll(() => distanceFromBottom(list)).toBe(0)
  await expect(page.getByText('Message 23')).toBeInViewport()
  await accessible(page)
})

test('keeps following a message that grows while it streams', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-chat-message-list>${rows(10)}<c2-chat-message id="answer">Thinking</c2-chat-message></c2-chat-message-list>`)
  const list = page.locator('c2-chat-message-list')
  await expect.poll(() => distanceFromBottom(list)).toBe(0)
  await page.locator('#answer').evaluate((element) => {
    element.textContent = 'A much longer streamed answer. '.repeat(40)
  })
  await expect.poll(() => distanceFromBottom(list)).toBe(0)
})

test('stops following when the reader scrolls up, counts new messages and jumps back', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-chat-message-list>${rows(20)}</c2-chat-message-list>`)
  const list = page.locator('c2-chat-message-list')
  await watch(list, 'at-bottom-change')
  await expect.poll(() => distanceFromBottom(list)).toBe(0)

  await scrollUp(list)
  const jump = page.getByRole('button', { name: /Jump to latest message/ })
  await expect(jump).toBeVisible()
  await expect(list).toHaveAttribute('data-events', '[false]')
  const readingPosition = await distanceFromBottom(list)
  expect(readingPosition).toBeGreaterThan(24)

  await append(list, rows(2, 21))
  await expect(jump).toHaveAccessibleName('Jump to latest message 2')
  // The reader's position is kept, so the new messages land below the viewport.
  await expect(page.getByText('Message 22')).not.toBeInViewport()

  await jump.click()
  await expect.poll(() => distanceFromBottom(list)).toBe(0)
  await expect(jump).toBeHidden()
  await expect(scroller(list)).toBeFocused()
  await expect(list).toHaveAttribute('data-events', '[false,true]')
  await expect.poll(() => list.evaluate((element) => (element as HTMLElement & { unreadCount: number }).unreadCount)).toBe(0)
})

test('the log is keyboard scrollable and resumes following at the bottom', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<c2-chat-message-list>${rows(20)}</c2-chat-message-list>`)
  const list = page.locator('c2-chat-message-list')
  await expect.poll(() => distanceFromBottom(list)).toBe(0)
  await scrollSettled(list)
  await tab()
  await expect(scroller(list)).toBeFocused()
  await page.keyboard.press('PageUp')
  await expect(page.getByRole('button', { name: /Jump to latest message/ })).toBeVisible()
  await scrollSettled(list)
  await page.keyboard.press('End')
  await expect(page.getByRole('button', { name: /Jump to latest message/ })).toBeHidden()
  await expect.poll(() => list.evaluate((element) => (element as HTMLElement & { atBottom: boolean }).atBottom)).toBe(true)
})

test('requests older messages once at the top and keeps the reading position when they are prepended', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-chat-message-list has-more>${rows(10, 11)}</c2-chat-message-list>`)
  const list = page.locator('c2-chat-message-list')
  await watch(list, 'load-older')
  await list.evaluate((element) => {
    const host = element as HTMLElement & { loading: boolean; hasMore: boolean }
    host.addEventListener('load-older', () => {
      host.loading = true
      // The application answers asynchronously, like a history request would.
      requestAnimationFrame(() => {
        host.insertAdjacentHTML('afterbegin', Array.from({ length: 10 }, (_, index) => `<div class="row">Message ${index + 1}</div>`).join(''))
        host.loading = false
        host.hasMore = false
      })
    })
  })
  await expect.poll(() => distanceFromBottom(list)).toBe(0)

  await scrollUpUntil(list, () => expect(list).toHaveAttribute('data-events', '[null]', { timeout: 500 }))
  await expect(page.getByText('Message 1', { exact: true })).toBeAttached()
  // Message 11 was at the top of the viewport before the prepend and stays there instead of being pushed down.
  await expect(page.getByText('Message 11')).toBeInViewport()
  await expect(page.getByText('Message 10', { exact: true })).not.toBeInViewport()

  await scrollUpUntil(list, () => expect(page.getByText('Message 1', { exact: true })).toBeInViewport({ timeout: 500 }))
  await expect(list).toHaveAttribute('data-events', '[null]')
})

test('shows the loading and empty slots only when they apply', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-chat-message-list loading><span slot="empty">No messages yet</span></c2-chat-message-list>`)
  const list = page.locator('c2-chat-message-list')
  await expect(page.getByText('No messages yet')).toBeVisible()
  await expect(page.getByText('Loading earlier messages…')).toBeVisible()
  await expect(scroller(list)).toHaveAttribute('aria-busy', 'true')
  await accessible(page)

  await list.evaluate((element) => {
    ;(element as HTMLElement & { loading: boolean }).loading = false
  })
  await append(list, rows(1))
  await expect(page.getByText('No messages yet')).toBeHidden()
  await expect(page.getByText('Loading earlier messages…')).toBeHidden()
  await expect(page.getByText('Message 1')).toBeVisible()
})

test('the scrollbar takes its colours from the scrollbar variables', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-chat-message-list style="--c2-chat-message-list__scrollbar__thumb--color: rgb(255, 0, 0); --c2-chat-message-list__scrollbar__track--color: rgb(0, 0, 255)">${rows(20)}</c2-chat-message-list>`,
  )
  const scroll = scroller(page.locator('c2-chat-message-list'))
  const style = await scroll.evaluate((element) => {
    const computed = getComputedStyle(element)
    return { supported: CSS.supports('scrollbar-color', 'auto'), color: computed.scrollbarColor }
  })
  test.skip(!style.supported, 'scrollbar-color is not supported; the ::-webkit-scrollbar fallback applies')
  expect(style.color).toBe('rgb(255, 0, 0) rgb(0, 0, 255)')
})
