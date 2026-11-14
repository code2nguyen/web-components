import type { Page } from '@playwright/test'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const feed = (attributes = '') =>
  `<c2-virtual-list style="height:240px;width:320px" aria-label="People" item-key="id" label-field="name" has-more ${attributes}></c2-virtual-list>`

const list = (page: Page) => page.locator('c2-virtual-list')
const more = (page: Page) => list(page).locator('[part="more"]')

/** Answers each `load-more` with the next page after a short delay, the way a server would; stops after `pages`. */
async function serve(page: Page, pages: number, fail = false) {
  await list(page).evaluate(
    (element: HTMLElement & { items: unknown[]; hasMore: boolean; loadMoreError: string | boolean }, { pages, fail }) => {
      let served = 0
      let failed = false
      const fired: Array<{ count: number; retry: boolean }> = []
      element.items = Array.from({ length: 20 }, (_, index) => ({ id: String(index), name: `Person ${index}` }))
      element.addEventListener('load-more', (event) => {
        const detail = (event as CustomEvent<{ count: number; retry: boolean }>).detail
        fired.push(detail)
        element.setAttribute('data-fired', JSON.stringify(fired))
        setTimeout(() => {
          if (fail && !failed) {
            failed = true
            element.loadMoreError = true
            return
          }
          served++
          const start = element.items.length
          element.items = [...element.items, ...Array.from({ length: 20 }, (_, index) => ({ id: String(start + index), name: `Person ${start + index}` }))]
          if (served >= pages) element.hasMore = false
        }, 150)
      })
    },
    { pages, fail },
  )
}
const fired = async (page: Page) => JSON.parse((await list(page).getAttribute('data-fired')) ?? '[]')
const scrollToEnd = (page: Page) => list(page).evaluate((element) => element.shadowRoot!.querySelector('.viewport')!.scrollTo({ top: 1e9 }))

test('nearing the end fires load-more once per page, shows a loading row, and stops when has-more is cleared', async ({ page, renderScenario }) => {
  await renderScenario(feed())
  await serve(page, 2)
  await expect(list(page).locator('c2-list-item')).not.toHaveCount(0)
  expect(await fired(page)).toEqual([])
  await scrollToEnd(page)
  await expect(more(page)).toContainText('Loading more')
  await expect.poll(() => list(page).evaluate((element: HTMLElement & { items: unknown[] }) => element.items.length)).toBe(40)
  await scrollToEnd(page)
  await expect.poll(() => list(page).evaluate((element: HTMLElement & { items: unknown[] }) => element.items.length)).toBe(60)
  await expect(list(page)).toHaveJSProperty('hasMore', false)
  await expect(more(page)).toHaveCount(0)
  expect(await fired(page)).toEqual([
    { count: 20, retry: false },
    { count: 40, retry: false },
  ])
  await accessible(page)
})

test('a page that does not fill the view asks for the next one at once', async ({ page, renderScenario }) => {
  await renderScenario(feed('style="height:600px;width:320px"'))
  await list(page).evaluate((element: HTMLElement & { items: unknown[]; hasMore: boolean }) => {
    let served = 0
    element.items = Array.from({ length: 3 }, (_, index) => ({ id: String(index), name: `Person ${index}` }))
    element.addEventListener('load-more', () => {
      served++
      const start = element.items.length
      element.items = [...element.items, ...Array.from({ length: 3 }, (_, index) => ({ id: String(start + index), name: `Person ${start + index}` }))]
      if (served >= 3) element.hasMore = false
    })
  })
  await expect.poll(() => list(page).evaluate((element: HTMLElement & { items: unknown[] }) => element.items.length)).toBe(12)
})

test('a failed page shows the error and Retry, which fires load-more again with retry', async ({ page, renderScenario }) => {
  await renderScenario(feed())
  await serve(page, 1, true)
  await scrollToEnd(page)
  await expect(more(page)).toContainText("Couldn't load more")
  await list(page).locator('[part="more-retry"]').focus()
  await page.keyboard.press('Enter')
  // The button goes with the error; the focus stays in the list, on the last item.
  await expect(list(page).locator('c2-list-item[tabindex="0"]')).toBeFocused()
  await expect.poll(() => list(page).evaluate((element: HTMLElement & { items: unknown[] }) => element.items.length)).toBe(40)
  expect(await fired(page)).toEqual([
    { count: 20, retry: false },
    { count: 20, retry: true },
  ])
})

test('the loading and error rows speak the page language, and a data source ignores has-more', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${feed('load-more-error="Réseau indisponible"')}</div>`)
  await list(page).evaluate((element: HTMLElement & { items: unknown[] }) => (element.items = [{ id: 'a', name: 'A' }]))
  await expect(more(page)).toContainText('Réseau indisponible')
  await expect(list(page).locator('[part="more-retry"]')).toHaveText('Réessayer')

  await renderScenario(feed())
  await list(page).evaluate((element: HTMLElement & { dataSource: unknown }) => {
    element.dataSource = {
      getItems: ({ start, count }: { start: number; count: number }) =>
        Promise.resolve({ items: Array.from({ length: count }, (_, i) => ({ id: String(start + i), name: `R ${start + i}` })), total: 50 }),
    }
  })
  await expect(list(page).locator('c2-list-item').first()).toContainText('R 0')
  await expect(more(page)).toHaveCount(0)

  // `"false"`, as a framework writes a false flag, is no error.
  await renderScenario(feed('load-more-error="false"'))
  await list(page).evaluate((element: HTMLElement & { items: unknown[] }) => (element.items = [{ id: 'a', name: 'A' }]))
  await expect(list(page)).toHaveJSProperty('loadMoreError', '')
})

test('a page that fills the view waits for the next scroll, even when the app answers at once', async ({ page, renderScenario }) => {
  await renderScenario(feed())
  await list(page).evaluate((element: HTMLElement & { items: unknown[] }) => {
    const add = () => {
      const start = element.items.length
      element.items = [...element.items, ...Array.from({ length: 20 }, (_, index) => ({ id: String(start + index), name: `Person ${start + index}` }))]
    }
    add()
    let fired = 0
    element.addEventListener('load-more', () => {
      element.setAttribute('data-count', String(++fired))
      add()
    })
  })
  await scrollToEnd(page)
  await expect(list(page)).toHaveAttribute('data-count', '1')
  await page.waitForTimeout(200)
  await expect(list(page)).toHaveAttribute('data-count', '1')
  await scrollToEnd(page)
  await expect(list(page)).toHaveAttribute('data-count', '2')
})

test('a list that grows with the page loads as the page scrolls, and one that starts empty asks for its first page', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div style="height:2000px"></div><c2-virtual-list style="width:320px;height:auto" aria-label="People" item-key="id" label-field="name" has-more></c2-virtual-list><div style="height:400px"></div>`,
  )
  await list(page).evaluate((element: HTMLElement & { items: unknown[]; hasMore: boolean }) => {
    let fired = 0
    element.addEventListener('load-more', (event) => {
      element.setAttribute('data-count', String(++fired))
      const { count } = (event as CustomEvent<{ count: number }>).detail
      element.items = [...element.items, ...Array.from({ length: 20 }, (_, index) => ({ id: String(count + index), name: `Person ${count + index}` }))]
    })
  })
  // Far below the fold: nothing yet, and no "No items" while the first page is to come.
  await page.waitForTimeout(200)
  await expect(list(page)).not.toHaveAttribute('data-count')
  await expect(list(page).locator('[part="state"]')).toHaveCount(0)
  await list(page).scrollIntoViewIfNeeded()
  await expect(list(page)).toHaveAttribute('data-count', '1')
  await page.waitForTimeout(200)
  await expect(list(page)).toHaveAttribute('data-count', '1')
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await expect(list(page)).toHaveAttribute('data-count', '2')
})

test('count is the number of items loaded during a search, a page grown in place with refresh() ends the loading, and a more-error slot can retry', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(feed('searchable'))
  await list(page).evaluate((element: HTMLElement & { items: unknown[]; search: string; refresh(): void }) => {
    element.items = Array.from({ length: 30 }, (_, index) => ({ id: String(index), name: index < 2 ? `Ada ${index}` : `Person ${index}` }))
    const counts: number[] = []
    element.addEventListener('load-more', (event) => {
      counts.push((event as CustomEvent<{ count: number }>).detail.count)
      element.setAttribute('data-counts', JSON.stringify(counts))
      if (counts.length === 1) {
        element.items.push({ id: 'x', name: 'Person x' })
        element.refresh()
      }
    })
    element.search = 'Ada'
  })
  await expect(list(page)).toHaveAttribute('data-counts', '[30,31]')

  await renderScenario(
    feed('load-more-error').replace(
      '></c2-virtual-list>',
      '><span slot="more-error">Offline <button onclick="this.closest(\'c2-virtual-list\').retryLoadMore()">Try again</button></span></c2-virtual-list>',
    ),
  )
  await list(page).evaluate((element: HTMLElement & { items: unknown[] }) => {
    element.items = [{ id: 'a', name: 'A' }]
    element.addEventListener('load-more', (event) => element.setAttribute('data-retry', String((event as CustomEvent<{ retry: boolean }>).detail.retry)))
  })
  await expect(page.getByText('Offline')).toBeVisible()
  await expect(list(page).locator('[part="more-retry"]')).toBeHidden()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(list(page)).toHaveAttribute('data-retry', 'true')
})
