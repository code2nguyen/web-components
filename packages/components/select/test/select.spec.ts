import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const rows = '<c2-list-item value="a">Apple</c2-list-item><c2-list-item value="b">Berry</c2-list-item>'
test('selecting a value closes the menu and updates the trigger', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Choose fruit">${rows}</c2-select>`)
  const host = page.locator('c2-select')
  await watch(host, 'selection-change')
  await page.getByRole('button', { name: 'Choose fruit' }).click()
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: 'Berry' }).click()
  await expect(page.getByRole('button', { name: 'Berry' })).toHaveAttribute('aria-expanded', 'false')
  await expect(host).toHaveJSProperty('value', ['b'])
  await expect(host).toHaveAttribute('data-events', '[{"value":["b"],"data":[null]}]')
  await accessible(page)
})
test('ArrowDown opens, Escape dismisses and multiple selections keep the menu open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Choose fruit" multiple>${rows}</c2-select>`)
  await page.getByRole('button', { name: 'Choose fruit' }).press('ArrowDown')
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.getByRole('option', { name: 'Apple' }).click()
  await page.getByRole('option', { name: 'Berry' }).click()
  await expect(page.locator('c2-select')).toHaveJSProperty('value', ['a', 'b'])
  await expect(page.getByRole('listbox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('listbox')).not.toBeVisible()
})
test('readonly prevents native popover activation', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Read only" readonly>${rows}</c2-select>`)
  await page.getByRole('button', { name: 'Read only' }).click()
  await expect(page.locator('c2-select')).toHaveJSProperty('open', false)
  await expect(page.getByRole('listbox')).not.toBeVisible()
})

test('offers a scalar single-select API and submits single and multiple values', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-select name="fruit" value="a">${rows}</c2-select><c2-select name="tags" value="a;b" multiple>${rows}</c2-select></form>`)
  const selects = page.locator('c2-select')
  await expect(selects.first()).toHaveJSProperty('selectedValue', 'a')
  await selects.first().evaluate((el) => ((el as HTMLElement & { selectedValue: string }).selectedValue = 'b'))
  await expect(selects.first()).toHaveJSProperty('value', ['b'])
  await expect
    .poll(() =>
      page
        .locator('form')
        .evaluate((form) => ({ fruit: new FormData(form as HTMLFormElement).get('fruit'), tags: new FormData(form as HTMLFormElement).getAll('tags') })),
    )
    .toEqual({ fruit: 'b', tags: ['a', 'b'] })
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(selects.first()).toHaveJSProperty('selectedValue', 'a')
})
