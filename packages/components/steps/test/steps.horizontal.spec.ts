import { test, expect } from './fixture'

test('a horizontal list lays its top-level steps out side by side, and draws no sub-steps', async ({ page, scenario }) => {
  await scenario('horizontal')
  const boxes = await Promise.all(
    ['Checkout', 'Build', 'Publish'].map((label) => page.locator(`c2-step[label="${label}"] [part="marker"]`).first().boundingBox()),
  )
  if (boxes.some((box) => !box)) throw new Error('Markers have no bounds')
  const [checkout, build, publish] = boxes as { x: number; y: number }[]
  // One line of markers, left to right.
  expect(build.y).toBe(checkout.y)
  expect(publish.y).toBe(checkout.y)
  expect(build.x).toBeGreaterThan(checkout.x)
  expect(publish.x).toBeGreaterThan(build.x)

  // The label sits under its marker, not beside it.
  const label = await page.locator('c2-step[label="Checkout"] [part="label"]').boundingBox()
  if (!label) throw new Error('Label has no bounds')
  expect(label.y).toBeGreaterThan(checkout.y)

  // A group is a plain step: no disclosure, no sub-steps on screen — but it still takes their status.
  const group = page.locator('c2-step[label="Build"]')
  await expect(group.locator('details')).toHaveCount(0)
  await expect(page.locator('c2-step[label="compile"]')).toBeHidden()
  await expect(group).toHaveAttribute('status', 'error')
})

test('a horizontal list draws a rail between its markers by default, and none after the last', async ({ page, scenario }) => {
  await scenario('horizontal')
  const rail = page.locator('c2-step[label="Checkout"] [part="rail"]')
  await expect(rail).toHaveCSS('height', '2px')
  await expect(rail).toHaveCSS('visibility', 'visible')
  await expect(page.locator('c2-step[label="Publish"] [part="rail"]')).toHaveCSS('visibility', 'hidden')
})

test('every step of a horizontal list is as tall as the tallest, so a selected row lines up with the rest', async ({ page, scenario }) => {
  await scenario('interactive')
  await page.locator('c2-step[value="process"]').evaluate(async (step) => {
    step.setAttribute('trailing', '3.6 s')
    await (step as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
  const process = await page.locator('c2-step[value="process"] [part="row"]').boundingBox()
  const result = await page.locator('c2-step[value="result"] [part="row"]').boundingBox()
  if (!process || !result) throw new Error('Rows have no bounds')
  expect(result.height).toBe(process.height)
})

test('a list is not interactive by default: no row is a button', async ({ page, scenario }) => {
  await scenario('horizontal')
  await expect(page.locator('c2-step button')).toHaveCount(0)
})

test('an interactive list selects the step the reader presses, and says so', async ({ page, scenario }) => {
  await scenario('interactive')
  const subject = page.locator('c2-steps#subject')
  await subject.evaluate((element) => {
    window.__toggles = []
    element.addEventListener('selection-change', (event) => {
      const { value, path } = (event as CustomEvent<{ value: string; path: string }>).detail
      window.__toggles.push(`${value}@${path}`)
    })
  })
  const process = page.locator('c2-step[value="process"] button[part="row"]')
  const result = page.locator('c2-step[value="result"] button[part="row"]')

  await expect(process).toHaveAttribute('aria-current', 'true')
  await expect(result).toHaveAttribute('aria-current', 'false')
  // No result yet, so it cannot be opened.
  await expect(result).toBeDisabled()

  // The task finishes: the app enables the result and moves the selection there. A programmatic change is silent.
  await subject.evaluate(async (element) => {
    const steps = element as HTMLElement & { selected: string; updateComplete: Promise<boolean> }
    const process = element.querySelector('c2-step[value="process"]')!
    const resultStep = element.querySelector('c2-step[value="result"]')!
    process.setAttribute('status', 'success')
    resultStep.setAttribute('status', 'success')
    resultStep.removeAttribute('disabled')
    steps.selected = 'result'
    await steps.updateComplete
  })
  await expect(result).toBeEnabled()
  await expect(result).toHaveAttribute('aria-current', 'true')
  await expect(process).toHaveAttribute('aria-current', 'false')

  // The reader can always go back to the log.
  await process.click()
  await expect(process).toHaveAttribute('aria-current', 'true')
  await expect(subject).toHaveJSProperty('selected', 'process')
  // Pressing the step that is already selected changes nothing.
  await process.click()
  expect(await page.evaluate(() => window.__toggles)).toEqual(['process@1'])
})

test('a selectable row is reachable and operable from the keyboard, and a disabled one is skipped', async ({ page, scenario, tab }) => {
  await scenario('interactive')
  await page.locator('#before').focus()
  await tab()
  await expect(page.locator('c2-step[value="process"] button[part="row"]')).toBeFocused()
  // The result is disabled, so focus leaves the list.
  await tab()
  await expect(page.locator('#after')).toBeFocused()

  await page.locator('c2-step[value="result"]').evaluate(async (step) => {
    step.removeAttribute('disabled')
    await (step as HTMLElement & { updateComplete: Promise<boolean> }).updateComplete
  })
  await page.locator('#before').focus()
  await tab()
  await tab()
  const result = page.locator('c2-step[value="result"] button[part="row"]')
  await expect(result).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('c2-steps#subject')).toHaveJSProperty('selected', 'result')
  await expect(result).toHaveAttribute('aria-current', 'true')
})

test('vertical and interactive: a group stays a disclosure, a leaf is selected by its path', async ({ page, scenario }) => {
  await scenario('interactive-vertical')
  await expect(page.locator('c2-step#build summary[part="row"]')).toHaveCount(1)
  await expect(page.locator('c2-step#build > .c2-step__frame > button[part="row"]')).toHaveCount(0)

  await page.locator('c2-step#compile button[part="row"]').click()
  await expect(page.locator('c2-steps#subject')).toHaveJSProperty('selected', '1.2')
  await expect(page.locator('c2-step#compile button[part="row"]')).toHaveAttribute('aria-current', 'true')

  // `select()` is the press in code form; it refuses a step that does not exist.
  const outcome = await page.locator('c2-steps#subject').evaluate((element) => {
    const steps = element as HTMLElement & { select(value: string): boolean }
    return [steps.select('2'), steps.select('9')]
  })
  expect(outcome).toEqual([true, false])
  await expect(page.locator('c2-step#ship button[part="row"]')).toHaveAttribute('aria-current', 'true')
  await expect(page.locator('c2-step#compile button[part="row"]')).toHaveAttribute('aria-current', 'false')
})

test('data-driven: a node is selected by its id, and `disabled` carries over', async ({ page, scenario }) => {
  await scenario('data-interactive')
  const subject = page.locator('c2-steps#subject')
  const process = subject.locator('c2-step[value="process"] button[part="row"]')
  const result = subject.locator('c2-step[value="result"] button[part="row"]')
  await expect(process).toHaveAttribute('aria-current', 'true')
  await expect(result).toBeDisabled()

  await subject.evaluate(async (element) => {
    const steps = element as HTMLElement & { updateStep(id: string, patch: object): boolean; updateComplete: Promise<boolean> }
    steps.updateStep('result', { disabled: false, status: 'success' })
    await steps.updateComplete
  })
  await result.click()
  await expect(subject).toHaveJSProperty('selected', 'result')
  await expect(result).toHaveAttribute('aria-current', 'true')
})
