import { test, expect, watch, accessible } from '../../../../tests/component-fixture'

/** Two panels and two plain links. The delays are zeroed so the assertions are about behaviour, not timing. */
const bar = (attributes = 'open-delay="0" close-delay="0"') => `<c2-navigation-menu aria-label="Main" ${attributes}>
  <c2-navigation-menu-item value="products">
    Products
    <div class="grid" slot="panel">
      <c2-navigation-menu-link href="#analytics">Analytics<span slot="description">Realtime dashboards</span></c2-navigation-menu-link>
      <c2-navigation-menu-link href="#warehouse">Warehouse<span slot="description">Columnar storage</span></c2-navigation-menu-link>
    </div>
  </c2-navigation-menu-item>
  <c2-navigation-menu-item value="solutions">
    Solutions
    <div class="grid" slot="panel">
      <c2-navigation-menu-link href="#startups">Startups</c2-navigation-menu-link>
      <c2-navigation-menu-link href="#enterprise">Enterprise</c2-navigation-menu-link>
    </div>
  </c2-navigation-menu-item>
  <c2-navigation-menu-item value="docs" href="#docs">Docs</c2-navigation-menu-item>
  <c2-navigation-menu-item value="pricing" href="#pricing" current>Pricing</c2-navigation-menu-item>
</c2-navigation-menu>`

test('renders a navigation landmark of links and triggers', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  await expect(page.getByRole('list')).toBeVisible()
  await expect(page.getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Products' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', '#docs')
  await expect(page.getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
  await accessible(page)
})

test('hovering a trigger opens its panel and moving to the next one switches', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  const host = page.locator('c2-navigation-menu')
  await watch(host, 'value-change')

  await page.getByRole('button', { name: 'Products' }).hover()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Products' })).toHaveAttribute('aria-expanded', 'true')
  await accessible(page)

  await page.getByRole('button', { name: 'Solutions' }).hover()
  await expect(page.getByRole('group', { name: 'Solutions' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
  await expect(host).toHaveJSProperty('value', 'solutions')
  await expect(host).toHaveAttribute('data-events', '[{"value":"products"},{"value":"solutions"}]')
})

test('the panel stays open while the pointer is inside it', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await page.getByRole('button', { name: 'Products' }).hover()
  const panel = page.getByRole('group', { name: 'Products' })
  await expect(panel).toBeVisible()

  await page.getByRole('link', { name: 'Analytics Realtime dashboards' }).hover()
  await expect(panel).toBeVisible()
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('value', 'products')
})

test('leaving the bar closes the open panel', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await page.getByRole('button', { name: 'Products' }).hover()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()

  // Out of the bar and out of the panel: the pointer is over the page itself.
  await page.mouse.move(820, 520)
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('value', '')
})

test('hovering a plain link closes the open panel', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await page.getByRole('button', { name: 'Products' }).hover()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await page.getByRole('link', { name: 'Docs' }).hover()
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
})

test('open-on="click" ignores hover and toggles on click', async ({ page, renderScenario }) => {
  await renderScenario(bar('open-on="click"'))
  const trigger = page.getByRole('button', { name: 'Products' })
  const panel = page.getByRole('group', { name: 'Products' })

  await trigger.hover()
  await expect(panel).not.toBeVisible()

  await trigger.click()
  await expect(panel).toBeVisible()
  await trigger.click()
  await expect(panel).not.toBeVisible()
})

test('clicking a link inside a panel closes the bar', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await page.getByRole('button', { name: 'Products' }).click()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()

  await page.getByRole('link', { name: 'Warehouse Columnar storage' }).click()
  await expect(page).toHaveURL(/#warehouse$/)
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
})

test('a click outside dismisses the panel', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await page.getByRole('button', { name: 'Products' }).click()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('value', '')
})

test('the arrow keys walk the bar and open the panel on the focused trigger', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  const products = page.getByRole('button', { name: 'Products' })
  await products.focus()

  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Solutions' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('link', { name: 'Pricing' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(products).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('link', { name: 'Pricing' })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(products).toBeFocused()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Analytics Realtime dashboards' })).toBeFocused()
})

test('arrowing along the bar while a panel is open keeps browsing panels', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await page.getByRole('button', { name: 'Products' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()

  await page.getByRole('button', { name: 'Products' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('group', { name: 'Solutions' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()

  // Moving on to a plain link closes the last panel instead of opening one.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('link', { name: 'Docs' })).toBeFocused()
  await expect(page.getByRole('group', { name: 'Solutions' })).not.toBeVisible()
})

test('Escape closes the panel and returns focus to its trigger', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  const trigger = page.getByRole('button', { name: 'Products' })
  await trigger.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('link', { name: 'Analytics Realtime dashboards' })).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('group', { name: 'Products' })).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

test('Tab from an open trigger walks into the panel', async ({ page, renderScenario, tab }) => {
  await renderScenario(bar())
  const trigger = page.getByRole('button', { name: 'Products' })
  await trigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await trigger.focus()

  await tab()
  await expect(page.getByRole('link', { name: 'Analytics Realtime dashboards' })).toBeFocused()
})

test('value opens a panel from code and reports every change', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  const host = page.locator('c2-navigation-menu')
  await watch(host, 'value-change')

  await host.evaluate(async (element) => {
    const menu = element as unknown as { open: (value: string) => void; updateComplete: Promise<boolean> }
    menu.open('solutions')
    await menu.updateComplete
  })
  await expect(page.getByRole('group', { name: 'Solutions' })).toBeVisible()

  await host.evaluate(async (element) => {
    const menu = element as unknown as { close: () => void; updateComplete: Promise<boolean> }
    menu.close()
    await menu.updateComplete
  })
  await expect(page.getByRole('group', { name: 'Solutions' })).not.toBeVisible()
  await expect(host).toHaveAttribute('data-events', '[{"value":"solutions"},{"value":""}]')
})

test('an open trigger squares off against its panel and its indicator spans the full width', async ({ page, renderScenario }) => {
  await renderScenario(bar('open-on="click"'))
  const trigger = page.locator('c2-navigation-menu-item[value="products"]')
  const geometry = () =>
    trigger.evaluate((item) => {
      const control = item.shadowRoot!.querySelector('.trigger') as HTMLElement
      const indicator = item.shadowRoot!.querySelector('.indicator') as HTMLElement
      const style = getComputedStyle(control)
      return {
        sameWidth: Math.round(indicator.getBoundingClientRect().width) === Math.round(control.getBoundingClientRect().width),
        bottomLeft: style.borderBottomLeftRadius,
        bottomRight: style.borderBottomRightRadius,
        topLeft: style.borderTopLeftRadius,
      }
    })

  expect(await geometry()).toEqual({ sameWidth: true, bottomLeft: '6px', bottomRight: '6px', topLeft: '6px' })

  await page.getByRole('button', { name: 'Products' }).click()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  // Open: the bottom corners meet the panel, the top ones keep their radius.
  expect(await geometry()).toEqual({ sameWidth: true, bottomLeft: '0px', bottomRight: '0px', topLeft: '6px' })
})

test('a trigger marks itself while the current page is one of its panel rows', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main">
    <c2-navigation-menu-item value="products">
      Products
      <div class="grid" slot="panel">
        <c2-navigation-menu-link href="#analytics" current>Analytics</c2-navigation-menu-link>
        <c2-navigation-menu-link href="#warehouse">Warehouse</c2-navigation-menu-link>
      </div>
    </c2-navigation-menu-item>
    <c2-navigation-menu-item value="solutions">
      Solutions
      <div class="grid" slot="panel"><c2-navigation-menu-link href="#startups">Startups</c2-navigation-menu-link></div>
    </c2-navigation-menu-item>
    <c2-navigation-menu-item value="docs" href="#docs">Docs</c2-navigation-menu-item>
  </c2-navigation-menu>`)

  const products = page.locator('c2-navigation-menu-item[value="products"]')
  const solutions = page.locator('c2-navigation-menu-item[value="solutions"]')
  await expect(products).toHaveAttribute('current-group', '')
  await expect(solutions).not.toHaveAttribute('current-group', '')
  // The group is not the page: only the row keeps aria-current.
  await expect(page.getByRole('button', { name: 'Products' })).not.toHaveAttribute('aria-current', 'page')
  await accessible(page)

  // A route change moves `current` to a row of the other panel.
  await page.locator('c2-navigation-menu-link[href="#analytics"]').evaluate((link) => link.removeAttribute('current'))
  await page.locator('c2-navigation-menu-link[href="#startups"]').evaluate((link) => link.setAttribute('current', ''))
  await expect(products).not.toHaveAttribute('current-group', '')
  await expect(solutions).toHaveAttribute('current-group', '')
})

test('a plain aria-current row in a panel marks its trigger too', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main">
    <c2-navigation-menu-item value="products">
      Products
      <div class="grid" slot="panel"><a href="#analytics" aria-current="page">Analytics</a></div>
    </c2-navigation-menu-item>
  </c2-navigation-menu>`)
  await expect(page.locator('c2-navigation-menu-item[value="products"]')).toHaveAttribute('current-group', '')
})

test('a bar with nothing current marks no trigger', async ({ page, renderScenario }) => {
  await renderScenario(bar())
  await expect(page.locator('c2-navigation-menu-item[current-group]')).toHaveCount(0)
})

test('a disabled item never opens and the arrows skip it', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main" open-delay="0" close-delay="0">
    <c2-navigation-menu-item value="products">
      Products
      <div class="grid" slot="panel"><c2-navigation-menu-link href="#a">Analytics</c2-navigation-menu-link></div>
    </c2-navigation-menu-item>
    <c2-navigation-menu-item value="soon" disabled>
      Coming soon
      <div class="grid" slot="panel"><c2-navigation-menu-link href="#b">Later</c2-navigation-menu-link></div>
    </c2-navigation-menu-item>
    <c2-navigation-menu-item value="docs" href="#docs">Docs</c2-navigation-menu-item>
  </c2-navigation-menu>`)

  await page.getByRole('button', { name: 'Coming soon' }).click({ force: true })
  await expect(page.getByRole('group', { name: 'Coming soon' })).not.toBeVisible()
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('value', '')

  await page.getByRole('button', { name: 'Products' }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('link', { name: 'Docs' })).toBeFocused()
})

test('clicking the icon of a trigger opens its panel like the label does', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main" open-on="click">
    <c2-navigation-menu-item value="products">
      <svg slot="prefix-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"></circle></svg>
      Products
      <div class="grid" slot="panel"><c2-navigation-menu-link href="#a">Analytics</c2-navigation-menu-link></div>
    </c2-navigation-menu-item>
  </c2-navigation-menu>`)

  await page.locator('svg[slot="prefix-icon"]').click()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('value', 'products')
})

/** The same navigation the bar mode uses, in whichever mode the test asks for. */
const modes = (attributes = '') => `<c2-navigation-menu aria-label="Main" ${attributes}>
  <c2-navigation-menu-item value="fixed-income">
    Fixed Income Products
    <div class="grid" slot="panel">
      <c2-navigation-menu-link href="#reference">Reference Data</c2-navigation-menu-link>
      <c2-navigation-menu-link href="#actions">Corporate Actions</c2-navigation-menu-link>
    </div>
  </c2-navigation-menu-item>
  <c2-navigation-menu-item value="regulatory">
    Regulatory Products
    <div class="grid" slot="panel">
      <c2-navigation-menu-link href="#erisa" current>ERISA Portfolio Analytics</c2-navigation-menu-link>
    </div>
  </c2-navigation-menu-item>
  <c2-navigation-menu-item value="home" href="#home">Home</c2-navigation-menu-item>
  <c2-navigation-menu-item value="about" href="#about">About</c2-navigation-menu-item>
</c2-navigation-menu>`

test('the bar keeps its items on one row', async ({ page, renderScenario }) => {
  await renderScenario(modes())
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('mobile', false)
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  const tops = await page.locator('c2-navigation-menu-item').evaluateAll((items) => items.map((item) => Math.round(item.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
})

test('mobile mode shows one button that opens the whole navigation as a hierarchy', async ({ page, renderScenario }) => {
  await renderScenario(modes('mode="mobile"'))
  const host = page.locator('c2-navigation-menu')
  await expect(host).toHaveJSProperty('mobile', true)

  const trigger = page.getByRole('button', { name: 'Menu' })
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'Reference Data' })).not.toBeVisible()

  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  // Every group heading, every group row and every plain link, all at once.
  await expect(page.getByText('Fixed Income Products')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reference Data' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Corporate Actions' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'ERISA Portfolio Analytics' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'About' })).toBeVisible()
  // A group's rows are indented under its heading.
  const heading = await page
    .locator('c2-navigation-menu-item[value="fixed-income"]')
    .evaluate((item) => item.shadowRoot!.querySelector('.heading')!.getBoundingClientRect().left)
  const row = await page.getByRole('link', { name: 'Reference Data' }).evaluate((link) => link.getBoundingClientRect().left)
  expect(row).toBeGreaterThan(heading)
  await accessible(page)

  await trigger.click()
  await expect(page.getByRole('link', { name: 'Reference Data' })).not.toBeVisible()
})

test('mobile rows stay plain until they are hovered', async ({ page, renderScenario }) => {
  await renderScenario(modes('mode="mobile"'))
  await page.getByRole('button', { name: 'Menu' }).click()

  // A flat list has no open item: nothing wears the open-panel background, so hover is what marks a row.
  await expect(page.locator('c2-navigation-menu-item[expanded]')).toHaveCount(0)
  const home = page.locator('c2-navigation-menu-item[value="home"]')
  const background = () => home.evaluate((item) => getComputedStyle(item.shadowRoot!.querySelector('.trigger')!).backgroundColor)
  expect(await background()).toBe('rgba(0, 0, 0, 0)')

  await page.getByRole('link', { name: 'Home' }).hover()
  await expect.poll(background).toBe('rgb(244, 244, 245)')
})

test('collapsible groups open one at a time, starting on the current section', async ({ page, renderScenario }) => {
  await renderScenario(modes('mode="mobile" collapsible'))
  const host = page.locator('c2-navigation-menu')
  await page.getByRole('button', { name: 'Menu' }).click()
  // The list opens on the group holding the current page.
  await expect(host).toHaveJSProperty('value', 'regulatory')

  const fixedIncome = page.getByRole('button', { name: 'Fixed Income Products' })
  const regulatory = page.getByRole('button', { name: 'Regulatory Products' })
  await expect(regulatory).toHaveAttribute('aria-expanded', 'true')
  await expect(fixedIncome).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'ERISA Portfolio Analytics' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reference Data' })).not.toBeVisible()
  await accessible(page)

  await fixedIncome.click()
  await expect(fixedIncome).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('link', { name: 'Reference Data' })).toBeVisible()
  // Opening one closes the other, the same single `value` the bar uses.
  await expect(regulatory).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'ERISA Portfolio Analytics' })).not.toBeVisible()
  await expect(host).toHaveJSProperty('value', 'fixed-income')

  await fixedIncome.click()
  await expect(fixedIncome).toHaveAttribute('aria-expanded', 'false')
  await expect(host).toHaveJSProperty('value', '')
  // The list itself stays open while its groups are toggled.
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
})

test('a row of the mobile list navigates and closes the list', async ({ page, renderScenario }) => {
  await renderScenario(modes('mode="mobile"'))
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('link', { name: 'Corporate Actions' }).click()
  await expect(page).toHaveURL(/#actions$/)
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('mobileOpen', false)
})

test('Escape and an outside press close the mobile list', async ({ page, renderScenario }) => {
  await renderScenario(modes('mode="mobile"'))
  const trigger = page.getByRole('button', { name: 'Menu' })
  await trigger.click()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('link', { name: 'Home' })).not.toBeVisible()
  await expect(trigger).toBeFocused()

  await trigger.click()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  await page.mouse.click(5, 400)
  await expect(page.getByRole('link', { name: 'Home' })).not.toBeVisible()
})

test('switching modes at runtime rebuilds the navigation from the same markup', async ({ page, renderScenario }) => {
  await renderScenario(modes())
  const host = page.locator('c2-navigation-menu')
  await host.evaluate(async (element) => {
    const nav = element as unknown as { mode: string; updateComplete: Promise<boolean> }
    nav.mode = 'mobile'
    await nav.updateComplete
  })
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fixed Income Products' })).toHaveCount(0)

  await host.evaluate(async (element) => {
    const nav = element as unknown as { mode: string; updateComplete: Promise<boolean> }
    nav.mode = 'bar'
    await nav.updateComplete
  })
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Fixed Income Products' })).toBeVisible()
  await page.getByRole('button', { name: 'Fixed Income Products' }).click()
  await expect(page.getByRole('group', { name: 'Fixed Income Products' })).toBeVisible()
})

test('mobile-breakpoint switches the layout with the viewport', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 1200, height: 720 })
  await renderScenario(modes('mobile-breakpoint="800"'))
  const host = page.locator('c2-navigation-menu')

  await expect(host).toHaveAttribute('mode', 'bar')
  await expect(page.getByRole('button', { name: 'Fixed Income Products' })).toBeVisible()

  await page.setViewportSize({ width: 600, height: 720 })
  await expect(host).toHaveAttribute('mode', 'mobile')
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
  await page.getByRole('button', { name: 'Menu' }).click()
  await expect(page.getByRole('link', { name: 'Reference Data' })).toBeVisible()

  await page.setViewportSize({ width: 1200, height: 720 })
  await expect(host).toHaveAttribute('mode', 'bar')
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Fixed Income Products' })).toBeVisible()
})

test('a page under the breakpoint starts in mobile mode', async ({ page, renderScenario }) => {
  await page.setViewportSize({ width: 500, height: 720 })
  await renderScenario(modes('mobile-breakpoint="800"'))
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('mobile', true)
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
})

test('the mobile-trigger slot replaces the default button', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main" mode="mobile" mobile-label="Navigation">
    <button slot="mobile-trigger">Browse</button>
    <c2-navigation-menu-item value="home" href="#home">Home</c2-navigation-menu-item>
  </c2-navigation-menu>`)
  await expect(page.getByRole('button', { name: 'Navigation' })).toHaveCount(0)
  const trigger = page.getByRole('button', { name: 'Browse' })
  await trigger.click()
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible()
  // The list hangs from whatever opened it.
  const button = await trigger.boundingBox()
  const list = await page.getByRole('link', { name: 'Home' }).boundingBox()
  if (!button || !list) throw new Error('Expected the trigger and the list to be laid out')
  expect(list.y).toBeGreaterThan(button.y)

  await trigger.click()
  await expect(page.getByRole('link', { name: 'Home' })).not.toBeVisible()
})

test('the default button is named and themed through its own variables', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main" mode="mobile" mobile-label="Open navigation"
    style="--c2-navigation-menu__mobile-trigger--size:52px;--c2-navigation-menu__mobile-trigger--background:#18181b;--c2-navigation-menu__mobile-trigger--color:#ffffff">
    <c2-navigation-menu-item value="home" href="#home">Home</c2-navigation-menu-item>
  </c2-navigation-menu>`)
  const trigger = page.getByRole('button', { name: 'Open navigation' })
  await expect(trigger).toBeVisible()
  const style = await trigger.evaluate((button) => {
    const computed = getComputedStyle(button)
    return { width: computed.width, background: computed.backgroundColor, color: computed.color }
  })
  expect(style).toEqual({ width: '52px', background: 'rgb(24, 24, 27)', color: 'rgb(255, 255, 255)' })
})

test('panel-anchor="menu" lines every panel up with the bar', async ({ page, renderScenario }) => {
  await renderScenario(bar('open-delay="0" close-delay="0" panel-anchor="menu"'))
  const barBox = await page.getByRole('list').boundingBox()

  await page.getByRole('button', { name: 'Products' }).click()
  const first = await page.getByRole('group', { name: 'Products' }).boundingBox()
  await page.getByRole('button', { name: 'Solutions' }).click()
  const second = await page.getByRole('group', { name: 'Solutions' }).boundingBox()

  if (!barBox || !first || !second) throw new Error('Expected the bar and both panels to be laid out')
  expect(Math.round(first.x)).toBe(Math.round(second.x))
  expect(Math.round(first.x)).toBe(Math.round(barBox.x))
})

test('a panel item without a value is still addressable', async ({ page, renderScenario }) => {
  await renderScenario(`<c2-navigation-menu aria-label="Main" open-delay="0" close-delay="0">
    <c2-navigation-menu-item>
      Products
      <div class="grid" slot="panel"><c2-navigation-menu-link href="#a">Analytics</c2-navigation-menu-link></div>
    </c2-navigation-menu-item>
  </c2-navigation-menu>`)
  await page.getByRole('button', { name: 'Products' }).click()
  await expect(page.getByRole('group', { name: 'Products' })).toBeVisible()
  await expect(page.locator('c2-navigation-menu')).toHaveJSProperty('value', 'item-1')
})
