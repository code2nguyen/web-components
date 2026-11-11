import { test, expect, props, accessible } from '../../../../tests/component-fixture'

const NAV = `
  <nav aria-label="Main">
    <c2-list-item href="#home" current>Home</c2-list-item>
    <c2-list-group label="Projects" id="projects">
      <span slot="suffix" class="count">3</span>
      <c2-list-item href="#alpha">Alpha</c2-list-item>
      <c2-list-item href="#beta">Beta</c2-list-item>
      <c2-list-group label="Archived" id="archived">
        <c2-list-item href="#old">Old</c2-list-item>
      </c2-list-group>
    </c2-list-group>
  </nav>
`

// The group's own header: `>>` would also pierce into a nested group's shadow root.
const header = (id: string) => `#${id} >> button.header >> nth=0`

test('the header opens and closes the group from the pointer and the keyboard', async ({ page, renderScenario }) => {
  await renderScenario(NAV)
  const group = page.locator('#projects')
  const button = page.locator(header('projects'))
  const alpha = page.locator('c2-list-item[href="#alpha"]')

  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect(alpha).toBeHidden()

  await button.click()
  await expect(group).toHaveJSProperty('open', true)
  await expect(group).toHaveAttribute('open', '')
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(alpha).toBeVisible()

  await button.press('Enter')
  await expect(group).toHaveJSProperty('open', false)
  await expect(alpha).toBeHidden()

  await button.press('Space')
  await expect(group).toHaveJSProperty('open', true)
  // The rows of an open group are reachable with Tab, a closed nested group's rows are not.
  await button.press('Tab')
  await expect(alpha).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page.locator(header('archived'))).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('c2-list-item[href="#old"]')).not.toBeFocused()
  await accessible(page)
})

test('the rows sit in a group labelled by the header, which controls it', async ({ page, renderScenario }) => {
  await renderScenario(NAV)
  const items = page.locator('#projects >> div.items >> nth=0')
  await expect(items).toHaveAttribute('role', 'group')
  await expect(items).toHaveAttribute('aria-labelledby', 'header')
  await expect(page.locator(header('projects'))).toHaveAttribute('aria-controls', 'items')
  // The heading comes from `label`, and the `label` slot replaces it.
  await expect(page.locator(header('projects'))).toContainText('Projects')
  await renderScenario('<c2-list-group id="slotted" label="Fallback"><span slot="label">Team</span></c2-list-group>')
  await expect(page.locator(header('slotted'))).toHaveAccessibleName('Team')
})

test('toggle fires a non-bubbling ToggleEvent for user and programmatic changes, not on first render', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-group id="g" label="Settings" open><c2-list-item href="#a">A</c2-list-item></c2-list-group>')
  const group = page.locator('#g')
  await group.evaluate((element) => {
    const seen: string[] = []
    ;(window as unknown as { seen: string[] }).seen = seen
    element.addEventListener('toggle', (event) => seen.push(`${(event as ToggleEvent).oldState}>${(event as ToggleEvent).newState}:${event.bubbles}`))
    document.addEventListener('toggle', () => seen.push('document'))
  })
  await page.locator(header('g')).click()
  await props(group, { open: true })
  await group.evaluate(async (element) => {
    ;(element as HTMLElementTagNameMap['c2-list-group']).toggle(false)
    await (element as HTMLElementTagNameMap['c2-list-group']).updateComplete
  })
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['open>closed:false', 'closed>open:false', 'open>closed:false'])
})

test('a current row is announced as the page and drawn with the current look', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item id="home" href="#home" current>Home</c2-list-item>
    <c2-list-item id="other" href="#other">Other</c2-list-item>
    <c2-list-item id="custom" href="#c" current style="--c2-list-item__current--background: rgb(1, 2, 3)">Custom</c2-list-item>
  `)
  const home = page.locator('#home')
  const other = page.locator('#other')
  await expect(home).toHaveHostAria('aria-current', 'page')
  await expect(home).toHaveHostAria('role', 'link')
  await expect(other).toHaveHostAria('aria-current', null)
  // The current look defaults to the selected one.
  await expect(home.locator('.c2-list-item')).toHaveCSS('background-color', 'rgb(237, 241, 254)')
  await expect(other.locator('.c2-list-item')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('#custom .c2-list-item')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  // Nothing is written on the host.
  expect(await home.evaluate((element) => element.getAttributeNames().filter((name) => name.startsWith('aria-') || name === 'role'))).toEqual([])

  await props(home, { current: false })
  await expect(home).toHaveHostAria('aria-current', null)
  await props(other, { current: true })
  await expect(other).toHaveHostAria('aria-current', 'page')
  await expect(other).toHaveAttribute('current', '')
})

test('current is off by default and leaves the row as it was', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-item id="row" value="a">Row</c2-list-item>')
  const row = page.locator('#row')
  await expect(row).toHaveJSProperty('current', false)
  expect(await row.evaluate((element) => element.hasAttribute('current'))).toBe(false)
  await expect(row).toHaveHostAria('aria-current', null)
  // `current="false"` from a framework that stringifies attributes stays off.
  await renderScenario('<c2-list-item id="row" value="a" current="false">Row</c2-list-item>')
  await expect(page.locator('#row')).toHaveHostAria('aria-current', null)
})
