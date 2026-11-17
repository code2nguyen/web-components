import { test, expect, props, watch, accessible, pointerClick, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('pointer and Space toggle once and publish the checked value', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept terms"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const input = page.getByRole('checkbox', { name: 'Accept terms' })
  await watch(host, 'change')
  await input.check()
  await expect(host).toHaveJSProperty('checked', true)
  await input.press('Space')
  await expect(input).not.toBeChecked()
  await expect(host).toHaveAttribute('data-events', '[null,null]')
  await accessible(page)
})
test('mixed state clears on activation and property updates stay synchronized', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Select all" indeterminate></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const input = page.getByRole('checkbox')
  await expect(input).toHaveAttribute('aria-checked', 'mixed')
  await input.click()
  await expect(host).toHaveJSProperty('indeterminate', false)
  await props(host, { checked: false })
  await expect(input).not.toBeChecked()
  await props(host, { checked: true })
  await expect(input).toBeChecked()
})
test('disabled blocks clicks and host focus reaches the enabled input', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept" disabled></c2-checkbox>')
  const input = page.getByRole('checkbox')
  await pointerClick(input)
  await expect(input).not.toBeChecked()
  await props(page.locator('c2-checkbox'), { disabled: false })
  await page.locator('c2-checkbox').evaluate((el) => (el as HTMLElement).focus())
  await expect(input).toBeFocused()
})

test('submits only while checked and resets to its authored state', async ({ page, renderScenario }) => {
  await renderScenario('<form><c2-checkbox name="terms" value="accepted" checked required aria-label="Terms"></c2-checkbox></form>')
  const host = page.locator('c2-checkbox')
  await expect.poll(() => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).get('terms'))).toBe('accepted')
  await page.getByRole('checkbox').uncheck()
  await expect.poll(() => host.evaluate((el) => (el as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host).toHaveJSProperty('checked', true)
})

test('a programmatic checked change still lands after the user has clicked the box', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const input = page.getByRole('checkbox')

  // The click sets the inner input's dirty-checkedness flag, after which the `checked` content attribute no
  // longer moves it. Staying in sync then rests entirely on the imperative `formElement.checked` write in
  // `willUpdate`, which every consumer that drives selection from script depends on.
  await pointerClick(input)
  await expect(input).toBeChecked()

  await props(host, { checked: false })
  await expect(input).not.toBeChecked()

  await props(host, { checked: true })
  await expect(input).toBeChecked()
})

test('a boolean attribute written as "false" turns the flag off', async ({ page, renderScenario }) => {
  // Frameworks that stringify a non-boolean attribute name (Svelte 5, and any server renderer) emit
  // `checked="false"`. Lit's presence-based default would read that as true and enable what was disabled.
  await renderScenario('<c2-checkbox aria-label="Accept terms" checked="false" disabled="false"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  await expect(host).toHaveJSProperty('checked', false)
  await expect(host).toHaveJSProperty('disabled', false)
  await page.getByRole('checkbox', { name: 'Accept terms' }).check()
  await expect(host).toHaveJSProperty('checked', true)
})

test('a bare boolean attribute and an empty one still read as true', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="One" checked></c2-checkbox><c2-checkbox aria-label="Two" checked=""></c2-checkbox>')
  await expect(page.locator('c2-checkbox').first()).toHaveJSProperty('checked', true)
  await expect(page.locator('c2-checkbox').last()).toHaveJSProperty('checked', true)
})

test('label text toggles the box and names it, and a bare box keeps its touch-target size', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox>Email me<span slot="description">Weekly digest</span></c2-checkbox><c2-checkbox aria-label="Bare"></c2-checkbox>')
  const labelled = page.getByRole('checkbox', { name: 'Email me' })
  await page.getByText('Email me').click()
  await expect(labelled).toBeChecked()
  await page.getByText('Weekly digest').click()
  await expect(labelled).not.toBeChecked()
  const bare = await page.locator('c2-checkbox').last().boundingBox()
  expect(bare?.width).toBe(32)
  await accessible(page)
})

test('label presence follows slotted content', async ({ page, renderScenario }) => {
  const label = page.locator('c2-checkbox').locator('[part="label"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-checkbox><span data-slot-presence-probe>Accept</span></c2-checkbox>',
    host: 'c2-checkbox',
    assertPresent: async (present) => (present ? expect(label).toBeVisible() : expect(label).toBeHidden()),
  })
})

const options =
  '<c2-checkbox-group name="channels"><span slot="label">Notify me by</span><c2-checkbox value="email">Email</c2-checkbox><c2-checkbox value="sms" disabled>SMS</c2-checkbox><c2-checkbox value="push">Push</c2-checkbox></c2-checkbox-group>'

test('group collects checked options in document order and emits one input and change per toggle', async ({ page, renderScenario }) => {
  await renderScenario(options)
  const group = page.locator('c2-checkbox-group')
  await watch(group, 'change')
  await group.evaluate((element) => {
    element.setAttribute('data-inputs', '0')
    element.addEventListener('input', () => element.setAttribute('data-inputs', String(Number(element.getAttribute('data-inputs')) + 1)))
  })
  await page.getByRole('checkbox', { name: 'Push' }).check()
  await page.getByRole('checkbox', { name: 'Email' }).check()
  await expect(group).toHaveJSProperty('value', ['email', 'push'])
  await page.getByRole('checkbox', { name: 'Push' }).uncheck()
  await expect(group).toHaveAttribute('data-events', '[{"value":["push"]},{"value":["email","push"]},{"value":["email"]}]')
  await expect(group).toHaveAttribute('data-inputs', '3')
  await expect(page.getByRole('group', { name: 'Notify me by' })).toBeVisible()
  await accessible(page)
})

test('options toggle independently by keyboard, each a tab stop', async ({ page, renderScenario, tab }) => {
  await renderScenario(options)
  await tab()
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeFocused()
  await page.keyboard.press('Space')
  await tab()
  await expect(page.getByRole('checkbox', { name: 'Push' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.locator('c2-checkbox-group')).toHaveJSProperty('value', ['email', 'push'])
})

test('value from markup or script checks the matching options; pre-checked options are adopted', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-checkbox-group id="a" aria-label="A" value="push;email"><c2-checkbox value="email">Email</c2-checkbox><c2-checkbox value="push">Push</c2-checkbox></c2-checkbox-group>' +
      '<c2-checkbox-group id="b" aria-label="B"><c2-checkbox value="x" checked>X</c2-checkbox><c2-checkbox value="y">Y</c2-checkbox></c2-checkbox-group>',
  )
  const a = page.locator('#a')
  await expect(a.getByRole('checkbox', { name: 'Email' })).toBeChecked()
  await expect(a.getByRole('checkbox', { name: 'Push' })).toBeChecked()
  await props(a, { value: ['push'] })
  await expect(a.getByRole('checkbox', { name: 'Email' })).not.toBeChecked()
  await props(a, { value: 'email' })
  await expect(a.getByRole('checkbox', { name: 'Email' })).toBeChecked()
  await expect(a.getByRole('checkbox', { name: 'Push' })).not.toBeChecked()
  await expect(page.locator('#b')).toHaveJSProperty('value', ['x'])
})

test('group disabling keeps individually disabled options disabled', async ({ page, renderScenario }) => {
  await renderScenario(options)
  const group = page.locator('c2-checkbox-group')
  await props(group, { disabled: true })
  for (const checkbox of await page.getByRole('checkbox').all()) await expect(checkbox).toBeDisabled()
  await props(group, { disabled: false })
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeEnabled()
  await expect(page.getByRole('checkbox', { name: 'SMS' })).toBeDisabled()
})

test('group submits every checked value under its name, validates required and resets', async ({ page, renderScenario }) => {
  await renderScenario(
    '<form><c2-checkbox-group name="channels" value="email" required aria-label="Channels"><c2-checkbox value="email">Email</c2-checkbox><c2-checkbox value="push">Push</c2-checkbox></c2-checkbox-group></form>',
  )
  const group = page.locator('c2-checkbox-group')
  const form = page.locator('form')
  const submitted = () => form.evaluate((element) => new FormData(element as HTMLFormElement).getAll('channels'))
  await expect.poll(submitted).toEqual(['email'])
  await page.getByRole('checkbox', { name: 'Push' }).check()
  await expect.poll(submitted).toEqual(['email', 'push'])
  await page.getByRole('checkbox', { name: 'Email' }).uncheck()
  await page.getByRole('checkbox', { name: 'Push' }).uncheck()
  await expect.poll(submitted).toEqual([])
  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(false)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeChecked()
  await expect.poll(submitted).toEqual(['email'])
})

test('a disabled fieldset disables the group options', async ({ page, renderScenario }) => {
  await renderScenario(
    '<fieldset disabled><c2-checkbox-group aria-label="Channels"><c2-checkbox value="email">Email</c2-checkbox></c2-checkbox-group></fieldset>',
  )
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeDisabled()
  await page.locator('fieldset').evaluate((element) => ((element as HTMLFieldSetElement).disabled = false))
  await expect(page.getByRole('checkbox', { name: 'Email' })).toBeEnabled()
})

test('the required messages follow the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div lang="fr"><c2-checkbox id="terms" required>Terms</c2-checkbox><c2-checkbox-group required><c2-checkbox value="email">Email</c2-checkbox></c2-checkbox-group></div>',
  )
  const box = page.locator('#terms')
  const group = page.locator('c2-checkbox-group')
  await expect(box).toHaveJSProperty('validationMessage', 'Veuillez cocher cette case.')
  await expect(group).toHaveJSProperty('validationMessage', 'Veuillez sélectionner au moins une option.')
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'vi'))
  await expect(box).toHaveJSProperty('validationMessage', 'Vui lòng đánh dấu vào ô này.')
  await expect(group).toHaveJSProperty('validationMessage', 'Vui lòng chọn ít nhất một mục.')
  await page.locator('div[lang]').evaluate((el) => el.setAttribute('lang', 'de'))
  await expect(box).toHaveJSProperty('validationMessage', 'Please check this box.')
  await expect(group).toHaveJSProperty('validationMessage', 'Please select at least one option.')
})

test('an own disabled removed inside a disabled fieldset stays disabled until the fieldset is enabled', async ({ page, renderScenario }) => {
  await renderScenario('<form><fieldset disabled><c2-checkbox name="terms" disabled>Accept</c2-checkbox></fieldset></form>')
  const host = page.locator('c2-checkbox')
  await host.evaluate((element) => element.removeAttribute('disabled'))
  await expect(page.getByRole('checkbox')).toBeDisabled()
  await page.locator('fieldset').evaluate((fieldset) => ((fieldset as HTMLFieldSetElement).disabled = false))
  await expect(page.getByRole('checkbox')).toBeEnabled()
})

const modifiers =
  '<c2-checkbox-group name="toppings" max="2" min="1" aria-label="Toppings">' +
  '<c2-checkbox value="cheese">Cheese<span slot="trailing">+$1.00</span></c2-checkbox>' +
  '<c2-checkbox value="bacon">Bacon<span slot="trailing">+$2.00</span></c2-checkbox>' +
  '<c2-checkbox value="olives">Olives<span slot="trailing">+$0.50</span></c2-checkbox>' +
  '<c2-checkbox value="onion" disabled>Onion</c2-checkbox>' +
  '</c2-checkbox-group>'

test('max disables the unchecked options once reached and frees them when one is unchecked', async ({ page, renderScenario, tab }) => {
  await renderScenario(modifiers)
  const group = page.locator('c2-checkbox-group')
  await tab()
  await page.keyboard.press('Space')
  await tab()
  await page.keyboard.press('Space')
  await expect(group).toHaveJSProperty('value', ['cheese', 'bacon'])
  await expect(page.getByRole('checkbox', { name: 'Olives' })).toBeDisabled()
  // Space on the focused option still unchecks it, which frees the others.
  await page.keyboard.press('Space')
  await expect(group).toHaveJSProperty('value', ['cheese'])
  await expect(page.getByRole('checkbox', { name: 'Olives' })).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Bacon' }).check()
  // A click on an option the full group disabled changes nothing.
  await pointerClick(page.getByText('Olives'))
  await expect(group).toHaveJSProperty('value', ['cheese', 'bacon'])
  await page.getByRole('checkbox', { name: 'Bacon' }).uncheck()
  await expect(group).toHaveJSProperty('value', ['cheese'])
  await expect(page.getByRole('checkbox', { name: 'Olives' })).toBeEnabled()
  // An option disabled on its own stays disabled.
  await expect(page.getByRole('checkbox', { name: 'Onion' })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Olives' }).check()
  await expect(group).toHaveJSProperty('value', ['cheese', 'olives'])
  await accessible(page)
})

test('min and max validate the count with their messages', async ({ page, renderScenario }) => {
  await renderScenario(`<form>${modifiers}</form>`)
  const group = page.locator('c2-checkbox-group')
  const validity = () =>
    group.evaluate((element) => {
      const control = element as HTMLElement & { validity: ValidityState; validationMessage: string }
      const { rangeUnderflow, rangeOverflow, valueMissing, valid } = control.validity
      return { rangeUnderflow, rangeOverflow, valueMissing, valid, message: control.validationMessage }
    })
  await expect
    .poll(validity)
    .toEqual({ rangeUnderflow: true, rangeOverflow: false, valueMissing: false, valid: false, message: 'Please select at least one option.' })
  await props(group, { min: 2 })
  await expect.poll(validity).toMatchObject({ rangeUnderflow: true, message: 'Please select at least 2 options.' })
  await page.getByRole('checkbox', { name: 'Cheese' }).check()
  await page.getByRole('checkbox', { name: 'Bacon' }).check()
  await expect.poll(validity).toMatchObject({ valid: true, message: '' })
  // A value from script may pass max: it is kept and reported, and the user can uncheck options to fix it.
  await props(group, { value: ['cheese', 'bacon', 'olives'] })
  await expect.poll(validity).toMatchObject({ rangeOverflow: true, message: 'Please select no more than 2 options.' })
  const submitted = () => page.locator('form').evaluate((form) => new FormData(form as HTMLFormElement).getAll('toppings'))
  await expect.poll(submitted).toEqual(['cheese', 'bacon', 'olives'])
  await page.getByRole('checkbox', { name: 'Olives' }).uncheck()
  await expect.poll(validity).toMatchObject({ valid: true })
  await props(group, { max: 0, min: 0 })
  await page.getByRole('checkbox', { name: 'Olives' }).check()
  await expect.poll(submitted).toEqual(['cheese', 'bacon', 'olives'])
  await expect.poll(validity).toMatchObject({ valid: true })
})

test('the range messages follow the nearest lang', async ({ page, renderScenario }) => {
  await renderScenario(`<div lang="fr">${modifiers.replace('min="1"', 'min="2"')}</div>`)
  const group = page.locator('c2-checkbox-group')
  await expect(group).toHaveJSProperty('validationMessage', 'Veuillez sélectionner au moins 2 options.')
  await props(group, { value: ['cheese', 'bacon', 'olives'] })
  await expect(group).toHaveJSProperty('validationMessage', 'Veuillez sélectionner 2 options au maximum.')
})

test('the trailing slot sits at the end of the row and joins the clickable label', async ({ page, renderScenario }) => {
  await renderScenario(
    `<div style="width: 320px">${modifiers.replace('<c2-checkbox-group', '<c2-checkbox-group style="--c2-checkbox-group--align-items: stretch"')}</div>`,
  )
  const cheese = page.locator('c2-checkbox').first()
  const trailing = cheese.locator('[part="trailing"]')
  await expect(trailing).toBeVisible()
  await expect(page.locator('c2-checkbox').last().locator('[part="trailing"]')).toBeHidden()
  const row = await cheese.boundingBox()
  const price = await trailing.boundingBox()
  expect(Math.round((price?.x ?? 0) + (price?.width ?? 0))).toBe(Math.round((row?.x ?? 0) + (row?.width ?? 0)))
  await expect(page.getByRole('checkbox', { name: 'Cheese +$1.00', exact: true })).toBeVisible()
  await page.getByText('+$1.00').click()
  await expect(page.locator('c2-checkbox-group')).toHaveJSProperty('value', ['cheese'])
})

test('trailing presence follows slotted content', async ({ page, renderScenario }) => {
  const trailing = page.locator('c2-checkbox').locator('[part="trailing"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-checkbox>Cheese<span slot="trailing" data-slot-presence-probe>+$1.00</span></c2-checkbox>',
    host: 'c2-checkbox',
    slot: 'trailing',
    assertPresent: async (present) => (present ? expect(trailing).toBeVisible() : expect(trailing).toBeHidden()),
  })
})

test('max counts only values that match an option, and a min above max reads as max', async ({ page, renderScenario }) => {
  await renderScenario(modifiers.replace('min="1"', 'min="5" value="cheese;retired"'))
  const group = page.locator('c2-checkbox-group')
  await expect(page.getByRole('checkbox', { name: 'Bacon' })).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Bacon' }).check()
  await expect(page.getByRole('checkbox', { name: 'Olives' })).toBeDisabled()
  await props(group, { value: ['cheese', 'bacon'] })
  await expect.poll(() => group.evaluate((element) => (element as HTMLElement & { checkValidity(): boolean }).checkValidity())).toBe(true)
})

test('an option added inside a wrapper after the group is full cannot pass max, and one moved out is freed', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-checkbox-group max="1" value="a" aria-label="One"><div id="wrap"><c2-checkbox value="a">A</c2-checkbox></div></c2-checkbox-group><div id="outside"></div>',
  )
  const group = page.locator('c2-checkbox-group')
  await page.locator('#wrap').evaluate((wrap) => {
    const late = document.createElement('c2-checkbox')
    late.setAttribute('value', 'b')
    late.textContent = 'B'
    wrap.append(late)
  })
  // The lock reaches it only on the next sync; a click before that is undone instead of passing max.
  await pointerClick(page.getByRole('checkbox', { name: 'B' }))
  await expect(group).toHaveJSProperty('value', ['a'])
  await expect(page.getByRole('checkbox', { name: 'B' })).not.toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'B' })).toBeDisabled()
  await page.evaluate(() => document.querySelector('#outside')!.append(document.querySelector('c2-checkbox[value="b"]')!))
  await expect(page.getByRole('checkbox', { name: 'B' })).toBeEnabled()
})

test('default marks are drawn the first time their state is reached, and kept after', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept"></c2-checkbox>')
  const host = page.locator('c2-checkbox')
  const marks = () =>
    host.evaluate((el) => ({
      check: el.shadowRoot!.querySelectorAll('slot[name="checkmark"] svg').length,
      mixed: el.shadowRoot!.querySelectorAll('slot[name="mixedmark"] svg').length,
    }))
  // A box that was never checked carries no SVG: most boxes on a page.
  expect(await marks()).toEqual({ check: 0, mixed: 0 })
  await page.getByRole('checkbox').check()
  expect(await marks()).toEqual({ check: 1, mixed: 0 })
  // Unchecking keeps the mark, so it can fade out instead of vanishing.
  await page.getByRole('checkbox').uncheck()
  expect(await marks()).toEqual({ check: 1, mixed: 0 })
  await props(host, { indeterminate: true })
  expect(await marks()).toEqual({ check: 1, mixed: 1 })
})

test('a slotted mark replaces the default one, drawn or not', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Star" checked><span slot="checkmark" id="star">★</span></c2-checkbox>')
  const shown = await page.locator('c2-checkbox').evaluate((el) => {
    const slot = el.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="checkmark"]')!
    return slot.assignedElements().map((node) => node.id)
  })
  expect(shown).toEqual(['star'])
})

test('the hover layer still paints behind the box', async ({ page, renderScenario }) => {
  await renderScenario('<c2-checkbox aria-label="Accept" style="--c2-checkbox__state-layer__hover__unselected--color: rgb(255, 0, 0)"></c2-checkbox>')
  const layer = () =>
    page.locator('c2-checkbox').evaluate((el) => {
      const style = getComputedStyle(el.shadowRoot!.querySelector('.c2-checkbox__background')!, '::before')
      return { color: style.backgroundColor, width: style.width, opacity: Number(style.opacity) }
    })
  expect((await layer()).opacity).toBe(0)
  await page.getByRole('checkbox').hover()
  await expect.poll(async () => (await layer()).color).toBe('rgb(255, 0, 0)')
  await expect.poll(async () => (await layer()).opacity).toBeGreaterThan(0)
  expect((await layer()).width).toBe('32px')
})
