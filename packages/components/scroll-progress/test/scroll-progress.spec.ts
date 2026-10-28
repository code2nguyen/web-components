import { test, expect, accessible } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

type Progress = HTMLElement & { value: number }

const progress = (page: Page) => page.locator('c2-scroll-progress')

test('follows the page: a progress bar from 0 to 100 as the page scrolls', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-progress style="position: fixed; top: 0; left: 0; right: 0"></c2-scroll-progress><div style="height: 3000px"></div>`)
  await expect(progress(page)).toHaveHostAria('role', 'progressbar')
  await expect(progress(page)).toHaveHostAria('aria-label', 'Reading progress')
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '0')
  await page.evaluate(() => {
    const element = document.scrollingElement!
    window.scrollTo(0, (element.scrollHeight - element.clientHeight) / 2)
  })
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '50')
  expect(await progress(page).evaluate((element: Progress) => element.value)).toBeCloseTo(0.5, 1)
  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight))
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '100')
  await accessible(page)
})

test('for follows a c2-scroll-area: its viewport, not the page', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-scroll-progress for="article"></c2-scroll-progress>
    <c2-scroll-area id="article" style="--c2-scroll-area--max-height: 200px"><div style="height: 1200px">Long</div></c2-scroll-area>`)
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '0')
  await page.locator('c2-scroll-area').evaluate((element: HTMLElement & { scrollToEdge(edge: string): void }) => element.scrollToEdge('bottom'))
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '100')
})

test('a ring closes as it fills and holds its slotted centre; text follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-scroll-progress variant="ring" for="box"><span id="centre">↑</span></c2-scroll-progress>
    <div id="box" style="height: 200px; overflow: auto"><div style="height: 1000px"></div></div></div>`)
  await expect(page.locator('#centre')).toBeVisible()
  await expect(progress(page)).toHaveHostAria('aria-label', 'Progression de la lecture')
  await page.locator('#box').evaluate((box: HTMLElement) => (box.scrollTop = 400))
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '50')
  const drawn = await progress(page).evaluate((element: HTMLElement) =>
    getComputedStyle(element.shadowRoot!.querySelector('.ring')!).getPropertyValue('--_progress'),
  )
  expect(parseFloat(drawn)).toBeCloseTo(0.5, 1)
})

test('a for set right after insertion is the container followed', async ({ page, renderScenario }) => {
  await renderScenario(`<div id="box" style="height: 200px; overflow: auto"><div style="height: 1000px"></div></div><div style="height: 3000px"></div>`)
  await page.evaluate(() => {
    const element = document.createElement('c2-scroll-progress') as HTMLElement & { for: string }
    document.querySelector('main')!.prepend(element)
    element.for = 'box'
  })
  await page.evaluate(() => window.scrollTo(0, 1000))
  await page.locator('#box').evaluate((box: HTMLElement) => (box.scrollTop = 800))
  await expect(progress(page)).toHaveHostAria('aria-valuenow', '100')
})
