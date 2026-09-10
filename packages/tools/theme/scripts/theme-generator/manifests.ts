/**
 * Discovers every `@c2n/*` package that ships a `custom-elements.json` and flattens their CSS custom
 * properties into `CssVar` records parsed with the component variable grammar
 * `--<prefix>[__<part>[__<state>]]--<property>`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface CssVar {
  /** Full custom property name. */
  name: string
  /** npm package name, e.g. `@c2n/button`. */
  pkg: string
  /** Component prefix, e.g. `c2-button`. */
  prefix: string
  /** Part segments (`__` separated, states removed), e.g. `['container']`. */
  parts: string[]
  /** State segments, e.g. `['hover']`. */
  states: string[]
  /** Final CSS property name, e.g. `background-color`. */
  property: string
  /** Manifest `type.text`, e.g. `color`. Unreliable; classify by `property` first. */
  type?: string
  /** Default literal from the manifest; `undefined` when the component has no default. */
  default?: string
}

const STATES = new Set([
  'hover',
  'active',
  'focus',
  'selected',
  'disabled',
  'open',
  'error',
  'read-only',
  'unselected',
  'copied',
  'highlighted',
  'over',
  'online',
  'away',
  'busy',
  'offline',
  'expanded',
  'running',
  'checked',
  'invalid',
])

const EXCLUDED_PACKAGES = new Set(['@c2n/design-board', '@c2n/json-form'])

const NAME_PATTERN = /^--(c2-[a-z0-9-]+?)(?:__(.+?))?--(-?[a-z-]+)$/

interface ManifestCssProperty {
  name?: string
  type?: { text?: string }
  default?: string
}

interface Manifest {
  modules?: { declarations?: { cssProperties?: ManifestCssProperty[] }[] }[]
}

/** Directory holding the `@c2n/*` workspace symlinks: the nearest `node_modules/@c2n` above this package. */
function scopeDir(): string {
  let dir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  while (true) {
    const candidate = join(dir, 'node_modules', '@c2n')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error('[theme-generator] could not find a node_modules/@c2n directory; run npm install')
    dir = parent
  }
}

export interface DiscoveredPackage {
  name: string
  dir: string
  manifestPath: string
}

export function discoverPackages(): DiscoveredPackage[] {
  const scope = scopeDir()
  const result: DiscoveredPackage[] = []
  for (const entry of readdirSync(scope).sort()) {
    const dir = join(scope, entry)
    const pkgJsonPath = join(dir, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { name: string; customElements?: string }
    if (!pkg.customElements || EXCLUDED_PACKAGES.has(pkg.name)) continue
    const manifestPath = join(dir, pkg.customElements)
    if (!existsSync(manifestPath)) {
      console.warn(`[theme-generator] ${pkg.name}: ${pkg.customElements} missing, build the package first`)
      continue
    }
    result.push({ name: pkg.name, dir, manifestPath })
  }
  return result
}

export function parseVarName(name: string): Pick<CssVar, 'prefix' | 'parts' | 'states' | 'property'> | undefined {
  const match = NAME_PATTERN.exec(name)
  if (!match) return undefined
  const [, prefix, blocks = '', property] = match
  const parts: string[] = []
  const states: string[] = []
  for (const block of blocks.split('__').filter(Boolean)) {
    if (STATES.has(block)) states.push(block)
    else parts.push(block)
  }
  return { prefix, parts, states, property }
}

export function readCssVars(packages: DiscoveredPackage[]): { vars: CssVar[]; unparsed: string[] } {
  const vars: CssVar[] = []
  const unparsed: string[] = []
  const seen = new Map<string, CssVar>()
  for (const { name: pkg, manifestPath } of packages) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    for (const mod of manifest.modules ?? []) {
      for (const decl of mod.declarations ?? []) {
        for (const prop of decl.cssProperties ?? []) {
          if (!prop.name) continue
          const previous = seen.get(prop.name)
          if (previous) {
            if (previous.default !== prop.default) {
              console.warn(
                `[theme-generator] ${prop.name}: conflicting defaults "${previous.default}" (${previous.pkg}) vs "${prop.default}" (${pkg}); keeping the first`,
              )
            }
            continue
          }
          const parsed = parseVarName(prop.name)
          if (!parsed) {
            unparsed.push(prop.name)
            continue
          }
          const cssVar: CssVar = { name: prop.name, pkg, ...parsed, type: prop.type?.text, default: prop.default?.trim() }
          seen.set(prop.name, cssVar)
          vars.push(cssVar)
        }
      }
    }
  }
  return { vars, unparsed }
}
