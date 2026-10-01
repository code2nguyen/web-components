import { test, expect } from './fixture'

// `customElements.define` throws `NotSupportedError` on a tag that is already taken, and an uncaught throw during
// module evaluation takes down whatever else that bundle was going to register. A component library cannot stop
// its package from being loaded twice, so `@c2n/core/element-helper.js` keeps the first definition and warns.
//
// The `browserErrors` fixture would fail this test on an uncaught exception, which is the regression it guards.
test('a second registration of the same tag warns instead of throwing', async ({ page, scenario }) => {
  const warnings: string[] = []
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning') warnings.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await scenario()
  await page.evaluate(() => window.defineButtonAgain())

  expect(errors).toEqual([])
  expect(warnings.some((warning) => warning.includes('<c2-button> is already registered'))).toBe(true)
  // The first definition is still the one in the registry, so the page keeps working.
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
})

// Lit reflects every `reflect: true` property on the first update, defaults included. Under SSR the element upgrades
// before React hydrates, so a bare `<c2-button>` gaining `type="button" name="" value=""` is three hydration
// mismatches. `@c2n/core/element-helper.js` keeps a default off a host that does not carry the attribute.
test('reflected defaults stay off the host, while set values and authored attributes still reflect', async ({ page, scenario }) => {
  await scenario()
  const result = await page.evaluate(async () => {
    type Button = HTMLElement & { type: string; name: string; updateComplete: Promise<boolean> }
    const attributes = (element: Element) => element.getAttributeNames().sort()

    const bare = document.createElement('c2-button') as Button
    document.body.append(bare)
    await bare.updateComplete
    const bareAttributes = attributes(bare)

    // A framework assigns properties between createElement and insertion, as React does for custom elements.
    const framework = document.createElement('c2-button') as Button
    framework.name = 'query'
    document.body.append(framework)
    await framework.updateComplete

    bare.type = 'submit'
    await bare.updateComplete
    const changed = bare.getAttribute('type')
    // Back to the default: the attribute exists now, so it is kept in sync rather than left stale.
    bare.type = 'button'
    await bare.updateComplete
    const restored = bare.getAttribute('type')

    const holder = document.createElement('div')
    holder.innerHTML = '<c2-button type="button">Authored</c2-button>'
    document.body.append(holder)
    const authored = holder.firstElementChild as Button
    await authored.updateComplete

    return {
      bareAttributes,
      frameworkName: framework.getAttribute('name'),
      changed,
      restored,
      authoredType: authored.getAttribute('type'),
      registered: customElements.get('c2-button') === bare.constructor,
      constructorName: bare.constructor.name,
    }
  })

  expect(result.bareAttributes).toEqual([])
  expect(result.frameworkName).toBe('query')
  expect(result.changed).toBe('submit')
  expect(result.restored).toBe('button')
  expect(result.authoredType).toBe('button')
  // The registered subclass is what instances are made from, and it keeps the component's name.
  expect(result.registered).toBe(true)
  expect(result.constructorName).toBe('Button')
})
