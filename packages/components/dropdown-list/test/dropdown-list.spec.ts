import { test, expect, accessible } from '../../../../tests/component-fixture'

// This package is currently a layout shell: selection and popup handlers are unfinished.
test('projects the input and option-list slots without losing interactions', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-dropdown-list><input aria-label="Filter" slot="input" /><c2-list aria-label="Results"><c2-list-item value="a">Alpha</c2-list-item></c2-list></c2-dropdown-list>',
  )
  await page.getByRole('textbox', { name: 'Filter' }).fill('Alpha')
  await page.getByRole('option', { name: 'Alpha' }).click()
  await expect(page.locator('c2-list')).toHaveJSProperty('value', ['a'])
  await accessible(page)
})
test('array attributes are converted for consumers', async ({ page, renderScenario }) => {
  await renderScenario('<c2-dropdown-list value="a;b"><span slot="input">Filter</span><p>Results</p></c2-dropdown-list>')
  await expect(page.locator('c2-dropdown-list')).toHaveJSProperty('value', ['a', 'b'])
  await expect(page.getByText('Results', { exact: true })).toBeVisible()
})
