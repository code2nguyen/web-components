import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { CommentThread, ThreadComment } from '../src/comment-thread'

const thread = (page: Page) => page.locator('c2-comment-thread')
const events = async (page: Page) => JSON.parse((await thread(page).getAttribute('data-events'))!)
const bodies = (page: Page) => thread(page).locator('[part="body"]')

const ANA = { id: 'ana', name: 'Ana Diaz' }
const BEN = { id: 'ben', name: 'Ben Ito' }
const COMMENTS = JSON.stringify([
  { id: 1, author: ANA, body: 'Should this be a token?', time: '2026-10-14T08:00:00Z' },
  { id: 2, author: BEN, body: '@Ana yes, the medium radius.', time: '2026-10-14T09:00:00Z' },
  { id: 3, author: ANA, body: 'Done.\nThanks!', time: '2026-10-14T09:30:00Z' },
])

const scenario = (attributes = '', user = BEN, lang = 'en') =>
  `<div lang="${lang}"><c2-comment-thread quote="the medium radius" current-user='${JSON.stringify(user)}' comments='${COMMENTS}' ${attributes}></c2-comment-thread></div>`

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00Z'))
})

test('shows the quote, the comments as articles with mentions, and edit and delete on your own comments only', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await expect(thread(page)).toHaveHostAria('role', 'region')
  await expect(thread(page)).toHaveHostAria('aria-label', 'Comment thread')
  await expect(thread(page).locator('[part="quote"]')).toContainText('the medium radius')
  await expect(page.getByRole('article')).toHaveCount(3)
  await expect(page.getByRole('article').first()).toHaveAccessibleName(/^Ana Diaz, /)
  await expect(thread(page).locator('[part="mention"]')).toHaveText(['@Ana'])
  await expect(bodies(page).nth(2)).toHaveText('Done.\nThanks!')
  await expect(page.getByRole('button', { name: "Edit Ben Ito's comment" })).toHaveCount(1)
  await expect(page.getByRole('button', { name: "Edit Ana Diaz's comment" })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Resolve' })).toBeVisible()
  await accessible(page)
})

test('a reply fires comment-add and is appended; Ctrl+Enter sends too; a cancelled one is not appended', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await watch(thread(page), 'comment-add')
  const composer = page.getByRole('textbox', { name: 'Reply…' })
  await composer.fill('Looks good')
  await page.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(bodies(page)).toHaveCount(4)
  await expect(bodies(page).last()).toHaveText('Looks good')
  await expect(composer).toHaveValue('')
  await thread(page).evaluate((element: CommentThread) => element.addEventListener('comment-add', (event) => event.preventDefault()))
  await composer.fill('Second thought')
  await composer.press('Control+Enter')
  expect(await events(page)).toEqual([{ body: 'Looks good' }, { body: 'Second thought' }])
  await expect(bodies(page)).toHaveCount(4)
  const added = await thread(page).evaluate((element: CommentThread) => element.comments.at(-1) as ThreadComment)
  expect(added).toMatchObject({ author: BEN, body: 'Looks good' })
  expect(String(added.id)).toMatch(/^local-/)
})

test('editing your comment fires comment-edit and marks it edited; Escape cancels', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await watch(thread(page), 'comment-edit')
  await page.getByRole('button', { name: "Edit Ben Ito's comment" }).click()
  const editor = page.getByRole('textbox', { name: 'Edit comment' })
  await expect(editor).toBeFocused()
  await editor.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('button', { name: "Edit Ben Ito's comment" })).toBeFocused()
  await page.getByRole('button', { name: "Edit Ben Ito's comment" }).click()
  await page.getByRole('textbox', { name: 'Edit comment' }).fill('@Ana yes, --c2-theme--radius-md.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(bodies(page).nth(1)).toHaveText('@Ana yes, --c2-theme--radius-md.')
  await expect(thread(page).locator('[part="time"]').nth(1)).toContainText('edited')
  expect(await events(page)).toEqual([{ id: 2, body: '@Ana yes, --c2-theme--radius-md.' }])
})

test('deleting asks first, then fires comment-delete and removes the reply', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await watch(thread(page), 'comment-delete')
  await page.getByRole('button', { name: "Delete Ben Ito's comment" }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  expect(await events(page)).toEqual([{ id: 2 }])
})

test('resolving folds the thread to its first comment; reopening unfolds it', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await watch(thread(page), 'resolve-change')
  await page.getByRole('button', { name: 'Resolve' }).click()
  await expect(thread(page)).toHaveAttribute('resolved', '')
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(thread(page)).toContainText('Resolved · 2 replies')
  await expect(page.getByRole('textbox', { name: 'Reply…' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Reopen' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
  expect(await events(page)).toEqual([{ resolved: true }, { resolved: false }])
})

test('a long thread folds its middle; without a current user it is read-only; text follows the language', async ({ page, renderScenario }) => {
  const many = JSON.stringify(
    Array.from({ length: 7 }, (_, at) => ({ id: at + 1, author: at % 2 ? BEN : ANA, body: `Comment ${at + 1}`, time: '2026-10-14T09:00:00Z' })),
  )
  await renderScenario(`<div lang="fr"><c2-comment-thread comments='${many}'></c2-comment-thread></div>`)
  await expect(bodies(page)).toHaveText(['Comment 1', 'Comment 2', 'Comment 6', 'Comment 7'])
  await page.getByRole('button', { name: 'Afficher 3 réponses précédentes' }).click()
  await expect(bodies(page)).toHaveCount(7)
  await expect(page.getByRole('textbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Résoudre' })).toHaveCount(0)
  await expect(thread(page)).toHaveHostAria('aria-label', 'Fil de commentaires')
})

test('reactions are re-fired with the comment id and kept on the comment', async ({ page, renderScenario }) => {
  await renderScenario(
    scenario(`reactions`).replace(`"body":"Should this be a token?"`, `"body":"Should this be a token?","reactions":[{"emoji":"👍","count":1}]`),
  )
  await watch(thread(page), 'reaction-change')
  await page.getByRole('article').first().getByRole('button', { name: /👍/ }).click()
  expect(await events(page)).toEqual([{ id: 1, emoji: '👍', reacted: true, count: 2 }])
  expect(await thread(page).evaluate((element: CommentThread) => element.comments[0].reactions)).toEqual([{ emoji: '👍', count: 2, reacted: true }])
})

test('unfolding replies moves focus to the first one shown; a small collapse-after never folds three replies', async ({ page, renderScenario }) => {
  const many = JSON.stringify(
    Array.from({ length: 6 }, (_, at) => ({ id: at + 1, author: at % 2 ? BEN : ANA, body: `Comment ${at + 1}`, time: '2026-10-14T09:00:00Z' })),
  )
  await renderScenario(`<c2-comment-thread comments='${many}'></c2-comment-thread><c2-comment-thread collapse-after="1" comments='${COMMENTS}'></c2-comment-thread>`)
  await page.getByRole('button', { name: 'Show 2 earlier replies' }).click()
  await expect(page.locator('c2-comment-thread').first().locator('[data-id="3"]')).toBeFocused()
  await expect(page.locator('c2-comment-thread').nth(1).locator('[part="body"]')).toHaveCount(3)
})

test('a cancelled reply is not announced; deleting a reply returns focus to the reply box', async ({ page, renderScenario }) => {
  await renderScenario(scenario())
  await thread(page).evaluate((element: CommentThread) => element.addEventListener('comment-add', (event) => event.preventDefault(), { once: true }))
  await page.getByRole('textbox', { name: 'Reply…' }).fill('Held for the server')
  await page.getByRole('button', { name: 'Reply', exact: true }).click()
  await page.waitForTimeout(200)
  await expect(thread(page).locator('[role="status"]')).toHaveText('')
  await page.getByRole('button', { name: "Delete Ben Ito's comment" }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Reply…' })).toBeFocused()
})
