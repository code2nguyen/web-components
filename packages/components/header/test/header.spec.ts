import { test, expect } from './fixture'

// Cover the states and transitions that matter, with real pointer and keyboard input and observable results.
// See tests/README.md; `npm test` runs the suites of changed packages.
test('renders a named navigation landmark and every shell slot', async ({ page, scenario }) => {
  await scenario()
  await expect(page.getByRole('navigation', { name: 'Product' })).toBeVisible()
  await expect(page.getByText('Northstar')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Menu' })).toBeVisible()
})

test('supports sticky and blurred surface treatments', async ({ page, scenario }) => {
  await scenario('glass')
  await expect(page.locator('c2-header')).toHaveCSS('position', 'sticky')
  await expect(page.locator('[part="header"]')).toHaveCSS('backdrop-filter', 'blur(16px)')
  await expect(page.locator('[part="content"]')).toHaveCSS('max-width', '640px')
})

test('a sticky header reports when content scrolls beneath it and takes the stuck shadow', async ({ page, scenario }) => {
  await scenario('scroll')
  const header = page.locator('c2-header')
  const hasState = (state: string) => header.evaluate((el, name) => el.matches(`:state(${name})`), state)
  expect(await hasState('stuck')).toBe(false)

  await page.mouse.move(200, 300)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => hasState('stuck')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'true')
  await expect(page.locator('[part="header"]')).toHaveCSS('box-shadow', 'rgba(0, 0, 0, 0.18) 0px 1px 3px 0px')
  expect(await hasState('retracted')).toBe(false)

  await page.mouse.wheel(0, -5000)
  await expect.poll(() => hasState('stuck')).toBe(false)
  await expect(page.locator('#log')).toHaveAttribute('data-stuck', 'false')
})

test('hide-on-scroll slides a sticky header away while scrolling down and back on the way up', async ({ page, scenario }) => {
  await scenario('hide')
  const header = page.locator('c2-header')
  const hasState = (state: string) => header.evaluate((el, name) => el.matches(`:state(${name})`), state)

  await page.mouse.move(200, 300)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => hasState('stuck')).toBe(true)
  await page.mouse.wheel(0, 200)
  await expect.poll(() => hasState('retracted')).toBe(true)
  await expect(page.locator('#log')).toHaveAttribute('data-retracted', 'true')
  await expect(page.getByRole('button', { name: 'Sign in' })).not.toBeInViewport()

  await page.mouse.wheel(0, -60)
  await expect.poll(() => hasState('retracted')).toBe(false)
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeInViewport()
})
