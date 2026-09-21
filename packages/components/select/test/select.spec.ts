import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const rows = '<c2-list-item value="a">Apple</c2-list-item><c2-list-item value="b">Berry</c2-list-item>'

test('is labelable: a `for` label names it and clicking the label focuses it', async ({ page, renderScenario }) => {
  // `static formAssociated = true` makes the element labelable, which is what `c2-label[for]` needs as well.
  await renderScenario(`<label for="fruit">Fruit</label><c2-select id="fruit" placeholder="Choose fruit">${rows}</c2-select>`)
  const host = page.locator('c2-select')
  await expect(host).toHaveJSProperty('labels.length', 1)
  await page.locator('label').click()
  // `delegatesFocus` sends it on to the trigger inside the shadow root.
  await expect.poll(() => page.evaluate(() => document.activeElement?.localName)).toBe('c2-select')
  // And the name has to reach the button, which is what a screen reader actually lands on. Neither route
  // gets there by itself: `aria-labelledby` cannot cross the shadow boundary, and a `<label>` names the host.
  await expect(page.getByRole('button', { name: 'Fruit' })).toBeVisible()
})

test('takes its accessible name from an aria-labelledby set after upgrade', async ({ page, renderScenario }) => {
  // The shape `c2-label[for]` produces: it finds its target and sets the attribute once both have upgraded.
  await renderScenario(`<span id="fruit-label">Fruit</span><c2-select placeholder="Choose fruit">${rows}</c2-select>`)
  await page.locator('c2-select').evaluate((element) => element.setAttribute('aria-labelledby', 'fruit-label'))
  await expect(page.getByRole('button', { name: 'Fruit' })).toBeVisible()
})

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

// A form control is expected to announce a new value as `input`/`change`, which is what a framework's two-way
// binding listens for: `v-model`, and Angular's `ControlValueAccessor`, know nothing about `selection-change`.
test('picking an option fires input and change as well as selection-change', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-select placeholder="Choose fruit">${rows}</c2-select>`)
  const host = page.locator('c2-select')
  await host.evaluate((element) => {
    const seen: string[] = []
    for (const name of ['selection-change', 'input', 'change']) element.addEventListener(name, (event) => seen.push(event.type))
    element.setAttribute('data-seen', '[]')
    element.addEventListener('change', () => element.setAttribute('data-seen', JSON.stringify(seen)))
  })

  await page.getByRole('button', { name: 'Choose fruit' }).click()
  await page.getByRole('option', { name: 'Berry' }).click()

  await expect(host).toHaveAttribute('data-seen', '["selection-change","input","change"]')
})

test('consumer-owned trigger and option slots remain directly styleable', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-select><span class="slot-probe" slot="button-content">Choose</span><span class="slot-probe" slot="button-prefix-icon">P</span><span class="slot-probe" slot="button-suffix-icon">S</span><span class="slot-probe" slot="default">Option</span></c2-select>`,
  )
  await page.locator('.slot-probe').evaluateAll((nodes) => nodes.forEach((node) => ((node as HTMLElement).style.color = 'rgb(1, 2, 3)')))
  await expect
    .poll(() => page.locator('.slot-probe').evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).style.color)))
    .toEqual(Array(4).fill('rgb(1, 2, 3)'))
})
