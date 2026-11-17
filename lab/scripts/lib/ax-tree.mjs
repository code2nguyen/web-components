// What a screen reader gets: Chrome's own accessibility tree over CDP. Playwright's `ariaSnapshot()` computes roles in
// the page and misses what components declare through ElementInternals (`internals.role = 'listbox'`), which every c2
// component uses for its host semantics, so a check on it would report bugs that are not there. This tree is the one
// assistive technology reads, internals included.

const SKIP = new Set(['generic', 'none', 'InlineTextBox', 'LineBreak', 'StaticText'])
const STATES = ['disabled', 'expanded', 'selected', 'checked', 'pressed', 'invalid', 'required', 'focused', 'modal', 'level']

/** The accessibility tree as nodes `{ role, name, depth, states, value, description }`, ignored and generic nodes folded. */
export async function axTree(page) {
  const session = await page.context().newCDPSession(page)
  try {
    const { nodes } = await session.send('Accessibility.getFullAXTree')
    const byId = new Map(nodes.map((node) => [node.nodeId, node]))
    const flat = []
    const walk = (node, depth) => {
      const role = node.role?.value
      const name = String(node.name?.value ?? '').trim()
      // A StaticText is only worth showing where its parent has no name that already says it.
      const fold = node.ignored || SKIP.has(role)
      const text = role === 'StaticText' ? name : ''
      if (!fold) {
        const states = {}
        for (const property of node.properties ?? [])
          if (STATES.includes(property.name) && property.value?.value !== false) states[property.name] = property.value?.value
        flat.push({ role, name, depth, states, value: node.value?.value, description: node.description?.value, backendId: node.backendDOMNodeId })
      } else if (text) {
        flat.push({ role: 'text', name: text, depth, states: {} })
      }
      for (const child of node.childIds ?? []) {
        const next = byId.get(child)
        if (next) walk(next, fold ? depth : depth + 1)
      }
    }
    walk(nodes[0], 0)
    return flat
  } finally {
    await session.detach().catch(() => {})
  }
}

/** Render the tree the way a screen reader user would skim it, one node per line. */
export function formatAxTree(flat) {
  return flat
    .map((node) => {
      const states = Object.entries(node.states)
        .map(([key, value]) => (value === true ? key : `${key}=${value}`))
        .join(' ')
      const value = node.value !== undefined && node.value !== '' ? ` = ${JSON.stringify(node.value)}` : ''
      if (node.role === 'text') return `${'  '.repeat(node.depth)}"${node.name}"`
      return `${'  '.repeat(node.depth)}${node.role}${node.name ? ` "${node.name}"` : ''}${value}${states ? ` [${states}]` : ''}`
    })
    .join('\n')
}

/**
 * Checks a person with a screen reader would notice, read from that tree:
 * - a name read twice in a row ("Mireille DufortMireille Dufort"), the sign of text exposed from two places;
 * - an invisible, disabled control nobody can see or use, announced as if it were part of the interface;
 * - a component's own header exposed as a second banner landmark.
 * The DOM node behind each is resolved back to its `c2-*` host so the finding names a component.
 */
export async function checkAxTree(page, report) {
  const flat = await axTree(page)
  const session = await page.context().newCDPSession(page)
  const hostOf = async (backendId) => {
    if (!backendId) return null
    try {
      const { object } = await session.send('DOM.resolveNode', { backendNodeId: backendId })
      const { result } = await session.send('Runtime.callFunctionOn', {
        objectId: object.objectId,
        returnByValue: true,
        functionDeclaration: `function () {
          const element = this.nodeType === 1 ? this : this.parentElement
          let host = null
          for (let node = element; node; node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentNode) {
            if (node.localName && node.localName.startsWith('c2-') && node !== element) { host = node.localName; break }
          }
          const rect = element ? element.getBoundingClientRect() : { width: 0, height: 0 }
          const style = element ? getComputedStyle(element) : null
          const hidden = rect.width * rect.height <= 4 || !style || style.opacity === '0' || style.visibility === 'hidden'
          return { host, hidden }
        }`,
      })
      return result.value ?? null
    } catch {
      return null
    }
  }
  try {
    // A page has one banner. A component's own <header> exposed as a second one adds a stray landmark to the list a
    // screen reader user jumps through.
    const banners = flat.filter((node) => node.role === 'banner')
    if (banners.length > 1) {
      for (const node of banners) {
        const found = await hostOf(node.backendId)
        if (!found?.host) continue
        report({
          kind: 'a11y-tree',
          severity: 'warn',
          component: found.host,
          rule: 'extra-banner',
          message: `${found.host} exposes a banner landmark; the page already has one (${banners.length} in all).`,
        })
      }
    }
    for (const node of flat) {
      const half = node.name.length / 2
      if (node.name.length >= 6 && Number.isInteger(half) && node.name.slice(0, half) === node.name.slice(half)) {
        report({
          kind: 'a11y-tree',
          severity: 'warn',
          component: (await hostOf(node.backendId))?.host ?? null,
          rule: 'name-read-twice',
          message: `${node.role} is announced as "${node.name}": the same text twice.`,
        })
      }
      if (node.states.disabled && /^(button|textbox|combobox|checkbox|link)$/.test(node.role)) {
        const found = await hostOf(node.backendId)
        if (!found?.host || !found.hidden) continue
        report({
          kind: 'a11y-tree',
          severity: 'warn',
          component: found.host,
          rule: `hidden-disabled-${node.role}`,
          message: `An invisible, disabled ${node.role} "${node.name}" inside ${found.host} is announced to screen readers.`,
        })
      }
    }
  } finally {
    await session.detach().catch(() => {})
  }
}
