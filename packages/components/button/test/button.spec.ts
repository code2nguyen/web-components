import { test, expect } from './fixture'

for (const input of ['mouse', 'Enter', 'Space']) {
  test(`activates once with ${input}`, async ({ page, scenario, tab }) => {
    await scenario()
    const button = page.getByRole('button', { name: 'Save', exact: true })
    if (input === 'mouse') await button.click()
    else {
      await page.getByRole('button', { name: 'Before', exact: true }).focus()
      await tab()
      await expect(button).toBeFocused()
      await page.keyboard.press(input)
    }
    await expect(page.getByRole('status')).toHaveText('1')
    await expect(button).not.toHaveAttribute('aria-pressed')
  })
}

test('supports forward and backward keyboard focus with a visible outline', async ({ page, scenario, tab }) => {
  await scenario()
  const button = page.getByRole('button', { name: 'Save', exact: true })
  await page.getByRole('button', { name: 'Before', exact: true }).focus()
  await tab()
  await expect(button).toBeFocused()
  await expect(button).toHaveCSS('outline-style', 'solid')
  await expect(button).toHaveCSS('outline-width', '2px')
  await tab()
  await expect(page.getByRole('button', { name: 'After', exact: true })).toBeFocused()
  await tab(true)
  await expect(button).toBeFocused()
})

test('delegates host focus to the native button', async ({ page, scenario }) => {
  await scenario()
  await page.locator('c2-button').evaluate((element) => (element as HTMLElement).focus())
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeFocused()
})

for (const state of ['disabled', 'running']) {
  test(`${state} blocks user activation and recovers`, async ({ page, scenario, tab }) => {
    await scenario(state)
    const button = page.getByRole('button', { name: 'Save', exact: true })
    await expect(button).toBeDisabled()
    // Actual pointer input: locator.click() would wait for a disabled button to enable.
    const bounds = await button.boundingBox()
    if (!bounds) throw new Error('Button has no bounds')
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await page.getByRole('button', { name: 'Before', exact: true }).focus()
    await tab()
    await expect(page.getByRole('button', { name: 'After', exact: true })).toBeFocused()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Space')
    await expect(page.getByRole('status')).toHaveText('0')
    await page.getByRole('button', { name: 'Complete operation' }).click()
    await expect(button).toBeEnabled()
    await expect(button).not.toHaveAttribute('aria-busy')
    await button.click()
    await expect(page.getByRole('status')).toHaveText('1')
  })
}

test('prevents duplicate saves while an operation is pending', async ({ page, scenario }) => {
  await scenario('async')
  const button = page.getByRole('button', { name: 'Save', exact: true })
  await button.click()
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('aria-busy', 'true')
  await expect(page.locator('[part="running-icon"] svg')).toBeVisible()
  const bounds = await button.boundingBox()
  if (!bounds) throw new Error('Button has no bounds')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(page.getByRole('status')).toHaveText('1')
  await page.getByRole('button', { name: 'Complete operation' }).click()
  await expect(button).toBeEnabled()
  await expect(page.locator('[part="running-icon"]')).toHaveCount(0)
  await button.click()
  await expect(page.getByRole('status')).toHaveText('2')
})

test('reflects application-controlled toggle selection', async ({ page, scenario }) => {
  await scenario('toggle')
  const button = page.getByRole('button', { name: 'Save', exact: true })
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('c2-button')).toHaveAttribute('selected', '')
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('c2-button')).not.toHaveAttribute('selected')
})

test('selected alone announces pressed and does not change itself on click', async ({ page, scenario }) => {
  await scenario('selected')
  const button = page.getByRole('button', { name: 'Save', exact: true })
  await button.click()
  await expect(button).toHaveAttribute('aria-pressed', 'true')
})

test('renders decorative prefix and suffix without changing the accessible name', async ({ page, scenario }) => {
  await scenario('icons')
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeVisible()
  await expect(page.getByTestId('prefix-icon')).toBeVisible()
  await expect(page.getByTestId('suffix-icon')).toBeVisible()
})

test('replaces prefix with the custom running icon and restores it', async ({ page, scenario }) => {
  await scenario('custom-running')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('prefix-icon')).not.toBeVisible()
  await expect(page.getByTestId('running-icon')).toBeVisible()
  await expect(page.getByTestId('suffix-icon')).toBeVisible()
  await page.getByRole('button', { name: 'Complete operation' }).click()
  await expect(page.getByTestId('prefix-icon')).toBeVisible()
  await expect(page.getByTestId('running-icon')).not.toBeVisible()
})

test('applies consumer theme variables to size, hover, focus and selected state', async ({ page, scenario, tab }) => {
  await scenario('themed')
  const button = page.getByRole('button', { name: 'Save', exact: true })
  await expect(button).toHaveCSS('height', '48px')
  await expect(button).toHaveCSS('border-radius', '24px')
  await expect(button).toHaveCSS('background-color', 'rgb(20, 30, 40)')
  await button.hover()
  await expect(button).toHaveCSS('background-color', 'rgb(40, 50, 60)')
  await page.getByRole('button', { name: 'Before', exact: true }).focus()
  await tab()
  await expect(button).toHaveCSS('outline-width', '3px')
  await expect(button).toHaveCSS('outline-color', 'rgb(100, 20, 150)')
  await page.locator('c2-button').evaluate((element) => element.setAttribute('selected', ''))
  await expect(button).toHaveCSS('background-color', 'rgb(60, 70, 80)')
})
