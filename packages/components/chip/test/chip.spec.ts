import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

test('a plain chip is a label with no controls', async ({ page, scenario, tab }) => {
  await scenario()
  await expect(page.locator('c2-chip')).toHaveText('Design')
  await expect(page.locator('c2-chip button')).toHaveCount(0)
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
})

test('shows a slotted prefix icon and hides the empty prefix wrapper', async ({ page, scenario }) => {
  await scenario('prefix')
  await expect(page.getByTestId('prefix')).toBeVisible()
  await scenario()
  await expect(page.locator('c2-chip .prefix')).toBeHidden()
})

for (const input of ['mouse', 'Enter', 'Space']) {
  test(`a selectable chip toggles with ${input}`, async ({ page, scenario, tab }) => {
    await scenario('selectable')
    const toggle = page.getByRole('button', { name: 'Design' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    if (input === 'mouse') await toggle.click()
    else {
      await page.getByRole('button', { name: 'Before' }).focus()
      await tab()
      await expect(toggle).toBeFocused()
      await page.keyboard.press(input)
    }
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('c2-chip')).toHaveAttribute('selected')
    await expect(page.locator('c2-chip .selected-icon svg')).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('change:design:true')
    if (input === 'mouse') await toggle.click()
    else await page.keyboard.press(input)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('status')).toHaveText('change:design:true change:design:false')
  })
}

test('an application-set selected state shows without firing change', async ({ page, scenario }) => {
  await scenario('selected')
  await expect(page.getByRole('button', { name: 'Design' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('status')).toHaveText('')
})

test('the focused pill shows the focus ring', async ({ page, scenario, tab }) => {
  await scenario('selectable')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.locator('c2-chip [part="chip"]')).toHaveCSS('outline-style', 'solid')
})

test('the remove button fires remove with the value and is named after the chip', async ({ page, scenario }) => {
  await scenario('removable')
  const remove = page.getByRole('button', { name: 'Remove Design' })
  await remove.click()
  await expect(page.getByRole('status')).toHaveText('remove:design')
  // The chip does not remove itself: the application decides.
  await expect(page.locator('c2-chip')).toHaveCount(1)
})

test('remove-label renames the remove button and the text is the default value', async ({ page, scenario }) => {
  await scenario('remove-label')
  await page.getByRole('button', { name: 'Clear filter Status: Active' }).click()
  await expect(page.getByRole('status')).toHaveText('remove:Status: Active')
})

test('removing a selectable chip does not toggle it', async ({ page, scenario }) => {
  await scenario('selectable-removable')
  await page.getByRole('button', { name: 'Remove Design' }).click()
  await expect(page.getByRole('status')).toHaveText('remove:design')
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

for (const key of ['Backspace', 'Delete']) {
  test(`${key} on a focused selectable chip fires remove`, async ({ page, scenario, tab }) => {
    await scenario('selectable-removable')
    await page.getByRole('button', { name: 'Before' }).focus()
    await tab()
    await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeFocused()
    await page.keyboard.press(key)
    await expect(page.getByRole('status')).toHaveText('remove:design')
  })
}

test('tab order visits the toggle, then the remove button', async ({ page, scenario, tab }) => {
  await scenario('selectable-removable')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'Remove Design' })).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await tab(true)
  await expect(page.getByRole('button', { name: 'Remove Design' })).toBeFocused()
})

test('host focus is delegated to the toggle', async ({ page, scenario }) => {
  await scenario('selectable')
  await page.locator('c2-chip').evaluate((element) => (element as HTMLElement).focus())
  await expect(page.getByRole('button', { name: 'Design' })).toBeFocused()
})

test('a disabled chip neither toggles nor removes', async ({ page, scenario, tab }) => {
  await scenario('disabled')
  const toggle = page.getByRole('button', { name: 'Design', exact: true })
  const remove = page.getByRole('button', { name: 'Remove Design' })
  await expect(toggle).toBeDisabled()
  await expect(remove).toBeDisabled()
  for (const target of [toggle, remove]) {
    const bounds = await target.boundingBox()
    if (!bounds) throw new Error('No bounds')
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  }
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
  await expect(page.getByRole('status')).toHaveText('')
  await expect(page.locator('c2-chip [part="chip"]')).toHaveCSS('opacity', '0.38')
})

test('an application removing chips in the remove handler keeps keyboard flow', async ({ page, scenario, tab }) => {
  await scenario('list')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  await expect(page.getByRole('button', { name: 'Design', exact: true })).toBeFocused()
  await page.keyboard.press('Backspace')
  await expect(page.locator('c2-chip')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Research', exact: true })).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(page.getByRole('button', { name: 'Operations', exact: true })).toBeFocused()
  await expect(page.getByRole('status')).toHaveText('remove:design remove:research')
})

for (const state of ['default', 'prefix', 'selectable', 'selected', 'removable', 'selectable-removable', 'disabled', 'parts']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('the remove name and fallback value follow label text changes and ignore icon text', async ({ page, scenario }) => {
  await scenario('removable-label')
  await page.locator('c2-chip').evaluate((element) => {
    // A framework patching the text node in place fires no slotchange.
    const text = [...element.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())!
    text.textContent = 'Research'
  })
  const remove = page.getByRole('button', { name: 'Remove Research' })
  await expect(remove).toBeVisible()
  await remove.click()
  await expect(page.getByRole('status')).toHaveText('remove:Research')
})

test('interactive parts are buttons that fire part-click with their name', async ({ page, scenario }) => {
  await scenario('parts')
  await expect(page.locator('c2-chip-part[name="field"] button')).toHaveCount(0)
  const operator = page.getByRole('button', { name: 'is any of', exact: true })
  await expect(operator).toHaveAttribute('aria-haspopup', 'listbox')
  await operator.click()
  await page.getByRole('button', { name: 'Status values: Active, Paused' }).click()
  await expect(page.getByRole('status')).toHaveText('part:operator part:value')
})

test('Enter and Space activate a part, and arrows move between parts and the remove button', async ({ page, scenario, tab }) => {
  await scenario('parts')
  await page.getByRole('button', { name: 'Before' }).focus()
  await tab()
  const operator = page.getByRole('button', { name: 'is any of', exact: true })
  const value = page.getByRole('button', { name: 'Status values: Active, Paused' })
  const remove = page.getByRole('button', { name: 'Remove Status is any of Active, Paused' })
  await expect(operator).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowRight')
  await expect(value).toBeFocused()
  await page.keyboard.press('Space')
  await page.keyboard.press('ArrowRight')
  await expect(remove).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(remove).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await expect(operator).toBeFocused()
  await expect(page.getByRole('status')).toHaveText('part:operator part:value')
})

test('Backspace on a part removes the chip', async ({ page, scenario }) => {
  await scenario('parts')
  await page.getByRole('button', { name: 'is any of', exact: true }).focus()
  await page.keyboard.press('Backspace')
  await expect(page.getByRole('status')).toHaveText('remove:status')
})

test('arrows skip a disabled part, which fires nothing', async ({ page, scenario }) => {
  await scenario('parts-disabled-part')
  await page.getByRole('button', { name: 'Status', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Active', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'is', exact: true })).toBeDisabled()
})

test('parts sit side by side with a divider before all but the first', async ({ page, scenario }) => {
  await scenario('parts')
  const parts = page.locator('c2-chip-part')
  await expect(parts.nth(0)).toHaveCSS('border-left-style', 'none')
  await expect(parts.nth(1)).toHaveCSS('border-left-style', 'solid')
  const [first, second] = await Promise.all([parts.nth(0).boundingBox(), parts.nth(1).boundingBox()])
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(1)
  expect(second!.x).toBeGreaterThanOrEqual(first!.x + first!.width - 1)
})

test('a chip with parts is not a toggle even when selectable', async ({ page, scenario }) => {
  await scenario('parts-selectable')
  await expect(page.locator('c2-chip [aria-pressed]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Active', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('part:value')
})

test('framework comment markers stay out of the remove button name', async ({ page, scenario }) => {
  await scenario('comment-markers')
  await expect(page.getByRole('button', { name: 'Remove Design', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove Status Active', exact: true })).toBeVisible()
})
