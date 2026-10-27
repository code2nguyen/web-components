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
  // A row holds as many emoji as fit: down from the second emoji is the second of the next row.
  const columns = await page
    .locator('c2-emoji-picker [part="grid"]')
    .first()
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
  const below = page.locator(`c2-emoji-picker button.emoji[data-index="${columns + 1}"]`)
  await expect(below).toBeFocused()
  await expect(page.locator('c2-emoji-picker [part="preview"]')).toContainText((await below.getAttribute('aria-label')) ?? '')
  await page.keyboard.press('Enter')
  const [picked] = await events(page)
  await expect(page.locator('c2-emoji-picker [part="section-title"]').first()).toHaveText('Recently used')
  await expect(page.getByRole('region', { name: 'Recently used' }).getByRole('button')).toHaveText([picked.emoji])
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
  await expect(page.getByRole('region', { name: 'Recently used' }).getByRole('button')).toHaveText(['👋🏽'])
})

test('a category button scrolls to its section and marks it as the one in view, wherever the picker sits', async ({ page, renderScenario }) => {
  await renderScenario(`<div style="height: 900px"></div><c2-emoji-picker></c2-emoji-picker>`)
  await picker(page).scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Flags', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Flags', exact: true })).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('c2-emoji-picker [part="section-title"]', { hasText: 'Flags' })).toBeInViewport()
  await page.getByRole('button', { name: 'Animals & nature' }).click()
  await expect(page.locator('c2-emoji-picker [part="section-title"]', { hasText: 'Animals & nature' })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'grinning face', exact: true })).not.toBeInViewport()
  await page.getByRole('button', { name: 'Smileys & emotion' }).click()
  await expect(page.getByRole('button', { name: 'grinning face', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Smileys & emotion' })).toHaveAttribute('aria-current', 'true')
})

test('the choice of skin tones closes when focus leaves it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-emoji-picker></c2-emoji-picker>`)
  await page.getByRole('button', { name: 'Skin tone: Default' }).click()
  await expect(page.getByRole('radiogroup', { name: 'Skin tone' })).toBeVisible()
  await search(page).click()
  await expect(page.getByRole('radiogroup', { name: 'Skin tone' })).toBeHidden()
  await expect(page.getByRole('button', { name: 'Skin tone: Default' })).toHaveAttribute('aria-expanded', 'false')
})

test('a set of its own replaces the default emoji, and the interface follows the language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-emoji-picker></c2-emoji-picker></div>`)
  await props(picker(page), {
    emojis: [
      { emoji: ':shipit:', name: 'ship it', group: 'Notre équipe', keywords: ['Deploy'] },
      { emoji: '🚀', name: 'fusée', group: 'Notre équipe' },
      { emoji: '⭐', name: 'étoile', group: 'recent' },
    ],
  })
  await expect(picker(page)).toHaveHostAria('aria-label', 'Sélecteur d’émojis')
  // A group of its own is titled by its id, and names its section even with spaces or a built-in section's id.
  await expect(page.locator('c2-emoji-picker [part="section-title"]')).toHaveText(['Notre équipe', 'recent'])
  await expect(page.getByRole('region', { name: 'Notre équipe' }).getByRole('button')).toHaveText([':shipit:', '🚀'])
  await expect(page.getByRole('region', { name: 'recent' }).getByRole('button')).toHaveText(['⭐'])
  await page.getByRole('searchbox', { name: 'Rechercher un émoji' }).fill('depl')
  await expect(page.locator('c2-emoji-picker button.emoji')).toHaveText([':shipit:'])
  await expect(page.getByRole('status')).toHaveText('1 émoji trouvé')
})
