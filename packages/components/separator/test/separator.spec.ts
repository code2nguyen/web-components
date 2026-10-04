import { test, expect, props, accessible, slotPresenceMatrix } from '../../../../tests/component-fixture'

test('label presence follows assignment, text, insertion, removal and reassignment', async ({ page, renderScenario }) => {
  const label = page.locator('c2-separator').locator('[part="label"]')
  await slotPresenceMatrix(page, renderScenario, {
    markup: '<c2-separator><span data-slot-presence-probe>Section</span></c2-separator>',
    host: 'c2-separator',
    text: true,
    assertPresent: async (present) => (present ? expect(label).toBeVisible() : expect(label).toBeHidden()),
  })
})

test('semantic separators expose orientation and a slotted label', async ({ page, renderScenario }) => {
  await renderScenario('<c2-separator>Or continue</c2-separator>')
  const host = page.locator('c2-separator')
  await expect(host).toHaveHostAria('role', 'separator')
  await expect(host).toHaveHostAria('aria-orientation', 'horizontal')
  await expect(page.getByText('Or continue')).toBeVisible()
  await props(host, { orientation: 'vertical' })
  await expect(host).toHaveHostAria('aria-orientation', 'vertical')
  await accessible(page)
})
test('decorative mode removes separator semantics', async ({ page, renderScenario }) => {
  await renderScenario('<c2-separator decorative></c2-separator>')
  const host = page.locator('c2-separator')
  await expect(host).toHaveHostAria('role', 'none')
  await expect(host).toHaveHostAria('aria-orientation', null)
  // Nothing inside the shadow root re-introduces the role either.
  await expect(page.getByRole('separator')).toHaveCount(0)
})

// React hydrates server markup against what the element looks like after it upgrades, and reports every attribute
// the element wrote on itself as a mismatch. The role and orientation therefore live on ElementInternals.
test('states its semantics without writing host attributes, so server-rendered markup hydrates unchanged', async ({ page, renderScenario }) => {
  await renderScenario('<c2-separator>Or continue</c2-separator>')
  const host = page.locator('c2-separator')
  const hostSemantics = () => host.evaluate((element) => element.getAttributeNames().filter((name) => name === 'role' || name.startsWith('aria-')))

  await expect(host).toHaveHostAria('role', 'separator')
  expect(await hostSemantics()).toEqual([])

  await props(host, { orientation: 'vertical' })
  await expect(host).toHaveHostAria('aria-orientation', 'vertical')
  expect(await hostSemantics()).toEqual([])

  await props(host, { decorative: true })
  await expect(host).toHaveHostAria('role', 'none')
  await expect(host).toHaveHostAria('aria-orientation', null)
  expect(await hostSemantics()).toEqual([])
})
