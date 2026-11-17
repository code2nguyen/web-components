// The journey step language. A step names what a person sees ("the button called Send reply"), never a CSS path into a
// shadow root, so journeys survive refactors and an agent can write them from an accessibility snapshot.
import { expect } from '@playwright/test'
import { axTree } from './ax-tree.mjs'

let tagCounter = 0

/**
 * `{ ax: 'option', name: 'Closed' }` finds the node in Chrome's accessibility tree, the one a screen reader reads, and
 * hands back a locator for its DOM element. Use it for roles a component states through ElementInternals (a c2-list
 * row is an `option`, a c2-tabs host a `tablist`), which Playwright's `getByRole` cannot see. The name matches as a
 * case-insensitive substring unless `exact` is set. Returns null when no node matches.
 */
async function locateAx(page, target) {
  const wanted = String(target.name ?? '').toLowerCase()
  const matches = (await axTree(page)).filter(
    (node) => node.role === target.ax && (target.exact ? node.name.toLowerCase() === wanted : node.name.toLowerCase().includes(wanted)),
  )
  const node = matches[target.nth ?? 0]
  if (!node?.backendId) return null
  const session = await page.context().newCDPSession(page)
  try {
    const { object } = await session.send('DOM.resolveNode', { backendNodeId: node.backendId })
    const id = `lab-${++tagCounter}`
    // A data attribute no component observes; Playwright's CSS engine pierces open shadow roots to find it again.
    await session.send('Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function (id) { (this.nodeType === 1 ? this : this.parentElement).setAttribute('data-lab-target', id) }`,
      arguments: [{ value: id }],
    })
    return page.locator(`[data-lab-target="${id}"]`)
  } finally {
    await session.detach().catch(() => {})
  }
}

/** Like `resolve`, but also understands `{ ax }` targets, waiting up to `timeout` for the node to appear. */
export async function locate(page, target, timeout = 4000) {
  if (!target?.ax) return resolve(page, target)
  const deadline = Date.now() + timeout
  for (;;) {
    const locator = await locateAx(page, target)
    if (locator) return locator
    if (Date.now() > deadline) throw new Error(`No accessibility node ${target.ax} "${target.name ?? ''}" appeared within ${timeout}ms.`)
    await page.waitForTimeout(150)
  }
}

/**
 * Resolve a target to a locator. Forms, in order of preference:
 *   { ax, name, exact? }    role + name read from Chrome's accessibility tree (see `locate`); the most faithful form
 *   { role, name, exact? }  role + name as Playwright computes it (misses roles set through ElementInternals)
 *   { label }               a form control by its label
 *   { placeholder }         a field by its placeholder
 *   { text, exact? }        visible text
 *   { css }                 last resort, for things with no accessible handle (and itself a finding worth noting)
 * Any form takes `nth` (0-based) and `within` (another target to scope to).
 */
export function resolve(page, target) {
  if (typeof target === 'string') target = { text: target }
  const scope = target.within ? resolve(page, target.within) : page
  let locator
  if (target.role) locator = scope.getByRole(target.role, { name: target.name, exact: target.exact ?? false })
  else if (target.label) locator = scope.getByLabel(target.label, { exact: target.exact ?? false })
  else if (target.placeholder) locator = scope.getByPlaceholder(target.placeholder)
  else if (target.text) locator = scope.getByText(target.text, { exact: target.exact ?? false })
  else if (target.css) locator = scope.locator(target.css)
  else throw new Error(`Cannot resolve target ${JSON.stringify(target)}`)
  return target.nth === undefined ? locator.first() : locator.nth(target.nth)
}

export function describeStep(step) {
  const [verb] = Object.keys(step).filter((key) => key !== 'note')
  return `${verb} ${JSON.stringify(step[verb])}${step.text !== undefined && verb === 'fill' ? ` ← "${step.text}"` : ''}`
}

/**
 * Run one step. `ctx` carries the persona, a `report` function and the run directory.
 * Expectations use Playwright's auto-retrying assertions with a short timeout: a person waits a moment, not 30 seconds.
 */
export async function runStep(page, step, ctx) {
  const timeout = step.timeout ?? 4000
  const input = ctx.persona.input
  if ('goto' in step) {
    await page.goto(step.goto)
    await page.waitForLoadState('networkidle').catch(() => {})
    return
  }
  if ('click' in step) {
    const locator = await locate(page, step.click, timeout)
    await locator.waitFor({ state: 'visible', timeout })
    return input.activate(page, locator, ctx)
  }
  if ('fill' in step) {
    const locator = await locate(page, step.fill, timeout)
    await locator.waitFor({ state: 'visible', timeout })
    return input.fill(page, locator, String(step.text ?? ''), ctx)
  }
  if ('press' in step) return page.keyboard.press(step.press)
  if ('type' in step) return page.keyboard.type(step.type, { delay: 15 })
  if ('hover' in step) return (await locate(page, step.hover, timeout)).hover()
  if ('wait' in step) return page.waitForTimeout(step.wait)
  if ('snapshot' in step) return ctx.snapshot(step.snapshot)
  if ('expect' in step) return expectState(page, step.expect, timeout)
  throw new Error(`Unknown step ${JSON.stringify(step)}`)
}

async function expectState(page, assertion, timeout) {
  if (assertion.hidden?.ax) {
    const deadline = Date.now() + timeout
    while (await locateAx(page, assertion.hidden)) {
      if (Date.now() > deadline) throw new Error(`Accessibility node ${assertion.hidden.ax} "${assertion.hidden.name ?? ''}" is still exposed.`)
      await page.waitForTimeout(150)
    }
    return
  }
  if (assertion.visible) return expect(await locate(page, assertion.visible, timeout)).toBeVisible({ timeout })
  if (assertion.hidden) return expect(resolve(page, assertion.hidden)).toBeHidden({ timeout })
  if (assertion.focused) return expect(await locate(page, assertion.focused, timeout)).toBeFocused({ timeout })
  if (assertion.count) {
    const target = typeof assertion.count === 'string' ? { css: assertion.count } : { ...assertion.count }
    delete target.nth
    const locator = target.role
      ? page.getByRole(target.role, { name: target.name, exact: target.exact ?? false })
      : target.css
        ? page.locator(target.css)
        : page.getByText(target.text, { exact: target.exact ?? false })
    return expect(locator).toHaveCount(assertion.equals, { timeout })
  }
  if (assertion.text) return expect(await locate(page, assertion.text, timeout)).toContainText(assertion.contains, { timeout })
  if (assertion.value) return expect(await locate(page, assertion.value, timeout)).toHaveValue(assertion.equals, { timeout })
  throw new Error(`Unknown expectation ${JSON.stringify(assertion)}`)
}
