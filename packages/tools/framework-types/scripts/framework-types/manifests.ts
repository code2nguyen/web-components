/**
 * Reads every `@c2n/*` package that ships a `custom-elements.json` and flattens it into one record per custom
 * element: the tag, the class, the module a consumer imports the class from, its attributes and its events.
 *
 * The same data drives all four outputs, so the JSX types, the Vue declarations and the two editor manifests
 * can never disagree with each other or with the components.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ElementAttribute {
  /** Attribute name as written in markup, e.g. `row-key`. */
  name: string
  /** Property name on the class, e.g. `rowKey`. Equal to `name` when the two match. */
  fieldName: string
  type?: string
  description?: string
  default?: string
}

export interface ElementEvent {
  name: string
  /** Manifest type text, e.g. `CustomEvent<TableSelectionChangeEventDetail>`. */
  type: string
  description?: string
}

export interface CustomElement {
  tagName: string
  /** Exported class name, e.g. `Table`. */
  className: string
  /** npm package, e.g. `@c2n/table`. */
  pkg: string
  /** Module a consumer imports the class from, e.g. `@c2n/table` or `@c2n/table/table-column.js`. */
  module: string
  description?: string
  attributes: ElementAttribute[]
  events: ElementEvent[]
}

interface ManifestDeclaration {
  kind?: string
  name?: string
  tagName?: string
  description?: string
  attributes?: { name?: string; fieldName?: string; type?: { text?: string }; description?: string; default?: string }[]
  events?: { name?: string; type?: { text?: string }; description?: string }[]
}

interface Manifest {
  modules?: { path?: string; declarations?: ManifestDeclaration[] }[]
}

interface PackageJson {
  name?: string
  exports?: Record<string, { types?: string } | string>
  private?: boolean
}

/** Packages that are work in progress and deliberately outside the build graph. */
const EXCLUDED = new Set(['@c2n/design-board', '@c2n/json-form'])

/** Nearest `node_modules/@c2n` above this package: the workspace symlinks, one per `@c2n` package. */
function scopeDir(): string {
  let dir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
  for (;;) {
    const candidate = join(dir, 'node_modules', '@c2n')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) throw new Error('[framework-types] no node_modules/@c2n directory found; run npm install')
    dir = parent
  }
}

/**
 * The export subpath whose declarations are the module's own, e.g. `src/table-column.ts` → `./table-column.js`.
 * Falls back to the package root, which is right for a single-element package.
 */
function moduleSpecifier(pkg: PackageJson, packageName: string, modulePath: string): string {
  const declarations = `./types/${modulePath.replace(/\.ts$/, '.d.ts')}`
  for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
    const types = typeof entry === 'string' ? undefined : entry.types
    if (types === declarations) return subpath === '.' ? packageName : `${packageName}/${subpath.slice(2)}`
  }
  return packageName
}

export interface DiscoveredPackage {
  name: string
  /** Absolute path of the package in the workspace (symlinks resolved). */
  dir: string
  elements: CustomElement[]
}

export function readPackages(): DiscoveredPackage[] {
  const scope = scopeDir()
  const packages: DiscoveredPackage[] = []

  for (const entry of readdirSync(scope)) {
    const name = `@c2n/${entry}`
    if (EXCLUDED.has(name)) continue

    const dir = realpathSync(join(scope, entry))
    const manifestPath = join(dir, 'custom-elements.json')
    const packagePath = join(dir, 'package.json')
    if (!existsSync(manifestPath) || !existsSync(packagePath)) continue

    const pkg = JSON.parse(readFileSync(packagePath, 'utf8')) as PackageJson
    if (pkg.private) continue

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
    const elements: CustomElement[] = []

    for (const module of manifest.modules ?? []) {
      for (const declaration of module.declarations ?? []) {
        if (!declaration.tagName || !declaration.name || !module.path) continue
        elements.push({
          tagName: declaration.tagName,
          className: declaration.name,
          pkg: name,
          module: moduleSpecifier(pkg, name, module.path),
          description: declaration.description,
          attributes: (declaration.attributes ?? [])
            .filter((attribute) => attribute.name)
            .map((attribute) => ({
              name: attribute.name!,
              fieldName: attribute.fieldName ?? attribute.name!,
              type: attribute.type?.text,
              description: attribute.description,
              default: attribute.default,
            })),
          events: (declaration.events ?? [])
            .filter((event) => event.name)
            .map((event) => ({ name: event.name!, type: event.type?.text ?? 'Event', description: event.description })),
        })
      }
    }

    if (elements.length > 0) packages.push({ name, dir, elements: elements.sort((a, b) => a.tagName.localeCompare(b.tagName)) })
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name))
}

/** Path of `file` relative to the repository root, for log lines. */
export function repoRelative(file: string): string {
  return relative(resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..'), file)
}

/**
 * How `v-model` / `ngModel` binds to a component, or `undefined` when it is not a form control.
 *
 * Form association is not in the manifest, so it is inferred from the shape every one of these components has: a
 * `name` for form submission, a `value` or `checked` to carry, and a native `input`/`change` to announce it. That
 * is exactly the set of elements that call `attachInternals()`, and it keeps `c2-color-area` — whose `value` is a
 * colour channel — out.
 */
export function formControlModel(element: CustomElement): 'value' | 'checked' | undefined {
  const fields = new Set(element.attributes.map((attribute) => attribute.fieldName))
  const events = new Set(element.events.map((event) => event.name))
  if (!fields.has('name') || !(events.has('input') || events.has('change'))) return undefined
  // `checked` wins: a checkbox carries a `value` too, but a model bound to one is about the checked state.
  if (fields.has('checked')) return 'checked'
  return fields.has('value') ? 'value' : undefined
}
