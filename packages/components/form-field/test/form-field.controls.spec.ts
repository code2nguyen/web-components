import { test, expect, accessible } from '../../../../tests/component-fixture'

// Every form-associated control takes part in the field protocol: inside a c2-form-field its focusable element is
// named by the field's label and described by the hint, then by the error. The focusable element is the one whose
// `aria-describedby` points at the description the control draws in its own shadow root.
const controls: { tag: string; markup: string; selfLabelled?: boolean }[] = [
  { tag: 'c2-text-field', markup: '<c2-text-field></c2-text-field>' },
  { tag: 'c2-textarea', markup: '<c2-textarea></c2-textarea>' },
  { tag: 'c2-select', markup: '<c2-select><c2-list-item value="a">A</c2-list-item></c2-select>' },
  { tag: 'c2-checkbox', markup: '<c2-checkbox>Agree</c2-checkbox>', selfLabelled: true },
  { tag: 'c2-switch', markup: '<c2-switch>Digest</c2-switch>', selfLabelled: true },
  { tag: 'c2-mask-input', markup: '<c2-mask-input mask="99999"></c2-mask-input>' },
  { tag: 'c2-money-input', markup: '<c2-money-input currency="EUR"></c2-money-input>' },
  { tag: 'c2-number-input', markup: '<c2-number-input></c2-number-input>' },
  { tag: 'c2-password-field', markup: '<c2-password-field></c2-password-field>' },
  { tag: 'c2-search-field', markup: '<c2-search-field></c2-search-field>' },
  { tag: 'c2-time-input', markup: '<c2-time-input></c2-time-input>' },
  { tag: 'c2-date-input', markup: '<c2-date-input></c2-date-input>' },
  { tag: 'c2-date-time-picker', markup: '<c2-date-time-picker></c2-date-time-picker>' },
  { tag: 'c2-date-selector', markup: '<c2-date-selector></c2-date-selector>' },
  { tag: 'c2-otp-input', markup: '<c2-otp-input></c2-otp-input>' },
  { tag: 'c2-phone-input', markup: '<c2-phone-input></c2-phone-input>' },
  { tag: 'c2-autocomplete', markup: '<c2-autocomplete></c2-autocomplete>' },
  { tag: 'c2-cascader', markup: '<c2-cascader></c2-cascader>' },
  { tag: 'c2-tag-input', markup: '<c2-tag-input></c2-tag-input>' },
  { tag: 'c2-slider', markup: '<c2-slider></c2-slider>' },
  { tag: 'c2-rate', markup: '<c2-rate></c2-rate>' },
  { tag: 'c2-radio-group', markup: '<c2-radio-group><c2-radio value="a">A</c2-radio><c2-radio value="b">B</c2-radio></c2-radio-group>' },
  { tag: 'c2-checkbox-group', markup: '<c2-checkbox-group><c2-checkbox value="a">A</c2-checkbox></c2-checkbox-group>' },
  // Its role moves from the host's internals onto an inner wrapper while a field wraps it.
  { tag: 'c2-button-group', markup: '<c2-button-group><c2-button value="a">A</c2-button><c2-button value="b">B</c2-button></c2-button-group>' },
  { tag: 'c2-upload', markup: '<c2-upload></c2-upload>' },
  { tag: 'c2-code-editor', markup: '<c2-code-editor></c2-code-editor>' },
  { tag: 'c2-notepad', markup: '<c2-notepad></c2-notepad>' },
  { tag: 'c2-page-editor', markup: '<c2-page-editor></c2-page-editor>' },
  { tag: 'c2-rich-text-editor', markup: '<c2-rich-text-editor></c2-rich-text-editor>' },
  { tag: 'c2-chat-input', markup: '<c2-chat-input></c2-chat-input>' },
  { tag: 'c2-inline-edit', markup: '<c2-inline-edit value="Ada"></c2-inline-edit>' },
  { tag: 'c2-key-value-editor', markup: '<c2-key-value-editor></c2-key-value-editor>' },
  { tag: 'c2-query-input', markup: '<c2-query-input></c2-query-input>' },
  { tag: 'c2-tree-select', markup: '<c2-tree-select><c2-tree-item value="a" label="A"></c2-tree-item></c2-tree-select>' },
  { tag: 'c2-month-picker', markup: '<c2-month-picker></c2-month-picker>' },
  { tag: 'c2-date-strip', markup: '<c2-date-strip></c2-date-strip>' },
  { tag: 'c2-wheel-picker', markup: '<c2-wheel-picker options="S;M;L"></c2-wheel-picker>' },
  // Both are groups named by the field; the field label names the group and each inner control keeps its own name.
  { tag: 'c2-card-input', markup: '<c2-card-input></c2-card-input>', selfLabelled: true },
  {
    tag: 'c2-time-slot-picker',
    markup: `<c2-time-slot-picker time-zone="UTC" slots='[{"start":"2030-01-07T09:00:00Z"}]'></c2-time-slot-picker>`,
    selfLabelled: true,
  },
  {
    tag: 'c2-choice-matrix',
    markup: `<c2-choice-matrix rows='[{"value":"a","label":"A"}]' columns='[{"value":"x","label":"X"}]'></c2-choice-matrix>`,
  },
]

for (const { tag, markup, selfLabelled } of controls) {
  test(`${tag} takes its name and description from the field`, async ({ page, renderScenario }) => {
    await renderScenario(`<c2-form-field label="Field label" hint="Field hint">${markup}</c2-form-field>`)
    const target = page.locator(tag).locator('[aria-describedby~="c2-field-description"]').first()
    await expect(target).toHaveCount(1)
    if (!selfLabelled) await expect(target).toHaveAccessibleName(/Field label/)
    await expect(target).toHaveAccessibleDescription(/Field hint/)

    await page.locator('c2-form-field').evaluate((field) => field.setAttribute('error-text', 'Something is wrong'))
    await expect(target).toHaveAccessibleDescription(/Error: Something is wrong/)
    await expect(page.locator('c2-form-field')).toHaveState('user-invalid')

    // Out of the field the control is itself again: no description from it.
    await page.evaluate(() => document.querySelector('main')!.append(document.querySelector('c2-form-field')!.firstElementChild!))
    await expect(page.locator(tag).locator('[aria-describedby~="c2-field-description"]')).toHaveCount(0)
  })
}

test('c2-button-group keeps its role on its internals outside a field and on the wrapper inside one', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-form-field label="Alignment"><c2-button-group toolbar><c2-button value="a">A</c2-button></c2-button-group></c2-form-field><div id="out"></div>`,
  )
  const group = page.locator('c2-button-group')
  await expect(group).toHaveHostAria('role', null)
  await expect(page.getByRole('toolbar', { name: 'Alignment' })).toBeVisible()
  await page.locator('c2-form-field').evaluate((field) => field.setAttribute('error-text', 'Pick one'))
  await expect(page.getByRole('toolbar', { name: 'Alignment' })).toHaveAccessibleDescription('Error: Pick one')
  await accessible(page)
  await page.evaluate(() => document.querySelector('#out')!.append(document.querySelector('c2-button-group')!))
  await expect(group).toHaveHostAria('role', 'toolbar')
  await expect(group.locator('.field-group')).toHaveCount(0)
})
