import type { Page } from '@playwright/test'
import { accessible } from '../../../../tests/component-fixture'
import { test, expect } from './fixture'

const detail = (page: Page) => page.getByRole('region', { name: 'Details' })
const placeholder = (page: Page) => page.getByText('Select a conversation')
const item = (page: Page, name: string) => page.getByRole('button', { name })
const back = (page: Page) => page.getByRole('button', { name: 'Back', exact: true })
const events = (page: Page) => page.locator('output')
const layoutOf = (page: Page) => page.locator('c2-master-detail').evaluate((element) => element.layout)

test('split: shows the placeholder until a record opens beside the list', async ({ page, scenario }) => {
  await scenario('split')
  expect(await layoutOf(page)).toBe('split')
  await expect(placeholder(page)).toBeVisible()
  await expect(detail(page)).toBeHidden()

  await item(page, 'Kenji Watanabe').click()
  await expect(detail(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'SSO login loops back' })).toBeVisible()
  await expect(placeholder(page)).toBeHidden()
  // Both panes at once, the master first; no Back bar, and focus stays on the list.
  await expect(item(page, 'Ana Ruiz')).toBeVisible()
  await expect(back(page)).toBeHidden()
  await expect(item(page, 'Kenji Watanabe')).toBeFocused()

  const master = await page.locator('c2-master-detail [part="master"]').boundingBox()
  const pane = await page.locator('c2-master-detail [part="detail"]').boundingBox()
  expect(master!.width).toBeCloseTo(320, 0)
  expect(pane!.x).toBeGreaterThanOrEqual(master!.x + master!.width - 1)
})

test('split: is accessible with a record open', async ({ page, scenario }) => {
  await scenario('split-open')
  await expect(detail(page)).toBeVisible()
  await accessible(page)
})

test('stack: the detail replaces the list, Back returns focus to the record', async ({ page, scenario }) => {
  await scenario('stack')
  expect(await layoutOf(page)).toBe('stack')
  await expect(detail(page)).toBeHidden()
  await expect(placeholder(page)).toBeHidden()

  await item(page, 'Priya Natarajan').focus()
  await page.keyboard.press('Enter')
  await expect(detail(page)).toBeVisible()
  await expect(detail(page)).toBeFocused()
  await expect(item(page, 'Ana Ruiz')).toBeHidden()
  await accessible(page)

  await back(page).click()
  await expect(page.locator('c2-master-detail')).not.toHaveAttribute('open')
  await expect(item(page, 'Ana Ruiz')).toBeVisible()
  await expect(item(page, 'Priya Natarajan')).toBeFocused()
  await expect(detail(page)).toBeHidden()
  await expect(events(page)).toHaveText('close:back')
})

test('stack: Escape does not close; the list is out of the tab order while the detail is open', async ({ page, scenario, tab }) => {
  await scenario('stack')
  await item(page, 'Ana Ruiz').click()
  await expect(detail(page)).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(detail(page)).toBeVisible()
  await tab()
  await expect(back(page)).toBeFocused()
  await tab()
  await expect(page.getByRole('button', { name: 'Reply' })).toBeFocused()
  await tab(true)
  await tab(true)
  // Past the detail, straight to the button before the layout: the inert master is skipped.
  await expect(page.locator('#before')).toBeFocused()
})

test('overlay: the detail slides over the inert list; Escape and the backdrop close it', async ({ page, scenario }) => {
  await scenario('overlay')
  expect(await layoutOf(page)).toBe('overlay')
  await item(page, 'Kenji Watanabe').click()
  const dialog = page.getByRole('dialog', { name: 'Details' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toBeFocused()
  // The list stays painted behind the backdrop.
  await expect(item(page, 'Ana Ruiz')).toBeVisible()
  // 420px wide at the inline end of the 600px host, leaving a strip of backdrop over the list.
  const box = await dialog.boundingBox()
  expect(box!.width).toBeCloseTo(420, 0)

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(item(page, 'Kenji Watanabe')).toBeFocused()

  await item(page, 'Ana Ruiz').click()
  await expect(dialog).toBeVisible()
  await page.locator('c2-master-detail [part="backdrop"]').click({ position: { x: 5, y: 5 } })
  await expect(dialog).toBeHidden()
  await expect(events(page)).toHaveText('close:escape close:backdrop')
})

test('a cancelled close-request keeps the detail open', async ({ page, scenario }) => {
  await scenario('cancel')
  await item(page, 'Ana Ruiz').click()
  await back(page).click()
  await expect(events(page)).toHaveText('close:back')
  await expect(detail(page)).toBeVisible()
  await expect(page.locator('c2-master-detail')).toHaveAttribute('open')
})

test('an element with master-detail-back closes the detail', async ({ page, scenario }) => {
  await scenario('custom-back')
  await item(page, 'Ana Ruiz').click()
  await expect(back(page)).toBeHidden()
  await page.getByRole('button', { name: 'Close record' }).click()
  await expect(detail(page)).toBeHidden()
  await expect(events(page)).toHaveText('close:back')
})

test('follows its own width across the breakpoint and keeps the open record', async ({ page, scenario }) => {
  await scenario('resize')
  await item(page, 'Kenji Watanabe').click()
  await expect(item(page, 'Kenji Watanabe')).toBeFocused()
  await page.locator('#frame').evaluate((frame) => (frame.style.width = '500px'))
  await expect(events(page)).toHaveText('layout:stack')
  await expect(detail(page)).toBeVisible()
  // The list went inert under the focus, which moves to the detail now on screen.
  await expect(detail(page)).toBeFocused()
  await expect(back(page)).toBeVisible()
  await expect(item(page, 'Ana Ruiz')).toBeHidden()

  await back(page).click()
  await page.locator('#frame').evaluate((frame) => (frame.style.width = '1000px'))
  await expect(events(page)).toHaveText('layout:stack close:back layout:split')
  await expect(placeholder(page)).toBeVisible()
  await expect(item(page, 'Ana Ruiz')).toBeVisible()
})

test('lays out from the default breakpoint before it is measured', async ({ page, scenario }) => {
  await scenario('split')
  // A fresh element, rendered but not yet observed: no custom state is set, so the container query decides.
  const columns = await page.evaluate(async () => {
    const host = document.createElement('div')
    host.style.width = '900px'
    host.innerHTML = '<c2-master-detail style="height: 200px"><p slot="master">List</p></c2-master-detail>'
    document.body.append(host)
    const element = host.firstElementChild as HTMLElementTagNameMap['c2-master-detail']
    await element.updateComplete
    return getComputedStyle(element.shadowRoot!.querySelector('.layout')!).gridTemplateColumns.split(' ').length
  })
  expect(columns).toBe(2)
})
