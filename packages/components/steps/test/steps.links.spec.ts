import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['task-list', 'stage-path', 'data-links', 'summary-slot']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('without href, summary or a header slot, nothing new is drawn', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-steps#subject [part="header"]')).toBeHidden()
  await expect(page.locator('c2-steps#subject a[part="row"]')).toHaveCount(0)
  // The list keeps its layout: the header takes no space.
  const header = await page.locator('c2-steps#subject [part="header"]').evaluate((element) => getComputedStyle(element).display)
  expect(header).toBe('none')
})

test('a step with href is a link, a disabled one is not, and a group stays its disclosure', async ({ page, scenario }) => {
  await scenario('task-list')
  const company = page.locator('c2-step#company a[part="row"]')
  await expect(company).toHaveAttribute('href', '#company')
  await expect(company).toHaveAccessibleName(/Company details/)
  await expect(page.locator('c2-step#submit a[part="row"]')).toHaveCount(0)
  await expect(page.locator('c2-step#submit [part="row"]')).toContainText('Cannot start yet')
  await expect(page.locator('c2-step[label="Prepare"] summary[part="row"]')).toHaveCount(1)
})

test('the links are in the tab order and Enter follows one', async ({ page, scenario }) => {
  await scenario('task-list')
  await page.locator('#before').focus()
  // The two group summaries and the four enabled tasks, in reading order; the disabled task is skipped.
  const order = ['Prepare', 'company', 'directors', 'bank', 'Apply', 'declarations']
  for (const id of order) {
    await page.keyboard.press('Tab')
    const row = id[0] === id[0].toUpperCase() ? page.locator(`c2-step[label="${id}"] summary[part="row"]`) : page.locator(`c2-step#${id} a[part="row"]`)
    await expect(row).toBeFocused()
  }
  await page.keyboard.press('Tab')
  await expect(page.locator('#after')).toBeFocused()

  await page.keyboard.press('Shift+Tab')
  await expect(page.locator('c2-step#declarations a[part="row"]')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#declarations$/)
})

test('a focused link draws its focus ring and underlines its label', async ({ page, scenario }) => {
  await scenario('task-list')
  await page.locator('#before').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const row = page.locator('c2-step#company a[part="row"]')
  await expect(row).toBeFocused()
  await expect(row).toHaveCSS('outline-style', 'solid')
  await expect(page.locator('c2-step#company [part="label"]')).toHaveCSS('text-decoration-line', 'underline')
})

test('the summary counts the steps that are not groups, and follows a status change', async ({ page, scenario }) => {
  await scenario('task-list')
  const summary = page.locator('c2-steps#subject [part="summary"]')
  await expect(summary).toBeVisible()
  await expect(summary).toHaveText('2 of 5 completed')
  expect(await page.locator('c2-steps#subject').evaluate((list) => (list as HTMLElementTagNameMap['c2-steps']).progress)).toEqual({ completed: 2, total: 5 })
  await page.evaluate(() => window.setStatus('bank', 'success'))
  await expect(summary).toHaveText('3 of 5 completed')
  // warning and skipped are finished too.
  await page.evaluate(() => window.setStatus('declarations', 'skipped'))
  await expect(summary).toHaveText('4 of 5 completed')
})

test('the summary slot replaces the text and shows the header on its own', async ({ page, scenario }) => {
  await scenario('summary-slot')
  await expect(page.locator('c2-steps#subject [part="summary"]')).toBeVisible()
  await expect(page.locator('c2-steps#subject')).toContainText('You have completed 1 section')
  await expect(page.locator('c2-steps#subject [part="actions"]')).toBeHidden()
})

test('the summary is translated through the steps catalog', async ({ page, scenario }) => {
  await scenario('summary-fr')
  await expect(page.locator('c2-steps#subject [part="summary"]')).toHaveText('1 sur 2 terminées')
})

test('links from data: href on a node, and a disabled node without its link', async ({ page, scenario }) => {
  await scenario('data-links')
  const list = page.locator('c2-steps#subject')
  await expect(list.locator('c2-step[value="a"] a[part="row"]')).toHaveAttribute('href', '#profile')
  await expect(list.locator('c2-step[value="b"] a[part="row"]')).toHaveAttribute('href', '#payment')
  await expect(list.locator('c2-step[value="c"] a[part="row"]')).toHaveCount(0)
  await expect(list.locator('[part="summary"]')).toHaveText('1 of 3 completed')
})

test('a stage path: the header sits above the stages, a press selects, and the action moves current', async ({ page, scenario }) => {
  await scenario('stage-path')
  const list = page.locator('c2-steps#subject')
  const actions = await list.locator('[part="actions"]').boundingBox()
  const first = await list.locator('c2-step[value="prospecting"] [part="row"]').boundingBox()
  const last = await list.locator('c2-step[value="closed"] [part="row"]').boundingBox()
  if (!actions || !first || !last) throw new Error('No bounds')
  // The header has a line of its own; the stages stay on one line under it.
  expect(first.y).toBeGreaterThanOrEqual(actions.y + actions.height)
  expect(last.y).toBe(first.y)
  // The chevron is a clip-path on the row.
  await expect(list.locator('c2-step[value="proposal"] [part="row"]')).toHaveCSS('clip-path', /polygon/)

  await expect(list.locator('c2-step[value="proposal"]')).toHaveJSProperty('status', 'current')
  await page.locator('c2-step[value="negotiation"] button[part="row"]').focus()
  await page.keyboard.press('Enter')
  await expect(list).toHaveJSProperty('selected', 'negotiation')
  await page.locator('#mark').click()
  await expect(list).toHaveJSProperty('current', 3)
  await expect(list.locator('c2-step[value="negotiation"]')).toHaveJSProperty('status', 'current')
  await expect(list.locator('c2-step[value="proposal"]')).toHaveJSProperty('status', 'success')
})

test('without the header, a horizontal list keeps its single row of steps', async ({ page, scenario }) => {
  await scenario('horizontal')
  await expect(page.locator('c2-steps#subject')).toHaveCSS('flex-direction', 'row')
  await expect(page.locator('c2-steps#subject .body')).toHaveCSS('display', 'contents')
})

test('in an interactive list a link selects its step, unless it opens elsewhere', async ({ page, scenario }) => {
  await scenario('interactive-links')
  const list = page.locator('c2-steps#subject')
  // A horizontal list counts what it draws: three top-level steps, the group by its rolled-up status.
  await expect(list.locator('[part="summary"]')).toHaveText('1 of 3 completed')
  const three = page.locator('c2-step[value="three"] a[part="row"]')
  await three.click({ modifiers: ['ControlOrMeta'] })
  await expect(list).toHaveJSProperty('selected', '')
  await page.locator('c2-step[value="one"] a[part="row"]').focus()
  await page.keyboard.press('Enter')
  await expect(list).toHaveJSProperty('selected', 'one')
  await expect(page).toHaveURL(/#one$/)
  await expect(page.locator('c2-step[value="one"] a[part="row"]')).toHaveAttribute('aria-current', 'true')
})
