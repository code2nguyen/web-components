import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'number', 'wizard', 'flat', 'statuses', 'data']) {
  test(`${state} has accessible semantics and no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the list is a list, and every status is spoken as well as drawn', async ({ page, scenario }) => {
  await scenario('statuses')
  await expect(page.getByRole('list', { name: 'Statuses' })).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(7)
  for (const [label, spoken] of [
    ['Success', 'Completed'],
    ['Error', 'Failed'],
    ['Warning', 'Completed with warnings'],
    ['Running', 'Running'],
    ['Current', 'Current'],
    ['Skipped', 'Skipped'],
    ['Pending', 'Pending'],
  ]) {
    await expect(page.locator(`c2-step[label="${label}"]`)).toContainText(spoken)
  }
})

test('sub-steps are a list inside their parent listitem', async ({ page, scenario }) => {
  await scenario()
  const parent = page.locator('c2-step[label="pagination"]')
  await expect(parent).toHaveRole('listitem')
  await expect(parent.locator('[part="children"]').first()).toHaveRole('list')
})

test('a group is reachable and operable from the keyboard', async ({ page, scenario }) => {
  await scenario('run')
  await page.locator('#before').focus()
  await page.keyboard.press('Tab')

  // A group's row is a `<summary>`, so it is in the tab order and Enter works with nothing added.
  const summary = page.locator('c2-step#build summary[part="row"]')
  await expect(summary).toBeFocused()
  await expect(page.locator('c2-step#build details')).toHaveJSProperty('open', true)

  await page.keyboard.press('Enter')
  await expect(page.locator('c2-step#build')).toHaveAttribute('collapsed', '')
  await expect(page.locator('c2-step#build details')).toHaveJSProperty('open', false)
})
