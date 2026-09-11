import { relative, dirname } from 'node:path'
import { expect, type Locator, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { test as base } from './fixture'

export const test = base.extend<{ renderScenario: (html: string) => Promise<void>; browserErrors: void }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await use()
      expect(errors, 'Uncaught errors in the component scenario').toEqual([])
    },
    { auto: true },
  ],
  renderScenario: async ({ page }, use, testInfo) => {
    await use(async (html) => {
      const directory = relative(testInfo.project.testDir, dirname(testInfo.file)).replaceAll('\\', '/')
      await page.goto(`/${directory}/scenarios.html`)
      await expect(page.locator('html')).toHaveAttribute('data-modules-ready', 'true')
      await page.locator('main').evaluate(async (main, markup) => {
        main.innerHTML = markup
        const settle = async (root: Element | ShadowRoot): Promise<void> => {
          for (const element of root.querySelectorAll('*')) {
            if (element.localName.startsWith('c2-')) {
              await customElements.whenDefined(element.localName)
              await (element as Element & { updateComplete?: Promise<boolean> }).updateComplete
            }
            if (element.shadowRoot) await settle(element.shadowRoot)
          }
        }
        await settle(main)
      }, html)
    })
  },
})

export { expect } from '@playwright/test'

export async function props(locator: Locator, values: Record<string, unknown>) {
  await locator.evaluate(async (element, data) => {
    Object.assign(element, data)
    await (element as Element & { updateComplete?: Promise<boolean> }).updateComplete
  }, values)
}

export async function watch(locator: Locator, name: string) {
  await locator.evaluate((element, eventName) => {
    const events: unknown[] = []
    element.setAttribute('data-events', '[]')
    element.addEventListener(eventName, (event) => {
      events.push(event instanceof CustomEvent ? event.detail : null)
      element.setAttribute('data-events', JSON.stringify(events))
    })
  }, name)
}

export async function accessible(page: Page) {
  // Audit the settled presentation, not an intermediate opacity transition.
  // Infinite loading animations are deliberately left running.
  await page.locator('*').evaluateAll(async (elements) => {
    await Promise.all(
      elements
        .flatMap((element) => element.getAnimations())
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    )
  })
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  expect(result.violations).toEqual([])
}

export async function pointerClick(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible pointer target')
  await locator.page().mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

// Stub the external clipboard boundary, not component behavior. Works in all engines
// without permissions dialogs or modifying the developer's real clipboard.
export async function clipboard(page: Page, fail = false) {
  await page.evaluate((reject) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          if (reject) throw new Error('Clipboard denied')
          document.documentElement.dataset.clipboard = text
        },
      },
    })
  }, fail)
}
