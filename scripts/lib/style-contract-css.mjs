import { resolve } from 'node:path'
import * as sass from 'sass'
import postcss from 'postcss'

const VARIABLE_REFERENCE = /var\(\s*(--[a-z0-9_-]+)/g

export function compileSass({ file, source, sourceFile = 'inline.scss' }) {
  const options = { loadPaths: [resolve('node_modules')], quietDeps: true, logger: sass.Logger.silent }
  if (file) return sass.compile(file, options).css
  if (typeof source === 'string') return sass.compileString(source, { ...options, url: new URL(`file://${resolve(sourceFile)}`) }).css
  throw new Error('compileSass requires file or source')
}

function fallbackOrder(value) {
  return [...value.matchAll(VARIABLE_REFERENCE)].map((match) => match[1])
}

function containingSelector(declaration) {
  let parent = declaration.parent
  while (parent && parent.type !== 'rule') parent = parent.parent
  return parent?.selector ?? null
}

function stateOf(selector) {
  const pseudo = /:(hover|focus|focus-visible|active|disabled)\b/.exec(selector)?.[1]
  if (pseudo) return pseudo
  const attribute = /\[(selected|disabled|open|loading|success|warning|error|state)(?:[=\]])/.exec(selector)?.[1]
  return attribute ?? 'base'
}

export function collectCssConsumers(css, sourceFile) {
  const root = postcss.parse(css, { from: sourceFile })
  const paths = []
  const definitions = new Map()
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith('--')) return
    const selector = containingSelector(declaration)
    if (!selector) return
    const entries = definitions.get(declaration.prop) ?? []
    entries.push({ selector, value: declaration.value })
    definitions.set(declaration.prop, entries)
  })

  function resolveReference(name, selector, visiting = new Set()) {
    if (visiting.has(name)) throw new Error(`cyclic CSS variable alias ${[...visiting, name].join(' -> ')} in ${sourceFile}`)
    const publicNames = name.startsWith('--c2-') ? [name] : []
    const candidates = definitions.get(name) ?? []
    const exact = candidates.filter((entry) => entry.selector === selector)
    const inherited = exact.length ? exact : candidates.filter((entry) => entry.selector === ':host')
    if (!inherited.length) return publicNames
    const nextVisiting = new Set(visiting).add(name)
    for (const entry of inherited) {
      for (const reference of fallbackOrder(entry.value)) publicNames.push(...resolveReference(reference, entry.selector, nextVisiting))
    }
    return publicNames
  }

  root.walkDecls((declaration) => {
    if (declaration.prop.startsWith('--')) return
    const selector = containingSelector(declaration)
    if (!selector) return
    const references = [...new Set(fallbackOrder(declaration.value).flatMap((name) => resolveReference(name, selector)))]
    if (!references.length) return
    for (const name of references) {
      paths.push({
        name,
        mode: 'compiled-css',
        source: `${sourceFile}:${declaration.source?.start?.line ?? 0}`,
        selector,
        target: `${selector} ${declaration.prop}`,
        declaration: declaration.prop,
        value: declaration.value,
        fallbackOrder: references,
        state: stateOf(selector),
      })
    }
  })
  return paths
}

/** A slotted child's public variable is only a forwarding edge, not an observable effect by itself. */
export function collectSlottedForwardings(css, sourceFile) {
  const root = postcss.parse(css, { from: sourceFile })
  const forwardings = []
  root.walkDecls((declaration) => {
    if (!declaration.prop.startsWith('--c2-')) return
    const selector = containingSelector(declaration)
    const childTag = /::slotted\(\s*(c2-[a-z0-9-]+)/.exec(selector ?? '')?.[1]
    if (!childTag || (!declaration.prop.startsWith(`--${childTag}--`) && !declaration.prop.startsWith(`--${childTag}__`))) return
    for (const name of new Set(fallbackOrder(declaration.value).filter((reference) => reference.startsWith('--c2-')))) {
      forwardings.push({
        name,
        childTag,
        childProperty: declaration.prop,
        selector,
        source: `${sourceFile}:${declaration.source?.start?.line ?? 0}`,
      })
    }
  })
  return forwardings
}

/** A forwarding counts only when the child both publishes and renders the exact destination variable. */
export function validatedSlottedForwardings(forwardings, childContracts) {
  return forwardings.filter((forwarding) => {
    const contract = childContracts.get(forwarding.childTag)
    return contract?.documented.has(forwarding.childProperty) && contract.consumed.has(forwarding.childProperty)
  })
}

export function findUnconsumedProperties(names, paths) {
  const consumed = new Set(paths.map((path) => path.name))
  return names.filter((name) => !consumed.has(name))
}
