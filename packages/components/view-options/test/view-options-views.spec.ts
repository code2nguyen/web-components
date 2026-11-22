import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const VIEWS = [
  { id: 'mine', name: 'My open bugs', value: { layout: 'list', groupBy: 'status', orderBy: [{ field: 'priority', direction: 'desc' }] } },
  { id: 'triage', name: 'Triage board', value: { layout: 'board', groupBy: 'priority' } },
  { id: 'team', name: 'Team backlog', value: { layout: 'list', groupBy: 'assignee' }, shared: true, locked: true },
]

const fields = `
  <c2-view-field field="status" label="Status" groupable orderable property></c2-view-field>
  <c2-view-field field="priority" label="Priority" groupable orderable property></c2-view-field>
  <c2-view-field field="assignee" label="Assignee" groupable property></c2-view-field>`

const issues = (attributes = '') =>
  `<c2-view-options layouts="list board" views='${JSON.stringify(VIEWS)}' view-id="mine" value='${JSON.stringify(VIEWS[0].value)}' ${attributes}>${fields}</c2-view-options>`

const host = (page: Page) => page.locator('c2-view-options')
const trigger = (page: Page) => host(page).locator('#default-trigger')
const panel = (page: Page) => page.getByRole('dialog', { name: 'Display options' })
const views = (page: Page) => host(page).locator('c2-select.view-select')
const action = (page: Page, name: string) => host(page).locator(`c2-button.${name}`)
const events = (page: Page) => host(page).evaluate((element) => JSON.parse(element.getAttribute('data-events') ?? '[]'))

async function openPanel(page: Page) {
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
}

test('the trigger reads the current view, the Views section lists mine then shared, and picking one applies it', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await watch(host(page), 'view-select')
  await expect(trigger(page)).toContainText('My open bugs')
  await openPanel(page)
  await expect(views(page).locator('c2-list-item')).toHaveText([/My open bugs/, /Triage board/, /Team backlog\s*Shared/])
  await expect(host(page).locator('[part="modified"]')).toHaveCount(0)
  await views(page).click()
  await views(page).locator('c2-list-item', { hasText: 'Triage board' }).click()
  await expect(host(page)).toHaveJSProperty('viewId', 'triage')
  const value = await host(page).evaluate((element: HTMLElement & { value: { layout: string; groupBy: string } }) => [
    element.value.layout,
    element.value.groupBy,
  ])
  expect(value).toEqual(['board', 'priority'])
  expect((await events(page)).map((detail: { id: string }) => detail.id)).toEqual(['triage'])
  await accessible(page)
})

test('an edit marks the view modified, and Save fires view-save with the view and the value', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await watch(host(page), 'view-save')
  await openPanel(page)
  await expect(action(page, 'view-save')).toHaveAttribute('disabled', '')
  await host(page).evaluate((element: HTMLElement & { value: object }) => (element.value = { layout: 'list', groupBy: 'assignee' }))
  await expect(host(page).locator('[part="modified"]')).toHaveText('Modified')
  await expect(trigger(page).locator('[part="changed"]')).toHaveCount(1)
  const modified = await host(page).evaluate((element) => (element as unknown as { modified: boolean }).modified)
  expect(modified).toBe(true)
  await action(page, 'view-save').click()
  const [saved] = await events(page)
  expect(saved).toMatchObject({ id: 'mine', name: 'My open bugs', value: { layout: 'list', groupBy: 'assignee' } })
})

test('Save as and Rename ask for a name in a field loaded on first use, Enter confirms and Escape cancels without closing', async ({
  page,
  renderScenario,
}) => {
  await renderScenario(issues())
  await host(page).evaluate((element) => {
    const fired: unknown[] = []
    for (const type of ['view-save', 'view-rename'])
      element.addEventListener(type, (event) => {
        const { id, name } = (event as CustomEvent<{ id: string | null; name: string }>).detail
        fired.push([type, id, name])
        element.setAttribute('data-events', JSON.stringify(fired))
      })
  })
  await openPanel(page)
  const loaded = await page.evaluate(() => customElements.get('c2-text-field') !== undefined)
  expect(loaded).toBe(false)
  await action(page, 'view-save-as').click()
  const field = host(page).locator('c2-text-field.view-name')
  await expect(field).toBeVisible()
  await expect(field).toBeFocused()
  await page.keyboard.type('Bugs by priority')
  await page.keyboard.press('Enter')
  await action(page, 'view-rename').click()
  await expect(field).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
  await expect(panel(page)).toBeVisible()
  await action(page, 'view-rename').click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Open bugs')
  await action(page, 'view-confirm').click()
  expect(await events(page)).toEqual([
    ['view-save', null, 'Bugs by priority'],
    ['view-rename', 'mine', 'Open bugs'],
  ])
})

test('a locked view cannot be saved over, renamed or deleted, but can be copied; Delete fires view-delete', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await watch(host(page), 'view-delete')
  await openPanel(page)
  await action(page, 'view-delete').click()
  expect((await events(page))[0]).toEqual({ id: 'mine' })
  await host(page).evaluate((element: HTMLElement & { viewId: string }) => (element.viewId = 'team'))
  for (const name of ['view-save', 'view-rename', 'view-delete']) await expect(action(page, name)).toHaveAttribute('disabled', '')
  await expect(action(page, 'view-save-as')).not.toHaveAttribute('disabled', '')
})

test('without views there is no Views section and the trigger reads Display', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-view-options layouts="list board">${fields}</c2-view-options>`)
  await expect(trigger(page)).toContainText('Display')
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  await expect(host(page).locator('.views')).toHaveCount(0)
})

test('the name field has a name, focus goes back to the action after Escape or Enter, and Revert discards the edits', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await watch(host(page), 'view-rename')
  await openPanel(page)
  await action(page, 'view-save-as').click()
  await expect(page.getByRole('textbox', { name: 'View name' })).toBeFocused()
  await accessible(page)
  await page.keyboard.press('Escape')
  await expect(action(page, 'view-save-as')).toBeFocused()

  // Rename keeps the view it started on, even if the app moves view-id before the name is confirmed.
  await action(page, 'view-rename').click()
  await host(page).evaluate((element: HTMLElement & { viewId: string }) => (element.viewId = 'triage'))
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Bugs')
  await page.keyboard.press('Enter')
  expect(await events(page)).toEqual([{ id: 'mine', name: 'Bugs' }])
  await expect(action(page, 'view-rename')).toBeFocused()

  await host(page).evaluate((element: HTMLElement & { viewId: string; value: object }) => {
    element.viewId = 'mine'
    element.value = { layout: 'board', groupBy: 'assignee' }
  })
  await expect(host(page).locator('[part="modified"]')).toBeVisible()
  await action(page, 'view-revert').click()
  await expect(host(page).locator('[part="modified"]')).toHaveCount(0)
  const layout = await host(page).evaluate((element: HTMLElement & { value: { layout: string } }) => element.value.layout)
  expect(layout).toBe('list')
})
