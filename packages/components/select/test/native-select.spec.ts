import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const fruits = '<option value="a">Apple</option><option value="b">Berry</option><option value="c" disabled>Cherry</option>'
// The inner select: role combobox, reached through the shadow root.
const select = (page: Page, name: string) => page.getByRole('combobox', { name })
const optionTexts = (page: Page) => page.locator('c2-native-select select option').allTextContents()
const formValue = (page: Page) => page.locator('form').evaluate((form: HTMLFormElement) => new FormData(form).get('fruit'))

test('copies its option children and picks with the native select', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-native-select name="fruit" aria-label="Fruit">${fruits}</c2-native-select></form>`)
  const host = page.locator('c2-native-select')
  await watch(host, 'change')
  expect(await optionTexts(page)).toEqual(['Apple', 'Berry', 'Cherry'])
  // No placeholder: the first enabled option, as a native select shows it.
  await expect(host).toHaveJSProperty('value', 'a')
  expect(await formValue(page)).toBe('a')
  await select(page, 'Fruit').selectOption('b')
  await expect(host).toHaveJSProperty('value', 'b')
  await expect(host).toHaveAttribute('data-events', '[null]')
  expect(await formValue(page)).toBe('b')
  await expect(page.locator('c2-native-select select option[disabled]')).toHaveText('Cherry')
  await accessible(page)
})

test('takes options as JSON, with plain strings and groups; option children win', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-native-select aria-label="Size" value="m" options='["S","M",{"value":"m","label":"Medium"},{"label":"Large","options":["L",{"value":"xl","label":"XL","disabled":true}]}]'></c2-native-select>`,
  )
  const host = page.locator('c2-native-select')
  expect(await optionTexts(page)).toEqual(['S', 'M', 'Medium', 'L', 'XL'])
  await expect(page.locator('c2-native-select optgroup')).toHaveAttribute('label', 'Large')
  await expect(host).toHaveJSProperty('value', 'm')
  await expect(select(page, 'Size')).toHaveValue('m')
  await host.evaluate((element) => element.insertAdjacentElement('beforeend', Object.assign(document.createElement('option'), { value: 'one', text: 'One' })))
  await expect.poll(() => optionTexts(page)).toEqual(['One'])
})

test('follows its children as they change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-native-select aria-label="Fruit">${fruits}</c2-native-select>`)
  await page.locator('c2-native-select > option[value="a"]').evaluate((option) => (option.textContent = 'Apricot'))
  await expect.poll(() => optionTexts(page)).toEqual(['Apricot', 'Berry', 'Cherry'])
  await page.locator('c2-native-select > option[value="b"]').evaluate((option) => option.remove())
  await expect.poll(() => optionTexts(page)).toEqual(['Apricot', 'Cherry'])
})

test('a selected child gives the starting value, and reset returns to it', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-native-select name="fruit" aria-label="Fruit"><option value="a">Apple</option><option value="b" selected>Berry</option></c2-native-select></form>`,
  )
  const host = page.locator('c2-native-select')
  await expect(host).toHaveJSProperty('value', 'b')
  await select(page, 'Fruit').selectOption('a')
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  await expect(host).toHaveJSProperty('value', 'b')
  await expect(select(page, 'Fruit')).toHaveValue('b')
})

test('a value set before its options arrive is kept, and submitted, until they do', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-native-select name="country" aria-label="Country" value="fr"></c2-native-select></form>')
  const host = page.locator('c2-native-select')
  await expect(host).toHaveJSProperty('value', 'fr')
  expect(await page.locator('form').evaluate((form: HTMLFormElement) => new FormData(form).get('country'))).toBe('fr')
  await host.evaluate((element) => {
    ;(element as HTMLElement & { options: unknown }).options = [
      { value: 'de', label: 'Germany' },
      { value: 'fr', label: 'France' },
    ]
  })
  await expect(select(page, 'Country')).toHaveValue('fr')
})

test('a selected child appended after connecting gives the value; a value set as a property beats it', async ({ page, renderScenario }) => {
  await renderScenario('<c2-native-select aria-label="Late"></c2-native-select><div id="slot"></div>')
  // The order Angular's renderer and a parser with the element already defined produce: host first, children after.
  await page.locator('c2-native-select').evaluate((host) => {
    for (const [value, selected] of [
      ['a', false],
      ['b', true],
    ] as const) {
      const option = Object.assign(document.createElement('option'), { value, text: value.toUpperCase() })
      if (selected) option.setAttribute('selected', '')
      host.append(option)
    }
  })
  await expect(select(page, 'Late')).toHaveValue('b')
  // A framework that sets `value` before inserting the element: the property wins over the `selected` child.
  await page.locator('#slot').evaluate((slot) => {
    const host = document.createElement('c2-native-select') as HTMLElement & { value: string }
    host.setAttribute('aria-label', 'Bound')
    host.value = 'a'
    const selected = Object.assign(document.createElement('option'), { value: 'b', text: 'B' })
    selected.setAttribute('selected', '')
    host.append(Object.assign(document.createElement('option'), { value: 'a', text: 'A' }), selected)
    slot.append(host)
    // Moving the element (a portal) does not take the `selected` child again either.
    document.body.append(host)
  })
  await expect(select(page, 'Bound')).toHaveValue('a')
})

test('setCustomValidity counts before the first render', async ({ page, renderScenario }) => {
  await renderScenario('<form></form>')
  const valid = await page.locator('form').evaluate((form: HTMLFormElement) => {
    const host = document.createElement('c2-native-select') as HTMLElement & { setCustomValidity(message: string): void }
    form.append(host)
    host.setCustomValidity('Pick one we stock')
    return form.checkValidity()
  })
  expect(valid).toBe(false)
})

test('placeholder with required: invalid until a real option is chosen, and the placeholder cannot be picked back', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-native-select name="fruit" aria-label="Fruit" placeholder="Choose a fruit" required>${fruits}</c2-native-select></form>`)
  const host = page.locator('c2-native-select')
  await expect(host).toHaveJSProperty('value', '')
  await expect(page.locator('c2-native-select select option').first()).toHaveText('Choose a fruit')
  await expect(page.locator('c2-native-select select option').first()).toBeDisabled()
  await expect(host).toHaveJSProperty('validity.valueMissing', true)
  await expect(host).toHaveJSProperty('validationMessage', 'Please select an option.')
  expect(await host.evaluate((element) => element.matches(':state(empty)'))).toBe(true)
  await accessible(page)
  await select(page, 'Fruit').selectOption('b')
  await expect(host).toHaveJSProperty('validity.valid', true)
  expect(await host.evaluate((element) => element.matches(':state(empty)'))).toBe(false)
  expect(await formValue(page)).toBe('b')
  await page.locator('form').evaluate((form: HTMLFormElement) => form.reset())
  await expect(host).toHaveJSProperty('value', '')
})

test('a value that matches no option falls back to the placeholder', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-native-select aria-label="Fruit" placeholder="Choose" value="zz">${fruits}</c2-native-select>`)
  await expect(page.locator('c2-native-select')).toHaveJSProperty('value', '')
  await expect(select(page, 'Fruit')).toHaveValue('')
})

test('is labelable: a `for` label names the select and clicking it focuses the select', async ({ page, renderScenario }) => {
  await renderScenario(`<label for="fruit">Fruit</label><c2-native-select id="fruit">${fruits}</c2-native-select>`)
  await page.locator('label').click()
  await expect(select(page, 'Fruit')).toBeFocused()
})

test('takes its name from an aria-labelledby set after upgrade (the shape c2-label[for] produces)', async ({ page, renderScenario }) => {
  await renderScenario(`<span id="fruit-label">Fruit</span><c2-native-select>${fruits}</c2-native-select>`)
  await page.locator('c2-native-select').evaluate((element) => element.setAttribute('aria-labelledby', 'fruit-label'))
  await expect(select(page, 'Fruit')).toBeVisible()
})

test('the keyboard reaches it with Tab and changes the value with typeahead', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<button>Before</button><c2-native-select aria-label="Fruit">${fruits}</c2-native-select><button>After</button>`)
  const host = page.locator('c2-native-select')
  await watch(host, 'input')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(select(page, 'Fruit')).toBeFocused()
  // Typeahead on a closed select picks the matching option without opening the picker, in every engine.
  await page.keyboard.type('b')
  await expect(host).toHaveJSProperty('value', 'b')
  await expect(host).toHaveAttribute('data-events', '[null]')
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('disabled, and disabled by a fieldset, leave the tab order', async ({ page, renderScenario, tab }) => {
  await renderScenario(
    `<button>Before</button><fieldset disabled><c2-native-select aria-label="In fieldset">${fruits}</c2-native-select></fieldset><c2-native-select aria-label="Own" disabled>${fruits}</c2-native-select><button>After</button>`,
  )
  await expect(select(page, 'In fieldset')).toBeDisabled()
  await expect(select(page, 'Own')).toBeDisabled()
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await page.locator('fieldset').evaluate((fieldset) => fieldset.removeAttribute('disabled'))
  await expect(select(page, 'In fieldset')).toBeEnabled()
  await expect(select(page, 'Own')).toBeDisabled()
})

test('error marks the select invalid and draws the error border', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-native-select aria-label="Fruit" error>${fruits}</c2-native-select><c2-native-select aria-label="Plain">${fruits}</c2-native-select>`,
  )
  await expect(select(page, 'Fruit')).toHaveAttribute('aria-invalid', 'true')
  const border = (name: string) => select(page, name).evaluate((element) => getComputedStyle(element.parentElement!).borderTopColor)
  expect(await border('Fruit')).toBe('rgb(220, 38, 38)')
  expect(await border('Plain')).not.toBe('rgb(220, 38, 38)')
  expect(await page.locator('c2-native-select[error]').evaluate((element) => element.matches(':state(error)'))).toBe(true)
  await accessible(page)
})

test('a prefix icon is reserved room, and the suffix slot replaces the chevron', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-native-select aria-label="With icon"><svg slot="prefix-icon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"></circle></svg>${fruits}</c2-native-select>` +
      `<c2-native-select aria-label="Plain"><span slot="suffix-icon">v</span>${fruits}</c2-native-select>`,
  )
  const inset = (name: string) => select(page, name).evaluate((element) => parseFloat(getComputedStyle(element).paddingInlineStart))
  expect(await inset('With icon')).toBe(12 + 16 + 8)
  expect(await inset('Plain')).toBe(12)
  // The field box fills the host: only the icon is inset, never the box.
  const offset = await page
    .locator('c2-native-select')
    .first()
    .evaluate((host) => host.shadowRoot!.querySelector('[part="field"]')!.getBoundingClientRect().left - host.getBoundingClientRect().left)
  expect(offset).toBe(0)
  // The chevron is the slot's fallback content: replaced, it is not drawn.
  await expect(page.locator('c2-native-select').nth(0).locator('[part="suffix-icon"] svg')).toBeVisible()
  await expect(page.locator('c2-native-select').nth(1).locator('[part="suffix-icon"] svg')).not.toBeVisible()
  expect(
    await page
      .locator('c2-native-select')
      .nth(1)
      .locator('[part="suffix-icon"] slot')
      .evaluate((slot: HTMLSlotElement) => slot.assignedElements().length),
  ).toBe(1)
})

test('the required message follows the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr"><c2-native-select aria-label="Fruit" placeholder="Fruit" required>${fruits}</c2-native-select></div>`)
  const host = page.locator('c2-native-select')
  await expect(host).toHaveJSProperty('validationMessage', 'Veuillez sélectionner une option.')
  await page.locator('div[lang]').evaluate((element) => element.setAttribute('lang', 'vi'))
  await expect(host).toHaveJSProperty('validationMessage', 'Vui lòng chọn một mục.')
  await host.evaluate((element) => (element as HTMLElement & { setCustomValidity(message: string): void }).setCustomValidity('Pick one we stock'))
  await expect(host).toHaveJSProperty('validationMessage', 'Pick one we stock')
})
