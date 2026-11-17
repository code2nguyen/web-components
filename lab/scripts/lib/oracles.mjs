// Oracles: the checks that decide whether something is a finding. They are deterministic on purpose: an agent may
// explore and suggest, but a finding the lab files must come from one of these, so a run can be replayed and the
// finding confirmed without anyone's judgement.
import { AxeBuilder } from '@axe-core/playwright'

const C2_TAG = /\bc2-[a-z0-9]+(?:-[a-z0-9]+)*/g

/** The innermost `c2-*` tag named in a string (a selector path, a stack, a message), or null. */
export function componentIn(text) {
  const tags = String(text ?? '').match(C2_TAG)
  return tags ? tags[tags.length - 1] : null
}

const IGNORED_CONSOLE = [/Lit is in dev mode/i, /^\[vite\]/, /Download the Vue Devtools/i, /\[HMR\]/]
const INTERESTING_WARNING = /c2-|\blit\b|custom element|hydrat|shadow|aria/i

/** Console errors, uncaught exceptions, failed same-origin requests. Returns a detach function. */
export function watchConsole(page, report) {
  const origin = () => {
    try {
      return new URL(page.url()).origin
    } catch {
      return ''
    }
  }
  const onConsole = (message) => {
    const type = message.type()
    if (type !== 'error' && type !== 'warning') return
    const location = message.location()?.url ?? ''
    if (/\/favicon\.ico$/.test(location)) return
    const text = location && /Failed to load resource/.test(message.text()) ? `${message.text()} ${location}` : message.text()
    if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return
    if (type === 'warning' && !INTERESTING_WARNING.test(text)) return
    report({
      kind: type === 'error' ? 'console-error' : 'console-warning',
      severity: type === 'error' ? 'error' : 'warn',
      component: componentIn(text),
      rule: normalise(text),
      message: text.slice(0, 600),
    })
  }
  const onPageError = (error) => {
    const text = `${error.message}\n${error.stack ?? ''}`
    report({ kind: 'uncaught-exception', severity: 'error', component: componentIn(text), rule: normalise(error.message), message: text.slice(0, 1200) })
  }
  const onRequestFailed = (request) => {
    const appOrigin = origin()
    if (!appOrigin || appOrigin === 'null' || !request.url().startsWith(appOrigin)) return
    report({
      kind: 'request-failed',
      severity: 'error',
      rule: new URL(request.url()).pathname,
      message: `${request.failure()?.errorText ?? 'failed'}: ${request.url()}`,
    })
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  return () => {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('requestfailed', onRequestFailed)
  }
}

/** Collapse numbers, ids and quoted values so the same message from two runs gets one key. */
function normalise(text) {
  return String(text)
    .split('\n')[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b\d+\b/g, 'N')
    .replace(/"[^"]{0,80}"|'[^']{0,80}'/g, '<v>')
    .slice(0, 160)
}

/**
 * Wait for finite animations (a toast sliding in, a drawer opening) to end, at most 3s: measured mid-fade, text has
 * partial opacity and axe reports a contrast failure no person would see once it settles.
 */
export async function settleAnimations(page) {
  await page
    .evaluate(() =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => {})),
        ),
        new Promise((done) => setTimeout(done, 3000)),
      ]),
    )
    .catch(() => {})
}

/** axe-core over the whole page, shadow roots included, settled. Each violated rule is reported once per component. */
export async function checkAxe(page, report) {
  // Two passes half a second apart, keeping only what both saw: a frame of a closing popup or a fading toast is not
  // what a person reads, and measured mid-transition its colours fail contrast that the settled page passes.
  await settleAnimations(page)
  const first = await new AxeBuilder({ page }).analyze()
  if (!first.violations.length) return
  // The second pass only re-checks the rules the first one broke. A node counts as the same when its selector or its
  // markup matches, since a list that re-rendered in between gives its rows new `:nth-child` selectors.
  await page.waitForTimeout(500)
  await settleAnimations(page)
  const second = await new AxeBuilder({ page }).withRules([...new Set(first.violations.map((violation) => violation.id))]).analyze()
  const seenTargets = new Set(first.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}|${JSON.stringify(node.target)}`)))
  const seenMarkup = new Set(first.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}|${node.html}`)))
  const stable = second.violations
    .map((violation) => ({
      ...violation,
      nodes: violation.nodes.filter(
        (node) => seenTargets.has(`${violation.id}|${JSON.stringify(node.target)}`) || seenMarkup.has(`${violation.id}|${node.html}`),
      ),
    }))
    .filter((violation) => violation.nodes.length)
  for (const violation of stable) {
    const byComponent = new Map()
    for (const node of violation.nodes) {
      const path = JSON.stringify(node.target)
      const component = componentIn(path) ?? componentIn(node.html)
      const entry = byComponent.get(component) ?? []
      entry.push({ target: node.target, html: node.html.slice(0, 300), summary: node.failureSummary?.slice(0, 400) })
      byComponent.set(component, entry)
    }
    for (const [component, nodes] of byComponent) {
      report({
        kind: 'axe',
        severity: violation.impact === 'critical' || violation.impact === 'serious' ? 'error' : 'warn',
        component,
        rule: violation.id,
        message: `${violation.help} (${violation.impact}) — ${nodes.length} node(s)`,
        details: { helpUrl: violation.helpUrl, nodes: nodes.slice(0, 5) },
      })
    }
  }
}

/** Content wider than the viewport: the page scrolls sideways, which nobody designing for a phone wants. */
export async function checkOverflow(page, report) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    if (doc.scrollWidth <= doc.clientWidth + 1) return null
    // Every c2 element, through shadow roots, with its nesting depth among c2 elements.
    const found = []
    const walk = (root, depth) => {
      for (const el of root.querySelectorAll('*')) {
        const isC2 = el.localName.startsWith('c2-')
        if (isC2) {
          const right = el.getBoundingClientRect().right
          if (right > doc.clientWidth + 1) {
            let level = depth
            for (let node = el.parentNode; node; node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode) {
              if (node.localName?.startsWith('c2-')) level++
            }
            found.push({ tag: el.localName, right: Math.round(right), depth: level })
          }
        }
        if (el.shadowRoot) walk(el.shadowRoot, depth)
      }
    }
    walk(document, 0)
    // The deepest overflowing component is the likeliest cause: its ancestors overflow because it does.
    found.sort((a, b) => b.depth - a.depth || b.right - a.right)
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide: found.slice(0, 5) }
  })
  if (!overflow) return
  report({
    kind: 'overflow',
    severity: 'warn',
    component: overflow.wide[0]?.tag ?? null,
    rule: 'horizontal-scroll',
    message: `Page is ${overflow.scrollWidth}px wide in a ${overflow.clientWidth}px viewport.`,
    details: overflow,
  })
}

/** Describe the deepest focused element: tag, role, name, and the `c2-*` hosts it sits in. */
export function describeFocus(page) {
  return page.evaluate(() => {
    let active = document.activeElement
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
    if (!active || active === document.body) return null
    const hosts = []
    for (let node = active; node;) {
      if (node.localName?.startsWith('c2-')) hosts.push(node.localName)
      node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode
    }
    // The box a person looks at: the control plus the component drawn around it (a text field's border sits on a
    // wrapper well outside the inner <input>), so the innermost c2 host's box is joined to the control's own.
    let rect = active.getBoundingClientRect()
    for (let node = active; node; node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode) {
      if (node.localName?.startsWith('c2-')) {
        const outer = node.getBoundingClientRect()
        const left = Math.min(rect.left, outer.left)
        const top = Math.min(rect.top, outer.top)
        rect = new DOMRect(left, top, Math.max(rect.right, outer.right) - left, Math.max(rect.bottom, outer.bottom) - top)
        break
      }
    }
    const name = (active.getAttribute('aria-label') ?? active.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60)
    return {
      tag: active.localName,
      role: active.getAttribute('role'),
      name,
      hosts,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }
  })
}

/**
 * Focus indicator check, the way a person checks it: look at the focused control, move focus away and back, and see
 * whether anything changed. The clip is compared byte for byte (same size, same encoder), with the caret hidden and
 * animations finished, so a difference means something drew focus. Each control is checked once per run.
 */
export function createFocusChecker(page, report) {
  const seen = new Set()
  const stats = { compared: 0, skipped: 0 }
  const onTabStop = async function () {
    const focused = await describeFocus(page)
    if (!focused || focused.rect.width === 0 || focused.rect.height === 0) return
    const key = `${focused.hosts.join('>')}|${focused.tag}|${focused.role}|${focused.name}`
    if (seen.has(key)) return

    const viewport = page.viewportSize()
    const pad = 6
    const clip = {
      x: Math.max(0, focused.rect.x - pad),
      y: Math.max(0, focused.rect.y - pad),
      width: Math.min(focused.rect.width + pad * 2, viewport.width),
      height: Math.min(focused.rect.height + pad * 2, viewport.height),
    }
    // Outside the viewport the clip cannot be compared; leave the control unchecked so a later tab stop can check it.
    if (clip.y + clip.height > viewport.height || clip.x + clip.width > viewport.width) {
      stats.skipped++
      return
    }
    seen.add(key)
    const shoot = () => page.screenshot({ clip, animations: 'disabled', caret: 'hide' })

    const withFocus = await shoot()
    await page.keyboard.press('Shift+Tab')
    const without = await shoot()
    await page.keyboard.press('Tab')
    const back = await describeFocus(page)
    // Focus did not come back to the same control (a trap, a roving group, a popup that closed): no fair comparison.
    if (!back || back.tag !== focused.tag || back.name !== focused.name || back.rect.y !== focused.rect.y) {
      stats.skipped++
      return
    }
    stats.compared++
    if (!withFocus.equals(without)) return

    report({
      kind: 'focus-invisible',
      severity: 'error',
      component: focused.hosts[0] ?? null,
      rule: `${focused.tag}${focused.role ? `[role=${focused.role}]` : ''}`,
      message: `Keyboard focus on ${focused.tag} "${focused.name}" (in ${focused.hosts.join(' > ') || 'page'}) draws no visible indicator.`,
      details: focused,
      screenshot: withFocus,
      screenshotUnfocused: without,
    })
  }
  onTabStop.stats = stats
  return onTabStop
}
