// Personas: who is using the app. Each one sets up the browser context the way that person's device is set up and
// decides how an abstract step ("activate this button", "type into this field") becomes real input. Nothing here
// calls `el.click()` or sets `.value`: every action goes through Playwright's input pipeline, which hit-tests the
// pointer target, so an overlay that swallows clicks or a control that ignores keys is caught as a person would hit it.
import { devices } from '@playwright/test'

const desktop = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }

/** Types like a person: one key at a time, so `keydown`/`input` fire per character and IME-free composition paths run. */
async function typeInto(page, locator, text) {
  await page.keyboard.type(text, { delay: 15 })
  return locator
}

const pointer = {
  async activate(_page, locator) {
    await locator.click()
  },
  async fill(page, locator, text) {
    await locator.click()
    await locator.press('ControlOrMeta+a')
    await locator.press('Delete')
    await typeInto(page, locator, text)
  },
}

const touch = {
  async activate(_page, locator) {
    await locator.tap()
  },
  async fill(page, locator, text) {
    await locator.tap()
    await locator.press('ControlOrMeta+a')
    await locator.press('Delete')
    await typeInto(page, locator, text)
  },
}

/**
 * Keyboard only: reach the target with Tab, then use the key a person would press. Reaching it is itself the check:
 * a target Tab never lands on is reported (`keyboard-unreachable`) and the step falls back to the pointer so the rest of
 * the journey still runs.
 */
const keyboard = {
  maxTabs: 80,
  async activate(page, locator, ctx) {
    const reached = await tabTo(page, locator, ctx, this.maxTabs)
    if (!reached) return pointer.activate(page, locator)
    // The key follows the focused control's role as Chrome computes it (ElementInternals included): Space toggles a
    // checkbox, switch or radio, Enter activates everything else, and a text field needs no key at all.
    const { role } = await focusedAx(page)
    if (/^(textbox|searchbox|spinbutton|slider)$/.test(role)) return
    await page.keyboard.press(/^(checkbox|switch|radio|menuitemcheckbox|menuitemradio)$/.test(role) ? 'Space' : 'Enter')
  },
  async fill(page, locator, text, ctx) {
    const reached = await tabTo(page, locator, ctx, this.maxTabs)
    if (!reached) return pointer.fill(page, locator, text)
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('Delete')
    await typeInto(page, locator, text)
  },
}

/**
 * Where keyboard focus is relative to the target:
 *   'on'     focus is on the target or inside it (across shadow roots), or the focused control points at it with
 *            aria-activedescendant (a combobox or listbox that keeps DOM focus on itself);
 *   'nearby' focus is in the same `c2-*` component as the target (a list row next to it, the trigger of the select
 *            that owns it): arrow keys are how a person moves on from there;
 *   'away'   anywhere else.
 */
export function focusRelation(locator) {
  return locator.evaluate((target) => {
    const up = (node) => (node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode)
    const contains = (outer, inner) => {
      for (let node = inner; node; node = up(node)) if (node === outer) return true
      return false
    }
    let active = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    if (!active || active === document.body) return 'away'
    if (contains(target, active)) return 'on'
    for (let node = active; node; node = up(node)) {
      const descendant = node.ariaActiveDescendantElement
      if (descendant && (contains(target, descendant) || contains(descendant, target))) return 'on'
    }
    for (let node = up(active); node && node !== document.documentElement; node = up(node)) {
      if (node.localName?.startsWith('c2-') && contains(node, target)) return 'nearby'
    }
    return 'away'
  })
}

export async function focusIsOn(locator) {
  return (await focusRelation(locator)) === 'on'
}

/** From inside a composite widget, walk with the arrow keys the way its keyboard pattern says: down/right, then up/left. */
/** Chrome's role for the deepest focused element, and whether it opens a popup. */
export async function focusedAx(page) {
  const session = await page.context().newCDPSession(page)
  try {
    const { result } = await session.send('Runtime.evaluate', {
      expression: `(() => { let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement; return a })()`,
    })
    if (!result.objectId) return { role: null, hasPopup: false }
    const { node } = await session.send('DOM.describeNode', { objectId: result.objectId })
    const { nodes } = await session.send('Accessibility.getPartialAXTree', { backendNodeId: node.backendNodeId, fetchRelatives: false })
    const ax = nodes.find((candidate) => candidate.backendDOMNodeId === node.backendNodeId) ?? nodes[0]
    const property = (name) => ax?.properties?.find((entry) => entry.name === name)?.value?.value
    return { role: ax?.role?.value ?? null, hasPopup: Boolean(property('hasPopup') && property('hasPopup') !== 'false') }
  } catch {
    return { role: null, hasPopup: false }
  } finally {
    await session.detach().catch(() => {})
  }
}

/**
 * Roles whose arrow keys move between items rather than change a value. On anything else (a slider, a number field,
 * a text field) the arrows would edit what they are on, so the persona does not press them there.
 */
const COMPOSITE =
  /^(option|listbox|combobox|menu|menubar|menuitem|menuitemcheckbox|menuitemradio|tab|tablist|tree|treeitem|grid|gridcell|row|treegrid|radio|radiogroup)$/

async function arrowTo(page, locator) {
  const focused = await focusedAx(page)
  if (!COMPOSITE.test(focused.role ?? '') && !(focused.role === 'button' && focused.hasPopup)) return false
  for (const key of ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft']) {
    let previous = null
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press(key)
      const relation = await focusRelation(locator)
      if (relation === 'on') return true
      if (relation === 'away') return false
      // Stop on this axis once a key press no longer moves anything.
      const here = await page.evaluate(() => {
        let active = document.activeElement
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
        return `${active?.localName}|${active?.textContent?.trim().slice(0, 40)}|${active?.getAttribute('aria-activedescendant') ?? ''}`
      })
      if (here === previous) break
      previous = here
    }
  }
  return false
}

async function tabTo(page, locator, ctx, maxTabs) {
  const relation = await focusRelation(locator)
  if (relation === 'on') return true
  if (relation === 'nearby' && (await arrowTo(page, locator))) return true
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press('Tab')
    await ctx.onTabStop?.()
    const now = await focusRelation(locator)
    if (now === 'on') return true
    if (now === 'nearby' && (await arrowTo(page, locator))) return true
  }
  const target = await locator
    .evaluate((el) => {
      const up = (node) => (node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode)
      let host = null
      for (let node = el; node && !host; node = up(node)) if (node.localName?.startsWith('c2-')) host = node.localName
      return { host, text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60) }
    })
    .catch(() => ({ host: null, text: '' }))
  ctx.report?.({
    kind: 'keyboard-unreachable',
    severity: 'error',
    component: target.host,
    rule: ctx.stepLabel ?? target.text,
    message: `Neither Tab (${maxTabs} presses) nor the arrow keys reached "${target.text}"${target.host ? ` in ${target.host}` : ''}.`,
  })
  return false
}

export const PERSONAS = {
  mouse: { description: 'Desktop, mouse and keyboard typing', context: desktop, input: pointer },
  keyboard: { description: 'Desktop, keyboard only (Tab / Enter / Space / Escape)', context: desktop, input: keyboard, checkFocus: true },
  mobile: { description: 'Phone, touch input, narrow viewport', context: { ...devices['Pixel 7'] }, input: touch },
  dark: { description: 'Desktop, dark colour scheme', context: { ...desktop, colorScheme: 'dark' }, input: pointer, theme: 'dark' },
  fr: {
    description: 'Desktop, French locale and page language',
    context: { ...desktop, locale: 'fr-FR', timezoneId: 'Europe/Paris' },
    input: pointer,
    lang: 'fr',
  },
}

/** Init script that applies a persona's page-level settings before the app's own scripts run. */
export function personaInitScript(persona) {
  const theme = persona.theme ?? null
  const lang = persona.lang ?? null
  return {
    content: `(() => {
      const apply = () => {
        if (!document.documentElement) return;
        ${theme ? `document.documentElement.dataset.theme = ${JSON.stringify(theme)};` : ''}
        ${lang ? `document.documentElement.lang = ${JSON.stringify(lang)};` : ''}
      };
      apply();
      new MutationObserver((_, observer) => {
        if (document.documentElement) { apply(); observer.disconnect(); }
      }).observe(document, { childList: true });
      document.addEventListener('DOMContentLoaded', apply, { once: true });
    })()`,
  }
}
