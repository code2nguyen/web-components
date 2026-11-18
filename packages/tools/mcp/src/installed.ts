/**
 * Detects which `@c2n/*` packages the current project has installed (resolved from `C2N_PROJECT_ROOT` or the cwd,
 * which is the project directory when an MCP client spawns the server) and reads their manifests so the API served
 * for an installed component matches the installed version.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ComponentEntry, ElementEntry, Registry, ScriptMember } from './registry-types.ts'

/** The published component package: bundles every component package and exposes each one as `@c2n/components/<name>`. */
export const UMBRELLA = '@c2n/components'

export type InstalledElement = Pick<ElementEntry, 'className' | 'attributes' | 'slots' | 'events' | 'cssParts' | 'cssProperties' | 'properties' | 'scriptApi'>

export interface InstalledInfo {
  version: string
  /** Set when the project reaches the package through `@c2n/components`: import it from the umbrella's entry. */
  via?: { package: typeof UMBRELLA; version: string }
  /**
   * Elements from the installed `custom-elements.json`, keyed by tag, when the package ships one. Shared by every
   * package read from the same manifest (all of them, through the umbrella), so read-only.
   */
  elements?: ReadonlyMap<string, InstalledElement>
  /**
   * The tags of `elements` the package itself declares: all of them in its own manifest, and in the umbrella's merged
   * one only those whose module path starts with the package's directory (`table/…`).
   */
  owned?: ReadonlySet<string>
  /** Per tag of `elements`, the manifest module declaring it (`meter/src/meter.js` in the umbrella's merged manifest) and its description. */
  declared?: ReadonlyMap<string, { path: string; description: string }>
  /** The package's export entries (`./meter`), as its `package.json` lists them. */
  entries?: Set<string>
}

const TTL = 10_000
/**
 * What was read from the project, for `TTL` ms. Every package reached through `@c2n/components` reads the same
 * `package.json` files and the same merged manifest (several MB), so those are read and parsed once, not per package.
 */
let cache:
  | {
      at: number
      root: string
      packages: Map<string, InstalledInfo | null>
      /** Indexed manifests, keyed by real path. */
      manifests: Map<string, ManifestIndex | null>
      /** Parsed JSON files (`package.json`), or the error reading one threw. */
      json: Map<string, { value: unknown } | { error: unknown }>
    }
  | undefined

/** A parsed `custom-elements.json`, indexed once and shared by every package read from it. */
interface ManifestIndex {
  elements: ReadonlyMap<string, InstalledElement>
  declared: ReadonlyMap<string, { path: string; description: string }>
  /** Every tag the manifest declares. */
  tags: ReadonlySet<string>
  /** The tags declared by the modules under each top-level directory (`table` for `table/src/table.js`). */
  ownedByDirectory: ReadonlyMap<string, ReadonlySet<string>>
}

const NONE: ReadonlySet<string> = new Set()

interface ManifestJson {
  modules?: {
    path?: string
    declarations?: {
      tagName?: string
      name?: string
      description?: string
      members?: ManifestMember[]
      attributes?: { name?: string; fieldName?: string; type?: unknown }[]
      slots?: unknown[]
      events?: { name?: string; type?: unknown }[]
      cssParts?: unknown[]
      cssProperties?: { name?: string }[]
    }[]
  }[]
}

export function projectRoot(): string {
  return process.env.C2N_PROJECT_ROOT ?? process.cwd()
}

/** The cache for the current project root, emptied when the root changed or it is older than `TTL`. */
function freshCache(): NonNullable<typeof cache> {
  const root = projectRoot()
  if (!cache || cache.root !== root || Date.now() - cache.at > TTL) cache = { at: Date.now(), root, packages: new Map(), manifests: new Map(), json: new Map() }
  return cache
}

/** `path` parsed as JSON, read once per cache lifetime; throws what reading or parsing it threw. */
function readJson<T>(path: string): T {
  const json = freshCache().json
  let entry = json.get(path)
  if (!entry) {
    try {
      entry = { value: JSON.parse(readFileSync(path, 'utf8')) }
    } catch (error) {
      entry = { error }
    }
    json.set(path, entry)
  }
  if ('error' in entry) throw entry.error
  return entry.value as T
}

export function installedPackage(name: string): InstalledInfo | null {
  const cache = freshCache()
  const root = cache.root
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
    const pkg = readJson<{ version: string; customElements?: string; exports?: Record<string, unknown> }>(pkgJsonPath)
    info = { version: pkg.version, entries: new Set(Object.keys(pkg.exports ?? {})) }
    if (umbrella) info.via = { package: UMBRELLA, version: umbrella.version }
    if (pkg.customElements) {
      // Unreadable manifest: keep the bundled API. Through the umbrella, a package owns only its directory's tags.
      const manifest = manifestIndex(join(pkgJsonPath, '..', pkg.customElements))
      if (manifest) {
        info.elements = manifest.elements
        info.owned = umbrella ? (manifest.ownedByDirectory.get(name.slice('@c2n/'.length)) ?? NONE) : manifest.tags
        info.declared = manifest.declared
      }
    }
  } catch {
    info = null
  }
  cache.packages.set(name, info)
  return info
}

/**
 * The manifest at `path`, read and indexed once per cache lifetime. Through `@c2n/components` every package resolves
 * to the umbrella's merged manifest (several MB), and parsing it once per package made a cold `installedOnly` listing
 * take tens of seconds. `null` when it cannot be read or parsed.
 */
function manifestIndex(path: string): ManifestIndex | null {
  const manifests = freshCache().manifests
  // The umbrella's package.json is reached through its real path, the umbrella itself through node_modules: one key.
  let key = path
  try {
    key = realpathSync(path)
  } catch {
    /* missing: the read below fails the same way */
  }
  if (manifests.has(key)) return manifests.get(key) ?? null
  let index: ManifestIndex | null
  try {
    const manifest = JSON.parse(readFileSync(key, 'utf8')) as ManifestJson
    const elements = new Map<string, InstalledElement>()
    const declared = new Map<string, { path: string; description: string }>()
    const tags = new Set<string>()
    const ownedByDirectory = new Map<string, Set<string>>()
    for (const mod of manifest.modules ?? []) {
      const modulePath = mod.path ?? ''
      // A package owns the tags of the modules under its directory (`table/…`); a path with no `/` is under none.
      const slash = modulePath.indexOf('/')
      const directory = slash === -1 ? undefined : modulePath.slice(0, slash)
      for (const decl of mod.declarations ?? []) {
        if (!decl.tagName) continue
        tags.add(decl.tagName)
        if (directory !== undefined) {
          let owned = ownedByDirectory.get(directory)
          if (!owned) ownedByDirectory.set(directory, (owned = new Set()))
          owned.add(decl.tagName)
        }
        declared.set(decl.tagName, { path: modulePath, description: decl.description ?? '' })
        elements.set(decl.tagName, {
          className: decl.name ?? '',
          properties: publicProperties(decl.members),
          scriptApi: scriptApi(decl.members, decl.attributes),
          attributes: (decl.attributes ?? []).map((a) => (a.type === undefined ? a : { ...a, type: typeText(a.type) ?? '' })) as ElementEntry['attributes'],
          slots: (decl.slots ?? []) as ElementEntry['slots'],
          events: (decl.events ?? []).map((e) => (e.type === undefined ? e : { ...e, type: typeText(e.type) })) as ElementEntry['events'],
          cssParts: (decl.cssParts ?? []) as ElementEntry['cssParts'],
          cssProperties: (decl.cssProperties ?? []).filter((p) => p.name) as ElementEntry['cssProperties'],
        })
      }
    }
    index = { elements, declared, tags, ownedByDirectory }
  } catch {
    index = null
  }
  manifests.set(key, index)
  return index
}

/**
 * A manifest type as the registry stores it: the analyzer writes `{ text: "'a' | 'b'" }`, the registry the text, so
 * an installed manifest's attributes and events read like the bundled ones (and never print as `[object Object]`).
 */
export function typeText(type: unknown): string | undefined {
  if (typeof type === 'string') return type
  if (type && typeof type === 'object' && typeof (type as { text?: unknown }).text === 'string') return (type as { text: string }).text
  return undefined
}

/** Public instance fields of a manifest declaration: what a property binding may set. */
export function publicProperties(members: { kind?: string; name?: string; static?: boolean; privacy?: string }[] = []): string[] {
  const names = members
    .filter((m) => m.kind === 'field' && m.name && !m.static && (!m.privacy || m.privacy === 'public') && !/^[_#]/.test(m.name))
    .map((m) => m.name as string)
  return [...new Set(names)]
}

/** A manifest member as the analyzer writes it (field or method). */
export interface ManifestMember {
  kind?: string
  name?: string
  static?: boolean
  privacy?: string
  readonly?: boolean
  attribute?: string
  description?: string
  type?: unknown
  parameters?: { name?: string; type?: unknown; optional?: boolean; rest?: boolean }[]
  return?: { type?: unknown }
  inheritedFrom?: { name?: string; package?: string; module?: string }
}

/**
 * The platform's own API of a form-associated element (ElementInternals passthroughs) and Lit's lifecycle: documented
 * elsewhere, and noise in a component's API.
 */
const NOT_COMPONENT_API = new Set(
  'focus blur click form labels validity validationMessage willValidate internals checkValidity reportValidity setCustomValidity connectedCallback disconnectedCallback attributeChangedCallback adoptedCallback firstUpdated updated willUpdate render update shouldUpdate createRenderRoot getUpdateComplete scheduleUpdate performUpdate requestUpdate formResetCallback formDisabledCallback formStateRestoreCallback formAssociatedCallback'.split(
    ' ',
  ),
)

/**
 * The script-only API of a declaration: public properties no attribute reflects (`renderCell`, `dataSource`) and
 * public methods (`selectAll()`), with type and description. An agent cannot learn these from the attribute table.
 */
export function scriptApi(members: ManifestMember[] = [], attributes: { name?: string; fieldName?: string }[] = []): ScriptMember[] {
  const attributeFields = new Set(attributes.flatMap((a) => [a.name, a.fieldName]).filter(Boolean))
  const seen = new Set<string>()
  const result: ScriptMember[] = []
  for (const m of members) {
    if (!m.name || m.static || (m.privacy && m.privacy !== 'public') || /^[_#]/.test(m.name) || NOT_COMPONENT_API.has(m.name)) continue
    if (m.inheritedFrom?.package && !m.inheritedFrom.package.startsWith('@c2n')) continue
    if (seen.has(m.name)) continue
    if (m.kind === 'field') {
      if (m.attribute || attributeFields.has(m.name)) continue
      result.push({
        kind: 'property',
        name: m.name,
        type: typeText(m.type),
        description: m.description?.trim() || undefined,
        readonly: m.readonly || undefined,
      })
    } else if (m.kind === 'method') {
      const params = (m.parameters ?? []).map(
        (p) =>
          `${p.rest ? '...' : ''}${p.name?.startsWith('{') ? 'options' : p.name}${p.optional ? '?' : ''}${typeText(p.type) ? `: ${typeText(p.type)}` : ''}`,
      )
      const returns = typeText(m.return?.type)
      result.push({
        kind: 'method',
        name: m.name,
        type: `(${params.join(', ')})${returns ? ` => ${returns}` : ''}`,
        description: m.description?.trim() || undefined,
      })
    } else continue
    seen.add(m.name)
  }
  return result
}

/** Every dependency the project's own `package.json` names. */
function declaredDependencies(root: string): Set<string> {
  try {
    const pkg = readJson<Record<string, Record<string, string> | undefined>>(join(root, 'package.json'))
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
    const pkg = readJson<{ version: string; exports?: Record<string, unknown> }>(path)
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
