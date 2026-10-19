import type { Page } from '@playwright/test'
import { test, expect, watch, props, accessible } from '../../../../tests/component-fixture'

const fields = `
  <c2-view-field field="status" label="Status" groupable orderable property></c2-view-field>
  <c2-view-field field="priority" label="Priority" groupable orderable property></c2-view-field>
  <c2-view-field field="assignee" label="Assignee" groupable property></c2-view-field>
  <c2-view-field field="due" label="Due date" orderable property></c2-view-field>
  <c2-view-toggle key="completed" label="Completed issues"></c2-view-toggle>
  <c2-view-toggle key="sub" label="Sub-issues" checked></c2-view-toggle>`

const issues = (attributes = '') => `<c2-view-options layouts="list board table" ${attributes}>${fields}</c2-view-options>`

const trigger = (page: Page) => page.getByRole('button', { name: 'Display' })
const panel = (page: Page) => page.getByRole('dialog', { name: 'Display options' })
const host = (page: Page) => page.locator('c2-view-options')
const select = (page: Page, name: string) => page.locator(`c2-view-options c2-select.${name}`)
// Options state their role through ElementInternals, which getByRole cannot see: find them by text.
const option = (page: Page, name: string, text: string) => select(page, name).locator('c2-list-item', { hasText: text })
const lastEvent = (page: Page) => host(page).evaluate((element) => JSON.parse(element.getAttribute('data-events') ?? '[]').at(-1))

async function pick(page: Page, name: string, text: string) {
  await select(page, name).click()
  await option(page, name, text).click()
}

async function openPanel(page: Page) {
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
}

test('the Display button opens the panel, and Escape closes it and returns focus', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  await trigger(page).click()
  await expect(panel(page)).toBeVisible()
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true')
  await expect(host(page)).toHaveJSProperty('open', true)

  await page.keyboard.press('Escape')
  await expect(panel(page)).toBeHidden()
  await expect(host(page)).toHaveJSProperty('open', false)
  await expect(trigger(page)).toBeFocused()
})

test('a second press on the trigger closes the panel', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await openPanel(page)
  await trigger(page).click()
  await expect(panel(page)).toBeHidden()
})

test('a slotted trigger replaces the Display button', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-view-options>${fields}<button slot="trigger">View</button></c2-view-options>`)
  await expect(trigger(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'View' }).click()
  await expect(panel(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'View' })).toHaveAttribute('aria-expanded', 'true')
})

test('the layout switch changes the layout and, on a board, relabels grouping as columns and rows', async ({ page, renderScenario }) => {
  await renderScenario(issues(`value='{"groupBy":"status"}'`))
  await watch(host(page), 'view-change')
  await openPanel(page)
  await expect(panel(page).getByText('Grouping', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Board' }).click()
  await expect(page.getByRole('button', { name: 'Board' })).toHaveAttribute('aria-pressed', 'true')
  expect(await lastEvent(page)).toMatchObject({ changed: 'layout', value: { layout: 'board' } })
  await expect(panel(page).getByText('Columns', { exact: true })).toBeVisible()
  await expect(panel(page).getByText('Rows', { exact: true })).toBeVisible()
})

test('one layout or none hides the layout switch', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-view-options layouts="list">${fields}</c2-view-options>`)
  await openPanel(page)
  await expect(panel(page).locator('c2-button-group')).toHaveCount(0)
})

test('grouping offers sub-grouping by any other field, and No grouping clears both', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await watch(host(page), 'view-change')
  await openPanel(page)
  await expect(select(page, 'sub-group-by')).toHaveCount(0)

  await pick(page, 'group-by', 'Priority')
  expect(await lastEvent(page)).toMatchObject({ changed: 'groupBy', value: { groupBy: 'priority', subGroupBy: null } })
  await expect(select(page, 'sub-group-by')).toBeVisible()
  await expect(option(page, 'sub-group-by', 'Priority')).toHaveCount(0)

  await pick(page, 'sub-group-by', 'Assignee')
  expect(await lastEvent(page)).toMatchObject({ changed: 'subGroupBy', value: { groupBy: 'priority', subGroupBy: 'assignee' } })

  // Grouping by the sub-grouping field drops the sub-grouping rather than grouping twice by one field.
  await pick(page, 'group-by', 'Assignee')
  expect(await lastEvent(page)).toMatchObject({ value: { groupBy: 'assignee', subGroupBy: null } })

  await pick(page, 'group-by', 'No grouping')
  expect(await lastEvent(page)).toMatchObject({ value: { groupBy: null, subGroupBy: null } })
  await expect(select(page, 'sub-group-by')).toHaveCount(0)
  // The panel stays open across picks in its own selects.
  await expect(panel(page)).toBeVisible()
})

test('ordering has several levels: add, flip the direction, change the field, remove', async ({ page, renderScenario }) => {
  await renderScenario(issues(`value='{"orderBy":[{"field":"priority","direction":"desc"}]}'`))
  await watch(host(page), 'view-change')
  await openPanel(page)
  const direction = (level: number) => panel(page).locator(`.sort[data-level="${level}"] c2-icon-button.direction`).getByRole('button')

  await expect(direction(0)).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('button', { name: 'Remove sort level 1' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Add sort' }).click()
  expect(await lastEvent(page)).toMatchObject({
    changed: 'orderBy',
    value: {
      orderBy: [
        { field: 'priority', direction: 'desc' },
        { field: 'status', direction: 'asc' },
      ],
    },
  })
  // A field already used by one level is not offered by another.
  await select(page, 'sort-field').nth(1).click()
  await expect(select(page, 'sort-field').nth(1).locator('c2-list-item', { hasText: 'Priority' })).toHaveCount(0)
  await select(page, 'sort-field').nth(1).locator('c2-list-item', { hasText: 'Due date' }).click()
  expect((await lastEvent(page)).value.orderBy[1]).toEqual({ field: 'due', direction: 'asc' })

  await direction(0).click()
  await expect(direction(0)).toHaveAttribute('aria-pressed', 'true')
  expect((await lastEvent(page)).value.orderBy[0]).toEqual({ field: 'priority', direction: 'asc' })

  await page.getByRole('button', { name: 'Remove sort level 1' }).click()
  expect((await lastEvent(page)).value.orderBy).toEqual([{ field: 'due', direction: 'asc' }])
})

test('max-sorts caps the levels and Add sort disappears when no field is left', async ({ page, renderScenario }) => {
  await renderScenario(issues(`max-sorts="1" value='{"orderBy":[{"field":"priority","direction":"desc"}]}'`))
  await openPanel(page)
  await expect(page.getByRole('button', { name: 'Add sort' })).toHaveCount(0)

  await props(host(page), { maxSorts: 5 })
  for (let i = 0; i < 2; i++) await page.getByRole('button', { name: 'Add sort' }).click()
  // Three orderable fields, three levels: nothing left to add.
  await expect(select(page, 'sort-field')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Add sort' })).toHaveCount(0)
})

test('Show switches and property chips edit show and properties, in field order', async ({ page, renderScenario }) => {
  await renderScenario(issues(`value='{"properties":["due"]}'`))
  await watch(host(page), 'view-change')
  await openPanel(page)

  await expect(page.getByRole('switch', { name: 'Completed issues' })).not.toBeChecked()
  await expect(page.getByRole('switch', { name: 'Sub-issues' })).toBeChecked()
  await page.getByRole('switch', { name: 'Completed issues' }).click()
  expect(await lastEvent(page)).toMatchObject({ changed: 'show', value: { show: { completed: true, sub: true } } })

  await page.getByRole('button', { name: 'Status' }).click()
  expect(await lastEvent(page)).toMatchObject({ changed: 'properties', value: { properties: ['status', 'due'] } })
  await page.getByRole('button', { name: 'Due date' }).click()
  expect(await lastEvent(page)).toMatchObject({ value: { properties: ['status'] } })
})

test('without a value, every property field is shown and each toggle takes its checked default', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await expect(host(page)).toHaveJSProperty('view', {
    layout: 'list',
    groupBy: null,
    subGroupBy: null,
    orderBy: [],
    show: { completed: false, sub: true },
    properties: ['status', 'priority', 'assignee', 'due'],
  })
})

test('a fields array replaces the c2-view-field children, and child edits are picked up', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await openPanel(page)
  await page.locator('c2-view-field[field="due"]').evaluate((element) => element.setAttribute('label', 'Deadline'))
  await expect(page.getByRole('button', { name: 'Deadline' })).toBeVisible()

  await props(host(page), { fields: [{ id: 'title', label: 'Title', property: true }], toggles: [] })
  await expect(page.getByRole('button', { name: 'Title' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deadline' })).toHaveCount(0)
  await expect(select(page, 'group-by')).toHaveCount(0)
  await expect(page.getByRole('switch')).toHaveCount(0)
})

test('children wrapped in another element, as Astro islands wrap them, are still read', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-view-options><div><c2-view-field field="owner" label="Owner" groupable property></c2-view-field></div><div><c2-view-toggle key="archived" label="Archived"></c2-view-toggle></div></c2-view-options>`,
  )
  await openPanel(page)
  await expect(page.getByRole('button', { name: 'Owner' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Archived' })).toBeVisible()
})

test('a server-rendered shadow root reads the children once it has rendered', async ({ page, renderScenario }) => {
  await renderScenario('<div id="mount"></div>')
  await page
    .locator('#mount')
    .evaluate((mount, markup) => mount.setHTMLUnsafe(`<c2-view-options><template shadowrootmode="open"></template>${markup}</c2-view-options>`), fields)
  await openPanel(page)
  await expect(page.getByRole('button', { name: 'Due date' })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Sub-issues' })).toBeChecked()
})

test('with a default value, the host reports changes and Reset restores it', async ({ page, renderScenario }) => {
  await renderScenario(issues(`default-value='{"groupBy":"status"}' value='{"groupBy":"status"}'`))
  await watch(host(page), 'view-change')
  await expect(host(page)).not.toHaveState('changed')
  await openPanel(page)
  const reset = page.getByRole('button', { name: 'Reset' })
  await expect(reset).toBeDisabled()

  await pick(page, 'group-by', 'Priority')
  await expect(host(page)).toHaveState('changed')
  await expect(reset).toBeEnabled()

  await reset.click()
  expect(await lastEvent(page)).toMatchObject({ changed: null, value: { groupBy: 'status' } })
  await expect(host(page)).not.toHaveState('changed')
})

test('Set as default asks the app with the current value', async ({ page, renderScenario }) => {
  await renderScenario(issues(`can-set-default value='{"layout":"table"}'`))
  await watch(host(page), 'default-request')
  await openPanel(page)
  await page.getByRole('button', { name: 'Set as default' }).click()
  expect(await lastEvent(page)).toMatchObject({ value: { layout: 'table' } })
})

test('the inner controls do not leak change or input events to the host', async ({ page, renderScenario }) => {
  await renderScenario(issues())
  await host(page).evaluate((element) => {
    for (const type of ['change', 'input']) element.addEventListener(type, () => element.setAttribute('data-leaked', type))
  })
  await openPanel(page)
  await page.getByRole('switch', { name: 'Completed issues' }).click()
  await page.getByRole('button', { name: 'Board' }).click()
  await pick(page, 'group-by', 'Priority')
  await expect(host(page)).not.toHaveAttribute('data-leaked')
})

test('a control slotted into extra keeps its own change events', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-view-options>${fields}<label slot="extra"><input type="checkbox" /> Compact rows</label></c2-view-options>`)
  await host(page).evaluate((element) => element.addEventListener('change', () => element.setAttribute('data-heard', 'change')))
  await openPanel(page)
  await page.getByRole('checkbox', { name: 'Compact rows' }).click()
  await expect(host(page)).toHaveAttribute('data-heard', 'change')
})

test("picking another field for a sort level keeps that level's row, so focus is not dropped", async ({ page, renderScenario }) => {
  await renderScenario(issues(`value='{"orderBy":[{"field":"priority","direction":"desc"}]}'`))
  await openPanel(page)
  await select(page, 'sort-field').evaluate((element) => element.setAttribute('data-probe', ''))
  await pick(page, 'sort-field', 'Due date')
  await expect(host(page)).toHaveJSProperty('view.orderBy', [{ field: 'due', direction: 'desc' }])
  // The same element: a row re-created per field would have lost the probe, and the focus with it.
  await expect(select(page, 'sort-field')).toHaveAttribute('data-probe', '')
})

test('the open panel has no accessibility violations', async ({ page, renderScenario }) => {
  await renderScenario(issues(`can-set-default default-value='{}' value='{"groupBy":"status","orderBy":[{"field":"priority","direction":"desc"}]}'`))
  await openPanel(page)
  await accessible(page)
})
