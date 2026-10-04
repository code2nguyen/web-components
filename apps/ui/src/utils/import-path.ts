// Only the `exports` map: this module also runs in the browser (the studio's code generator), which needs no more of
// the package manifest than which entries exist.
import { exports as umbrellaExports } from '@c2n/components/package.json'

/** `@c2n/components` is the one published component package; everything else under `@c2n/` is published as itself. */
const UMBRELLA = '@c2n/components'
const exported = new Set(Object.keys(umbrellaExports))

/** Icon sets stay separate packages, outside `@c2n/components`; each icon is a module of its own. */
const ICON_SETS: [prefix: string, module: (name: string) => string][] = [
  ['c2-feather-', (name) => `@c2n/feather-icons/icons/${name}.js`],
  ['c2-phosphor-', (name) => `@c2n/phosphor-icons/icons/${name}.js`],
  ['c2-symbol-', (name) => `@c2n/symbols/symbols/${name}.js`],
  ['c2-task-icon-', (name) => `@c2n/task-icons/icons/${name}.js`],
]

function iconModule(tag: string): string | undefined {
  const set = ICON_SETS.find(([prefix]) => tag.startsWith(prefix))
  return set?.[1](tag.slice(set[0].length))
}

/**
 * The module an application imports for a docs page of `pkg` (`@c2n/chart`) documenting `id` (`line-chart`): the
 * element's own entry when `@c2n/components` publishes one (`@c2n/components/chart/line-chart`), the package's entry
 * otherwise (`@c2n/components/button`). A package the umbrella does not bundle (an icon set) is its own module.
 */
export function importPathFor(pkg: string, id?: string): string {
  const name = pkg.slice('@c2n/'.length)
  if (id && exported.has(`./${name}/${id}`)) return `${UMBRELLA}/${name}/${id}`
  return exported.has(`./${name}`) ? `${UMBRELLA}/${name}` : pkg
}

/**
 * The module that registers `tag` and exports its class: an icon's own module, else the entry named after it
 * (`c2-button` → `@c2n/components/button`), else its own element entry (`c2-tab` → `@c2n/components/tabs/tab`).
 */
function moduleOfTag(tag: string): string | undefined {
  const icon = iconModule(tag)
  if (icon) return icon
  const name = tag.replace(/^c2-/, '')
  if (exported.has(`./${name}`)) return `${UMBRELLA}/${name}`
  const own = [...exported].find((subpath) => subpath.endsWith(`/${name}`) && subpath.split('/').length === 3)
  return own ? `${UMBRELLA}${own.slice(1)}` : undefined
}

/** The module that exports the class of `tag`, falling back to the `@c2n/components` barrel, which exports every component class. */
export function classModuleFor(tag: string): string {
  return moduleOfTag(tag) ?? UMBRELLA
}

/**
 * Every import `markup` needs, the page's own first: one per `c2-*` element it uses, leaving out an element whose
 * module sits under an entry already imported (`c2-tab` with `@c2n/components/tabs`, which registers it).
 */
export function importsFor(markup: string, pkg: string, id?: string): string[] {
  const tags = new Set([...markup.matchAll(/<(c2-[a-z0-9-]+)/g)].map((match) => match[1]))
  const modules = [...tags].map(moduleOfTag).filter((module): module is string => module !== undefined)
  // Package entries before element entries, so the second test below sees an entry before its children.
  modules.sort((a, b) => a.split('/').length - b.split('/').length)
  const imports = [importPathFor(pkg, id)]
  for (const module of modules) {
    if (imports.some((imported) => module === imported || module.startsWith(`${imported}/`))) continue
    imports.push(module)
  }
  return imports
}
