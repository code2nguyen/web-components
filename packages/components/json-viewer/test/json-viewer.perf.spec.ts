import { test, expect } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

// Cost, not wall-clock: the number of rendered lines must not depend on the size of the document, so these hold on
// any machine. Rendering every visible line instead of only the ones in view fails all of them.

const DOM_LINE_LIMIT = 80

const lines = (page: Page) => page.locator('c2-json-viewer').getByRole('treeitem')

async function load(page: Page, expression: string) {
  await page.locator('c2-json-viewer').evaluate((element, expression) => {
    ;(element as HTMLElement & { data: unknown }).data = new Function(`return ${expression}`)()
  }, expression)
}

test('a million-item array renders as many lines as a hundred-item one', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-viewer page-size="2000000" style="--c2-json-viewer--max-height: 400px"></c2-json-viewer>')
  await load(page, 'Array.from({ length: 100 }, (_, i) => i)')
  const small = await lines(page).count()
  await load(page, 'Array.from({ length: 1000000 }, (_, i) => i)')
  await expect(lines(page).first()).toBeVisible()
  expect(await lines(page).count()).toBeLessThanOrEqual(Math.max(small, DOM_LINE_LIMIT))
  // 24M px of lines is past what Firefox lets an element be (about 17.9M px), so the scroll space is compressed and the
  // last line must still be reachable.
  const viewer = page.locator('c2-json-viewer')
  expect(await viewer.locator('.tree').evaluate((tree) => tree.getBoundingClientRect().height)).toBeLessThanOrEqual(15_100_000)
  await viewer.evaluate((element) => {
    const scroller = element.shadowRoot!.querySelector('.scroller')!
    scroller.scrollTop = scroller.scrollHeight
  })
  await expect(lines(page).filter({ has: page.locator('[part="key"]', { hasText: /^999999$/ }) })).toBeInViewport()
  expect(await lines(page).count()).toBeLessThanOrEqual(DOM_LINE_LIMIT)
  await viewer.evaluate((element) => {
    const scroller = element.shadowRoot!.querySelector('.scroller')!
    scroller.scrollTop = scroller.scrollHeight / 2
  })
  // Halfway down the scroll range shows the middle of the document: read the line under the top of the scroll box.
  const topLine = () =>
    viewer.evaluate((element) => {
      const box = element.shadowRoot!.querySelector('.scroller')!.getBoundingClientRect()
      const line = element.shadowRoot!.elementFromPoint(box.left + 40, box.top + 12)?.closest('[role="treeitem"]')
      return Number(line?.querySelector('[part="key"]')?.textContent)
    })
  await expect.poll(topLine).toBeGreaterThan(490000)
  expect(await topLine()).toBeLessThan(510000)
})

test('expanding a million-node document keeps the rendered lines bounded', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-viewer style="--c2-json-viewer--max-height: 400px"></c2-json-viewer>')
  await load(page, `(function mk(d) { return d === 0 ? 'leaf' : Object.fromEntries(Array.from({ length: 10 }, (_, i) => ['k' + i, mk(d - 1)])) })(6)`)
  await page.locator('c2-json-viewer').evaluate((element) => (element as HTMLElement & { expandAll(): void }).expandAll())
  await expect(lines(page).filter({ hasText: 'leaf' }).first()).toBeVisible()
  expect(await lines(page).count()).toBeLessThanOrEqual(DOM_LINE_LIMIT)
})

test('scrolling and End reach the last line while the rendered lines stay bounded', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-viewer page-size="200000" expand-depth="1" style="--c2-json-viewer--max-height: 400px"></c2-json-viewer>')
  await load(page, 'Array.from({ length: 100000 }, (_, i) => ({ id: i }))')
  await lines(page).first().focus()
  await page.keyboard.press('End')
  const last = lines(page).filter({ has: page.locator('[part="key"]', { hasText: /^99999$/ }) })
  await expect(last).toBeFocused()
  await expect(last).toBeInViewport()
  expect(await lines(page).count()).toBeLessThanOrEqual(DOM_LINE_LIMIT + 1)
  await page.keyboard.press('Home')
  await expect(lines(page).first()).toBeFocused()
  await page.locator('c2-json-viewer').evaluate((element) => (element.shadowRoot!.querySelector('.scroller')!.scrollTop = 24 * 50000))
  await expect(lines(page).filter({ has: page.locator('[part="key"]', { hasText: /^50000$/ }) })).toBeInViewport()
  expect(await lines(page).count()).toBeLessThanOrEqual(DOM_LINE_LIMIT + 1)
})

test('a search matching every record reveals them all without rendering them all', async ({ page, renderScenario }) => {
  await renderScenario('<c2-json-viewer style="--c2-json-viewer--max-height: 400px"></c2-json-viewer>')
  await load(page, `Array.from({ length: 50000 }, (_, i) => ({ id: i, address: { zip: String(i) } }))`)
  await page.locator('c2-json-viewer').evaluate((element) => ((element as HTMLElement & { search: string }).search = 'zip'))
  await expect(page.locator('c2-json-viewer').locator('mark').first()).toBeVisible()
  await expect(page.locator('c2-json-viewer')).toHaveJSProperty('searchMatches.length', 50000)
  expect(await lines(page).count()).toBeLessThanOrEqual(DOM_LINE_LIMIT)
})
