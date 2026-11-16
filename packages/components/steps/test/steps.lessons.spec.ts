import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixture'

for (const state of ['lessons', 'lessons-interactive', 'lessons-data']) {
  test(`${state} has no axe violations`, async ({ page, scenario }) => {
    await scenario(state)
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
  })
}

test('without group-progress, reason or a locked step, nothing new is drawn', async ({ page, scenario }) => {
  await scenario()
  await expect(page.locator('c2-steps#subject')).not.toHaveAttribute('group-progress')
  await expect(page.locator('c2-step [part="progress"]')).toHaveCount(0)
  await expect(page.locator('c2-step [part="reason"]:visible')).toHaveCount(0)
  for (const step of await page.locator('c2-step').all()) {
    expect(await step.evaluate((element) => (element as HTMLElement & { progress?: unknown }).progress)).toBeUndefined()
  }
  // The row keeps its geometry: the label line is wrapped in a body now, which must not move or grow anything (the
  // values were measured on the rows before that wrapper existed).
  const row = await page.locator('c2-step[label="goto"] [part="row"]').boundingBox()
  const label = page.locator('c2-step[label="goto"] [part="label"]')
  const labelBox = await label.boundingBox()
  expect(row!.height).toBeCloseTo(36.75, 1)
  expect(labelBox!.x - row!.x).toBeCloseTo(38, 1)
  expect(labelBox!.y - row!.y).toBeCloseTo(7, 1)
})

test('group-progress counts each group under its label, and follows a status change', async ({ page, scenario }) => {
  await scenario('lessons')
  const basics = page.locator('c2-step#basics')
  await expect(basics.locator('[part="progress"]').first()).toHaveText('1 of 3')
  await expect(page.locator('c2-step#advanced [part="progress"]').first()).toHaveText('0 of 2')
  // A step that is not a group draws no count.
  await expect(page.locator('c2-step#loose [part="progress"]')).toHaveCount(0)
  await expect(page.locator('c2-step#intro [part="progress"]')).toHaveCount(0)
  // The count is part of the group's row, so it is read with it.
  await expect(basics.locator('summary[part="row"]')).toHaveAccessibleName(/Basics.*1 of 3/)

  await page.evaluate(() => window.setStatus('forms', 'success'))
  await expect(basics.locator('[part="progress"]').first()).toHaveText('2 of 3')
  await expect(basics).toHaveJSProperty('progress', { completed: 2, total: 3 })

  // Turning it off takes every count away again.
  await page.locator('c2-steps#subject').evaluate((element) => element.removeAttribute('group-progress'))
  await expect(page.locator('c2-step [part="progress"]')).toHaveCount(0)
})

test('the bar is not drawn by default, and one variable draws it filled to the count', async ({ page, scenario }) => {
  await scenario('lessons')
  const bar = page.locator('c2-step#basics [part="progress-bar"]').first()
  await expect(bar).toHaveCSS('width', '0px')
  await expect(bar).toHaveCSS('margin-inline-end', '0px')
  await page.locator('c2-steps#subject').evaluate((element) => element.style.setProperty('--c2-step__progress__bar--width', '60px'))
  await expect(bar).toHaveCSS('width', '60px')
  await expect(bar).toHaveCSS('margin-inline-end', '6px')
  await expect(bar).toHaveCSS('background-image', /linear-gradient/)
})

test('a locked step draws a padlock, drops its link, says so and shows its reason', async ({ page, scenario }) => {
  await scenario('lessons')
  const themes = page.locator('c2-step#themes')
  await expect(themes).toHaveState('locked')
  await expect(themes.locator('a[part="row"]')).toHaveCount(0)
  await expect(themes.locator('[part="marker"] svg')).toHaveCount(1)
  await expect(themes.locator('[part="row"]')).toContainText('Locked')
  await expect(themes.locator('[part="reason"]')).toHaveText('Finish Basics to unlock')
  // The reason sits under the label, not beside it.
  const label = await themes.locator('[part="label"]').boundingBox()
  const reason = await themes.locator('[part="reason"]').boundingBox()
  expect(reason!.y).toBeGreaterThanOrEqual(label!.y + label!.height - 1)
  // The slot replaces the attribute.
  await expect(page.locator('c2-step#slots [part="reason"]')).toBeVisible()
  await expect(page.locator('#slot-reason')).toHaveText('Available on 3 May')
  // An unlocked lesson keeps its link; a group of locked lessons rolls up as locked.
  await expect(page.locator('c2-step#valid a[part="row"]')).toHaveAttribute('href', '#valid')
  await expect(page.locator('c2-step#advanced')).toHaveJSProperty('status', 'locked')
})

test('unlocking a step gives it its link back', async ({ page, scenario }) => {
  await scenario('lessons')
  await page.evaluate(() => window.setStatus('themes', 'pending'))
  await expect(page.locator('c2-step#themes a[part="row"]')).toHaveAttribute('href', '#themes')
  await expect(page.locator('c2-step#advanced [part="progress"]').first()).toHaveText('0 of 2')
})

test('the keyboard skips a locked lesson', async ({ page, scenario }) => {
  await scenario('lessons')
  await page.locator('#before').focus()
  const order = ['c2-step#basics summary', 'c2-step#intro a', 'c2-step#forms a', 'c2-step#valid a', 'c2-step#advanced summary']
  for (const selector of order) {
    await page.keyboard.press('Tab')
    await expect(page.locator(`${selector}[part="row"]`)).toBeFocused()
  }
  await page.keyboard.press('Tab')
  await expect(page.locator('#after')).toBeFocused()
})

test('a locked step in an interactive list is neither a button nor selectable', async ({ page, scenario }) => {
  await scenario('lessons-interactive')
  const list = page.locator('c2-steps#subject')
  const two = page.locator('c2-step[value="two"]')
  await expect(two.locator('button')).toHaveCount(0)
  await expect(two.locator('[part="reason"]')).toHaveText('Finish One first')
  await two.locator('[part="row"]').click()
  await expect(list).toHaveJSProperty('selected', '')
  expect(await list.evaluate((element) => (element as HTMLElement & { select: (value: string) => boolean }).select('two'))).toBe(false)

  // Tab goes from the first button to the third: the locked row is not in the way.
  await page.locator('c2-step[value="one"] button').focus()
  await page.keyboard.press('Tab')
  await expect(page.locator('c2-step[value="three"] button')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(list).toHaveJSProperty('selected', 'three')
})

test('from data: reason and locked come through, and a renderer reads a group count', async ({ page, scenario }) => {
  await scenario('lessons-data')
  const host = page.locator('c2-steps#subject')
  const basics = host.locator('c2-step[value="basics"]')
  await expect(basics.locator('[part="progress"]').first()).toHaveText('2 of 3')
  await expect(basics.locator(':scope > [slot="trailing"]')).toHaveText('2/3')
  const themes = host.locator('c2-step[value="themes"]')
  await expect(themes).toHaveJSProperty('status', 'locked')
  await expect(themes.locator('[part="reason"]')).toHaveText('Finish Basics to unlock')
  await expect(themes.locator('a')).toHaveCount(0)
  // A leaf has no count for a renderer to read.
  await expect(themes.locator(':scope > [slot="trailing"]')).toHaveText('')
})

test('the count and the locked status are translatable', async ({ page, scenario }) => {
  await scenario('lessons-fr')
  await expect(page.locator('c2-step[label="Bases"] [part="progress"]').first()).toHaveText('1 sur 2')
  await expect(page.locator('c2-step[label="Deux"] [part="row"]')).toContainText('Verrouillée')
})

test('a group whose only unfinished steps are locked is locked, even after a warning', async ({ page, scenario }) => {
  await scenario('lessons')
  const basics = page.locator('c2-step#basics')
  await page.evaluate(() => {
    window.setStatus('forms', 'warning')
    window.setStatus('valid', 'locked')
  })
  await expect(basics).toHaveJSProperty('status', 'locked')
  // With a step still open the rollup is what it always was: a warning outranks pending work.
  await page.evaluate(() => window.setStatus('valid', 'pending'))
  await expect(basics).toHaveJSProperty('status', 'warning')
})

test('setting selected to a locked step selects nothing', async ({ page, scenario }) => {
  await scenario('lessons-interactive')
  await page.locator('c2-steps#subject').evaluate((element) => ((element as HTMLElement & { selected: string }).selected = 'two'))
  await expect(page.locator('c2-step[value="two"]')).toHaveJSProperty('selected', false)
  await expect(page.locator('c2-step[value="two"] .is-selected')).toHaveCount(0)
})
