import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['default', 'variants', 'dismissible', 'actions', 'no-icon', 'callout']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('renders the message and heading', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-banner')).toContainText('Scheduled maintenance on Sunday.')
  await expect(page.getByRole('button')).toHaveCount(0)
})

test('announces warning and error as alerts, the rest as status', async ({ page, scenario }) => {
  await scenario('variants')
  await expect(page.getByRole('status')).toHaveCount(3)
  await expect(page.getByRole('alert')).toHaveCount(2)
  await expect(page.getByRole('alert').first()).toContainText('A warning message.')
})

test('shows a variant icon unless no-icon is set', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-banner [part="icon"]')).toBeVisible()
  await scenario('no-icon')
  await expect(page.locator('c2-banner [part="icon"]')).toHaveCount(0)
})

test('a narrow dismissible banner keeps the icon, message and close button on one row', async ({ page, scenario }) => {
  await scenario('narrow')
  const banner = page.locator('c2-banner')
  const middle = async (part: string) => {
    const box = await banner.locator(part).boundingBox()
    return box ? box.y + box.height / 2 : Number.NaN
  }
  const icon = await middle('[part="icon"]')
  expect(Math.abs((await middle('[part="content"]')) - icon)).toBeLessThan(4)
  expect(Math.abs((await middle('[part="close"]')) - icon)).toBeLessThan(4)
})

test('the dismiss button hides the banner with a mouse', async ({ page, scenario }) => {
  await scenario('dismissible')
  await page.getByRole('button', { name: 'Dismiss notice' }).click()
  await expect(page.locator('c2-banner')).toBeHidden()
  await expect(page.locator('output')).toHaveText('1')
})

for (const key of ['Enter', 'Space']) {
  test(`the dismiss button is reachable by keyboard and activates with ${key}`, async ({ page, scenario, tab }) => {
    await scenario('dismissible')
    await page.getByRole('button', { name: 'Before' }).focus()
    await tab()
    const close = page.getByRole('button', { name: 'Dismiss notice' })
    await expect(close).toBeFocused()
    await expect(close).toHaveCSS('outline-style', 'solid')
    await tab()
    await expect(page.getByRole('button', { name: 'After' })).toBeFocused()
    await tab(true)
    await page.keyboard.press(key)
    await expect(page.locator('c2-banner')).toBeHidden()
    await expect(page.locator('output')).toHaveText('1')
  })
}

test('preventing banner-close keeps the banner visible', async ({ page, scenario }) => {
  await scenario('prevented')
  await page.getByRole('button', { name: 'Dismiss notice' }).click()
  await expect(page.locator('output')).toHaveText('1')
  await expect(page.locator('c2-banner')).toBeVisible()
})

test('renders slotted actions after the message', async ({ page, scenario }) => {
  await scenario('actions')
  await expect(page.locator('c2-banner [part="actions"]')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upgrade' })).toBeVisible()
  await scenario()
  await expect(page.locator('c2-banner [part="actions"]')).toBeHidden()
})

test('position="top" sticks to the top edge while scrolling', async ({ page, scenario }) => {
  await scenario('positions')
  const top = page.locator('#top')
  await expect(top).toHaveCSS('position', 'sticky')
  await page.mouse.wheel(0, 800)
  await expect.poll(() => top.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(0)
  const container = top.locator('[part="container"]')
  await expect(container).toHaveCSS('border-top-width', '0px')
  await expect(container).toHaveCSS('border-bottom-width', '1px')
  await expect(container).toHaveCSS('border-top-left-radius', '0px')
})

test('position="bottom" is fixed to the bottom of the viewport across its full width', async ({ page, scenario }) => {
  await scenario('positions')
  const bottom = page.locator('#bottom')
  await expect(bottom).toHaveCSS('position', 'fixed')
  const viewport = page.viewportSize()!
  const box = await bottom.boundingBox()
  expect(Math.round(box!.y + box!.height)).toBe(viewport.height)
  expect(Math.round(box!.width)).toBe(viewport.width)
  await expect(bottom.locator('[part="container"]')).toHaveCSS('border-bottom-width', '0px')
  await expect(bottom.locator('[part="container"]')).toHaveCSS('border-top-width', '1px')
})

test('--c2-banner--offset moves a pinned banner off its edge', async ({ page, scenario }) => {
  await scenario('positions')
  const bottom = page.locator('#bottom')
  await bottom.evaluate((el) => (el as HTMLElement).style.setProperty('--c2-banner--offset', '16px'))
  const box = await bottom.boundingBox()
  expect(Math.round(box!.y + box!.height)).toBe(page.viewportSize()!.height - 16)
})

test('a callout is a note, not a live region', async ({ page, scenario }) => {
  await scenario('callout')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect(page.getByRole('note')).toHaveCount(2)
  await expect(page.getByRole('note').first()).toContainText('Warning')
})

test('a callout stacks the heading over the body and the actions under it, with the close button on the first row', async ({ page, scenario }) => {
  await scenario('callout')
  const callout = page.locator('c2-banner').first()
  const box = async (part: string) => (await callout.locator(part).boundingBox())!
  const [icon, heading, message, actions, close] = await Promise.all(
    ['[part="icon"]', '[part="heading"]', '[part="message"]', '[slot="actions"]', '[part="close"]'].map(box),
  )
  expect(heading.y + heading.height).toBeLessThanOrEqual(message.y + 1)
  expect(Math.round(heading.x)).toBe(Math.round(message.x))
  expect(actions.y).toBeGreaterThanOrEqual(message.y + message.height - 1)
  // The actions line up with the text, not with the icon.
  expect(Math.round(actions.x)).toBe(Math.round(message.x))
  expect(icon.y).toBeLessThan(message.y)
  expect(close.y).toBeLessThan(message.y)
  // Paragraph margins do not add space at the top and bottom of the body.
  await expect(callout.locator('p').first()).toHaveCSS('margin-top', '0px')
  await expect(callout.locator('p').last()).toHaveCSS('margin-bottom', '0px')
})

test('a callout keeps its actions under the text when the icon padding is a unit-less 0', async ({ page, scenario }) => {
  await scenario('callout')
  const callout = page.locator('c2-banner').first()
  await callout.evaluate((el) => (el as HTMLElement).style.setProperty('--c2-banner__icon--padding', '0'))
  const message = (await callout.locator('[part="message"]').boundingBox())!
  const action = (await callout.locator('[slot="actions"]').boundingBox())!
  expect(Math.round(action.x)).toBe(Math.round(message.x))
})

test('a callout without an icon starts its actions and text at the padding edge', async ({ page, scenario }) => {
  await scenario('callout')
  const note = page.locator('#note')
  const container = (await note.locator('[part="container"]').boundingBox())!
  const content = (await note.locator('[part="content"]').boundingBox())!
  expect(Math.round(content.x - container.x)).toBe(17)
})

test('the callout dismiss button is reachable by keyboard', async ({ page, scenario, tab }) => {
  await scenario('callout')
  await page.getByRole('button', { name: 'Export' }).focus()
  await tab()
  const close = page.getByRole('button', { name: 'Dismiss notice' })
  await expect(close).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-banner').first()).toBeHidden()
})
