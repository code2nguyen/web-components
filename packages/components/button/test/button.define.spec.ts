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
