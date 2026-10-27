import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { ReactionBar } from '../src/reaction-bar'

const bar = (page: Page) => page.locator('c2-reaction-bar')
const events = async (page: Page) => JSON.parse((await bar(page).getAttribute('data-events')) ?? '[]')
const REACTIONS = `reactions='[{"emoji":"👍","count":3,"reacted":true},{"emoji":"🎉","count":1}]'`

test('each reaction is a toggle named after its emoji and count, pressed when you reacted', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reaction-bar ${REACTIONS}></c2-reaction-bar>`)
  await expect(bar(page)).toHaveHostAria('role', 'group')
  await expect(bar(page)).toHaveHostAria('aria-label', 'Reactions')
  await expect(page.getByRole('button', { name: '👍, 3 reactions' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '🎉, 1 reaction' })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Add reaction' })).toBeVisible()
  await accessible(page)
})

test('pressing a reaction adds or removes yours; one that reaches zero goes away', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reaction-bar ${REACTIONS}></c2-reaction-bar>`)
  await watch(bar(page), 'reaction-change')
  await page.getByRole('button', { name: '🎉, 1 reaction' }).click()
  await expect(page.getByRole('button', { name: '🎉, 2 reactions' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '🎉, 2 reactions' }).click()
  await page.getByRole('button', { name: '🎉, 1 reaction' }).click()
  await page.getByRole('button', { name: '🎉, 2 reactions' }).click()
  expect((await events(page)).at(0)).toEqual({ emoji: '🎉', reacted: true, count: 2 })

  await page.getByRole('button', { name: '👍, 3 reactions' }).click()
  await expect(page.getByRole('button', { name: '👍, 2 reactions' })).toHaveAttribute('aria-pressed', 'false')
  await bar(page).evaluate((element: ReactionBar) => {
    element.reactions = [{ emoji: '🙏', count: 1, reacted: true }]
  })
  await page.getByRole('button', { name: '🙏, 1 reaction' }).click()
  await expect(page.locator('c2-reaction-bar [part="reaction"]')).toHaveCount(0)
})

test('cancelling reaction-change leaves the reactions as they were', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reaction-bar ${REACTIONS}></c2-reaction-bar>`)
  await bar(page).evaluate((element) => element.addEventListener('reaction-change', (event) => event.preventDefault()))
  await page.getByRole('button', { name: '🎉, 1 reaction' }).click()
  await expect(page.getByRole('button', { name: '🎉, 1 reaction' })).toHaveAttribute('aria-pressed', 'false')
})

test('the add button opens the quick reactions; one adds a reaction, closes the popup and returns focus', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reaction-bar ${REACTIONS} quick="👍 🔥 👀"></c2-reaction-bar>`)
  const add = page.getByRole('button', { name: 'Add reaction' })
  await add.click()
  const menu = page.getByRole('dialog', { name: 'Add reaction' })
  await expect(menu).toBeVisible()
  await expect(add).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.getByRole('button')).toHaveText(['👍', '🔥', '👀'])
  await expect(menu.getByRole('button', { name: '👍' })).toBeFocused()
  await accessible(page)
  await page.keyboard.press('Tab')
  await page.keyboard.press('Enter')
  await expect(menu).toBeHidden()
  await expect(add).toBeFocused()
  await expect(page.getByRole('button', { name: '🔥, 1 reaction' })).toHaveAttribute('aria-pressed', 'true')

  // Picking a reaction you already gave keeps it rather than taking it back.
  await add.click()
  await menu.getByRole('button', { name: '👍' }).click()
  await expect(page.getByRole('button', { name: '👍, 3 reactions' })).toHaveAttribute('aria-pressed', 'true')

  await add.click()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
})

test('an emoji picker in the picker slot adds what it picks', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reaction-bar ${REACTIONS}><c2-emoji-picker slot="picker"></c2-emoji-picker></c2-reaction-bar>`)
  await page.getByRole('button', { name: 'Add reaction' }).click()
  await page.getByRole('searchbox', { name: 'Search emoji' }).fill('rocket')
  await page.getByRole('searchbox', { name: 'Search emoji' }).press('Enter')
  await expect(page.getByRole('dialog', { name: 'Add reaction' })).toBeHidden()
  await expect(page.getByRole('button', { name: '🚀, 1 reaction' })).toHaveAttribute('aria-pressed', 'true')
})

test('with no quick reactions, the popup opens on its picker', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-reaction-bar quick=""><c2-emoji-picker slot="picker"></c2-emoji-picker></c2-reaction-bar>`)
  await page.getByRole('button', { name: 'Add reaction' }).click()
  await expect(page.getByRole('searchbox', { name: 'Search emoji' })).toBeFocused()
})

test('read-only reactions are not buttons and say whether you reacted, in the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-reaction-bar readonly ${REACTIONS}></c2-reaction-bar></div>`)
  await expect(page.locator('c2-reaction-bar').getByRole('button')).toHaveCount(0)
  await expect(page.getByRole('img', { name: '👍, 3 réactions, dont la vôtre' })).toBeVisible()
  await expect(page.getByRole('img', { name: '🎉, 1 réaction' })).toBeVisible()
  await expect(bar(page)).toHaveHostAria('aria-label', 'Réactions')
  await accessible(page)
})
