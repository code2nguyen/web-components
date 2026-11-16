import { test, expect, accessible, hostAria } from '../../../../tests/component-fixture'

const nav =
  '<c2-tab-nav aria-label="Repository"><c2-tab href="#code" current>Code</c2-tab><c2-tab href="#issues">Issues</c2-tab><c2-tab href="#pulls">Pull requests</c2-tab></c2-tab-nav>'

test('is a navigation landmark of links, the current one announced as the page', async ({ page, renderScenario }) => {
  await renderScenario(nav)
  // The landmark and the list items are stated through ElementInternals, which `getByRole` does not read.
  await expect(page.locator('c2-tab-nav')).toHaveHostAria('role', 'navigation')
  await expect(page.locator('c2-tab-nav')).toHaveAttribute('aria-label', 'Repository')
  await expect(page.getByRole('list')).toBeVisible()
  for (const tab of await page.locator('c2-tab').all()) await expect(tab).toHaveHostAria('role', 'listitem')
  const code = page.getByRole('link', { name: 'Code' })
  await expect(code).toHaveAttribute('href', '#code')
  await expect(code).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Issues' })).not.toHaveAttribute('aria-current')
  // No tablist semantics: the links are not tabs and nothing is selected.
  await expect(page.getByRole('tablist')).toHaveCount(0)
  expect(await hostAria(page.locator('c2-tab').first(), 'aria-selected')).toBeNull()
  await accessible(page)
})

test('every link is a Tab stop and Enter follows it', async ({ page, renderScenario, tab }) => {
  await renderScenario(`<a href="#top">Before</a>${nav}`)
  await page.getByRole('link', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('link', { name: 'Code' })).toBeFocused()
  await tab()
  await expect(page.getByRole('link', { name: 'Issues' })).toBeFocused()
  // Arrow keys belong to a tablist; here they do nothing.
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('link', { name: 'Issues' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#issues')
  // The tab hosts are not focus targets of their own.
  expect(await page.locator('c2-tab').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('tabindex')))).toEqual([null, null, null])
})

test('a click anywhere on the tab, its padding included, follows the link and fires no tab-change', async ({ page, renderScenario }) => {
  await renderScenario(nav)
  const host = page.locator('c2-tab-nav')
  await host.evaluate((element) => {
    element.dataset.changes = '0'
    element.addEventListener('tab-change', () => (element.dataset.changes = String(Number(element.dataset.changes) + 1)))
  })
  const issues = page.locator('c2-tab[href="#issues"]')
  const box = (await issues.boundingBox())!
  // The top-left corner sits in the tab's padding, outside the label.
  await page.mouse.click(box.x + 3, box.y + 3)
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#issues')
  await expect(host).toHaveAttribute('data-changes', '0')
})

test('the current tab carries the indicator and the current colour, from CSS alone', async ({ page, renderScenario }) => {
  await renderScenario(nav)
  const code = page.locator('c2-tab[href="#code"]')
  const issues = page.locator('c2-tab[href="#issues"]')
  await expect(code).toHaveCSS('border-bottom-color', 'rgb(109, 109, 109)')
  await expect(code).toHaveCSS('border-bottom-width', '2px')
  await expect(code).toHaveCSS('color', 'rgb(2, 101, 220)')
  await expect(issues).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)')
  // Moving `current` (as a router would) moves both.
  await page.locator('c2-tab-nav').evaluate((element) => {
    const [first, second] = element.querySelectorAll('c2-tab') as unknown as Array<HTMLElement & { current: boolean }>
    first.current = false
    second.current = true
  })
  await expect(issues).toHaveCSS('border-bottom-color', 'rgb(109, 109, 109)')
  await expect(page.getByRole('link', { name: 'Issues' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Code' })).not.toHaveAttribute('aria-current')
})

test('is themed through its own variables', async ({ page, renderScenario }) => {
  await renderScenario(
    nav.replace(
      '<c2-tab-nav ',
      '<c2-tab-nav style="--c2-tab-nav__indicator--color: rgb(10, 20, 30); --c2-tab-nav__indicator--height: 3px; --c2-tab-nav__tab__current--color: rgb(40, 50, 60); --c2-tab-nav__tab--padding-left: 4px" ',
    ),
  )
  const code = page.locator('c2-tab[href="#code"]')
  await expect(code).toHaveCSS('border-bottom-color', 'rgb(10, 20, 30)')
  await expect(code).toHaveCSS('border-bottom-width', '3px')
  await expect(code).toHaveCSS('color', 'rgb(40, 50, 60)')
  await expect(code).toHaveCSS('padding-left', '4px')
})

test('a strip too narrow for its tabs scrolls, fades the edge with more tabs and shows the current one', async ({ page, renderScenario }) => {
  await renderScenario(
    '<c2-tab-nav aria-label="Sections" style="width: 200px"><c2-tab href="#a">Overview</c2-tab><c2-tab href="#b">Activity</c2-tab><c2-tab href="#c">Members</c2-tab><c2-tab href="#d" current>Settings</c2-tab></c2-tab-nav>',
  )
  const list = page.locator('c2-tab-nav').locator('.list')
  await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  const inView = () =>
    page.locator('c2-tab[current]').evaluate((tab) => {
      const list = tab.parentElement!.shadowRoot!.querySelector('.list')!.getBoundingClientRect()
      const rect = tab.getBoundingClientRect()
      return rect.left >= list.left - 1 && rect.right <= list.right + 1
    })
  await expect.poll(inView).toBe(true)
  await expect(list).toHaveClass(/more-start/)
  await expect(list).not.toHaveClass(/more-end/)
  await list.evaluate((element) => (element.scrollLeft = 0))
  await expect(list).toHaveClass(/more-end/)
  await expect(list).not.toHaveClass(/more-start/)

  // A router moving `current` to a tab out of view brings it into view.
  await page.locator('c2-tab-nav').evaluate((element) => {
    const tabs = element.querySelectorAll('c2-tab') as unknown as Array<HTMLElement & { current: boolean }>
    tabs[3].current = false
    tabs[2].current = true
  })
  await expect.poll(() => list.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
  await expect.poll(inView).toBe(true)
})

test('a narrow right-to-left strip keeps its first, current tab in view and fades the far edge', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div dir="rtl" lang="ar" style="width: 180px"><c2-tab-nav aria-label="المستودع" style="width: 100%"><c2-tab href="#code" current>الشيفرة</c2-tab><c2-tab href="#issues">المشكلات</c2-tab><c2-tab href="#settings">الإعدادات</c2-tab></c2-tab-nav></div>',
  )
  const list = page.locator('c2-tab-nav').locator('.list')
  await expect(list).toHaveClass(/more-end/)
  await expect(list).not.toHaveClass(/more-start/)
  const inView = await page.locator('c2-tab[current]').evaluate((tab) => {
    const list = tab.parentElement!.shadowRoot!.querySelector('.list')!.getBoundingClientRect()
    const rect = tab.getBoundingClientRect()
    return rect.left >= list.left - 1 && rect.right <= list.right + 1
  })
  expect(inView).toBe(true)
})

test('a strip moved in the DOM keeps fading its edges', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div id="a"></div><c2-tab-nav aria-label="Sections" style="width: 200px"><c2-tab href="#a" current>Overview</c2-tab><c2-tab href="#b">Activity</c2-tab><c2-tab href="#c">Members</c2-tab></c2-tab-nav>',
  )
  const list = page.locator('c2-tab-nav').locator('.list')
  await expect(list).toHaveClass(/more-end/)
  await page.locator('c2-tab-nav').evaluate((element) => document.getElementById('a')!.append(element))
  await list.evaluate((element) => (element.scrollLeft = element.scrollWidth))
  await expect(list).toHaveClass(/more-start/)
  await expect(list).not.toHaveClass(/more-end/)
})

test('a link tab outside the strip covers only itself', async ({ page, renderScenario }) => {
  await renderScenario('<div style="position: relative; width: 400px; height: 200px"><c2-tab href="#solo">Solo</c2-tab></div>')
  const link = page.locator('c2-tab').locator('a')
  const cover = await link.evaluate((a) => {
    const after = getComputedStyle(a, '::after')
    return [after.width, after.height]
  })
  const box = (await page.locator('c2-tab').boundingBox())!
  expect(parseFloat(cover[0])).toBeLessThanOrEqual(box.width + 1)
  expect(parseFloat(cover[1])).toBeLessThanOrEqual(box.height + 1)
})

test('a strip whose tabs fit has no fade', async ({ page, renderScenario }) => {
  await renderScenario(nav)
  const list = page.locator('c2-tab-nav').locator('.list')
  await expect(page.getByRole('link', { name: 'Code' })).toBeVisible()
  await expect(list).not.toHaveClass(/more-/)
})

test('writes no attribute on itself or on its tabs', async ({ page, renderScenario }) => {
  await renderScenario(nav)
  const written = () =>
    page.locator('c2-tab-nav, c2-tab').evaluateAll((elements) =>
      elements.flatMap((element) =>
        element
          .getAttributeNames()
          .filter((name) => !['aria-label', 'href', 'current'].includes(name))
          .map((name) => `${element.localName}[${name}]`),
      ),
    )
  expect(await written()).toEqual([])
  expect(await hostAria(page.locator('c2-tab-nav'), 'role')).toBe('navigation')
})

test('reads right to left', async ({ page, renderScenario }) => {
  await renderScenario(
    '<div dir="rtl" lang="ar"><c2-tab-nav aria-label="المستودع"><c2-tab href="#code" current>الشيفرة</c2-tab><c2-tab href="#issues">المشكلات</c2-tab></c2-tab-nav></div>',
  )
  const [first, second] = await page.locator('c2-tab').evaluateAll((tabs) => tabs.map((tab) => tab.getBoundingClientRect().left))
  expect(first).toBeGreaterThan(second)
  await accessible(page)
})
