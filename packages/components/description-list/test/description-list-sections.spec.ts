import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('a section titles its items across the list, and a collapsible one opens on demand and to find-in-page', async ({ page, scenario }) => {
  await scenario('sections')
  const groups = page.locator('c2-description-group')
  await expect(groups.first()).toHaveHostAria('role', 'listitem')
  await expect(page.getByRole('heading', { name: 'Contact', level: 3 })).toBeVisible()
  await expect(page.getByText('ada@example.com')).toBeVisible()
  // The second section starts closed: its value is there but not shown.
  await expect(page.getByText('Visa ending 4242')).toBeHidden()
  await groups
    .nth(1)
    .evaluate((group) =>
      group.addEventListener('collapsed-change', (event) => group.setAttribute('data-toggled', String((event as CustomEvent).detail.collapsed))),
    )
  const toggle = page.getByRole('button', { name: 'Billing' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  // The heading keeps its role around the disclosure button.
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible()
  await toggle.click()
  await expect(page.getByText('Visa ending 4242')).toBeVisible()
  await expect(groups.nth(1)).toHaveJSProperty('collapsed', false)
  await expect(groups.nth(1)).toHaveAttribute('data-toggled', 'false')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByText('Visa ending 4242')).toBeHidden()
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
})

test('a breakdown closes its steps with a subtotal and ends on a total, in the value columns', async ({ page, scenario }) => {
  await scenario('pay-stub')
  const subtotal = page.locator('c2-description-item[kind="subtotal"]')
  const total = page.locator('c2-description-item[kind="total"]')
  const rule = (locator: typeof total) =>
    locator.evaluate((item) => {
      const box = item.shadowRoot!.querySelector('.c2-description-item')!
      const style = getComputedStyle(box)
      return { border: style.borderTopWidth, weight: getComputedStyle(item.shadowRoot!.querySelector('.label')!).fontWeight }
    })
  expect(await rule(subtotal)).toEqual({ border: '1px', weight: '600' })
  expect(await rule(total)).toEqual({ border: '2px', weight: '700' })
  // The section's values line up with the list's columns.
  const left = (selector: string) => page.locator(selector).evaluate((value) => Math.round(value.getBoundingClientRect().left))
  expect(await left('c2-description-item[label="Salary"] c2-description-value >> nth=1')).toBe(
    await left('c2-description-item[label="Net pay"] c2-description-value >> nth=1'),
  )
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
})

test('an item with an editor edits in place: Enter commits through an edit event, Escape cancels, and the editor loads on first use', async ({
  page,
  scenario,
}) => {
  await scenario('properties')
  const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').some((entry) => entry.name.includes('description-edit')))
  expect(await loaded()).toBe(false)
  // A read-only item has no button.
  await expect(page.getByRole('button', { name: 'Edit Owner' })).toHaveCount(0)
  await page.locator('c2-description-list').evaluate((list) => {
    const events: unknown[] = []
    list.addEventListener('edit', (event) => {
      events.push((event as CustomEvent).detail)
      list.setAttribute('data-events', JSON.stringify(events))
      // The page writes the value; the item does not change its own content.
      ;(event.target as HTMLElement).textContent = (event as CustomEvent<{ value: string }>).detail.value
    })
  })
  await page.getByRole('button', { name: 'Edit Name' }).click()
  const name = page.getByRole('textbox', { name: 'Name' })
  await expect(name).toBeFocused()
  await expect(name).toHaveValue('Acme renewal')
  await name.fill('Acme expansion')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Edit Name' })).toBeFocused()
  await expect.poll(() => page.locator('c2-description-item[label="Name"]').evaluate((item) => item.textContent)).toBe('Acme expansion')
  expect(await loaded()).toBe(true)

  // The amount starts from edit-value, and a click on the value edits too; Escape keeps it.
  await page.getByText('$12,000').click()
  const amount = page.getByRole('spinbutton', { name: 'Amount' })
  await expect(amount).toHaveValue('12000')
  await amount.fill('15000')
  await page.keyboard.press('Escape')
  await expect(page.getByText('$12,000')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Stage' }).click()
  // A change made with the keys (no pointer) leaves the field open to keep choosing; Enter commits it.
  const stage = page.getByRole('combobox', { name: 'Stage' })
  await stage.selectOption('Won')
  await expect(stage).toBeVisible()
  await stage.press('Enter')
  await expect(stage).toHaveCount(0)
  expect(JSON.parse((await page.locator('c2-description-list').getAttribute('data-events'))!)).toEqual([
    { name: 'Name', value: 'Acme expansion', previous: 'Acme renewal' },
    { name: 'Stage', value: 'Won', previous: 'Qualified' },
  ])
  expect((await new AxeBuilder({ page }).include('main').analyze()).violations).toEqual([])
})

test('the edit button speaks the page language', async ({ page, scenario }) => {
  await scenario('properties-fr')
  await expect(page.getByRole('button', { name: 'Modifier Nom' })).toBeVisible()
})

test('leaving an untouched field changes nothing, and a click elsewhere keeps the focus there', async ({ page, scenario }) => {
  await scenario('properties')
  await page.locator('c2-description-list').evaluate((list) => list.addEventListener('edit', () => list.setAttribute('data-edited', 'yes')))
  // A formatted amount with no edit-value would open empty: leaving it must not erase the value.
  await page.locator('c2-description-item[label="Amount"]').evaluate((item: HTMLElement & { editValue?: string }) => {
    item.removeAttribute('edit-value')
    item.editValue = undefined
  })
  await page.getByRole('button', { name: 'Edit Amount' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Amount' })).toHaveValue('')
  await page.getByRole('button', { name: 'Edit Name' }).click()
  await expect(page.locator('c2-description-list')).not.toHaveAttribute('data-edited')
  // The click moved the focus to the next edit; the first one's blur does not pull it back.
  await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused()
})
