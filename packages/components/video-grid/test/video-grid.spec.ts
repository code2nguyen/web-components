import { test, expect, accessible, props, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const grid = (page: Page) => page.locator('c2-video-grid')
const events = async (page: Page) => JSON.parse((await grid(page).getAttribute('data-events')) ?? '[]')

/** `count` plain tiles named T1…Tn, with extra attributes per index. */
const tiles = (count: number, extra: Record<number, string> = {}) =>
  Array.from({ length: count }, (_value, index) => `<div class="tile" id="t${index + 1}" name="T${index + 1}" ${extra[index + 1] ?? ''}></div>`).join('')

/** Each tile's box, rounded, relative to the grid. */
const boxes = (page: Page) =>
  grid(page).evaluate((element) => {
    const origin = element.getBoundingClientRect()
    return [...element.children].map((child) => {
      const box = child.getBoundingClientRect()
      return { id: child.id, x: Math.round(box.x - origin.x), y: Math.round(box.y - origin.y), width: Math.round(box.width), height: Math.round(box.height) }
    })
  })

test('grid: the column count that makes tiles largest; the last row centred; named by the count', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-grid>${tiles(2)}</c2-video-grid>`)
  await expect(grid(page)).toHaveHostAria('role', 'group')
  await expect(grid(page)).toHaveHostAria('aria-label', 'Participants (2)')
  // 720 × 405, gap 8: two 356 × 200 tiles side by side.
  await expect.poll(async () => (await boxes(page)).map((box) => box.width)).toEqual([356, 356])
  let laid = await boxes(page)
  expect(laid[0].y).toBe(laid[1].y)
  expect(laid[0].height).toBe(200)

  await grid(page).evaluate((element, markup) => element.insertAdjacentHTML('beforeend', markup), tiles(5).replaceAll('id="t', 'id="n'))
  await expect(grid(page)).toHaveHostAria('aria-label', 'Participants (7)')
  // Seven tiles: three columns, the seventh centred on its own row.
  await expect.poll(async () => new Set((await boxes(page)).map((box) => box.y)).size).toBe(3)
  laid = await boxes(page)
  const last = laid[6]
  expect(Math.abs(last.x + last.width / 2 - 360)).toBeLessThanOrEqual(1)
  expect(laid[0].width).toBe(laid[6].width)
  // No `slot` written on the tiles.
  expect(await grid(page).evaluate((element) => [...element.children].some((child) => child.hasAttribute('slot')))).toBe(false)
  await accessible(page)
})

test('grid on a portrait screen stacks; a resize lays the tiles out again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-grid class="portrait">${tiles(3)}</c2-video-grid>`)
  await expect.poll(async () => new Set((await boxes(page)).map((box) => box.x)).size).toBe(1)
  await grid(page).evaluate((element) => element.classList.remove('portrait'))
  await expect.poll(async () => new Set((await boxes(page)).map((box) => box.y)).size).toBeLessThan(3)
})

test('spotlight: the featured tile is large, the others in a strip below; featured follows featured, screen, pinned, first', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<c2-video-grid layout="spotlight">${tiles(4, { 3: 'kind="screen"', 2: 'pinned' })}</c2-video-grid>`)
  await watch(grid(page), 'featured-change')
  const stage = () => boxes(page).then((laid) => laid.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b)))
  // The screen share wins over the pinned tile.
  await expect.poll(async () => (await stage()).id).toBe('t3')
  const laid = await boxes(page)
  const strip = laid.filter((box) => box.id !== 't3')
  expect(new Set(strip.map((box) => box.y)).size).toBe(1)
  expect(strip[0].y).toBeGreaterThan((await stage()).y + (await stage()).height - 1)
  expect(await grid(page).evaluate((element) => (element as HTMLElement & { featured: Element }).featured.id)).toBe('t3')

  await page.locator('#t4').evaluate((tile) => tile.setAttribute('featured', ''))
  await expect.poll(async () => (await stage()).id).toBe('t4')
  await expect.poll(() => events(page)).toHaveLength(1)
  await page.locator('#t4').evaluate((tile) => tile.removeAttribute('featured'))
  await page.locator('#t3').evaluate((tile) => tile.removeAttribute('kind'))
  await expect.poll(async () => (await stage()).id).toBe('t2')
  await page.locator('#t2').evaluate((tile) => tile.removeAttribute('pinned'))
  await expect.poll(async () => (await stage()).id).toBe('t1')
  // The same elements throughout: a tile that moves is reassigned, not moved.
  expect(await grid(page).evaluate((element) => [...element.children].map((child) => child.id))).toEqual(['t1', 't2', 't3', 't4'])
})

test('sidebar: the others stack at the inline end, the start edge in right-to-left', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-grid layout="sidebar">${tiles(3, { 2: 'pinned' })}</c2-video-grid>`)
  await expect.poll(async () => (await boxes(page)).find((box) => box.id === 't2')!.x).toBe(0)
  let laid = await boxes(page)
  const side = laid.filter((box) => box.id !== 't2')
  expect(side[0].x).toBe(side[1].x)
  expect(side[0].x).toBeGreaterThan(500)
  await grid(page).evaluate((element) => element.setAttribute('dir', 'rtl'))
  await expect.poll(async () => (await boxes(page)).find((box) => box.id === 't1')!.x).toBe(0)
  laid = await boxes(page)
  expect(laid.find((box) => box.id === 't2')!.x).toBeGreaterThan(100)
})

test('max-tiles folds the rest into a "+N more" tile that keeps pinned and speaking tiles drawn', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-video-grid max-tiles="4">${tiles(9, { 7: 'speaking', 9: 'pinned' })}</c2-video-grid>`)
  await watch(grid(page), 'overflow-click')
  const more = page.getByRole('button', { name: 'Show 6 more participants' })
  await expect(more).toBeVisible()
  await expect(more).toContainText('+6 more')
  const drawn = () => boxes(page).then((laid) => laid.filter((box) => box.width > 0).map((box) => box.id))
  await expect.poll(drawn).toEqual(['t1', 't7', 't9'])
  await expect(grid(page).locator('[part="more"] c2-avatar')).toHaveCount(4)

  await more.click()
  await expect.poll(async () => (await events(page)).length).toBe(1)
  expect(
    await grid(page).evaluate(
      (element) =>
        new Promise((resolve) => {
          element.addEventListener('overflow-click', (event) => resolve((event as CustomEvent<{ hidden: Element[] }>).detail.hidden.map((tile) => tile.id)), {
            once: true,
          })
          ;(element.shadowRoot!.querySelector('[part="more"]') as HTMLElement).click()
        }),
    ),
  ).toEqual(['t2', 't3', 't4', 't5', 't6', 't8'])
  await more.focus()
  await page.keyboard.press('Enter')
  await expect.poll(async () => (await events(page)).length).toBe(3)

  await props(grid(page), { maxTiles: 0 })
  await expect(more).toHaveCount(0)
  await expect.poll(async () => (await drawn()).length).toBe(9)
  await accessible(page)
})

test('lays out c2-video-tile elements and follows the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-video-grid max-tiles="2"><c2-video-tile name="Ana Ruiz"></c2-video-tile><c2-video-tile name="Kenji Watanabe"></c2-video-tile><c2-video-tile name="Lea"></c2-video-tile></c2-video-grid></div>`,
  )
  await expect(page.getByRole('button', { name: 'Afficher 2 autres participants' })).toContainText('+2 autres')
  await expect
    .poll(() =>
      page
        .locator('c2-video-tile')
        .first()
        .evaluate((tile) => Math.round(tile.getBoundingClientRect().height)),
    )
    .toBe(200)
})
