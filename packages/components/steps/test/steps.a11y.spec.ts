import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'number', 'wizard', 'flat', 'statuses', 'data', 'horizontal', 'interactive', 'interactive-vertical']) {
  test(`${state} has accessible semantics and no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the list is a list, and every status is spoken as well as drawn', async ({ page, scenario }) => {
  await scenario('statuses')
  const list = page.locator('c2-steps#subject')
  await expect(list).toBeVisible()
  await expect(list).toHaveHostAria('role', 'list')
  await expect(list).toHaveAccessibleName('Statuses')
  const items = page.locator('c2-step')
  await expect(items).toHaveCount(7)
  for (const item of await items.all()) await expect(item).toHaveHostAria('role', 'listitem')
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
  await expect(parent).toHaveHostAria('role', 'listitem')
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

// React hydrates server markup against what the element looks like after it upgrades, and reports every attribute
// the element wrote on itself as a mismatch. The list and listitem roles therefore live on ElementInternals.
test('states its semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, scenario }) => {
  await scenario('statuses')
  const hosts = page.locator('c2-steps, c2-step')
  const hostSemantics = () =>
    hosts.evaluateAll((elements) =>
      elements.flatMap((element) =>
        element
          .getAttributeNames()
          .filter((name) => name === 'role' || name.startsWith('aria-'))
          .map((name) => `${element.localName}${element.id ? `#${element.id}` : ''}[${name}]`),
      ),
    )
  const list = page.locator('c2-steps#subject')
  const first = page.locator('c2-step').first()

  await expect(list).toHaveHostAria('role', 'list')
  await expect(first).toHaveHostAria('role', 'listitem')
  // The one host attribute left is the author's own label.
  expect(await hostSemantics()).toEqual(['c2-steps#subject[aria-label]'])

  await first.evaluate(async (step) => {
    step.setAttribute('status', 'error')
    await (step as Element & { updateComplete?: Promise<boolean> }).updateComplete
  })
  await expect(first).toContainText('Failed')
  await expect(first).toHaveHostAria('role', 'listitem')
  expect(await hostSemantics()).toEqual(['c2-steps#subject[aria-label]'])
})
