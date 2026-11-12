/**
 * Detects which `@c2n/*` packages the current project has installed (resolved from `C2N_PROJECT_ROOT` or the cwd,
 * which is the project directory when an MCP client spawns the server) and reads their manifests so the API served
 * for an installed component matches the installed version.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ComponentEntry, ElementEntry, Registry } from './registry-types.ts'

/** The published component package: bundles every component package and exposes each one as `@c2n/components/<name>`. */
export const UMBRELLA = '@c2n/components'

export type InstalledElement = Pick<ElementEntry, 'className' | 'attributes' | 'slots' | 'events' | 'cssParts' | 'cssProperties' | 'properties'>

export interface InstalledInfo {
  version: string
  /** Set when the project reaches the package through `@c2n/components`: import it from the umbrella's entry. */
  via?: { package: typeof UMBRELLA; version: string }
  /** Elements from the installed `custom-elements.json`, keyed by tag, when the package ships one. */
  elements?: Map<string, InstalledElement>
  /**
   * The tags of `elements` the package itself declares: all of them in its own manifest, and in the umbrella's merged
   * one only those whose module path starts with the package's directory (`table/…`).
   */
  owned?: Set<string>
  /** Per tag of `elements`, the manifest module declaring it (`meter/src/meter.js` in the umbrella's merged manifest) and its description. */
  declared?: Map<string, { path: string; description: string }>
  /** The package's export entries (`./meter`), as its `package.json` lists them. */
  entries?: Set<string>
}

const TTL = 10_000
let cache: { at: number; root: string; packages: Map<string, InstalledInfo | null> } | undefined

export function projectRoot(): string {
  return process.env.C2N_PROJECT_ROOT ?? process.cwd()
}

export function installedPackage(name: string): InstalledInfo | null {
  const root = projectRoot()
  if (!cache || cache.root !== root || Date.now() - cache.at > TTL) cache = { at: Date.now(), root, packages: new Map() }
  if (cache.packages.has(name)) return cache.packages.get(name) ?? null
  let info: InstalledInfo | null
  try {
    // Only a project that declares the umbrella and not the package itself imports through the umbrella: this repo's
    // workspaces resolve `@c2n/components` too, and their packages depend on `@c2n/<name>` directly.
    const declared = declaredDependencies(root)
    const umbrella = name !== UMBRELLA && declared.has(UMBRELLA) && !declared.has(name) ? umbrellaOf(root, name) : undefined
    // The umbrella bundles the package, so its own package.json and merged manifest stand in for the package's.
    const pkgJsonPath = umbrella ? umbrella.path : findPackageJson(root, name)
    if (!pkgJsonPath) throw new Error(`${name} is not installed`)
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { version: string; customElements?: string; exports?: Record<string, unknown> }
    info = { version: pkg.version, entries: new Set(Object.keys(pkg.exports ?? {})) }
    if (umbrella) info.via = { package: UMBRELLA, version: umbrella.version }
    if (pkg.customElements) {
      try {
        const manifest = JSON.parse(readFileSync(join(pkgJsonPath, '..', pkg.customElements), 'utf8')) as {
          modules?: {
            path?: string
            declarations?: {
              tagName?: string
              name?: string
              description?: string
              members?: { kind?: string; name?: string; static?: boolean; privacy?: string }[]
              attributes?: unknown[]
              slots?: unknown[]
              events?: unknown[]
              cssParts?: unknown[]
              cssProperties?: { name?: string }[]
            }[]
          }[]
        }
        const elements = new Map<string, InstalledElement>()
        const owned = new Set<string>()
        const declared = new Map<string, { path: string; description: string }>()
        const directory = umbrella ? `${name.slice('@c2n/'.length)}/` : ''
        for (const mod of manifest.modules ?? []) {
          for (const decl of mod.declarations ?? []) {
            if (!decl.tagName) continue
            if ((mod.path ?? '').startsWith(directory)) owned.add(decl.tagName)
            declared.set(decl.tagName, { path: mod.path ?? '', description: decl.description ?? '' })
            elements.set(decl.tagName, {
              className: decl.name ?? '',
              properties: publicProperties(decl.members),
              attributes: (decl.attributes ?? []) as ElementEntry['attributes'],
              slots: (decl.slots ?? []) as ElementEntry['slots'],
              events: (decl.events ?? []) as ElementEntry['events'],
              cssParts: (decl.cssParts ?? []) as ElementEntry['cssParts'],
              cssProperties: (decl.cssProperties ?? []).filter((p) => p.name) as ElementEntry['cssProperties'],
            })
          }
        }
        info.elements = elements
        info.owned = owned
        info.declared = declared
      } catch {
        /* manifest unreadable: keep the bundled API */
      }
    }
  } catch {
    info = null
  }
  cache.packages.set(name, info)
  return info
}

/** Public instance fields of a manifest declaration: what a property binding may set. */
export function publicProperties(members: { kind?: string; name?: string; static?: boolean; privacy?: string }[] = []): string[] {
  const names = members
    .filter((m) => m.kind === 'field' && m.name && !m.static && (!m.privacy || m.privacy === 'public') && !/^[_#]/.test(m.name))
    .map((m) => m.name as string)
  return [...new Set(names)]
}

/** Every dependency the project's own `package.json` names. */
function declaredDependencies(root: string): Set<string> {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
    return new Set(['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((key) => Object.keys(pkg[key] ?? {})))
  } catch {
    return new Set()
  }
}

/**
 * `node_modules/<name>/package.json` as Node's lookup finds it from `from`. Not `require.resolve`: the component
 * packages do not export `./package.json`, so resolving it throws for every one of them.
 */
function findPackageJson(from: string, name: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name, 'package.json')
    if (existsSync(candidate)) return candidate
    if (dirname(dir) === dir) return undefined
  }
}

/** The installed `@c2n/components`, when it bundles `name`: it has an entry `./<name>` in its exports. */
function umbrellaOf(root: string, name: string): { path: string; version: string } | undefined {
  const path = findPackageJson(root, UMBRELLA)
  if (!path) return undefined
  try {
    const pkg = JSON.parse(readFileSync(path, 'utf8')) as { version: string; exports?: Record<string, unknown> }
    return pkg.exports?.[`./${name.slice('@c2n/'.length)}`] !== undefined ? { path: realpathSync(path), version: pkg.version } : undefined
  } catch {
    return undefined
  }
}

/**
 * The module an agent should import `modulePath` (a module of `pkg`) from. The registry already names
 * `@c2n/components` paths; a workspace package's own path (`@c2n/table/table-column.js`) maps to the umbrella's entry
 * for the package (`@c2n/components/table`), which re-exports every module of it.
 */
export function importPath(modulePath: string, pkg: string, installed: InstalledInfo | null): string {
  return installed?.via && (modulePath === pkg || modulePath.startsWith(`${pkg}/`)) ? `${UMBRELLA}/${pkg.slice('@c2n/'.length)}` : modulePath
}

/** The project's `@c2n/components`, when its `package.json` declares it. */
export function umbrellaInstalled(): InstalledInfo | null {
  return declaredDependencies(projectRoot()).has(UMBRELLA) ? installedPackage(UMBRELLA) : null
}

/**
 * The registry with each installed package's attributes, slots, events, parts and CSS variables read from its own
 * manifest, so a check runs against the version the project has rather than the one this server bundles.
 */
export function withInstalledApi(registry: Registry): Registry {
  const tagIndex = { ...registry.tagIndex }
  const components = Object.fromEntries(
    Object.entries(registry.components).map(([id, component]) => {
      const info = installedPackage(component.package)
      const installed = info?.elements
      if (!installed || component.tagPattern) return [id, component]
      // The umbrella's merged manifest covers every package, so only this package's own tags count.
      const own = new Set(component.elements.map((e) => e.tag))
      const elements = component.elements.filter((element) => installed.has(element.tag)).map((element) => ({ ...element, ...installed.get(element.tag) }))
      for (const element of component.elements) if (!installed.has(element.tag) && tagIndex[element.tag] === id) delete tagIndex[element.tag]
      // An element the installed version added: one the package's manifest declares and the registry does not know.
      // Ownership comes from the manifest, not the tag, since a package may hold several families (`c2-line-chart`,
      // `c2-chart-series`); of the pages documenting one package, the new tag goes to the one it extends.
      for (const [tag, api] of installed) {
        if (own.has(tag) || tagIndex[tag] || !info.owned?.has(tag) || pageForNewTag(registry, component.package, tag) !== id) continue
        // The package entry registers every element of the package; one element's own module may not.
        elements.push({ ...api, tag, modulePath: component.install.umbrella ?? component.elements[0]?.modulePath ?? component.package, description: '' })
        tagIndex[tag] = id
      }
      return [id, { ...component, elements: elements.length ? elements : component.elements }]
    }),
  )
  const packageIndex = { ...registry.packageIndex }
  for (const component of newComponents(registry, tagIndex)) {
    components[component.id] = component
    packageIndex[component.package] = component.id
    for (const element of component.elements) tagIndex[element.tag] = component.id
  }
  return { ...registry, components, tagIndex, packageIndex }
}

/**
 * The registry plus the components only the project's installed `@c2n/components` knows (see `newComponents`), which
 * is what the server's tools list, search and describe. The API of the components the registry does know is left
 * alone: each tool reads the installed one where it needs it.
 */
export function withInstalledComponents(registry: Registry): Registry {
  const added = newComponents(registry, registry.tagIndex)
  if (added.length === 0) return registry
  const components = { ...registry.components }
  const tagIndex = { ...registry.tagIndex }
  const packageIndex = { ...registry.packageIndex }
  for (const component of added) {
    components[component.id] = component
    packageIndex[component.package] = component.id
    for (const element of component.elements) tagIndex[element.tag] = component.id
  }
  return { ...registry, components, tagIndex, packageIndex }
}

/**
 * The components the project's `@c2n/components` bundles and this server's registry has never heard of: a server
 * older than the installed version (pinned in an MCP config, or cached by `npx`) would otherwise answer "Unknown
 * component" for an element the project can use, and the check would flag it. Each is a directory of the umbrella's
 * merged manifest with its own export entry (`meter/…` and `./meter`); it is served from the manifest alone, so with
 * its whole API and without examples, presets or a docs page.
 */
function newComponents(registry: Registry, tagIndex: Record<string, string>): ComponentEntry[] {
  const umbrella = umbrellaInstalled()
  if (!umbrella?.elements || !umbrella.declared) return []
  const byDirectory = new Map<string, string[]>()
  for (const [tag, { path }] of umbrella.declared) {
    const directory = path.split('/')[0]
    if (!directory || !path.includes('/') || tagIndex[tag] || !umbrella.entries?.has(`./${directory}`)) continue
    // A package the registry knows had its new tags placed above; an id already taken is some other page.
    if (registry.packageIndex[`@c2n/${directory}`] || registry.components[directory]) continue
    byDirectory.set(directory, [...(byDirectory.get(directory) ?? []), tag])
  }
  return [...byDirectory].map(([directory, tags]) => {
    const entry = `${UMBRELLA}/${directory}`
    // The element named after the package leads: it is the one the page would be about.
    tags.sort((a, b) => Number(b === `c2-${directory}`) - Number(a === `c2-${directory}`))
    const elements = tags.map((tag) => ({
      ...(umbrella.elements?.get(tag) as InstalledElement),
      tag,
      modulePath: entry,
      description: umbrella.declared?.get(tag)?.description ?? '',
    }))
    const note = `Bundled by the installed ${UMBRELLA} ${umbrella.version} and unknown to this server (${registry.c2nVersion}): the API below is read from the installed package, and there are no examples or presets for it. A @c2n/mcp of the installed version has them.`
    return {
      id: directory,
      package: `@c2n/${directory}`,
      title: directory.replace(/(^|-)([a-z])/g, (_, dash: string, letter: string) => `${dash ? ' ' : ''}${letter.toUpperCase()}`),
      description: [note, elements[0].description].filter(Boolean).join('\n\n'),
      category: 'Other',
      status: 'undocumented' as const,
      docsUrl: '',
      elements,
      composition: { internal: [], slotted: [], usedBy: [] },
      install: {
        npm: `npm install ${UMBRELLA}`,
        import: `import '${entry}'`,
        importClass: `import { ${elements[0].className} } from '${entry}'`,
        umbrella: entry,
      },
      examples: [],
      hasGallery: false,
    }
  })
}

/**
 * The page of `pkg` a tag its installed version added belongs to: the page with an element whose tag is the longest
 * prefix of it (`c2-bar-chart-foo` extends `c2-bar-chart`), else the page representing the package.
 */
function pageForNewTag(registry: Registry, pkg: string, tag: string): string | undefined {
  const pages = Object.values(registry.components).filter((c) => c.package === pkg && !c.tagPattern)
  let best: { id: string; length: number } | undefined
  for (const page of pages) {
    for (const element of page.elements) {
      if (tag.startsWith(`${element.tag}-`) && element.tag.length > (best?.length ?? 0)) best = { id: page.id, length: element.tag.length }
    }
  }
  const representative = registry.packageIndex[pkg]
  return best?.id ?? (pages.some((p) => p.id === representative) ? representative : pages[0]?.id)
}
