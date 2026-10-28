import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Area = HTMLElement & { viewport: HTMLElement; scrollToEdge(edge: string): void }

const area = (page: Page) => page.locator('c2-scroll-area')
const frame = (page: Page) => area(page).locator('.frame')
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
  await expect(page.getByRole('region', { name: 'Contenu défilant' })).toHaveCount(2)
  await expect(page.locator('#wide .frame')).toHaveClass(/more-end/)
  await expect(page.locator('#wide .frame')).not.toHaveClass(/more-bottom/)
})

test('a fade size masks the edges with more beyond them', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-area style="--c2-scroll-area--max-height: 200px; --c2-scroll-area__fade--size: 24px">${rows(20)}</c2-scroll-area>`)
  const mask = await area(page).evaluate((element: Area) => getComputedStyle(element.viewport).maskImage)
  expect(mask).toContain('linear-gradient')
})
