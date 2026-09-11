import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const panels = '<c2-details label="First"><p>First panel</p></c2-details><c2-details label="Second"><p>Second panel</p></c2-details>'
test('opening one disclosure closes its sibling', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-accordion>${panels}</c2-accordion>`)
  await page.locator('summary').nth(0).click()
  await page.locator('summary').nth(1).click()
  await expect(page.getByText('First panel', { exact: true })).not.toBeVisible()
  await expect(page.getByText('Second panel', { exact: true })).toBeVisible()
  await accessible(page)
})
test('multiple permits both panels and switching back enforces exclusivity', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-accordion multiple>${panels}</c2-accordion>`)
  await page.locator('summary').nth(0).click()
  await page.locator('summary').nth(1).click()
  await expect(page.getByText('First panel', { exact: true })).toBeVisible()
  await expect(page.getByText('Second panel', { exact: true })).toBeVisible()
  await props(page.locator('c2-accordion'), { multiple: false })
  await expect(page.locator('c2-details[expanded]')).toHaveCount(1)
})
