import { expect, type Page } from '@playwright/test'

export type ReviewedContext = {
  id: string
  tag: string
  fixture: string
  settledWhen: string
  modules?: string[]
  hoverTarget?: string
  stateSetup?: { target: string; attribute: string; value: string }[]
  dimensions?: { target: string; width?: string; height?: string }[]
}

/** Apply every declared fixture precondition before a case captures its baseline. */
export async function prepareReviewedContext(page: Page, context: ReviewedContext) {
  await page.locator('main').evaluate((main, markup) => {
    main.innerHTML = markup
  }, context.fixture)
  await page.evaluate(async (tag) => void (await customElements.whenDefined(tag)), context.tag)
  for (const action of context.stateSetup ?? []) {
    const target = page.locator(action.target).first()
    await expect(target, `${context.id}: missing state target ${action.target}`).toBeAttached({ timeout: 1000 })
    await target.evaluate((element, { attribute, value }) => element.setAttribute(attribute, value), action)
    await expect(target).toHaveAttribute(action.attribute, action.value)
  }
  for (const size of context.dimensions ?? []) {
    const target = page.locator(size.target).first()
    await expect(target, `${context.id}: missing dimension target ${size.target}`).toBeAttached({ timeout: 1000 })
    await target.evaluate((element, { width, height }) => {
      if (!(element instanceof HTMLElement)) throw new Error('dimension target must be an HTML element')
      if (width) element.style.width = width
      if (height) element.style.height = height
    }, size)
    if (size.width) await expect(target).toHaveCSS('width', size.width)
    if (size.height) await expect(target).toHaveCSS('height', size.height)
  }
  await expect(page.locator(context.settledWhen), `${context.id}: unsettled fixture`).toBeAttached()
  await page
    .locator(context.tag)
    .first()
    .evaluate(async (element) => {
      const updateComplete = (element as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete
      if (updateComplete) await updateComplete
    })
  if (context.hoverTarget) await page.locator(context.hoverTarget).first().hover()
}
