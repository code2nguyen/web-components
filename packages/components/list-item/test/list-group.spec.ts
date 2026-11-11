import { test, expect, props, accessible } from '../../../../tests/component-fixture'
import type { ListGroup } from '../src/list-group'

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
const header = (id: string) => `#${id} >> button.button >> nth=0`

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
  await expect(items).toHaveAttribute('aria-labelledby', 'label')
  await expect(page.locator(header('projects'))).toHaveAttribute('aria-controls', 'items')
  // The heading comes from `label`, and the `label` slot replaces it.
  await expect(page.locator(header('projects'))).toContainText('Projects')
  await renderScenario('<c2-list-group id="slotted" label="Fallback"><span slot="label">Team</span></c2-list-group>')
  await expect(page.locator(header('slotted'))).toHaveAccessibleName('Team')
})

test('a control in the suffix keeps its click, the rest of the header toggles', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-group id="g" label="Projects">
      <span slot="suffix" class="count">3</span>
      <button slot="suffix" class="add" aria-label="Add project">+</button>
      <c2-list-item href="#a">A</c2-list-item>
    </c2-list-group>
  `)
  const group = page.locator('#g')
  let added = 0
  await page.exposeFunction('added', () => added++)
  await page.locator('.add').evaluate((button) => button.addEventListener('click', () => (window as unknown as { added: () => void }).added()))
  await page.locator('.add').click()
  await page.locator('.add').press('Enter')
  await expect(group).toHaveJSProperty('open', false)
  expect(added).toBe(2)
  // The button's name stays the heading: the suffix is outside it.
  await expect(page.locator(header('g'))).toHaveAccessibleName('Projects')
  await page.locator('.count').click()
  await expect(group).toHaveJSProperty('open', true)
  await page.locator('#g >> .toggle-icon').click()
  await expect(group).toHaveJSProperty('open', false)
})

test('empty icon and suffix wrappers are hidden, filled ones shown', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-group id="bare" label="Bare"></c2-list-group>
    <c2-list-group id="full" label="Full"><svg slot="prefix-icon" viewBox="0 0 24 24"></svg><span slot="suffix">3</span></c2-list-group>
  `)
  await expect(page.locator('#bare >> [part="prefix-icon"]')).toBeHidden()
  await expect(page.locator('#bare >> [part="suffix"]')).toBeHidden()
  await expect(page.locator('#full >> [part="prefix-icon"]')).toBeVisible()
  await expect(page.locator('#full >> [part="suffix"]')).toBeVisible()
})

test('the chevron turns the other way in a right-to-left document', async ({ page, renderScenario }) => {
  await renderScenario('<c2-list-group id="ltr" label="A" open></c2-list-group><div dir="rtl"><c2-list-group id="rtl" label="B" open></c2-list-group></div>')
  await expect(page.locator('#ltr >> .toggle-icon')).toHaveCSS('rotate', '90deg')
  await expect(page.locator('#rtl >> .toggle-icon')).toHaveCSS('rotate', '-90deg')
  await expect(page.locator('#rtl >> .toggle-icon')).toHaveCSS('scale', '-1 1')
})

test('the rows group is named by the heading alone, without the count', async ({ page, renderScenario, browserName }) => {
  // Playwright's own name computation does not follow slot fallback content through aria-labelledby, so read the
  // browser's accessibility tree (Chromium only).
  test.skip(browserName !== 'chromium', 'reads the Chromium accessibility tree')
  await renderScenario(NAV)
  await page.locator(header('projects')).click()
  const cdp = await page.context().newCDPSession(page)
  const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: { role?: { value: string }; name?: { value: string } }[] }
  const named = (role: string) => nodes.filter((node) => node.role?.value === role).map((node) => node.name?.value)
  expect(named('group')).toEqual(['Projects'])
  expect(named('button')).toContain('Projects')
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
    ;(element as ListGroup).toggle(false)
    await (element as ListGroup).updateComplete
  })
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['open>closed:false', 'closed>open:false', 'open>closed:false'])
})

test('a current row with its own background keeps it on hover unless a hover colour is given', async ({ page, renderScenario }) => {
  await renderScenario(`
    <c2-list-item id="plain" href="#a" current style="--c2-list-item__current--background: rgb(1, 2, 3)">A</c2-list-item>
    <c2-list-item id="hover" href="#b" current style="--c2-list-item__current--background: rgb(1, 2, 3); --c2-list-item__current__hover--background: rgb(4, 5, 6)">B</c2-list-item>
  `)
  await page.locator('#plain').hover()
  await expect(page.locator('#plain .c2-list-item')).toHaveCSS('background-color', 'rgb(1, 2, 3)')
  await page.locator('#hover').hover()
  await expect(page.locator('#hover .c2-list-item')).toHaveCSS('background-color', 'rgb(4, 5, 6)')
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
