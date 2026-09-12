import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const numbered = '<c2-pagination total-items="240" page-size="10" page="4"></c2-pagination>'

test('numbered pagination names the current page and moves it on click', async ({ page, renderScenario }) => {
  await renderScenario(numbered)
  const host = page.locator('c2-pagination')
  await watch(host, 'page-change')
  const nav = page.getByRole('navigation', { name: 'Pagination' })
  await expect(nav).toBeVisible()
  await expect(page.getByRole('button', { name: 'Go to page 4' })).toHaveAttribute('aria-current', 'page')

  await page.getByRole('button', { name: 'Go to page 5' }).click()
  await expect(host).toHaveJSProperty('page', 5)
  await expect(page.getByRole('button', { name: 'Go to page 5' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('button', { name: 'Go to page 4' })).not.toHaveAttribute('aria-current')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ page: 5, previousPage: 4, pageSize: 10, pageCount: 24, startIndex: 40, endIndex: 50 }]))
  await accessible(page)
})

test('previous and next walk the pages and stop at the ends', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-pages="3" page="1"></c2-pagination>')
  const host = page.locator('c2-pagination')
  const previous = page.getByRole('button', { name: 'Previous' })
  const next = page.getByRole('button', { name: 'Next' })
  await expect(previous).toBeDisabled()
  await next.click()
  await expect(host).toHaveJSProperty('page', 2)
  await expect(previous).toBeEnabled()
  await next.click()
  await expect(host).toHaveJSProperty('page', 3)
  await expect(next).toBeDisabled()
})

test('reaching the last page hands focus to the control that is still usable', async ({ page, renderScenario, tab }) => {
  await renderScenario('<c2-pagination total-pages="2" page="1"></c2-pagination>')
  const next = page.getByRole('button', { name: 'Next' })
  // Previous is disabled on the first page, so the tab order starts at the page numbers.
  await page.getByRole('button', { name: 'Go to page 1' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Go to page 2' })).toBeFocused()
  await tab()
  await expect(next).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-pagination')).toHaveJSProperty('page', 2)
  await expect(next).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous' })).toBeFocused()
})

test('the numbers around the current page collapse into an ellipsis', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-pages="20" page="10"></c2-pagination>')
  const numbers = page.locator('c2-pagination').locator('button.c2-pagination-item')
  const ellipses = page.locator('c2-pagination .c2-pagination-ellipsis')
  await expect(numbers).toHaveText(['1', '9', '10', '11', '20'])
  await expect(ellipses).toHaveCount(2)

  // The row keeps the same number of slots as the current page moves, so nothing shifts under the pointer.
  await page.getByRole('button', { name: 'Go to page 1', exact: true }).click()
  await expect(numbers).toHaveText(['1', '2', '3', '4', '5', '20'])
  await expect(ellipses).toHaveCount(1)

  await page.getByRole('button', { name: 'Go to page 20' }).click()
  await expect(numbers).toHaveText(['1', '16', '17', '18', '19', '20'])
  await expect(ellipses).toHaveCount(1)
})

test('a narrow container sheds page numbers instead of wrapping onto a second row', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-pages="20" page="10" hide-nav-labels style="width: 420px"></c2-pagination>')
  const host = page.locator('c2-pagination')
  const list = host.locator('.c2-pagination-list')
  const numbers = host.locator('button.c2-pagination-item')
  await expect(numbers).toHaveText(['1', '9', '10', '11', '20'])
  const full = await list.boundingBox()

  // Halve the width: fewer numbers survive, and the row is still exactly one row high.
  await host.evaluate((element) => element.setAttribute('style', 'width: 200px'))
  await expect.poll(async () => numbers.count()).toBeLessThan(5)
  await expect(page.getByRole('button', { name: 'Go to page 10', exact: true })).toHaveAttribute('aria-current', 'page')
  expect((await list.boundingBox())?.height).toBeCloseTo(full?.height ?? 0, 0)

  // Give the room back and the numbers come back with it.
  await host.evaluate((element) => element.setAttribute('style', 'width: 420px'))
  await expect(numbers).toHaveText(['1', '9', '10', '11', '20'])
})

test('the ellipsis jumps into the middle of the pages it hides', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-pages="20" page="10"></c2-pagination>')
  const host = page.locator('c2-pagination')
  // 1 … 9 10 11 … 20: the gaps are 2-8 and 12-19.
  const back = page.getByRole('button', { name: 'Jump to page 5, skipping 7 pages' })
  const forward = page.getByRole('button', { name: 'Jump to page 15, skipping 8 pages' })
  await expect(back).toBeVisible()
  await forward.click()
  await expect(host).toHaveJSProperty('page', 15)
  await expect(page.getByRole('button', { name: 'Go to page 15', exact: true })).toHaveAttribute('aria-current', 'page')
  await accessible(page)
})

test('a squeezed row still reaches the hidden pages through the ellipsis', async ({ page, renderScenario }) => {
  // Only 1 … 10 … 20 fits, so the ellipsis is the one way to page 5 in a single move.
  await renderScenario('<c2-pagination total-pages="20" page="10" hide-nav-labels style="width: 300px"></c2-pagination>')
  const host = page.locator('c2-pagination')
  await expect(host.locator('button.c2-pagination-item')).toHaveText(['1', '10', '20'])
  await page.getByRole('button', { name: 'Jump to page 5, skipping 8 pages' }).click()
  await expect(host).toHaveJSProperty('page', 5)
})

test('boundary-count and sibling-count widen the visible range', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-pages="20" page="10" sibling-count="2" boundary-count="2"></c2-pagination>')
  await expect(page.locator('c2-pagination').locator('button.c2-pagination-item')).toHaveText(['1', '2', '8', '9', '10', '11', '12', '19', '20'])
})

test('show-first-last adds jumps to both ends of a variant that shows no numbers', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination variant="simple" total-pages="20" page="10" show-first-last></c2-pagination>')
  const host = page.locator('c2-pagination')
  await page.getByRole('button', { name: 'Last' }).click()
  await expect(host).toHaveJSProperty('page', 20)
  await page.getByRole('button', { name: 'First' }).click()
  await expect(host).toHaveJSProperty('page', 1)
  await expect(page.getByRole('button', { name: 'First' })).toBeDisabled()
})

test('the simple variant reports the page instead of listing the numbers', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination variant="simple" total-pages="12" page="3"></c2-pagination>')
  await expect(page.locator('c2-pagination')).toContainText('Page 3 of 12')
  await expect(page.getByRole('button', { name: 'Go to page 3' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.locator('c2-pagination')).toContainText('Page 4 of 12')
  await accessible(page)
})

test('the compact variant shows the range of items and steps through it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination variant="compact" total-items="100" page-size="10" page="3"></c2-pagination>')
  const host = page.locator('c2-pagination')
  await expect(host).toContainText('21–30 of 100')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(host).toContainText('31–40 of 100')
  await accessible(page)
})

test('changing the rows per page keeps the first row of the page visible', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination variant="compact" total-items="100" page-size="10" page="3" page-size-options="10,25,50"></c2-pagination>')
  const host = page.locator('c2-pagination')
  await watch(host, 'page-size-change')
  await page.getByRole('button', { name: 'Rows per page' }).click()
  await page.getByRole('option', { name: '25' }).click()
  await expect(host).toHaveJSProperty('pageSize', 25)
  // Row 21 was the first row on show, so 25 rows a page puts it on page 1.
  await expect(host).toHaveJSProperty('page', 1)
  await expect(host).toContainText('1–25 of 100')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ pageSize: 25, previousPageSize: 10, page: 1 }]))
})

test('hide-page-size and hide-range strip the compact row down to its arrows', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination variant="compact" total-items="100" page="2" hide-page-size hide-range></c2-pagination>')
  const host = page.locator('c2-pagination')
  await expect(host).not.toContainText('Rows per page')
  await expect(host).not.toContainText('of 100')
  await expect(host.getByRole('button')).toHaveCount(2)
})

test('disabled ignores every control', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-pages="8" page="3" disabled></c2-pagination>')
  const host = page.locator('c2-pagination')
  for (const name of ['Previous', 'Next', 'Go to page 4', 'Jump to page']) {
    await expect(page.getByRole('button', { name }).first()).toBeDisabled()
  }
  await expect(host).toHaveJSProperty('page', 3)
})

test('a page outside the range settles on the closest real page', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination total-items="45" page-size="10" page="99"></c2-pagination>')
  const host = page.locator('c2-pagination')
  await expect(page.getByRole('button', { name: 'Go to page 5' })).toHaveAttribute('aria-current', 'page')
  await expect(host).toHaveJSProperty('pageCount', 5)
  await expect(host).toHaveJSProperty('startIndex', 40)
  await expect(host).toHaveJSProperty('endIndex', 45)
})

test('the labels and templates carry the whole wording', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-pagination
       variant="compact"
       total-items="100"
       page-size="10"
       page="3"
       previous-label="Précédent"
       next-label="Suivant"
       page-size-label="Lignes par page :"
       range-template="{start} à {end} sur {total}"></c2-pagination>`,
  )
  const host = page.locator('c2-pagination')
  await expect(host).toContainText('21 à 30 sur 100')
  await expect(host).toContainText('Lignes par page :')
  await expect(page.getByRole('button', { name: 'Précédent' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suivant' })).toBeVisible()
})

test('a pager with no paging host keeps owning its own state, before and after a move', async ({ page, renderScenario }) => {
  await renderScenario('<div id="a"><c2-pagination total-items="100" page-size="10" page="2"></c2-pagination></div><div id="b"></div>')
  const host = page.locator('c2-pagination')
  await watch(host, 'page-change')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(host).toHaveJSProperty('page', 3)

  // The context consumer releases on disconnect; a pager that never re-requests would go inert after a DOM move.
  await page.locator('#b').evaluate((target) => target.append(document.querySelector('c2-pagination')!))
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(host).toHaveJSProperty('page', 4)
  await expect(host).toHaveJSProperty('totalItems', 100)
})

test('the rows-per-page dropdown has a floor, so one-digit options do not open a sliver', async ({ page, renderScenario }) => {
  await renderScenario('<c2-pagination variant="compact" total-items="9" page-size="4" page-size-options="4,8"></c2-pagination>')
  const trigger = page.getByRole('button', { name: 'Rows per page' })
  await trigger.click()
  const list = await page.getByRole('listbox').boundingBox()
  const button = await trigger.boundingBox()
  // Wide enough for a three-digit option, and wider than a one-digit trigger — but no wider than it needs to be.
  expect(list!.width).toBeGreaterThan(48)
  expect(list!.width).toBeLessThan(70)
  expect(list!.width).toBeGreaterThan(button!.width)
})
