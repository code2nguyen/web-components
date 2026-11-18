import { accessible, expect, props, test, watch } from '../../../../tests/component-fixture'
import type { UnitInput } from '../src/unit-input'

const packs = `units='[{"value":"ea","label":"each","factor":1},{"value":"dozen","factor":12},{"value":"case","factor":144}]'`

test('picking a unit converts the number, shows the equivalent and fires unit-change, input and change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-unit-input aria-label="Eggs" value="24" ${packs}></c2-unit-input>`)
  const host = page.locator('c2-unit-input')
  const picker = page.getByRole('combobox', { name: 'Unit' })
  await expect(picker).toHaveValue('ea')
  await expect(host.locator('.equivalent')).toHaveCount(0)
  await watch(host, 'unit-change')
  await host.evaluate((element) => {
    const seen: string[] = []
    element.addEventListener('input', () => seen.push('input'))
    element.addEventListener('change', () => seen.push('change'))
    ;(element as HTMLElement & { seen: string[] }).seen = seen
  })

  await picker.selectOption('dozen')
  await expect(host).toHaveJSProperty('value', '2')
  await expect(host).toHaveJSProperty('unit', 'dozen')
  await expect(host).toHaveAttribute('data-events', JSON.stringify([{ unit: 'dozen', previousUnit: 'ea' }]))
  await expect(host).toHaveJSProperty('seen', ['input', 'change'])
  await expect(host.locator('[part="equivalent"]')).toHaveText('= 24 each')
  await expect(page.getByRole('spinbutton', { name: 'Eggs' })).toHaveAccessibleDescription('dozen = 24 each')
  await expect(host).toHaveJSProperty('baseValue', 24)
  await accessible(page)
})

test('reaches the picker from the number with Tab, and the picker change does not leak out as a number edit', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-unit-input aria-label="Eggs" value="5" ${packs}></c2-unit-input>`)
  const host = page.locator('c2-unit-input')
  await page.getByRole('spinbutton', { name: 'Eggs' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: 'Unit' })).toBeFocused()
  await watch(host, 'change')
  // Five eggs are not a whole dozen: the conversion keeps six decimals, and going back is exact.
  await page.getByRole('combobox', { name: 'Unit' }).selectOption('dozen')
  await expect(host).toHaveJSProperty('value', '0.416667')
  await expect(host.locator('[part="equivalent"]')).toHaveText('= 5 each')
  await page.getByRole('combobox', { name: 'Unit' }).selectOption('ea')
  await expect(host).toHaveJSProperty('value', '5')
  await expect(host).toHaveAttribute('data-events', '[null,null]')
})

test('a unit step replaces step, rounds a conversion and drives validity', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-unit-input aria-label="Weight" name="weight" value="2.5" unit="lb" units='[{"value":"kg","factor":1,"step":"0.01"},{"value":"lb","factor":0.45359237,"step":"0.1"}]'></c2-unit-input></form>`,
  )
  const host = page.locator('c2-unit-input')
  const input = page.getByRole('spinbutton', { name: 'Weight' })
  await expect(input).toHaveAttribute('step', '0.1')
  await expect(host.locator('[part="equivalent"]')).toHaveText('≈ 1.13 kg')
  await input.press('ArrowUp')
  await expect(host).toHaveJSProperty('value', '2.6')
  await page.getByRole('combobox', { name: 'Unit' }).selectOption('kg')
  await expect(host).toHaveJSProperty('value', '1.18')
  await expect(input).toHaveAttribute('step', '0.01')
  await expect(host.locator('[part="equivalent"]')).toHaveCount(0)
  await input.fill('1.185')
  await expect.poll(() => host.evaluate((element) => (element as UnitInput).validity.stepMismatch)).toBe(true)
})

test('setting unit from code selects without converting; convertTo and baseValue convert', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-unit-input aria-label="Eggs" value="3" ${packs}></c2-unit-input>`)
  const host = page.locator('c2-unit-input')
  await watch(host, 'unit-change')
  await props(host, { unit: 'case' })
  await expect(host).toHaveJSProperty('value', '3')
  await expect(page.getByRole('combobox', { name: 'Unit' })).toHaveValue('case')
  await expect(host).toHaveJSProperty('baseValue', 432)
  await host.evaluate(async (element) => {
    ;(element as UnitInput).convertTo('dozen')
    await (element as UnitInput).updateComplete
  })
  await expect(host).toHaveJSProperty('value', '36')
  await props(host, { baseValue: 60 })
  await expect(host).toHaveJSProperty('value', '5')
  await expect(host).toHaveAttribute('data-events', '[]')
  // New units drop the conversion remembered under the old ones: 5 dozen is now read with the new factor.
  await props(host, { units: 'ea=1;dozen=10' })
  await expect(host).toHaveJSProperty('baseValue', 50)
})

test('reads the short form, and shows a single unit as a label with no picker', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-unit-input aria-label="Boxes" units="ea;dozen=12;case=144" unit="case" value="1"></c2-unit-input>
    <c2-unit-input aria-label="Weight" units="kg" value="72"></c2-unit-input>
  `)
  const [packed, single] = [page.locator('c2-unit-input').first(), page.locator('c2-unit-input').last()]
  await expect
    .poll(() => packed.evaluate((element) => JSON.stringify((element as UnitInput).units)))
    .toBe('[{"value":"ea"},{"value":"dozen","factor":12},{"value":"case","factor":144}]')
  // `ea` has no factor in the short form, so there is no base unit to show an equivalent in.
  await expect(packed.locator('[part="equivalent"]')).toHaveCount(0)
  await expect(single.locator('[part="unit"]')).toHaveText('kg')
  await expect(single.locator('select')).toHaveCount(0)
  await expect(page.getByRole('spinbutton', { name: 'Weight' })).toHaveAccessibleDescription('kg')
  await accessible(page)
})

test('submits the unit under unit-name, resets it and restores both', async ({ page, renderScenario }) => {
  await renderScenario(`<form><c2-unit-input aria-label="Eggs" name="qty" unit-name="uom" value="2" unit="dozen" ${packs}></c2-unit-input></form>`)
  const form = page.locator('form')
  const entries = () => form.evaluate((element) => [...new FormData(element as HTMLFormElement).entries()].map(([key, value]) => `${key}=${String(value)}`))
  await expect.poll(entries).toEqual(['qty=2', 'uom=dozen'])
  await page.getByRole('combobox', { name: 'Unit' }).selectOption('ea')
  await expect.poll(entries).toEqual(['qty=24', 'uom=ea'])
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect.poll(entries).toEqual(['qty=2', 'uom=dozen'])
  const host = page.locator('c2-unit-input')
  await host.evaluate((element) => {
    // The state the browser keeps holds the number and the unit, whatever the field names are.
    const state = new FormData()
    state.append('value', '3')
    state.append('unit', 'case')
    ;(element as UnitInput).formStateRestoreCallback(state)
  })
  await expect(page.getByRole('combobox', { name: 'Unit' })).toHaveValue('case')
  await expect(host).toHaveJSProperty('value', '3')
})

test('a disabled fieldset or read-only field locks the picker', async ({ page, renderScenario }) => {
  await renderScenario(`<form><fieldset><c2-unit-input aria-label="Eggs" name="qty" value="2" ${packs}></c2-unit-input></fieldset></form>`)
  const host = page.locator('c2-unit-input')
  await props(host, { readOnly: true })
  await expect(page.getByRole('combobox', { name: 'Unit' })).toBeDisabled()
  await props(host, { readOnly: false })
  await expect(page.getByRole('combobox', { name: 'Unit' })).toBeEnabled()
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = true))
  await expect(page.getByRole('combobox', { name: 'Unit' })).toBeDisabled()
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).has('qty'))).toBe(false)
})

test('the picker name and the equivalent follow the language', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div lang="fr"><c2-unit-input aria-label="Poids" value="2.5" unit="lb" units='[{"value":"kg","factor":1},{"value":"lb","factor":0.45359237}]'></c2-unit-input></div>`,
  )
  await expect(page.getByRole('combobox', { name: 'Unité' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Augmenter « Poids »' })).toHaveCount(1)
  await expect(page.locator('c2-unit-input [part="equivalent"]')).toHaveText('≈ 1,134 kg')
})

test('the unit label and picker keep the number-input field: clicking the picker does not move focus to the number', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-unit-input aria-label="Eggs" value="2" unit-label="Egg unit" ${packs}></c2-unit-input>`)
  const picker = page.getByRole('combobox', { name: 'Egg unit' })
  await picker.click()
  await expect(picker).toBeFocused()
})

test('moving focus between the number and the picker stays inside the field: no focusout or focusin on the host', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-unit-input aria-label="Eggs" value="2" ${packs}></c2-unit-input><c2-number-input aria-label="Next"></c2-number-input>`)
  const host = page.locator('c2-unit-input')
  await host.evaluate((element) => {
    const seen: string[] = []
    element.addEventListener('focusin', () => seen.push('focusin'))
    element.addEventListener('focusout', () => seen.push('focusout'))
    ;(element as HTMLElement & { seen: string[] }).seen = seen
  })
  await page.getByRole('spinbutton', { name: 'Eggs' }).focus()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('combobox', { name: 'Unit' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(host).toHaveJSProperty('seen', ['focusin'])
  await page.keyboard.press('Tab')
  await expect(page.getByRole('spinbutton', { name: 'Next' })).toBeFocused()
  await expect(host).toHaveJSProperty('seen', ['focusin', 'focusout'])
})

test('new units drop the remembered conversion; exponent steps and a null step are read', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-unit-input aria-label="Eggs" value="5" ${packs}></c2-unit-input>`)
  const host = page.locator('c2-unit-input')
  const base = await host.evaluate((element: UnitInput) => {
    element.convertTo('dozen')
    element.units = [
      { value: 'ea', factor: 1 },
      { value: 'dozen', factor: 10 },
    ]
    return element.baseValue
  })
  expect(base).toBeCloseTo(4.16667, 5)

  const converted = await host.evaluate(async (element: UnitInput) => {
    element.units = [
      { value: 'kg', factor: 1, step: null as unknown as string },
      { value: 'g', factor: 0.001, step: '1e-3' },
    ]
    element.unit = 'kg'
    element.value = '0.0004536'
    element.convertTo('g')
    await element.updateComplete
    return { value: element.value, step: element.shadowRoot!.querySelector('input')!.step, kgStep: element.units[0].step ?? 'none' }
  })
  expect(converted).toEqual({ value: '0.454', step: '1e-3', kgStep: 'none' })
})
