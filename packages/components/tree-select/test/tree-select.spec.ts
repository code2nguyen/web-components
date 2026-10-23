import type { Page } from '@playwright/test'
import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

const TEAMS = [
  {
    value: 'eng',
    label: 'Engineering',
    children: [
      { value: 'platform', label: 'Platform' },
      { value: 'frontend', label: 'Frontend' },
      {
        value: 'data',
        label: 'Data',
        children: [
          { value: 'data-platform', label: 'Data platform' },
          { value: 'analytics', label: 'Analytics' },
        ],
      },
    ],
  },
  {
    value: 'design',
    label: 'Design',
    children: [
      { value: 'product-design', label: 'Product design' },
      { value: 'brand', label: 'Brand' },
    ],
  },
  {
    value: 'sales',
    label: 'Sales',
    children: [
      { value: 'emea', label: 'EMEA' },
      { value: 'platform-partnerships', label: 'Platform partnerships' },
    ],
  },
  { value: 'legal', label: 'Legal', disabled: true },
]

const items = `items='${JSON.stringify(TEAMS)}'`

// The tree and its rows state their roles through ElementInternals, which getByRole cannot see: find them by tag.
const tree = (page: Page) => page.locator('c2-tree-select c2-tree')
const item = (page: Page, value: string) => page.locator(`c2-tree-select c2-tree-item[value="${value}"]`)
// A branch's box holds its children too, so click its own row rather than the middle of the host.
const row = (page: Page, value: string) => item(page, value).locator('[part="row"]').first()
const toggle = (page: Page, value: string) => item(page, value).locator('[part="toggle"]').first()
const host = (page: Page) => page.locator('c2-tree-select')
const trigger = (page: Page) => page.locator('c2-tree-select #button')
const focusedTag = (page: Page) =>
  page.evaluate(() => {
    let active = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    return active ? `${active.localName}${active.id ? `#${active.id}` : ''}${active.getAttribute('value') ? `[${active.getAttribute('value')}]` : ''}` : null
  })

test('a single pick closes the dropdown and shows the label, with its path', async ({ page, renderScenario }) => {
  await renderScenario(`<label for="team">Owning team</label><c2-tree-select id="team" show-path placeholder="Select a team" ${items}></c2-tree-select>`)
  await watch(host(page), 'selection-change')
  await page.getByRole('button', { name: 'Owning team' }).click()
  await expect(tree(page)).toBeVisible()
  await expect(tree(page)).toHaveHostAria('role', 'tree')
  await toggle(page, 'eng').click()
  await row(page, 'platform').click()
  await expect(tree(page)).not.toBeVisible()
  await expect(host(page)).toHaveJSProperty('value', ['platform'])
  await expect(trigger(page)).toHaveText('Engineering / Platform')
  await expect(host(page)).toHaveAttribute('data-events', JSON.stringify([{ value: ['platform'], nodes: [{ value: 'platform', label: 'Platform' }] }]))
  await accessible(page)
})

test('picking the selected row again keeps it, and leaf-only expands a branch instead of picking it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" leaf-only value="platform" ${items}></c2-tree-select>`)
  await watch(host(page), 'selection-change')
  await trigger(page).click()
  // Opening expands the ancestors of the selection.
  await expect(row(page, 'platform')).toBeVisible()
  await row(page, 'platform').click()
  await expect(tree(page)).not.toBeVisible()
  await expect(host(page)).toHaveJSProperty('value', ['platform'])

  await trigger(page).click()
  await row(page, 'design').click()
  await expect(tree(page)).toBeVisible()
  await expect(row(page, 'brand')).toBeVisible()
  await expect(host(page)).toHaveJSProperty('value', ['platform'])
  await expect(item(page, 'design')).toHaveJSProperty('selected', false)
  await expect(host(page)).toHaveAttribute('data-events', '[]')
})

test('the keyboard opens on the selected row, walks the tree, picks and returns focus', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" value="platform" ${items}></c2-tree-select>`)
  await trigger(page).focus()
  await page.keyboard.press('ArrowDown')
  await expect(tree(page)).toBeVisible()
  await expect.poll(() => focusedTag(page)).toBe('c2-tree-item[platform]')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(tree(page)).not.toBeVisible()
  await expect(host(page)).toHaveJSProperty('value', ['frontend'])
  await expect.poll(() => focusedTag(page)).toBe('button#button')

  await page.keyboard.press('Enter')
  await expect(tree(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tree(page)).not.toBeVisible()
  await expect.poll(() => focusedTag(page)).toBe('button#button')
  await expect(host(page)).toHaveJSProperty('value', ['frontend'])
})

test('multiple: a row click toggles it, chips show the values and can be removed', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Visible to" multiple max-chips="2" ${items}></c2-tree-select>`)
  await trigger(page).click()
  await row(page, 'design').click()
  await row(page, 'sales').click()
  await row(page, 'eng').click()
  await expect(tree(page)).toBeVisible()
  await expect(host(page)).toHaveJSProperty('value', ['eng', 'design', 'sales'])
  await expect(page.locator('c2-tree-select .footer .count')).toHaveText('3 selected')
  // A second click on a selected row takes it out again rather than replacing the selection.
  await row(page, 'design').click()
  await expect(host(page)).toHaveJSProperty('value', ['eng', 'sales'])
  await row(page, 'design').click()

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(tree(page)).not.toBeVisible()
  await expect(page.locator('c2-tree-select .chip-label')).toHaveText(['Engineering', 'Design'])
  await expect(page.locator('c2-tree-select .chip.more')).toHaveText('+1')
  await page.getByRole('button', { name: 'Remove Design' }).click()
  await expect(host(page)).toHaveJSProperty('value', ['eng', 'sales'])
  await expect(tree(page)).not.toBeVisible()

  await trigger(page).focus()
  await page.keyboard.press('Backspace')
  await expect(host(page)).toHaveJSProperty('value', ['eng'])
  await accessible(page)
})

test('checkbox-selection: value-display decides which ticked rows the value holds', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-tree-select aria-label="Parents" checkbox-selection ${items}></c2-tree-select><c2-tree-select aria-label="Leaves" checkbox-selection value-display="leaves" ${items}></c2-tree-select>`,
  )
  const [parents, leaves] = [host(page).first(), host(page).last()]
  const check = (index: number, value: string) => host(page).nth(index).locator(`c2-tree-item[value="${value}"]`).locator('input[type="checkbox"]').first()

  await parents.locator('#button').click()
  await check(0, 'eng').click()
  await expect(parents).toHaveJSProperty('value', ['eng'])
  await expect(parents.locator('c2-tree')).toHaveJSProperty('value', ['eng', 'platform', 'frontend', 'data', 'data-platform', 'analytics'])
  await parents.locator('c2-tree-item[value="eng"] [part="toggle"]').first().click()
  await check(0, 'frontend').click()
  await expect(parents).toHaveJSProperty('value', ['platform', 'data'])
  await page.keyboard.press('Escape')

  await leaves.locator('#button').click()
  await check(1, 'eng').click()
  await expect(leaves).toHaveJSProperty('value', ['platform', 'frontend', 'data-platform', 'analytics'])
  await page.keyboard.press('Escape')

  // A value set from outside ticks the rows it stands for.
  await parents.evaluate((element) => ((element as HTMLElement & { value: string[] }).value = ['design']))
  await expect(parents.locator('c2-tree')).toHaveJSProperty('value', ['design', 'product-design', 'brand'])
  await expect(parents.locator('.chip-label')).toHaveText(['Design'])
})

test('search keeps the matches and their ancestors, and Enter picks the first match', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" searchable ${items}></c2-tree-select>`)
  await trigger(page).click()
  const search = page.getByRole('textbox', { name: 'Search' })
  await expect(search).toBeFocused()
  await search.fill('plat')
  await expect(page.locator('c2-tree-select .status')).toHaveText('3 matches')
  for (const value of ['eng', 'platform', 'data', 'data-platform', 'sales', 'platform-partnerships']) await expect(row(page, value)).toBeVisible()
  for (const value of ['frontend', 'design', 'legal']) await expect(item(page, value)).toBeHidden()
  await expect(item(page, 'platform').locator('mark')).toHaveText('Plat')

  await search.press('Enter')
  await expect(tree(page)).not.toBeVisible()
  await expect(host(page)).toHaveJSProperty('value', ['platform'])

  // Closing drops the search, and every row is back.
  await trigger(page).click()
  await expect(search).toHaveValue('')
  await expect(row(page, 'design')).toBeVisible()
  await search.fill('payroll')
  await expect(page.locator('c2-tree-select .message')).toHaveText('No match for “payroll”')
  await expect(tree(page)).toBeHidden()
  await accessible(page)
})

test('ArrowDown moves from the search field into the filtered tree', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" searchable ${items}></c2-tree-select>`)
  await trigger(page).click()
  await page.getByRole('textbox', { name: 'Search' }).fill('brand')
  await page.keyboard.press('ArrowDown')
  await expect.poll(() => focusedTag(page)).toBe('c2-tree-item[design]')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(host(page)).toHaveJSProperty('value', ['brand'])
})

test('rows authored in markup are slotted into the tree', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Folder" placeholder="Pick a folder">
    <c2-tree-item value="src" label="src"><c2-tree-item value="app" label="app.ts"></c2-tree-item></c2-tree-item>
    <c2-tree-item value="docs" label="docs"></c2-tree-item>
  </c2-tree-select>`)
  await trigger(page).click()
  await page.locator('c2-tree-item[value="src"] [part="toggle"]').first().click()
  await page.locator('c2-tree-item[value="app"] [part="row"]').first().click()
  await expect(host(page)).toHaveJSProperty('value', ['app'])
  await expect(trigger(page)).toHaveText('app.ts')
  await expect.poll(() => focusedTag(page)).toBe('button#button')
})

test('clearable clears the value; max-chips="0" shows a count', async ({ page, renderScenario }) => {
  await renderScenario(
    `<c2-tree-select aria-label="Team" clearable value="brand" ${items}></c2-tree-select><c2-tree-select aria-label="Teams" multiple max-chips="0" value="brand;emea" ${items}></c2-tree-select>`,
  )
  await expect(trigger(page).first()).toHaveText('Brand')
  await expect(trigger(page).last()).toHaveText('2 selected')
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(host(page).first()).toHaveJSProperty('value', [])
  await expect(page.getByRole('button', { name: 'Clear selection' })).toHaveCount(0)
})

test('takes part in forms: values, required validity and reset', async ({ page, renderScenario }) => {
  await renderScenario(
    `<form><c2-tree-select aria-label="Team" name="team" value="brand" ${items}></c2-tree-select><c2-tree-select aria-label="Teams" name="teams" multiple value="brand;emea" ${items}></c2-tree-select><c2-tree-select aria-label="Owner" name="owner" required ${items}></c2-tree-select></form>`,
  )
  const data = () =>
    page.locator('form').evaluate((form) => {
      const formData = new FormData(form as HTMLFormElement)
      return { team: formData.get('team'), teams: formData.getAll('teams'), owner: formData.get('owner'), valid: (form as HTMLFormElement).checkValidity() }
    })
  await expect.poll(data).toEqual({ team: 'brand', teams: ['brand', 'emea'], owner: null, valid: false })
  await expect(host(page).last()).toHaveJSProperty('validationMessage', 'Please select an option.')

  await trigger(page).first().click()
  await row(page, 'product-design').first().click()
  await expect.poll(data).toEqual({ team: 'product-design', teams: ['brand', 'emea'], owner: null, valid: false })
  await page.locator('form').evaluate((form) => (form as HTMLFormElement).reset())
  await expect(host(page).first()).toHaveJSProperty('value', ['brand'])
})

test('a disabled select does not open', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" disabled ${items}></c2-tree-select>`)
  await expect(trigger(page)).toBeDisabled()
  await page.locator('c2-tree-select .chevron').click({ force: true })
  await expect(host(page)).toHaveJSProperty('open', false)
  await expect(tree(page)).not.toBeVisible()
})

test('fires input and change with selection-change, and keeps the tree event inside', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" ${items}></c2-tree-select>`)
  await host(page).evaluate((element) => {
    const seen: string[] = []
    for (const name of ['selection-change', 'input', 'change'])
      element.addEventListener(name, (event) => seen.push(`${name}:${'detail' in event ? Object.keys((event as CustomEvent).detail).join(',') : ''}`))
    ;(element as HTMLElement & { seen: string[] }).seen = seen
  })
  await trigger(page).click()
  await row(page, 'sales').click()
  await expect(host(page)).toHaveJSProperty('seen', ['selection-change:value,nodes', 'input:', 'change:'])
})

test('rows added after the select connected are picked up', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Folder" placeholder="Pick a folder"></c2-tree-select>`)
  await host(page).evaluate((element) => {
    element.innerHTML = '<c2-tree-item value="src" label="src"></c2-tree-item><c2-tree-item value="docs" label="docs"></c2-tree-item>'
  })
  await trigger(page).click()
  await page.locator('c2-tree-item[value="docs"] [part="row"]').first().click()
  await expect(host(page)).toHaveJSProperty('value', ['docs'])
  await expect(trigger(page)).toHaveText('docs')
})

test('checkbox-selection with leaf-only keeps branches out of the value', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Teams" checkbox-selection leaf-only ${items}></c2-tree-select>`)
  await trigger(page).click()
  await item(page, 'design').locator('input[type="checkbox"]').first().click()
  await expect(host(page)).toHaveJSProperty('value', ['product-design', 'brand'])
  await expect(tree(page)).toHaveJSProperty('value', ['design', 'product-design', 'brand'])
})

test('with one-way propagation the value is every ticked row, and ticks survive', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Teams" checkbox-selection selection-propagation="parents" ${items}></c2-tree-select>`)
  await trigger(page).click()
  await toggle(page, 'design').click()
  await item(page, 'brand').locator('input[type="checkbox"]').first().click()
  await expect(host(page)).toHaveJSProperty('value', ['brand'])
  // Ticking the last child ticks the branch, and the value keeps both.
  await item(page, 'product-design').locator('input[type="checkbox"]').first().click()
  await expect(host(page)).toHaveJSProperty('value', ['design', 'product-design', 'brand'])
  await expect(tree(page)).toHaveJSProperty('value', ['design', 'product-design', 'brand'])
})

test('Enter in the search ticks the first match through the tree', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Teams" checkbox-selection searchable ${items}></c2-tree-select>`)
  await trigger(page).click()
  await page.getByRole('textbox', { name: 'Search' }).fill('design')
  await page.keyboard.press('Enter')
  // "Design" is the first match; ticking it ticks its children, and the value holds the branch.
  await expect(host(page)).toHaveJSProperty('value', ['design'])
  await expect(tree(page)).toHaveJSProperty('value', ['design', 'product-design', 'brand'])
})

test('search leaves a row the author hid hidden', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Folder" searchable>
    <c2-tree-item value="src" label="src"></c2-tree-item>
    <c2-tree-item value="archive" label="src-archive" hidden></c2-tree-item>
  </c2-tree-select>`)
  await trigger(page).click()
  const search = page.getByRole('textbox', { name: 'Search' })
  await search.fill('src')
  await expect(page.locator('c2-tree-select .status')).toHaveText('1 match')
  await search.fill('')
  await expect(page.locator('c2-tree-item[value="src"]')).toBeVisible()
  await expect(page.locator('c2-tree-item[value="archive"]')).toBeHidden()
})

test('rows loaded during a search are filtered too', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Cost centre" searchable></c2-tree-select>`)
  await host(page).evaluate((element) => {
    const select = element as HTMLElement & { items: unknown; loadChildren: unknown }
    select.items = [{ value: 'sales', label: 'Sales', hasChildren: true }]
    select.loadChildren = async () => [
      { value: 'sales-emea', label: 'Sales EMEA' },
      { value: 'support', label: 'Support desk' },
    ]
  })
  await trigger(page).click()
  await page.getByRole('textbox', { name: 'Search' }).fill('sales')
  await toggle(page, 'sales').click()
  await expect(row(page, 'sales-emea')).toBeVisible()
  // "Support desk" sits under a matching branch, so it stays reachable; the filter only recounts the matches.
  await expect(page.locator('c2-tree-select .status')).toHaveText('2 matches')
})

test('open on a read-only select does not stay set', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-tree-select aria-label="Team" readonly open ${items}></c2-tree-select>`)
  await expect(host(page)).toHaveJSProperty('open', false)
  await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(tree(page)).not.toBeVisible()
})
