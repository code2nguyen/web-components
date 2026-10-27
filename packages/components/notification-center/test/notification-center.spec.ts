import { test, expect, accessible, watch } from '../../../../tests/component-fixture'
import type { Page } from '@playwright/test'
import type { NotificationCenter } from '../src/notification-center'

const center = (page: Page) => page.locator('c2-notification-center')
const readState = (page: Page) =>
  center(page).evaluate((element: NotificationCenter) => Object.fromEntries(element.notifications.map((item) => [item.id, !!item.read])))
const ITEMS = `notifications='[
  {"id":"a","title":"Ana requested your review","body":"#388 Add bar list","time":"2026-10-14T09:58:00","avatar":{"name":"Ana Lima"}},
  {"id":"b","title":"Deploy succeeded","time":"2026-10-14T08:00:00","read":true,"href":"#deploy"},
  {"id":"c","title":"Ben commented","body":"Looks good","time":"2026-10-13T16:00:00","avatar":{"name":"Ben Ode"}},
  {"id":"d","title":"Weekly digest","time":"2026-10-01T09:00:00","read":true}
]'`

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-14T10:00:00'))
})

test('lists the notifications by day, newest first, unread ones named as such, with the unread count', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notification-center ${ITEMS}></c2-notification-center>`)
  await expect(center(page)).toHaveHostAria('role', 'region')
  await expect(center(page)).toHaveHostAria('aria-label', 'Notifications')
  await expect(page.getByRole('list', { name: 'Today' }).getByRole('button', { name: 'Unread: Ana requested your review' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Today' }).getByRole('link', { name: 'Deploy succeeded' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Yesterday' }).getByRole('button', { name: 'Unread: Ben commented' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Thursday, October 1' })).toBeVisible()
  await expect(center(page).locator('c2-badge')).toHaveAttribute('aria-label', '2 unread')
  await expect(center(page).locator('[part="time"]').first()).toHaveText(/2 min/)
  await accessible(page)
})

test('activating an item fires notification-click and marks it read; the toggle marks it unread again', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notification-center ${ITEMS}></c2-notification-center>`)
  await watch(center(page), 'read-change')
  await page.getByRole('button', { name: 'Unread: Ana requested your review' }).click()
  expect((await readState(page)).a).toBe(true)
  await expect(page.getByRole('button', { name: 'Ana requested your review', exact: true })).toBeVisible()
  await page.getByRole('listitem').filter({ hasText: 'Ana requested' }).getByRole('button', { name: 'Mark as unread' }).click()
  expect((await readState(page)).a).toBe(false)
  expect(JSON.parse((await center(page).getAttribute('data-events'))!)).toEqual([
    { ids: ['a'], read: true },
    { ids: ['a'], read: false },
  ])
})

test('a cancelled notification-click keeps the item unread and stops the link', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notification-center ${ITEMS}></c2-notification-center>`)
  await center(page).evaluate((element: NotificationCenter) => element.addEventListener('notification-click', (event) => event.preventDefault()))
  await page.getByRole('button', { name: 'Unread: Ben commented' }).click()
  expect((await readState(page)).c).toBe(false)
  await page.getByRole('link', { name: 'Deploy succeeded' }).click()
  expect(page.url()).not.toContain('#deploy')
})

test('mark all as read, the Unread filter and its empty state, and Load more', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-notification-center has-more ${ITEMS}></c2-notification-center>`)
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unread', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(center(page).locator('.item')).toHaveCount(2)
  await page.getByRole('button', { name: 'Mark all as read' }).click()
  expect(Object.values(await readState(page))).toEqual([true, true, true, true])
  await expect(page.getByRole('status')).toHaveText('All notifications marked as read')
  await expect(center(page).locator('[part="empty"]')).toHaveText('You’re all caught up')
  await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  await watch(center(page), 'load-more')
  await page.getByRole('button', { name: 'Load more' }).click()
  expect(JSON.parse((await center(page).getAttribute('data-events'))!)).toEqual([null])
  await accessible(page)
})

test('the text follows the page language', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-notification-center ${ITEMS}></c2-notification-center></div>`)
  await expect(page.getByRole('list', { name: 'Aujourd’hui' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Hier' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Non lue : Ben commented' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tout marquer comme lu' })).toBeVisible()
})

test('numeric ids work and survive a read change, the filter switch is announced, and the unread count is read', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-notification-center group-by="none" notifications='[{"id":1,"title":"One","time":"2026-10-14T09:00:00"},{"id":2,"title":"Two","time":"2026-10-14T08:00:00"},{"title":"No id"}]'></c2-notification-center>`,
  )
  await expect(center(page).locator('.visually-hidden').first()).toHaveText('2 unread')
  await page.getByRole('button', { name: 'Unread: One' }).click()
  expect(await center(page).evaluate((element: NotificationCenter) => element.notifications.length)).toBe(3)
  expect(await readState(page)).toMatchObject({ 1: true, 2: false })
  await watch(center(page), 'filter-change')
  await page.getByRole('button', { name: 'Unread', exact: true }).click()
  expect(JSON.parse((await center(page).getAttribute('data-events'))!)).toEqual([{ filter: 'unread' }])
})
