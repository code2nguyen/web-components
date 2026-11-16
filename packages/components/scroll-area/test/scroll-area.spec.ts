import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Area = HTMLElement & { viewport: HTMLElement; scrollToEdge(edge: string): void }

const area = (page: Page) => page.locator('c2-scroll-area')
const frame = (page: Page) => area(page).locator('.frame')
const viewport = (page: Page) => area(page).locator('.viewport')
const events = async (page: Page) => JSON.parse((await area(page).getAttribute('data-events'))!)
const rows = (count: number) => Array.from({ length: count }, (_, at) => `<p style="margin: 0; height: 40px">Row ${at + 1}</p>`).join('')

test('a scrolling area is a named region with a tab stop; shadows mark the edges with more beyond them', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area label="Members" style="--c2-scroll-area--max-height: 200px">${rows(20)}</c2-scroll-area>`)
  const region = page.getByRole('region', { name: 'Members' })
  await expect(region).toHaveAttribute('tabindex', '0')
  await expect(frame(page)).toHaveClass(/more-bottom/)
  await expect(frame(page)).not.toHaveClass(/more-top/)
  await region.evaluate((viewport: HTMLElement) => (viewport.scrollTop = 200))
  await expect(frame(page)).toHaveClass(/more-top/)
  await expect(frame(page)).toHaveClass(/more-bottom/)
  await accessible(page)
})

test('reaching an edge fires scroll-edge once per arrival; scrollToEdge jumps there', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area style="--c2-scroll-area--max-height: 200px">${rows(20)}</c2-scroll-area>`)
  await watch(area(page), 'scroll-edge')
  await area(page).evaluate((element: Area) => element.scrollToEdge('bottom'))
  await expect(frame(page)).not.toHaveClass(/more-bottom/)
  await expect.poll(() => events(page)).toEqual([{ edge: 'bottom' }])
  await area(page).evaluate((element: Area) => element.scrollToEdge('top'))
  await expect.poll(() => events(page)).toEqual([{ edge: 'bottom' }, { edge: 'top' }])
  await expect(frame(page)).not.toHaveClass(/more-top/)
})

test('content that fits shows no shadow and fires nothing; a horizontal area tracks the inline edges; text follows the language', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(`<div lang="fr"><c2-scroll-area style="--c2-scroll-area--max-height: 400px">${rows(3)}</c2-scroll-area>
    <c2-scroll-area orientation="horizontal" id="wide"><div style="width: 2000px; height: 40px">Wide</div></c2-scroll-area></div>`)
  await expect(frame(page).first()).not.toHaveClass(/more-/)
  await expect(page.getByRole('group', { name: 'Contenu défilant' })).toHaveCount(2)
  await expect(page.locator('#wide .frame')).toHaveClass(/more-end/)
  await expect(page.locator('#wide .frame')).not.toHaveClass(/more-bottom/)
})

test('a fade size masks the edges with more beyond them', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area style="--c2-scroll-area--max-height: 200px; --c2-scroll-area__fade--size: 24px">${rows(20)}</c2-scroll-area>`)
  const mask = await area(page).evaluate((element: Area) => getComputedStyle(element.viewport).maskImage)
  expect(mask).toContain('linear-gradient')
})

const cards = (count: number) =>
  `<div style="display: flex; gap: 8px; width: max-content">${Array.from(
    { length: count },
    (_, at) => `<a href="#card-${at + 1}" style="display: block; width: 120px; height: 80px">Card ${at + 1}</a>`,
  ).join('')}</div>`
const scrollLeft = (page: Page, selector = 'c2-scroll-area') =>
  page.locator(selector).evaluate((element: Area) => Math.round(Math.abs(element.viewport.scrollLeft)))
const control = (page: Page, edge: string) => area(page).locator(`.control--${edge}`)

test('without controls or mouse-drag nothing is added: no button, no drag listener, a press and move only selects', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area orientation="horizontal" style="width: 300px">${cards(10)}</c2-scroll-area>`)
  await expect(area(page).locator('button')).toHaveCount(0)
  await expect(viewport(page)).not.toHaveClass(/draggable/)
  const box = (await area(page).boundingBox())!
  await page.mouse.move(box.x + 250, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, box.y + 40, { steps: 5 })
  await page.mouse.up()
  expect(await scrollLeft(page)).toBe(0)
})

test('controls show on the edges with more beyond them, scroll most of a page, and hide at the ends', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-scroll-area controls orientation="horizontal" style="width: 300px">${cards(6)}</c2-scroll-area>`)
  const forward = page.getByRole('button', { name: 'Scroll forward' })
  await expect(forward).toBeVisible()
  await expect(control(page, 'start')).toBeHidden()
  await expect(control(page, 'top')).toBeHidden()
  await expect(control(page, 'bottom')).toBeHidden()
  await forward.click()
  await expect.poll(() => scrollLeft(page)).toBe(240)
  const back = page.getByRole('button', { name: 'Scroll back' })
  await expect(back).toBeVisible()
  await forward.click()
  // The last page reaches the end: its button hides and focus, which the click gave it, moves to the area.
  await expect(control(page, 'end')).toBeHidden()
  await expect(area(page).locator('.viewport')).toBeFocused()
  await back.click()
  await expect(forward).toBeVisible()
  await accessible(page)
})

test('the controls stay out of the tab order: the area is the one tab stop, and its keys scroll it', async ({ page, renderScenario }) => {
  await renderScenario(
    `<button id="before">Before</button><c2-scroll-area controls orientation="horizontal" label="Shelf" style="width: 300px">${cards(6)}</c2-scroll-area><button id="after">After</button>`,
  )
  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('region', { name: 'Shelf' })).toBeFocused()
  await page.keyboard.press('Tab')
  // The links in the cards come next, never the controls.
  await expect(page.getByRole('link', { name: 'Card 1' })).toBeFocused()
})

test('a vertical area puts its controls on the top and bottom edges', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-scroll-area controls style="--c2-scroll-area--max-height: 200px">${rows(20)}</c2-scroll-area>`)
  await expect(page.getByRole('button', { name: 'Scroll down' })).toBeVisible()
  await expect(control(page, 'top')).toBeHidden()
  await expect(control(page, 'end')).toBeHidden()
  await page.getByRole('button', { name: 'Scroll down' }).click()
  await expect.poll(() => area(page).evaluate((element: Area) => element.viewport.scrollTop)).toBe(160)
  await expect(page.getByRole('button', { name: 'Scroll up' })).toBeVisible()
})

test('in a right-to-left area, forward scrolls towards the left and sits on the left edge', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<div dir="rtl"><c2-scroll-area controls orientation="horizontal" style="width: 300px">${cards(6)}</c2-scroll-area></div>`)
  const forward = page.getByRole('button', { name: 'Scroll forward' })
  const areaBox = (await area(page).boundingBox())!
  const buttonBox = (await forward.boundingBox())!
  expect(buttonBox.x).toBeLessThan(areaBox.x + areaBox.width / 2)
  await forward.click()
  await expect.poll(() => area(page).evaluate((element: Area) => element.viewport.scrollLeft)).toBe(-240)
})

test('scrollPage scrolls like a control, and the control text follows the language', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<div lang="fr"><c2-scroll-area controls orientation="horizontal" style="width: 300px">${cards(6)}</c2-scroll-area></div>`)
  await area(page).evaluate((element: Area & { scrollPage(edge: string): void }) => element.scrollPage('end'))
  expect(await scrollLeft(page)).toBe(240)
  await expect(page.getByRole('button', { name: 'Défiler vers l’avant' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Défiler vers l’arrière' })).toBeVisible()
})

test('mouse-drag scrolls with the mouse, and the click that ends a drag does not follow a link', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area mouse-drag orientation="horizontal" style="width: 300px">${cards(10)}</c2-scroll-area>`)
  await expect(viewport(page)).toHaveClass(/draggable/)
  const box = (await area(page).boundingBox())!
  // The press lands on the link of card 3.
  await page.mouse.move(box.x + 260, box.y + 40)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 40, { steps: 5 })
  await expect(viewport(page)).toHaveClass(/dragging/)
  await page.mouse.up()
  await expect(viewport(page)).not.toHaveClass(/dragging/)
  expect(await scrollLeft(page)).toBe(200)
  expect(new URL(page.url()).hash).toBe('')
  // A plain click, without moving, still reaches the link.
  await page.getByRole('link', { name: 'Card 3' }).click()
  expect(new URL(page.url()).hash).toBe('#card-3')
})

test('mouse-drag leaves a field alone and moves only the axes that scroll', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-scroll-area mouse-drag style="--c2-scroll-area--max-height: 200px; width: 300px"><input aria-label="Note" style="width: 280px" />${rows(20)}</c2-scroll-area>`,
  )
  // The drag module loads the first time mouse-drag is on.
  await expect(viewport(page)).toHaveClass(/draggable/)
  const input = (await page.getByRole('textbox', { name: 'Note' }).boundingBox())!
  await page.mouse.move(input.x + 10, input.y + input.height / 2)
  await page.mouse.down()
  await page.mouse.move(input.x + 10, input.y - 150, { steps: 5 })
  await page.mouse.up()
  expect(await area(page).evaluate((element: Area) => element.viewport.scrollTop)).toBe(0)
  const box = (await area(page).boundingBox())!
  await page.mouse.move(box.x + 150, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, box.y + 30, { steps: 5 })
  await page.mouse.up()
  expect(await area(page).evaluate((element: Area) => element.viewport.scrollTop)).toBe(150)
  expect(await scrollLeft(page)).toBe(0)
  // Turned off, it lets go of the viewport: a press and move no longer scrolls.
  await area(page).evaluate((element: HTMLElement) => element.removeAttribute('mouse-drag'))
  await expect(viewport(page)).not.toHaveClass(/draggable/)
  await page.mouse.move(box.x + 150, box.y + 180)
  await page.mouse.down()
  await page.mouse.move(box.x + 150, box.y + 80, { steps: 5 })
  await page.mouse.up()
  expect(await area(page).evaluate((element: Area) => element.viewport.scrollTop)).toBe(150)
})

test('mouse-drag leaves the scrollbar to the browser, and a press released outside the area does not drag on a later hover', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(
    `<c2-scroll-area mouse-drag style="--c2-scroll-area--max-height: 200px; --c2-scroll-area__scrollbar--width: auto; --c2-scroll-area__scrollbar--size: 16px; width: 300px">${rows(20)}</c2-scroll-area>`,
  )
  await expect(viewport(page)).toHaveClass(/draggable/)
  const box = (await area(page).boundingBox())!
  const gutter = await area(page).evaluate((element: Area) => element.viewport.offsetWidth - element.viewport.clientWidth)
  // On the scrollbar: no drag starts, whatever the thumb does. A browser with overlay scrollbars (headless Chromium) has
  // no gutter to press.
  if (gutter > 0) {
    await page.mouse.move(box.x + box.width - gutter / 2, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - gutter / 2, box.y + 20, { steps: 5 })
    await expect(viewport(page)).not.toHaveClass(/dragging/)
    await page.mouse.up()
    await area(page).evaluate((element: Area) => element.scrollToEdge('top'))
  }
  // Pressed inside, moved out sideways before the threshold and released outside: the viewport never saw the release.
  await page.mouse.move(box.x + 100, box.y + 100)
  await page.mouse.down()
  await page.mouse.move(box.x + 100, box.y + 102)
  await page.mouse.move(box.x + 400, box.y + 102)
  await page.mouse.up()
  await page.mouse.move(box.x + 100, box.y + 30, { steps: 5 })
  await expect(viewport(page)).not.toHaveClass(/dragging/)
  expect(await area(page).evaluate((element: Area) => element.viewport.scrollTop)).toBe(0)
})

test('scrollPage leaves an axis the area does not scroll alone', async ({ page, renderScenario }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await renderScenario(`<c2-scroll-area style="--c2-scroll-area--max-height: 200px; width: 300px"><div style="width: 600px">${rows(20)}</div></c2-scroll-area>`)
  await area(page).evaluate((element: Area & { scrollPage(edge: string): void }) => element.scrollPage('end'))
  expect(await scrollLeft(page)).toBe(0)
  await area(page).evaluate((element: Area & { scrollPage(edge: string): void }) => element.scrollPage('bottom'))
  expect(await area(page).evaluate((element: Area) => element.viewport.scrollTop)).toBe(160)
})

test('content that loads later fires no scroll-edge; an area moved in the page keeps tracking its content', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="a"></div><div id="b"></div><c2-scroll-area style="--c2-scroll-area--max-height: 200px">${rows(2)}</c2-scroll-area>`)
  await watch(area(page), 'scroll-edge')
  await area(page).evaluate((element: HTMLElement, more) => element.insertAdjacentHTML('beforeend', more), rows(20))
  await expect(frame(page)).toHaveClass(/more-bottom/)
  await page.waitForTimeout(200)
  expect(await events(page)).toEqual([])
  await area(page).evaluate((element: HTMLElement) => {
    document.getElementById('b')!.append(element)
    element.replaceChildren()
  })
  await expect(frame(page)).not.toHaveClass(/more-bottom/)
})
