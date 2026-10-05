/**
 * Detects which `@c2n/*` packages the current project has installed (resolved from `C2N_PROJECT_ROOT` or the cwd,
 * which is the project directory when an MCP client spawns the server) and reads their manifests so the API served
 * for an installed component matches the installed version.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ElementEntry, Registry } from './registry-types.ts'

/** The published component package: bundles every component package and exposes each one as `@c2n/components/<name>`. */
export const UMBRELLA = '@c2n/components'

export interface InstalledInfo {
  version: string
  /** Set when the project reaches the package through `@c2n/components`: import it from the umbrella's entry. */
  via?: { package: typeof UMBRELLA; version: string }
  /** Elements from the installed `custom-elements.json`, keyed by tag, when the package ships one. */
  elements?: Map<string, Pick<ElementEntry, 'attributes' | 'slots' | 'events' | 'cssParts' | 'cssProperties'>>
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
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { version: string; customElements?: string }
    info = { version: pkg.version }
    if (umbrella) info.via = { package: UMBRELLA, version: umbrella.version }
    if (pkg.customElements) {
      try {
        const manifest = JSON.parse(readFileSync(join(pkgJsonPath, '..', pkg.customElements), 'utf8')) as {
          modules?: {
            declarations?: {
              tagName?: string
              attributes?: unknown[]
              slots?: unknown[]
              events?: unknown[]
              cssParts?: unknown[]
              cssProperties?: { name?: string }[]
            }[]
          }[]
        }
        const elements = new Map<string, Pick<ElementEntry, 'attributes' | 'slots' | 'events' | 'cssParts' | 'cssProperties'>>()
        for (const mod of manifest.modules ?? []) {
          for (const decl of mod.declarations ?? []) {
            if (!decl.tagName) continue
            elements.set(decl.tagName, {
              attributes: (decl.attributes ?? []) as ElementEntry['attributes'],
              slots: (decl.slots ?? []) as ElementEntry['slots'],
              events: (decl.events ?? []) as ElementEntry['events'],
              cssParts: (decl.cssParts ?? []) as ElementEntry['cssParts'],
              cssProperties: (decl.cssProperties ?? []).filter((p) => p.name) as ElementEntry['cssProperties'],
            })
          }
        }
        info.elements = elements
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
  const components = Object.fromEntries(
    Object.entries(registry.components).map(([id, component]) => {
      const installed = installedPackage(component.package)?.elements
      if (!installed) return [id, component]
      return [id, { ...component, elements: component.elements.map((element) => ({ ...element, ...installed.get(element.tag) })) }]
    }),
  )
  return { ...registry, components }
}
