import umbrella from '@c2n/components/package.json'

/** `@c2n/components` is the one published component package; everything else under `@c2n/` is published as itself. */
const UMBRELLA = '@c2n/components'
const exported = new Set(Object.keys(umbrella.exports))

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
 * The module that exports the class of `tag`: its own entry (`c2-tab` → `@c2n/components/tabs/tab`), else the entry
 * named after it (`c2-button` → `@c2n/components/button`), else the `@c2n/components` barrel, which exports every class.
 */
export function classModuleFor(tag: string): string {
  const name = tag.replace(/^c2-/, '')
  if (exported.has(`./${name}`)) return `${UMBRELLA}/${name}`
  const own = [...exported].find((subpath) => subpath.endsWith(`/${name}`) && subpath.split('/').length === 3)
  return own ? `${UMBRELLA}${own.slice(1)}` : UMBRELLA
}
