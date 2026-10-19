import type { Page } from '@playwright/test'
import type { Fieldset } from '../src/fieldset'
import { test, expect, accessible } from '../../../../tests/component-fixture'

const fieldset = (page: Page) => page.locator('c2-fieldset')

const topics = `<c2-fieldset legend="Topics" description="Pick the newsletters you want.">
  <c2-checkbox name="topics" value="product">Product updates</c2-checkbox>
  <c2-checkbox name="topics" value="events">Events</c2-checkbox>
  <input aria-label="Other topic" name="other" />
</c2-fieldset>`

test('names the group with the legend and describes it', async ({ page, renderScenario }) => {
  await renderScenario(topics)
  const group = page.getByRole('group', { name: 'Topics' })
  await expect(group).toBeVisible()
  await expect(group).toHaveAccessibleDescription('Pick the newsletters you want.')
  // The slotted controls sit inside the group in the accessibility tree.
  await expect(page.locator('main')).toMatchAriaSnapshot(`
    - group "Topics":
      - checkbox "Product updates"
      - checkbox "Events"
      - textbox "Other topic"
  `)
  await accessible(page)
})

test('slotted legend and description win over the attributes', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fieldset legend="Ignored" description="Ignored">
    <span slot="legend">Shipping address</span>
    <span slot="description">Where the parcel goes.</span>
    <c2-text-field label="Street"></c2-text-field>
  </c2-fieldset>`)
  const group = page.getByRole('group', { name: 'Shipping address' })
  await expect(group).toHaveAccessibleDescription('Where the parcel goes.')
})

test('shows an error and adds it to the description', async ({ page, renderScenario }) => {
  await renderScenario(topics)
  await expect(fieldset(page)).not.toHaveJSProperty('invalid', true)
  await fieldset(page).evaluate((element: Fieldset) => (element.errorText = 'Choose at least one topic.'))
  const group = page.getByRole('group', { name: 'Topics' })
  await expect(group).toHaveAccessibleDescription('Pick the newsletters you want. Error: Choose at least one topic.')
  await expect(fieldset(page).locator('[part="error"]')).toBeVisible()
  expect(await fieldset(page).evaluate((element) => element.matches(':state(invalid)'))).toBe(true)
  await accessible(page)
})

test('marks a required group for sighted and screen reader users', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fieldset legend="Plan" required><c2-checkbox>Pro</c2-checkbox></c2-fieldset>`)
  await expect(page.getByRole('group', { name: 'Plan required' })).toBeVisible()
  await expect(fieldset(page).locator('.required')).toHaveText('*')
})

test('disabled disables every control and restores only those it disabled', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fieldset legend="Topics" disabled>
    <c2-checkbox value="a">Product updates</c2-checkbox>
    <c2-checkbox value="b" disabled>Events</c2-checkbox>
    <input aria-label="Other topic" />
  </c2-fieldset>`)
  const product = page.getByRole('checkbox', { name: 'Product updates' })
  const other = page.getByRole('textbox', { name: 'Other topic' })
  await expect(product).toBeDisabled()
  await expect(other).toBeDisabled()
  await expect(page.getByRole('group', { name: 'Topics' })).toHaveAttribute('disabled')

  await fieldset(page).evaluate((element: Fieldset) => (element.disabled = false))
  await expect(product).toBeEnabled()
  await expect(other).toBeEnabled()
  // Disabled by the author, so it stays disabled.
  await expect(page.getByRole('checkbox', { name: 'Events' })).toBeDisabled()

  await product.click()
  await expect(product).toBeChecked()
})

test('disables the control inside a c2-form-field, not the field', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fieldset legend="Billing" disabled>
    <c2-form-field label="Email"><c2-text-field name="email" value="billing@example.com"></c2-text-field></c2-form-field>
  </c2-fieldset>`)
  await expect(page.getByRole('textbox', { name: 'Email' })).toBeDisabled()
  const names = await fieldset(page).evaluate((element: Fieldset) => element.elements.map((control) => control.localName))
  expect(names).toEqual(['c2-text-field'])
})

test('disables a control added while the group is disabled', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-fieldset legend="Topics" disabled><c2-checkbox>Product updates</c2-checkbox></c2-fieldset>`)
  await fieldset(page).evaluate((element) => {
    const input = document.createElement('input')
    input.setAttribute('aria-label', 'Added later')
    element.append(input)
  })
  await expect(page.getByRole('textbox', { name: 'Added later' })).toBeDisabled()
})

test('a disabled control leaves the form data', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-fieldset legend="Contact" disabled><input name="email" value="a@b.c" aria-label="Email" /></c2-fieldset></form>`)
  const entries = await page.locator('form').evaluate((form: HTMLFormElement) => [...new FormData(form).keys()])
  expect(entries).toEqual([])
})

test('lists its controls in elements', async ({ page, renderScenario }) => {
  await renderScenario(topics)
  const names = await fieldset(page).evaluate((element: Fieldset) => element.elements.map((control) => control.localName))
  expect(names).toEqual(['c2-checkbox', 'c2-checkbox', 'input'])
})
