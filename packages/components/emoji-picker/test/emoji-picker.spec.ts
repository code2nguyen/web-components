import { test, expect, accessible, watch, props } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'

const picker = (page: Page) => page.locator('c2-emoji-picker')
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search emoji' })
const events = async (page: Page) => JSON.parse((await picker(page).getAttribute('data-events')) ?? '[]')

test('lists the emoji by category, each a button named after its emoji, under a named group', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-emoji-picker></c2-emoji-picker>`)
  await expect(picker(page)).toHaveHostAria('role', 'group')
  await expect(picker(page)).toHaveHostAria('aria-label', 'Emoji picker')
  await expect(page.getByRole('group', { name: 'Emoji categories' }).getByRole('button')).toHaveCount(9)
  await expect(page.getByRole('button', { name: 'Smileys & emotion' })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('button', { name: 'grinning face', exact: true })).toHaveText('😀')
  expect(await page.locator('c2-emoji-picker button.emoji').count()).toBeGreaterThan(1800)
  // One tab stop in the grid: the first emoji.
  await expect(page.locator('c2-emoji-picker button.emoji[tabindex="0"]')).toHaveCount(1)
  await accessible(page)
})

test('searching matches the start of a word of a name or keyword, and Enter picks the first match', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-emoji-picker></c2-emoji-picker>`)
  await watch(picker(page), 'emoji-select')
  await search(page).fill('pizz')
  await expect(page.getByRole('group', { name: 'Emoji categories' })).toHaveCount(0)
  await expect(page.locator('c2-emoji-picker [part="section-title"]')).toHaveText(['Search results'])
  await expect(page.locator('c2-emoji-picker button.emoji').first()).toHaveAccessibleName('pizza')
  await expect(page.getByRole('status')).toHaveText(/^\d+ emoji found$/)
  await search(page).press('Enter')
  expect(await events(page)).toEqual([{ emoji: '🍕', base: '🍕', name: 'pizza', skinTone: 0 }])

  await search(page).fill('zzqx')
  await expect(page.locator('c2-emoji-picker [part="empty"]')).toHaveText('No emoji found for “zzqx”')
  await accessible(page)
})

test('the arrow keys walk the grid by position and Enter picks; the pick is listed under Recently used', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-emoji-picker></c2-emoji-picker>`)
  await watch(picker(page), 'emoji-select')
  await search(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'grinning face', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('c2-emoji-picker button.emoji[data-index="1"]')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  // Nine to a row by default.
  await expect(page.locator('c2-emoji-picker button.emoji[data-index="10"]')).toBeFocused()
  await expect(page.locator('c2-emoji-picker [part="preview"]')).toContainText(
    (await page.locator('c2-emoji-picker button.emoji[data-index="10"]').getAttribute('aria-label')) ?? '',
  )
  await page.keyboard.press('Enter')
  const [picked] = await events(page)
  await expect(page.locator('c2-emoji-picker [part="section-title"]').first()).toHaveText('Recently used')
  await expect(page.locator('c2-emoji-picker section[data-section="recent"] button.emoji')).toHaveText([picked.emoji])
  // Focus stays on the emoji picked, now one row further down.
  await expect(page.locator('c2-emoji-picker button.emoji:focus')).toHaveText(picked.emoji)
  await page.keyboard.press('Home')
  await expect(page.locator('c2-emoji-picker button.emoji[data-index="0"]')).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(search(page)).toBeFocused()
})

test('a skin tone applies to the emoji that have one, and is stored with the recent emoji under storage-key', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-emoji-picker storage-key="test-emoji-${Date.now()}"></c2-emoji-picker>`)
  const key = (await picker(page).getAttribute('storage-key'))!
  await watch(picker(page), 'emoji-select')
  await page.getByRole('button', { name: 'Skin tone: Default' }).click()
  await page.getByRole('radio', { name: 'Medium', exact: true }).click()
  await expect(page.getByRole('radiogroup')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Skin tone: Medium' })).toBeFocused()
  await search(page).fill('waving hand')
  await expect(page.getByRole('button', { name: 'waving hand' })).toHaveText('👋🏽')
  await page.getByRole('button', { name: 'waving hand' }).click()
  expect(await events(page)).toEqual([{ emoji: '👋🏽', base: '👋', name: 'waving hand', skinTone: 3 }])
  expect(await page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null'), key)).toEqual({ recents: ['👋'], skinTone: 3 })

  // A new picker under the same key starts from what was stored.
  await renderScenario(`<c2-emoji-picker storage-key="${key}"></c2-emoji-picker>`)
  await expect(page.locator('c2-emoji-picker section[data-section="recent"] button.emoji')).toHaveText(['👋🏽'])
})

test('a category button scrolls to its section and marks it as the one in view', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-emoji-picker></c2-emoji-picker>`)
  await page.getByRole('button', { name: 'Flags', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Flags', exact: true })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('c2-emoji-picker [part="section-title"]', { hasText: 'Flags' })).toBeInViewport()
})

test('a set of its own replaces the default emoji, and the interface follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-emoji-picker></c2-emoji-picker></div>`)
  await props(picker(page), {
    emojis: [
      { emoji: ':shipit:', name: 'ship it', group: 'Équipe', keywords: ['deploy'] },
      { emoji: '🚀', name: 'fusée', group: 'Équipe' },
    ],
  })
  await expect(picker(page)).toHaveHostAria('aria-label', 'Sélecteur d’émojis')
  await expect(page.locator('c2-emoji-picker [part="section-title"]')).toHaveText(['Équipe'])
  await expect(page.locator('c2-emoji-picker button.emoji')).toHaveText([':shipit:', '🚀'])
  await page.getByRole('searchbox', { name: 'Rechercher un émoji' }).fill('depl')
  await expect(page.locator('c2-emoji-picker button.emoji')).toHaveText([':shipit:'])
  await expect(page.getByRole('status')).toHaveText('1 émoji trouvé')
})
